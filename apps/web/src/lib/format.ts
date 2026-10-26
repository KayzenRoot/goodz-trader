import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const number = (digits = 2) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const adaptive = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

export function fmtNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return number(digits).format(value);
}

export function fmtMoney(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${number(digits).format(value)} USDT`;
}

export function fmtSignedMoney(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${number(digits).format(value)} USDT`;
}

export function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000) return number(2).format(value);
  if (abs >= 1) return number(4).format(value);
  if (abs >= 0.01) return number(6).format(value);
  return adaptive.format(value);
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${number(digits).format(value)}%`;
}

export function fmtSignedPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${number(digits).format(value)}%`;
}

export function fmtBps(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${number(digits).format(value)} bps`;
}

export function fmtCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function fmtDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) {
    return '—';
  }
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return format(new Date(ts), 'HH:mm:ss');
}

export function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return format(new Date(ts), 'dd/MM HH:mm:ss');
}

export function fmtRelative(ts: number | null | undefined): string {
  if (!ts) return '—';
  return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: ptBR });
}

export function dayShort(dayKey: string): string {
  const [, month, day] = dayKey.split('-');
  return `${day}/${month}`;
}

export function pairBase(symbol: string): string {
  return symbol.split('_')[0] ?? symbol;
}

export function pairQuote(symbol: string): string {
  return symbol.split('_')[1] ?? 'USDT';
}
