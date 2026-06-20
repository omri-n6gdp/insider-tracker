import type { StockDetail } from "../lib/types";
import { compactMoney } from "../lib/format";

type Fundamentals = StockDetail["fundamentals"];

function fmt(v: unknown, type: "money" | "ratio" | "pct" | "range", high?: unknown): string {
  if (v == null || v === "" || v === false) return "—";
  if (type === "money") return compactMoney(v as number);
  if (type === "ratio") {
    const n = Number(v);
    return isFinite(n) ? n.toFixed(2) : "—";
  }
  if (type === "pct") {
    // yfinance returns dividendYield already as a percent (e.g. 2.67 = 2.67%).
    const n = Number(v);
    if (!isFinite(n) || n === 0) return "—";
    return n.toFixed(2) + "%";
  }
  if (type === "range") {
    const lo = Number(v);
    const hi = Number(high);
    if (!isFinite(lo) || !isFinite(hi) || (lo === 0 && hi === 0)) return "—";
    return `$${lo.toFixed(2)} – $${hi.toFixed(2)}`;
  }
  return String(v);
}

const ITEMS: {
  label: string;
  render: (f: Fundamentals) => string;
}[] = [
  { label: "Sector", render: (f) => f.sector ?? "—" },
  { label: "Industry", render: (f) => f.industry ?? "—" },
  { label: "Market Cap", render: (f) => fmt(f.market_cap, "money") },
  { label: "P/E", render: (f) => fmt(f.pe, "ratio") },
  { label: "P/B", render: (f) => fmt(f.pb, "ratio") },
  {
    label: "Div Yield",
    render: (f) => fmt(f.dividend_yield, "pct"),
  },
  {
    label: "52W Range",
    render: (f) => fmt(f.week52_low, "range", f.week52_high),
  },
];

export function QuantPanel({ fundamentals }: { fundamentals: Fundamentals }) {
  if (!fundamentals.available) {
    return (
      <div className="flex items-center gap-2 px-4 py-4 border-t border-border">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-muted shrink-0" />
        <span className="font-mono text-[11px] text-text-muted tracking-wider">
          Quant data unavailable
        </span>
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-muted">
        <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
          Fundamentals
        </span>
      </div>

      {/* Grid of stats */}
      <div
        className="px-4 py-3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "12px 24px",
        }}
      >
        {ITEMS.map(({ label, render }) => {
          const value = render(fundamentals);
          const isUnavail = value === "—";
          return (
            <div key={label} className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-0.5">
                {label}
              </div>
              <div
                className={`font-mono text-[12px] truncate ${
                  isUnavail ? "text-text-muted" : "text-text-secondary"
                }`}
                title={value}
              >
                {value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
