"""Insider Trading Tracker — FastAPI backend.

Pulls the latest SEC Form 4 filings, parses insider transactions, stores them
in SQLite, and serves a JSON API + the static dashboard. A background thread
refreshes from SEC every few minutes so the board keeps filling while you're
away.
"""
import os
import threading
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, JSONResponse

from . import db, sec, market, holdings, detail
from .sample import sample_rows

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
REFRESH_SECONDS = int(os.environ.get("INSIDER_REFRESH_SECONDS", "300"))
INITIAL_PAGES = int(os.environ.get("INSIDER_INITIAL_PAGES", "4"))  # ~400 latest filings

STATUS = {
    "last_attempt": None,
    "last_success": None,
    "refreshing": False,
    "live_count": 0,
    "total_count": 0,
    "source": "starting",
    "last_summary": None,
    "message": "Starting up — fetching the latest filings from SEC EDGAR…",
}

_stop = threading.Event()
_refresh_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _load_dotenv():
    """Minimal .env reader so TRADING212_API_KEY can live in a file."""
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(path):
        return
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def do_refresh(pages):
    """Run one refresh cycle. Safe to call from any thread."""
    if not _refresh_lock.acquire(blocking=False):
        return STATUS["last_summary"]  # already refreshing
    try:
        STATUS["refreshing"] = True
        STATUS["last_attempt"] = _now()
        try:
            summary = sec.refresh(db, pages=pages)
            STATUS["last_summary"] = summary
            STATUS["last_success"] = _now()
            if summary.get("inserted") or db.count("live"):
                db.delete_sample()  # real data has arrived; drop the demo rows
            STATUS["message"] = "Live SEC data."
        except Exception as ex:
            STATUS["message"] = f"SEC fetch failed ({ex}). Showing what we have."
            summary = {"error": str(ex)}
        STATUS["live_count"] = db.count("live")
        STATUS["total_count"] = db.count()
        STATUS["source"] = (
            "live" if STATUS["live_count"] else
            ("sample" if STATUS["total_count"] else "empty")
        )
        return summary
    finally:
        STATUS["refreshing"] = False
        _refresh_lock.release()


def _worker():
    do_refresh(pages=INITIAL_PAGES)
    while not _stop.wait(REFRESH_SECONDS):
        do_refresh(pages=1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_dotenv()
    db.init_db()
    if db.count() == 0:
        db.insert_trades(sample_rows())
    STATUS["live_count"] = db.count("live")
    STATUS["total_count"] = db.count()
    t = threading.Thread(target=_worker, name="sec-refresh", daemon=True)
    t.start()
    yield
    _stop.set()


app = FastAPI(title="Insider Trading Tracker", lifespan=lifespan)


@app.get("/api/status")
def api_status():
    return STATUS


@app.get("/api/trades")
def api_trades(
    kind: str = "all",
    role: str | None = None,
    ticker: str | None = None,
    q: str | None = None,
    min_value: float = 0,
    days: int | None = None,
    sort: str = "recent",
    limit: int = Query(200, le=1000),
    offset: int = 0,
    compiled: bool = True,
):
    rows = db.query_trades(kind=kind, role=role, ticker=ticker, q=q,
                           min_value=min_value, days=days, sort=sort,
                           limit=limit, offset=offset, compiled=compiled)
    return {"count": len(rows), "trades": rows}


@app.get("/api/stats")
def api_stats(days: int = 7):
    return db.stats(days=days)


@app.get("/api/clusters")
def api_clusters(days: int = 14, min_owners: int = 2):
    return {"clusters": db.clusters(days=days, min_owners=min_owners)}


@app.get("/api/tickers")
def api_tickers():
    return {"tickers": db.tickers()}


@app.get("/api/prices/{ticker}")
def api_prices(ticker: str, period: str = "1y"):
    return market.get_prices(ticker, period)


@app.get("/api/fundamentals/{ticker}")
def api_fundamentals(ticker: str):
    return market.get_fundamentals(ticker)


@app.get("/api/quote/{ticker}")
def api_quote(ticker: str):
    return market.get_quote(ticker)


@app.get("/api/holdings")
def api_holdings(days: int = 30):
    return holdings.get_holdings(insider_days=days)


@app.get("/api/stock/{ticker}")
def api_stock(ticker: str, period: str = "1y"):
    return detail.stock_detail(ticker, price_period=period)


@app.get("/api/insider/{cik}")
def api_insider(cik: str):
    return detail.insider_detail(cik)


@app.post("/api/refresh")
def api_refresh(pages: int = 1):
    if STATUS["refreshing"]:
        return JSONResponse({"ok": False, "message": "Already refreshing."}, status_code=202)
    threading.Thread(target=do_refresh, kwargs={"pages": pages}, daemon=True).start()
    return {"ok": True, "message": "Refresh started."}


def resolve_static_path(dist_dir, full_path):
    """Map a request path to a file under dist_dir. Returns a real file when it
    exists and is safely inside dist_dir, otherwise index.html (SPA fallback)."""
    index = os.path.join(dist_dir, "index.html")
    if not full_path:
        return index
    candidate = os.path.normpath(os.path.join(dist_dir, full_path))
    root = os.path.normpath(dist_dir)
    if candidate.startswith(root + os.sep) and os.path.isfile(candidate):
        return candidate
    return index


# Static dashboard — catch-all registered last so /api/* routes win.
DIST_DIR = os.path.join(FRONTEND_DIR, "dist")
if os.path.isdir(DIST_DIR):
    @app.get("/{full_path:path}")
    def spa(full_path: str):
        return FileResponse(resolve_static_path(DIST_DIR, full_path))
else:
    @app.get("/")
    def _needs_build():
        return JSONResponse(
            {"message": "Frontend not built yet. Run ./run.sh (it builds the app)."},
            status_code=503,
        )
