import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

const variants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase',
  {
    variants: {
      variant: {
        neutral: 'border-line-strong bg-panel-2 text-muted',
        accent: 'border-acid/30 bg-acid/10 text-acid',
        profit: 'border-profit/25 bg-profit/10 text-profit',
        loss: 'border-loss/25 bg-loss/10 text-loss',
        warn: 'border-warn/25 bg-warn/10 text-warn',
        info: 'border-info/25 bg-info/10 text-info',
        dark: 'border-black/20 bg-black/30 text-white',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof variants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(variants({ variant }), className)} {...props}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
