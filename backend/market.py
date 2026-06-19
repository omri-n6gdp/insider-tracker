"""Market data (prices + fundamentals) via yfinance, cached in SQLite.

Network calls live in `_download_history` / `_download_info` so tests can
monkeypatch them. Everything degrades gracefully: on a fetch failure we serve
whatever is cached and mark availability accordingly.
"""
import math
import time

from . import db

PRICE_TTL = 12 * 3600   # re-fetch daily candles at most twice a day
FUND_TTL = 24 * 3600    # re-fetch fundamentals at most once a day


def _norm(ticker):
    return (ticker or "").strip().upper().replace(".", "-")


def _clean_num(v):
    """yfinance often returns NaN/Infinity for missing metrics (no P/E, no
    dividend, etc.). Those are not JSON-compliant — Starlette's JSONResponse
    raises on them and the endpoint would 500 — so coerce them to None."""
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


def _download_history(ticker, period="1y"):
    """Isolated yfinance price call. Returns a list of candle dicts."""
    import yfinance as yf

    hist = yf.Ticker(ticker).history(period=period, auto_adjust=False)
    out = []
    for idx, row in hist.iterrows():
        o, h, l, c = (float(row["Open"]), float(row["High"]),
                      float(row["Low"]), float(row["Close"]))
        # The current partial trading day often comes back as NaN; skip it
        # rather than emit NaN (not valid JSON, and breaks get_quote math).
        if any(math.isnan(v) for v in (o, h, l, c)):
            continue
        out.append({
            "date": idx.strftime("%Y-%m-%d"),
            "open": o, "high": h, "low": l, "close": c,
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


def _download_info(ticker):
    """Isolated yfinance fundamentals call. Returns the raw .info dict."""
    import yfinance as yf

    return yf.Ticker(ticker).info or {}


def _shape_fundamentals(sym, info):
    return {
        "ticker": sym,
        "name": info.get("longName") or info.get("shortName") or sym,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": _clean_num(info.get("marketCap")),
        "pe": _clean_num(info.get("trailingPE")),
        "pb": _clean_num(info.get("priceToBook")),
        "dividend_yield": _clean_num(info.get("dividendYield")),
        "week52_low": _clean_num(info.get("fiftyTwoWeekLow")),
        "week52_high": _clean_num(info.get("fiftyTwoWeekHigh")),
        "currency": info.get("currency"),
        "fetched_at": time.time(),
    }


def get_fundamentals(ticker):
    sym = _norm(ticker)
    cached = db.get_fundamentals(sym)
    if cached and (time.time() - float(cached.get("fetched_at") or 0)) < FUND_TTL:
        cached["available"] = True
        return cached

    try:
        info = _download_info(sym)
    except Exception:
        info = {}

    if info:
        data = _shape_fundamentals(sym, info)
        db.save_fundamentals(sym, data)
        data["available"] = True
        return data

    if cached:
        cached["available"] = True
        return cached
    return {"ticker": sym, "available": False}


def get_quote(ticker):
    """Last price + day change derived from the cached/fetched candles."""
    data = get_prices(ticker)
    candles = data["candles"]
    if not candles:
        return {"ticker": data["ticker"], "available": False,
                "price": None, "change": None, "change_pct": None}
    last = candles[-1]["close"]
    prev = candles[-2]["close"] if len(candles) > 1 else last
    change = last - prev
    return {
        "ticker": data["ticker"], "available": True, "price": last,
        "change": change,
        "change_pct": (change / prev * 100) if prev else 0.0,
    }
