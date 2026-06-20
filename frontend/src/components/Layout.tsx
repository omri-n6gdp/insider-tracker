import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { useSearchParam } from "../lib/useSearchParam";
import { api } from "../lib/api";
import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  const design = useSearchParam("design") ?? "a";
  const location = useLocation();

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: api.status,
    refetchInterval: 15_000,
  });

  const isLive = status?.source === "live";
  const isHome = location.pathname === "/";

  if (design === "b") {
    return <LayoutB status={status} isLive={isLive} isHome={isHome} design={design}>{children}</LayoutB>;
  }
  return <LayoutA status={status} isLive={isLive} isHome={isHome} design={design}>{children}</LayoutA>;
}

interface LayoutProps {
  children: ReactNode;
  status: { total_count: number; message: string; refreshing: boolean } | undefined;
  isLive: boolean;
  isHome: boolean;
  design: string;
}

/* ── Design A: Terminal Ledger ─────────────────────────────────────── */
function LayoutA({ children, status, isLive, isHome }: LayoutProps) {
  return (
    <div className="min-h-screen bg-surface relative">
      {/* scanline texture */}
      <div className="fixed inset-0 pointer-events-none z-50"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px)",
        }}
      />

      {/* Masthead */}
      <header className="border-b border-border bg-surface-1 sticky top-0 z-40">
        {/* Top bar: status + meta */}
        <div className="flex items-center justify-between px-6 py-1.5 border-b border-border-muted">
          <div className="flex items-center gap-3 font-mono text-[10px] text-text-muted tracking-widest uppercase">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${isLive ? "bg-mint" : "bg-gold"} ${isLive ? "live-pulse" : ""}`}
            />
            <span>{isLive ? "Live SEC" : "Sample"}</span>
            {status && (
              <>
                <span className="text-text-faint">·</span>
                <span className="text-text-muted">{status.total_count.toLocaleString()} trades</span>
              </>
            )}
            {status?.refreshing && (
              <>
                <span className="text-text-faint">·</span>
                <span className="text-gold">refreshing…</span>
              </>
            )}
          </div>
          <div className="font-mono text-[10px] text-text-faint tracking-widest uppercase">
            Form 4 / SEC EDGAR
          </div>
        </div>

        {/* Main masthead row */}
        <div className="flex items-center gap-6 px-6 py-3">
          <Link to={`/?design=a`} className="shrink-0">
            <h1 className="font-display font-bold text-2xl text-text-primary tracking-tight leading-none">
              Insider Ledger
            </h1>
          </Link>

          {/* Nav */}
          {isHome && (
            <nav className="flex items-center gap-4 ml-6">
              <Link
                to="/?design=a"
                className="font-mono text-[11px] uppercase tracking-widest text-mint border-b border-mint pb-0.5"
              >
                Board
              </Link>
            </nav>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Design toggle hint */}
          <a
            href="/?design=b"
            className="font-mono text-[10px] text-text-faint hover:text-text-muted tracking-wider border border-border px-2 py-1 transition-colors"
          >
            → Design B
          </a>
        </div>
      </header>

      <main className="relative z-10">
        {children}
      </main>
    </div>
  );
}

/* ── Design B: Dark Editorial ──────────────────────────────────────── */
function LayoutB({ children, status, isLive }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[#080a0c] relative grain">
      {/* Subtle left accent bar */}
      <div className="fixed left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-transparent via-gold to-transparent opacity-30 z-50" />

      {/* Masthead */}
      <header className="sticky top-0 z-40 bg-[#080a0c]/95 backdrop-blur-sm border-b border-[#1a1f28]">
        <div className="max-w-[1440px] mx-auto px-10 py-5 flex items-end gap-8">
          <Link to="/?design=b" className="shrink-0">
            <div className="flex flex-col">
              <span
                className="font-display italic font-light text-3xl leading-none tracking-tight"
                style={{ color: "#f0ece4" }}
              >
                Insider Ledger
              </span>
              <span className="font-mono text-[9px] tracking-[0.2em] text-text-muted uppercase mt-1">
                SEC Form 4 Intelligence
              </span>
            </div>
          </Link>

          {/* Live indicator */}
          <div className="flex items-center gap-2 mb-0.5">
            <div
              className={`w-2 h-2 rounded-full ${isLive ? "bg-mint" : "bg-gold"} ${isLive ? "live-pulse" : ""}`}
            />
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">
              {isLive ? "Live" : "Sample"}
            </span>
            {status && (
              <span className="font-mono text-[10px] text-text-faint ml-2">
                {status.total_count.toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Date */}
          <div className="mb-0.5 text-right">
            <p className="font-mono text-[10px] text-text-faint tracking-wider uppercase">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Design toggle */}
          <a
            href="/?design=a"
            className="mb-0.5 font-mono text-[10px] text-text-faint hover:text-text-muted tracking-wider border border-[#1e2836] px-2 py-1 transition-colors"
          >
            → Design A
          </a>
        </div>

        {/* Rule */}
        <div className="border-t border-[#1a1f28] mx-10" />
      </header>

      <main>
        {children}
      </main>
    </div>
  );
}
