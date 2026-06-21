import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { compactMoney } from "../lib/format";
import { Async } from "../components/Async";
import { TradeTable } from "../components/TradeTable";
import type { Cluster, Holding } from "../lib/types";

function SectionHeader({ dot, title, count }: { dot: string; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-6 py-2 border-b border-border bg-surface-1">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary">
        {title}
      </span>
      <span className="font-mono text-[9px] text-text-faint">({count})</span>
    </div>
  );
}

function ClusterLine({ c }: { c: Cluster }) {
  return (
    <Link
      to={`/stock/${c.ticker}`}
      className="flex items-baseline justify-between gap-3 px-6 py-2 border-b border-border-muted hover:bg-surface-1 transition-colors group"
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-mono text-[12px] font-medium text-gold">{c.ticker}</span>
        <span className="font-mono text-[9px] text-text-muted bg-surface-3 px-1 py-0.5 rounded leading-none">
          {c.owners}×
        </span>
        <span className="font-mono text-[10px] text-text-muted truncate" title={c.issuer_name}>
          {c.issuer_name}
        </span>
      </div>
      <span className="font-mono text-[11px] text-text-secondary tabular-nums shrink-0">
        {compactMoney(c.total_value)}
      </span>
    </Link>
  );
}

function AlertLine({ h }: { h: Holding }) {
  return (
    <Link
      to={`/stock/${h.ticker}`}
      className="flex items-baseline justify-between gap-3 px-6 py-2 border-b border-border-muted hover:bg-surface-1 transition-colors"
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-mono text-[9px] font-medium text-coral bg-coral-dim px-1.5 py-0.5 rounded tracking-wider">
          SELL-ALERT
        </span>
        <span className="font-mono text-[12px] font-medium text-text-primary">{h.ticker}</span>
      </div>
      <span className="font-mono text-[11px] text-coral tabular-nums shrink-0">
        {h.insider ? compactMoney(h.insider.net_value) : "—"}
      </span>
    </Link>
  );
}

export default function Digest() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["digest"],
    queryFn: api.digest,
  });

  const clusters = data?.clusters ?? [];
  const alerts = data?.holdings_alerts ?? [];
  const activity = data?.watchlist_activity ?? [];

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
            Daily Digest
          </h2>
          <span className="font-mono text-[11px] text-text-muted">
            The few things worth knowing today
          </span>
        </div>
        <p className="font-mono text-[10px] text-text-faint leading-relaxed mt-2 max-w-2xl">
          Composed from fresh cluster buys, insider selling in your holdings, and activity in your
          watchlist. A desktop notification fires once a day while the app is running.
        </p>
      </div>

      <Async loading={isLoading} error={error}>
        {/* Cluster buys */}
        <SectionHeader dot="bg-gold" title="Fresh cluster buys" count={clusters.length} />
        {clusters.length === 0 ? (
          <p className="px-6 py-3 font-mono text-[10px] text-text-faint">No cluster buys right now.</p>
        ) : (
          clusters.map((c) => <ClusterLine key={c.ticker} c={c} />)
        )}

        {/* Holdings sell-alerts */}
        <SectionHeader dot="bg-coral" title="Holdings sell-alerts" count={alerts.length} />
        {alerts.length === 0 ? (
          <p className="px-6 py-3 font-mono text-[10px] text-text-faint">
            No insider selling in your holdings.
          </p>
        ) : (
          alerts.map((h) => <AlertLine key={h.raw_ticker} h={h} />)
        )}

        {/* Watchlist activity */}
        <SectionHeader dot="bg-mint" title="Watchlist activity" count={activity.length} />
        {activity.length === 0 ? (
          <p className="px-6 py-3 font-mono text-[10px] text-text-faint">
            Nothing new in your watchlist — star tickers or insiders to populate this.
          </p>
        ) : (
          <TradeTable trades={activity} context="insider" />
        )}
      </Async>
    </div>
  );
}
