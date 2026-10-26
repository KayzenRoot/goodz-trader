import { cn } from '@/lib/utils';

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  id?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="text-ink text-xs font-medium">
          {label}
        </label>
        {description ? (
          <p className="text-dim mt-1 text-[11px] leading-relaxed">{description}</p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'border-acid/50 bg-acid/90' : 'border-line-strong bg-panel-3',
        )}
      >
        <span
          className={cn(
            'h-4.5 w-4.5 absolute top-0.5 rounded-full shadow-sm transition-transform duration-200',
            checked ? 'left-[22px] bg-black' : 'bg-muted left-0.5',
          )}
        />
      </button>
    </div>
  );
}
