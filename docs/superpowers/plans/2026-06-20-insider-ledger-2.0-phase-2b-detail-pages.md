# Insider Ledger 2.0 — Phase 2B (Stock & Insider Detail Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. For the visual page tasks, ALSO use the frontend-design skill and verify with agent-browser. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the stub `/stock/:ticker` and `/insider/:cik` routes into real pages — the Stock page shows a price chart with insider buy/sell markers, a quant panel, a net buy/sell summary, and the compiled insider history for that ticker; the Insider page shows that person's cross-company history, roles, and totals. Deep links survive a hard refresh.

**Architecture:** Frontend-only feature plus one small backend fix. The pages consume the existing `/api/stock/{ticker}` and `/api/insider/{cik}` endpoints (built in Phase 2A) via TanStack Query, reusing the existing `PriceChart` component and `format.ts` helpers, in the established Board aesthetic. A FastAPI catch-all serves `index.html` for client-side routes so refreshing `/stock/AAPL` works.

**Tech Stack:** existing — React+Vite+TS, Tailwind, TanStack Query, React Router, lightweight-charts (frontend); FastAPI (backend). Vitest + agent-browser for verification.

**Reference spec:** `docs/superpowers/specs/2026-06-19-insider-ledger-2.0-design.md` (§8 pages). **Builds on** Phase 2A (merged): `PriceChart`, `api.stock`, `StockDetail`/`Candle`/`Marker` types, `detail.insider_detail`, formatters.

---

## File structure for this phase

**Backend:**
- Modify `backend/main.py` — add a tested `resolve_static_path()` helper + a catch-all route so SPA deep links serve `index.html`; keep `/api/*` and real asset files working.
- Create `tests/test_static_routing.py`.

**Frontend:**
- Modify `frontend/src/lib/types.ts` — add `InsiderDetail`.
- Modify `frontend/src/lib/api.ts` — add `insider(cik)`.
- Create `frontend/src/components/QuantPanel.tsx` — fundamentals grid.
- Create `frontend/src/components/TradeTable.tsx` — reusable compiled-trade table (column set varies by context: a stock's history hides the ticker/company columns; an insider's history hides the owner column).
- Create `frontend/src/components/Async.tsx` — tiny loading / error / empty helper used by both pages.
- Rewrite `frontend/src/pages/Stock.tsx` and `frontend/src/pages/Insider.tsx` (replace the stubs).

**Conventions:** Python via `./.venv/bin/python`; node via `npm`/`npx` in `frontend/`. NO `timeout` — servers in background. Commits end with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Backend — SPA deep-link fallback (TDD)

The current mount (`StaticFiles(html=True)`) 404s on a hard refresh of `/stock/AAPL`. Add a catch-all that serves real files when they exist and `index.html` otherwise, with path-traversal safety. Extract the path resolution into a pure, testable helper.

**Files:**
- Modify: `backend/main.py`
- Create: `tests/test_static_routing.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_static_routing.py`:

```python
import os
from backend.main import resolve_static_path


def test_serves_real_file_when_present(tmp_path):
    dist = tmp_path
    (dist / "index.html").write_text("<div id='root'></div>")
    assets = dist / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)")
    got = resolve_static_path(str(dist), "assets/app.js")
    assert got == str(assets / "app.js")


def test_falls_back_to_index_for_client_routes(tmp_path):
    dist = tmp_path
    (dist / "index.html").write_text("<div id='root'></div>")
    # a client route like /stock/AAPL has no real file -> index.html
    assert resolve_static_path(str(dist), "stock/AAPL") == str(dist / "index.html")
    assert resolve_static_path(str(dist), "") == str(dist / "index.html")


def test_path_traversal_is_blocked(tmp_path):
    dist = tmp_path
    (dist / "index.html").write_text("x")
    # escaping the dist dir must fall back to index.html, never serve outside
    got = resolve_static_path(str(dist), "../../etc/passwd")
    assert got == str(dist / "index.html")
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_static_routing.py -v`
Expected: FAIL — `ImportError: cannot import name 'resolve_static_path'`.

- [ ] **Step 3: Implement the helper + route**

In `backend/main.py`, add this import near the top (with the other fastapi imports):

```python
from fastapi.responses import FileResponse
```

Add the helper above the static-mount block:

```python
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
```

Replace the existing static-mount block (the `if os.path.isdir(DIST_DIR): app.mount(...) else: ...` from Phase 2A) with:

```python
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
```

(The `/{full_path:path}` route is registered after all `/api/*` routes, so API routes still win.)

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_static_routing.py -v`
Expected: `3 passed`.

- [ ] **Step 5: Confirm import + full suite**

Run: `./.venv/bin/python -c "import backend.main; print('ok')"` → `ok`.
Run: `./.venv/bin/python -m pytest -q` → all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py tests/test_static_routing.py
git commit -m "feat: SPA deep-link fallback (serve index.html for client routes)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — `InsiderDetail` type + `api.insider`

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the type**

In `frontend/src/lib/types.ts`, append:

```ts
export interface InsiderDetail {
  owner_cik: string;
  owner_name: string | null;
  roles: string | null;
  tickers: string[];
  trades: Trade[];
  summary: { buys: number; sells: number; buy_value: number;
             sell_value: number; net_value: number };
}
```

- [ ] **Step 2: Add the API method**

In `frontend/src/lib/api.ts`, add the import of the type and a method. Change the import line to include `InsiderDetail`:

```ts
import type { Trade, Stats, Cluster, Status, StockDetail, InsiderDetail } from "./types";
```

Add inside the `api` object (after `stock`):

```ts
  insider: (cik: string) =>
    getJSON<InsiderDetail>(`/api/insider/${encodeURIComponent(cik)}`),
```

- [ ] **Step 3: Type-check via build**

Run: `cd ~/code/insider-tracker/frontend && npm run build`
Expected: build succeeds (types compile).

- [ ] **Step 4: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: InsiderDetail type + api.insider client method" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Shared components — `Async`, `QuantPanel`, `TradeTable`

Build with the **frontend-design** skill, matching the existing Board aesthetic (dark surfaces, Fraunces headings, IBM Plex Mono numerals, mint buys `#34d399` / coral sells `#fb7185` / gold accents, `border-border` rules). Reuse `format.ts` (`money`, `compactMoney`, `signedPct`, `shares`).

**Files:**
- Create: `frontend/src/components/Async.tsx`
- Create: `frontend/src/components/QuantPanel.tsx`
- Create: `frontend/src/components/TradeTable.tsx`

- [ ] **Step 1: `Async.tsx`** — a tiny helper for the two pages' fetch states. Contract:

```tsx
export function Async({ loading, error, empty, emptyText, children }: {
  loading: boolean; error: unknown; empty?: boolean; emptyText?: string;
  children: React.ReactNode;
}) {
  // loading -> a mono "Loading…" placeholder; error -> coral error line with
  // the message; empty -> muted emptyText; otherwise render children.
}
```
Implement it with those three states (mono text, consistent with the Board's muted styling).

- [ ] **Step 2: `QuantPanel.tsx`** — renders `StockDetail["fundamentals"]`. Show, as a compact labelled grid: Sector, Industry, Market cap (`compactMoney`), P/E, P/B, Dividend yield (as a %; the API value is a fraction, e.g. 0.005 → "0.5%"), 52-week range (`week52_low`–`week52_high`). When `fundamentals.available === false`, render a single muted "Quant data unavailable" line. Handle `null` fields with the `—` dash convention.

- [ ] **Step 3: `TradeTable.tsx`** — a compiled-trade table reused by both pages. Props:

```tsx
export function TradeTable({ trades, context }: {
  trades: Trade[];
  context: "stock" | "insider";
}) { /* ... */ }
```
Columns: KIND badge, then context-dependent identity column(s) — for `context==="insider"` show TICKER (link to `/stock/:ticker`) + COMPANY; for `context==="stock"` show INSIDER (owner_name, link to `/insider/:owner_cik`) — then VALUE (`compactMoney`, mint/coral by kind), SHARES (`shares`), DATE (`period.slice(5)`), and the `line_count>1` "Nx" gold badge. Use the same width-filling CSS-grid approach as the Board's `TradeRow` (flexible identity columns, right-aligned numerics) so there's no dead space.

- [ ] **Step 4: Build to type-check**

Run: `cd ~/code/insider-tracker/frontend && npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src/components/Async.tsx frontend/src/components/QuantPanel.tsx frontend/src/components/TradeTable.tsx
git commit -m "feat: Async, QuantPanel, TradeTable shared components" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Stock page (`/stock/:ticker`)

Build with **frontend-design**; verify with **agent-browser**. Match the Board aesthetic.

**Files:**
- Rewrite: `frontend/src/pages/Stock.tsx`

**Data contract:** `useParams()` → `ticker`; `useQuery(["stock", ticker], () => api.stock(ticker))`.

**Required elements (wrap fetch states in `Async`):**
- Header: ticker (large, Fraunces) + `fundamentals.name` (company), and a back link to `/`.
- Net summary: from `summary` — buys count + `compactMoney(buy_value)` (mint), sells count + `compactMoney(sell_value)` (coral), `compactMoney(net_value)`, and a coral "Insiders selling" flag when `summary.sell_alert`.
- `<PriceChart candles={prices.candles} markers={markers} />`. If `prices.available === false` or `candles` is empty, render a muted "Price data unavailable" panel instead of the chart.
- `<QuantPanel fundamentals={fundamentals} />`.
- "Insider activity" section: `<TradeTable trades={trades} context="stock" />` (empty → "No insider transactions recorded").

- [ ] **Step 1: Implement `Stock.tsx`** per the contract above.

- [ ] **Step 2: Build**

Run: `cd ~/code/insider-tracker/frontend && npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify with agent-browser**

Build is already done; start the server in the background:
```bash
cd ~/code/insider-tracker && lsof -ti tcp:8077 | xargs -r kill 2>/dev/null; PORT=8077 ./run.sh > /tmp/ledger-run.log 2>&1 &
until curl -sf http://localhost:8077/api/status >/dev/null 2>&1; do sleep 0.5; done
```
With agent-browser: open `http://localhost:8077/`, click a trade's ticker, confirm the Stock page renders a price chart WITH insider markers (arrows), the quant panel shows numbers, and the history table lists trades. Then open `http://localhost:8077/stock/RKLB` directly (hard refresh) and confirm it still loads (deep-link fallback). Screenshot to `/tmp/stock-page.png`. Kill the server.

- [ ] **Step 4: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src/pages/Stock.tsx
git commit -m "feat: Stock detail page (chart + markers + quant + history)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Insider page (`/insider/:cik`)

Build with **frontend-design**; verify with **agent-browser**.

**Files:**
- Rewrite: `frontend/src/pages/Insider.tsx`

**Data contract:** `useParams()` → `cik`; `useQuery(["insider", cik], () => api.insider(cik))`.

**Required elements (wrap in `Async`):**
- Header: `owner_name` (large) + `roles` (muted subtitle) + back link to `/`.
- Summary: buys/sells counts, `compactMoney` of buy/sell/net values.
- "Holds / traded" line: the `tickers` array as small links to `/stock/:ticker`.
- History: `<TradeTable trades={trades} context="insider" />` (empty → "No transactions recorded").

- [ ] **Step 1: Implement `Insider.tsx`** per the contract.

- [ ] **Step 2: Build**

Run: `cd ~/code/insider-tracker/frontend && npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify with agent-browser**

Start the server in the background (as in Task 4). Open the Board, click an insider name, confirm the Insider page shows their name/roles, summary, ticker links, and cross-company history; clicking a ticker there navigates to that Stock page. Hard-refresh an `/insider/<cik>` URL to confirm the deep-link fallback. Screenshot to `/tmp/insider-page.png`. Kill the server.

- [ ] **Step 4: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src/pages/Insider.tsx
git commit -m "feat: Insider detail page (cross-company history + roles + totals)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final Phase 2B verification + docs

- [ ] **Step 1: Backend + frontend suites + build**

Run: `cd ~/code/insider-tracker && ./.venv/bin/python -m pytest -q` (all pass).
Run: `cd frontend && npx vitest run && npm run build` (pass + build).

- [ ] **Step 2: End-to-end via agent-browser**

Start `./run.sh` (background), wait for `/api/status`, then verify the done-criteria: from the Board, clicking any trade opens the Stock chart with insider markers; the insider history is present; clicking an insider opens their page; hard refresh works on both `/stock/<T>` and `/insider/<cik>`. Stop the server.

- [ ] **Step 3: Update docs**

In `CLAUDE.md`, update the `frontend/` bullet: the Stock and Insider pages are now implemented (no longer stubs). Commit:
```bash
git add CLAUDE.md
git commit -m "docs: Stock + Insider pages implemented (Phase 2B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (Phase 2 done-criteria):**
- "clicking any trade opens the stock chart with insider markers + the insider's history" → Tasks 4 (Stock page: chart + markers + history) + the Board's existing links. ✓
- Per-insider information / trading history → Task 5. ✓
- Quant data on the stock page → Task 3 (QuantPanel) + Task 4. ✓
- Live charts → Task 4 (PriceChart with candles + markers). ✓
- Deep links / refresh work → Task 1. ✓

**Placeholder scan:** Backend Task 1 and the type/api Tasks 2 carry complete code. The visual component/page tasks (3–5) are spec-driven (data contract + required elements + frontend-design + agent-browser verification) because the design language is already locked by the merged Board — they extend it, not invent it. No vague "handle errors": error/loading/empty states are specified via the `Async` component.

**Type/name consistency:** `api.stock`/`api.insider`, types `StockDetail`/`InsiderDetail`/`Trade`/`Candle`/`Marker`, components `PriceChart`/`QuantPanel`/`TradeTable`/`Async`, formatters `money/compactMoney/signedPct/shares` referenced consistently. `TradeTable` context values `"stock"|"insider"` match their usages. `summary.sell_alert` exists on `StockDetail.summary` (from `db.insider_summary`); `InsiderDetail.summary` has no `sell_alert` (matches `detail.insider_detail`).

## Notes for later phases
- Phase 3 (intelligence) will add the insider track-record rating to the Insider page header and the Top Buys page.
- A future polish pass could add a quant-data background warmer so first visits to a Stock page aren't slow on the initial yfinance fetch.
