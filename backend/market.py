"""Market data (prices + fundamentals) via yfinance, cached in SQLite.

Network calls live in `_download_history` / `_download_info` so tests can
monkeypatch them. Everything degrades gracefully: on a fetch failure we serve
whatever is cached and mark availability accordingly.
"""
import time

from . import db

PRICE_TTL = 12 * 3600   # re-fetch daily candles at most twice a day
FUND_TTL = 24 * 3600    # re-fetch fundamentals at most once a day


def _norm(ticker):
    return (ticker or "").strip().upper().replace(".", "-")


def _download_history(ticker, period="1y"):
    """Isolated yfinance price call. Returns a list of candle dicts."""
    import yfinance as yf

    hist = yf.Ticker(ticker).history(period=period, auto_adjust=False)
    out = []
    for idx, row in hist.iterrows():
        out.append({
            "date": idx.strftime("%Y-%m-%d"),
            "open": float(row["Open"]), "high": float(row["High"]),
            "low": float(row["Low"]), "close": float(row["Close"]),
            "volume": float(row["Volume"]),
        })
    return out


def get_prices(ticker, period="1y"):
    sym = _norm(ticker)
    cached = db.get_prices(sym)
    fetched = db.get_meta(f"prices_fetched:{sym}")
    if cached and fetched and (time.time() - float(fetched)) < PRICE_TTL:
        return {"ticker": sym, "available": True, "candles": cached}

    try:
        candles = _download_history(sym, period)
    except Exception:
        candles = []

    if candles:
        db.save_prices(sym, candles)
        db.set_meta(f"prices_fetched:{sym}", time.time())
        return {"ticker": sym, "available": True, "candles": candles}

    return {"ticker": sym, "available": bool(cached), "candles": cached or []}
