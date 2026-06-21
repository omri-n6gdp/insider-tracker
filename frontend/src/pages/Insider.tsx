import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { compactMoney } from "../lib/format";
import { TradeTable } from "../components/TradeTable";
import { Async } from "../components/Async";
import { StarButton } from "../components/StarButton";

export default function Insider() {
  const { cik } = useParams<{ cik: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["insider", cik],
    queryFn: () => api.insider(cik!),
    enabled: !!cik,
  });

  const summary = data?.summary;

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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <h2 className="font-display font-bold text-3xl text-text-primary tracking-tight leading-none">
              {data?.owner_name ?? "Insider"}
            </h2>
            {data?.roles && (
              <span className="font-mono text-[11px] text-text-muted">
                {data.roles}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {cik && <StarButton kind="insider" itemKey={cik} />}
            {data?.track && (
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                    Smart-money rating
                  </span>
                  <span className="font-mono text-xl font-medium text-mint tabular-nums leading-none">
                    {Math.round(data.track.rating)}
                    <span className="font-mono text-[11px] text-text-muted">/100</span>
                  </span>
                </div>
                <span className="font-mono text-[9px] text-text-faint">
                  {data.track.n_buys} qualifying {data.track.n_buys === 1 ? "buy" : "buys"}
                </span>
              </div>
            )}
          </div>
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
            </div>

            {/* Tickers held / traded */}
            {data.tickers.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-border bg-surface">
                <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted shrink-0">
                  Holds / Traded
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {data.tickers.map((t) => (
                    <Link
                      key={t}
                      to={`/stock/${t}`}
                      className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface-3 border border-border text-text-secondary hover:text-mint hover:border-mint transition-colors leading-none"
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Cross-company history */}
            <div className="border-t border-border">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border-muted bg-surface-1">
                <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                  Trading History
                </span>
                <span className="font-mono text-[9px] text-text-faint">
                  {data.trades.length > 0 ? `${data.trades.length} records` : ""}
                </span>
              </div>
              <TradeTable trades={data.trades} context="insider" />
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
