import type { Cluster } from "../lib/types";
import { compactMoney } from "../lib/format";

interface Props {
  clusters: Cluster[];
  loading?: boolean;
  design: "a" | "b";
}

export function ClusterPanel({ clusters, loading, design }: Props) {
  if (design === "b") return <ClusterPanelB clusters={clusters} loading={loading} />;
  return <ClusterPanelA clusters={clusters} loading={loading} />;
}

/* ── Design A: Terminal cluster list ────────────────────────────────── */
function ClusterPanelA({ clusters, loading }: { clusters: Cluster[]; loading?: boolean }) {
  return (
    <div className="border border-border bg-surface-1 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-gold">
          Cluster Signals
        </span>
      </div>

      {loading && (
        <div className="p-4 space-y-3">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="h-3 w-14 bg-surface-3 rounded" />
              <div className="h-2.5 w-32 bg-surface-3 rounded" />
            </div>
          ))}
        </div>
      )}

      <div className="divide-y divide-border-muted">
        {clusters.slice(0, 12).map((c) => (
          <div key={c.ticker} className="px-4 py-3 hover:bg-surface-2 transition-colors group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-medium text-gold group-hover:text-gold/90">
                    {c.ticker}
                  </span>
                  <span className="font-mono text-[9px] text-text-muted bg-surface-3 px-1.5 py-0.5 rounded">
                    {c.owners}×
                  </span>
                </div>
                <p className="font-mono text-[10px] text-text-muted mt-0.5 truncate" title={c.issuer_name}>
                  {c.issuer_name.length > 28 ? c.issuer_name.slice(0, 28) + "…" : c.issuer_name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-[11px] text-text-secondary">
                  {compactMoney(c.total_value)}
                </span>
              </div>
            </div>
            {/* Names */}
            <p className="font-mono text-[9px] text-text-faint mt-1.5 leading-tight line-clamp-2">
              {c.names.split(",").slice(0, 3).join(", ")}
              {c.names.split(",").length > 3 && ` +${c.names.split(",").length - 3}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Design B: Editorial cluster cards ──────────────────────────────── */
function ClusterPanelB({ clusters, loading }: { clusters: Cluster[]; loading?: boolean }) {
  return (
    <div className="h-full">
      {/* Section header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-4 h-px bg-gold" />
        <span className="font-sans-refined text-[11px] font-medium uppercase tracking-[0.15em] text-gold">
          Cluster Signals
        </span>
        <div className="flex-1 h-px bg-[#1a1f28]" />
      </div>

      {loading && (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse space-y-2 p-4 border border-[#1a1f28]">
              <div className="h-4 w-16 bg-surface-2 rounded" />
              <div className="h-3 w-36 bg-surface-2 rounded" />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-px">
        {clusters.slice(0, 10).map((c) => (
          <div
            key={c.ticker}
            className="group flex items-start gap-4 px-0 py-3 border-b border-[#1a1f28] hover:border-gold/30 transition-colors cursor-default"
          >
            {/* Ticker column */}
            <div className="shrink-0 w-16">
              <span className="font-display font-bold text-base text-gold/90 group-hover:text-gold transition-colors">
                {c.ticker}
              </span>
            </div>

            {/* Info column */}
            <div className="flex-1 min-w-0">
              <p className="font-sans-refined text-[12px] text-text-secondary leading-tight truncate">
                {c.issuer_name.length > 30 ? c.issuer_name.slice(0, 30) + "…" : c.issuer_name}
              </p>
              <p className="font-mono text-[10px] text-text-faint mt-0.5 line-clamp-1">
                {c.names.split(",").slice(0, 3).join(", ")}
                {c.names.split(",").length > 3 && ` +${c.names.split(",").length - 3}`}
              </p>
            </div>

            {/* Value + owners */}
            <div className="shrink-0 text-right">
              <p className="font-mono text-[12px] text-text-secondary">{compactMoney(c.total_value)}</p>
              <p className="font-mono text-[10px] text-text-muted">{c.owners} insiders</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
