"""SQLite storage for insider (Form 4) transactions. Standard library only."""
import sqlite3
import threading
import os
import json
import time

from . import aggregate

DB_PATH = os.environ.get(
    "INSIDER_DB",
    os.path.join(os.path.dirname(__file__), "..", "data", "insider.db"),
)

_lock = threading.Lock()
_conn = None


def _connect():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
    return _conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id            INTEGER PRIMARY KEY,
    uid           TEXT UNIQUE,
    accession     TEXT,
    filing_url    TEXT,
    filed_at      TEXT,
    period        TEXT,
    issuer_name   TEXT,
    ticker        TEXT,
    issuer_cik    TEXT,
    owner_name    TEXT,
    owner_cik     TEXT,
    roles         TEXT,
    officer_title TEXT,
    security_title TEXT,
    code          TEXT,
    action        TEXT,
    kind          TEXT,
    ad            TEXT,
    shares        REAL,
    price         REAL,
    value         REAL,
    shares_after  REAL,
    is_derivative INTEGER,
    source        TEXT DEFAULT 'live'
);
CREATE INDEX IF NOT EXISTS idx_filed   ON trades(filed_at);
CREATE INDEX IF NOT EXISTS idx_ticker  ON trades(ticker);
CREATE INDEX IF NOT EXISTS idx_kind    ON trades(kind);
CREATE INDEX IF NOT EXISTS idx_value   ON trades(value);
CREATE TABLE IF NOT EXISTS prices (
    ticker TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL,
    volume REAL, PRIMARY KEY (ticker, date)
);
CREATE TABLE IF NOT EXISTS fundamentals (
    ticker TEXT PRIMARY KEY, name TEXT, sector TEXT, industry TEXT,
    market_cap REAL, pe REAL, pb REAL, dividend_yield REAL,
    week52_low REAL, week52_high REAL, currency TEXT, fetched_at REAL
);
CREATE TABLE IF NOT EXISTS holdings_cache (
    ticker TEXT, raw_ticker TEXT PRIMARY KEY, qty REAL, avg_price REAL,
    current_price REAL, is_us_equity INTEGER, fetched_at REAL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


def init_db():
    with _lock:
        c = _connect()
        c.executescript(SCHEMA)
        c.commit()


# ---------------------------------------------------------------- meta
def set_meta(key, value):
    with _lock:
        c = _connect()
        c.execute(
            "INSERT INTO meta(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value)),
        )
        c.commit()


def get_meta(key, default=None):
    with _lock:
        c = _connect()
        row = c.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except Exception:
        return default


# ---------------------------------------------------------------- writes
COLS = [
    "uid", "accession", "filing_url", "filed_at", "period", "issuer_name",
    "ticker", "issuer_cik", "owner_name", "owner_cik", "roles", "officer_title",
    "security_title", "code", "action", "kind", "ad", "shares", "price",
    "value", "shares_after", "is_derivative", "source",
]


def insert_trades(rows):
    """Insert rows (list of dicts). Returns number of new rows added."""
    if not rows:
        return 0
    placeholders = ",".join("?" for _ in COLS)
    sql = (
        f"INSERT OR IGNORE INTO trades ({','.join(COLS)}) VALUES ({placeholders})"
    )
    with _lock:
        c = _connect()
        before = c.total_changes
        c.executemany(sql, [[r.get(k) for k in COLS] for r in rows])
        c.commit()
        return c.total_changes - before


def existing_accessions(accessions):
    if not accessions:
        return set()
    qs = ",".join("?" for _ in accessions)
    with _lock:
        c = _connect()
        rows = c.execute(
            f"SELECT DISTINCT accession FROM trades WHERE accession IN ({qs})",
            list(accessions),
        ).fetchall()
    return {r["accession"] for r in rows}


def delete_sample():
    with _lock:
        c = _connect()
        c.execute("DELETE FROM trades WHERE source='sample'")
        c.commit()


def count(source=None):
    with _lock:
        c = _connect()
        if source:
            r = c.execute("SELECT COUNT(*) n FROM trades WHERE source=?", (source,)).fetchone()
        else:
            r = c.execute("SELECT COUNT(*) n FROM trades").fetchone()
    return r["n"]


# ---------------------------------------------------------------- reads
def query_trades(kind="all", role=None, ticker=None, q=None, min_value=0,
                 days=None, sort="recent", limit=200, offset=0, compiled=True):
    where = []
    params = []
    if kind and kind != "all":
        where.append("kind=?")
        params.append(kind)
    if role:
        where.append("roles LIKE ?")
        params.append(f"%{role}%")
    if ticker:
        where.append("ticker=?")
        params.append(ticker.upper())
    if q:
        where.append("(issuer_name LIKE ? OR owner_name LIKE ? OR ticker LIKE ?)")
        like = f"%{q}%"
        params += [like, like, like.upper()]
    if days:
        where.append("filed_at >= date('now', ?)")
        params.append(f"-{int(days)} days")
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    if not compiled:
        w, p = list(where), list(params)
        if min_value:
            w.append("value >= ?")
            p.append(float(min_value))
        clause2 = ("WHERE " + " AND ".join(w)) if w else ""
        order = "value DESC" if sort == "value" else "filed_at DESC, id DESC"
        sql = f"SELECT * FROM trades {clause2} ORDER BY {order} LIMIT ? OFFSET ?"
        p += [int(limit), int(offset)]
        with _lock:
            c = _connect()
            rows = c.execute(sql, p).fetchall()
        return [dict(r) for r in rows]

    # Compiled path: min_value/sort/pagination are applied in Python *after*
    # compiling, so they act on per-group totals (not individual lines). That's
    # why min_value is deliberately not added to the WHERE clause here.
    sql = f"SELECT * FROM trades {clause} ORDER BY filed_at DESC, id DESC"
    with _lock:
        c = _connect()
        rows = [dict(r) for r in c.execute(sql, params).fetchall()]
    rows = aggregate.compile_trades(rows)
    if min_value:
        rows = [r for r in rows if (r.get("value") or 0) >= float(min_value)]
    rows.sort(key=lambda r: ((r.get("value") or 0) if sort == "value"
                             else (r.get("filed_at") or "")), reverse=True)
    return rows[int(offset):int(offset) + int(limit)]


def stats(days=7):
    win = (f"-{int(days)} days",)
    with _lock:
        c = _connect()

        def one(sql, p=()):
            return c.execute(sql, p).fetchone()

        base = "FROM trades WHERE filed_at >= date('now', ?)"
        buys = one(f"SELECT COUNT(*) n, COALESCE(SUM(value),0) v {base} AND kind='buy'", win)
        sells = one(f"SELECT COUNT(*) n, COALESCE(SUM(value),0) v {base} AND kind='sell'", win)
        total = one(f"SELECT COUNT(*) n {base}", win)
        top_buys = c.execute(
            f"SELECT * {base} AND kind='buy' AND value>0 ORDER BY value DESC LIMIT 6", win
        ).fetchall()
        top_sells = c.execute(
            f"SELECT * {base} AND kind='sell' AND value>0 ORDER BY value DESC LIMIT 6", win
        ).fetchall()
        active = c.execute(
            f"SELECT ticker, issuer_name, COUNT(*) n, "
            f"SUM(CASE WHEN kind='buy' THEN value ELSE 0 END) buy_v, "
            f"SUM(CASE WHEN kind='sell' THEN value ELSE 0 END) sell_v "
            f"{base} AND ticker!='' GROUP BY ticker ORDER BY n DESC LIMIT 8", win
        ).fetchall()
    return {
        "days": days,
        "buys_count": buys["n"], "buys_value": buys["v"],
        "sells_count": sells["n"], "sells_value": sells["v"],
        "net_value": (buys["v"] or 0) - (sells["v"] or 0),
        "total_count": total["n"],
        "top_buys": [dict(r) for r in top_buys],
        "top_sells": [dict(r) for r in top_sells],
        "active": [dict(r) for r in active],
    }


def clusters(days=14, min_owners=2):
    """Companies where >= min_owners distinct insiders bought recently."""
    with _lock:
        c = _connect()
        rows = c.execute(
            "SELECT ticker, issuer_name, "
            "COUNT(DISTINCT owner_cik) owners, COUNT(*) trades, "
            "COALESCE(SUM(value),0) total_value, "
            "MAX(filed_at) last_filed, "
            "GROUP_CONCAT(DISTINCT owner_name) names "
            "FROM trades "
            "WHERE kind='buy' AND ticker!='' "
            "AND filed_at >= date('now', ?) "
            "GROUP BY ticker HAVING owners >= ? "
            "ORDER BY owners DESC, total_value DESC LIMIT 12",
            (f"-{int(days)} days", int(min_owners)),
        ).fetchall()
    return [dict(r) for r in rows]


def tickers():
    with _lock:
        c = _connect()
        rows = c.execute(
            "SELECT ticker, COUNT(*) n FROM trades WHERE ticker!='' "
            "GROUP BY ticker ORDER BY n DESC LIMIT 200"
        ).fetchall()
    return [r["ticker"] for r in rows]


# ---------------------------------------------------------------- price cache
def save_prices(ticker, candles):
    if not candles:
        return
    with _lock:
        c = _connect()
        c.executemany(
            "INSERT OR REPLACE INTO prices(ticker,date,open,high,low,close,volume)"
            " VALUES(?,?,?,?,?,?,?)",
            [(ticker, x["date"], x["open"], x["high"], x["low"], x["close"],
              x["volume"]) for x in candles],
        )
        c.commit()


def get_prices(ticker):
    with _lock:
        c = _connect()
        rows = c.execute(
            "SELECT date,open,high,low,close,volume FROM prices "
            "WHERE ticker=? ORDER BY date",
            (ticker,),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------- fundamentals
_FUND_COLS = ["ticker", "name", "sector", "industry", "market_cap", "pe", "pb",
              "dividend_yield", "week52_low", "week52_high", "currency",
              "fetched_at"]


def save_fundamentals(ticker, data):
    data = {**data, "ticker": ticker}  # the explicit arg wins over data["ticker"]
    with _lock:
        c = _connect()
        c.execute(
            "INSERT OR REPLACE INTO fundamentals "
            f"({','.join(_FUND_COLS)}) VALUES ({','.join('?' for _ in _FUND_COLS)})",
            [data.get(k) for k in _FUND_COLS],
        )
        c.commit()


def get_fundamentals(ticker):
    with _lock:
        c = _connect()
        r = c.execute("SELECT * FROM fundamentals WHERE ticker=?", (ticker,)).fetchone()
    return dict(r) if r else None


# ---------------------------------------------------------------- holdings
def insider_summary(ticker, days=30):
    """Buy/sell counts + values for a ticker over the last `days`, with a
    simple sell-alert flag (insiders net-selling by count and by value)."""
    with _lock:
        c = _connect()
        r = c.execute(
            "SELECT "
            "SUM(CASE WHEN kind='buy' THEN 1 ELSE 0 END) buys,"
            "SUM(CASE WHEN kind='sell' THEN 1 ELSE 0 END) sells,"
            "COALESCE(SUM(CASE WHEN kind='buy' THEN value ELSE 0 END),0) buy_value,"
            "COALESCE(SUM(CASE WHEN kind='sell' THEN value ELSE 0 END),0) sell_value "
            "FROM trades WHERE ticker=? AND filed_at >= date('now', ?)",
            (ticker.upper(), f"-{int(days)} days"),
        ).fetchone()
    buys = r["buys"] or 0
    sells = r["sells"] or 0
    buy_v = r["buy_value"] or 0
    sell_v = r["sell_value"] or 0
    return {
        "buys": buys, "sells": sells,
        "buy_value": buy_v, "sell_value": sell_v,
        "net_value": buy_v - sell_v,
        "sell_alert": (sells > buys) and (sell_v > buy_v),
    }


# Note: a position's `ppl` (profit/loss) is intentionally NOT cached here — it
# is too volatile to be meaningful once stale; live responses carry it, cache
# responses don't.
_HOLD_COLS = ["ticker", "raw_ticker", "qty", "avg_price", "current_price",
              "is_us_equity", "fetched_at"]


def save_holdings_cache(positions):
    now = time.time()
    with _lock:
        c = _connect()
        c.execute("DELETE FROM holdings_cache")
        c.executemany(
            f"INSERT INTO holdings_cache ({','.join(_HOLD_COLS)}) "
            f"VALUES ({','.join('?' for _ in _HOLD_COLS)})",
            [(p["ticker"], p["raw_ticker"], p.get("qty", 0), p.get("avg_price", 0),
              p.get("current_price", 0), 1 if p.get("is_us_equity") else 0, now)
             for p in positions],
        )
        c.commit()


def get_holdings_cache():
    with _lock:
        c = _connect()
        rows = c.execute("SELECT * FROM holdings_cache").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["is_us_equity"] = bool(d["is_us_equity"])
        out.append(d)
    return out
