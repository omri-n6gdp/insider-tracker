import type { Trade, Stats, Cluster, Status, StockDetail, InsiderDetail, Recommendation, InsiderTrack, StrategyRule, BacktestResult, Strategy, Scoreboard, SectorFlow, WatchItem, HoldingsResp, Digest } from "./types";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function deleteJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
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
  insider: (cik: string) =>
    getJSON<InsiderDetail>(`/api/insider/${encodeURIComponent(cik)}`),
  recommendations: (days = 30, limit = 20) =>
    getJSON<{ recommendations: Recommendation[] }>(`/api/recommendations?days=${days}&limit=${limit}`),
  smartMoney: (limit = 25, minBuys = 2) =>
    getJSON<{ insiders: InsiderTrack[] }>(`/api/smart-money?limit=${limit}&min_buys=${minBuys}`),
  // Strategy Lab
  strategies: () => getJSON<{ strategies: Strategy[] }>("/api/strategies"),
  createStrategy: (name: string, rule: StrategyRule) =>
    postJSON<{ id: number; strategy: Strategy }>("/api/strategies", { name, rule }),
  deleteStrategy: (id: number) =>
    deleteJSON<{ ok: boolean }>(`/api/strategies/${id}`),
  setStrategyActive: (id: number, active: boolean) =>
    postJSON<{ ok: boolean; strategy: Strategy }>(`/api/strategies/${id}/active`, { active }),
  scoreboard: (id: number) =>
    getJSON<Scoreboard>(`/api/strategies/${id}/scoreboard`),
  backtest: (rule: StrategyRule, days?: number) =>
    postJSON<BacktestResult>("/api/backtest", { rule, ...(days !== undefined ? { days } : {}) }),
  backfill: (maxDays?: number) =>
    postJSON<{ ok: boolean; message: string }>(
      `/api/backfill${maxDays !== undefined ? `?max_days=${maxDays}` : ""}`
    ),
  backfillStatus: () =>
    getJSON<{ running: boolean; last: Record<string, unknown> | null; cursor: string | null }>(
      "/api/backfill/status"
    ),
  // Extras (Phase 5)
  holdings: () => getJSON<HoldingsResp>("/api/holdings"),
  sectors: (days = 30) => getJSON<{ sectors: SectorFlow[] }>(`/api/sectors?days=${days}`),
  watchlist: () =>
    getJSON<{ watchlist: WatchItem[]; activity: Trade[] }>("/api/watchlist"),
  addWatch: (kind: string, key: string) =>
    postJSON<{ ok: boolean }>("/api/watchlist", { kind, key }),
  removeWatch: (kind: string, key: string) =>
    deleteJSON<{ ok: boolean }>(
      `/api/watchlist?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}`
    ),
  digest: () => getJSON<Digest>("/api/digest"),
  csvUrl: (params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== "" && v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return `/api/export.csv${q ? "?" + q : ""}`;
  },
};
