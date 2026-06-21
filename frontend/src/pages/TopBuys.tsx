import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { compactMoney } from "../lib/format";
import { ScoreBar } from "../components/ScoreBar";
import { Async } from "../components/Async";
import type { Recommendation } from "../lib/types";

const SUBSCORE_LABELS: Record<keyof Recommendation["subscores"], string> = {
  cluster: "Cluster",
  seniority: "Seniority",
  size: "Size",
  track: "Track",
  valuation: "Valuation",
};

const SUBSCORE_ORDER: (keyof Recommendation["subscores"])[] = [
  "cluster",
  "seniority",
  "size",
  "track",
  "valuation",
];

function RecommendationCard({
  rec,
  rank,
}: {
  rec: Recommendation;
  rank: number;
}) {
  return (
    <div className="border-b border-border last:border-b-0 bg-surface hover:bg-surface-1 transition-colors">
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          {/* Rank number */}
          <div className="shrink-0 w-6 text-right pt-0.5">
            <span className="font-mono text-[10px] text-text-faint">{rank}</span>
          </div>

          {/* Ticker + issuer */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap mb-0.5">
              <Link
                to={`/stock/${rec.ticker}`}
                className="font-mono text-sm font-medium text-mint hover:text-text-primary transition-colors tracking-wide"
              >
                {rec.ticker}
              </Link>
              {rec.issuer_name && (
                <span className="font-mono text-[11px] text-text-muted truncate">
                  {rec.issuer_name}
                </span>
              )}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="font-mono text-[9px] uppercase tracking-widest text-text-faint">
                {rec.owners} {rec.owners === 1 ? "buyer" : "buyers"}
              </span>
              <span className="font-mono text-[9px] text-text-faint">·</span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                {compactMoney(rec.buy_value)} bought
              </span>
              {rec.pe != null && (
                <>
                  <span className="font-mono text-[9px] text-text-faint">·</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                    P/E {rec.pe.toFixed(0)}
                  </span>
                </>
              )}
              {rec.market_cap != null && (
                <>
                  <span className="font-mono text-[9px] text-text-faint">·</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                    Mkt cap {compactMoney(rec.market_cap)}
                  </span>
                </>
              )}
            </div>

            {/* Score bars */}
            <div className="flex flex-col gap-1.5">
              {SUBSCORE_ORDER.map((key) => (
                <ScoreBar
                  key={key}
                  label={SUBSCORE_LABELS[key]}
                  value={rec.subscores[key]}
                />
              ))}
            </div>
          </div>

          {/* Total score */}
          <div className="shrink-0 flex flex-col items-end justify-center pl-2">
            <div className="font-display font-bold text-4xl text-text-primary leading-none tabular-nums">
              {Math.round(rec.score)}
            </div>
            <div className="font-mono text-[8px] uppercase tracking-widest text-text-muted mt-1">
              /100
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TopBuys() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => api.recommendations(),
  });

  const recs = data?.recommendations ?? [];

  return (
    <div className="max-w-4xl mx-auto pb-12">
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
            Top Buys
          </h2>
          <span className="font-mono text-[11px] text-text-muted">
            Ranked by multi-factor insider conviction
          </span>
        </div>
      </div>

      {/* Score legend strip */}
      <div className="flex items-center gap-4 flex-wrap px-6 py-2.5 border-b border-border-muted bg-surface-1">
        <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted shrink-0">
          Score factors
        </span>
        {SUBSCORE_ORDER.map((key) => (
          <span key={key} className="font-mono text-[9px] text-text-faint flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-mint opacity-60" />
            {SUBSCORE_LABELS[key]}
          </span>
        ))}
        <div className="flex-1" />
        <span className="font-mono text-[9px] text-text-faint">
          {!isLoading && `${recs.length} tickers`}
        </span>
      </div>

      <Async loading={isLoading} error={error} empty={!isLoading && !error && recs.length === 0} emptyText="No open-market buys in the last 30 days.">
        <div className="divide-y divide-border-muted stagger">
          {recs.map((rec, i) => (
            <RecommendationCard key={rec.ticker} rec={rec} rank={i + 1} />
          ))}
        </div>
      </Async>

      {/* Footnote */}
      <div className="px-6 pt-6 pb-2">
        <p className="font-mono text-[9px] text-text-faint leading-relaxed max-w-xl">
          Scores are a transparent, rules-based blend of five factors (cluster, seniority, buy size relative to market cap, insider track record, and valuation). They rank observable conviction — not a recommendation to buy or sell. Always do your own research.
        </p>
      </div>
    </div>
  );
}
