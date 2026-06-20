import { Link } from "react-router-dom";
import type { Trade } from "../lib/types";
import { compactMoney, shares } from "../lib/format";
import { useSearchParam } from "../lib/useSearchParam";

interface Props {
  trade: Trade;
}

const KIND_LABELS: Record<string, string> = {
  buy: "BUY",
  sell: "SELL",
  grant: "GRANT",
  option: "OPTION",
  tax: "TAX",
  gift: "GIFT",
  other: "OTHER",
};

export function TradeRow({ trade }: Props) {
  const design = useSearchParam("design") ?? "a";
  const designParam = `?design=${design}`;

  if (design === "b") {
    return <TradeRowB trade={trade} designParam={designParam} />;
  }
  return <TradeRowA trade={trade} designParam={designParam} />;
}

/* ── Design A: Terminal dense row ───────────────────────────────────── */
function TradeRowA({ trade, designParam }: { trade: Trade; designParam: string }) {
  const isBuy = trade.kind === "buy";
  const isSell = trade.kind === "sell";

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-muted hover:bg-surface-2 transition-colors group">
      {/* Kind badge */}
      <div className="shrink-0 w-14">
        <span
          className={`inline-block font-mono text-[9px] font-medium px-1.5 py-0.5 rounded tracking-wider ${
            isBuy
              ? "bg-mint-dim text-mint"
              : isSell
              ? "bg-coral-dim text-coral"
              : "bg-surface-3 text-text-muted"
          }`}
        >
          {KIND_LABELS[trade.kind] ?? trade.kind.toUpperCase()}
        </span>
      </div>

      {/* Ticker */}
      <div className="shrink-0 w-16">
        <Link
          to={`/stock/${trade.ticker}${designParam}`}
          className="font-mono text-[12px] font-medium text-text-primary hover:text-mint transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {trade.ticker}
        </Link>
        {trade.line_count && trade.line_count > 1 && (
          <span className="ml-1 font-mono text-[9px] text-gold bg-gold-dim px-1 py-0.5 rounded">
            {trade.line_count}×
          </span>
        )}
      </div>

      {/* Issuer name */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <span className="font-mono text-[11px] text-text-muted truncate block" title={trade.issuer_name}>
          {trade.issuer_name}
        </span>
      </div>

      {/* Owner */}
      <div className="w-40 min-w-0 hidden md:block">
        <Link
          to={`/insider/${trade.owner_cik}${designParam}`}
          className="font-mono text-[11px] text-text-secondary hover:text-text-primary transition-colors truncate block"
          title={trade.owner_name}
        >
          {trade.owner_name}
        </Link>
      </div>

      {/* Value */}
      <div className="shrink-0 w-20 text-right">
        <span
          className={`font-mono text-[12px] ${
            isBuy ? "text-mint" : isSell ? "text-coral" : "text-text-secondary"
          }`}
        >
          {compactMoney(trade.value)}
        </span>
      </div>

      {/* Shares */}
      <div className="shrink-0 w-24 text-right hidden lg:block">
        <span className="font-mono text-[11px] text-text-muted">
          {shares(trade.shares)}
        </span>
      </div>

      {/* Date */}
      <div className="shrink-0 w-20 text-right">
        <span className="font-mono text-[10px] text-text-muted">
          {trade.period ? trade.period.slice(5) : "—"}
        </span>
      </div>
    </div>
  );
}

/* ── Design B: Editorial ledger row ─────────────────────────────────── */
function TradeRowB({ trade, designParam }: { trade: Trade; designParam: string }) {
  const isBuy = trade.kind === "buy";
  const isSell = trade.kind === "sell";

  return (
    <div className="flex items-center gap-6 py-3.5 px-0 border-b border-[#111318] hover:border-[#1e2836] transition-colors group">
      {/* Left accent line */}
      <div
        className={`shrink-0 w-0.5 h-8 self-stretch rounded-full ${
          isBuy ? "bg-mint/60" : isSell ? "bg-coral/60" : "bg-surface-3"
        }`}
      />

      {/* Ticker + company */}
      <div className="w-44 min-w-0">
        <Link
          to={`/stock/${trade.ticker}${designParam}`}
          className="font-display font-bold text-sm text-text-primary hover:text-gold transition-colors inline-flex items-center gap-1.5"
        >
          {trade.ticker}
          {trade.line_count && trade.line_count > 1 && (
            <span className="font-mono text-[9px] text-gold/70 border border-gold/30 px-1 py-0.5 rounded-sm">
              {trade.line_count}×
            </span>
          )}
        </Link>
        <p className="font-sans-refined text-[10px] text-text-muted mt-0.5 truncate" title={trade.issuer_name}>
          {trade.issuer_name.length > 24 ? trade.issuer_name.slice(0, 24) + "…" : trade.issuer_name}
        </p>
      </div>

      {/* Owner */}
      <div className="flex-1 min-w-0 hidden md:block">
        <Link
          to={`/insider/${trade.owner_cik}${designParam}`}
          className="font-sans-refined text-[12px] text-text-secondary hover:text-text-primary transition-colors truncate block"
          title={trade.owner_name}
        >
          {trade.owner_name}
        </Link>
        <p className="font-mono text-[10px] text-text-muted mt-0.5">{trade.roles}</p>
      </div>

      {/* Kind label */}
      <div className="shrink-0 w-20 hidden sm:flex justify-end">
        <span
          className={`font-sans-refined text-[11px] font-medium tracking-wide ${
            isBuy ? "text-mint" : isSell ? "text-coral" : "text-text-muted"
          }`}
        >
          {KIND_LABELS[trade.kind] ?? trade.kind}
        </span>
      </div>

      {/* Value */}
      <div className="shrink-0 w-24 text-right">
        <span
          className={`font-mono text-[13px] font-medium ${
            isBuy ? "text-mint" : isSell ? "text-coral" : "text-text-secondary"
          }`}
        >
          {compactMoney(trade.value)}
        </span>
      </div>

      {/* Shares */}
      <div className="shrink-0 w-24 text-right hidden lg:block">
        <span className="font-mono text-[11px] text-text-muted">{shares(trade.shares)}</span>
      </div>

      {/* Date */}
      <div className="shrink-0 w-20 text-right">
        <span className="font-sans-refined text-[11px] text-text-muted">
          {trade.period ? new Date(trade.period + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        </span>
      </div>
    </div>
  );
}
