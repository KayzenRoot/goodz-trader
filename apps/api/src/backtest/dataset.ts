import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

export const replayTickSchema = z
  .object({
    ts: z.number().int().positive(),
    bid: z.number().positive(),
    ask: z.number().positive(),
    last: z.number().positive().optional(),
    imbalance: z.number().min(-1).max(1).default(0),
    tradeDelta: z.number().min(-1).max(1).default(0),
    fundingRate: z.number().min(-0.01).max(0.01).optional(),
  })
  .refine((tick) => tick.ask >= tick.bid, {
    message: 'ask deve ser maior ou igual ao bid',
  });

export interface ReplayTick {
  ts: number;
  bid: number;
  ask: number;
  last: number;
  imbalance: number;
  tradeDelta: number;
  fundingRate?: number;
}

/**
 * Loads a JSONL snapshot dataset. Each line is one market observation with the
 * order-flow fields used by the live strategy. Candle-only data is deliberately
 * not converted into fake imbalance/delta — that would overstate the edge.
 */
export function parseDataset(text: string): ReplayTick[] {
  const ticks: ReplayTick[] = [];
  const lines = text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Linha ${index + 1}: JSON inválido`);
    }
    const result = replayTickSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Linha ${index + 1}: ${result.error.issues[0]?.message ?? 'snapshot inválido'}`,
      );
    }
    const tick = result.data;
    ticks.push({
      ts: tick.ts,
      bid: tick.bid,
      ask: tick.ask,
      last: tick.last ?? (tick.bid + tick.ask) / 2,
      imbalance: tick.imbalance,
      tradeDelta: tick.tradeDelta,
      ...(tick.fundingRate === undefined ? {} : { fundingRate: tick.fundingRate }),
    });
  }

  if (ticks.length < 50) {
    throw new Error('Dataset muito curto: mínimo de 50 snapshots');
  }

  ticks.sort((a, b) => a.ts - b.ts);
  const deduped: ReplayTick[] = [];
  for (const tick of ticks) {
    if (deduped.at(-1)?.ts === tick.ts) deduped[deduped.length - 1] = tick;
    else deduped.push(tick);
  }
  return deduped;
}

export async function loadDataset(path: string): Promise<{ ticks: ReplayTick[]; hash: string }> {
  const text = await readFile(path, 'utf8');
  return { ticks: parseDataset(text), hash: datasetHash(text) };
}

export function datasetHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface SyntheticDatasetOptions {
  seed?: number;
  rows?: number;
  startTs?: number;
  intervalMs?: number;
  basePrice?: number;
  spreadBps?: number;
}

/**
 * Deterministic dataset for demos and tests. It is a random walk with momentum
 * bursts where price, imbalance and trade delta agree — not a claim about MEXC.
 */
export function syntheticDataset(options: SyntheticDatasetOptions = {}): ReplayTick[] {
  const seed = options.seed ?? 42;
  const rows = options.rows ?? 2_000;
  const startTs = options.startTs ?? Date.UTC(2026, 0, 1);
  const intervalMs = options.intervalMs ?? 1_000;
  const spreadBps = options.spreadBps ?? 2;
  const random = mulberry32(seed);
  let price = options.basePrice ?? 100_000;
  let burst = 0;
  let direction = 1;
  const ticks: ReplayTick[] = [];

  for (let index = 0; index < rows; index += 1) {
    if (burst <= 0) {
      direction = random() > 0.5 ? 1 : -1;
      burst = 20 + Math.floor(random() * 40);
    }
    const noise = (random() - 0.5) * 0.4;
    const moveBps = direction * (0.2 + random() * 0.5) + noise;
    price = Math.max(1, price * (1 + moveBps / 10_000));
    burst -= 1;

    const strength = Math.min(1, 0.25 + Math.abs(moveBps) * 1.6);
    const imbalance = clamp(direction * strength + (random() - 0.5) * 0.25, -1, 1);
    const tradeDelta = clamp(direction * strength + (random() - 0.5) * 0.25, -1, 1);
    const halfSpread = (price * spreadBps) / 20_000;
    const bid = round(price - halfSpread);
    const ask = round(price + halfSpread);
    ticks.push({
      ts: startTs + index * intervalMs,
      bid,
      ask,
      last: round(price),
      imbalance: Number(imbalance.toFixed(4)),
      tradeDelta: Number(tradeDelta.toFixed(4)),
    });
  }
  return ticks;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
