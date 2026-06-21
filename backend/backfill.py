"""Bounded, resumable historical Form 4 backfill from SEC daily-index files.

Reads https://www.sec.gov/Archives/edgar/daily-index/{Y}/QTR{q}/form.{YYYYMMDD}.idx,
keeps exact "4" filings, and reuses the existing parser. Throttled via sec._get.
Resumable: stores the last completed date in meta; capped per run so it never
hammers SEC. Best-effort — missing days are skipped."""
import datetime as dt

from . import sec

DAILY = ("https://www.sec.gov/Archives/edgar/daily-index/"
         "{y}/QTR{q}/form.{ymd}.idx")


def parse_form_index(text):
    out = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[0] != "4":
            continue
        # form.idx is fixed-width; the last token is the path, first is "4",
        # the CIK is the token before the date. SEC daily-index dates are
        # YYYYMMDD (8 digits, no dashes).
        path = parts[-1]
        date_i = next((i for i, p in enumerate(parts)
                       if len(p) == 8 and p.isdigit()), None)
        if date_i is None or date_i < 1:
            continue
        cik = parts[date_i - 1]
        if "edgar/data/" not in path:
            continue
        acc = path.rsplit("/", 1)[-1].replace(".txt", "")
        out.append({"cik": cik, "path": path, "accession": acc})
    return out


def _index_url(d):
    q = (d.month - 1) // 3 + 1
    return DAILY.format(y=d.year, q=q, ymd=d.strftime("%Y%m%d"))


def run(db, max_days=20, max_filings=400, log=print):
    """Walk backwards from the cursor (or today), one trading day at a time,
    pulling Form 4s. Returns a summary; stores progress in meta."""
    cursor = db.get_meta("backfill_cursor")
    start = (dt.date.fromisoformat(cursor) - dt.timedelta(days=1)) if cursor \
        else dt.date.today()
    inserted = processed = errors = days = 0
    d = start
    while days < max_days and processed < max_filings:
        if d.weekday() < 5:  # weekday
            try:
                raw = sec._get(_index_url(d)).decode("utf-8", "replace")
                entries = parse_form_index(raw)
                have = db.existing_accessions({e["accession"] for e in entries})
                for e in entries:
                    if processed >= max_filings:
                        break
                    if e["accession"] in have:
                        continue
                    try:
                        # reuse the per-filing fetch via a feed-style entry
                        base = e["path"].rsplit("/", 1)[0]
                        acc_dir = e["accession"].replace("-", "")
                        rows = sec.fetch_filing_rows({
                            "cik": e["cik"], "acc": acc_dir,
                            "accession": e["accession"], "filed_at": d.isoformat()})
                        if rows:
                            inserted += db.insert_trades(rows)
                        processed += 1
                    except Exception as ex:
                        errors += 1
                        log(f"[backfill] {e['accession']} failed: {ex}")
            except Exception as ex:
                log(f"[backfill] {d} index failed: {ex}")
            days += 1
        db.set_meta("backfill_cursor", d.isoformat())
        d -= dt.timedelta(days=1)
    summary = {"inserted": inserted, "processed": processed, "errors": errors,
               "days": days, "cursor": db.get_meta("backfill_cursor")}
    log(f"[backfill] {summary}")
    return summary
