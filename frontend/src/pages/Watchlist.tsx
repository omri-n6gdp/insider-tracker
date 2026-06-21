import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Async } from "../components/Async";
import { TradeTable } from "../components/TradeTable";
import type { WatchItem } from "../lib/types";

function WatchChip({ item, onRemove }: { item: WatchItem; onRemove: () => void }) {
  const to = item.kind === "ticker" ? `/stock/${item.key}` : `/insider/${item.key}`;
  return (
    <div className="flex items-center gap-2 border border-border rounded px-2.5 py-1 bg-surface-1">
      <Link
        to={to}
        className="font-mono text-[12px] text-text-primary hover:text-mint transition-colors"
      >
        {item.kind === "ticker" ? item.key : `CIK ${item.key}`}
      </Link>
      <button
        onClick={onRemove}
        title="Unwatch"
        className="font-mono text-[12px] text-text-faint hover:text-coral transition-colors leading-none"
      >
        ✕
      </button>
    </div>
  );
}

function WatchSection({
  title,
  items,
  onRemove,
}: {
  title: string;
  items: WatchItem[];
  onRemove: (it: WatchItem) => void;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest mb-2">
        {title}
      </div>
      {items.length === 0 ? (
        <span className="font-mono text-[10px] text-text-faint">None</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <WatchChip key={`${it.kind}:${it.key}`} item={it} onRemove={() => onRemove(it)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Watchlist() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist,
  });

  const remove = useMutation({
    mutationFn: (it: WatchItem) => api.removeWatch(it.kind, it.key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const watch = data?.watchlist ?? [];
  const tickers = watch.filter((w) => w.kind === "ticker");
  const insiders = watch.filter((w) => w.kind === "insider");
  const activity = data?.activity ?? [];

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
      <div className="px-6 pt-2 pb-3 border-b border-border">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="font-display font-bold text-3xl text-text-primary tracking-tight leading-none">
            Watchlist
          </h2>
          <span className="font-mono text-[11px] text-text-muted">
            Tickers & insiders you're tracking
          </span>
        </div>
      </div>

      <Async loading={isLoading} error={error}>
        {watch.length === 0 ? (
          <div className="px-6 py-10">
            <div className="flex items-start gap-3 max-w-lg">
              <span className="inline-block text-gold text-[14px] leading-none mt-0.5">☆</span>
              <p className="font-mono text-[11px] text-text-secondary leading-relaxed">
                Your watchlist is empty. Tap the <span className="text-gold">★ Watch</span> button on
                any Stock or Insider page to start tracking it. Watched items and their recent
                activity will appear here.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-border grid grid-cols-1 sm:grid-cols-2 gap-6">
              <WatchSection
                title="Watched tickers"
                items={tickers}
                onRemove={(it) => remove.mutate(it)}
              />
              <WatchSection
                title="Watched insiders"
                items={insiders}
                onRemove={(it) => remove.mutate(it)}
              />
            </div>

            <div className="px-6 pt-4 pb-2">
              <div className="font-mono text-[9px] text-text-faint uppercase tracking-widest mb-2">
                Recent activity · last 14 days
              </div>
            </div>
            <TradeTable trades={activity} context="insider" />
          </>
        )}
      </Async>
    </div>
  );
}
