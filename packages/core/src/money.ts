export const MICROS_PER_USDT = 1_000_000;

/**
 * Canonical integer unit for ledger arithmetic: 1 micro-USDT = 0.000001 USDT.
 * Values are JavaScript safe integers (up to ~9.0e9 USDT), which is far above
 * any realistic single-account futures ledger.
 */
export type Micros = number;

export function toMicros(value: number | string): Micros {
  if (typeof value === 'string') return parseMicros(value);
  if (!Number.isFinite(value)) throw new Error(`Valor monetário inválido: ${value}`);
  const micros = Math.round(value * MICROS_PER_USDT);
  assertSafe(micros);
  return micros === 0 ? 0 : micros;
}

export function fromMicros(micros: Micros): number {
  assertSafe(micros);
  return micros / MICROS_PER_USDT;
}

export function addMicros(...values: Micros[]): Micros {
  let total = 0;
  for (const value of values) {
    assertSafe(value);
    total += value;
    assertSafe(total);
  }
  return total;
}

export function subMicros(a: Micros, b: Micros): Micros {
  assertSafe(a);
  assertSafe(b);
  const result = a - b;
  assertSafe(result);
  return result;
}

export function sumMicros(values: Iterable<Micros>): Micros {
  let total = 0;
  for (const value of values) total = addMicros(total, value);
  return total;
}

/** Multiplies a micro amount by a basis-point rate, rounding once. */
export function mulMicrosBps(micros: Micros, bps: number): Micros {
  assertSafe(micros);
  if (!Number.isFinite(bps)) throw new Error(`bps inválido: ${bps}`);
  const result = Math.round((micros * bps) / 10_000);
  assertSafe(result);
  return result;
}

/** Difference in micros between a legacy REAL field and its exact value. */
export function reconciliationDelta(legacy: number, micros: Micros): Micros {
  return subMicros(toMicros(legacy), micros);
}

function parseMicros(input: string): Micros {
  const text = input.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Valor monetário inválido: ${input}`);
  const sign = match[1] === '-' ? -1 : 1;
  const whole = match[2] ?? '0';
  let fraction = match[3] ?? '';
  let roundUp = false;
  if (fraction.length > 6) {
    roundUp = Number(fraction[6]) >= 5;
    fraction = fraction.slice(0, 6);
  }
  const micros = Number(whole) * MICROS_PER_USDT + Number(fraction.padEnd(6, '0') || '0');
  assertSafe(micros);
  return sign * (micros + (roundUp ? 1 : 0));
}

function assertSafe(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Valor em micros fora do intervalo seguro: ${value}`);
  }
}
