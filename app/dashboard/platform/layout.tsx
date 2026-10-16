'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { TwoFactorGate } from '@/components/platform/two-factor-gate';
import { isWithin } from '@/lib/auth/dashboards';

const TABS = [
  { href: '/dashboard/platform', label: 'Overview', exact: true },
  { href: '/dashboard/platform/schools', label: 'Schools' },
  { href: '/dashboard/platform/tutors', label: 'Tutors' },
  { href: '/dashboard/platform/people', label: 'People' },
  { href: '/dashboard/platform/nominations', label: 'Nominations' },
  { href: '/dashboard/platform/rubrics', label: 'Rubric templates' },
  { href: '/dashboard/platform/invites', label: 'Admin invites' },
  { href: '/dashboard/platform/announcements', label: 'Announcements' },
  { href: '/dashboard/platform/health', label: 'Health' },
];

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { roleData, loading } = useUserRole();

  if (loading) return null;
  if (roleData?.role !== 'system_admin') {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        The platform dashboard is for platform admins only.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform</h1>
        <p className="text-sm text-muted-foreground">
          Every school on ProjectNest. Changes made here are recorded.
        </p>
      </div>
      <TwoFactorGate>
        <nav className="flex flex-wrap gap-1 border-b" aria-label="Platform">
          {TABS.map(tab => {
            const active = tab.exact
              ? pathname === tab.href
              : isWithin(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  active
                    ? 'border-blue-600 font-medium text-blue-700'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="pt-2">{children}</div>
      </TwoFactorGate>
    </div>
  );
}
