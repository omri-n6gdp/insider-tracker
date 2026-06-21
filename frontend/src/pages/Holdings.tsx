import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { money, compactMoney, shares } from "../lib/format";
import { Async } from "../components/Async";
import type { Holding } from "../lib/types";

const COLS = "minmax(0,1fr) 70px 90px 90px 90px minmax(0,1.3fr)";

function HoldingRow({ h }: { h: Holding }) {
  const pl = h.ppl ?? 0;
  const ins = h.insider;
  return (
    <div
      className="px-4 py-2 border-b border-border-muted last:border-b-0 hover:bg-surface-1 transition-colors"
      style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", gap: "0 12px" }}
    >
      {/* Ticker */}
      <div className="min-w-0">
        {h.is_us_equity ? (
          <Link
            to={`/stock/${h.ticker}`}
            className="font-mono text-[12px] font-medium text-text-primary hover:text-mint transition-colors"
          >
            {h.ticker}
          </Link>
        ) : (
          <span className="font-mono text-[12px] text-text-secondary">{h.ticker}</span>
        )}
      </div>

      {/* Qty */}
      <span className="font-mono text-[11px] text-text-muted text-right tabular-nums">
        {shares(h.qty)}
      </span>

      {/* Avg price */}
      <span className="font-mono text-[11px] text-text-muted text-right tabular-nums">
        {h.avg_price ? money(h.avg_price) : "—"}
      </span>

      {/* Current price */}
      <span className="font-mono text-[11px] text-text-secondary text-right tabular-nums">
        {h.current_price ? money(h.current_price) : "—"}
      </span>

      {/* P/L */}
      <span
        className={`font-mono text-[11px] text-right tabular-nums ${
          pl > 0 ? "text-mint" : pl < 0 ? "text-coral" : "text-text-muted"
        }`}
      >
        {h.ppl != null ? `${pl >= 0 ? "+" : ""}${money(pl)}` : "—"}
      </span>

      {/* Insider */}
      <div className="flex items-center justify-end gap-2 min-w-0">
        {!h.is_us_equity ? (
          <span className="font-mono text-[9px] text-text-faint uppercase tracking-widest">
            no insider data
          </span>
        ) : ins ? (
          <>
            {ins.sell_alert && (
              <span className="font-mono text-[9px] font-medium text-coral bg-coral-dim px-1.5 py-0.5 rounded tracking-wider shrink-0">
                SELL-ALERT
              </span>
            )}
            <span className="font-mono text-[10px] text-text-muted whitespace-nowrap">
              {ins.buys}B / {ins.sells}S
            </span>
            <span
              className={`font-mono text-[11px] tabular-nums w-16 text-right ${
                ins.net_value > 0 ? "text-mint" : ins.net_value < 0 ? "text-coral" : "text-text-muted"
              }`}
            >
              {compactMoney(ins.net_value)}
            </span>
          </>
        ) : (
          <span className="font-mono text-[10px] text-text-faint">—</span>
        )}
      </div>
    </div>
  );
}

export default function Holdings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["holdings"],
    queryFn: api.holdings,
  });

  const positions = data?.positions ?? [];

  return (
    <div className="max-w-5xl mx-auto pb-12">
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
            My Holdings
          </h2>
          <span className="font-mono text-[11px] text-text-muted">
            Trading 212 portfolio × insider activity
          </span>
        </div>
        <p className="font-mono text-[10px] text-text-faint leading-relaxed mt-2 max-w-2xl">
          Only individual US stocks carry insider data — ETFs and non-US positions are shown but
          marked accordingly. A coral SELL-ALERT means insiders are net-selling that holding.
        </p>
      </div>

      {/* Column headers */}
      <div
        className="px-4 py-1.5 border-b border-border bg-surface-1"
        style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", gap: "0 12px" }}
      >
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest">Ticker</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Qty</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Avg</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Current</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">P/L</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Insider (14d)</div>
      </div>

      <Async
        loading={isLoading}
        error={error}
        empty={positions.length === 0}
        emptyText="No positions — set TRADING212_API_KEY in .env to load your portfolio."
      >
        <div className="stagger">
          {positions.map((h) => (
            <HoldingRow key={h.raw_ticker} h={h} />
          ))}
        </div>
      </Async>
    </div>
  );
}
