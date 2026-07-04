export function money(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || v === 0) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
}

export function compactMoney(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || v === 0) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function signedPct(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function shares(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

/** Whether a trade has a real, linkable ticker. The backend blanks placeholder
 *  symbols (NONE/N/A/…) to "", so ticker-less filings shouldn't render a
 *  /stock/ link that would 404. */
export function hasTicker(t: string | null | undefined): boolean {
  return !!t && t.trim() !== "";
}
