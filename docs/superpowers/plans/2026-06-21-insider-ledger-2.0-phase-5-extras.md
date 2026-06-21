# Insider Ledger 2.0 — Phase 5 (Extras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Visual tasks ALSO use frontend-design + agent-browser. Steps `- [ ]`.

**Goal:** Finish the roadmap's extras: a **My Holdings** view (T212 positions × insider activity + sell-alerts), a **Sector heatmap**, a **Watchlist** (star tickers/insiders), a **Daily digest** (in-app + optional macOS notification), and **CSV export** of the ledger.

**Architecture:** Small additive features over existing data. New `watchlist` table + CRUD; a `db.sector_flow()` aggregate (join recent trades × cached `fundamentals`); a `digest.build()` composer (clusters + holdings sell-alerts + watchlist activity); CSV via a FastAPI `Response`. A once-per-day digest in the background worker fires an `osascript` macOS notification. Frontend: Holdings, Sectors, Watchlist, Digest pages + a star toggle + a CSV button, all in the established aesthetic.

**Tech Stack:** existing. macOS `osascript` for the notification (best-effort).

**Reference spec:** §6.6 (holdings), §6.8 (extras: sector heatmap, watchlist, daily digest, CSV). Holdings API (`/api/holdings`) already exists from Phase 1 — Phase 5 gives it a UI.

---

## File structure
**Backend:** Modify `backend/db.py` (watchlist table + CRUD; `sector_flow`; `watchlist_activity`). Create `backend/digest.py` (`build(db)`). Modify `backend/main.py` (endpoints + daily-notify in worker). Tests: `tests/test_db_watchlist.py`, `tests/test_db_sector_flow.py`, `tests/test_digest.py`.
**Frontend:** types + api; `pages/Holdings.tsx`, `pages/Sectors.tsx`, `pages/Watchlist.tsx`, `pages/Digest.tsx`; `components/StarButton.tsx`; CSV button on Board; nav + routes; star on Stock/Insider headers.
**Conventions:** Python `./.venv/bin/python`; node `npm` in `frontend/`. NO `timeout`. Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: watchlist table + CRUD (TDD)
**Files:** Modify `backend/db.py`; Create `tests/test_db_watchlist.py`.

- [ ] **Step 1: failing test** — `tests/test_db_watchlist.py`:
```python
def test_watchlist_crud(temp_db):
    temp_db.add_watch("ticker", "AAPL")
    temp_db.add_watch("ticker", "AAPL")            # idempotent
    temp_db.add_watch("insider", "12345")
    items = temp_db.list_watch()
    keys = {(w["kind"], w["key"]) for w in items}
    assert ("ticker", "AAPL") in keys and ("insider", "12345") in keys
    assert len(items) == 2                          # no duplicate AAPL
    assert temp_db.is_watched("ticker", "AAPL") is True
    temp_db.remove_watch("ticker", "AAPL")
    assert temp_db.is_watched("ticker", "AAPL") is False
```

- [ ] **Step 2: run → fail.**
- [ ] **Step 3: implement** — `SCHEMA` (before `meta`):
```sql
CREATE TABLE IF NOT EXISTS watchlist (
    kind TEXT, key TEXT, added_at REAL, PRIMARY KEY (kind, key)
);
```
End of `db.py`:
```python
def add_watch(kind, key):
    with _lock:
        c = _connect()
        c.execute("INSERT OR IGNORE INTO watchlist(kind,key,added_at) VALUES(?,?,?)",
                  (kind, str(key), time.time()))
        c.commit()


def remove_watch(kind, key):
    with _lock:
        c = _connect()
        c.execute("DELETE FROM watchlist WHERE kind=? AND key=?", (kind, str(key)))
        c.commit()


def list_watch():
    with _lock:
        c = _connect()
        rows = c.execute("SELECT * FROM watchlist ORDER BY added_at DESC").fetchall()
    return [dict(r) for r in rows]


def is_watched(kind, key):
    with _lock:
        c = _connect()
        r = c.execute("SELECT 1 FROM watchlist WHERE kind=? AND key=?",
                      (kind, str(key))).fetchone()
    return r is not None
```
- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** `feat: watchlist table + CRUD`.

---

### Task 2: sector flow + watchlist activity + digest (TDD)
**Files:** Modify `backend/db.py`; Create `backend/digest.py`, `tests/test_db_sector_flow.py`, `tests/test_digest.py`.

- [ ] **Step 1: failing tests** — `tests/test_db_sector_flow.py`:
```python
def _buy(uid, ticker, value):
    return {"uid": uid, "accession": uid.split(":")[0], "ticker": ticker,
            "kind": "buy", "period": "2026-06-18", "code": "P", "ad": "A",
            "is_derivative": 0, "owner_cik": uid, "shares": 1, "price": value,
            "value": value, "filed_at": "2026-06-18", "source": "live"}


def test_sector_flow_groups_by_cached_sector(temp_db):
    temp_db.insert_trades([_buy("1:0", "AAA", 1000), _buy("2:0", "BBB", 500)])
    temp_db.save_fundamentals("AAA", {"ticker": "AAA", "sector": "Tech"})
    temp_db.save_fundamentals("BBB", {"ticker": "BBB", "sector": "Tech"})
    rows = temp_db.sector_flow(days=3650)
    tech = next(r for r in rows if r["sector"] == "Tech")
    assert tech["buy_value"] == 1500
    # a ticker with no cached fundamentals is excluded
    temp_db.insert_trades([_buy("3:0", "CCC", 9999)])
    assert all(r["sector"] for r in temp_db.sector_flow(days=3650))
```
`tests/test_digest.py`:
```python
def test_digest_has_sections(temp_db, monkeypatch):
    from backend import digest, holdings
    temp_db.insert_trades([
        {"uid": "a:0", "accession": "a", "ticker": "AAA", "kind": "buy",
         "period": "2026-06-18", "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "1", "owner_name": "X", "shares": 1, "price": 1, "value": 1,
         "filed_at": "2026-06-18", "source": "live"},
        {"uid": "b:0", "accession": "b", "ticker": "AAA", "kind": "buy",
         "period": "2026-06-18", "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "2", "owner_name": "Y", "shares": 1, "price": 1, "value": 1,
         "filed_at": "2026-06-18", "source": "live"},
    ])
    temp_db.add_watch("ticker", "AAA")
    monkeypatch.setattr(holdings, "get_holdings",
                        lambda insider_days=30: {"source": "cache", "positions": []})
    d = digest.build(temp_db, holdings)
    assert "clusters" in d and "holdings_alerts" in d and "watchlist_activity" in d
    assert any(w["ticker"] == "AAA" for w in d["watchlist_activity"])
```

- [ ] **Step 2: run → fail.**
- [ ] **Step 3a: implement db helpers** (end of `db.py`):
```python
def sector_flow(days=30):
    """Net insider $ by sector, over tickers that have cached fundamentals."""
    with _lock:
        c = _connect()
        rows = c.execute(
            "SELECT f.sector sector, "
            "COALESCE(SUM(CASE WHEN t.kind='buy' THEN t.value ELSE 0 END),0) buy_value, "
            "COALESCE(SUM(CASE WHEN t.kind='sell' THEN t.value ELSE 0 END),0) sell_value, "
            "COUNT(DISTINCT t.ticker) tickers "
            "FROM trades t JOIN fundamentals f ON f.ticker=t.ticker "
            "WHERE f.sector IS NOT NULL AND f.sector!='' "
            "AND t.filed_at >= date('now', ?) "
            "GROUP BY f.sector ORDER BY buy_value DESC",
            (f"-{int(days)} days",)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["net_value"] = (d["buy_value"] or 0) - (d["sell_value"] or 0)
        out.append(d)
    return out


def watchlist_activity(days=14, limit=50):
    """Recent compiled trades for watched tickers + watched insiders."""
    watch = list_watch()
    tickers = [w["key"].upper() for w in watch if w["kind"] == "ticker"]
    owners = [w["key"] for w in watch if w["kind"] == "insider"]
    if not tickers and not owners:
        return []
    clauses, params = [], []
    if tickers:
        clauses.append(f"ticker IN ({','.join('?' for _ in tickers)})")
        params += tickers
    if owners:
        clauses.append(f"owner_cik IN ({','.join('?' for _ in owners)})")
        params += owners
    where = "(" + " OR ".join(clauses) + ")"
    params.append(f"-{int(days)} days")
    with _lock:
        c = _connect()
        rows = [dict(r) for r in c.execute(
            f"SELECT * FROM trades WHERE {where} AND filed_at >= date('now', ?) "
            "ORDER BY filed_at DESC", params).fetchall()]
    return aggregate.compile_trades(rows)[:limit]
```
- [ ] **Step 3b: implement `digest.py`:**
```python
"""Daily digest: the few things worth knowing today, composed from existing
data — fresh cluster buys, insider selling in your holdings, and activity in
anything you're watching."""


def build(db, holdings_mod, cluster_days=14, watch_days=14):
    clusters = db.clusters(days=cluster_days, min_owners=2)
    held = holdings_mod.get_holdings(insider_days=30)
    alerts = [p for p in held.get("positions", [])
              if p.get("is_us_equity") and (p.get("insider") or {}).get("sell_alert")]
    return {
        "clusters": clusters[:8],
        "holdings_alerts": alerts,
        "watchlist_activity": db.watchlist_activity(days=watch_days),
    }
```
- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** `feat: sector flow, watchlist activity, daily digest builder`.

---

### Task 3: endpoints + CSV + daily macOS notification
**Files:** Modify `backend/main.py`.

- [ ] **Step 1:** extend import to add `digest`: `from . import db, sec, market, holdings, detail, track_record, score, strategy, backfill, digest`. Add `from fastapi import Response` (alongside existing fastapi imports) and `import csv`, `import io`, `import subprocess` at the top.
- [ ] **Step 2:** endpoints after `api_backfill_status`:
```python
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
```
- [ ] **Step 3:** daily notification — add near `_recompute_ratings`:
```python
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
```
In `_worker`, call `_maybe_daily_digest()` once per loop (after `_advance_scoreboards()`).
- [ ] **Step 4:** `./.venv/bin/python -c "import backend.main"` → ok; `./.venv/bin/python -m pytest -q` → pass.
- [ ] **Step 5:** commit `feat: sectors/watchlist/digest/CSV endpoints + daily macOS notify`.

---

### Task 4: Frontend types + API
**Files:** Modify `frontend/src/lib/types.ts`, `api.ts`.

- [ ] **Step 1:** types: `SectorFlow` {sector, buy_value, sell_value, net_value, tickers}; `WatchItem` {kind: "ticker"|"insider", key, added_at}; `Holding` {ticker, raw_ticker, is_us_equity, qty, avg_price, current_price, ppl?, insider: {buys,sells,buy_value,sell_value,net_value,sell_alert}|null}; `HoldingsResp` {source, positions: Holding[]}; `Digest` {clusters: Cluster[], holdings_alerts: Holding[], watchlist_activity: Trade[]}.
- [ ] **Step 2:** api methods: `holdings()`, `sectors(days?)`, `watchlist()`, `addWatch(kind,key)`, `removeWatch(kind,key)` (DELETE with query string), `digest()`, and a helper `csvUrl(params)` returning the `/api/export.csv?…` string. Build → ok. Commit `feat: extras types + api methods`.

---

### Task 5: Extras pages + star + CSV (frontend-design + agent-browser)
Match the established aesthetic. **Files:** Create `frontend/src/components/StarButton.tsx`, `pages/Holdings.tsx`, `pages/Sectors.tsx`, `pages/Watchlist.tsx`, `pages/Digest.tsx`; modify `App.tsx` (routes), `Layout.tsx` (nav: add Holdings · Sectors · Watchlist · Digest — group sensibly, the nav is getting long so it's fine to keep concise labels), `pages/Board.tsx` (CSV export button using `api.csvUrl` honoring current kind/search), `pages/Stock.tsx` + `pages/Insider.tsx` (a `<StarButton kind=… key=…/>` in the header).

- [ ] **Step 1: `StarButton.tsx`** — reads watched state (accept `watched` + `onToggle` props, or self-fetch via `api.watchlist`); a star ☆/★ toggling `api.addWatch`/`removeWatch`; gold when active.
- [ ] **Step 2: `Holdings.tsx`** (`/holdings`) — `useQuery(["holdings"], api.holdings)`, `Async`. Table of positions: ticker (link to /stock/:ticker for US equities), qty, avg price, current price, P/L; for US equities show the insider summary (buys/sells, net) and a coral **SELL-ALERT** badge when `insider.sell_alert`; non-US rows marked "no insider data". A header note: only individual US stocks have insider data (ETFs don't).
- [ ] **Step 3: `Sectors.tsx`** (`/sectors`) — `useQuery(["sectors"], () => api.sectors(30))`, `Async`. A heatmap/bar view: each sector as a row/tile sized or coloured by `net_value` (mint positive / coral negative), showing buy/sell values + ticker count. Note it covers sectors with cached fundamentals.
- [ ] **Step 4: `Watchlist.tsx`** (`/watchlist`) — `useQuery(["watchlist"], api.watchlist)`, `Async`. Two sections: watched tickers + watched insiders (each with an unwatch ✕ linking to its page), and a "Recent activity" `TradeTable`-style list from `activity`. Empty state explains starring.
- [ ] **Step 5: `Digest.tsx`** (`/digest`) — `useQuery(["digest"], api.digest)`, `Async`. Three sections: fresh cluster buys, holdings sell-alerts, watchlist activity, each compact. Note it also fires a desktop notification once a day.
- [ ] **Step 6:** CSV button on Board — a small "Export CSV" link/button using `api.csvUrl({kind, q})` (anchor with `download`).
- [ ] **Step 7:** Star toggles in Stock (`kind="ticker" key={ticker}`) and Insider (`kind="insider" key={cik}`) headers.
- [ ] **Step 8:** routes + nav.
- [ ] **Step 9: verify** — build; start server background; agent-browser: nav reaches Holdings/Sectors/Watchlist/Digest; Holdings shows positions + any sell-alerts (set `TRADING212_API_KEY` is already in `.env`, so real positions load); Sectors renders; star a ticker on a Stock page → it appears on /watchlist; Board CSV button downloads. Screenshots `/tmp/holdings.png`, `/tmp/sectors.png`, `/tmp/watchlist.png`, `/tmp/digest.png`. Kill server. (Some sections may be sparse — OK.)
- [ ] **Step 10:** commit `feat: Holdings, Sectors, Watchlist, Digest pages + star + CSV export`.

---

### Task 6: Final verification + docs
- [ ] **Step 1:** `./.venv/bin/python -m pytest -q`; `cd frontend && npx vitest run && npm run build` — all pass.
- [ ] **Step 2:** Update `CLAUDE.md` (digest.py, new endpoints, new pages, watchlist table). Commit `docs: Phase 5 extras`.

---

## Self-review
**Spec coverage:** holdings UI §6.6 → Task 5; sector heatmap → Tasks 2-3,5; watchlist → Tasks 1,3,5; daily digest (+macOS notify) → Tasks 2-3,5; CSV export → Tasks 3,5. ✓
**Placeholders:** db/digest cores have complete tested code; endpoints complete; UI spec-driven against the locked design. macOS notify is best-effort (try/except).
**Type/name consistency:** db `add_watch/remove_watch/list_watch/is_watched/sector_flow/watchlist_activity`; `digest.build(db, holdings_mod)`; endpoints `/api/sectors|watchlist|digest|export.csv`; FE types `SectorFlow/WatchItem/Holding/HoldingsResp/Digest`; api `holdings/sectors/watchlist/addWatch/removeWatch/digest/csvUrl`.
## Notes
- After this, do the deferred final polish round (e.g., EquityChart duplicate-date dedupe; Strategy backtest `days` default to bound yfinance fetches; quant-data warmer).
