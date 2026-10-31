'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, GraduationCap, House, Layers } from 'lucide-react';
import { isWithin } from '@/lib/auth/dashboards';

const TABS = [
  { href: '/dashboard/student', label: 'Home', icon: House, exact: true },
  { href: '/dashboard/student/classes', label: 'Classes', icon: GraduationCap },
  { href: '/dashboard/student/assignments', label: 'Work', icon: FileText },
  { href: '/dashboard/portfolio', label: 'Portfolio', icon: Layers },
];

/** Learners on phones: the four places they go most, under their thumb. */
export function LearnerTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Learner"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : isWithin(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
              active
                ? 'font-semibold text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
