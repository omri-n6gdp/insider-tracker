"""SEC EDGAR Form 4 (insider transaction) client.

Uses only the Python standard library so it runs with nothing but FastAPI +
uvicorn installed. SEC asks for a descriptive User-Agent and <=10 req/sec; we
throttle to ~6/sec and identify ourselves.
"""
import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

# SEC requires a contact email in the User-Agent. It lives in .env (SEC_USER_AGENT),
# which is git-ignored, so the address never gets uploaded.
def _user_agent() -> str:
    return os.environ.get("SEC_USER_AGENT", "").strip() or "insider-tracker (personal research)"

FEED_URL = ("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent"
            "&type=4&owner=include&count={count}&start={start}&output=atom")
ARCHIVE = "https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/"

MIN_INTERVAL = 0.16  # seconds between requests (~6/sec, well under SEC's limit)
_last_req = [0.0]

# Form 4 transaction codes -> (human label, signal category)
CODE_MAP = {
    "P": ("Buy", "buy"),                 # open-market / private purchase
    "S": ("Sell", "sell"),               # open-market / private sale
    "A": ("Grant / Award", "grant"),     # grant, award or other acquisition
    "M": ("Option Exercise", "option"),  # exercise/conversion of derivative
    "X": ("Option Exercise", "option"),
    "C": ("Conversion", "option"),
    "F": ("Tax Withholding", "tax"),     # shares withheld to pay tax
    "D": ("Return to Issuer", "tax"),
    "G": ("Gift", "gift"),
    "W": ("Inherited / Will", "other"),
    "J": ("Other", "other"),
    "I": ("Discretionary", "other"),
}

ENTRY_RE = re.compile(r"<entry>(.*?)</entry>", re.S)
HREF_RE = re.compile(r'href="([^"]+-index\.html?)"')
DATA_RE = re.compile(r"/data/(\d+)/(\d+)/")
ACC_RE = re.compile(r"accession-number=([\d-]+)")
UPDATED_RE = re.compile(r"<updated>([^<]+)</updated>")
FILED_RE = re.compile(r"Filed:</b>\s*([\d-]+)")


def _get(url, timeout=25):
    dt = time.monotonic() - _last_req[0]
    if dt < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - dt)
    req = urllib.request.Request(url, headers={"User-Agent": _user_agent()})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    finally:
        _last_req[0] = time.monotonic()


def _f(text):
    if not text:
        return None
    try:
        return float(text.replace(",", "").strip())
    except ValueError:
        return None


def _txt(el, path):
    if el is None:
        return ""
    f = el.find(path)
    return f.text.strip() if f is not None and f.text else ""


# Filers write these placeholders when the issuer has no public trading symbol.
# Treating them as a real ticker would merge unrelated companies in ticker-keyed
# aggregates (e.g. clusters), so normalize them to an empty string.
_INVALID_TICKERS = {"", "NONE", "N/A", "NA", "N.A.", "-", "--"}


def _norm_ticker(raw):
    t = (raw or "").strip().upper()
    return "" if t in _INVALID_TICKERS else t


def fetch_feed(start=0, count=100):
    """Return list of {cik, acc, accession, filed_at, period_url} from the
    'latest filings' Form 4 feed (newest first)."""
    raw = _get(FEED_URL.format(count=count, start=start)).decode("utf-8", "replace")
    out = []
    for e in ENTRY_RE.findall(raw):
        href = HREF_RE.search(e)
        if not href:
            continue
        m = DATA_RE.search(href.group(1))
        acc = ACC_RE.search(e)
        if not m or not acc:
            continue
        upd = UPDATED_RE.search(e)
        filed = FILED_RE.search(e)
        out.append({
            "cik": m.group(1),
            "acc": m.group(2),
            "accession": acc.group(1),
            "filed_at": (upd.group(1) if upd else (filed.group(1) if filed else "")),
            "index_url": href.group(1),
        })
    return out


def _find_ownership_xml(cik, acc):
    base = ARCHIVE.format(cik=cik, acc=acc)
    idx = json.loads(_get(base + "index.json").decode("utf-8", "replace"))
    names = [it["name"] for it in idx.get("directory", {}).get("item", [])
             if it.get("name", "").lower().endswith(".xml")]
    # Prefer files that look like ownership forms; fall back to any xml.
    names.sort(key=lambda n: ("form4" not in n.lower(), n))
    for name in names:
        raw = _get(base + name)
        if b"<ownershipDocument" in raw:
            return raw, base + name
    return None, None


def parse_ownership(raw, filing_url, entry):
    """Parse a Form 4 ownership XML document into transaction row dicts."""
    root = ET.fromstring(raw)
    issuer = root.find("issuer")
    issuer_name = _txt(issuer, "issuerName")
    ticker = _norm_ticker(_txt(issuer, "issuerTradingSymbol"))
    issuer_cik = _txt(issuer, "issuerCik")
    period = _txt(root, "periodOfReport")

    owner = root.find("reportingOwner")
    owner_name = _txt(owner, "reportingOwnerId/rptOwnerName")
    owner_cik = _txt(owner, "reportingOwnerId/rptOwnerCik")
    rel = owner.find("reportingOwnerRelationship") if owner is not None else None
    roles = []
    officer_title = ""
    if rel is not None:
        if _txt(rel, "isDirector") in ("1", "true"):
            roles.append("Director")
        if _txt(rel, "isOfficer") in ("1", "true"):
            roles.append("Officer")
        if _txt(rel, "isTenPercentOwner") in ("1", "true"):
            roles.append("10% Owner")
        if _txt(rel, "isOther") in ("1", "true"):
            roles.append("Other")
        officer_title = _txt(rel, "officerTitle")
    roles_str = ", ".join(roles)

    rows = []
    idx = [0]

    def handle(tx, is_deriv):
        code = _txt(tx, "transactionCoding/transactionCode")
        if not code:
            return
        shares = _f(_txt(tx, "transactionAmounts/transactionShares/value"))
        price = _f(_txt(tx, "transactionAmounts/transactionPricePerShare/value"))
        ad = _txt(tx, "transactionAmounts/transactionAcquiredDisposedCode/value")
        after = _f(_txt(tx, "postTransactionAmounts/sharesOwnedFollowingTransaction/value"))
        title = _txt(tx, "securityTitle/value")
        action, kind = CODE_MAP.get(code, (code, "other"))
        value = (shares or 0) * (price or 0)
        rows.append({
            "uid": f"{entry['accession']}:{idx[0]}",
            "accession": entry["accession"],
            "filing_url": filing_url,
            "filed_at": entry.get("filed_at") or period,
            "period": _txt(tx, "transactionDate/value") or period,
            "issuer_name": issuer_name,
            "ticker": ticker,
            "issuer_cik": issuer_cik,
            "owner_name": owner_name,
            "owner_cik": owner_cik,
            "roles": roles_str,
            "officer_title": officer_title,
            "security_title": title,
            "code": code,
            "action": action,
            "kind": kind,
            "ad": ad,
            "shares": shares,
            "price": price,
            "value": value,
            "shares_after": after,
            "is_derivative": 1 if is_deriv else 0,
            "source": "live",
        })
        idx[0] += 1

    nd = root.find("nonDerivativeTable")
    if nd is not None:
        for tx in nd.findall("nonDerivativeTransaction"):
            handle(tx, False)
    dv = root.find("derivativeTable")
    if dv is not None:
        for tx in dv.findall("derivativeTransaction"):
            handle(tx, True)
    return rows


def fetch_filing_rows(entry):
    raw, url = _find_ownership_xml(entry["cik"], entry["acc"])
    if not raw:
        return []
    return parse_ownership(raw, url, entry)


def refresh(db, pages=1, count=100, max_filings=400, log=print):
    """Pull the latest Form 4 filings and store any new transactions.
    Returns a summary dict."""
    entries, seen = [], set()
    for p in range(pages):
        try:
            page = fetch_feed(start=p * count, count=count)
        except Exception as ex:  # network hiccup -> stop paging
            log(f"[sec] feed page {p} failed: {ex}")
            break
        if not page:
            break
        for e in page:
            if e["accession"] not in seen:
                seen.add(e["accession"])
                entries.append(e)
        if len(entries) >= max_filings:
            break

    # Skip filings we already stored to save requests.
    have = db.existing_accessions({e["accession"] for e in entries})
    todo = [e for e in entries if e["accession"] not in have][:max_filings]

    inserted = processed = errors = 0
    for e in todo:
        try:
            rows = fetch_filing_rows(e)
            if rows:
                inserted += db.insert_trades(rows)
                processed += 1
        except Exception as ex:
            errors += 1
            log(f"[sec] {e['accession']} failed: {ex}")
    summary = {
        "feed_filings": len(entries),
        "new_filings": len(todo),
        "processed": processed,
        "inserted": inserted,
        "errors": errors,
    }
    log(f"[sec] refresh {summary}")
    return summary
