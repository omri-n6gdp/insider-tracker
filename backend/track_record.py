"""Insider track-record ("smart-money") scoring.

For each open-market buy, measure the stock's forward return over a horizon,
market-adjusted against SPY. Aggregate per insider into a 0-100 rating that is
shrunk toward neutral for small samples (one lucky trade != skill). Pure math +
a `recompute` orchestrator that uses `market.get_prices` and caches into
`insider_track`.
"""
import math

HORIZONS = {"1m": 21, "3m": 63, "6m": 126}  # trading days
SHRINK_K = 5      # pseudo-count pulling the mean toward 0
SCALE = 8.0       # logistic steepness on the shrunk 3m mean
BENCHMARK = "SPY"


def forward_return(candles, date, horizon):
    """Return close[i+horizon]/close[i]-1 where i is the first candle on/after
    `date`; None if there isn't enough future data."""
    idx = None
    for i, c in enumerate(candles):
        if c["date"] >= date:
            idx = i
            break
    if idx is None:
        return None
    j = idx + horizon
    if j >= len(candles):
        return None
    base = candles[idx]["close"]
    if not base:
        return None
    return candles[j]["close"] / base - 1.0


def market_adjusted(stock_candles, spy_candles, date, horizon):
    s = forward_return(stock_candles, date, horizon)
    m = forward_return(spy_candles, date, horizon)
    if s is None or m is None:
        return None
    return s - m


def rating(avg_ret_3m, win_rate, n):
    """0-100. Shrink the mean 3m market-adjusted return toward 0 by sample size,
    then squash through a logistic. n=0 -> 50 (neutral)."""
    if not n:
        return 50.0
    shrunk = (avg_ret_3m or 0.0) * (n / (n + SHRINK_K))
    score = 100.0 / (1.0 + math.exp(-shrunk * SCALE))
    return round(score, 1)


def _avg(xs):
    xs = [x for x in xs if x is not None]
    return (sum(xs) / len(xs)) if xs else None


def recompute(db, market, min_buys=2, max_owners=None):
    """Compute + cache a rating for every insider with buys. Returns count.
    Best-effort: tickers/SPY without price data simply contribute no samples."""
    spy = market.get_prices(BENCHMARK, period="2y")["candles"]
    owners = db.distinct_buy_owners()
    if max_owners:
        owners = owners[:max_owners]
    done = 0
    for cik in owners:
        buys = db.buys_for_owner(cik)
        if not buys:
            continue
        rets = {"1m": [], "3m": [], "6m": []}
        wins = []
        for b in buys:
            date = b.get("period")
            if not date:
                continue
            candles = market.get_prices(b["ticker"], period="2y")["candles"]
            if not candles:
                continue
            for label, h in HORIZONS.items():
                r = market_adjusted(candles, spy, date, h)
                if r is not None:
                    rets[label].append(r)
                    if label == "3m":
                        wins.append(1 if r > 0 else 0)
        n = len(rets["3m"])
        avg3 = _avg(rets["3m"])
        rec = {
            "owner_cik": cik, "owner_name": buys[0].get("owner_name"),
            "n_buys": n,
            "avg_ret_1m": _avg(rets["1m"]), "avg_ret_3m": avg3,
            "avg_ret_6m": _avg(rets["6m"]),
            "win_rate": (sum(wins) / len(wins)) if wins else None,
            "rating": rating(avg3, (sum(wins) / len(wins)) if wins else 0.5, n),
            "sample_ok": 1 if n >= min_buys else 0,
        }
        db.save_insider_track(rec)
        done += 1
    return done
