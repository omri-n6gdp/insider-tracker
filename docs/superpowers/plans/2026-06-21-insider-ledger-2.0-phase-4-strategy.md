# Insider Ledger 2.0 — Phase 4 (Strategy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Visual tasks ALSO use frontend-design + agent-browser. Steps use `- [ ]`.

**Goal:** A **Strategy Lab** where you define a rule (e.g. "2+ insiders buy"), **backtest** it over accumulated history (equity curve + win rate + avg return vs S&P 500), and add it to a **live scoreboard** tracked forward — plus an **EDGAR history backfill** that deepens the data backtests run on.

**Architecture:** Pure, tested cores — `strategy.py` holds rule→signal filtering and a `backtest()` that simulates equal-bankroll entries/exits against cached prices and a SPY benchmark; `backfill.py` parses SEC daily-index files to pull historical Form 4s (bounded, resumable, reusing the existing `sec.parse_ownership`). Persistence in new `strategies`/`strategy_positions` tables. A background job advances active strategies' paper positions on each price refresh. New endpoints + a React Strategy Lab page (rule builder, equity-curve line chart, metrics, save/activate, scoreboard, and a "Build history" button).

**Tech Stack:** existing. lightweight-charts `addLineSeries` for the equity curve.

**Reference spec:** §6.5 (strategy/backtest/scoreboard), §6.7 (backfill), §5 (tables).

**Realism note:** A full multi-month crawl of *all* Form 4s is infeasible; `backfill` is **bounded + resumable** (processes a capped number of past trading days per run, dedupes by accession, stores a cursor) so it deepens history incrementally across runs. Backtests are an explicit simplification (sequential equal-bankroll), clearly labelled, not investment advice.

---

## File structure
**Backend:** Modify `backend/db.py` (tables + strategy/position CRUD + `signals_matching` query helper). Create `backend/strategy.py` (rule filter + `backtest` + scoreboard advance). Create `backend/backfill.py` (daily-index parse + bounded crawl). Modify `backend/main.py` (endpoints + background scoreboard tick + backfill thread). Tests: `tests/test_strategy.py`, `tests/test_backfill.py`, extend `tests/test_db_*`.
**Frontend:** types + api; `EquityChart.tsx` (line chart); `pages/Strategy.tsx`; nav + route.
**Conventions:** Python `./.venv/bin/python`; node `npm` in `frontend/`. NO `timeout`. Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: strategy/position tables + CRUD (TDD)

**Files:** Modify `backend/db.py`; Create `tests/test_db_strategies.py`.

- [ ] **Step 1: failing test** — `tests/test_db_strategies.py`:
```python
def test_strategy_crud(temp_db):
    sid = temp_db.create_strategy("Cluster 2+", {"min_cluster_owners": 2, "hold_days": 63})
    assert isinstance(sid, int)
    s = temp_db.get_strategy(sid)
    assert s["name"] == "Cluster 2+"
    assert s["rule"]["min_cluster_owners"] == 2     # rule_json round-trips to a dict
    assert s["active"] == 1
    assert any(x["id"] == sid for x in temp_db.list_strategies())
    temp_db.set_strategy_active(sid, False)
    assert temp_db.get_strategy(sid)["active"] == 0
    temp_db.delete_strategy(sid)
    assert temp_db.get_strategy(sid) is None


def test_strategy_positions(temp_db):
    sid = temp_db.create_strategy("X", {"hold_days": 10})
    temp_db.add_position(sid, {"ticker": "AAA", "opened_at": "2026-06-10",
                               "entry_price": 10.0, "shares": 100, "status": "open"})
    pos = temp_db.positions_for_strategy(sid)
    assert len(pos) == 1 and pos[0]["status"] == "open"
    temp_db.close_position(pos[0]["id"], exit_at="2026-06-20", exit_price=12.0, pnl=200.0)
    pos = temp_db.positions_for_strategy(sid)
    assert pos[0]["status"] == "closed" and pos[0]["pnl"] == 200.0
```

- [ ] **Step 2: run → fail** — `./.venv/bin/python -m pytest tests/test_db_strategies.py -v` → fail (no `create_strategy`).

- [ ] **Step 3: implement** — In `SCHEMA` (before `meta`):
```sql
CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY, name TEXT, rule_json TEXT, active INTEGER DEFAULT 1,
    created_at REAL, activated_at TEXT
);
CREATE TABLE IF NOT EXISTS strategy_positions (
    id INTEGER PRIMARY KEY, strategy_id INTEGER, ticker TEXT, opened_at TEXT,
    entry_price REAL, shares REAL, exit_at TEXT, exit_price REAL,
    status TEXT DEFAULT 'open', pnl REAL
);
```
End of `db.py`:
```python
def create_strategy(name, rule):
    now = time.time()
    with _lock:
        c = _connect()
        cur = c.execute(
            "INSERT INTO strategies(name,rule_json,active,created_at,activated_at) "
            "VALUES(?,?,1,?,?)",
            (name, json.dumps(rule), now, _dt_now_iso()))
        c.commit()
        return cur.lastrowid


def _dt_now_iso():
    import datetime as _d
    return _d.datetime.now(_d.timezone.utc).isoformat()


def _row_strategy(r):
    d = dict(r)
    try:
        d["rule"] = json.loads(d.pop("rule_json") or "{}")
    except Exception:
        d["rule"] = {}
    return d


def get_strategy(sid):
    with _lock:
        c = _connect()
        r = c.execute("SELECT * FROM strategies WHERE id=?", (int(sid),)).fetchone()
    return _row_strategy(r) if r else None


def list_strategies():
    with _lock:
        c = _connect()
        rows = c.execute("SELECT * FROM strategies ORDER BY created_at DESC").fetchall()
    return [_row_strategy(r) for r in rows]


def set_strategy_active(sid, active):
    with _lock:
        c = _connect()
        c.execute("UPDATE strategies SET active=? WHERE id=?",
                  (1 if active else 0, int(sid)))
        c.commit()


def delete_strategy(sid):
    with _lock:
        c = _connect()
        c.execute("DELETE FROM strategy_positions WHERE strategy_id=?", (int(sid),))
        c.execute("DELETE FROM strategies WHERE id=?", (int(sid),))
        c.commit()


def add_position(sid, pos):
    with _lock:
        c = _connect()
        c.execute(
            "INSERT INTO strategy_positions"
            "(strategy_id,ticker,opened_at,entry_price,shares,status) "
            "VALUES(?,?,?,?,?,?)",
            (int(sid), pos["ticker"], pos["opened_at"], pos["entry_price"],
             pos.get("shares", 0), pos.get("status", "open")))
        c.commit()


def positions_for_strategy(sid):
    with _lock:
        c = _connect()
        rows = c.execute("SELECT * FROM strategy_positions WHERE strategy_id=? "
                         "ORDER BY opened_at", (int(sid),)).fetchall()
    return [dict(r) for r in rows]


def open_positions(sid):
    return [p for p in positions_for_strategy(sid) if p["status"] == "open"]


def close_position(pid, exit_at, exit_price, pnl):
    with _lock:
        c = _connect()
        c.execute("UPDATE strategy_positions SET exit_at=?,exit_price=?,pnl=?,"
                  "status='closed' WHERE id=?",
                  (exit_at, exit_price, pnl, int(pid)))
        c.commit()
```
(Ensure `import json`/`import time` exist at top of db.py — they do.)

- [ ] **Step 4: run → pass** — `./.venv/bin/python -m pytest tests/test_db_strategies.py -v` → `2 passed`.
- [ ] **Step 5: commit** — `git add backend/db.py tests/test_db_strategies.py && git commit -m "feat: strategies + strategy_positions tables and CRUD" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

### Task 2: strategy rule → signals + backtest (TDD)

**Files:** Create `backend/strategy.py`, `tests/test_strategy.py`.

- [ ] **Step 1: failing tests** — `tests/test_strategy.py`:
```python
from backend import strategy


def _sig(ticker, date, ret):
    """A signal plus a synthetic 200-day flat-then-jump price series so a
    hold of H days yields a known return."""
    import datetime as dt
    base = 100.0
    d = dt.date.fromisoformat(date)
    candles = []
    for i in range(200):
        px = base if i < 5 else base * (1 + ret)   # jumps after day 5
        candles.append({"date": (d + dt.timedelta(days=i)).isoformat(),
                        "open": px, "high": px, "low": px, "close": px, "volume": 1})
    return {"ticker": ticker, "date": date}, candles


def test_passes_filters():
    trade = {"kind": "buy", "code": "P", "value": 200000, "roles": "Officer",
             "officer_title": "CEO"}
    assert strategy.passes({"min_value": 100000}, trade)
    assert not strategy.passes({"min_value": 500000}, trade)
    assert strategy.passes({"roles": "officer"}, trade)
    assert not strategy.passes({"roles": "director"}, trade)


def test_backtest_metrics_and_benchmark():
    s1, c1 = _sig("AAA", "2026-01-01", 0.10)   # +10% after 5 days
    s2, c2 = _sig("BBB", "2026-02-01", -0.05)  # -5%
    prices = {"AAA": c1, "BBB": c2}
    # SPY flat -> market-adjusted == raw
    import datetime as dt
    spy = [{"date": (dt.date(2026, 1, 1) + dt.timedelta(days=i)).isoformat(),
            "open": 50, "high": 50, "low": 50, "close": 50, "volume": 1}
           for i in range(400)]
    res = strategy.backtest([s1, s2], prices, spy, hold_days=10)
    assert res["n_trades"] == 2
    assert round(res["avg_return"], 4) == round((0.10 - 0.05) / 2, 4)
    assert res["win_rate"] == 0.5
    assert len(res["equity"]) >= 2          # equity curve points
    assert "benchmark" in res                # SPY comparison series present


def test_backtest_skips_signals_without_prices():
    s1, _ = _sig("AAA", "2026-01-01", 0.1)
    res = strategy.backtest([s1], {}, [], hold_days=10)  # no price data
    assert res["n_trades"] == 0
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement `strategy.py`:**
```python
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
            exit_px = forward_return  # noqa  (use close lookup below)
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
```

- [ ] **Step 4: run → pass** — `./.venv/bin/python -m pytest tests/test_strategy.py -v` → `3 passed`.
- [ ] **Step 5: commit** — `git add backend/strategy.py tests/test_strategy.py && git commit -m "feat: strategy rules, backtester, scoreboard advance" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

### Task 3: EDGAR backfill (bounded + resumable)

**Files:** Create `backend/backfill.py`, `tests/test_backfill.py`.

- [ ] **Step 1: failing test** (pure index parser) — `tests/test_backfill.py`:
```python
from backend import backfill

SAMPLE = """Description ...
Form Type   Company Name        CIK   Date Filed  File Name
---------------------------------------------------------------
4           Acme Inc            12345 2026-06-10  edgar/data/12345/0001.txt
4/A         Beta Co             222   2026-06-10  edgar/data/222/0002.txt
8-K         Gamma               333   2026-06-10  edgar/data/333/0003.txt
"""


def test_parse_form_index_keeps_only_form4():
    rows = backfill.parse_form_index(SAMPLE)
    assert len(rows) == 1                       # only the exact "4", not "4/A" or "8-K"
    assert rows[0]["cik"] == "12345"
    assert rows[0]["path"] == "edgar/data/12345/0001.txt"
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement `backfill.py`:**
```python
"""Bounded, resumable historical Form 4 backfill from SEC daily-index files.

Reads https://www.sec.gov/Archives/edgar/daily-index/{Y}/QTR{q}/form.{YYYYMMDD}.idx,
keeps exact "4" filings, and reuses the existing parser. Throttled via sec._get.
Resumable: stores the last completed date in meta; capped per run so it never
hammers SEC. Best-effort — missing days are skipped."""
import datetime as dt

from . import sec

DAILY = ("https://www.sec.gov/Archives/edgar/daily-index/"
         "{y}/QTR{q}/form.{ymd}.idx")


def parse_form_index(text):
    out = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[0] != "4":
            continue
        # form.idx is fixed-width; the last token is the path, first is "4",
        # the CIK is the token before the date (YYYY-MM-DD).
        path = parts[-1]
        date_i = next((i for i, p in enumerate(parts)
                       if len(p) == 10 and p[4] == "-" and p[7] == "-"), None)
        if date_i is None or date_i < 1:
            continue
        cik = parts[date_i - 1]
        if "edgar/data/" not in path:
            continue
        acc = path.rsplit("/", 1)[-1].replace(".txt", "")
        out.append({"cik": cik, "path": path, "accession": acc})
    return out


def _index_url(d):
    q = (d.month - 1) // 3 + 1
    return DAILY.format(y=d.year, q=q, ymd=d.strftime("%Y%m%d"))


def run(db, max_days=20, max_filings=400, log=print):
    """Walk backwards from the cursor (or today), one trading day at a time,
    pulling Form 4s. Returns a summary; stores progress in meta."""
    cursor = db.get_meta("backfill_cursor")
    start = (dt.date.fromisoformat(cursor) - dt.timedelta(days=1)) if cursor \
        else dt.date.today()
    inserted = processed = errors = days = 0
    d = start
    while days < max_days and processed < max_filings:
        if d.weekday() < 5:  # weekday
            try:
                raw = sec._get(_index_url(d)).decode("utf-8", "replace")
                entries = parse_form_index(raw)
                have = db.existing_accessions({e["accession"] for e in entries})
                for e in entries:
                    if processed >= max_filings:
                        break
                    if e["accession"] in have:
                        continue
                    try:
                        # reuse the per-filing fetch via a feed-style entry
                        base = e["path"].rsplit("/", 1)[0]
                        acc_dir = e["accession"].replace("-", "")
                        rows = sec.fetch_filing_rows({
                            "cik": e["cik"], "acc": acc_dir,
                            "accession": e["accession"], "filed_at": d.isoformat()})
                        if rows:
                            inserted += db.insert_trades(rows)
                        processed += 1
                    except Exception as ex:
                        errors += 1
                        log(f"[backfill] {e['accession']} failed: {ex}")
            except Exception as ex:
                log(f"[backfill] {d} index failed: {ex}")
            days += 1
        db.set_meta("backfill_cursor", d.isoformat())
        d -= dt.timedelta(days=1)
    summary = {"inserted": inserted, "processed": processed, "errors": errors,
               "days": days, "cursor": db.get_meta("backfill_cursor")}
    log(f"[backfill] {summary}")
    return summary
```
(Note: `sec.fetch_filing_rows` already resolves the ownership XML from cik/acc; the `acc` it expects is the no-dashes accession directory — provided above.)

- [ ] **Step 4: run → pass** — `./.venv/bin/python -m pytest tests/test_backfill.py -v` → `1 passed`.
- [ ] **Step 5: commit** — `git add backend/backfill.py tests/test_backfill.py && git commit -m "feat: bounded resumable EDGAR Form 4 backfill" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

### Task 4: Endpoints + background scoreboard/backfill

**Files:** Modify `backend/main.py`.

- [ ] **Step 1:** extend import: `from . import db, sec, market, holdings, detail, track_record, score, strategy, backfill`.
- [ ] **Step 2:** add endpoints after `api_recompute`:
```python
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
```
- [ ] **Step 3:** add helpers near `_recompute_ratings`:
```python
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
```
In `_worker`, call `_advance_scoreboards()` each loop iteration after `do_refresh(pages=1)`.
- [ ] **Step 4:** `./.venv/bin/python -c "import backend.main"` → ok; `./.venv/bin/python -m pytest -q` → pass.
- [ ] **Step 5:** commit `feat: strategy/backtest/backfill/scoreboard endpoints + background ticks`.

---

### Task 5: Frontend types + API

**Files:** Modify `frontend/src/lib/types.ts`, `api.ts`.

- [ ] **Step 1:** add types `StrategyRule` ({name?, min_value?, roles?, min_cluster_owners?, hold_days?, days?}), `BacktestResult` ({n_trades, win_rate, avg_return, avg_market_adjusted, total_return, benchmark_total_return, equity:{date,value}[], benchmark:{date,value}[], signals}), `Strategy` ({id, name, rule, active, activated_at}), `Scoreboard` ({strategy, positions, open, closed, realized_pnl, win_rate}).
- [ ] **Step 2:** add api methods: `strategies()`, `createStrategy(name, rule)`, `deleteStrategy(id)`, `setStrategyActive(id, active)`, `scoreboard(id)`, `backtest(rule, days?)`, `backfill(maxDays?)`, `backfillStatus()`. POST helpers use `fetch` with JSON body.
- [ ] **Step 3:** `npm run build` → ok. Commit `feat: strategy types + api client methods`.

(Add a small `postJSON` helper in `api.ts`:)
```ts
async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}
```

---

### Task 6: Strategy Lab page (frontend-design + agent-browser)

**Files:** Create `frontend/src/components/EquityChart.tsx`, `frontend/src/pages/Strategy.tsx`; modify `App.tsx` (route `/strategy`), `Layout.tsx` (nav link).

- [ ] **Step 1: `EquityChart.tsx`** — lightweight-charts `addLineSeries` for the strategy equity curve (mint) + benchmark (muted), x=date, y=value; matches PriceChart styling.
- [ ] **Step 2: `Strategy.tsx`** — match the app aesthetic. Sections:
  - **Rule builder:** name input; min cluster owners (1–4); min buy value; role contains (text); hold days (e.g. 21/63/126 quick picks). State in React.
  - **Backtest** button → `api.backtest(rule)`; show metrics (n_trades, win rate, avg return `signedPct`, total return vs benchmark) + `<EquityChart>`. Wrap in `Async`/loading.
  - **Save & activate** → `api.createStrategy(name, rule)`; list saved strategies (`api.strategies()`) with active toggle + delete + a per-strategy scoreboard summary (`api.scoreboard(id)`: open/closed/realized P&L/win rate).
  - **Build history** button → `api.backfill()`, polling `api.backfillStatus()`; show cursor/progress; explain it deepens backtests.
  - Footnote: backtest is a simplified sequential equal-bankroll model; not advice.
- [ ] **Step 3:** nav link "Strategy" + route.
- [ ] **Step 4: verify** — build; start server in background; agent-browser: build a rule (cluster ≥2, hold 63), run backtest → metrics + equity curve render; save it → appears in list with scoreboard; "Build history" starts and status updates. Screenshot `/tmp/strategy.png`. Kill server. (Backtest/scoreboard may be thin pre-backfill — acceptable.)
- [ ] **Step 5:** commit `feat: Strategy Lab page (rule builder, backtest, equity curve, scoreboard, backfill)`.

---

### Task 7: Final verification + docs
- [ ] **Step 1:** `./.venv/bin/python -m pytest -q`; `cd frontend && npx vitest run && npm run build` — all pass.
- [ ] **Step 2:** Update `CLAUDE.md` (strategy.py, backfill.py, new tables, endpoints, Strategy Lab page). Commit `docs: Phase 4 strategy (backtester, scoreboard, backfill)`.

---

## Self-review
**Spec coverage:** rule/backtest/scoreboard §6.5 → Tasks 1-2,4,6; backfill §6.7 → Tasks 3-4,6; tables §5 → Task 1; UI → Task 6. ✓
**Placeholders:** pure cores (CRUD, filters, backtest math, index parser) have complete tested code; I/O orchestration + endpoints complete; UI spec-driven against the locked design. Backtest labelled a simplification.
**Type/name consistency:** db `create_strategy/get_strategy/list_strategies/set_strategy_active/delete_strategy/add_position/positions_for_strategy/open_positions/close_position`; `strategy.passes/signals/backtest/run_backtest/advance_scoreboard`; `backfill.parse_form_index/run`; equity/benchmark series shape `{date,value}`; rule keys `min_value/roles/min_cluster_owners/hold_days/days`.
## Notes for Phase 5
- Surface scoreboard realized P&L on the Board; preset strategy templates; "my holdings" universe filter on backtests.
