import type { Stats } from "../lib/types";
import { compactMoney } from "../lib/format";

interface Props {
  stats: Stats | undefined;
  loading?: boolean;
  design: "a" | "b";
}

export function StatStrip({ stats, loading, design }: Props) {
  if (design === "b") return <StatStripB stats={stats} loading={loading} />;
  return <StatStripA stats={stats} loading={loading} />;
}

/* ── Design A: Terminal dense stat bar ─────────────────────────────── */
function StatStripA({ stats, loading }: { stats: Stats | undefined; loading?: boolean }) {
  const items = stats
    ? [
        { label: "7D Buys", value: compactMoney(stats.buys_value), sub: `${stats.buys_count} trades`, accent: "mint" },
        { label: "7D Sells", value: compactMoney(stats.sells_value), sub: `${stats.sells_count} trades`, accent: "coral" },
        { label: "Net Flow", value: compactMoney(stats.net_value), sub: "7 days", accent: stats.net_value >= 0 ? "mint" : "coral" },
        { label: "Total", value: stats.total_count.toLocaleString(), sub: "all trades", accent: "none" },
      ]
    : Array(4).fill(null);

  return (
    <div className="border-b border-border bg-surface-1">
      <div className="flex divide-x divide-border">
        {items.map((item, i) =>
          item ? (
            <div key={i} className="flex-1 px-5 py-3 group">
              <div className="font-mono text-[10px] text-text-muted tracking-widest uppercase mb-1">
                {item.label}
              </div>
              <div
                className={`font-mono text-lg font-medium leading-none ${
                  item.accent === "mint"
                    ? "text-mint"
                    : item.accent === "coral"
                    ? "text-coral"
                    : "text-text-primary"
                }`}
              >
                {item.value}
              </div>
              <div className="font-mono text-[10px] text-text-muted mt-1">{item.sub}</div>
            </div>
          ) : (
            <div key={i} className="flex-1 px-5 py-3">
              <div className={`h-3 w-16 rounded bg-surface-3 mb-2 ${loading ? "animate-pulse" : ""}`} />
              <div className={`h-5 w-24 rounded bg-surface-3 ${loading ? "animate-pulse" : ""}`} />
            </div>
          )
        )}

        {/* Active tickers */}
        {stats && stats.active.length > 0 && (
          <div className="flex-1 px-5 py-3">
            <div className="font-mono text-[10px] text-text-muted tracking-widest uppercase mb-1">
              Active
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {stats.active.slice(0, 6).map((a) => (
                <span
                  key={a.ticker}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary border border-border"
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

/* ── Design B: Editorial stat panels ───────────────────────────────── */
function StatStripB({ stats, loading }: { stats: Stats | undefined; loading?: boolean }) {
  const items = stats
    ? [
        { label: "7-Day Buys", value: compactMoney(stats.buys_value), sub: `${stats.buys_count} transactions`, color: "#34d399" },
        { label: "7-Day Sells", value: compactMoney(stats.sells_value), sub: `${stats.sells_count} transactions`, color: "#fb7185" },
        { label: "Net Flow", value: compactMoney(stats.net_value), sub: "net 7 days", color: stats.net_value >= 0 ? "#34d399" : "#fb7185" },
      ]
    : Array(3).fill(null);

  return (
    <div className="border-b border-[#1a1f28] bg-[#080a0c]">
      <div className="max-w-[1440px] mx-auto px-10">
        <div className="flex gap-0 divide-x divide-[#1a1f28]">
          {items.map((item, i) =>
            item ? (
              <div key={i} className="flex-1 py-6 px-8 first:pl-0">
                <p className="font-sans-refined text-[11px] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
                  {item.label}
                </p>
                <p
                  className="font-display text-3xl font-bold leading-none"
                  style={{ color: item.color }}
                >
                  {item.value}
                </p>
                <p className="font-mono text-[11px] text-text-muted mt-2">{item.sub}</p>
              </div>
            ) : (
              <div key={i} className="flex-1 py-6 px-8 first:pl-0">
                <div className={`h-3 w-20 rounded bg-surface-2 mb-3 ${loading ? "animate-pulse" : ""}`} />
                <div className={`h-8 w-28 rounded bg-surface-2 ${loading ? "animate-pulse" : ""}`} />
              </div>
            )
          )}

          {/* Active tickers - editorial pill list */}
          {stats && stats.active.length > 0 && (
            <div className="flex-1 py-6 px-8">
              <p className="font-sans-refined text-[11px] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
                Active Movers
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stats.active.slice(0, 8).map((a) => (
                  <span
                    key={a.ticker}
                    className="font-mono text-[11px] px-2 py-1 border border-[#1e2836] text-text-secondary hover:border-gold hover:text-gold transition-colors cursor-default"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    {a.ticker}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
