import { cn } from '@/lib/utils';

/** A number with its label, and an optional hint underneath. */
export function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
        <span className="text-sm">{label}</span>
        {icon}
      </div>
      <p className="mt-1 font-mono text-2xl font-medium tabular-nums">
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
