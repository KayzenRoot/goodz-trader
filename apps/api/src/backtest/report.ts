import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BotConfig } from '@goodz/core';

import { BACKTEST_VERSION, type BacktestResult } from './engine';
import type { WalkForwardResult } from './walkforward';

export interface PaperComparison {
  source: string;
  paperTrades: number;
  paperNetPnl: number;
  replayTrades: number;
  replayNetPnl: number;
  deltaNetPnl: number;
  note: string;
}

export interface BacktestReport {
  version: number;
  generatedAt: number;
  dataset: {
    label: string;
    hash: string;
    rows: number;
    firstTs: number;
    lastTs: number;
  };
  seed: number;
  configHash: string;
  assumptions: string[];
  summary: BacktestResult['summary'];
  trades: BacktestResult['trades'];
  equity: BacktestResult['equity'];
  walkForward?: WalkForwardResult;
  paperComparison?: PaperComparison;
}

export function buildReport(input: {
  result: BacktestResult;
  config: BotConfig;
  dataset: { label: string; hash: string; rows: number; firstTs: number; lastTs: number };
  seed: number;
  walkForward?: WalkForwardResult;
  paperComparison?: PaperComparison;
}): BacktestReport {
  return {
    version: BACKTEST_VERSION,
    generatedAt: Date.now(),
    dataset: input.dataset,
    seed: input.seed,
    configHash: hashCode(JSON.stringify(input.config)),
    assumptions: input.result.assumptions,
    summary: input.result.summary,
    trades: input.result.trades,
    equity: input.result.equity,
    ...(input.walkForward ? { walkForward: input.walkForward } : {}),
    ...(input.paperComparison ? { paperComparison: input.paperComparison } : {}),
  };
}

export function renderMarkdown(report: BacktestReport): string {
  const s = report.summary;
  const lines: string[] = [
    `# Backtest v${report.version} — ${report.dataset.label}`,
    '',
    `- Generated: ${new Date(report.generatedAt).toISOString()}`,
    `- Dataset: \`${report.dataset.label}\` (${report.dataset.rows} snapshots)`,
    `- Dataset SHA-256: \`${report.dataset.hash}\``,
    `- Period: ${new Date(report.dataset.firstTs).toISOString()} → ${new Date(report.dataset.lastTs).toISOString()}`,
    `- Seed: ${report.seed}`,
    `- Config hash: \`${report.configHash}\``,
    '',
    '## Headline (net of fees and funding)',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| **Net PnL** | **${money(s.netPnl)} USDT** |`,
    `| Gross PnL | ${money(s.grossPnl)} USDT |`,
    `| Fees | ${money(s.fees)} USDT |`,
    `| Funding | ${money(s.funding)} USDT |`,
    `| Final equity | ${money(s.finalEquity)} USDT |`,
    `| Trades | ${s.trades} (${s.wins}W / ${s.losses}L) |`,
    `| Win rate | ${s.winRatePct}% |`,
    `| Profit factor | ${s.profitFactor} |`,
    `| Expectancy / trade | ${money(s.expectancy)} USDT |`,
    `| Avg R | ${s.avgR} |`,
    `| Max drawdown | ${s.maxDrawdownPct}% |`,
    `| Fee drag | ${s.feeDragPct}% of gross |`,
    `| Exposure | ${s.exposurePct}% |`,
    `| Liquidations | ${s.liquidations} |`,
    `| Maker fills / taker fallbacks | ${s.makerFills} / ${s.takerFallbacks} |`,
    `| Blocked entries | ${s.blockedEntries} |`,
    '',
    '> Gross and net are always shown separately. No gross figure is presented as net.',
    '',
  ];

  if (report.walkForward) {
    const wf = report.walkForward;
    lines.push(
      '## Walk-forward (out-of-sample)',
      '',
      `- Candidate runs: ${wf.candidateRuns}`,
      `- Train ratio: ${wf.trainRatio}`,
      `- Minimum trades per window: ${wf.minTrades}`,
      `- Validated: **${wf.validated ? 'yes' : 'no'}**`,
      `- OOS net PnL: **${money(wf.oos.netPnl)} USDT** across ${wf.oos.trades} trades`,
      '',
      '| Window | Train rows | Test rows | Best TP/SL/threshold (bps) | Train net | OOS net | OOS trades | Validated |',
      '| ---: | ---: | ---: | --- | ---: | ---: | ---: | :---: |',
      ...wf.windows.map(
        (window) =>
          `| ${window.index + 1} | ${window.trainRows} | ${window.testRows} | ${window.best.takeProfitBps}/${window.best.stopLossBps}/${window.best.entryThresholdBps} | ${money(window.trainNetPnl)} | ${money(window.testNetPnl)} | ${window.testTrades} | ${window.validated ? 'yes' : 'no'} |`,
      ),
      '',
      'Selection uses the train slice only. The OOS result is reported even when it is worse.',
      '',
    );
  }

  if (report.paperComparison) {
    const comparison = report.paperComparison;
    lines.push(
      '## Paper vs replay',
      '',
      `- Paper source: \`${comparison.source}\``,
      `- Paper: ${comparison.paperTrades} closed trades, net ${money(comparison.paperNetPnl)} USDT`,
      `- Replay: ${comparison.replayTrades} trades, net ${money(comparison.replayNetPnl)} USDT`,
      `- Delta (replay - paper): ${money(comparison.deltaNetPnl)} USDT`,
      '',
      `> ${comparison.note}`,
      '',
    );
  }

  lines.push(
    '## Assumptions',
    '',
    ...report.assumptions.map((assumption) => `- ${assumption}`),
    '',
    '## Reproducibility',
    '',
    'Re-run with the same dataset, seed and config hash. The JSON report contains every trade and',
    'the equity points used for drawdown.',
    '',
  );

  return lines.join('\n');
}

export function writeReport(
  report: BacktestReport,
  outDir: string,
): { jsonPath: string; markdownPath: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date(report.generatedAt).toISOString().replace(/[:.]/g, '-');
  const suffix = report.dataset.hash.slice(0, 8);
  const jsonPath = join(outDir, `backtest-v${report.version}-${stamp}-${suffix}.json`);
  const markdownPath = join(outDir, `backtest-v${report.version}-${stamp}-${suffix}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdown(report));
  return { jsonPath, markdownPath };
}

function money(value: number): string {
  return value.toFixed(4);
}

function hashCode(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
