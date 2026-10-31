import { cn } from '@/lib/utils';

/** The one way a page names itself: optional eyebrow, title, description, actions. */
export function PageHeading({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-4 border-b pb-5',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
