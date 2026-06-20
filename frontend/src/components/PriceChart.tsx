import { useEffect, useRef } from "react";
import { createChart, ColorType } from "lightweight-charts";
import type { Candle, Marker } from "../lib/types";
import { toCandles, toMarkers } from "../lib/chart";

export function PriceChart({ candles, markers }: { candles: Candle[]; markers: Marker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#94a3b8" },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      rightPriceScale: { borderColor: "#1e293b" },
      timeScale: { borderColor: "#1e293b" },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#34d399", downColor: "#fb7185",
      wickUpColor: "#34d399", wickDownColor: "#fb7185", borderVisible: false,
    });
    series.setData(toCandles(candles));
    series.setMarkers(toMarkers(markers));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, markers]);

  return <div ref={containerRef} className="h-[320px] w-full" />;
}
