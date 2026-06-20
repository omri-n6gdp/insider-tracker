import { Link } from "react-router-dom";
import type { Trade } from "../lib/types";
import { compactMoney, shares } from "../lib/format";

const KIND_LABELS: Record<string, string> = {
  buy: "BUY",
  sell: "SELL",
  grant: "GRANT",
  option: "OPT",
  tax: "TAX",
  gift: "GIFT",
  other: "OTHER",
};

// Grid columns (inline style):
// stock context:  KIND(52) | INSIDER(flex) | VALUE(110) | SHARES(96) | DATE(64) | Nx badge(24)
// insider context: KIND(52) | TICKER(64) | Nx(24) | COMPANY(flex) | VALUE(110) | SHARES(96) | DATE(64)

const STOCK_COLS = "52px minmax(0,1fr) 24px 110px 96px 64px";
const INSIDER_COLS = "52px 64px 24px minmax(0,1fr) 110px 96px 64px";

interface Props {
  trades: Trade[];
  context: "stock" | "insider";
}

export function TradeTable({ trades, context }: Props) {
  const cols = context === "stock" ? STOCK_COLS : INSIDER_COLS;

  // Column header
  const headers =
    context === "stock"
      ? ["Kind", "Insider", "", "Value", "Shares", "Date"]
      : ["Kind", "Ticker", "", "Company", "Value", "Shares", "Date"];

  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="font-mono text-[11px] text-text-muted tracking-wider">
          {context === "stock"
            ? "No insider transactions recorded"
            : "No transactions recorded"}
        </span>
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div
        className="px-3 py-1 border-b border-border-muted bg-surface-1 sticky top-0"
        style={{
          display: "grid",
          gridTemplateColumns: cols,
          alignItems: "center",
          gap: 0,
        }}
      >
        {headers.map((h, i) => (
          <div
            key={h || i}
            className={`font-mono text-[9px] text-text-faint uppercase tracking-widest ${
              // right-align numeric cols
              i >= (context === "stock" ? 3 : 4) ? "text-right" : ""
            }`}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-border-muted">
        {trades.map((trade) => {
          const isBuy = trade.kind === "buy";
          const isSell = trade.kind === "sell";
          const valueColor = isBuy
            ? "text-mint"
            : isSell
            ? "text-coral"
            : "text-text-secondary";
          const badgeClass = isBuy
            ? "bg-mint-dim text-mint"
            : isSell
            ? "bg-coral-dim text-coral"
            : "bg-surface-3 text-text-muted";

          return (
            <div
              key={trade.uid}
              className="px-3 py-1 hover:bg-surface-2 transition-colors"
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                alignItems: "center",
                gap: 0,
              }}
            >
              {/* KIND badge */}
              <div className="shrink-0">
                <span
                  className={`inline-block font-mono text-[10px] font-medium px-1.5 py-0.5 rounded tracking-wider ${badgeClass}`}
                >
                  {KIND_LABELS[trade.kind] ?? trade.kind.toUpperCase()}
                </span>
              </div>

              {context === "insider" ? (
                <>
                  {/* TICKER link */}
                  <div className="shrink-0 min-w-0">
                    <Link
                      to={`/stock/${trade.ticker}`}
                      className="font-mono text-[12px] font-medium text-text-primary hover:text-mint transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {trade.ticker}
                    </Link>
                  </div>

                  {/* Nx badge */}
                  <div className="shrink-0 flex items-center">
                    {trade.line_count && trade.line_count > 1 ? (
                      <span className="font-mono text-[9px] text-gold bg-gold-dim px-1 py-0.5 rounded leading-none">
                        {trade.line_count}×
                      </span>
                    ) : null}
                  </div>

                  {/* COMPANY */}
                  <div className="min-w-0 pr-2">
                    <span
                      className="font-mono text-[11px] text-text-muted truncate block"
                      title={trade.issuer_name}
                    >
                      {trade.issuer_name}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {/* INSIDER link */}
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

                  {/* Nx badge */}
                  <div className="shrink-0 flex items-center">
                    {trade.line_count && trade.line_count > 1 ? (
                      <span className="font-mono text-[9px] text-gold bg-gold-dim px-1 py-0.5 rounded leading-none">
                        {trade.line_count}×
                      </span>
                    ) : null}
                  </div>
                </>
              )}

              {/* VALUE */}
              <div className="text-right">
                <span className={`font-mono text-[12px] font-medium ${valueColor}`}>
                  {compactMoney(trade.value)}
                </span>
              </div>

              {/* SHARES */}
              <div className="text-right">
                <span className="font-mono text-[11px] text-text-muted">
                  {shares(trade.shares)}
                </span>
              </div>

              {/* DATE */}
              <div className="text-right">
                <span className="font-mono text-[10px] text-text-muted">
                  {trade.period ? trade.period.slice(5) : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
