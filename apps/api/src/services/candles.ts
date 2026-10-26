import { mulberry32, type Candle } from '@goodz/core';

import { basePriceFor } from './contracts';

export interface SyntheticCandlesInput {
  symbol: string;
  intervalSec: number;
  limit: number;
  endPrice?: number;
  now?: number;
  seed?: number;
}

export function generateSyntheticCandles(input: SyntheticCandlesInput): Candle[] {
  const {
    symbol,
    intervalSec,
    limit,
    endPrice = basePriceFor(symbol),
    now = Date.now(),
    seed = hashSeed(symbol),
  } = input;
  const rng = mulberry32(seed);
  const count = Math.min(Math.max(limit, 10), 500);
  const startTime = Math.floor(now / 1000 / intervalSec) * intervalSec - (count - 1) * intervalSec;

  // Generate a forward walk, then rescale it so the final close matches the
  // current market price. This keeps the chart aligned with the live ticker.
  const closes: number[] = [];
  let price = endPrice;
  for (let index = count - 1; index >= 0; index -= 1) {
    closes[index] = price;
    const shock = (rng() - 0.5) * 0.0018 + (rng() - 0.5) * 0.0008;
    price = price / (1 + shock);
  }

  const candles: Candle[] = [];
  let previous = closes[0] ?? endPrice;
  for (let index = 0; index < count; index += 1) {
    const close = closes[index] ?? previous;
    const open = index === 0 ? previous * (1 + (rng() - 0.5) * 0.0006) : previous;
    const volatility = Math.abs(close - open) + close * (0.0003 + rng() * 0.0009);
    const high = Math.max(open, close) + volatility * rng();
    const low = Math.min(open, close) - volatility * rng();
    candles.push({
      time: startTime + index * intervalSec,
      open: round(open),
      high: round(high),
      low: round(Math.max(low, 0.00000001)),
      close: round(close),
      volume: Math.round(50 + rng() * 950),
    });
    previous = close;
  }

  return candles;
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function round(value: number): number {
  return Number(value.toFixed(8));
}
