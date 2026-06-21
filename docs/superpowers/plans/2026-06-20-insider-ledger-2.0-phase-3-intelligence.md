# Insider Ledger 2.0 — Phase 3 (Intelligence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. For visual page tasks ALSO use frontend-design + agent-browser. Steps use checkbox (`- [ ]`).

**Goal:** Add a transparent **Top Buys** ranking, per-insider **track-record ("smart-money") ratings**, and a **Smart-Money leaderboard** — all explainable, all served over the API and shown in the UI.

**Architecture:** Two new pure-logic backend modules — `track_record.py` (forward, market-adjusted returns after each insider buy → a 0–100 rating per insider, small-sample-shrunk, cached in `insider_track`) and `score.py` (five 0–100 sub-scores → a weighted Top-Buys total with a visible breakdown). A background job computes ratings shortly after startup (and daily), reusing `market.get_prices`. New endpoints `/api/recommendations` and `/api/smart-money`; the insider rating is folded into `/api/insider`. Two new React pages (Top Buys, Smart Money) in the established aesthetic.

**Tech Stack:** existing (FastAPI/SQLite/yfinance; React+Vite+TS/Tailwind/TanStack Query/lightweight-charts). Vitest + agent-browser for verification.

**Reference spec:** `docs/superpowers/specs/2026-06-19-insider-ledger-2.0-design.md` §6.3 (track record), §6.4 (score), §6.8 (leaderboard). **Builds on** merged Phases 1–2.

**Known limitation (expected):** track records need price history at each buy date; with only ~10 days of accumulated trades, ratings are sparse until Phase 4's EDGAR backfill. The machinery is built now; it strengthens automatically as history grows. Top Buys still ranks on cluster + seniority + size + valuation meanwhile.

---

## File structure

**Backend:**
- Modify `backend/db.py` — `insider_track` table + helpers (`save_insider_track`, `get_insider_track`, `top_insider_tracks`); `distinct_buy_owners()` and `buys_for_owner()` helpers used by the rating job; a `recent_buy_tickers(days)` + reuse of `query_trades`/`clusters` for scoring.
- Create `backend/track_record.py` — pure return math + a `recompute(market, db)` orchestrator.
- Create `backend/score.py` — pure sub-score functions + a `top_buys(db, market)` assembler.
- Modify `backend/main.py` — `/api/recommendations`, `/api/smart-money`; fold rating into `/api/insider`; background thread to compute ratings after startup; `/api/recompute` manual trigger.
- Modify `backend/detail.py` — `insider_detail` includes the cached rating.
- Tests: `tests/test_track_record.py`, `tests/test_score.py`, extend `tests/test_db_*`.

**Frontend:**
- Modify `frontend/src/lib/types.ts` — `Recommendation`, `SmartMoneyEntry`, add `rating`/`track` to `InsiderDetail`.
- Modify `frontend/src/lib/api.ts` — `recommendations()`, `smartMoney()`.
- Create `frontend/src/components/ScoreBar.tsx` — a labelled 0–100 bar for sub-scores.
- Create `frontend/src/pages/TopBuys.tsx`, `frontend/src/pages/SmartMoney.tsx`.
- Modify `frontend/src/App.tsx` (routes), `frontend/src/components/Layout.tsx` (nav), `frontend/src/pages/Insider.tsx` (show rating).

**Conventions:** Python via `./.venv/bin/python`; node via `npm` in `frontend/`. NO `timeout`; servers in background. Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `insider_track` table + db helpers (TDD)

**Files:** Modify `backend/db.py`; Create `tests/test_db_insider_track.py`.

- [ ] **Step 1: Write the failing test**

`tests/test_db_insider_track.py`:
```python
def test_insider_track_round_trip_and_leaderboard(temp_db):
    temp_db.save_insider_track({
        "owner_cik": "1", "owner_name": "Jane", "n_buys": 8, "avg_ret_1m": 0.05,
        "avg_ret_3m": 0.12, "avg_ret_6m": 0.2, "win_rate": 0.75, "rating": 80,
        "sample_ok": 1})
    temp_db.save_insider_track({
        "owner_cik": "2", "owner_name": "Bob", "n_buys": 1, "avg_ret_1m": 0.0,
        "avg_ret_3m": -0.1, "avg_ret_6m": 0.0, "win_rate": 0.0, "rating": 35,
        "sample_ok": 0})
    one = temp_db.get_insider_track("1")
    assert one["rating"] == 80 and one["owner_name"] == "Jane"
    # leaderboard: sample_ok only, by rating desc
    board = temp_db.top_insider_tracks(limit=10, min_buys=3)
    assert [b["owner_cik"] for b in board] == ["1"]


def test_distinct_buy_owners_and_buys_for_owner(temp_db):
    temp_db.insert_trades([
        {"uid": "a:0", "accession": "a", "ticker": "AAPL", "kind": "buy",
         "period": "2026-01-10", "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "1", "owner_name": "Jane", "shares": 10, "price": 5,
         "value": 50, "filed_at": "2026-01-10", "source": "live"},
        {"uid": "b:0", "accession": "b", "ticker": "AAPL", "kind": "sell",
         "period": "2026-01-11", "code": "S", "ad": "D", "is_derivative": 0,
         "owner_cik": "1", "owner_name": "Jane", "shares": 1, "price": 5,
         "value": 5, "filed_at": "2026-01-11", "source": "live"},
    ])
    assert temp_db.distinct_buy_owners() == ["1"]
    buys = temp_db.buys_for_owner("1")
    assert len(buys) == 1 and buys[0]["ticker"] == "AAPL"  # only the buy
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_db_insider_track.py -v`
Expected: FAIL — `save_insider_track` missing.

- [ ] **Step 3: Implement**

In `backend/db.py` `SCHEMA`, before the `meta` table line, add:
```sql
CREATE TABLE IF NOT EXISTS insider_track (
    owner_cik TEXT PRIMARY KEY, owner_name TEXT, n_buys INTEGER,
    avg_ret_1m REAL, avg_ret_3m REAL, avg_ret_6m REAL, win_rate REAL,
    rating REAL, sample_ok INTEGER, computed_at REAL
);
```
At end of `backend/db.py` add:
```python
_TRACK_COLS = ["owner_cik", "owner_name", "n_buys", "avg_ret_1m", "avg_ret_3m",
               "avg_ret_6m", "win_rate", "rating", "sample_ok", "computed_at"]


def save_insider_track(rec):
    rec = {**rec, "computed_at": rec.get("computed_at") or time.time()}
    with _lock:
        c = _connect()
        c.execute(
            "INSERT OR REPLACE INTO insider_track "
            f"({','.join(_TRACK_COLS)}) VALUES ({','.join('?' for _ in _TRACK_COLS)})",
            [rec.get(k) for k in _TRACK_COLS],
        )
        c.commit()


def get_insider_track(owner_cik):
    with _lock:
        c = _connect()
        r = c.execute("SELECT * FROM insider_track WHERE owner_cik=?",
                      (str(owner_cik),)).fetchone()
    return dict(r) if r else None


def top_insider_tracks(limit=25, min_buys=3):
    with _lock:
        c = _connect()
        rows = c.execute(
            "SELECT * FROM insider_track WHERE sample_ok=1 AND n_buys>=? "
            "ORDER BY rating DESC LIMIT ?", (int(min_buys), int(limit))).fetchall()
    return [dict(r) for r in rows]


def distinct_buy_owners():
    with _lock:
        c = _connect()
        rows = c.execute(
            "SELECT DISTINCT owner_cik FROM trades WHERE kind='buy' AND owner_cik!=''"
        ).fetchall()
    return [r["owner_cik"] for r in rows]


def buys_for_owner(owner_cik):
    """Compiled open-market buys for one insider (for return scoring)."""
    with _lock:
        c = _connect()
        rows = [dict(r) for r in c.execute(
            "SELECT * FROM trades WHERE owner_cik=? AND kind='buy' "
            "ORDER BY filed_at", (str(owner_cik),)).fetchall()]
    return aggregate.compile_trades(rows)
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_db_insider_track.py -v`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/db.py tests/test_db_insider_track.py
git commit -m "feat: insider_track table + rating/leaderboard/buy helpers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `track_record.py` — return math + rating (TDD)

**Files:** Create `backend/track_record.py`, `tests/test_track_record.py`.

- [ ] **Step 1: Write the failing tests**

`tests/test_track_record.py`:
```python
from backend import track_record as tr


def _candles(prices, start="2026-01-01"):
    # prices: list of closes on consecutive days from start
    import datetime as dt
    d = dt.date.fromisoformat(start)
    out = []
    for p in prices:
        out.append({"date": d.isoformat(), "open": p, "high": p, "low": p,
                    "close": p, "volume": 1})
        d += dt.timedelta(days=1)
    return out


def test_forward_return_uses_close_on_or_after():
    candles = _candles([100, 101, 110])  # day0=100 ... day2=110
    # horizon 2 trading days from day0 -> 110/100 - 1 = 0.10
    assert round(tr.forward_return(candles, "2026-01-01", 2), 4) == 0.10
    # not enough future data -> None
    assert tr.forward_return(candles, "2026-01-01", 5) is None


def test_market_adjusted_subtracts_benchmark():
    stock = _candles([100, 100, 120])   # +20%
    spy = _candles([100, 100, 110])     # +10%
    assert round(tr.market_adjusted(stock, spy, "2026-01-01", 2), 4) == 0.10


def test_rating_shrinks_small_samples_toward_neutral():
    # one great trade should NOT yield a near-perfect rating
    high_n = tr.rating(avg_ret_3m=0.20, win_rate=0.8, n=20)
    low_n = tr.rating(avg_ret_3m=0.20, win_rate=0.8, n=1)
    assert 0 <= low_n <= 100 and 0 <= high_n <= 100
    assert high_n > low_n           # more samples -> stronger signal
    assert low_n < 75              # a single sample is heavily shrunk
    # a neutral/empty record sits near the middle
    assert 40 <= tr.rating(avg_ret_3m=0.0, win_rate=0.5, n=10) <= 60
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_track_record.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `track_record.py`**

```python
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
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_track_record.py -v`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/track_record.py tests/test_track_record.py
git commit -m "feat: insider track-record returns + shrunk rating" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `score.py` — Top Buys (TDD)

**Files:** Create `backend/score.py`, `tests/test_score.py`.

- [ ] **Step 1: Write the failing tests**

`tests/test_score.py`:
```python
from backend import score


def test_subscores_are_bounded_0_100():
    assert 0 <= score.cluster_score(1) <= 100
    assert score.cluster_score(4) > score.cluster_score(1)
    assert score.seniority_score(["CEO"]) > score.seniority_score(["Director"])
    assert score.size_score(1_000_000, 1_000_000_000) > score.size_score(1000, 1_000_000_000)
    assert score.valuation_score(12) > score.valuation_score(80)   # cheaper = higher
    assert score.valuation_score(None) == 50.0                      # unknown = neutral


def test_total_is_weighted_blend_and_bounded():
    subs = {"cluster": 80, "seniority": 100, "size": 60, "track": 70, "valuation": 50}
    t = score.total(subs)
    assert 0 <= t <= 100
    # heavier cluster/seniority should pull a high-cluster name up
    assert score.total({**subs, "cluster": 100, "seniority": 100}) > t


def test_top_buys_ranks_and_explains(temp_db, monkeypatch):
    from backend import market
    temp_db.insert_trades([
        {"uid": "a:0", "accession": "a", "ticker": "AAA", "kind": "buy",
         "period": "2026-06-15", "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "1", "owner_name": "CEO One", "roles": "Officer",
         "officer_title": "CEO", "shares": 1000, "price": 10, "value": 10000,
         "filed_at": "2026-06-15", "source": "live"},
        {"uid": "b:0", "accession": "b", "ticker": "AAA", "kind": "buy",
         "period": "2026-06-15", "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "2", "owner_name": "Dir Two", "roles": "Director",
         "shares": 500, "price": 10, "value": 5000,
         "filed_at": "2026-06-15", "source": "live"},
    ])
    monkeypatch.setattr(market, "get_fundamentals",
                        lambda t: {"ticker": t, "available": True,
                                   "market_cap": 1_000_000, "pe": 15})
    recs = score.top_buys(temp_db, market, days=30, limit=10)
    assert recs and recs[0]["ticker"] == "AAA"
    r = recs[0]
    assert r["owners"] == 2
    assert set(r["subscores"]) == {"cluster", "seniority", "size", "track", "valuation"}
    assert 0 <= r["score"] <= 100
    assert r["buy_value"] == 15000
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_score.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `score.py`**

```python
"""Top Buys — a transparent multi-factor ranking of recent open-market buying.

Five 0-100 sub-scores (cluster, seniority, size vs market cap, insider track
record, valuation) blended by fixed weights into a total, with the breakdown
returned so every pick shows *why* it ranks. Open-market buys (code P) only.
"""

WEIGHTS = {"cluster": 0.25, "seniority": 0.20, "size": 0.20,
           "track": 0.20, "valuation": 0.15}

_ROLE_WEIGHT = [
    (("ceo", "chief executive", "president", "cfo", "chief financial"), 100),
    (("officer", "chief"), 75),
    (("10%", "ten percent"), 65),
    (("director",), 50),
]


def cluster_score(owners):
    return min(100.0, 25.0 * max(1, owners))     # 1->25, 2->50, 3->75, 4+->100


def seniority_score(roles_or_titles):
    blob = " ".join(x for x in roles_or_titles if x).lower()
    best = 40
    for needles, w in _ROLE_WEIGHT:
        if any(n in blob for n in needles):
            best = max(best, w)
    return float(best)


def size_score(buy_value, market_cap):
    if not market_cap or market_cap <= 0 or not buy_value:
        return 30.0
    frac = buy_value / market_cap
    # 0.001% -> low, 0.1%+ -> high (log-ish bands)
    if frac >= 1e-3:
        return 100.0
    if frac >= 1e-4:
        return 80.0
    if frac >= 1e-5:
        return 60.0
    if frac >= 1e-6:
        return 40.0
    return 25.0


def valuation_score(pe):
    if pe is None:
        return 50.0
    if pe <= 0:
        return 45.0          # unprofitable: mild penalty, not informative
    if pe < 15:
        return 90.0
    if pe < 25:
        return 70.0
    if pe < 40:
        return 50.0
    if pe < 70:
        return 35.0
    return 20.0


def track_score(avg_rating):
    return float(avg_rating) if avg_rating is not None else 50.0


def total(subs):
    return round(sum(subs[k] * WEIGHTS[k] for k in WEIGHTS), 1)


def top_buys(db, market, days=30, limit=20):
    """Rank tickers by recent open-market buying. Returns explainable records."""
    buys = db.query_trades(kind="buy", days=days, compiled=True, limit=2000)
    by_ticker = {}
    for t in buys:
        if t.get("code") != "P" or not t.get("ticker"):
            continue
        g = by_ticker.setdefault(t["ticker"], {
            "ticker": t["ticker"], "issuer_name": t.get("issuer_name"),
            "owners": set(), "buy_value": 0.0, "roles": [], "trades": []})
        g["owners"].add(t.get("owner_cik"))
        g["buy_value"] += t.get("value") or 0
        g["roles"].append(t.get("officer_title") or "")
        g["roles"].append(t.get("roles") or "")
        g["trades"].append(t)

    out = []
    for tk, g in by_ticker.items():
        fund = market.get_fundamentals(tk)
        market_cap = fund.get("market_cap") if fund.get("available") else None
        pe = fund.get("pe") if fund.get("available") else None
        ratings = [db.get_insider_track(c)["rating"]
                   for c in g["owners"]
                   if c and db.get_insider_track(c)]
        avg_rating = (sum(ratings) / len(ratings)) if ratings else None
        subs = {
            "cluster": cluster_score(len(g["owners"])),
            "seniority": seniority_score(g["roles"]),
            "size": size_score(g["buy_value"], market_cap),
            "track": track_score(avg_rating),
            "valuation": valuation_score(pe),
        }
        out.append({
            "ticker": tk, "issuer_name": g["issuer_name"],
            "owners": len(g["owners"]), "buy_value": g["buy_value"],
            "market_cap": market_cap, "pe": pe,
            "subscores": subs, "score": total(subs),
            "trades": g["trades"],
        })
    out.sort(key=lambda r: r["score"], reverse=True)
    return out[:limit]
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_score.py -v`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/score.py tests/test_score.py
git commit -m "feat: Top Buys multi-factor explainable scoring" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Endpoints + rating in insider detail + background recompute

**Files:** Modify `backend/main.py`, `backend/detail.py`.

- [ ] **Step 1: Fold rating into `insider_detail`**

In `backend/detail.py`, add to the `insider_detail` return dict (before the closing brace, after `summary`):
```python
        "track": db.get_insider_track(owner_cik),
```

- [ ] **Step 2: Endpoints + recompute thread**

In `backend/main.py` change the import to add the new modules:
```python
from . import db, sec, market, holdings, detail, track_record, score
```
Add endpoints after `api_insider`:
```python
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
```
Add a recompute helper near `do_refresh`:
```python
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
```
In `_worker`, after the initial `do_refresh(pages=INITIAL_PAGES)`, kick a one-shot rating compute so it runs ~once after the first data load:
```python
def _worker():
    do_refresh(pages=INITIAL_PAGES)
    _recompute_ratings()
    while not _stop.wait(REFRESH_SECONDS):
        do_refresh(pages=1)
```

- [ ] **Step 3: Verify import + suite**

Run: `./.venv/bin/python -c "import backend.main; print('ok')"` → `ok`.
Run: `./.venv/bin/python -m pytest -q` → all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/detail.py
git commit -m "feat: /api/recommendations, /api/smart-money, rating in insider detail + background recompute" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Frontend types + API client

**Files:** Modify `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`.

- [ ] **Step 1: Add types**

In `types.ts` append:
```ts
export interface Recommendation {
  ticker: string; issuer_name: string | null; owners: number;
  buy_value: number; market_cap: number | null; pe: number | null;
  score: number;
  subscores: { cluster: number; seniority: number; size: number;
               track: number; valuation: number };
  trades: Trade[];
}
export interface InsiderTrack {
  owner_cik: string; owner_name: string | null; n_buys: number;
  avg_ret_1m: number | null; avg_ret_3m: number | null; avg_ret_6m: number | null;
  win_rate: number | null; rating: number; sample_ok: number;
}
```
And add `track?: InsiderTrack | null;` to the `InsiderDetail` interface.

- [ ] **Step 2: Add API methods**

In `api.ts`, extend the import to include `Recommendation, InsiderTrack`, and add to the `api` object:
```ts
  recommendations: (days = 30, limit = 20) =>
    getJSON<{ recommendations: Recommendation[] }>(`/api/recommendations?days=${days}&limit=${limit}`),
  smartMoney: (limit = 25, minBuys = 2) =>
    getJSON<{ insiders: InsiderTrack[] }>(`/api/smart-money?limit=${limit}&min_buys=${minBuys}`),
```

- [ ] **Step 3: Build** — `cd ~/code/insider-tracker/frontend && npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: Recommendation/InsiderTrack types + api methods" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Top Buys + Smart Money pages, nav, insider rating (frontend-design + agent-browser)

Match the Board aesthetic. Use `frontend-design`; verify with `agent-browser`.

**Files:** Create `frontend/src/components/ScoreBar.tsx`, `frontend/src/pages/TopBuys.tsx`, `frontend/src/pages/SmartMoney.tsx`; Modify `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/pages/Insider.tsx`.

- [ ] **Step 1: Routes + nav.** Add routes `/top-buys` → `TopBuys`, `/smart-money` → `SmartMoney` in `App.tsx`; add nav links in `Layout.tsx` (Board · Top Buys · Smart Money).

- [ ] **Step 2: `ScoreBar.tsx`** — a labelled horizontal 0–100 bar (mint fill scaled by value, value shown), used for the five sub-scores.

- [ ] **Step 3: `TopBuys.tsx`** — `useQuery(["recommendations"], () => api.recommendations())`, wrapped in `Async`. Render a ranked list; each card shows ticker (link to `/stock/:ticker`) + issuer, the big total `score`, `owners` count, `compactMoney(buy_value)`, and the five `ScoreBar`s for `subscores` (cluster/seniority/size/track/valuation). Make clear it's a transparent score, not advice (small footnote).

- [ ] **Step 4: `SmartMoney.tsx`** — `useQuery(["smart-money"], () => api.smartMoney())`, wrapped in `Async`. Table of insiders: name (link to `/insider/:owner_cik`), `rating` (prominent, mint), `n_buys`, `signedPct(avg_ret_3m*100)` if present, `signedPct(win_rate*100)`. Empty state explains ratings fill in as price history accumulates.

- [ ] **Step 5: Insider page rating** — in `Insider.tsx`, when `data.track` is present, show the rating prominently in the header (e.g., a "Smart-money rating NN/100" chip) with n_buys.

- [ ] **Step 6: Build + verify**

Build, then start the server in the background:
```bash
cd ~/code/insider-tracker && lsof -ti tcp:8077 | xargs -r kill 2>/dev/null
(cd frontend && npm run build) && PORT=8077 ./run.sh > /tmp/ledger-run.log 2>&1 &
until curl -sf http://localhost:8077/api/status >/dev/null 2>&1; do sleep 0.5; done
# trigger a rating compute so smart-money/insider ratings have data
curl -s -X POST http://localhost:8077/api/recompute >/dev/null
```
With agent-browser: confirm the nav shows Board · Top Buys · Smart Money; `/top-buys` renders ranked cards with score bars; `/smart-money` renders the leaderboard (may be sparse — that's expected); a Top Buys ticker links to its Stock page. Screenshot `/tmp/top-buys.png` and `/tmp/smart-money.png`. Kill the server.

- [ ] **Step 7: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src
git commit -m "feat: Top Buys + Smart Money pages, nav, insider rating chip" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Final verification + docs

- [ ] **Step 1:** `./.venv/bin/python -m pytest -q` (all pass); `cd frontend && npx vitest run && npm run build` (pass).
- [ ] **Step 2:** Update `CLAUDE.md`: add `track_record.py`, `score.py`, the new endpoints, and the Top Buys / Smart Money pages + the `insider_track` table. Commit `docs: Phase 3 intelligence (track records, Top Buys, Smart Money)`.

---

## Self-review

**Spec coverage:** track-record rating §6.3 → Tasks 1–2; Top Buys §6.4 → Task 3; leaderboard §6.8 → Tasks 1+6; endpoints + recompute → Task 4; UI → Task 6; insider rating surfaced → Tasks 4/6. ✓

**Placeholder scan:** pure-logic tasks (1–3) have complete tested code; endpoint task has complete code; UI tasks are spec-driven (data contract + required elements + frontend-design + agent-browser) consistent with the locked design language. No vague error handling — pages use `Async`.

**Type/name consistency:** `save_insider_track/get_insider_track/top_insider_tracks/distinct_buy_owners/buys_for_owner`; `track_record.forward_return/market_adjusted/rating/recompute`; `score.cluster_score/seniority_score/size_score/valuation_score/track_score/total/top_buys`; types `Recommendation/InsiderTrack` with subscore keys `cluster/seniority/size/track/valuation` matching backend. `_recompute_ratings` + `STATUS["rating_running"]` used consistently.

## Notes for later phases
- Phase 4 backfill dramatically increases the sample size behind every rating; `track_record.recompute` re-runs daily and after backfill.
- Phase 5 can add a "sort Top Buys by my-holdings only" toggle and surface the rating on Board rows.
