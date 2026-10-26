import { cn } from '@/lib/utils';

const tones = {
  acid: 'bg-acid',
  profit: 'bg-profit',
  loss: 'bg-loss',
  warn: 'bg-warn',
  info: 'bg-info',
};

export function Progress({
  value,
  tone = 'acid',
  className,
  showTrack = true,
}: {
  value: number;
  tone?: keyof typeof tones;
  className?: string;
  showTrack?: boolean;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full',
        showTrack && 'bg-white/6',
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', tones[tone])}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}
