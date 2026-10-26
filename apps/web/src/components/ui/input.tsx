import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

export const inputClass =
  'h-10 w-full rounded-xl border border-line-strong bg-panel-2 px-3 text-sm text-ink placeholder:text-dim transition-colors hover:border-muted/30 focus:border-acid/60 focus:bg-panel-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(inputClass, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClass, 'h-auto min-h-24 py-2.5', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(inputClass, 'appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="text-dim pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
        aria-hidden
      />
    </div>
  ),
);
Select.displayName = 'Select';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={htmlFor} className="text-ink text-xs font-medium">
            {label}
          </label>
          {optional ? <span className="text-dim text-[10px]">opcional</span> : null}
        </div>
      ) : null}
      {children}
      {error ? <p className="text-loss text-[11px]">{error}</p> : null}
      {!error && hint ? <p className="text-dim text-[11px] leading-relaxed">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled,
  id,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'border-line bg-panel-2/50 hover:border-line-strong flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="border-line-strong bg-panel-2 accent-acid mt-0.5 h-4 w-4 rounded"
      />
      <span className="min-w-0">
        <span className="text-ink block text-xs font-medium">{label}</span>
        {description ? (
          <span className="text-dim mt-0.5 block text-[11px]">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
