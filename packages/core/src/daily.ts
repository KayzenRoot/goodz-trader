const DAY_MS = 86_400_000;

export function dayKey(ts: number, resetHourUtc: number): string {
  const shifted = new Date(ts - resetHourUtc * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

export function dayStartMs(day: string, resetHourUtc: number): number {
  return Date.parse(`${day}T00:00:00.000Z`) + resetHourUtc * 3_600_000;
}

export function nextResetMs(ts: number, resetHourUtc: number): number {
  const currentDay = dayKey(ts, resetHourUtc);
  return dayStartMs(currentDay, resetHourUtc) + DAY_MS;
}

export function msUntilReset(ts: number, resetHourUtc: number): number {
  return Math.max(0, nextResetMs(ts, resetHourUtc) - ts);
}

export function progressPct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (value / target) * 100));
}
