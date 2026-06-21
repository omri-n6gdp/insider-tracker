import { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle } from "lightweight-charts";
import type { EquityPoint } from "../lib/types";

interface EquityChartProps {
  equity: EquityPoint[];
  benchmark: EquityPoint[];
}

export function EquityChart({ equity, benchmark }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#475569",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: { borderColor: "#1e2836" },
      timeScale: { borderColor: "#1e2836" },
    });

    // Strategy equity — mint
    const equitySeries = chart.addLineSeries({
      color: "#34d399",
      lineWidth: 2,
      title: "Strategy",
      priceLineVisible: false,
    });

    // Benchmark (SPY) — muted slate
    const benchmarkSeries = chart.addLineSeries({
      color: "#475569",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "SPY",
      priceLineVisible: false,
    });

    if (equity.length > 0) {
      equitySeries.setData(
        equity.map((p) => ({ time: p.date as `${number}-${number}-${number}`, value: p.value }))
      );
    }

    if (benchmark.length > 0) {
      benchmarkSeries.setData(
        benchmark.map((p) => ({ time: p.date as `${number}-${number}-${number}`, value: p.value }))
      );
    }

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [equity, benchmark]);

  return <div ref={containerRef} className="h-[240px] w-full" />;
}
