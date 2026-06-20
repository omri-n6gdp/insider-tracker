import type { Cluster } from "../lib/types";
import { compactMoney } from "../lib/format";

interface Props {
  clusters: Cluster[];
  loading?: boolean;
}

export function ClusterPanel({ clusters, loading }: Props) {
  return (
    <div className="border border-border bg-surface-1 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
        <span className="font-mono text-[9px] uppercase tracking-widest text-gold">
          Cluster Signals
        </span>
      </div>

      {loading && (
        <div className="p-3 space-y-2">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse space-y-1">
              <div className="h-3 w-12 bg-surface-3 rounded" />
              <div className="h-2.5 w-28 bg-surface-3 rounded" />
            </div>
          ))}
        </div>
      )}

      <div className="divide-y divide-border-muted">
        {clusters.slice(0, 14).map((c) => (
          <div key={c.ticker} className="px-3 py-2 hover:bg-surface-2 transition-colors group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] font-medium text-gold group-hover:text-gold/90">
                    {c.ticker}
                  </span>
                  <span className="font-mono text-[9px] text-text-muted bg-surface-3 px-1 py-0.5 rounded leading-none">
                    {c.owners}×
                  </span>
                </div>
                <p className="font-mono text-[10px] text-text-muted mt-0.5 truncate" title={c.issuer_name}>
                  {c.issuer_name.length > 26 ? c.issuer_name.slice(0, 26) + "…" : c.issuer_name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-[10px] text-text-secondary">
                  {compactMoney(c.total_value)}
                </span>
              </div>
            </div>
            {/* Names */}
            <p className="font-mono text-[9px] text-text-faint mt-1 leading-tight line-clamp-1">
              {c.names.split(",").slice(0, 3).join(", ")}
              {c.names.split(",").length > 3 && ` +${c.names.split(",").length - 3}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
