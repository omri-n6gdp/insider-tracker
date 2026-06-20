import type { ReactNode } from "react";

export function Async({
  loading,
  error,
  empty,
  emptyText = "No data",
  children,
}: {
  loading: boolean;
  error: unknown;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-muted animate-pulse" />
        <span className="font-mono text-[11px] text-text-muted tracking-wider">Loading…</span>
      </div>
    );
  }

  if (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "An error occurred";
    return (
      <div className="flex items-center gap-2 px-4 py-6">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-coral shrink-0" />
        <span className="font-mono text-[11px] text-coral tracking-wider">{msg}</span>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex items-center justify-center px-4 py-10">
        <span className="font-mono text-[11px] text-text-muted tracking-wider">{emptyText}</span>
      </div>
    );
  }

  return <>{children}</>;
}
