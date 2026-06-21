interface Props {
  label: string;
  value: number; // 0–100
}

export function ScoreBar({ label, value }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted w-20 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-mint transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-text-secondary w-6 text-right shrink-0 leading-none">
        {Math.round(pct)}
      </span>
    </div>
  );
}
