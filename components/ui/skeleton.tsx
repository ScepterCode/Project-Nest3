import { cn } from '@/lib/utils';

/** A grey placeholder the size of the content that's still loading. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted', className)}
    />
  );
}
