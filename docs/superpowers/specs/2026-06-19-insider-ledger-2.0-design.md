# Insider Ledger 2.0 — Design Spec

**Date:** 2026-06-19
**Project:** `~/code/insider-tracker`
**Owner:** Omri (not a software engineer — keep run instructions copy-pasteable, no jargon)
**Status:** Approved design, pre-implementation

---

## 1. Summary

Insider Ledger v1 is a personal tracker of legal SEC Form 4 insider transactions
(corporate insiders buying/selling their own company's shares): FastAPI + SQLite
backend, a background SEC EDGAR crawler, and a single vanilla-JS dashboard. It
currently holds ~7,700 real trades across ~1,000 tickers and ~3,000 insiders,
accumulated over ~10 days.

Version 2.0 turns it from a single live feed into a **decision tool**: live price
charts with insider markers, per-stock and per-insider deep-dive pages, company
quant data, an explainable "top buys" ranking, an insider track-record
("smart-money") system, a strategy lab with a backtester and a live scoreboard,
a Trading 212 holdings cross-reference, and supporting extras (sector heatmap,
watchlist, daily digest). The frontend is rebuilt as a React app.

**This is a personal, single-user, localhost-only app. Nothing here is financial
advice; the UI will say so.**

---

## 2. Goals

Deliver, in phases, every feature the owner requested plus four agreed extras:

Requested:
1. Live price charts for stocks.
2. Per-insider trading information.
3. Quant/fundamentals data for stocks.
4. A more intuitive UI (full React rebuild).
5. Trading history (per stock and per insider).
6. Overall top buy recommendations (balanced, explainable score).
7. Strategy tracking (live scoreboard across all stocks **and** a backtester).
8. Compile duplicate trades into one clean trade.
9. Filter / cross-reference against Trading 212 holdings.

Agreed extras:
10. Smart-money leaderboard (insiders ranked by past-buy performance).
11. Sell-alerts on stocks the owner holds.
12. Sector flow heatmap.
13. Watchlist + daily digest.

### Non-goals
- No multi-user, auth, or hosting beyond localhost.
- No execution/trading — read-only analysis.
- No paid data providers; free sources only (SEC EDGAR + yfinance).
- No email/SMS; notifications are in-app + optional native macOS notification.

---

## 3. Constraints & honest limitations

- **SEC "current" feed is shallow.** `getcurrent` exposes only ~400 most-recent
  filings, so the DB only has ~10 days of history so far. Real backtesting needs
  a **historical backfill** (Section 6.7) that crawls EDGAR's past daily Form 4
  indexes. This is a heavy one-time crawl, throttled to SEC's ~6 req/s limit.
- **Holdings overlap is thin.** The owner's Trading 212 positions are mostly
  UK-listed ETFs, which have no insiders. The holdings feature is therefore
  framed as the *flip side*: "are insiders buying/selling the individual **US
  stocks** I own?" plus sell-alerts. ETFs and non-US holdings are shown but
  marked "no insider data."
- **yfinance is best-effort.** It can rate-limit or fail. All market data is
  cached locally and the UI degrades gracefully ("price/quant unavailable")
  rather than breaking.
- **Ticker mismatches.** SEC, yfinance, and T212 spell some tickers differently
  (e.g., `BRK.B` vs `BRK-B`; T212 `AAPL_US_EQ`). A normalization layer handles
  the common cases.

---

## 4. Tech stack

### Backend (extend existing)
- **FastAPI + SQLite**, unchanged core. Single module-level connection guarded by
  a lock (as today).
- **SEC fetching stays standard-library** (urllib + xml) for resilience.
- **Add `yfinance`** (and its transitive deps: pandas, numpy, requests) for prices
  + fundamentals. Added to `requirements.txt`.
- New backend modules, each with one responsibility (Section 6).

### Frontend (full rebuild)
- **React + Vite + TypeScript**, **Tailwind CSS**, **shadcn/ui** components.
- **TradingView lightweight-charts** for price charts with insider markers; small
  inline sparklines for list rows.
- **React Router** for pages; **TanStack Query** for data fetching/polling/caching.
- Node v25 + npm are already installed on the owner's Mac — no new setup.
- Two visual directions for the shell will be built first; owner picks one before
  the rest of the UI is fleshed out (per the owner's established "build a few
  looks to choose from" preference).

### How the owner runs it (must stay one command)
- `./run.sh` continues to work exactly as before:
  1. ensures the Python `.venv` + deps (now incl. yfinance),
  2. on first run / when frontend changed: `npm install` (once) + `npm run build`,
  3. starts uvicorn serving the built React app + the `/api/*` JSON API on `:8077`.
- `run.sh` detects Node; if it were ever missing it prints a copy-paste Homebrew
  install line. A separate `dev.sh` runs `vite` + `uvicorn` concurrently for
  development (not needed by the owner).

---

## 5. Data model (new SQLite tables)

Existing `trades` and `meta` tables are unchanged. New tables:

- **`prices`** — daily OHLC cache.
  `ticker, date, open, high, low, close, volume` · PK `(ticker, date)`.
- **`fundamentals`** — per-ticker quant snapshot.
  `ticker PK, sector, industry, market_cap, pe, pb, dividend_yield,
  week52_low, week52_high, name, currency, json (raw subset), fetched_at`.
- **`insider_track`** — per-insider performance cache.
  `owner_cik PK, owner_name, n_buys, avg_ret_1m, avg_ret_3m, avg_ret_6m,
  win_rate, rating (0–100), sample_ok (bool), computed_at`.
- **`strategies`** — saved strategies for the live scoreboard.
  `id PK, name, rule_json, created_at, active (bool), activated_at`.
- **`strategy_positions`** — paper positions opened by a live strategy.
  `id PK, strategy_id, ticker, opened_at, entry_price, shares, exit_at,
  exit_price, status (open/closed), pnl`.
- **`watchlist`** — `id PK, kind (ticker|insider), key, added_at`.
- **`holdings_cache`** — last-known T212 positions.
  `ticker, raw_ticker, qty, avg_price, currency, is_us_equity, fetched_at`.

All new tables created idempotently in `db.init_db()`. Market caches have a
`fetched_at` used for TTL (default: refresh once/day).

---

## 6. Backend modules & responsibilities

Each module is small and independently testable. Network calls are isolated so
they can be mocked in tests.

### 6.1 `aggregate.py` — compile duplicate trades
A single Form 4 often lists several transaction lines (e.g., multiple sells at
different prices the same day). Compile into one logical trade.

- **Group key:** `(owner_cik, ticker, kind, transaction_date, code, is_derivative)`.
- **Aggregation:** `shares = sum(shares)`; `value = sum(value where price>0)`;
  `price = value / shares` over priced lines (volume-weighted avg); keep
  `line_count`, list of contributing accessions, a representative `filing_url`,
  and `shares_after` from the latest line.
- **Delivery:** implemented as a read-side `query_trades(compiled=True)` GROUP BY
  in `db.py` (no extra storage; always fresh). `/api/trades` gains a
  `compiled` flag (default true). UI exposes a "show raw lines" toggle.

### 6.2 `market.py` — prices + quant (yfinance) with caching
- `get_prices(ticker, period="1y") -> list[OHLC]` — daily candles; reads `prices`
  cache, fetches+stores misses, respects TTL.
- `get_quote(ticker) -> {price, change, change_pct}`.
- `get_fundamentals(ticker) -> dict` — sector, industry, market_cap, pe, pb,
  dividend_yield, 52-wk range, name; cached in `fundamentals`.
- Ticker normalization (`BRK.B`→`BRK-B`, etc.). US tickers only.
- Lazy fetch on demand; a low-priority background warmer pre-fetches the recent
  buy universe. Graceful failure → cached/empty + `available: false`.

### 6.3 `track_record.py` — insider "smart-money" rating
- For each open-market buy (code `P`) with a price+date, compute **forward
  market-adjusted returns** at ~21/63/126 trading days using `prices` and an
  SPY benchmark: `ret = close[t+n]/buy_price - 1`, minus SPY's same-window return.
- Per insider: averages, win rate, and a **rating 0–100** (sigmoid of the
  3-month market-adjusted average, **shrunk toward neutral for small samples**;
  `sample_ok` flags insiders with enough buys to trust). Cached in
  `insider_track`, recomputed after price refresh / backfill.
- Depends on price history → most meaningful after backfill.

### 6.4 `score.py` — Top Buys (balanced, explainable)
- **Candidates:** tickers with open-market buys in a window (default 30d).
- **Five 0–100 sub-scores:** Cluster (distinct insiders buying), Seniority
  (CEO/CFO/Pres > other officer > 10% owner > director), Size (total buy $ vs
  market cap), Track record (avg rating of the buying insiders), Valuation
  (sector-relative P/E, bounded).
- **Total** = weighted sum (default weights: cluster .25, seniority .20, size .20,
  track .20, valuation .15; weights centralized + tweakable).
- Output: ranked list, **each pick exposing its sub-score breakdown** and the
  supporting trades. Sells/grants/options excluded.

### 6.5 `strategy.py` — strategy lab, backtester, live scoreboard
- **Rule schema (JSON):** filters (`kind=buy`, `min_value`, `roles`,
  `min_cluster_owners`, `first_time_only`, `sector`, `universe=all|holdings`),
  entry (on signal), exit (`hold_days` | `stop`/`target` | end-of-data).
- **Backtest:** replay historical signals (needs backfilled history), simulate
  equal-weight paper positions, mark-to-market via `prices`; report equity curve,
  total return, CAGR, win rate, avg trade return, max drawdown, **vs S&P 500**.
- **Live scoreboard:** persist active strategies; a background job opens/closes
  paper positions on new signals **forward from activation**, tracks running P&L
  across the whole universe, recomputed on price refresh.
- **Presets:** "Cluster buys (2+)", "CEO/CFO buys > $250k", "First-time buyer",
  "High-rating insiders".

### 6.6 `holdings.py` — Trading 212 cross-reference
- Pull positions via the **read-only T212 API** using `TRADING212_API_KEY`
  (same key as the owner's other dashboard; read from env / `.env`). Cache in
  `holdings_cache`.
- Parse T212 instrument tickers (e.g., `AAPL_US_EQ` → `AAPL`, flag US equity).
- For each US-equity holding, attach insider summary (recent buys/sells, net) and
  a **sell-alert** flag (insiders net-selling over last N days). Non-US / ETF
  holdings shown but marked "no insider data."

### 6.7 `backfill.py` — EDGAR historical crawl
- Crawl EDGAR's **daily index** archives for Form 4 filings over a configurable
  window (**default 6 months**). Throttled to ~6 req/s, descriptive User-Agent,
  **resumable**, dedupe by `accession` (reuses v1's `parse_ownership`).
- Triggered by a "Build history" button → runs in background with progress.
  Status surfaced via API. This unlocks meaningful backtesting + track records.

### 6.8 Extras
- **Smart-money leaderboard:** top insiders from `insider_track` (rating, min
  sample), with their notable recent buys.
- **Sector heatmap:** net buy value by `fundamentals.sector` over a window.
- **Watchlist:** star tickers/insiders (`watchlist` table).
- **Daily digest:** once/day summary (new clusters, top buys, watchlist activity,
  holdings sell-alerts); shown in-app; optional native macOS notification via
  `osascript -e 'display notification ...'` from the daily background job.
- **CSV export:** `/api/export.csv` for the current filtered/compiled view.

---

## 7. API surface (additions)

Existing: `/api/status`, `/api/trades`, `/api/stats`, `/api/clusters`,
`/api/tickers`, `/api/refresh`.

New / changed:
- `GET /api/trades?compiled=true&…` — compiled flag added.
- `GET /api/stock/{ticker}` — quant + price series + insider markers + full
  insider history + net buy/sell summary.
- `GET /api/prices/{ticker}?period=1y`
- `GET /api/insider/{owner_cik}` — profile, trades, track record.
- `GET /api/recommendations` — top buys with sub-score breakdown.
- `GET /api/smart-money` — leaderboard.
- `GET /api/sectors` — heatmap data.
- `GET /api/holdings` — positions + insider cross-ref + sell-alerts.
- `GET/POST/DELETE /api/strategies`, `POST /api/strategies/{id}/backtest`,
  `GET /api/strategies/{id}/scoreboard`, `POST /api/backtest` (ad-hoc).
- `POST /api/backfill`, `GET /api/backfill/status`.
- `GET/POST/DELETE /api/watchlist`.
- `GET /api/digest`.
- `GET /api/export.csv`.

---

## 8. Frontend pages

React app under `frontend/` (replaces the static one), built to `frontend/dist`
and served by FastAPI. Routes:

- `/` **Board** — live feed with compiled trades (raw-lines toggle), stat strip,
  cluster signal, ticker tape.
- `/top-buys` **Top Buys** — ranked recommendations with score breakdown.
- `/stock/:ticker` **Stock** — price chart + insider buy/sell markers, quant
  panel, full insider history, net buy/sell summary.
- `/insider/:cik` **Insider** — track-record rating, all trades, companies, roles.
- `/smart-money` **Smart Money** — insider leaderboard.
- `/strategy` + `/strategy/:id` **Strategy Lab** — build rule → backtest → add to
  live scoreboard.
- `/holdings` **My Holdings** — T212 positions × insider activity + sell-alerts.
- `/sectors` **Sectors** — insider-flow heatmap.
- `/watchlist` + `/digest` — starred items + daily digest.

Shared: API client + TanStack Query hooks, app layout/nav, theme, `PriceChart`
(lightweight-charts), sparkline, score-breakdown component. A small "not
financial advice" disclaimer in the footer.

---

## 9. Phasing (each phase ships something usable)

**Phase 1 — Foundations**
Compiled/clean trades end-to-end (`aggregate.py` + `compiled` flag); `market.py`
price+quant cache; `holdings.py` pulling T212 positions.
*Done when:* the API serves compiled trades, prices/quant for a ticker, and the
owner's holdings.

**Phase 2 — New UI + detail pages**
React app scaffold (2 visual directions → pick one), Board, Stock page (chart +
markers + quant + history), Insider page (history). `run.sh` builds + serves it.
*Done when:* clicking any trade opens the stock chart with insider markers and
the insider's history.

**Phase 3 — Intelligence**
`track_record.py` + `score.py`; Top Buys page (explainable) and Smart-Money
leaderboard.
*Done when:* a ranked, explainable buys list and per-insider ratings render.

**Phase 4 — Strategy**
`backfill.py` (history crawl) + `strategy.py` (backtester + live scoreboard);
Strategy Lab page.
*Done when:* the owner can build a rule, backtest it against backfilled history,
and watch it track live.

**Phase 5 — Extras & polish**
Holdings sell-alerts, sector heatmap, watchlist, daily digest (+ macOS
notification), CSV export, responsive polish, disclaimer.
*Done when:* all four extras work and the UI is polished on desktop.

---

## 10. Testing

- **TDD** for backend logic (per superpowers): `aggregate` (compiled math:
  weighted-avg price, grouping), `score` (sub-scores + weighting), `track_record`
  (forward/market-adjusted returns, small-sample shrinkage), `strategy`
  (backtest metrics on synthetic price+trade fixtures), `holdings` (T212 ticker
  parsing/normalization). Network (SEC/yfinance/T212) mocked.
- **Frontend:** light component smoke tests where useful; primary verification is
  manual via agent-browser (load each page, confirm charts/markers/scores render).
- Verify before claiming done (per superpowers verification rules).

---

## 11. Decisions already made

- Build **all features, in phases**.
- T212 holdings via **reuse of the existing read-only API key**.
- Strategy = **live scoreboard across all stocks + a backtester**.
- Top buys = **balanced, explainable** five-factor score.
- UI = **full React rebuild** (Node already installed).
- Backfill default window = **6 months** (configurable).
- Digest = **in-app + optional native macOS notification** (no email).
- Charting = **TradingView lightweight-charts**.

## 12. Open questions (resolve during implementation, not blocking)

- Exact scoring weights/thresholds — start with defaults above, tune after seeing
  real output.
- Backfill window may be extended past 6 months if the crawl proves fast enough.
- Whether to persist computed track-records vs recompute — start cached.
