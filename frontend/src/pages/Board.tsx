import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { StatStrip } from "../components/StatStrip";
import { ClusterPanel } from "../components/ClusterPanel";
import { TradeRow } from "../components/TradeRow";
import type { Stats, Cluster, Trade } from "../lib/types";

const KIND_FILTERS = [
  { label: "All", value: "" },
  { label: "Buys", value: "buy" },
  { label: "Sells", value: "sell" },
  { label: "Grants", value: "grant" },
  { label: "Options", value: "option" },
] as const;

export default function Board() {
  const [kind, setKind] = useState<string>("");
  const [search, setSearch] = useState("");

  // Poll status every 15s; refetch trades when total_count changes
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: api.status,
    refetchInterval: 15_000,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["stats", 7],
    queryFn: () => api.stats(7),
  });

  const { data: clustersData, isLoading: clustersLoading } = useQuery({
    queryKey: ["clusters"],
    queryFn: api.clusters,
  });

  const tradeParams: Record<string, string | number> = { compiled: "true", limit: 100 };
  if (kind) tradeParams.kind = kind;
  if (search.trim()) tradeParams.q = search.trim();

  const { data: tradesData, isLoading: tradesLoading } = useQuery({
    queryKey: ["trades", kind, search, status?.total_count],
    queryFn: () => api.trades(tradeParams),
  });

  const trades: Trade[] = tradesData?.trades ?? [];
  const clusters: Cluster[] = clustersData?.clusters ?? [];

  return (
    <div className="flex flex-col h-[calc(100vh-96px)]">
      {/* Stat strip */}
      <StatStrip stats={statsData as Stats | undefined} loading={statsLoading} />

      {/* Body: ledger + cluster panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Main ledger */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-0 px-4 py-1.5 border-b border-border bg-surface-1 shrink-0">
            {/* Kind filter */}
            <div className="flex gap-0 border border-border rounded overflow-hidden mr-3">
              {KIND_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setKind(f.value)}
                  className={`font-mono text-[10px] tracking-wider uppercase px-3 py-1 transition-colors border-r border-border last:border-r-0 ${
                    kind === f.value
                      ? "bg-surface-3 text-text-primary"
                      : "bg-surface-1 text-text-muted hover:text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 border border-border rounded bg-surface px-2.5 py-1 flex-1 max-w-xs">
              <svg className="w-3 h-3 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Ticker or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent font-mono text-[11px] text-text-primary placeholder-text-muted outline-none w-full"
              />
            </div>

            {/* Count */}
            <div className="ml-3 font-mono text-[10px] text-text-muted">
              {tradesLoading ? "…" : `${trades.length} rows`}
            </div>
          </div>

          {/* Column headers — tight grid matching TradeRow */}
          <div
            className="px-3 py-1 border-b border-border-muted bg-surface-1 shrink-0"
            style={{ display: "grid", gridTemplateColumns: "52px 64px 24px minmax(0,1fr) minmax(0,1.1fr) 110px 96px 64px" }}
          >
            <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest">Kind</div>
            <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest">Ticker</div>
            <div />
            <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest">Company</div>
            <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest">Insider</div>
            <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Value</div>
            <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Shares</div>
            <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Date</div>
          </div>

          {/* Ledger rows */}
          <div className="overflow-y-auto flex-1 stagger">
            {tradesLoading
              ? Array(18).fill(0).map((_, i) => (
                  <div
                    key={i}
                    className="px-3 py-1 border-b border-border-muted animate-pulse"
                    style={{ display: "grid", gridTemplateColumns: "52px 64px 24px minmax(0,1fr) minmax(0,1.1fr) 110px 96px 64px", alignItems: "center" }}
                  >
                    <div className="h-4 w-10 bg-surface-3 rounded" />
                    <div className="h-4 w-12 bg-surface-3 rounded" />
                    <div />
                    <div className="h-3 w-32 bg-surface-3 rounded" />
                    <div className="h-3 w-24 bg-surface-3 rounded" />
                    <div className="h-4 w-16 bg-surface-3 rounded ml-auto" />
                    <div className="h-3 w-14 bg-surface-3 rounded ml-auto" />
                    <div className="h-3 w-12 bg-surface-3 rounded ml-auto" />
                  </div>
                ))
              : trades.map((trade) => (
                  <TradeRow key={trade.uid} trade={trade} />
                ))}
            {!tradesLoading && trades.length === 0 && (
              <div className="flex items-center justify-center h-32 font-mono text-[11px] text-text-muted">
                No trades match filters
              </div>
            )}
          </div>
        </div>

        {/* Cluster panel — sidebar */}
        <div className="w-64 shrink-0 border-l border-border overflow-y-auto">
          <ClusterPanel clusters={clusters} loading={clustersLoading} />
        </div>
      </div>
    </div>
  );
}
