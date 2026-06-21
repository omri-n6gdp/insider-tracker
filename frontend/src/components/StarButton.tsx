import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Props {
  kind: "ticker" | "insider";
  itemKey: string;
  label?: string;
}

/** A star toggle that watches/unwatches a ticker or insider. Self-fetches the
 *  watchlist to know its own state; gold when active. */
export function StarButton({ kind, itemKey, label = "Watch" }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist });
  const watched =
    data?.watchlist.some((w) => w.kind === kind && w.key === itemKey) ?? false;

  const mutation = useMutation({
    mutationFn: () =>
      watched ? api.removeWatch(kind, itemKey) : api.addWatch(kind, itemKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      title={watched ? "Unwatch" : "Add to watchlist"}
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border transition-colors ${
        watched
          ? "text-gold border-gold-dim bg-gold-dim/20"
          : "text-text-muted border-border hover:text-gold hover:border-gold-dim"
      } ${mutation.isPending ? "opacity-50" : ""}`}
    >
      <span className="text-[13px] leading-none">{watched ? "★" : "☆"}</span>
      <span>{watched ? "Watching" : label}</span>
    </button>
  );
}
