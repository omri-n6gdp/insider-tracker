"""Insider Trading Tracker — FastAPI backend.

Pulls the latest SEC Form 4 filings, parses insider transactions, stores them
in SQLite, and serves a JSON API + the static dashboard. A background thread
refreshes from SEC every few minutes so the board keeps filling while you're
away.
"""
import os
import csv
import io
import subprocess
import threading
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Response
from fastapi.responses import FileResponse, JSONResponse

from . import db, sec, market, holdings, detail, track_record, score, strategy, backfill, digest
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


def _recompute_ratings():
    if STATUS.get("rating_running"):
        return
    STATUS["rating_running"] = True
    try:
        n = track_record.recompute(db, market)
        STATUS["ratings_computed"] = n
        STATUS["ratings_at"] = _now()
    except Exception as ex:
        STATUS["ratings_error"] = str(ex)
    finally:
        STATUS["rating_running"] = False


def _run_backfill(max_days=20):
    if STATUS.get("backfill_running"):
        return
    STATUS["backfill_running"] = True
    try:
        STATUS["backfill_last"] = backfill.run(db, max_days=max_days)
    except Exception as ex:
        STATUS["backfill_last"] = {"error": str(ex)}
    finally:
        STATUS["backfill_running"] = False


def _advance_scoreboards():
    try:
        strategy.advance_scoreboard(db, market)
    except Exception as ex:
        STATUS["scoreboard_error"] = str(ex)


def _notify_mac(title, message):
    try:
        subprocess.run(["osascript", "-e",
                        f'display notification {message!r} with title {title!r}'],
                       check=False, timeout=5)
    except Exception:
        pass


def _maybe_daily_digest():
    import datetime as _d
    today = _d.date.today().isoformat()
    if db.get_meta("digest_date") == today:
        return
    try:
        d = digest.build(db, holdings)
        n_clusters = len(d.get("clusters", []))
        n_alerts = len(d.get("holdings_alerts", []))
        if n_clusters or n_alerts:
            _notify_mac("Insider Ledger",
                        f"{n_clusters} cluster buys · {n_alerts} holdings sell-alerts today")
        db.set_meta("digest_date", today)
    except Exception as ex:
        STATUS["digest_error"] = str(ex)


def _worker():
    do_refresh(pages=INITIAL_PAGES)
    _recompute_ratings()
    while not _stop.wait(REFRESH_SECONDS):
        do_refresh(pages=1)
        _advance_scoreboards()
        _maybe_daily_digest()


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


@app.get("/api/recommendations")
def api_recommendations(days: int = 30, limit: int = 20):
    return {"recommendations": score.top_buys(db, market, days=days, limit=limit)}


@app.get("/api/smart-money")
def api_smart_money(limit: int = 25, min_buys: int = 2):
    return {"insiders": db.top_insider_tracks(limit=limit, min_buys=min_buys)}


@app.post("/api/recompute")
def api_recompute():
    if STATUS.get("rating_running"):
        return JSONResponse({"ok": False, "message": "Already running."}, status_code=202)
    threading.Thread(target=_recompute_ratings, daemon=True).start()
    return {"ok": True, "message": "Rating recompute started."}


@app.post("/api/refresh")
def api_refresh(pages: int = 1):
    if STATUS["refreshing"]:
        return JSONResponse({"ok": False, "message": "Already refreshing."}, status_code=202)
    threading.Thread(target=do_refresh, kwargs={"pages": pages}, daemon=True).start()
    return {"ok": True, "message": "Refresh started."}


@app.get("/api/strategies")
def api_list_strategies():
    return {"strategies": db.list_strategies()}


@app.post("/api/strategies")
def api_create_strategy(payload: dict):
    name = (payload.get("name") or "Untitled").strip()
    rule = payload.get("rule") or {}
    sid = db.create_strategy(name, rule)
    return {"id": sid, "strategy": db.get_strategy(sid)}


@app.delete("/api/strategies/{sid}")
def api_delete_strategy(sid: int):
    db.delete_strategy(sid)
    return {"ok": True}


@app.post("/api/strategies/{sid}/active")
def api_set_active(sid: int, payload: dict):
    db.set_strategy_active(sid, bool(payload.get("active", True)))
    return {"ok": True, "strategy": db.get_strategy(sid)}


@app.get("/api/strategies/{sid}/scoreboard")
def api_scoreboard(sid: int):
    pos = db.positions_for_strategy(sid)
    closed = [p for p in pos if p["status"] == "closed"]
    pnl = sum((p.get("pnl") or 0) for p in closed)
    wins = sum(1 for p in closed if (p.get("pnl") or 0) > 0)
    return {"strategy": db.get_strategy(sid), "positions": pos,
            "open": sum(1 for p in pos if p["status"] == "open"),
            "closed": len(closed), "realized_pnl": round(pnl, 2),
            "win_rate": round(wins / len(closed), 4) if closed else None}


@app.post("/api/backtest")
def api_backtest(payload: dict):
    rule = payload.get("rule") or {}
    days = payload.get("days")
    return strategy.run_backtest(db, market, rule, days=days)


@app.post("/api/backfill")
def api_backfill(max_days: int = 20):
    if STATUS.get("backfill_running"):
        return JSONResponse({"ok": False, "message": "Already running."}, status_code=202)
    threading.Thread(target=_run_backfill, kwargs={"max_days": max_days},
                     daemon=True).start()
    return {"ok": True, "message": "Backfill started."}


@app.get("/api/backfill/status")
def api_backfill_status():
    return {"running": STATUS.get("backfill_running", False),
            "last": STATUS.get("backfill_last"),
            "cursor": db.get_meta("backfill_cursor")}


@app.get("/api/sectors")
def api_sectors(days: int = 30):
    return {"sectors": db.sector_flow(days=days)}


@app.get("/api/watchlist")
def api_watchlist():
    return {"watchlist": db.list_watch(),
            "activity": db.watchlist_activity()}


@app.post("/api/watchlist")
def api_add_watch(payload: dict):
    db.add_watch(payload.get("kind"), payload.get("key"))
    return {"ok": True}


@app.delete("/api/watchlist")
def api_remove_watch(kind: str, key: str):
    db.remove_watch(kind, key)
    return {"ok": True}


@app.get("/api/digest")
def api_digest():
    return digest.build(db, holdings)


@app.get("/api/export.csv")
def api_export_csv(kind: str = "all", days: int | None = None,
                   min_value: float = 0, q: str | None = None):
    rows = db.query_trades(kind=kind, days=days, min_value=min_value, q=q,
                           compiled=True, limit=5000)
    cols = ["filed_at", "period", "ticker", "issuer_name", "owner_name",
            "roles", "kind", "shares", "price", "value", "line_count"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([r.get(c) for c in cols])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=insider-ledger.csv"})


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
