"""Trading 212 holdings, cross-referenced with insider activity.

Read-only. Authenticates with the same credentials as the owner's Trading 212
dashboard: TRADING212_API_KEY, plus an optional TRADING212_API_SECRET. When a
secret is set, the Authorization header is HTTP Basic `base64(key:secret)`;
otherwise it's the raw key. Network call is isolated in `_fetch_portfolio` for
testing. US-equity positions (ticker suffix `_US_EQ`) get an insider summary;
everything else is shown but marked with no insider data, because ETFs/non-US
names have no Form 4 filings.
"""
import base64
import json
import os
import urllib.request

from . import db

T212_BASE = "https://live.trading212.com/api/v0"


def _auth_header():
    """Build the T212 Authorization header, or None if no key is configured.

    Mirrors the owner's dashboard: Basic base64(key:secret) when a secret is
    present, else the raw key.
    """
    key = os.environ.get("TRADING212_API_KEY", "").strip()
    secret = os.environ.get("TRADING212_API_SECRET", "").strip()
    if not key:
        return None
    if secret:
        cred = base64.b64encode(f"{key}:{secret}".encode()).decode()
        return f"Basic {cred}"
    return key


def _fetch_portfolio():
    """Isolated T212 call. Returns the raw positions list (or [] if no key)."""
    auth = _auth_header()
    if not auth:
        return []
    req = urllib.request.Request(
        T212_BASE + "/equity/portfolio",
        headers={"Authorization": auth, "User-Agent": "insider-tracker/2.0"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def parse_position(p):
    raw = p.get("ticker", "")
    is_us = raw.endswith("_US_EQ")
    return {
        "raw_ticker": raw,
        # Strip the known suffix (not split on "_") so symbols with an
        # underscore in the company part survive (e.g. BRK_B_US_EQ -> BRK_B).
        "ticker": raw[: -len("_US_EQ")] if is_us else raw,
        "is_us_equity": is_us,
        "qty": float(p.get("quantity") or 0),
        "avg_price": float(p.get("averagePrice") or 0),
        "current_price": float(p.get("currentPrice") or 0),
        "ppl": float(p.get("ppl") or 0),
    }


def get_holdings(insider_days=30):
    try:
        raw = _fetch_portfolio()
    except Exception:
        raw = None

    if raw is None:
        positions = db.get_holdings_cache()
        source = "cache"
    else:
        positions = [parse_position(p) for p in raw]
        db.save_holdings_cache(positions)
        source = "live"

    for pos in positions:
        if pos.get("is_us_equity"):
            pos["insider"] = db.insider_summary(pos["ticker"], days=insider_days)
        else:
            pos["insider"] = None

    return {"source": source, "positions": positions}
