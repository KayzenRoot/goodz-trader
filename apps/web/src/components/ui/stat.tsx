import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Card } from './card';

const accents = {
  neutral: 'text-ink',
  profit: 'text-profit',
  loss: 'text-loss',
  warn: 'text-warn',
  info: 'text-info',
  acid: 'text-acid',
};

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  className,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof accents;
  className?: string;
  hint?: string;
}) {
  return (
    <Card className={cn('hover:border-line-strong group p-4 transition-colors', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="label">{label}</p>
        {icon ? (
          <span className="text-dim group-hover:text-muted transition-colors">{icon}</span>
        ) : null}
      </div>
      <p className={cn('num mt-2.5 text-xl font-semibold tracking-tight', accents[tone])}>
        {value}
      </p>
      {sub ? <div className="text-muted mt-1 text-[11px]">{sub}</div> : null}
      {hint ? <div className="text-dim mt-1 text-[10px]">{hint}</div> : null}
    </Card>
  );
}
