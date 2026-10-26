import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

const variants = cva(
  'inline-flex select-none items-center justify-center gap-2 rounded-xl border text-sm font-semibold whitespace-nowrap transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  {
    variants: {
      variant: {
        primary:
          'border-acid/70 bg-acid text-black shadow-[0_0_24px_rgba(201,247,58,0.12)] hover:bg-acid-dim hover:shadow-[0_0_30px_rgba(201,247,58,0.2)]',
        secondary: 'border-line-strong bg-panel-2 text-ink hover:border-muted/40 hover:bg-panel-3',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-panel-2 hover:text-ink',
        outline:
          'border-line-strong bg-transparent text-ink hover:border-muted/40 hover:bg-panel-2',
        danger: 'border-loss/30 bg-loss/10 text-loss hover:border-loss/50 hover:bg-loss/15',
        success:
          'border-profit/30 bg-profit/10 text-profit hover:border-profit/50 hover:bg-profit/15',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> {
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot className={cn(variants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={cn(variants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading ? rightIcon : null}
    </button>
  );
}
