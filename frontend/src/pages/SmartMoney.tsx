import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { signedPct } from "../lib/format";
import { Async } from "../components/Async";
import type { InsiderTrack } from "../lib/types";

function RatingChip({ rating }: { rating: number }) {
  const r = Math.round(rating);
  const color =
    r >= 70 ? "text-mint border-mint-dim" : r >= 50 ? "text-gold border-gold-dim" : "text-coral border-coral-dim";
  return (
    <span
      className={`font-mono text-sm font-medium tabular-nums px-2 py-0.5 rounded border ${color} leading-none`}
    >
      {r}
    </span>
  );
}

function InsiderRow({ entry, rank }: { entry: InsiderTrack; rank: number }) {
  const hasReturn = entry.avg_ret_3m != null;
  const hasWinRate = entry.win_rate != null;

  return (
    <div
      className="px-4 py-3 border-b border-border-muted last:border-b-0 hover:bg-surface-1 transition-colors"
      style={{
        display: "grid",
        gridTemplateColumns: "28px minmax(0,1fr) 60px 80px 80px 56px",
        alignItems: "center",
        gap: "0 12px",
      }}
    >
      {/* Rank */}
      <span className="font-mono text-[10px] text-text-faint text-right">{rank}</span>

      {/* Name */}
      <Link
        to={`/insider/${entry.owner_cik}`}
        className="font-mono text-[11px] text-text-secondary hover:text-mint transition-colors truncate"
      >
        {entry.owner_name ?? entry.owner_cik}
      </Link>

      {/* Rating */}
      <div className="flex justify-center">
        <RatingChip rating={entry.rating} />
      </div>

      {/* n_buys */}
      <span className="font-mono text-[10px] text-text-muted text-right">
        {entry.n_buys} {entry.n_buys === 1 ? "buy" : "buys"}
      </span>

      {/* 3m avg return */}
      <span
        className={`font-mono text-[10px] text-right ${
          hasReturn
            ? (entry.avg_ret_3m! >= 0 ? "text-mint" : "text-coral")
            : "text-text-faint"
        }`}
      >
        {hasReturn ? signedPct((entry.avg_ret_3m! * 100)) : "—"}
      </span>

      {/* Win rate */}
      <span
        className={`font-mono text-[10px] text-right ${
          hasWinRate ? "text-text-secondary" : "text-text-faint"
        }`}
      >
        {hasWinRate ? `${Math.round(entry.win_rate! * 100)}%` : "—"}
      </span>
    </div>
  );
}

export default function SmartMoney() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["smart-money"],
    queryFn: () => api.smartMoney(),
  });

  const insiders = data?.insiders ?? [];

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
            Smart Money
          </h2>
          <span className="font-mono text-[11px] text-text-muted">
            Insider track-record leaderboard
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div
        className="px-4 py-1.5 border-b border-border bg-surface-1 shrink-0"
        style={{
          display: "grid",
          gridTemplateColumns: "28px minmax(0,1fr) 60px 80px 80px 56px",
          alignItems: "center",
          gap: "0 12px",
        }}
      >
        <div />
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest">Insider</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-center">Rating</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Buys</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">3M Avg</div>
        <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest text-right">Win %</div>
      </div>

      <Async loading={isLoading} error={error}>
        {insiders.length === 0 ? (
          <div className="px-6 py-10 border-b border-border-muted">
            <div className="flex items-start gap-3 max-w-lg">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold mt-1.5 shrink-0" />
              <div>
                <p className="font-mono text-[11px] text-text-secondary leading-relaxed mb-2">
                  Ratings are building.
                </p>
                <p className="font-mono text-[10px] text-text-muted leading-relaxed">
                  The Smart Money rating measures each insider's 3-month forward returns (market-adjusted) across their recorded buys. We need at least 2 qualifying buys with sufficient price history before a rating can be issued. As history accumulates — typically over several weeks — ratings will appear here automatically.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="stagger">
            {insiders.map((entry, i) => (
              <InsiderRow key={entry.owner_cik} entry={entry} rank={i + 1} />
            ))}
          </div>
        )}
      </Async>

      {/* Footnote */}
      <div className="px-6 pt-6 pb-2">
        <p className="font-mono text-[9px] text-text-faint leading-relaxed max-w-xl">
          Rating = market-adjusted 3-month return after each open-market buy, small-sample-shrunk toward neutral (50). Requires ≥2 qualifying buys with price history. Past performance doesn't predict future results.
        </p>
      </div>
    </div>
  );
}
