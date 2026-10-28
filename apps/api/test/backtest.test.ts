import { botConfigSchema } from '@goodz/core';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { parseDataset, syntheticDataset, type ReplayTick } from '../src/backtest/dataset';
import { runBacktest } from '../src/backtest/engine';
import { buildReport, renderMarkdown, writeReport } from '../src/backtest/report';
import { runWalkForward } from '../src/backtest/walkforward';
import { btcContract } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function config() {
  return botConfigSchema.parse({
    mode: 'paper',
    risk: { maxTradesPerDay: 1 },
    strategy: {
      entryStyle: 'taker',
      takeProfitBps: 20,
      stopLossBps: 14,
      trailingStartBps: 19,
      trailingDistanceBps: 18,
      timeStopSec: 600,
    },
  });
}

function risingTicks(rows = 120): ReplayTick[] {
  const ticks: ReplayTick[] = [];
  let price = 100_000;
  for (let index = 0; index < rows; index += 1) {
    ticks.push({
      ts: Date.UTC(2026, 0, 1) + index * 1_000,
      bid: price - 0.5,
      ask: price + 0.5,
      last: price,
      imbalance: 0.9,
      tradeDelta: 0.9,
    });
    price += 5;
  }
  return ticks;
}

describe('backtest dataset', () => {
  it('parses, sorts and dedupes JSONL snapshots', () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      ts: 2_000 + (59 - index) * 1_000,
      bid: 100,
      ask: 101,
      imbalance: 0.2,
      tradeDelta: 0.3,
    }));
    const text = rows.map((row) => JSON.stringify(row)).join('\n');
    const ticks = parseDataset(text);
    expect(ticks).toHaveLength(60);
    expect(ticks[0]?.ts).toBe(2_000);
    expect(ticks.at(-1)?.ts).toBe(61_000);
  });

  it('rejects short or invalid datasets instead of guessing', () => {
    const short = Array.from({ length: 2 }, (_, index) =>
      JSON.stringify({ ts: index + 1, bid: 100, ask: 101 }),
    ).join('\n');
    expect(() => parseDataset(short)).toThrow('mínimo de 50');
    const invalid = Array.from({ length: 50 }, () =>
      JSON.stringify({ ts: 1, bid: 101, ask: 100 }),
    ).join('\n');
    expect(() => parseDataset(invalid)).toThrow('ask');
  });

  it('generates deterministic synthetic snapshots', () => {
    const first = syntheticDataset({ seed: 7, rows: 100 });
    const second = syntheticDataset({ seed: 7, rows: 100 });
    expect(first).toEqual(second);
    expect(first.every((tick) => tick.ask >= tick.bid)).toBe(true);
  });
});

describe('backtest engine', () => {
  it('reports net PnL separately from gross and fees', () => {
    const result = runBacktest({
      config: config(),
      contract: btcContract,
      ticks: risingTicks(),
      latencyMs: 0,
    });

    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade?.closeReason).toBe('take_profit');
    expect(trade?.grossPnl).toBeGreaterThan(0);
    expect(trade?.fees).toBeGreaterThan(0);
    expect(trade?.netPnl).toBeCloseTo(
      (trade?.grossPnl ?? 0) - (trade?.fees ?? 0) + (trade?.funding ?? 0),
      6,
    );
    expect(result.summary.netPnl).toBeCloseTo(trade?.netPnl ?? 0, 6);
    expect(result.summary.netPnl).toBeLessThan(result.summary.grossPnl);
    expect(result.summary.finalEquity).toBeCloseTo(1_000 + result.summary.netPnl, 6);
  });

  it('runs a walk-forward selection and reports OOS even when negative', () => {
    const result = runWalkForward({
      config: config(),
      contract: btcContract,
      ticks: syntheticDataset({ seed: 11, rows: 3_000 }),
      latencyMs: 0,
      windows: 3,
      trainRatio: 0.7,
      minTrades: 1,
    });

    expect(result.candidateRuns).toBeGreaterThan(0);
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.oos.trades).toBeGreaterThanOrEqual(0);
    expect(typeof result.validated).toBe('boolean');
    for (const window of result.windows) {
      expect(window.best.takeProfitBps).toBeGreaterThan(0);
      expect(window.trainRows).toBeGreaterThan(0);
      expect(window.testRows).toBeGreaterThan(0);
    }
  });
});

describe('backtest report', () => {
  it('renders net/gross/fees and writes versioned files', () => {
    const configValue = config();
    const ticks = risingTicks();
    const result = runBacktest({
      config: configValue,
      contract: btcContract,
      ticks,
      latencyMs: 0,
    });
    const report = buildReport({
      result,
      config: configValue,
      seed: 42,
      dataset: {
        label: 'unit-test',
        hash: 'a'.repeat(64),
        rows: ticks.length,
        firstTs: ticks[0]?.ts ?? 0,
        lastTs: ticks.at(-1)?.ts ?? 0,
      },
      paperComparison: {
        source: 'paper.json',
        paperTrades: 2,
        paperNetPnl: 1.5,
        replayTrades: result.summary.trades,
        replayNetPnl: result.summary.netPnl,
        deltaNetPnl: result.summary.netPnl - 1.5,
        note: 'same period required',
      },
    });
    const markdown = renderMarkdown(report);
    expect(markdown).toContain('**Net PnL**');
    expect(markdown).toContain('Gross PnL');
    expect(markdown).toContain('Fees');
    expect(markdown).toContain('Paper vs replay');
    expect(markdown).toContain('No gross figure is presented as net');

    const dir = mkdtempSync(join(tmpdir(), 'goodz-backtest-'));
    dirs.push(dir);
    const paths = writeReport(report, dir);
    expect(readdirSync(dir)).toHaveLength(2);
    expect(paths.jsonPath).toMatch(/backtest-v1-/);
    expect(paths.markdownPath.endsWith('.md')).toBe(true);
  });
});
