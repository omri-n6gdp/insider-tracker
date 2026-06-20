# Insider Ledger 2.0 — Phase 2A (React Foundation + Board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For the visual Board task, ALSO use the frontend-design skill.

**Goal:** Replace the vanilla dashboard with a React + Vite + TypeScript app (still launched by `./run.sh`), shipping the live **Board** view on the new stack, plus the backend detail endpoints (`/api/stock/{ticker}`, `/api/insider/{cik}`) that Phase 2B's pages will consume.

**Architecture:** Keep the FastAPI backend; add two thin detail-assembler functions (`backend/detail.py`) that compose existing `db`/`market` calls, exposed as endpoints (TDD with mocked market). Build a Vite/React/TS frontend under `frontend/` that compiles to `frontend/dist`, which FastAPI serves; `run.sh` runs the build. The Board is built with the frontend-design skill, exploring two visual directions for the owner to choose from (per the owner's established preference).

**Tech Stack:** Python/FastAPI/SQLite (existing); yfinance (existing); React 18 + Vite + TypeScript + Tailwind CSS + TanStack Query + React Router + TradingView lightweight-charts; Vitest + Testing Library for frontend unit tests; agent-browser for visual verification.

**Reference spec:** `docs/superpowers/specs/2026-06-19-insider-ledger-2.0-design.md` (§4 stack, §6 detail-assembler intent, §8 pages, §9 Phase 2).

**Status of dependencies:** Phase 1 is merged to `main` (compiled trades, `market.py`, `holdings.py`, `/api/prices|fundamentals|quote|holdings`). Node v25 + npm are installed. The live DB has ~7,700 trades.

---

## File structure for this phase

**Backend (new/modified):**
- Create `backend/detail.py` — `stock_detail(ticker, ...)` and `insider_detail(owner_cik, ...)` assemblers; pure composition of `db` + `market`, no FastAPI imports. One responsibility: shape the per-stock / per-insider payloads.
- Modify `backend/db.py` — add `trades_for_owner(owner_cik, compiled=True)`.
- Modify `backend/main.py` — add `/api/stock/{ticker}` and `/api/insider/{cik}`; change the static mount to serve the built React app from `frontend/dist` (with a graceful message if not built yet).
- Create `tests/test_detail.py`, extend `tests/test_db_*` as noted.

**Frontend (new — replaces the vanilla files):**
- Remove `frontend/index.html`, `frontend/app.js`, `frontend/styles.css` (preserved in git history).
- Create the Vite app under `frontend/`: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `postcss.config.js`, `tailwind.config.js`, `src/main.tsx`, `src/index.css`, `src/App.tsx`.
- `src/lib/api.ts` — typed fetch client; `src/lib/types.ts` — shared types; `src/lib/format.ts` — pure formatters (tested).
- `src/lib/chart.ts` — pure transforms from API data to lightweight-charts series/markers (tested).
- `src/components/` — `Layout.tsx`, `PriceChart.tsx`, plus Board components.
- `src/pages/Board.tsx` (this phase). `Stock.tsx` / `Insider.tsx` are stubs this phase, fleshed out in Phase 2B.

**Build/run (modified):**
- Modify `run.sh` — build the frontend (npm ci/install + vite build) before starting uvicorn.
- Create `frontend/.gitignore` (node_modules, dist) — note root `.gitignore` already ignores `node_modules/` and `frontend/dist/`.
- Create `dev.sh` — runs vite dev + uvicorn together (developer convenience).

**Conventions:**
- All Python commands from project root via `./.venv/bin/python`. All node commands from `frontend/` via `npm`.
- Every commit ends with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer (shown in steps).
- The Mac has NO `timeout` command. Long-running servers must be started in the background.

---

## PART 1 — Backend detail endpoints (TDD)

### Task 1: `db.trades_for_owner`

**Files:**
- Modify: `backend/db.py`
- Create: `tests/test_db_trades_for_owner.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_db_trades_for_owner.py`:

```python
def _t(uid, owner, ticker, kind="buy", value=1000.0):
    return {
        "uid": uid, "accession": uid.split(":")[0], "ticker": ticker, "kind": kind,
        "period": "2026-06-10", "code": "P", "ad": "A", "is_derivative": 0,
        "owner_cik": owner, "owner_name": "Jane Insider", "roles": "Director",
        "shares": 100, "price": value / 100, "value": value, "shares_after": 100,
        "filed_at": "2026-06-10", "source": "live",
    }


def test_trades_for_owner_filters_and_compiles(temp_db):
    temp_db.insert_trades([
        _t("a:0", "111", "AAPL", value=1000.0),
        _t("a:1", "111", "AAPL", value=2000.0),   # same group -> compiles with a:0
        _t("b:0", "222", "MSFT", value=5000.0),    # different owner
    ])
    rows = temp_db.trades_for_owner("111")
    assert len(rows) == 1                  # two AAPL lines compiled into one
    assert rows[0]["ticker"] == "AAPL"
    assert rows[0]["value"] == 3000.0
    assert rows[0]["owner_cik"] == "111"


def test_trades_for_owner_empty_for_unknown(temp_db):
    assert temp_db.trades_for_owner("999") == []
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_db_trades_for_owner.py -v`
Expected: FAIL — `AttributeError: module 'backend.db' has no attribute 'trades_for_owner'`.

- [ ] **Step 3: Implement**

In `backend/db.py`, at the end of the file, add:

```python
def trades_for_owner(owner_cik, compiled=True):
    """All trades by one insider (owner_cik), newest first; compiled by default."""
    with _lock:
        c = _connect()
        rows = [dict(r) for r in c.execute(
            "SELECT * FROM trades WHERE owner_cik=? ORDER BY filed_at DESC, id DESC",
            (str(owner_cik),),
        ).fetchall()]
    if compiled:
        rows = aggregate.compile_trades(rows)
        rows.sort(key=lambda r: (r.get("filed_at") or ""), reverse=True)
    return rows
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_db_trades_for_owner.py -v`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/db.py tests/test_db_trades_for_owner.py
git commit -m "feat: db.trades_for_owner (compiled history for one insider)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `detail.stock_detail` + `detail.insider_detail`

**Files:**
- Create: `backend/detail.py`
- Create: `tests/test_detail.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_detail.py`:

```python
def _trade(uid, ticker, kind, value, owner="111", name="Jane Insider"):
    return {
        "uid": uid, "accession": uid.split(":")[0], "ticker": ticker, "kind": kind,
        "period": "2026-06-10", "code": "P" if kind == "buy" else "S", "ad": "A",
        "is_derivative": 0, "owner_cik": owner, "owner_name": name,
        "roles": "Director", "shares": 100, "price": value / 100, "value": value,
        "shares_after": 100, "filed_at": "2026-06-10", "source": "live",
    }


def test_stock_detail_assembles_payload(temp_db, monkeypatch):
    from backend import detail, market

    temp_db.insert_trades([
        _trade("a:0", "AAPL", "buy", 50_000),
        _trade("b:0", "AAPL", "sell", 10_000, owner="222", name="Bob Boss"),
    ])
    monkeypatch.setattr(market, "get_prices", lambda t, period="1y": {
        "ticker": t, "available": True,
        "candles": [{"date": "2026-06-10", "open": 1, "high": 2, "low": 1,
                     "close": 1.5, "volume": 10}]})
    monkeypatch.setattr(market, "get_fundamentals", lambda t: {
        "ticker": t, "available": True, "sector": "Technology", "pe": 30.0})

    d = detail.stock_detail("aapl", history_days=3650)
    assert d["ticker"] == "AAPL"
    assert d["fundamentals"]["sector"] == "Technology"
    assert len(d["prices"]["candles"]) == 1
    assert len(d["trades"]) == 2                       # buy + sell (distinct groups)
    assert len(d["markers"]) == 2                      # both have price>0 + a date
    assert {m["kind"] for m in d["markers"]} == {"buy", "sell"}
    assert d["summary"]["buys"] == 1 and d["summary"]["sells"] == 1


def test_stock_detail_markers_skip_unpriced(temp_db, monkeypatch):
    from backend import detail, market
    temp_db.insert_trades([_trade("a:0", "AAPL", "grant", 0)])  # kind grant, price 0
    monkeypatch.setattr(market, "get_prices", lambda t, period="1y": {
        "ticker": t, "available": False, "candles": []})
    monkeypatch.setattr(market, "get_fundamentals", lambda t: {
        "ticker": t, "available": False})
    d = detail.stock_detail("AAPL")
    assert d["markers"] == []                          # grant is not a buy/sell marker


def test_insider_detail_groups_history(temp_db):
    from backend import detail
    temp_db.insert_trades([
        _trade("a:0", "AAPL", "buy", 50_000),
        _trade("c:0", "MSFT", "buy", 20_000),
    ])
    d = detail.insider_detail("111")
    assert d["owner_cik"] == "111"
    assert d["owner_name"] == "Jane Insider"
    assert d["roles"] == "Director"
    assert len(d["trades"]) == 2
    assert d["summary"]["buys"] == 2
    assert sorted(d["tickers"]) == ["AAPL", "MSFT"]


def test_insider_detail_empty(temp_db):
    from backend import detail
    d = detail.insider_detail("999")
    assert d["trades"] == []
    assert d["owner_name"] is None
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/python -m pytest tests/test_detail.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.detail'`.

- [ ] **Step 3: Implement `detail.py`**

Create `backend/detail.py`:

```python
"""Assemble per-stock and per-insider detail payloads.

Pure composition of `db` + `market` (no FastAPI). The stock payload powers the
Stock page (price chart + insider markers + quant + history); the insider
payload powers the Insider page (cross-company history + roles + totals).
"""
from . import db, market


def _markers(trades):
    """Buy/sell trades with a real price + date, shaped for chart overlay."""
    out = []
    for t in trades:
        if t.get("kind") in ("buy", "sell") and (t.get("price") or 0) > 0 \
                and t.get("period"):
            out.append({
                "date": t["period"], "kind": t["kind"], "price": t["price"],
                "owner_name": t.get("owner_name"), "shares": t.get("shares"),
                "value": t.get("value"),
            })
    return out


def stock_detail(ticker, price_period="1y", history_days=90):
    sym = (ticker or "").upper()
    trades = db.query_trades(ticker=sym, compiled=True, limit=500)
    return {
        "ticker": sym,
        "fundamentals": market.get_fundamentals(sym),
        "prices": market.get_prices(sym, period=price_period),
        "trades": trades,
        "markers": _markers(trades),
        "summary": db.insider_summary(sym, days=history_days),
    }


def insider_detail(owner_cik, history_days=365):
    trades = db.trades_for_owner(owner_cik)
    first = trades[0] if trades else {}
    buys = sum(1 for t in trades if t.get("kind") == "buy")
    sells = sum(1 for t in trades if t.get("kind") == "sell")
    buy_v = sum((t.get("value") or 0) for t in trades if t.get("kind") == "buy")
    sell_v = sum((t.get("value") or 0) for t in trades if t.get("kind") == "sell")
    return {
        "owner_cik": str(owner_cik),
        "owner_name": first.get("owner_name"),
        "roles": first.get("roles"),
        "tickers": sorted({t["ticker"] for t in trades if t.get("ticker")}),
        "trades": trades,
        "summary": {"buys": buys, "sells": sells, "buy_value": buy_v,
                    "sell_value": sell_v, "net_value": buy_v - sell_v},
    }
```

- [ ] **Step 4: Run to verify passing**

Run: `./.venv/bin/python -m pytest tests/test_detail.py -v`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/detail.py tests/test_detail.py
git commit -m "feat: stock + insider detail assemblers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Detail endpoints in the API

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Import the detail module**

In `backend/main.py`, change `from . import db, sec, market, holdings` to:

```python
from . import db, sec, market, holdings, detail
```

- [ ] **Step 2: Add the endpoints**

In `backend/main.py`, immediately after the `api_holdings` function, add:

```python
@app.get("/api/stock/{ticker}")
def api_stock(ticker: str, period: str = "1y"):
    return detail.stock_detail(ticker, price_period=period)


@app.get("/api/insider/{cik}")
def api_insider(cik: str):
    return detail.insider_detail(cik)
```

- [ ] **Step 3: Verify import + a quick shape check**

Run: `./.venv/bin/python -c "import backend.main; print('ok')"`
Expected: `ok`.

Run the whole suite: `./.venv/bin/python -m pytest -q`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: /api/stock and /api/insider endpoints" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## PART 2 — React frontend foundation

### Task 4: Scaffold the Vite + React + TypeScript app

**Files:**
- Remove: `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/index.html`, `frontend/.gitignore`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`, `frontend/postcss.config.js`, `frontend/tailwind.config.js`

- [ ] **Step 1: Remove the old vanilla frontend**

Run:
```bash
cd ~/code/insider-tracker && git rm frontend/index.html frontend/app.js frontend/styles.css
```
Expected: the three files are staged for deletion (still in git history).

- [ ] **Step 2: Create `frontend/package.json`**

```json
{
  "name": "insider-ledger-frontend",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "lightweight-charts": "^4.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.9",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 3: Create config files**

`frontend/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build into ./dist (served by FastAPI). Dev server proxies /api to uvicorn.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8077" } },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/test-setup.ts" },
});
```

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`frontend/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

`frontend/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`frontend/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

`frontend/.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 4: Create the entry files**

`frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Insider Ledger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`frontend/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
```

`frontend/src/App.tsx` (temporary smoke content; replaced in Task 8):
```tsx
export default function App() {
  return <div className="p-8 text-2xl font-bold">Insider Ledger 2.0</div>;
}
```

`frontend/src/test-setup.ts`:
```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Install dependencies and build**

Run:
```bash
cd ~/code/insider-tracker/frontend && npm install
```
Expected: dependencies install (creates `node_modules`, `package-lock.json`).

Run:
```bash
cd ~/code/insider-tracker/frontend && npm run build
```
Expected: a `dist/` folder is produced with `index.html` + hashed assets, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts \
  frontend/tsconfig.json frontend/tsconfig.node.json frontend/index.html \
  frontend/.gitignore frontend/postcss.config.js frontend/tailwind.config.js \
  frontend/src/main.tsx frontend/src/App.tsx frontend/src/index.css frontend/src/test-setup.ts
git commit -m "feat: scaffold React+Vite+TS frontend (replaces vanilla)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Serve the built app from FastAPI + build in run.sh

**Files:**
- Modify: `backend/main.py` (static mount → `frontend/dist`)
- Modify: `run.sh`
- Create: `dev.sh`

- [ ] **Step 1: Point the static mount at the build output**

In `backend/main.py`, find the final mount line:
```python
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
```
Replace it with (serves the Vite build; clear message if not built yet):
```python
DIST_DIR = os.path.join(FRONTEND_DIR, "dist")
if os.path.isdir(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")
else:
    @app.get("/")
    def _needs_build():
        return JSONResponse(
            {"message": "Frontend not built yet. Run ./run.sh (it builds the app)."},
            status_code=503,
        )
```

- [ ] **Step 2: Verify backend still imports**

Run: `./.venv/bin/python -c "import backend.main; print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Add the frontend build to `run.sh`**

In `run.sh`, immediately after the `.venv` setup block (before the line that opens the browser), insert:

```bash
# Build the React frontend (first run installs deps; needs Node, already present).
if [ -f frontend/package.json ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "Node.js/npm not found. Install it once with:  brew install node"
    exit 1
  fi
  echo "Building the dashboard (first run installs packages, ~30s)…"
  ( cd frontend && { [ -d node_modules ] || npm install; } && npm run build )
fi
```

- [ ] **Step 4: Create `dev.sh` (developer convenience)**

`dev.sh`:
```bash
#!/usr/bin/env bash
# Dev mode: Vite dev server (hot reload) + uvicorn, side by side.
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8077}"
( cd frontend && npm run dev ) &
VITE_PID=$!
trap 'kill $VITE_PID 2>/dev/null' EXIT
exec ./.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port "$PORT" --reload
```
Then: `chmod +x dev.sh`.

- [ ] **Step 5: Full launch smoke test**

Start the server in the background (the build runs first):
```bash
cd ~/code/insider-tracker && PORT=8077 ./run.sh > /tmp/ledger-run.log 2>&1 &
```
Wait for readiness, then verify the SPA and an API route both serve:
```bash
for i in $(seq 1 120); do curl -sf http://localhost:8077/api/status >/dev/null 2>&1 && break; sleep 0.5; done
curl -s http://localhost:8077/ | grep -qi "<div id=\"root\"></div>" && echo "SPA served OK" || echo "SPA NOT served"
curl -s "http://localhost:8077/api/stock/AAPL?period=1mo" | head -c 120; echo
```
Expected: `SPA served OK`, and the stock route returns JSON with a `ticker` field. Then stop the server: `lsof -ti tcp:8077 | xargs kill`.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py run.sh dev.sh
git commit -m "feat: serve React build from FastAPI; build frontend in run.sh" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Typed API client, shared types, and formatters

**Files:**
- Create: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/format.ts`, `frontend/src/lib/format.test.ts`

- [ ] **Step 1: Write the failing formatter test**

`frontend/src/lib/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { money, compactMoney, signedPct, shares } from "./format";

describe("formatters", () => {
  it("formats money with no decimals", () => {
    expect(money(1234567)).toBe("$1,234,567");
    expect(money(null)).toBe("—");
  });
  it("compacts large money", () => {
    expect(compactMoney(2_500_000)).toBe("$2.5M");
    expect(compactMoney(3_000_000_000)).toBe("$3.0B");
    expect(compactMoney(0)).toBe("—");
  });
  it("formats signed percent", () => {
    expect(signedPct(12.3)).toBe("+12.3%");
    expect(signedPct(-4)).toBe("-4.0%");
  });
  it("formats share counts", () => {
    expect(shares(12345)).toBe("12,345");
    expect(shares(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/code/insider-tracker/frontend && npx vitest run src/lib/format.test.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Implement the formatters**

`frontend/src/lib/format.ts`:
```ts
export function money(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || v === 0) return "—";
  return "$" + Math.round(v).toLocaleString("en-US");
}

export function compactMoney(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || v === 0) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function signedPct(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function shares(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}
```

- [ ] **Step 4: Run to verify passing**

Run: `cd ~/code/insider-tracker/frontend && npx vitest run src/lib/format.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Add shared types and the API client**

`frontend/src/lib/types.ts`:
```ts
export interface Trade {
  uid: string;
  ticker: string;
  issuer_name: string;
  owner_name: string;
  owner_cik: string;
  roles: string;
  officer_title: string;
  code: string;
  action: string;
  kind: "buy" | "sell" | "grant" | "option" | "tax" | "gift" | "other";
  period: string;
  filed_at: string;
  shares: number | null;
  price: number | null;
  value: number | null;
  shares_after: number | null;
  is_derivative: number;
  line_count?: number;
  filing_url: string;
}

export interface Stats {
  days: number;
  buys_count: number; buys_value: number;
  sells_count: number; sells_value: number;
  net_value: number; total_count: number;
  top_buys: Trade[]; top_sells: Trade[];
  active: { ticker: string; issuer_name: string; n: number; buy_v: number; sell_v: number }[];
}

export interface Cluster {
  ticker: string; issuer_name: string; owners: number; trades: number;
  total_value: number; last_filed: string; names: string;
}

export interface Status {
  source: string; live_count: number; total_count: number;
  message: string; refreshing: boolean; last_success: string | null;
}

export interface Candle {
  date: string; open: number; high: number; low: number; close: number; volume: number;
}
export interface Marker {
  date: string; kind: "buy" | "sell"; price: number;
  owner_name: string; shares: number | null; value: number | null;
}
export interface StockDetail {
  ticker: string;
  fundamentals: Record<string, unknown> & { available: boolean };
  prices: { ticker: string; available: boolean; candles: Candle[] };
  trades: Trade[];
  markers: Marker[];
  summary: { buys: number; sells: number; buy_value: number; sell_value: number;
             net_value: number; sell_alert: boolean };
}
```

`frontend/src/lib/api.ts`:
```ts
import type { Trade, Stats, Cluster, Status, StockDetail } from "./types";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  status: () => getJSON<Status>("/api/status"),
  trades: (params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    return getJSON<{ count: number; trades: Trade[] }>(`/api/trades${q ? "?" + q : ""}`);
  },
  stats: (days = 7) => getJSON<Stats>(`/api/stats?days=${days}`),
  clusters: () => getJSON<{ clusters: Cluster[] }>("/api/clusters"),
  stock: (ticker: string, period = "1y") =>
    getJSON<StockDetail>(`/api/stock/${encodeURIComponent(ticker)}?period=${period}`),
};
```

- [ ] **Step 6: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/format.ts frontend/src/lib/format.test.ts
git commit -m "feat: typed API client, shared types, tested formatters" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Chart data transforms + PriceChart component

**Files:**
- Create: `frontend/src/lib/chart.ts`, `frontend/src/lib/chart.test.ts`, `frontend/src/components/PriceChart.tsx`

- [ ] **Step 1: Write the failing transform test**

`frontend/src/lib/chart.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toCandles, toMarkers } from "./chart";
import type { Candle, Marker } from "./types";

const candles: Candle[] = [
  { date: "2026-06-10", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
];
const markers: Marker[] = [
  { date: "2026-06-10", kind: "buy", price: 1.2, owner_name: "Jane", shares: 100, value: 120 },
  { date: "2026-06-11", kind: "sell", price: 1.8, owner_name: "Bob", shares: 50, value: 90 },
];

describe("chart transforms", () => {
  it("maps candles to lightweight-charts shape", () => {
    expect(toCandles(candles)).toEqual([
      { time: "2026-06-10", open: 1, high: 2, low: 0.5, close: 1.5 },
    ]);
  });
  it("maps insider trades to markers, sorted by time, colored by kind", () => {
    const m = toMarkers(markers);
    expect(m[0]).toMatchObject({ time: "2026-06-10", position: "belowBar", color: expect.any(String), text: "B" });
    expect(m[1]).toMatchObject({ time: "2026-06-11", position: "aboveBar", text: "S" });
    expect(m[0].time <= m[1].time).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/code/insider-tracker/frontend && npx vitest run src/lib/chart.test.ts`
Expected: FAIL — cannot resolve `./chart`.

- [ ] **Step 3: Implement transforms**

`frontend/src/lib/chart.ts`:
```ts
import type { Candle, Marker } from "./types";

export interface LWCandle { time: string; open: number; high: number; low: number; close: number; }
export interface LWMarker { time: string; position: "aboveBar" | "belowBar"; color: string; shape: string; text: string; }

const BUY = "#34d399";   // mint
const SELL = "#fb7185";  // coral

export function toCandles(candles: Candle[]): LWCandle[] {
  return candles.map((c) => ({
    time: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
  }));
}

export function toMarkers(markers: Marker[]): LWMarker[] {
  return markers
    .map((m) => ({
      time: m.date,
      position: m.kind === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
      color: m.kind === "buy" ? BUY : SELL,
      shape: m.kind === "buy" ? "arrowUp" : "arrowDown",
      text: m.kind === "buy" ? "B" : "S",
    }))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}
```

- [ ] **Step 4: Run to verify passing**

Run: `cd ~/code/insider-tracker/frontend && npx vitest run src/lib/chart.test.ts`
Expected: tests pass.

- [ ] **Step 5: Implement the PriceChart component**

`frontend/src/components/PriceChart.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { createChart, ColorType, type IChartApi } from "lightweight-charts";
import type { Candle, Marker } from "../lib/types";
import { toCandles, toMarkers } from "../lib/chart";

export function PriceChart({ candles, markers }: { candles: Candle[]; markers: Marker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#94a3b8" },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      rightPriceScale: { borderColor: "#1e293b" },
      timeScale: { borderColor: "#1e293b" },
    });
    chartRef.current = chart;
    const series = chart.addCandlestickSeries({
      upColor: "#34d399", downColor: "#fb7185",
      wickUpColor: "#34d399", wickDownColor: "#fb7185", borderVisible: false,
    });
    series.setData(toCandles(candles));
    series.setMarkers(toMarkers(markers));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, markers]);

  return <div ref={containerRef} className="h-[320px] w-full" />;
}
```

- [ ] **Step 6: Confirm the build still passes (catches type errors in the component)**

Run: `cd ~/code/insider-tracker/frontend && npm run build`
Expected: build succeeds (the chart component type-checks against lightweight-charts).

- [ ] **Step 7: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src/lib/chart.ts frontend/src/lib/chart.test.ts frontend/src/components/PriceChart.tsx
git commit -m "feat: chart transforms (tested) + PriceChart component" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## PART 3 — The Board (visual; use the frontend-design skill)

### Task 8: Layout shell, router, and the Board view (two design directions)

**REQUIRED SUB-SKILL for this task:** Use the **frontend-design** skill. Build **two distinct visual directions** for the Board and present screenshots so the owner picks one before polishing (the owner's established preference). Keep the spec's editorial-terminal flavour as a starting point but explore.

**Files:**
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/StatStrip.tsx`, `frontend/src/components/TradeRow.tsx`, `frontend/src/components/ClusterPanel.tsx`
- Modify: `frontend/src/App.tsx` (router + routes; Board as home; `Stock`/`Insider` stub routes)
- Create: `frontend/src/pages/Board.tsx`
- Create stub pages: `frontend/src/pages/Stock.tsx`, `frontend/src/pages/Insider.tsx`

**Data contract (must use these existing endpoints/fields):**
- `api.status()` → header live indicator + counts (`source`, `message`, `total_count`).
- `api.stats(7)` → stat strip: `buys_value`/`buys_count`, `sells_value`/`sells_count`, `net_value`, plus `active` list.
- `api.clusters()` → cluster panel: `ticker`, `issuer_name`, `owners`, `total_value`, `names`.
- `api.trades({ compiled: true, limit: 100 })` → main ledger feed; each `Trade` shows ticker, issuer_name, owner_name, roles, kind (mint buys / coral sells), `compactMoney(value)`, `shares()`, `period`. Show a small "Nx" badge when `line_count > 1`.

**Required behaviors:**
- Routes: `/` Board, `/stock/:ticker` (stub renders the ticker), `/insider/:cik` (stub renders the cik).
- Each trade's ticker links to `/stock/:ticker`; each owner name links to `/insider/:cik`. (Targets are stubs this phase; wired fully in Phase 2B.)
- A kind filter (All / Buys / Sells / Grants / Options) and a search box that drive `api.trades` params (`kind`, `q`).
- Data via TanStack Query hooks; the Board polls `status` every 15s and refetches trades when `total_count` changes.

- [ ] **Step 1: Build the layout shell + router**

Implement `Layout.tsx` (masthead with live dot + title + search slot + nav) and update `App.tsx`:
```tsx
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Board from "./pages/Board";
import Stock from "./pages/Stock";
import Insider from "./pages/Insider";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Board />} />
        <Route path="/stock/:ticker" element={<Stock />} />
        <Route path="/insider/:cik" element={<Insider />} />
      </Routes>
    </Layout>
  );
}
```
Create stub pages that read their route param:
```tsx
// src/pages/Stock.tsx
import { useParams } from "react-router-dom";
export default function Stock() {
  const { ticker } = useParams();
  return <div className="p-8">Stock page for {ticker} — coming in Phase 2B</div>;
}
```
```tsx
// src/pages/Insider.tsx
import { useParams } from "react-router-dom";
export default function Insider() {
  const { cik } = useParams();
  return <div className="p-8">Insider page for {cik} — coming in Phase 2B</div>;
}
```

- [ ] **Step 2: Build the Board** (StatStrip, ClusterPanel, TradeRow, Board page) using the frontend-design skill, honoring the data contract and required behaviors above. Produce **two visual directions**.

- [ ] **Step 3: Build and run for visual review**

Run: `cd ~/code/insider-tracker/frontend && npm run build` (must succeed, no TS errors).
Start the server in the background:
```bash
cd ~/code/insider-tracker && PORT=8077 ./run.sh > /tmp/ledger-run.log 2>&1 &
for i in $(seq 1 120); do curl -sf http://localhost:8077/api/status >/dev/null 2>&1 && break; sleep 0.5; done
```
Use the **agent-browser** skill to load `http://localhost:8077`, screenshot both directions, and verify: stat strip shows real numbers, the ledger lists compiled trades (with "Nx" badges where present), cluster panel renders, kind filter + search work, and a ticker link navigates to `/stock/<TICKER>` (stub).

- [ ] **Step 4: Present the two directions to the owner and get a pick.** Apply the chosen direction; remove the other.

- [ ] **Step 5: Commit**

```bash
cd ~/code/insider-tracker
git add frontend/src
git commit -m "feat: React Board view + layout/router (chosen design direction)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Final Phase 2A verification

- [ ] **Step 1: Backend suite**

Run: `cd ~/code/insider-tracker && ./.venv/bin/python -m pytest -q`
Expected: all backend tests pass.

- [ ] **Step 2: Frontend unit tests + build**

Run: `cd ~/code/insider-tracker/frontend && npx vitest run && npm run build`
Expected: all vitest tests pass; build succeeds.

- [ ] **Step 3: End-to-end via run.sh + agent-browser**

Start with `./run.sh` (background), wait for `/api/status`, then with agent-browser confirm the Board loads with live data, the kind filter + search work, and clicking a ticker / an insider navigates to the (stub) detail routes. Stop the server afterward.

- [ ] **Step 4: Update docs**

In `CLAUDE.md`, update the `frontend/` bullet to describe the React+Vite+TS app (built to `frontend/dist`, served by FastAPI, built by `run.sh`; `dev.sh` for hot-reload), and add `backend/detail.py` + the `/api/stock`, `/api/insider` endpoints to the Architecture list. Commit:
```bash
git add CLAUDE.md
git commit -m "docs: React frontend + detail endpoints (Phase 2A)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (Phase 2A scope):**
- React+Vite+TS rebuild served by run.sh → Tasks 4, 5. ✓
- Board view on the new stack (feed + stats + clusters + filters) → Task 8. ✓
- Two visual directions → pick one → Task 8 (frontend-design). ✓
- Price chart component + transforms (foundation for 2B's Stock page) → Task 7. ✓
- Backend detail endpoints `/api/stock`, `/api/insider` → Tasks 1–3. ✓
- Deferred to **Phase 2B** (correctly out of scope here): the full Stock page (chart + markers + quant + history rendered) and Insider page; navigation targets are stubs this phase.

**Placeholder scan:** No TBD/TODO. Deterministic tasks (1–7) carry complete code + exact commands. Task 8 is intentionally spec-driven (data contract + required behaviors + frontend-design skill) because it is creative UI with a user-choice gate — this is a deliberate, bounded exception, not a vague placeholder.

**Type/name consistency:** API methods (`api.status/trades/stats/clusters/stock`), types (`Trade`, `Stats`, `Cluster`, `Status`, `Candle`, `Marker`, `StockDetail`), transforms (`toCandles`, `toMarkers`), and formatters (`money`, `compactMoney`, `signedPct`, `shares`) are referenced consistently. Backend `detail.stock_detail`/`insider_detail` keys match `StockDetail`/the Board contract. `db.trades_for_owner` is used by `detail.insider_detail`.

---

## Notes for Phase 2B (next plan)
- Flesh out `src/pages/Stock.tsx` using `api.stock()` + `PriceChart` (candles + markers) + a quant panel (fundamentals) + the compiled insider history table + the net buy/sell summary.
- Flesh out `src/pages/Insider.tsx` using `/api/insider/{cik}` (cross-company history, roles, totals).
- Wire deep links fully and verify the done-criteria: "clicking any trade opens the stock chart with insider markers + the insider's history."
