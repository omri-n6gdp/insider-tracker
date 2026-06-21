import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { signedPct, compactMoney } from "../lib/format";
import { EquityChart } from "../components/EquityChart";
import type { BacktestResult, Strategy as StrategyType, Scoreboard, StrategyRule } from "../lib/types";

// ── helpers ────────────────────────────────────────────────────────────────

function MetricCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "mint" | "coral" | "gold" | "neutral";
}) {
  const colorMap: Record<string, string> = {
    mint: "text-mint",
    coral: "text-coral",
    gold: "text-gold",
    neutral: "text-text-secondary",
  };
  const color = colorMap[accent ?? "neutral"] ?? "text-text-secondary";
  return (
    <div className="flex-1 px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
        {label}
      </div>
      <div className={`font-mono text-sm font-medium leading-none ${color}`}>{value}</div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2 border-b border-border-muted bg-surface-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
        {children}
      </span>
    </div>
  );
}

// ── Scoreboard row ─────────────────────────────────────────────────────────

function ScoreboardSummary({ strategyId }: { strategyId: number }) {
  const [sb, setSb] = useState<Scoreboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .scoreboard(strategyId)
      .then(setSb)
      .catch(() => setSb(null))
      .finally(() => setLoading(false));
  }, [strategyId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-5 py-2">
        <span className="inline-block w-1 h-1 rounded-full bg-text-muted animate-pulse" />
        <span className="font-mono text-[10px] text-text-muted">Loading scoreboard…</span>
      </div>
    );
  }

  if (!sb) return null;

  const hasActivity = sb.open > 0 || sb.closed > 0;

  return (
    <div className="flex items-center gap-4 px-5 py-2 flex-wrap border-t border-border-muted">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-faint shrink-0">
        Scoreboard
      </span>
      {!hasActivity ? (
        <span className="font-mono text-[10px] text-text-muted italic">
          No positions yet — results deepen after building history
        </span>
      ) : (
        <>
          <span className="font-mono text-[10px] text-text-muted">
            <span className="text-text-secondary">{sb.open}</span> open
          </span>
          <span className="font-mono text-[10px] text-text-faint">·</span>
          <span className="font-mono text-[10px] text-text-muted">
            <span className="text-text-secondary">{sb.closed}</span> closed
          </span>
          {sb.closed > 0 && (
            <>
              <span className="font-mono text-[10px] text-text-faint">·</span>
              <span
                className={`font-mono text-[10px] ${sb.realized_pnl >= 0 ? "text-mint" : "text-coral"}`}
              >
                P&amp;L {compactMoney(sb.realized_pnl)}
              </span>
              {sb.win_rate != null && (
                <>
                  <span className="font-mono text-[10px] text-text-faint">·</span>
                  <span className="font-mono text-[10px] text-text-muted">
                    Win {(sb.win_rate * 100).toFixed(0)}%
                  </span>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Strategy card ──────────────────────────────────────────────────────────

function StrategyCard({
  s,
  onToggle,
  onDelete,
}: {
  s: StrategyType;
  onToggle: (id: number, active: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const rule = s.rule;
  const isActive = Boolean(s.active);

  const ruleParts: string[] = [];
  if (rule.min_cluster_owners && rule.min_cluster_owners > 1)
    ruleParts.push(`${rule.min_cluster_owners}+ cluster`);
  if (rule.min_value) ruleParts.push(`≥${compactMoney(rule.min_value)}`);
  if (rule.roles) ruleParts.push(`role: ${rule.roles}`);
  if (rule.hold_days) ruleParts.push(`hold ${rule.hold_days}d`);

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Top row */}
      <div className="flex items-start gap-3 px-5 py-3">
        {/* Active dot */}
        <div className="shrink-0 pt-1.5">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              isActive ? "bg-mint live-pulse" : "bg-text-faint"
            }`}
          />
        </div>

        {/* Name + rule pills */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
            <span className="font-mono text-sm font-medium text-text-primary">{s.name}</span>
            {isActive && (
              <span className="font-mono text-[8px] uppercase tracking-widest text-mint border border-mint-dim px-1.5 py-0.5 rounded">
                Active
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ruleParts.map((p) => (
              <span
                key={p}
                className="font-mono text-[9px] text-text-muted bg-surface-2 px-2 py-0.5 rounded border border-border-muted"
              >
                {p}
              </span>
            ))}
            {ruleParts.length === 0 && (
              <span className="font-mono text-[9px] text-text-faint italic">No filters</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onToggle(s.id, !isActive)}
            className={`font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded border transition-colors ${
              isActive
                ? "border-mint-dim text-mint hover:bg-mint-dim"
                : "border-border text-text-muted hover:border-mint-dim hover:text-mint"
            }`}
          >
            {isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={() => onDelete(s.id)}
            className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 rounded border border-border text-text-faint hover:border-coral-dim hover:text-coral transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <ScoreboardSummary strategyId={s.id} />
    </div>
  );
}

// ── Rule Builder ───────────────────────────────────────────────────────────

interface RuleState {
  name: string;
  min_cluster_owners: number;
  min_value: string;
  roles: string;
  hold_days: number;
}

const HOLD_PICKS = [21, 63, 126] as const;
const CLUSTER_PICKS = [1, 2, 3, 4] as const;

function RuleBuilder({
  rule,
  onChange,
}: {
  rule: RuleState;
  onChange: (r: RuleState) => void;
}) {
  function set<K extends keyof RuleState>(k: K, v: RuleState[K]) {
    onChange({ ...rule, [k]: v });
  }

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Name */}
      <div>
        <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1.5">
          Strategy name
        </label>
        <input
          type="text"
          value={rule.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Cluster 2+ Officers"
          className="w-full bg-surface-2 border border-border text-text-primary font-mono text-sm px-3 py-2 rounded focus:outline-none focus:border-mint transition-colors placeholder:text-text-faint"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Cluster owners */}
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1.5">
            Min cluster owners
          </label>
          <div className="flex gap-1">
            {CLUSTER_PICKS.map((n) => (
              <button
                key={n}
                onClick={() => set("min_cluster_owners", n)}
                className={`flex-1 font-mono text-[10px] py-1.5 rounded border transition-colors ${
                  rule.min_cluster_owners === n
                    ? "border-gold text-gold bg-gold-dim"
                    : "border-border text-text-muted hover:border-border hover:text-text-secondary"
                }`}
              >
                {n}+
              </button>
            ))}
          </div>
        </div>

        {/* Hold days */}
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1.5">
            Hold days
          </label>
          <div className="flex gap-1">
            {HOLD_PICKS.map((d) => (
              <button
                key={d}
                onClick={() => set("hold_days", d)}
                className={`flex-1 font-mono text-[10px] py-1.5 rounded border transition-colors ${
                  rule.hold_days === d
                    ? "border-mint text-mint bg-mint-dim"
                    : "border-border text-text-muted hover:border-border hover:text-text-secondary"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Min buy value */}
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1.5">
            Min buy value ($)
          </label>
          <input
            type="number"
            value={rule.min_value}
            onChange={(e) => set("min_value", e.target.value)}
            placeholder="e.g. 100000"
            className="w-full bg-surface-2 border border-border text-text-primary font-mono text-sm px-3 py-2 rounded focus:outline-none focus:border-mint transition-colors placeholder:text-text-faint"
          />
        </div>

        {/* Role contains */}
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1.5">
            Role contains
          </label>
          <input
            type="text"
            value={rule.roles}
            onChange={(e) => set("roles", e.target.value)}
            placeholder="e.g. officer, director, CEO"
            className="w-full bg-surface-2 border border-border text-text-primary font-mono text-sm px-3 py-2 rounded focus:outline-none focus:border-mint transition-colors placeholder:text-text-faint"
          />
        </div>
      </div>
    </div>
  );
}

// ── Backtest Results ───────────────────────────────────────────────────────

function BacktestPanel({ result }: { result: BacktestResult }) {
  const hasData = result.n_trades > 0;
  const totalReturnAccent = result.total_return >= 0 ? "mint" : "coral";
  const benchAccent = result.benchmark_total_return >= 0 ? "mint" : "coral";

  return (
    <div>
      {/* Metrics strip */}
      <div className="flex divide-x divide-border border-b border-border bg-surface-1">
        <MetricCell label="Trades" value={hasData ? String(result.n_trades) : "—"} />
        <MetricCell
          label="Win rate"
          value={hasData ? signedPct(result.win_rate * 100) : "—"}
          accent={hasData ? (result.win_rate >= 0.5 ? "mint" : "coral") : "neutral"}
        />
        <MetricCell
          label="Avg return"
          value={hasData ? signedPct(result.avg_return * 100) : "—"}
          accent={hasData ? (result.avg_return >= 0 ? "mint" : "coral") : "neutral"}
        />
        <MetricCell
          label="Total return"
          value={hasData ? signedPct(result.total_return * 100) : "—"}
          accent={hasData ? totalReturnAccent : "neutral"}
        />
        <MetricCell
          label="vs SPY"
          value={hasData ? signedPct(result.benchmark_total_return * 100) : "—"}
          accent={hasData ? benchAccent : "neutral"}
        />
      </div>

      {/* Equity chart */}
      <div className="border-b border-border">
        <div className="flex items-center gap-4 px-5 py-2 bg-surface-1 border-b border-border-muted">
          <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
            Equity curve
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] text-mint">
            <span className="inline-block w-3 h-0.5 bg-mint rounded" /> Strategy
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] text-text-muted">
            <span className="inline-block w-3 h-0.5 bg-text-muted rounded opacity-60" /> SPY benchmark
          </span>
        </div>
        {hasData && result.equity.length > 0 ? (
          <div className="px-4 py-3 bg-surface">
            <EquityChart equity={result.equity} benchmark={result.benchmark} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-5 py-10 gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-faint" />
            <span className="font-mono text-[11px] text-text-muted text-center">
              No qualifying trades found in the current dataset.
              <br />
              Results deepen after building history — click{" "}
              <span className="text-gold">Build history</span> below.
            </span>
          </div>
        )}
      </div>

      {hasData && (
        <div className="px-5 py-2 flex items-center gap-2 border-b border-border-muted bg-surface-1">
          <span className="font-mono text-[9px] text-text-faint">
            Signals matched: {result.signals}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Build History ──────────────────────────────────────────────────────────

function BuildHistory() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<{
    running: boolean;
    cursor: string | null;
    last: Record<string, unknown> | null;
  } | null>(null);
  const [started, setStarted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.backfillStatus().then(setStatus).catch(() => {});
  }, []);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPoll = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(() => {
      api
        .backfillStatus()
        .then((s) => {
          setStatus(s);
          if (!s.running) {
            stopPoll();
            setRunning(false);
          }
        })
        .catch(() => {});
    }, 2000);
  }, [stopPoll]);

  useEffect(() => () => stopPoll(), [stopPoll]);

  async function handleStart() {
    setRunning(true);
    setStarted(true);
    try {
      await api.backfill(20);
      startPoll();
    } catch {
      setRunning(false);
    }
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <p className="font-mono text-[10px] text-text-muted leading-relaxed max-w-lg">
        Pull historical Form 4 data from SEC EDGAR daily indexes — bounded to 20 trading days per run,
        fully resumable. Each run deepens the backtest dataset. Run it a few times to accumulate
        months of history.
      </p>

      <div className="flex items-center gap-4">
        <button
          onClick={handleStart}
          disabled={running}
          className={`font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded border transition-colors ${
            running
              ? "border-border text-text-faint cursor-not-allowed"
              : "border-gold text-gold hover:bg-gold-dim"
          }`}
        >
          {running ? "Running…" : "Build history"}
        </button>

        {(started || status?.cursor) && (
          <div className="flex items-center gap-2">
            {(running || status?.running) && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            )}
            <span className="font-mono text-[10px] text-text-muted">
              {status?.running
                ? "Fetching SEC daily indexes…"
                : status?.cursor
                ? `Cursor: ${status.cursor}`
                : started
                ? "Starting…"
                : ""}
            </span>
          </div>
        )}
      </div>

      {status?.last && !status.running && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-[9px] uppercase tracking-widest text-text-faint">
            Last run
          </span>
          {(["inserted", "processed", "errors", "days"] as const).map((k) => {
            const v = status.last?.[k];
            if (v === undefined) return null;
            return (
              <span key={k} className="font-mono text-[9px] text-text-muted">
                <span className="text-text-secondary">{String(v)}</span> {k}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Strategy() {
  const [rule, setRule] = useState<RuleState>({
    name: "",
    min_cluster_owners: 2,
    min_value: "",
    roles: "",
    hold_days: 63,
  });

  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtesting, setBacktesting] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const [strategies, setStrategies] = useState<StrategyType[]>([]);
  const [saving, setSaving] = useState(false);

  const loadStrategies = useCallback(() => {
    api
      .strategies()
      .then((d) => setStrategies(d.strategies))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  function buildRule(): StrategyRule {
    const r: StrategyRule = {
      min_cluster_owners: rule.min_cluster_owners,
      hold_days: rule.hold_days,
    };
    if (rule.min_value && Number(rule.min_value) > 0) r.min_value = Number(rule.min_value);
    if (rule.roles.trim()) r.roles = rule.roles.trim();
    return r;
  }

  async function handleBacktest() {
    setBacktesting(true);
    setBacktestError(null);
    try {
      const result = await api.backtest(buildRule());
      setBacktestResult(result);
    } catch (e) {
      setBacktestError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setBacktesting(false);
    }
  }

  async function handleSave() {
    const name = rule.name.trim() || "Untitled Strategy";
    setSaving(true);
    try {
      await api.createStrategy(name, buildRule());
      await loadStrategies();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: number, active: boolean) {
    await api.setStrategyActive(id, active).catch(() => {});
    loadStrategies();
  }

  async function handleDelete(id: number) {
    await api.deleteStrategy(id).catch(() => {});
    loadStrategies();
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Back link */}
      <div className="px-6 pt-4 pb-1">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-text-muted hover:text-text-secondary transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Board
        </Link>
      </div>

      {/* Page header */}
      <div className="px-6 pt-2 pb-4 border-b border-border">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="font-display font-bold text-3xl text-text-primary tracking-tight leading-none">
            Strategy Lab
          </h2>
          <span className="font-mono text-[11px] text-text-muted">
            Define a rule · Backtest · Track live
          </span>
        </div>
      </div>

      {/* ── Rule Builder ──────────────────────────────────────── */}
      <div className="border-b border-border">
        <SectionHeader>Rule builder</SectionHeader>
        <RuleBuilder rule={rule} onChange={setRule} />

        {/* Action buttons */}
        <div className="flex items-center gap-3 px-5 pb-4">
          <button
            onClick={handleBacktest}
            disabled={backtesting}
            className={`font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded border transition-colors ${
              backtesting
                ? "border-border text-text-faint cursor-not-allowed"
                : "border-mint text-mint hover:bg-mint-dim"
            }`}
          >
            {backtesting ? "Running backtest…" : "Backtest"}
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded border transition-colors ${
              saving
                ? "border-border text-text-faint cursor-not-allowed"
                : "border-gold text-gold hover:bg-gold-dim"
            }`}
          >
            {saving ? "Saving…" : "Save & activate"}
          </button>
        </div>
      </div>

      {/* ── Backtest results ──────────────────────────────────── */}
      {(backtesting || backtestResult || backtestError) && (
        <div className="border-b border-border">
          <SectionHeader>Backtest results</SectionHeader>
          {backtesting && (
            <div className="flex items-center gap-2 px-5 py-6">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-mint animate-pulse" />
              <span className="font-mono text-[11px] text-text-muted tracking-wider">
                Running backtest…
              </span>
            </div>
          )}
          {backtestError && (
            <div className="flex items-center gap-2 px-5 py-4">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-coral shrink-0" />
              <span className="font-mono text-[11px] text-coral tracking-wider">
                {backtestError}
              </span>
            </div>
          )}
          {backtestResult && !backtesting && <BacktestPanel result={backtestResult} />}
        </div>
      )}

      {/* ── Saved strategies ──────────────────────────────────── */}
      <div className="border-b border-border">
        <div className="flex items-center justify-between px-5 py-2 border-b border-border-muted bg-surface-1">
          <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
            Saved strategies
          </span>
          <span className="font-mono text-[9px] text-text-faint">{strategies.length} saved</span>
        </div>
        {strategies.length === 0 ? (
          <div className="flex items-center justify-center px-5 py-8">
            <span className="font-mono text-[11px] text-text-muted">
              No strategies yet — save one above to start tracking it live.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-border-muted">
            {strategies.map((s) => (
              <StrategyCard
                key={s.id}
                s={s}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Build history ─────────────────────────────────────── */}
      <div className="border-b border-border">
        <SectionHeader>Build history</SectionHeader>
        <BuildHistory />
      </div>

      {/* Footnote */}
      <div className="px-6 pt-5 pb-2">
        <p className="font-mono text-[9px] text-text-faint leading-relaxed max-w-xl">
          Backtest is a simplified sequential equal-bankroll model: $1 is allocated to each signal in
          date order, held for the specified number of trading days, compared to SPY over the same
          windows. Compounded. Assumes fills at close price. Not financial advice. Results depend on
          available history — run "Build history" to deepen the dataset.
        </p>
      </div>
    </div>
  );
}
