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
  static `frontend/` at `/`. `STATUS` dict drives the live indicator.
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
- **`frontend/`** — vanilla HTML/CSS/JS dashboard. Dark editorial-terminal
  aesthetic: Fraunces serif masthead, IBM Plex Mono numbers, mint buys / coral
  sells / gold cluster signal. Polls `/api/status` every 15s and reloads when
  the backend's row count changes.

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
