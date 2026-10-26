export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function bps(priceA: number, priceB: number): number {
  if (priceB === 0) return 0;
  return ((priceA - priceB) / priceB) * 10_000;
}

export function nextEma(previous: number | undefined, value: number, period: number): number {
  if (previous === undefined) return value;
  const alpha = 2 / (period + 1);
  return previous + alpha * (value - previous);
}

export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = step.toString();
  if (text.includes('e-')) return Number(text.split('e-')[1] ?? 0);
  const fraction = text.split('.')[1];
  return fraction ? fraction.length : 0;
}

export function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const decimals = Math.min(12, decimalsForStep(step));
  const stepped = Math.floor(value / step + 1e-9) * step;
  return Number(stepped.toFixed(decimals));
}

export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const decimals = Math.min(12, decimalsForStep(step));
  const stepped = Math.round(value / step) * step;
  return Number(stepped.toFixed(decimals));
}

export function computeImbalance(bidVolume: number, askVolume: number): number {
  const total = bidVolume + askVolume;
  if (total <= 0) return 0;
  return (bidVolume - askVolume) / total;
}

export function computeTradeDelta(buys: number, sells: number): number {
  const total = buys + sells;
  if (total <= 0) return 0;
  return (buys - sells) / total;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function gaussian(rng: () => number): number {
  const u = Math.max(rng(), Number.EPSILON);
  const v = Math.max(rng(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
