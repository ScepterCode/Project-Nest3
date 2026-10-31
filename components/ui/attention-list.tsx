import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';

/**
 * "Needs you": counted, linked to-dos for the person looking at the page.
 * `warn` is something overdue or waiting on them; `info` is worth knowing.
 */
export interface AttentionEntry {
  key: string;
  href: string;
  tone: 'warn' | 'info';
  content: React.ReactNode;
}

export function AttentionList({
  items,
  allClear = 'All clear. Nothing is waiting for you.',
}: {
  items: AttentionEntry[];
  allClear?: React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-primary">
        <ShieldCheck className="h-4 w-4" />
        {allClear}
      </p>
    );
  }
  return (
    <ul className="-mx-3 divide-y">
      {items.map(item => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="group flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                item.tone === 'warn' ? 'bg-warning' : 'bg-primary'
              }`}
              aria-hidden
            />
            <span className="flex-1">{item.content}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
