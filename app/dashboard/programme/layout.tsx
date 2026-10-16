'use client';

import { useUserRole } from '@/lib/hooks/useUserRole';
import { TwoFactorGate } from '@/components/platform/two-factor-gate';

/** Programme staff (totals only), behind the same two-factor sign-in as platform admins. */
export default function ProgrammeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { roleData, loading } = useUserRole();
  if (loading) return null;
  if (
    roleData?.role !== 'programme_viewer' &&
    roleData?.role !== 'system_admin'
  ) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        This page is for programme staff only.
      </p>
    );
  }
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Programme</h1>
        <p className="text-sm text-muted-foreground">
          Totals across every school. Individual learners and staff aren&apos;t
          shown here.
        </p>
      </div>
      <TwoFactorGate>{children}</TwoFactorGate>
    </div>
  );
}
