import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('scroll-thin w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-line divide-y">{children}</tbody>;
}

export function TR({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { children: ReactNode }) {
  return <tr className={cn('hover:bg-panel-2/50 group transition-colors', className)} {...props} />;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-line text-dim border-b px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.14em]',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('text-muted px-4 py-3 text-xs', className)} {...props} />;
}
