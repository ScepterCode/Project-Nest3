'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { dashboardFor, isWithin } from '@/lib/auth/dashboards';

/**
 * "← Dashboard" back to the person's own dashboard, on every page except
 * that dashboard itself. Platform and programme pages have their own tabs.
 */
export function DashboardHomeLink({ role }: { role: string }) {
  const pathname = usePathname();
  const home = dashboardFor(role);

  if (
    pathname === home ||
    isWithin(pathname, '/dashboard/platform') ||
    isWithin(pathname, '/dashboard/programme')
  ) {
    return null;
  }

  return (
    <Link
      href={home}
      className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground print:hidden"
    >
      <ArrowLeft className="h-4 w-4" />
      Dashboard
    </Link>
  );
}
