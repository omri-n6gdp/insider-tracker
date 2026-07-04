import { Link } from "react-router-dom";
import type { Trade } from "../lib/types";
import { compactMoney, shares, hasTicker } from "../lib/format";

interface Props {
  trade: Trade;
}

const KIND_LABELS: Record<string, string> = {
  buy: "BUY",
  sell: "SELL",
  grant: "GRANT",
  option: "OPT",
  tax: "TAX",
  gift: "GIFT",
  other: "OTHER",
};

export function TradeRow({ trade }: Props) {
  const isBuy = trade.kind === "buy";
  const isSell = trade.kind === "sell";

  return (
    <div
      className="px-3 py-1 border-b border-border-muted hover:bg-surface-2 transition-colors group"
      style={{ display: "grid", gridTemplateColumns: "52px 64px 24px minmax(0,1fr) minmax(0,1.1fr) 110px 96px 64px", alignItems: "center", gap: 0 }}
    >
      {/* Kind badge */}
      <div className="shrink-0">
        <span
          className={`inline-block font-mono text-[10px] font-medium px-1.5 py-0.5 rounded tracking-wider ${
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
      <div className="shrink-0 min-w-0">
        {hasTicker(trade.ticker) ? (
          <Link
            to={`/stock/${trade.ticker}`}
            className="font-mono text-[12px] font-medium text-text-primary hover:text-mint transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {trade.ticker}
          </Link>
        ) : (
          <span className="font-mono text-[12px] text-text-faint" title="No ticker on this filing">—</span>
        )}
      </div>

      {/* Nx compile badge */}
      <div className="shrink-0 flex items-center">
        {trade.line_count && trade.line_count > 1 ? (
          <span className="font-mono text-[9px] text-gold bg-gold-dim px-1 py-0.5 rounded leading-none">
            {trade.line_count}×
          </span>
        ) : null}
      </div>

      {/* Issuer name */}
      <div className="min-w-0 pr-2">
        <span className="font-mono text-[11px] text-text-muted truncate block" title={trade.issuer_name}>
          {trade.issuer_name}
        </span>
      </div>

      {/* Owner */}
      <div className="min-w-0 pr-2">
        <Link
          to={`/insider/${trade.owner_cik}`}
          className="font-mono text-[11px] text-text-secondary hover:text-text-primary transition-colors truncate block"
          title={trade.owner_name}
          onClick={(e) => e.stopPropagation()}
        >
          {trade.owner_name}
        </Link>
      </div>

      {/* Value */}
      <div className="text-right">
        <span
          className={`font-mono text-[12px] font-medium ${
            isBuy ? "text-mint" : isSell ? "text-coral" : "text-text-secondary"
          }`}
        >
          {compactMoney(trade.value)}
        </span>
      </div>

      {/* Shares */}
      <div className="text-right">
        <span className="font-mono text-[11px] text-text-muted">
          {shares(trade.shares)}
        </span>
      </div>

      {/* Date */}
      <div className="text-right">
        <span className="font-mono text-[10px] text-text-muted">
          {trade.period ? trade.period.slice(5) : "—"}
        </span>
      </div>
    </div>
  );
}
