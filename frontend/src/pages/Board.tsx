import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useSearchParam } from "../lib/useSearchParam";
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
  const design = (useSearchParam("design") ?? "a") as "a" | "b";
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

  if (design === "b") {
    return (
      <BoardB
        design={design}
        kind={kind}
        setKind={setKind}
        search={search}
        setSearch={setSearch}
        stats={statsData}
        statsLoading={statsLoading}
        clusters={clustersData?.clusters ?? []}
        clustersLoading={clustersLoading}
        trades={tradesData?.trades ?? []}
        tradesLoading={tradesLoading}
      />
    );
  }

  return (
    <BoardA
      design={design}
      kind={kind}
      setKind={setKind}
      search={search}
      setSearch={setSearch}
      stats={statsData}
      statsLoading={statsLoading}
      clusters={clustersData?.clusters ?? []}
      clustersLoading={clustersLoading}
      trades={tradesData?.trades ?? []}
      tradesLoading={tradesLoading}
    />
  );
}

interface BoardProps {
  design: "a" | "b";
  kind: string;
  setKind: (k: string) => void;
  search: string;
  setSearch: (s: string) => void;
  stats: Stats | undefined;
  statsLoading: boolean;
  clusters: Cluster[];
  clustersLoading: boolean;
  trades: Trade[];
  tradesLoading: boolean;
}

/* ── Design A: Terminal Ledger ─────────────────────────────────────── */
function BoardA({ design, kind, setKind, search, setSearch, stats, statsLoading, clusters, clustersLoading, trades, tradesLoading }: BoardProps) {
  return (
    <div className="flex flex-col h-[calc(100vh-96px)]">
      {/* Stat strip */}
      <StatStrip stats={stats} loading={statsLoading} design={design} />

      {/* Body: ledger + cluster panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Main ledger */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-0 px-4 py-2 border-b border-border bg-surface-1 shrink-0">
            {/* Kind filter */}
            <div className="flex gap-0 border border-border rounded overflow-hidden mr-3">
              {KIND_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setKind(f.value)}
                  className={`font-mono text-[10px] tracking-wider uppercase px-3 py-1.5 transition-colors border-r border-border last:border-r-0 ${
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
            <div className="flex items-center gap-2 border border-border rounded bg-surface px-3 py-1.5 flex-1 max-w-xs">
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

          {/* Column headers */}
          <div className="flex items-center gap-3 px-5 py-1.5 border-b border-border-muted bg-surface-1 shrink-0">
            <div className="w-14 font-mono text-[9px] text-text-faint uppercase tracking-widest">Kind</div>
            <div className="w-16 font-mono text-[9px] text-text-faint uppercase tracking-widest">Ticker</div>
            <div className="flex-1 hidden sm:block font-mono text-[9px] text-text-faint uppercase tracking-widest">Company</div>
            <div className="w-40 hidden md:block font-mono text-[9px] text-text-faint uppercase tracking-widest">Insider</div>
            <div className="w-20 font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Value</div>
            <div className="w-24 hidden lg:block font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Shares</div>
            <div className="w-20 font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Date</div>
          </div>

          {/* Ledger rows */}
          <div className="overflow-y-auto flex-1 stagger">
            {tradesLoading
              ? Array(12).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-2.5 border-b border-border-muted animate-pulse">
                    <div className="w-14 h-4 bg-surface-3 rounded" />
                    <div className="w-16 h-4 bg-surface-3 rounded" />
                    <div className="flex-1 h-3 bg-surface-3 rounded hidden sm:block" />
                    <div className="w-20 h-4 bg-surface-3 rounded" />
                    <div className="w-20 h-4 bg-surface-3 rounded" />
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
        <div className="w-72 shrink-0 border-l border-border overflow-y-auto">
          <ClusterPanel clusters={clusters} loading={clustersLoading} design={design} />
        </div>
      </div>
    </div>
  );
}

/* ── Design B: Dark Editorial ──────────────────────────────────────── */
function BoardB({ design, kind, setKind, search, setSearch, stats, statsLoading, clusters, clustersLoading, trades, tradesLoading }: BoardProps) {
  return (
    <div>
      {/* Stat strip */}
      <StatStrip stats={stats} loading={statsLoading} design={design} />

      {/* Body */}
      <div className="max-w-[1440px] mx-auto px-10 py-8">
        {/* Two-column layout */}
        <div className="grid grid-cols-[1fr_300px] gap-12">
          {/* Left: Ledger */}
          <div>
            {/* Section title + toolbar */}
            <div className="flex items-end gap-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-4 h-px bg-text-muted" />
                <h2 className="font-sans-refined text-[11px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  Trade Ledger
                </h2>
              </div>
              <div className="flex-1" />

              {/* Kind filter */}
              <div className="flex gap-3">
                {KIND_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setKind(f.value)}
                    className={`font-sans-refined text-[11px] font-medium tracking-wide transition-colors pb-0.5 ${
                      kind === f.value
                        ? "text-text-primary border-b border-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="flex items-center gap-2 border-b border-[#1e2836] pb-0.5 focus-within:border-text-muted transition-colors">
                <svg className="w-3 h-3 text-text-faint shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent font-mono text-[11px] text-text-primary placeholder-text-faint outline-none w-32"
                />
              </div>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-6 pb-2 border-b border-[#1a1f28] mb-0">
              <div className="w-0.5 shrink-0" />
              <div className="w-44 min-w-0 font-mono text-[9px] text-text-faint uppercase tracking-widest">Ticker / Co.</div>
              <div className="flex-1 hidden md:block font-mono text-[9px] text-text-faint uppercase tracking-widest">Insider</div>
              <div className="w-20 hidden sm:block font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Kind</div>
              <div className="w-24 font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Value</div>
              <div className="w-24 hidden lg:block font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Shares</div>
              <div className="w-20 font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Date</div>
            </div>

            {/* Rows */}
            <div className="stagger">
              {tradesLoading
                ? Array(15).fill(0).map((_, i) => (
                    <div key={i} className="flex items-center gap-6 py-3.5 border-b border-[#111318] animate-pulse">
                      <div className="w-0.5 h-8 bg-surface-2 shrink-0" />
                      <div className="w-44 space-y-1">
                        <div className="h-3.5 w-14 bg-surface-2 rounded" />
                        <div className="h-2.5 w-28 bg-surface-2 rounded" />
                      </div>
                      <div className="flex-1 h-3 bg-surface-2 rounded hidden md:block" />
                      <div className="w-24 h-3.5 bg-surface-2 rounded" />
                    </div>
                  ))
                : trades.map((trade) => (
                    <TradeRow key={trade.uid} trade={trade} />
                  ))}
              {!tradesLoading && trades.length === 0 && (
                <div className="flex items-center justify-center h-32 font-sans-refined text-sm text-text-muted">
                  No trades match your filters
                </div>
              )}
            </div>
          </div>

          {/* Right: Cluster panel */}
          <div className="pt-0">
            <ClusterPanel clusters={clusters} loading={clustersLoading} design={design} />
          </div>
        </div>
      </div>
    </div>
  );
}
