import { cn } from '@/lib/utils';

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="group"
      className={cn(
        'border-line-strong bg-panel-2 inline-flex items-center rounded-xl border p-1',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-xs',
            value === option.value
              ? 'bg-acid text-black'
              : 'text-muted hover:bg-panel-3 hover:text-ink',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
