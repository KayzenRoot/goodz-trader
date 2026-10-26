import { cn } from '@/lib/utils';

const tones = {
  profit: 'text-profit',
  loss: 'text-loss',
  warn: 'text-warn',
  info: 'text-info',
  muted: 'text-dim',
  acid: 'text-acid',
};

export function StatusDot({
  tone = 'muted',
  pulse = false,
  className,
}: {
  tone?: keyof typeof tones;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full bg-current',
        tones[tone],
        pulse && 'animate-pulse-dot',
        className,
      )}
    />
  );
}
