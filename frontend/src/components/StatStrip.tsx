import type { Stats } from "../lib/types";
import { compactMoney } from "../lib/format";

interface Props {
  stats: Stats | undefined;
  loading?: boolean;
}

export function StatStrip({ stats, loading }: Props) {
  const items = stats
    ? [
        { label: "7D Buys", value: compactMoney(stats.buys_value), sub: `${stats.buys_count} trades`, accent: "mint" as const },
        { label: "7D Sells", value: compactMoney(stats.sells_value), sub: `${stats.sells_count} trades`, accent: "coral" as const },
        { label: "Net Flow", value: compactMoney(stats.net_value), sub: "7 days", accent: (stats.net_value >= 0 ? "mint" : "coral") as "mint" | "coral" },
        { label: "Total", value: stats.total_count.toLocaleString(), sub: "all trades", accent: "none" as const },
      ]
    : Array(4).fill(null);

  return (
    <div className="border-b border-border bg-surface-1 shrink-0">
      <div className="flex divide-x divide-border">
        {items.map((item, i) =>
          item ? (
            <div key={i} className="flex-1 px-4 py-2 group">
              <div className="font-mono text-[9px] text-text-muted tracking-widest uppercase mb-0.5">
                {item.label}
              </div>
              <div
                className={`font-mono text-base font-medium leading-none ${
                  item.accent === "mint"
                    ? "text-mint"
                    : item.accent === "coral"
                    ? "text-coral"
                    : "text-text-primary"
                }`}
              >
                {item.value}
              </div>
              <div className="font-mono text-[9px] text-text-muted mt-0.5">{item.sub}</div>
            </div>
          ) : (
            <div key={i} className="flex-1 px-4 py-2">
              <div className={`h-2.5 w-14 rounded bg-surface-3 mb-1.5 ${loading ? "animate-pulse" : ""}`} />
              <div className={`h-4 w-20 rounded bg-surface-3 ${loading ? "animate-pulse" : ""}`} />
            </div>
          )
        )}

        {/* Active tickers */}
        {stats && stats.active.length > 0 && (
          <div className="flex-1 px-4 py-2">
            <div className="font-mono text-[9px] text-text-muted tracking-widest uppercase mb-0.5">
              Active
            </div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {stats.active.slice(0, 6).map((a) => (
                <span
                  key={a.ticker}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary border border-border leading-none"
                >
                  {a.ticker}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
