"""Top Buys — a transparent multi-factor ranking of recent open-market buying.

Five 0-100 sub-scores (cluster, seniority, size vs market cap, insider track
record, valuation) blended by fixed weights into a total, with the breakdown
returned so every pick shows *why* it ranks. Open-market buys (code P) only.
"""

WEIGHTS = {"cluster": 0.25, "seniority": 0.20, "size": 0.20,
           "track": 0.20, "valuation": 0.15}

_ROLE_WEIGHT = [
    (("ceo", "chief executive", "president", "cfo", "chief financial"), 100),
    (("officer", "chief"), 75),
    (("10%", "ten percent"), 65),
    (("director",), 50),
]


def cluster_score(owners):
    return min(100.0, 25.0 * max(1, owners))     # 1->25, 2->50, 3->75, 4+->100


def seniority_score(roles_or_titles):
    blob = " ".join(x for x in roles_or_titles if x).lower()
    best = 40
    for needles, w in _ROLE_WEIGHT:
        if any(n in blob for n in needles):
            best = max(best, w)
    return float(best)


def size_score(buy_value, market_cap):
    if not market_cap or market_cap <= 0 or not buy_value:
        return 30.0
    frac = buy_value / market_cap
    # 0.001% -> low, 0.1%+ -> high (log-ish bands)
    if frac >= 1e-3:
        return 100.0
    if frac >= 1e-4:
        return 80.0
    if frac >= 1e-5:
        return 60.0
    if frac >= 1e-6:
        return 40.0
    return 25.0


def valuation_score(pe):
    if pe is None:
        return 50.0
    if pe <= 0:
        return 45.0          # unprofitable: mild penalty, not informative
    if pe < 15:
        return 90.0
    if pe < 25:
        return 70.0
    if pe < 40:
        return 50.0
    if pe < 70:
        return 35.0
    return 20.0


def track_score(avg_rating):
    return float(avg_rating) if avg_rating is not None else 50.0


def total(subs):
    return round(sum(subs[k] * WEIGHTS[k] for k in WEIGHTS), 1)


def top_buys(db, market, days=30, limit=20):
    """Rank tickers by recent open-market buying. Returns explainable records."""
    buys = db.query_trades(kind="buy", days=days, compiled=True, limit=2000)
    by_ticker = {}
    for t in buys:
        if t.get("code") != "P" or not t.get("ticker"):
            continue
        g = by_ticker.setdefault(t["ticker"], {
            "ticker": t["ticker"], "issuer_name": t.get("issuer_name"),
            "owners": set(), "buy_value": 0.0, "roles": [], "trades": []})
        g["owners"].add(t.get("owner_cik"))
        g["buy_value"] += t.get("value") or 0
        g["roles"].append(t.get("officer_title") or "")
        g["roles"].append(t.get("roles") or "")
        g["trades"].append(t)

    out = []
    for tk, g in by_ticker.items():
        fund = market.get_fundamentals(tk)
        market_cap = fund.get("market_cap") if fund.get("available") else None
        pe = fund.get("pe") if fund.get("available") else None
        ratings = [db.get_insider_track(c)["rating"]
                   for c in g["owners"]
                   if c and db.get_insider_track(c)]
        avg_rating = (sum(ratings) / len(ratings)) if ratings else None
        subs = {
            "cluster": cluster_score(len(g["owners"])),
            "seniority": seniority_score(g["roles"]),
            "size": size_score(g["buy_value"], market_cap),
            "track": track_score(avg_rating),
            "valuation": valuation_score(pe),
        }
        out.append({
            "ticker": tk, "issuer_name": g["issuer_name"],
            "owners": len(g["owners"]), "buy_value": g["buy_value"],
            "market_cap": market_cap, "pe": pe,
            "subscores": subs, "score": total(subs),
            "trades": g["trades"],
        })
    out.sort(key=lambda r: r["score"], reverse=True)
    return out[:limit]
