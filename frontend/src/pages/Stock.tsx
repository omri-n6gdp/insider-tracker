import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { compactMoney } from "../lib/format";
import { PriceChart } from "../components/PriceChart";
import { QuantPanel } from "../components/QuantPanel";
import { TradeTable } from "../components/TradeTable";
import { Async } from "../components/Async";

export default function Stock() {
  const { ticker } = useParams<{ ticker: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["stock", ticker],
    queryFn: () => api.stock(ticker!),
    enabled: !!ticker,
  });

  const hasChart =
    data?.prices?.available !== false && (data?.prices?.candles?.length ?? 0) > 0;

  const summary = data?.summary;
  const fundamentals = data?.fundamentals;
  const name = (fundamentals?.name as string | null | undefined) ?? null;

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
      <div className="px-6 pt-2 pb-4 border-b border-border">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="font-display font-bold text-3xl text-text-primary tracking-tight leading-none">
            {ticker?.toUpperCase()}
          </h2>
          {name && (
            <span className="font-mono text-[13px] text-text-muted">{name}</span>
          )}
        </div>
      </div>

      <Async loading={isLoading} error={error}>
        {data && (
          <>
            {/* Summary strip */}
            <div className="flex divide-x divide-border border-b border-border bg-surface-1">
              {/* Buys */}
              <div className="flex-1 px-4 py-2.5">
                <div className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-0.5">
                  Buys
                </div>
                <div className="font-mono text-sm font-medium text-mint leading-none">
                  {compactMoney(summary?.buy_value)}
                </div>
                <div className="font-mono text-[9px] text-text-muted mt-0.5">
                  {summary?.buys ?? 0} trades
                </div>
              </div>

              {/* Sells */}
              <div className="flex-1 px-4 py-2.5">
                <div className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-0.5">
                  Sells
                </div>
                <div className="font-mono text-sm font-medium text-coral leading-none">
                  {compactMoney(summary?.sell_value)}
                </div>
                <div className="font-mono text-[9px] text-text-muted mt-0.5">
                  {summary?.sells ?? 0} trades
                </div>
              </div>

              {/* Net */}
              <div className="flex-1 px-4 py-2.5">
                <div className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-0.5">
                  Net
                </div>
                <div
                  className={`font-mono text-sm font-medium leading-none ${
                    (summary?.net_value ?? 0) >= 0 ? "text-mint" : "text-coral"
                  }`}
                >
                  {compactMoney(summary?.net_value)}
                </div>
                <div className="font-mono text-[9px] text-text-muted mt-0.5">
                  all time
                </div>
              </div>

              {/* Sell alert */}
              {summary?.sell_alert && (
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-coral shrink-0 animate-pulse" />
                  <span className="font-mono text-[10px] text-coral uppercase tracking-widest">
                    Insiders selling
                  </span>
                </div>
              )}
            </div>

            {/* Price chart section */}
            <div className="border-b border-border">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border-muted bg-surface-1">
                <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                  Price · 1Y
                </span>
              </div>
              {hasChart ? (
                <div className="bg-surface px-4 py-3">
                  <PriceChart
                    candles={data.prices.candles}
                    markers={data.markers ?? []}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-8">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-muted shrink-0" />
                  <span className="font-mono text-[11px] text-text-muted tracking-wider">
                    Price data unavailable
                  </span>
                </div>
              )}
            </div>

            {/* Quant panel */}
            {fundamentals && <QuantPanel fundamentals={fundamentals} />}

            {/* Insider activity */}
            <div className="border-t border-border mt-0">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border-muted bg-surface-1">
                <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                  Insider Activity
                </span>
                <span className="font-mono text-[9px] text-text-faint">
                  {data.trades.length > 0 ? `${data.trades.length} records` : ""}
                </span>
              </div>
              <TradeTable trades={data.trades} context="stock" />
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
