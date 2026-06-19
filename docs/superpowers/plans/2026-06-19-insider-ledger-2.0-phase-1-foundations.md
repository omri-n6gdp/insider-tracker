# Insider Ledger 2.0 — Phase 1 (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the backend three new data capabilities — compiled (deduped) trades, cached market prices + quant data via yfinance, and Trading 212 holdings cross-referenced with insider activity — all served over the existing JSON API.

**Architecture:** Extend the existing FastAPI + SQLite app. SEC fetching stays standard-library. Add a pure `aggregate.compile_trades()` function (no DB, fully unit-tested), a `market.py` yfinance wrapper that caches into new `prices`/`fundamentals` tables, and a `holdings.py` Trading 212 client that caches into `holdings_cache` and attaches an insider summary to each US-equity position. Introduce pytest with a temp-DB fixture (the project currently has no tests).

**Tech Stack:** Python 3, FastAPI, SQLite (stdlib `sqlite3`), `yfinance` (new runtime dep), `urllib` (T212 + SEC), `pytest` (new dev dep).

**Reference spec:** `docs/superpowers/specs/2026-06-19-insider-ledger-2.0-design.md`

---

## File structure for this phase

- Create `backend/aggregate.py` — pure `compile_trades(rows)`; no imports from the app. One responsibility: collapse Form 4 lines into one logical trade.
- Create `backend/market.py` — yfinance price + fundamentals fetch with cache-through to SQLite. Network calls isolated in `_download_history` / `_download_info` so tests can monkeypatch them.
- Create `backend/holdings.py` — Trading 212 portfolio fetch (`_fetch_portfolio` isolated), ticker parsing, and insider cross-reference.
- Modify `backend/db.py` — add `prices`, `fundamentals`, `holdings_cache` tables; add cache read/write helpers, `insider_summary`, and a `compiled` branch in `query_trades`.
- Modify `backend/main.py` — add `compiled` flag to `/api/trades`; add `/api/prices/{ticker}`, `/api/fundamentals/{ticker}`, `/api/holdings`; add a tiny `.env` loader.
- Modify `requirements.txt` — add `yfinance` and `pytest`.
- Create `pytest.ini`, `tests/conftest.py`, and the test files referenced below.
- Create `.env.example`; modify `CLAUDE.md` to document the new modules.

**Convention:** every commit command ends with the `Co-Authored-By` trailer shown in the steps. All `pytest` / `python` commands are run from the project root `~/code/insider-tracker` using the project venv: `./.venv/bin/python -m pytest …`.

---

### Task 1: Test scaffolding + dependencies

**Files:**
- Modify: `requirements.txt`
- Create: `pytest.ini`
- Create: `tests/conftest.py`
- Create: `tests/test_infra.py`

- [ ] **Step 1: Add the new dependencies**

Replace the contents of `requirements.txt` with:

```
fastapi
uvicorn[standard]
yfinance
pytest
```

- [ ] **Step 2: Install them into the project venv**

Run: `./.venv/bin/python -m pip install -r requirements.txt`
Expected: installs `yfinance`, `pandas`, `numpy`, `requests`, `pytest` (and deps); ends with "Successfully installed …".

- [ ] **Step 3: Create the pytest config**

Create `pytest.ini`:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
addopts = -q
```

- [ ] **Step 4: Create the temp-DB fixture**

Create `tests/conftest.py`:

```python
"""Shared pytest fixtures. Each test gets a fresh, isolated SQLite file."""
import pytest

from backend import db


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Point the db module at a throwaway file and reset its connection."""
    path = tmp_path / "test.db"
    monkeypatch.setattr(db, "DB_PATH", str(path))
    db._conn = None
    db.init_db()
    yield db
    if db._conn is not None:
        db._conn.close()
    db._conn = None
```

- [ ] **Step 5: Add a smoke test proving the fixture works**

Create `tests/test_infra.py`:

```python
def test_temp_db_starts_empty(temp_db):
    assert temp_db.count() == 0
```

- [ ] **Step 6: Run it**

Run: `./.venv/bin/python -m pytest tests/test_infra.py -v`
Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add requirements.txt pytest.ini tests/conftest.py tests/test_infra.py
git commit -m "test: add pytest scaffolding + temp-db fixture; add yfinance dep" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Compile duplicate trades (`aggregate.compile_trades`)

A single Form 4 lists multiple transaction lines; collapse them into one logical
trade per `(owner_cik, ticker, kind, period, code, ad, is_derivative)`, summing
shares/value and volume-weighting price over priced lines.

**Files:**
- Create: `backend/aggregate.py`
- Create: `tests/test_aggregate.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_aggregate.py`:

```python
from backend.aggregate import compile_trades


def _line(**kw):
    base = {
        "owner_cik": "1", "ticker": "AAPL", "kind": "buy", "period": "2026-06-10",
        "code": "P", "ad": "A", "is_derivative": 0, "shares": 100, "price": 10.0,
        "value": 1000.0, "shares_after": 100, "uid": "acc:0", "accession": "acc",
        "filed_at": "2026-06-10",
    }
    base.update(kw)
    return base


def test_compile_sums_shares_and_weights_price():
    rows = [
        _line(shares=100, price=10.0, value=1000.0, shares_after=100, uid="acc:0"),
        _line(shares=200, price=11.0, value=2200.0, shares_after=300, uid="acc:1"),
    ]
    out = compile_trades(rows)
    assert len(out) == 1
    t = out[0]
    assert t["shares"] == 300
    assert t["value"] == 3200.0
    assert round(t["price"], 4) == round(3200 / 300, 4)
    assert t["line_count"] == 2
    assert t["shares_after"] == 300  # taken from the latest line


def test_compile_keeps_distinct_insiders_separate():
    rows = [
        _line(owner_cik="1", uid="a:0", accession="a"),
        _line(owner_cik="2", uid="b:0", accession="b"),
    ]
    out = compile_trades(rows)
    assert len(out) == 2


def test_compile_ignores_zero_price_lines_in_weighting():
    rows = [
        _line(shares=100, price=10.0, value=1000.0, uid="a:0"),
        _line(shares=50, price=0.0, value=0.0, uid="a:1"),  # grant-like, unpriced
    ]
    out = compile_trades(rows)
    t = out[0]
    assert t["shares"] == 150          # all shares counted
    assert t["price"] == 10.0          # price weighted only over the priced line
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_aggregate.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.aggregate'`.

- [ ] **Step 3: Implement `aggregate.py`**

Create `backend/aggregate.py`:

```python
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
            g["_priced_value"] += value
        g["line_count"] += 1

        acc = r.get("accession")
        if acc and acc not in g["accessions"]:
            g["accessions"].append(acc)

        filed = r.get("filed_at") or ""
        if filed > g["_best_filed"]:
            g["_best_filed"] = filed

        idx = _uid_index(r.get("uid"))
        if idx >= g["_max_idx"]:
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
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_aggregate.py -v`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/aggregate.py tests/test_aggregate.py
git commit -m "feat: compile duplicate Form 4 lines into one logical trade" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Serve compiled trades from `db.query_trades` + `/api/trades`

**Files:**
- Modify: `backend/db.py` (import `aggregate`; rewrite `query_trades`)
- Modify: `backend/main.py` (`api_trades` gains `compiled`)
- Create: `tests/test_query_compiled.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_query_compiled.py`:

```python
def _line(uid, **kw):
    base = {
        "uid": uid, "accession": uid.split(":")[0], "ticker": "AAPL", "kind": "buy",
        "period": "2026-06-10", "code": "P", "ad": "A", "is_derivative": 0,
        "owner_cik": "1", "shares": 100, "price": 10.0, "value": 1000.0,
        "shares_after": 100, "filed_at": "2026-06-10", "source": "live",
    }
    base.update(kw)
    return base


def test_query_trades_compiled_collapses_lines(temp_db):
    temp_db.insert_trades([
        _line("acc:0", shares=100, price=10.0, value=1000.0),
        _line("acc:1", shares=200, price=11.0, value=2200.0),
    ])
    raw = temp_db.query_trades(compiled=False)
    assert len(raw) == 2
    compiled = temp_db.query_trades(compiled=True)
    assert len(compiled) == 1
    assert compiled[0]["shares"] == 300
    assert compiled[0]["value"] == 3200.0
    assert compiled[0]["line_count"] == 2


def test_query_trades_compiled_min_value_filters_on_total(temp_db):
    temp_db.insert_trades([
        _line("acc:0", shares=100, price=10.0, value=1000.0),
        _line("acc:1", shares=200, price=11.0, value=2200.0),
    ])
    # Each line is < 3000, but the compiled total (3200) clears the filter.
    assert len(temp_db.query_trades(compiled=True, min_value=3000)) == 1
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_query_compiled.py -v`
Expected: FAIL — `query_trades()` rejects the `compiled` keyword (`TypeError`).

- [ ] **Step 3: Update `db.py`**

At the top of `backend/db.py`, add to the imports (after `import json`):

```python
from . import aggregate
```

Replace the entire existing `query_trades(...)` function in `backend/db.py` with:

```python
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
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_query_compiled.py -v`
Expected: `2 passed`.

- [ ] **Step 5: Expose the flag on the API**

In `backend/main.py`, change the `api_trades` signature to add a `compiled` param and pass it through. Replace the existing `api_trades` function with:

```python
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
```

- [ ] **Step 6: Verify the full suite still passes**

Run: `./.venv/bin/python -m pytest -q`
Expected: all tests pass (`6 passed` so far).

- [ ] **Step 7: Commit**

```bash
git add backend/db.py backend/main.py tests/test_query_compiled.py
git commit -m "feat: serve compiled trades via query_trades + /api/trades?compiled" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: New cache tables + price cache helpers

**Files:**
- Modify: `backend/db.py` (extend `SCHEMA`; add price helpers)
- Create: `tests/test_db_cache.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_db_cache.py`:

```python
def test_prices_round_trip(temp_db):
    candles = [
        {"date": "2026-06-10", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 100},
        {"date": "2026-06-11", "open": 1.5, "high": 2.5, "low": 1.0, "close": 2.0, "volume": 200},
    ]
    temp_db.save_prices("AAPL", candles)
    got = temp_db.get_prices("AAPL")
    assert len(got) == 2
    assert got[0]["date"] == "2026-06-10"
    assert got[1]["close"] == 2.0


def test_save_prices_is_idempotent(temp_db):
    c = [{"date": "2026-06-10", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 100}]
    temp_db.save_prices("AAPL", c)
    temp_db.save_prices("AAPL", c)  # same date again -> replace, not duplicate
    assert len(temp_db.get_prices("AAPL")) == 1
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_db_cache.py -v`
Expected: FAIL — `AttributeError: module 'backend.db' has no attribute 'save_prices'`.

- [ ] **Step 3: Extend the schema**

In `backend/db.py`, inside the `SCHEMA` string, immediately before the line
`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`, insert:

```sql
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
```

- [ ] **Step 4: Add the price helpers**

In `backend/db.py`, at the end of the file, add:

```python
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
```

- [ ] **Step 5: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_db_cache.py -v`
Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/db.py tests/test_db_cache.py
git commit -m "feat: add prices/fundamentals/holdings_cache tables + price helpers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `market.get_prices` (yfinance + cache-through)

**Files:**
- Create: `backend/market.py`
- Create: `tests/test_market_prices.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_market_prices.py`:

```python
def test_get_prices_fetches_then_serves_from_cache(temp_db, monkeypatch):
    from backend import market

    calls = {"n": 0}

    def fake_download(ticker, period="1y"):
        calls["n"] += 1
        return [{"date": "2026-06-10", "open": 1.0, "high": 2.0, "low": 0.5,
                 "close": 1.5, "volume": 100}]

    monkeypatch.setattr(market, "_download_history", fake_download)

    first = market.get_prices("AAPL")
    assert first["available"] is True
    assert first["ticker"] == "AAPL"
    assert len(first["candles"]) == 1

    second = market.get_prices("AAPL")           # within TTL -> cached
    assert calls["n"] == 1                        # no second network call
    assert second["candles"][0]["close"] == 1.5


def test_get_prices_normalises_ticker(temp_db, monkeypatch):
    from backend import market
    seen = {}

    def fake_download(ticker, period="1y"):
        seen["ticker"] = ticker
        return [{"date": "2026-06-10", "open": 1, "high": 1, "low": 1,
                 "close": 1, "volume": 1}]

    monkeypatch.setattr(market, "_download_history", fake_download)
    market.get_prices("brk.b")
    assert seen["ticker"] == "BRK-B"
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_market_prices.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.market'`.

- [ ] **Step 3: Implement `market.py` (prices half)**

Create `backend/market.py`:

```python
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
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_market_prices.py -v`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/market.py tests/test_market_prices.py
git commit -m "feat: market.get_prices with yfinance fetch + SQLite cache" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Fundamentals (db helpers + `market.get_fundamentals` + `get_quote`)

**Files:**
- Modify: `backend/db.py` (fundamentals helpers)
- Modify: `backend/market.py` (fundamentals + quote)
- Create: `tests/test_market_fundamentals.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_market_fundamentals.py`:

```python
def test_get_fundamentals_shapes_and_caches(temp_db, monkeypatch):
    from backend import market

    calls = {"n": 0}

    def fake_info(ticker):
        calls["n"] += 1
        return {
            "longName": "Apple Inc", "sector": "Technology",
            "industry": "Consumer Electronics", "marketCap": 3.0e12,
            "trailingPE": 30.0, "priceToBook": 45.0, "dividendYield": 0.005,
            "fiftyTwoWeekLow": 150.0, "fiftyTwoWeekHigh": 260.0, "currency": "USD",
        }

    monkeypatch.setattr(market, "_download_info", fake_info)

    d1 = market.get_fundamentals("AAPL")
    assert d1["name"] == "Apple Inc"
    assert d1["sector"] == "Technology"
    assert d1["market_cap"] == 3.0e12
    assert d1["available"] is True

    d2 = market.get_fundamentals("AAPL")   # cached within TTL
    assert calls["n"] == 1
    assert d2["pe"] == 30.0


def test_get_quote_from_last_two_candles(temp_db, monkeypatch):
    from backend import market

    def fake_download(ticker, period="1y"):
        return [
            {"date": "2026-06-10", "open": 1, "high": 1, "low": 1, "close": 100.0, "volume": 1},
            {"date": "2026-06-11", "open": 1, "high": 1, "low": 1, "close": 110.0, "volume": 1},
        ]

    monkeypatch.setattr(market, "_download_history", fake_download)
    quote = market.get_quote("AAPL")
    assert quote["price"] == 110.0
    assert round(quote["change_pct"], 2) == 10.0
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_market_fundamentals.py -v`
Expected: FAIL — `AttributeError: module 'backend.market' has no attribute 'get_fundamentals'`.

- [ ] **Step 3: Add fundamentals helpers to `db.py`**

In `backend/db.py`, at the end of the file, add:

```python
# ---------------------------------------------------------------- fundamentals
_FUND_COLS = ["ticker", "name", "sector", "industry", "market_cap", "pe", "pb",
              "dividend_yield", "week52_low", "week52_high", "currency",
              "fetched_at"]


def save_fundamentals(ticker, data):
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
```

- [ ] **Step 4: Add fundamentals + quote to `market.py`**

In `backend/market.py`, at the end of the file, add:

```python
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
        "market_cap": info.get("marketCap"),
        "pe": info.get("trailingPE"),
        "pb": info.get("priceToBook"),
        "dividend_yield": info.get("dividendYield"),
        "week52_low": info.get("fiftyTwoWeekLow"),
        "week52_high": info.get("fiftyTwoWeekHigh"),
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
```

- [ ] **Step 5: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_market_fundamentals.py -v`
Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/db.py backend/market.py tests/test_market_fundamentals.py
git commit -m "feat: cached fundamentals + derived quote in market module" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Price + fundamentals API endpoints

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Import the market module**

In `backend/main.py`, change the existing import line
`from . import db, sec` to:

```python
from . import db, sec, market
```

- [ ] **Step 2: Add the endpoints**

In `backend/main.py`, immediately after the existing `api_tickers` function
(before the `@app.post("/api/refresh")` route), add:

```python
@app.get("/api/prices/{ticker}")
def api_prices(ticker: str, period: str = "1y"):
    return market.get_prices(ticker, period)


@app.get("/api/fundamentals/{ticker}")
def api_fundamentals(ticker: str):
    return market.get_fundamentals(ticker)


@app.get("/api/quote/{ticker}")
def api_quote(ticker: str):
    return market.get_quote(ticker)
```

- [ ] **Step 3: Verify the app imports cleanly**

Run: `./.venv/bin/python -c "import backend.main; print('ok')"`
Expected: prints `ok` (no import or syntax errors).

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: add /api/prices, /api/fundamentals, /api/quote endpoints" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Insider summary helper + holdings cache helpers

**Files:**
- Modify: `backend/db.py` (add `insider_summary`, `save_holdings_cache`, `get_holdings_cache`)
- Create: `tests/test_db_insider_summary.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_db_insider_summary.py`:

```python
def _trade(uid, kind, value, owner):
    return {
        "uid": uid, "accession": uid.split(":")[0], "ticker": "AAPL", "kind": kind,
        "period": "2026-06-18", "code": "P" if kind == "buy" else "S", "ad": "A",
        "is_derivative": 0, "owner_cik": owner, "shares": 1, "price": value,
        "value": value, "filed_at": "2026-06-18", "source": "live",
    }


def test_insider_summary_flags_net_selling(temp_db):
    temp_db.insert_trades([
        _trade("a:0", "sell", 2_000_000, "8"),
        _trade("b:0", "sell", 1_000_000, "9"),
    ])
    s = temp_db.insider_summary("AAPL", days=3650)
    assert s["sells"] == 2
    assert s["buys"] == 0
    assert s["sell_value"] == 3_000_000
    assert s["sell_alert"] is True


def test_insider_summary_no_alert_when_buying(temp_db):
    temp_db.insert_trades([
        _trade("a:0", "buy", 2_000_000, "8"),
        _trade("b:0", "sell", 500_000, "9"),
    ])
    s = temp_db.insider_summary("AAPL", days=3650)
    assert s["sell_alert"] is False


def test_holdings_cache_round_trip(temp_db):
    positions = [
        {"ticker": "AAPL", "raw_ticker": "AAPL_US_EQ", "qty": 3, "avg_price": 150,
         "current_price": 200, "is_us_equity": True},
        {"ticker": "VWRLl_EQ", "raw_ticker": "VWRLl_EQ", "qty": 10, "avg_price": 1,
         "current_price": 1, "is_us_equity": False},
    ]
    temp_db.save_holdings_cache(positions)
    got = temp_db.get_holdings_cache()
    assert len(got) == 2
    aapl = next(p for p in got if p["ticker"] == "AAPL")
    assert aapl["is_us_equity"] is True
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_db_insider_summary.py -v`
Expected: FAIL — `AttributeError: module 'backend.db' has no attribute 'insider_summary'`.

- [ ] **Step 3: Add the helpers to `db.py`**

In `backend/db.py`, at the end of the file, add:

```python
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


_HOLD_COLS = ["ticker", "raw_ticker", "qty", "avg_price", "current_price",
              "is_us_equity", "fetched_at"]


def save_holdings_cache(positions):
    now = __import__("time").time()
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
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_db_insider_summary.py -v`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/db.py tests/test_db_insider_summary.py
git commit -m "feat: insider_summary + holdings_cache helpers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: `holdings.py` — Trading 212 fetch + cross-reference

**Files:**
- Create: `backend/holdings.py`
- Create: `tests/test_holdings.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_holdings.py`:

```python
def test_parse_position_us_vs_non_us():
    from backend import holdings
    us = holdings.parse_position({
        "ticker": "AAPL_US_EQ", "quantity": 3, "averagePrice": 150,
        "currentPrice": 200, "ppl": 150})
    assert us["ticker"] == "AAPL"
    assert us["is_us_equity"] is True

    lse = holdings.parse_position({
        "ticker": "VWRLl_EQ", "quantity": 10, "averagePrice": 1,
        "currentPrice": 1, "ppl": 0})
    assert lse["is_us_equity"] is False
    assert lse["ticker"] == "VWRLl_EQ"


def test_get_holdings_attaches_insider_summary(temp_db, monkeypatch):
    from backend import holdings, db

    db.insert_trades([
        {"uid": "x:0", "accession": "x", "ticker": "AAPL", "kind": "sell",
         "period": "2026-06-18", "code": "S", "ad": "D", "is_derivative": 0,
         "owner_cik": "8", "shares": 1, "price": 1, "value": 1_000_000,
         "filed_at": "2026-06-18", "source": "live"},
        {"uid": "x:1", "accession": "x", "ticker": "AAPL", "kind": "sell",
         "period": "2026-06-18", "code": "S", "ad": "D", "is_derivative": 0,
         "owner_cik": "9", "shares": 1, "price": 1, "value": 2_000_000,
         "filed_at": "2026-06-18", "source": "live"},
    ])

    monkeypatch.setattr(holdings, "_fetch_portfolio", lambda: [
        {"ticker": "AAPL_US_EQ", "quantity": 3, "averagePrice": 150,
         "currentPrice": 200, "ppl": 150},
        {"ticker": "VWRLl_EQ", "quantity": 10, "averagePrice": 1,
         "currentPrice": 1, "ppl": 0},
    ])

    res = holdings.get_holdings(insider_days=3650)
    assert res["source"] == "live"
    aapl = next(p for p in res["positions"] if p["ticker"] == "AAPL")
    assert aapl["insider"]["sells"] == 2
    assert aapl["insider"]["sell_alert"] is True
    vwrl = next(p for p in res["positions"] if p["raw_ticker"] == "VWRLl_EQ")
    assert vwrl["insider"] is None   # non-US: no insider data


def test_get_holdings_falls_back_to_cache_on_error(temp_db, monkeypatch):
    from backend import holdings, db
    db.save_holdings_cache([{
        "ticker": "AAPL", "raw_ticker": "AAPL_US_EQ", "qty": 1, "avg_price": 1,
        "current_price": 1, "is_us_equity": True}])

    def boom():
        raise RuntimeError("network down")

    monkeypatch.setattr(holdings, "_fetch_portfolio", boom)
    res = holdings.get_holdings()
    assert res["source"] == "cache"
    assert res["positions"][0]["ticker"] == "AAPL"
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_holdings.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.holdings'`.

- [ ] **Step 3: Implement `holdings.py`**

Create `backend/holdings.py`:

```python
"""Trading 212 holdings, cross-referenced with insider activity.

Read-only. Uses the public T212 API key from the TRADING212_API_KEY env var
(the same key used by the owner's Trading 212 dashboard). Network call is
isolated in `_fetch_portfolio` for testing. US-equity positions
(ticker suffix `_US_EQ`) get an insider summary; everything else is shown but
marked with no insider data, because ETFs/non-US names have no Form 4 filings.
"""
import json
import os
import urllib.request

from . import db

T212_BASE = "https://live.trading212.com/api/v0"


def _api_key():
    return os.environ.get("TRADING212_API_KEY", "").strip()


def _fetch_portfolio():
    """Isolated T212 call. Returns the raw positions list (or [] if no key)."""
    key = _api_key()
    if not key:
        return []
    req = urllib.request.Request(
        T212_BASE + "/equity/portfolio",
        headers={"Authorization": key, "User-Agent": "insider-tracker/2.0"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def parse_position(p):
    raw = p.get("ticker", "")
    is_us = raw.endswith("_US_EQ")
    return {
        "raw_ticker": raw,
        "ticker": raw.split("_")[0] if is_us else raw,
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
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_holdings.py -v`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/holdings.py tests/test_holdings.py
git commit -m "feat: Trading 212 holdings fetch + insider cross-reference" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Holdings endpoint + `.env` loader

**Files:**
- Modify: `backend/main.py` (import holdings; add endpoint; load `.env`)
- Create: `.env.example`

- [ ] **Step 1: Import holdings**

In `backend/main.py`, change `from . import db, sec, market` to:

```python
from . import db, sec, market, holdings
```

- [ ] **Step 2: Add a tiny .env loader**

In `backend/main.py`, immediately after the `def _now():` function, add:

```python
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
```

- [ ] **Step 3: Call it at startup**

In `backend/main.py`, inside the `lifespan` function, make `db.init_db()` the
second line by inserting the loader call before it:

```python
async def lifespan(app: FastAPI):
    _load_dotenv()
    db.init_db()
```

- [ ] **Step 4: Add the holdings endpoint**

In `backend/main.py`, immediately after the `api_quote` function, add:

```python
@app.get("/api/holdings")
def api_holdings(days: int = 30):
    return holdings.get_holdings(insider_days=days)
```

- [ ] **Step 5: Create `.env.example`**

Create `.env.example`:

```
# Trading 212 read-only API key (T212 app -> Settings -> API).
# Copy this file to .env and paste your key. The .env file is git-ignored.
TRADING212_API_KEY=
```

- [ ] **Step 6: Verify the app imports cleanly**

Run: `./.venv/bin/python -c "import backend.main; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py .env.example
git commit -m "feat: /api/holdings endpoint + .env loader for T212 key" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Docs + full-suite + live smoke test

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the whole test suite**

Run: `./.venv/bin/python -m pytest -q`
Expected: every test passes (about `15 passed`). If any fail, fix before continuing.

- [ ] **Step 2: Document the new modules**

In `CLAUDE.md`, under the `## Architecture` section, after the `backend/main.py`
bullet, add:

```markdown
- **`backend/aggregate.py`** — pure `compile_trades(rows)` that collapses
  multiple Form 4 lines into one logical trade (volume-weighted price). Used by
  `db.query_trades(compiled=True)` and exposed via `/api/trades?compiled=`.
- **`backend/market.py`** — yfinance prices + fundamentals, cached in the
  `prices`/`fundamentals` tables. Network calls isolated for testing. Endpoints:
  `/api/prices/{ticker}`, `/api/fundamentals/{ticker}`, `/api/quote/{ticker}`.
- **`backend/holdings.py`** — read-only Trading 212 portfolio via
  `TRADING212_API_KEY` (from `.env`), cached in `holdings_cache`. US-equity
  positions get an insider summary + sell-alert. Endpoint: `/api/holdings`.
- **Tests:** `pytest` from the project root (`./.venv/bin/python -m pytest`).
```

- [ ] **Step 3: Start the server for a live smoke test**

Run: `PORT=8099 ./run.sh` (leave it running in one terminal; it will install the
new deps on first launch). Wait until it prints that it's serving on `:8099`.

- [ ] **Step 4: Check the new endpoints**

In another terminal, run each and confirm the described output:

```bash
curl -s "http://localhost:8099/api/trades?compiled=true&limit=3" | head -c 400
curl -s "http://localhost:8099/api/prices/AAPL?period=1mo" | head -c 200
curl -s "http://localhost:8099/api/fundamentals/AAPL" | head -c 300
curl -s "http://localhost:8099/api/holdings" | head -c 300
```

Expected:
- `/api/trades?compiled=true` returns trades that include a `line_count` field.
- `/api/prices/AAPL` returns `"available": true` with a non-empty `candles` array
  (requires internet; first call is slower).
- `/api/fundamentals/AAPL` returns a `sector` and `market_cap`.
- `/api/holdings` returns `{"source": ..., "positions": [...]}` — positions is
  empty unless `TRADING212_API_KEY` is set in `.env`; US positions carry an
  `insider` object.

Stop the server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document aggregate/market/holdings modules + tests" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (Phase 1 scope):**
- Compile duplicate trades → Tasks 2–3 (`aggregate.compile_trades`, `query_trades(compiled=True)`, `/api/trades?compiled`). ✓
- Market prices + quant cache → Tasks 4–7 (`prices`/`fundamentals` tables, `market.py`, endpoints). ✓
- T212 holdings cross-reference → Tasks 8–10 (`insider_summary`, `holdings_cache`, `holdings.py`, `/api/holdings`, `.env`). ✓
- Phase-1 done-criteria ("API serves compiled trades, prices/quant for a ticker, and the owner's holdings") → verified live in Task 11. ✓
- Out of scope for Phase 1 (correctly deferred): React UI, detail pages, scoring, track records, strategy/backtest, backfill, extras.

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code; every run step has an expected result.

**Type/name consistency:** `compile_trades`, `query_trades(..., compiled=)`, `save_prices`/`get_prices`, `save_fundamentals`/`get_fundamentals`, `_shape_fundamentals`, `get_quote`, `insider_summary`, `save_holdings_cache`/`get_holdings_cache`, `parse_position`, `_fetch_portfolio`, `get_holdings`, `_load_dotenv` are used identically across tasks. Position dicts consistently use keys `ticker`/`raw_ticker`/`is_us_equity`/`qty`/`avg_price`/`current_price`. Candle dicts consistently use `date/open/high/low/close/volume`.

---

## Notes for later phases (not part of this plan)

- yfinance is heavier than the original stdlib-only footprint; that trade-off was
  accepted in the spec to get prices/quant. SEC fetching stays stdlib.
- Phase 4's EDGAR backfill is what makes track records and backtests meaningful;
  until then `insider_summary` / future scoring run on the ~10-day live window.
