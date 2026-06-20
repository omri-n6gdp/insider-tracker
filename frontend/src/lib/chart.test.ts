import { describe, it, expect } from "vitest";
import { toCandles, toMarkers } from "./chart";
import type { Candle, Marker } from "./types";

const candles: Candle[] = [
  { date: "2026-06-10", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
];
const markers: Marker[] = [
  { date: "2026-06-10", kind: "buy", price: 1.2, owner_name: "Jane", shares: 100, value: 120 },
  { date: "2026-06-11", kind: "sell", price: 1.8, owner_name: "Bob", shares: 50, value: 90 },
];

describe("chart transforms", () => {
  it("maps candles to lightweight-charts shape", () => {
    expect(toCandles(candles)).toEqual([
      { time: "2026-06-10", open: 1, high: 2, low: 0.5, close: 1.5 },
    ]);
  });
  it("maps insider trades to markers, sorted by time, colored by kind", () => {
    const m = toMarkers(markers);
    expect(m[0]).toMatchObject({ time: "2026-06-10", position: "belowBar", color: expect.any(String), text: "B" });
    expect(m[1]).toMatchObject({ time: "2026-06-11", position: "aboveBar", text: "S" });
    expect(m[0].time <= m[1].time).toBe(true);
  });
  it("sorts out-of-order markers ascending by time", () => {
    const reversed = [markers[1], markers[0]];   // sell (later) first
    const m = toMarkers(reversed);
    expect(m.map((x) => x.time)).toEqual(["2026-06-10", "2026-06-11"]);
  });
});
