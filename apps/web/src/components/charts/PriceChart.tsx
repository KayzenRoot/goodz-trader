import type { Candle, PositionView } from '@goodz/core';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface PriceChartLine {
  price: number;
  color: string;
  title: string;
}

const EMPTY_LINES: PriceChartLine[] = [];

export function PriceChart({
  candles,
  position,
  className,
  height = 380,
  extraLines = EMPTY_LINES,
  ariaLabel = 'Gráfico de candles do contrato',
}: {
  candles: Candle[];
  position: PositionView | null;
  className?: string;
  height?: number;
  extraLines?: PriceChartLine[];
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#7d8496',
        fontFamily: 'JetBrains Mono Variable, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.035)' },
        horzLines: { color: 'rgba(255,255,255,0.035)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(201,247,58,0.35)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1b1f29',
        },
        horzLine: {
          color: 'rgba(201,247,58,0.35)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1b1f29',
        },
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#2ee6a8',
      downColor: '#ff5c7a',
      borderVisible: false,
      wickUpColor: '#2ee6a8',
      wickDownColor: '#ff5c7a',
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) chart.applyOptions({ width: entry.contentRect.width, height });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      linesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || candles.length === 0) return;
    const seen = new Set<number>();
    const normalized = candles
      .filter((candle) => {
        if (seen.has(candle.time)) return false;
        seen.add(candle.time);
        return true;
      })
      .sort((a, b) => a.time - b.time);

    const candleData: CandlestickData<Time>[] = normalized.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    const volumeData: HistogramData<Time>[] = normalized.map((candle) => ({
      time: candle.time as UTCTimestamp,
      value: candle.volume,
      color: candle.close >= candle.open ? 'rgba(46,230,168,0.25)' : 'rgba(255,92,122,0.25)',
    }));

    candleRef.current.setData(candleData);
    volumeRef.current.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const line of linesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // ignore stale line
      }
    }
    linesRef.current = [];

    const levels: Array<{ price: number; color: string; title: string }> = [];
    if (position) {
      levels.push({ price: position.entryPrice, color: '#8b91a3', title: 'entrada' });
      if (position.takeProfitPrice !== null) {
        levels.push({ price: position.takeProfitPrice, color: '#2ee6a8', title: 'TP' });
      }
      if (position.stopPrice !== null) {
        levels.push({ price: position.stopPrice, color: '#ff5c7a', title: 'SL' });
      }
      if (position.trailingStopPrice) {
        levels.push({ price: position.trailingStopPrice, color: '#ffb020', title: 'trail' });
      }
    }
    levels.push(...extraLines);
    if (levels.length === 0) return;

    linesRef.current = levels.map((level) =>
      series.createPriceLine({
        price: level.price,
        color: level.color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: level.title,
      }),
    );
  }, [position, extraLines]);

  return (
    <div
      ref={containerRef}
      className={cn('w-full overflow-hidden', className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
