"""Strategy rules, backtesting, and live-scoreboard advancement.

A rule selects qualifying open-market buy *signals*; the backtester simulates
buying equal bankroll at the close on/after each signal and selling `hold_days`
trading days later, comparing to SPY over the same windows. Sequential
equal-bankroll compounding — an explicit simplification, not advice.
"""
from . import db
from .track_record import forward_return  # reuse on/after-date close lookup


def passes(rule, trade):
    if rule.get("min_value") and (trade.get("value") or 0) < rule["min_value"]:
        return False
    if rule.get("roles"):
        blob = ((trade.get("roles") or "") + " " +
                (trade.get("officer_title") or "")).lower()
        if rule["roles"].lower() not in blob:
            return False
    return True


def signals(db_mod, rule, days=None):
    """Qualifying open-market buys as {ticker, date}. Honors min_cluster_owners
    by requiring >= N distinct owners buying the ticker on the same date."""
    buys = db_mod.query_trades(kind="buy", days=days, compiled=True, limit=20000)
    buys = [t for t in buys if t.get("code") == "P" and t.get("ticker")
            and t.get("period") and passes(rule, t)]
    min_owners = int(rule.get("min_cluster_owners") or 1)
    if min_owners > 1:
        from collections import defaultdict
        seen = defaultdict(set)
        for t in buys:
            seen[(t["ticker"], t["period"])].add(t.get("owner_cik"))
        buys = [t for t in buys
                if len(seen[(t["ticker"], t["period"])]) >= min_owners]
    # one signal per (ticker, date)
    uniq = {}
    for t in buys:
        uniq[(t["ticker"], t["period"])] = {"ticker": t["ticker"], "date": t["period"]}
    return list(uniq.values())


def _trade_return(candles, date, hold_days):
    return forward_return(candles, date, hold_days)


def backtest(sig_list, prices_by_ticker, spy, hold_days=63):
    trades = []
    for s in sig_list:
        candles = prices_by_ticker.get(s["ticker"]) or []
        r = _trade_return(candles, s["date"], hold_days)
        if r is None:
            continue
        m = _trade_return(spy, s["date"], hold_days)
        trades.append({"ticker": s["ticker"], "date": s["date"], "ret": r,
                       "mkt": m, "adj": (r - m) if m is not None else None})
    trades.sort(key=lambda t: t["date"])
    n = len(trades)
    if not n:
        return {"n_trades": 0, "win_rate": 0.0, "avg_return": 0.0,
                "avg_market_adjusted": 0.0, "total_return": 0.0,
                "equity": [], "benchmark": []}
    wins = sum(1 for t in trades if t["ret"] > 0)
    avg = sum(t["ret"] for t in trades) / n
    adjs = [t["adj"] for t in trades if t["adj"] is not None]
    eq, bench = [], []
    cur, bcur = 1.0, 1.0
    for t in trades:
        cur *= (1 + t["ret"])
        bcur *= (1 + (t["mkt"] or 0))
        eq.append({"date": t["date"], "value": round(cur, 4)})
        bench.append({"date": t["date"], "value": round(bcur, 4)})
    return {
        "n_trades": n, "win_rate": round(wins / n, 4),
        "avg_return": avg,
        "avg_market_adjusted": (sum(adjs) / len(adjs)) if adjs else 0.0,
        "total_return": round(cur - 1, 4),
        "benchmark_total_return": round(bcur - 1, 4),
        "equity": eq, "benchmark": bench, "trades": trades,
    }


def run_backtest(db_mod, market, rule, days=None):
    """Glue: gather signals, fetch their prices + SPY, backtest."""
    sigs = signals(db_mod, rule, days=days)
    prices = {}
    for s in sigs:
        if s["ticker"] not in prices:
            prices[s["ticker"]] = market.get_prices(s["ticker"], period="2y")["candles"]
    spy = market.get_prices("SPY", period="2y")["candles"]
    res = backtest(sigs, prices, spy, hold_days=int(rule.get("hold_days") or 63))
    res["signals"] = len(sigs)
    return res


def advance_scoreboard(db_mod, market):
    """For each active strategy: open paper positions for new qualifying signals
    since activation, and close positions whose hold_days elapsed (price-based)."""
    advanced = 0
    for s in db_mod.list_strategies():
        if not s.get("active"):
            continue
        rule = s["rule"]
        hold = int(rule.get("hold_days") or 63)
        activated = s.get("activated_at") or ""
        existing = {(p["ticker"], p["opened_at"]) for p in db_mod.positions_for_strategy(s["id"])}
        for sig in signals(db_mod, rule):
            if sig["date"] < activated[:10]:
                continue
            key = (sig["ticker"], sig["date"])
            if key in existing:
                continue
            candles = market.get_prices(sig["ticker"], period="1y")["candles"]
            entry = _close_on_or_after(candles, sig["date"])
            if entry is None:
                continue
            db_mod.add_position(s["id"], {"ticker": sig["ticker"],
                                          "opened_at": sig["date"],
                                          "entry_price": entry, "shares": 1,
                                          "status": "open"})
            advanced += 1
        # close matured positions
        for p in db_mod.open_positions(s["id"]):
            candles = market.get_prices(p["ticker"], period="1y")["candles"]
            px = _close_at_offset(candles, p["opened_at"], hold)
            if px is not None:
                pnl = (px - p["entry_price"]) * (p.get("shares") or 1)
                db_mod.close_position(p["id"], exit_at="(matured)",
                                      exit_price=px, pnl=round(pnl, 2))
    return advanced


def _close_on_or_after(candles, date):
    for c in candles:
        if c["date"] >= date:
            return c["close"]
    return None


def _close_at_offset(candles, date, offset):
    for i, c in enumerate(candles):
        if c["date"] >= date:
            j = i + offset
            return candles[j]["close"] if j < len(candles) else None
    return None
