import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { botConfigSchema } from '@goodz/core';

import { datasetHash, loadDataset, syntheticDataset, type ReplayTick } from '../backtest/dataset';
import { runBacktest } from '../backtest/engine';
import { buildReport, writeReport, type PaperComparison } from '../backtest/report';
import { runWalkForward } from '../backtest/walkforward';
import { fallbackContract } from '../services/contracts';

const argv = process.argv.slice(2);

function value(name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}

function numberValue(name: string, fallback: number): number {
  const raw = value(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} precisa ser numérico`);
  return parsed;
}

async function main(): Promise<void> {
  const configPath = value('config');
  const config = configPath
    ? botConfigSchema.parse(JSON.parse(await readFile(configPath, 'utf8')) as unknown)
    : botConfigSchema.parse({});
  config.mode = 'paper';

  const seed = Math.floor(numberValue('seed', 42));
  let ticks: ReplayTick[];
  let hash: string;
  let label: string;

  const datasetPath = value('dataset');
  if (datasetPath) {
    const loaded = await loadDataset(datasetPath);
    ticks = loaded.ticks;
    hash = loaded.hash;
    label = datasetPath;
  } else {
    ticks = syntheticDataset({ seed, rows: Math.floor(numberValue('rows', 3_000)) });
    hash = datasetHash(JSON.stringify(ticks));
    label = `synthetic:seed=${seed}`;
  }

  const contract = fallbackContract(config.primarySymbol);
  const options = {
    config,
    contract,
    ticks,
    latencyMs: numberValue('latency', 250),
    makerFillThroughBps: numberValue('maker-edge-bps', 0.5),
    fundingRateBpsPer8h: numberValue('funding-bps', 0),
  };
  const result = runBacktest(options);

  const walkForward = flag('walk-forward')
    ? runWalkForward({
        ...options,
        windows: Math.floor(numberValue('windows', 3)),
        trainRatio: numberValue('train-ratio', 0.7),
        minTrades: Math.floor(numberValue('min-trades', 2)),
      })
    : undefined;

  const paperPath = value('paper');
  const paperComparison = paperPath
    ? await buildPaperComparison(paperPath, result.summary.trades, result.summary.netPnl)
    : undefined;

  const report = buildReport({
    result,
    config,
    seed,
    dataset: {
      label,
      hash,
      rows: ticks.length,
      firstTs: ticks[0]?.ts ?? 0,
      lastTs: ticks.at(-1)?.ts ?? 0,
    },
    ...(walkForward ? { walkForward } : {}),
    ...(paperComparison ? { paperComparison } : {}),
  });
  const paths = writeReport(report, value('out') ?? 'reports');

  console.log(
    JSON.stringify(
      {
        ok: true,
        dataset: label,
        rows: ticks.length,
        netPnl: report.summary.netPnl,
        grossPnl: report.summary.grossPnl,
        fees: report.summary.fees,
        funding: report.summary.funding,
        trades: report.summary.trades,
        maxDrawdownPct: report.summary.maxDrawdownPct,
        walkForward: walkForward
          ? { validated: walkForward.validated, oosNetPnl: walkForward.oos.netPnl }
          : undefined,
        ...paths,
      },
      null,
      2,
    ),
  );
}

async function buildPaperComparison(
  path: string,
  replayTrades: number,
  replayNetPnl: number,
): Promise<PaperComparison> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : [];
  const closed = items.filter(
    (item): item is { netPnl: number; status?: string } =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as { netPnl?: unknown }).netPnl === 'number' &&
      ((item as { status?: unknown }).status === undefined ||
        (item as { status?: unknown }).status === 'closed'),
  );
  const paperNetPnl = Number(closed.reduce((sum, trade) => sum + trade.netPnl, 0).toFixed(8));
  return {
    source: basename(path),
    paperTrades: closed.length,
    paperNetPnl,
    replayTrades,
    replayNetPnl,
    deltaNetPnl: Number((replayNetPnl - paperNetPnl).toFixed(8)),
    note: 'Comparison is only meaningful when the paper export and the replay dataset cover the same period and symbol. Differences include queue position, live latency and fill quality.',
  };
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
