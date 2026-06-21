# Insider Ledger — project context

Personal-use tracker of **legal SEC Form 4 insider transactions** (corporate
insiders buying/selling their own company's shares). Built 2026-06-09.
Lives at `~/code/insider-tracker`. Owner: Omri (not a software engineer — keep
instructions copy-pasteable, no jargon).

## Run it
```
~/code/insider-tracker/run.sh           # self-bootstraps .venv, serves on :8077
```
Override port with `PORT=xxxx`. Stop with Ctrl+C.

## Architecture
- **`backend/sec.py`** — SEC EDGAR client, *standard library only* (urllib + xml).
  - `fetch_feed()` reads the `getcurrent&type=4` Atom feed (newest Form 4s,
    100/page, up to 4 pages). Each filing appears once per related party →
    dedupe by `accession`.
  - For each new filing: `index.json` → find the `<ownershipDocument>` XML →
    `parse_ownership()` extracts issuer, ticker, owner, roles, and each
    non-derivative + derivative transaction.
  - Throttled to ~6 req/sec with a descriptive User-Agent (SEC requires this).
  - `CODE_MAP` maps Form 4 transaction codes → (label, kind). Key kinds:
    `buy` (P), `sell` (S), `grant` (A), `option` (M/X/C), `tax` (F/D), `gift` (G).
- **`backend/db.py`** — SQLite (`data/insider.db`, WAL). One `trades` table,
  deduped by `uid = accession:index`. Provides `query_trades`, `stats`,
  `clusters`, `tickers`. Single module-level connection guarded by a lock.
- **`backend/sample.py`** — ~16 hand-built demo rows (source='sample') seeded on
  first launch so the UI is never blank; auto-deleted once live data arrives.
- **`backend/main.py`** — FastAPI. Background daemon thread does an initial
  4-page backfill (~80s, ~400 filings) then refreshes 1 page every
  `INSIDER_REFRESH_SECONDS` (default 300). Serves `/api/*` then mounts the
  built React app from `frontend/dist/` at `/` (503 with a "run ./run.sh"
  message if not built yet). `STATUS` dict drives the live indicator.
  `_load_dotenv()` loads `.env` (T212 key) at startup.
- **`backend/aggregate.py`** — pure `compile_trades(rows)` that collapses
  multiple Form 4 lines into one logical trade (volume-weighted price). Used by
  `db.query_trades(compiled=True)` and exposed via `/api/trades?compiled=`.
- **`backend/market.py`** — yfinance prices + fundamentals, cached in the
  `prices`/`fundamentals` tables. Network calls isolated for testing. Endpoints:
  `/api/prices/{ticker}`, `/api/fundamentals/{ticker}`, `/api/quote/{ticker}`.
- **`backend/holdings.py`** — read-only Trading 212 portfolio via
  `TRADING212_API_KEY` (from `.env`), cached in `holdings_cache`. US-equity
  positions get an insider summary + sell-alert. Endpoint: `/api/holdings`.
- **`backend/detail.py`** — `stock_detail(ticker)` / `insider_detail(cik)`
  assemblers (pure composition of `db` + `market`). Endpoints `/api/stock/{ticker}`
  (quant + price candles + insider markers + compiled history + net summary) and
  `/api/insider/{cik}` (cross-company history + roles + totals + cached `track`).
- **`backend/track_record.py`** — insider "smart-money" rating: forward,
  market-adjusted (vs SPY) returns after each open-market buy → a 0-100 rating
  shrunk toward neutral for small samples; `recompute(db, market)` caches into
  the `insider_track` table. A background thread runs it once after the initial
  refresh (and a `POST /api/recompute` triggers it manually).
- **`backend/score.py`** — Top Buys: five 0-100 sub-scores (cluster, seniority,
  size vs market cap, track record, valuation) blended by fixed weights into an
  explainable total. `top_buys(db, market)`. Endpoints `/api/recommendations`
  and `/api/smart-money` (leaderboard from `insider_track`).
- **`backend/strategy.py`** — rule `passes`/`signals`, a `backtest` (sequential
  equal-bankroll equity curve vs SPY), `run_backtest` glue, and
  `advance_scoreboard` (opens/closes paper positions for active strategies).
  Tables `strategies` + `strategy_positions`. Endpoints: `/api/strategies`
  (CRUD), `/api/strategies/{id}/scoreboard`, `/api/backtest`.
- **`backend/backfill.py`** — bounded, resumable historical Form 4 ingest from
  SEC daily-index files (`parse_form_index` keeps exact "4"; cursor in `meta`).
  Endpoints `/api/backfill` (POST) + `/api/backfill/status`. A background thread
  advances strategy scoreboards each refresh.
- **Tests:** backend `./.venv/bin/python -m pytest`; frontend `cd frontend &&
  npx vitest run`.
- **`frontend/`** — React + Vite + TypeScript SPA (Tailwind, TanStack Query,
  React Router, TradingView lightweight-charts). Source in `frontend/src/`
  (`lib/` = api client/types/formatters/chart transforms; `components/`;
  `pages/`), builds to `frontend/dist/`. `run.sh` runs `npm run build`; `dev.sh`
  runs vite + uvicorn with hot reload. Dark editorial-terminal aesthetic
  (Fraunces masthead, mono numbers, mint buys / coral sells / gold clusters).
  Phase 2A shipped the **Board** (compiled-trade ledger + stat strip + cluster
  sidebar + filters); Phase 2B shipped the **Stock page** (`/stock/:ticker` —
  price chart with insider markers, quant/fundamentals panel, insider history
  table) and the **Insider page** (`/insider/:cik` — cross-company history,
  roles, totals, ticker links, smart-money rating chip). Both support
  hard-refresh deep links. Phase 3 added the **Top Buys** page (`/top-buys` —
  ranked, explainable recommendations with sub-score bars) and the **Smart
  Money** page (`/smart-money` — insider track-record leaderboard). Phase 4
  added the **Strategy Lab** (`/strategy` — rule builder, backtest with an
  equity-vs-SPY curve, saved-strategy live scoreboards, and a "Build history"
  control for the EDGAR backfill).

## Signal logic worth knowing
- **Cluster buys** = a company where ≥2 distinct insiders (`owner_cik`) made
  *buys* in the last 14 days. This is the headline signal (gold panel).
- Open-market **buys (P)** are the meaningful conviction signal; grants/options
  are compensation and shown neutrally. Net selling is the normal baseline.

## Gotchas / notes
- SEC `getcurrent` only exposes the most recent ~400 filings — history is built
  by leaving the app running and accumulating into SQLite over time.
- Some filings have no parseable ownership XML (older/edge formats); these are
  skipped gracefully (`errors`/`processed` in the refresh summary).
- `value = shares × price`; grants/options often have price 0 → value shown as
  "—" and excluded from $ stats.
- No external Python deps beyond `fastapi` + `uvicorn[standard]` (see
  `requirements.txt`). SEC fetching uses only stdlib for resilience.
```
