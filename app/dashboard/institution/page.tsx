'use client';

import { useAuth } from '@/contexts/auth-context';
import { RoleGate } from '@/components/ui/permission-gate';
import { InstitutionAdminPanel } from '@/components/institution/institution-membership';
import { SchoolDashboard } from '@/components/institution/school-dashboard';

export default function InstitutionDashboardPage() {
  const { user, loading } = useAuth();

  if (loading || !user) return null;

  return (
    <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
      <InstitutionAdminPanel>
        {(institution, update) => (
          <SchoolDashboard
            institution={institution}
            onInstitutionChange={update}
          />
        )}
      </InstitutionAdminPanel>
    </RoleGate>
  );
}
