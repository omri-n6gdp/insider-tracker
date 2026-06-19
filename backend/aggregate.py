"""Collapse multiple Form 4 transaction lines into one logical trade.

Pure functions only — no database or network. Grouped by insider + stock +
kind + transaction date + code + acquired/disposed flag + derivative flag.
Shares and value are summed; price is volume-weighted over lines that have a
real price (>0), so unpriced grant/option lines don't distort it.
"""


def _uid_index(uid):
    """Best-effort line index from a 'accession:index' uid (for ordering)."""
    try:
        return int(str(uid).rsplit(":", 1)[1])
    except (IndexError, ValueError, TypeError):
        return -1


def compile_trades(rows):
    groups = {}
    order = []
    for r in rows:
        key = (
            r.get("owner_cik"), r.get("ticker"), r.get("kind"), r.get("period"),
            r.get("code"), r.get("ad"), r.get("is_derivative"),
        )
        g = groups.get(key)
        if g is None:
            g = dict(r)  # representative scalar fields from the first line
            g.update(line_count=0, accessions=[], _priced_shares=0.0,
                     _priced_value=0.0, _sum_shares=0.0, _sum_value=0.0,
                     _best_filed=r.get("filed_at") or "", _max_idx=-1)
            groups[key] = g
            order.append(key)

        shares = r.get("shares") or 0
        price = r.get("price") or 0
        value = r.get("value") or 0
        g["_sum_shares"] += shares
        g["_sum_value"] += value
        if price and price > 0:
            g["_priced_shares"] += shares
            g["_priced_value"] += shares * price  # robust VWAP, not stored value
        g["line_count"] += 1

        acc = r.get("accession")
        if acc and acc not in g["accessions"]:
            g["accessions"].append(acc)

        filed = r.get("filed_at") or ""
        if filed > g["_best_filed"]:
            g["_best_filed"] = filed

        idx = _uid_index(r.get("uid"))
        if idx > g["_max_idx"]:  # highest line index wins; ties keep first-seen
            g["_max_idx"] = idx
            g["shares_after"] = r.get("shares_after")

    out = []
    for key in order:
        g = groups[key]
        g["shares"] = g["_sum_shares"]
        g["value"] = g["_sum_value"]
        g["price"] = (g["_priced_value"] / g["_priced_shares"]
                      if g["_priced_shares"] else (g.get("price") or 0))
        g["filed_at"] = g["_best_filed"]
        for k in ("_priced_shares", "_priced_value", "_sum_shares",
                  "_sum_value", "_best_filed", "_max_idx"):
            g.pop(k, None)
        out.append(g)
    return out
