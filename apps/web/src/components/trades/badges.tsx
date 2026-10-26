import type { Side, TradeStatus } from '@goodz/core';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function SideBadge({ side, className }: { side: Side; className?: string }) {
  return (
    <Badge variant={side === 'long' ? 'profit' : 'loss'} className={cn('gap-1', className)}>
      {side === 'long' ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {side === 'long' ? 'Long' : 'Short'}
    </Badge>
  );
}

const statusMap: Record<
  TradeStatus,
  { label: string; variant: 'neutral' | 'profit' | 'loss' | 'warn' | 'info' }
> = {
  pending: { label: 'Pendente', variant: 'warn' },
  open: { label: 'Aberta', variant: 'info' },
  closed: { label: 'Fechada', variant: 'neutral' },
  canceled: { label: 'Cancelada', variant: 'neutral' },
  rejected: { label: 'Rejeitada', variant: 'loss' },
};

export function TradeStatusBadge({ status }: { status: TradeStatus }) {
  const item = statusMap[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function PnlText({
  value,
  suffix = ' USDT',
  className,
  digits = 2,
}: {
  value: number;
  suffix?: string;
  className?: string;
  digits?: number;
}) {
  return (
    <span
      className={cn(
        'num font-medium',
        value > 0 ? 'text-profit' : value < 0 ? 'text-loss' : 'text-muted',
        className,
      )}
    >
      {value > 0 ? '+' : ''}
      {new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value)}
      {suffix}
    </span>
  );
}

export function DemoBadge() {
  return <Badge variant="warn">demo</Badge>;
}
