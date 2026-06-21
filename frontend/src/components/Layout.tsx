import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: api.status,
    refetchInterval: 15_000,
  });

  const isLive = status?.source === "live";

  const NAV_LINKS = [
    { label: "Board", to: "/" },
    { label: "Top Buys", to: "/top-buys" },
    { label: "Smart Money", to: "/smart-money" },
    { label: "Strategy", to: "/strategy" },
  ] as const;

  function isActive(to: string) {
    if (to === "/") return location.pathname === "/";
    return location.pathname.startsWith(to);
  }

  return (
    <div className="min-h-screen bg-surface relative">
      {/* scanline texture */}
      <div
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px)",
        }}
      />

      {/* Masthead */}
      <header className="border-b border-border bg-surface-1 sticky top-0 z-40">
        {/* Top bar: status + meta */}
        <div className="flex items-center justify-between px-6 py-1 border-b border-border-muted">
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
        <div className="flex items-center gap-6 px-6 py-2.5">
          <Link to="/" className="shrink-0">
            <h1 className="font-display font-bold text-2xl text-text-primary tracking-tight leading-none">
              Insider Ledger
            </h1>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1 ml-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`font-mono text-[11px] uppercase tracking-widest px-3 py-1 rounded transition-colors ${
                  isActive(link.to)
                    ? "text-mint bg-surface-2"
                    : "text-text-muted hover:text-text-secondary hover:bg-surface-2"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />
        </div>
      </header>

      <main className="relative z-10">
        {children}
      </main>
    </div>
  );
}
