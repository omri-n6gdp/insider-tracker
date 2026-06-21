import type { Trade, Stats, Cluster, Status, StockDetail, InsiderDetail, Recommendation, InsiderTrack } from "./types";

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
  insider: (cik: string) =>
    getJSON<InsiderDetail>(`/api/insider/${encodeURIComponent(cik)}`),
  recommendations: (days = 30, limit = 20) =>
    getJSON<{ recommendations: Recommendation[] }>(`/api/recommendations?days=${days}&limit=${limit}`),
  smartMoney: (limit = 25, minBuys = 2) =>
    getJSON<{ insiders: InsiderTrack[] }>(`/api/smart-money?limit=${limit}&min_buys=${minBuys}`),
};
