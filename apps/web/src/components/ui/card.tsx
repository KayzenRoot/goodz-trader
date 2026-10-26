import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('panel', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  eyebrow,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="text-muted mt-0.5">{icon}</div> : null}
        <div className="min-w-0">
          {eyebrow ? <p className="label mb-1.5">{eyebrow}</p> : null}
          <h2 className="text-ink truncate text-sm font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-muted mt-1 text-xs leading-relaxed">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-line border-t px-5 py-3.5', className)} {...props} />;
}
