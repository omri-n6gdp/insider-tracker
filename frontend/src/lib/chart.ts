import type { SeriesMarkerShape } from "lightweight-charts";
import type { Candle, Marker } from "./types";

export interface LWCandle { time: string; open: number; high: number; low: number; close: number; }
export interface LWMarker { time: string; position: "aboveBar" | "belowBar"; color: string; shape: SeriesMarkerShape; text: string; }

const BUY = "#34d399";   // mint
const SELL = "#fb7185";  // coral

export function toCandles(candles: Candle[]): LWCandle[] {
  return candles.map((c) => ({
    time: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
  }));
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
