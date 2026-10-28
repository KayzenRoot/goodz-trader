import type { BotConfig } from '@goodz/core';

import { runBacktest, type BacktestMetrics, type BacktestOptions } from './engine';
import type { ReplayTick } from './dataset';

export interface WalkForwardParams {
  takeProfitBps: number;
  stopLossBps: number;
  entryThresholdBps: number;
}

export interface WalkForwardWindow {
  index: number;
  trainRows: number;
  testRows: number;
  best: WalkForwardParams;
  trainNetPnl: number;
  testNetPnl: number;
  testTrades: number;
  testMetrics: BacktestMetrics;
  validated: boolean;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  oos: BacktestMetrics;
  candidateRuns: number;
  minTrades: number;
  trainRatio: number;
  validated: boolean;
}

export interface WalkForwardOptions extends Omit<BacktestOptions, 'ticks'> {
  ticks: ReplayTick[];
  windows?: number;
  trainRatio?: number;
  minTrades?: number;
  maxDrawdownPct?: number;
}

/**
 * Rolling train/test evaluation. The winner is selected only on the train
 * slice; the following test slice is never used for selection. A parameter set
 * is only called validated when the aggregated out-of-sample result has enough
 * trades and positive net PnL.
 */
export function runWalkForward(options: WalkForwardOptions): WalkForwardResult {
  const windows = Math.max(2, Math.floor(options.windows ?? 3));
  const trainRatio = Math.min(0.9, Math.max(0.5, options.trainRatio ?? 0.7));
  const minTrades = Math.max(1, Math.floor(options.minTrades ?? 2));
  const maxDrawdown = options.maxDrawdownPct ?? 60;
  const chunkSize = Math.floor(options.ticks.length / windows);
  const grid = parameterGrid(options.config);
  const results: WalkForwardWindow[] = [];
  let candidateRuns = 0;

  for (let index = 0; index < windows; index += 1) {
    const start = index * chunkSize;
    const end = index === windows - 1 ? options.ticks.length : start + chunkSize;
    const segment = options.ticks.slice(start, end);
    const trainEnd = Math.max(50, Math.floor(segment.length * trainRatio));
    const train = segment.slice(0, trainEnd);
    const test = segment.slice(trainEnd);
    if (train.length < 50 || test.length < 50) continue;

    let best: { params: WalkForwardParams; netPnl: number } | null = null;
    for (const params of grid) {
      candidateRuns += 1;
      const config = withParams(options.config, params);
      const result = runBacktest({ ...options, config, ticks: train });
      if (result.summary.trades < minTrades) continue;
      if (result.summary.maxDrawdownPct > maxDrawdown) continue;
      if (!best || result.summary.netPnl > best.netPnl) {
        best = { params, netPnl: result.summary.netPnl };
      }
    }

    if (!best) continue;
    const testConfig = withParams(options.config, best.params);
    const testResult = runBacktest({ ...options, config: testConfig, ticks: test });
    results.push({
      index,
      trainRows: train.length,
      testRows: test.length,
      best: best.params,
      trainNetPnl: best.netPnl,
      testNetPnl: testResult.summary.netPnl,
      testTrades: testResult.summary.trades,
      testMetrics: testResult.summary,
      validated: testResult.summary.trades >= minTrades && testResult.summary.netPnl > 0,
    });
  }

  const oos = aggregate(results.map((window) => window.testMetrics));
  return {
    windows: results,
    oos,
    candidateRuns,
    minTrades,
    trainRatio,
    validated:
      oos.trades >= minTrades && oos.netPnl > 0 && results.every((window) => window.validated),
  };
}

function parameterGrid(config: BotConfig): WalkForwardParams[] {
  const base = config.strategy;
  const takeProfits = unique([
    base.takeProfitBps,
    Math.round(base.takeProfitBps * 0.8),
    Math.round(base.takeProfitBps * 1.25),
    Math.round(base.takeProfitBps * 1.5),
  ]).filter((value) => value >= 5);
  const stops = unique([
    base.stopLossBps,
    Math.round(base.stopLossBps * 0.75),
    Math.round(base.stopLossBps * 1.25),
  ]).filter((value) => value >= 3);
  const thresholds = unique([
    base.entryThresholdBps,
    Number((base.entryThresholdBps * 0.75).toFixed(2)),
    Number((base.entryThresholdBps * 1.25).toFixed(2)),
  ]).filter((value) => value >= 0);

  const grid: WalkForwardParams[] = [];
  for (const takeProfitBps of takeProfits) {
    for (const stopLossBps of stops) {
      for (const entryThresholdBps of thresholds) {
        grid.push({ takeProfitBps, stopLossBps, entryThresholdBps });
      }
    }
  }
  return grid;
}

function withParams(config: BotConfig, params: WalkForwardParams): BotConfig {
  const next = structuredClone(config);
  next.strategy.takeProfitBps = params.takeProfitBps;
  next.strategy.stopLossBps = params.stopLossBps;
  next.strategy.entryThresholdBps = params.entryThresholdBps;
  return next;
}

function unique(values: number[]): number[] {
  return [...new Set(values)];
}

export function aggregate(metrics: BacktestMetrics[]): BacktestMetrics {
  const sum = (pick: (metric: BacktestMetrics) => number) =>
    metrics.reduce((total, metric) => total + pick(metric), 0);
  const trades = sum((metric) => metric.trades);
  const wins = sum((metric) => metric.wins);
  const losses = sum((metric) => metric.losses);
  const grossPnl = sum((metric) => metric.grossPnl);
  const fees = sum((metric) => metric.fees);
  const funding = sum((metric) => metric.funding);
  const netPnl = sum((metric) => metric.netPnl);
  const winPnl = sum((metric) => metric.winPnl);
  const lossPnl = sum((metric) => metric.lossPnl);
  return {
    trades,
    wins,
    losses,
    winRatePct: trades > 0 ? Number(((wins / trades) * 100).toFixed(2)) : 0,
    grossPnl: Number(grossPnl.toFixed(8)),
    fees: Number(fees.toFixed(8)),
    funding: Number(funding.toFixed(8)),
    netPnl: Number(netPnl.toFixed(8)),
    winPnl: Number(winPnl.toFixed(8)),
    lossPnl: Number(lossPnl.toFixed(8)),
    profitFactor: lossPnl > 0 ? Number((winPnl / lossPnl).toFixed(2)) : wins > 0 ? 999 : 0,
    expectancy: trades > 0 ? Number((netPnl / trades).toFixed(8)) : 0,
    avgR:
      trades > 0 ? Number((sum((metric) => metric.avgR * metric.trades) / trades).toFixed(4)) : 0,
    maxDrawdownPct: Math.max(0, ...metrics.map((metric) => metric.maxDrawdownPct)),
    feeDragPct:
      Math.abs(grossPnl) > 0
        ? Number(((fees / Math.abs(grossPnl)) * 100).toFixed(2))
        : fees > 0
          ? 100
          : 0,
    exposurePct:
      metrics.length > 0
        ? Number((sum((metric) => metric.exposurePct) / metrics.length).toFixed(2))
        : 0,
    liquidations: sum((metric) => metric.liquidations),
    makerFills: sum((metric) => metric.makerFills),
    takerFallbacks: sum((metric) => metric.takerFallbacks),
    blockedEntries: sum((metric) => metric.blockedEntries),
    finalEquity: metrics.at(-1)?.finalEquity ?? 0,
  };
}
