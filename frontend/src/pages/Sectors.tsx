import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { compactMoney } from "../lib/format";
import { Async } from "../components/Async";
import type { SectorFlow } from "../lib/types";

function SectorRow({ s, maxAbs }: { s: SectorFlow; maxAbs: number }) {
  const positive = s.net_value >= 0;
  const pct = maxAbs > 0 ? Math.max(2, (Math.abs(s.net_value) / maxAbs) * 100) : 0;
  return (
    <div className="px-4 py-2.5 border-b border-border-muted last:border-b-0 hover:bg-surface-1 transition-colors">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="font-mono text-[12px] text-text-primary truncate">{s.sector}</span>
        <div className="flex items-baseline gap-3 shrink-0">
          <span className="font-mono text-[9px] text-text-faint uppercase tracking-widest">
            {s.tickers} {s.tickers === 1 ? "ticker" : "tickers"}
          </span>
          <span
            className={`font-mono text-[12px] font-medium tabular-nums w-20 text-right ${
              positive ? "text-mint" : "text-coral"
            }`}
          >
            {compactMoney(s.net_value)}
          </span>
        </div>
      </div>
      {/* Net-flow bar, centered: mint right of zero, coral left */}
      <div className="flex items-center h-2.5">
        <div className="flex-1 flex justify-end">
          {!positive && (
            <div className="h-2.5 rounded-l bg-coral/60" style={{ width: `${pct}%` }} />
          )}
        </div>
        <div className="w-px h-3 bg-border-muted" />
        <div className="flex-1 flex justify-start">
          {positive && (
            <div className="h-2.5 rounded-r bg-mint/60" style={{ width: `${pct}%` }} />
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-4 mt-1">
        <span className="font-mono text-[9px] text-text-faint">
          buys <span className="text-mint">{compactMoney(s.buy_value)}</span>
        </span>
        <span className="font-mono text-[9px] text-text-faint">
          sells <span className="text-coral">{compactMoney(s.sell_value)}</span>
        </span>
      </div>
    </div>
  );
}

export default function Sectors() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sectors", 30],
    queryFn: () => api.sectors(30),
  });

  const sectors = data?.sectors ?? [];
  const sorted = [...sectors].sort((a, b) => b.net_value - a.net_value);
  const maxAbs = Math.max(1, ...sectors.map((s) => Math.abs(s.net_value)));

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Back link */}
      <div className="px-6 pt-4 pb-1">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-text-muted hover:text-text-secondary transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Board
        </Link>
      </div>

      {/* Page header */}
      <div className="px-6 pt-2 pb-3 border-b border-border">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="font-display font-bold text-3xl text-text-primary tracking-tight leading-none">
            Sector Flow
          </h2>
          <span className="font-mono text-[11px] text-text-muted">
            Net insider $ by sector · last 30 days
          </span>
        </div>
        <p className="font-mono text-[10px] text-text-faint leading-relaxed mt-2 max-w-2xl">
          Covers sectors with cached fundamentals. Mint = insiders net-buying the sector,
          coral = net-selling.
        </p>
      </div>

      <Async
        loading={isLoading}
        error={error}
        empty={sectors.length === 0}
        emptyText="No sector data yet — fundamentals build as stocks are viewed."
      >
        <div className="stagger">
          {sorted.map((s) => (
            <SectorRow key={s.sector} s={s} maxAbs={maxAbs} />
          ))}
        </div>
      </Async>
    </div>
  );
}
