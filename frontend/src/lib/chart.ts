import type { SeriesMarkerShape } from "lightweight-charts";
import type { Candle, Marker, EquityPoint } from "./types";

export interface LWCandle { time: string; open: number; high: number; low: number; close: number; }
export interface LWMarker { time: string; position: "aboveBar" | "belowBar"; color: string; shape: SeriesMarkerShape; text: string; }

const BUY = "#34d399";   // mint
const SELL = "#fb7185";  // coral

export function toCandles(candles: Candle[]): LWCandle[] {
  return candles.map((c) => ({
    time: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
  }));
}

/** Collapse equity/benchmark points that share a date to a single point per
 *  date, keeping the last value (the fully-compounded value after all trades
 *  on that day). lightweight-charts' setData requires strictly ascending,
 *  unique times — the backtester emits one point per trade, so multiple
 *  same-day trades would otherwise produce duplicate timestamps and throw. */
export function dedupeByDate(points: EquityPoint[]): EquityPoint[] {
  const byDate = new Map<string, number>();
  for (const p of points) byDate.set(p.date, p.value);   // last write wins
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, value]) => ({ date, value }));
}

export function toMarkers(markers: Marker[]): LWMarker[] {
  return markers
    .map((m) => ({
      time: m.date,
      position: m.kind === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
      color: m.kind === "buy" ? BUY : SELL,
      shape: (m.kind === "buy" ? "arrowUp" : "arrowDown") as SeriesMarkerShape,
      text: m.kind === "buy" ? "B" : "S",
    }))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}
