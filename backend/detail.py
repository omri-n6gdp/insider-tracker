"""Assemble per-stock and per-insider detail payloads.

Pure composition of `db` + `market` (no FastAPI). The stock payload powers the
Stock page (price chart + insider markers + quant + history); the insider
payload powers the Insider page (cross-company history + roles + totals).
"""
from . import db, market


def _markers(trades):
    """Buy/sell trades with a real price + date, shaped for chart overlay."""
    out = []
    for t in trades:
        if t.get("kind") in ("buy", "sell") and (t.get("price") or 0) > 0 \
                and t.get("period"):
            out.append({
                "date": t["period"], "kind": t["kind"], "price": t["price"],
                "owner_name": t.get("owner_name"), "shares": t.get("shares"),
                "value": t.get("value"),
            })
    return out


def stock_detail(ticker, price_period="1y", history_days=90):
    sym = (ticker or "").upper()
    trades = db.query_trades(ticker=sym, compiled=True, limit=500)
    return {
        "ticker": sym,
        "fundamentals": market.get_fundamentals(sym),
        "prices": market.get_prices(sym, period=price_period),
        "trades": trades,
        "markers": _markers(trades),
        "summary": db.insider_summary(sym, days=history_days),
    }


def insider_detail(owner_cik, history_days=365):
    trades = db.trades_for_owner(owner_cik)
    first = trades[0] if trades else {}
    buys = sum(1 for t in trades if t.get("kind") == "buy")
    sells = sum(1 for t in trades if t.get("kind") == "sell")
    buy_v = sum((t.get("value") or 0) for t in trades if t.get("kind") == "buy")
    sell_v = sum((t.get("value") or 0) for t in trades if t.get("kind") == "sell")
    return {
        "owner_cik": str(owner_cik),
        "owner_name": first.get("owner_name"),
        "roles": first.get("roles"),
        "tickers": sorted({t["ticker"] for t in trades if t.get("ticker")}),
        "trades": trades,
        "summary": {"buys": buys, "sells": sells, "buy_value": buy_v,
                    "sell_value": sell_v, "net_value": buy_v - sell_v},
    }
