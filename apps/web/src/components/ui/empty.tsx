import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-line flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? <div className="text-dim">{icon}</div> : null}
      <div>
        <p className="text-ink text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted mt-1 max-w-sm text-xs leading-relaxed">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
