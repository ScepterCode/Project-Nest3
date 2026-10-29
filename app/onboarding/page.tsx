'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { dashboardFor } from '@/lib/auth/dashboards';
import {
  QuickOnboarding,
  QuickOnboardingData,
} from '@/components/onboarding/quick-onboarding';
import {
  InstitutionAdminOnboarding,
  InstitutionAdminOnboardingData,
} from '@/components/onboarding/institution-admin-onboarding';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

interface Profile {
  role: string;
  first_name: string | null;
  last_name: string | null;
  onboarding_completed: boolean | null;
}

// Where each role goes once set up: straight to the first useful thing.
const AFTER_ONBOARDING: Record<string, string> = {
  student: '/dashboard/student/classes/join',
  teacher: '/dashboard/teacher/classes',
  institution_admin: '/dashboard/institution',
};

/**
 * A full page load, not a client-side navigation: the signed-in user's
 * profile is cached in memory (auth context), and arriving on the dashboard
 * with the stale "not onboarded yet" copy sent people back here in a loop.
 */
function goTo(path: string) {
  window.location.assign(path);
}

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    createClient()
      .from('users')
      .select('role, first_name, last_name, onboarding_completed')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError(error?.message ?? 'Your account could not be loaded.');
          return;
        }
        // Already set up, or a role the operator sets up (platform admins,
        // programme viewers): nothing to do here.
        if (
          data.onboarding_completed ||
          !['student', 'teacher', 'institution_admin'].includes(data.role)
        ) {
          goTo(dashboardFor(data.role));
          return;
        }
        setProfile(data as Profile);
      });
  }, [user]);

  const finish = async (
    names: { firstName: string; lastName: string },
    school?: InstitutionAdminOnboardingData
  ) => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      const supabase = createClient();

      // School admins: create (or update) their school from their answers,
      // including its departments, before onboarding is marked complete.
      if (profile.role === 'institution_admin' && school) {
        const { error: schoolError } = await supabase.rpc(
          'set_up_my_institution',
          {
            p_name: school.institutionName,
            p_type: school.institutionType || null,
            p_size: school.institutionSize || null,
            p_contact_name:
              `${names.firstName} ${names.lastName}`.trim() || null,
            p_contact_title: school.jobTitle || null,
            p_contact_email: school.contactEmail || null,
            p_contact_phone: school.contactPhone || null,
            p_departments: school.departments ?? [],
          }
        );
        if (schoolError) {
          throw new Error(
            `Could not create your school: ${schoolError.message}`
          );
        }
      }

      const { error } = await supabase
        .from('users')
        .update({
          first_name: names.firstName,
          last_name: names.lastName,
          onboarding_completed: true,
        })
        .eq('id', user.id);
      if (error) throw new Error(error.message);

      goTo(AFTER_ONBOARDING[profile.role] ?? dashboardFor(profile.role));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not finish setting up'
      );
      setSaving(false);
    }
  };

  if (!loading && !user) {
    return (
      <Centered>
        <h1 className="mb-2 text-xl font-semibold">Please sign in</h1>
        <p className="mb-4 text-gray-600">
          You need to be signed in to finish setting up your account.
        </p>
        <Button onClick={() => goTo('/auth/login')}>Go to sign in</Button>
      </Centered>
    );
  }

  if (loadError) {
    return (
      <Centered>
        <h1 className="mb-2 text-xl font-semibold">
          We couldn&apos;t load your account
        </h1>
        <p className="mb-4 text-gray-600">{loadError}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </Centered>
    );
  }

  if (!profile) {
    return (
      <Centered>
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        <p className="text-gray-700">Loading your account…</p>
      </Centered>
    );
  }

  const firstName =
    profile.first_name || (user?.user_metadata?.first_name as string) || '';
  const lastName =
    profile.last_name || (user?.user_metadata?.last_name as string) || '';

  if (profile.role === 'student' || profile.role === 'teacher') {
    return (
      <QuickOnboarding
        role={profile.role}
        defaultFirstName={firstName}
        defaultLastName={lastName}
        saving={saving}
        onComplete={(data: QuickOnboardingData) => finish(data)}
      />
    );
  }

  if (profile.role === 'institution_admin') {
    return (
      <InstitutionAdminOnboarding
        userName={firstName || 'there'}
        userEmail={user?.email ?? ''}
        defaultFirstName={firstName}
        defaultLastName={lastName}
        saving={saving}
        onComplete={data =>
          finish({ firstName: data.firstName, lastName: data.lastName }, data)
        }
      />
    );
  }

  return null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );
}
