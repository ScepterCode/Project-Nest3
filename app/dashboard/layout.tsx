'use client';

import { redirect } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

import { Button } from '@/components/ui/button';
import { DashboardOnboardingReminder } from '@/components/onboarding/onboarding-reminder';
import { NotificationBell } from '@/components/notifications/notification-bell';

import Navbar from '@/components/Header/Navbar';
import {
  DashboardMobileNav,
  DashboardNav,
} from '@/components/Header/dashboard-nav';
import { DashboardHomeLink } from '@/components/Header/dashboard-home-link';
import { AccountMenu } from '@/components/Header/account-menu';
import { LearnerTabBar } from '@/components/Header/learner-tab-bar';
import {
  InstitutionRolegate,
  studentsRolegate,
  teachersRolegate,
} from './components/Permissiongate';
import Link from 'next/link';
import { Layers, LifeBuoy } from 'lucide-react';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { roleData, loading: roleLoading, error: roleError } = useUserRole();
  // Teachers made programme managers get the Programmes page in their menu.
  const [managesProgrammes, setManagesProgrammes] = useState(false);
  useEffect(() => {
    if (roleData?.role !== 'teacher') return;
    createClient()
      .rpc('my_project_access')
      .then(({ data }) =>
        setManagesProgrammes(
          Number(
            (data as { managed_programmes?: number } | null)
              ?.managed_programmes ?? 0
          ) > 0
        )
      );
  }, [roleData?.role]);

  useEffect(() => {
    if (!loading && !user) {
      redirect('/auth/login');
    }
  }, [user, loading]);

  // The server already sends people who haven't finished onboarding there.
  // As a backstop, use the profile just read from the database (roleData),
  // never the copy cached in memory since sign-in: right after onboarding
  // that copy is stale and sent people back and forth in an endless loop.
  useEffect(() => {
    if (roleData && !roleData.onboardingCompleted) {
      window.location.assign('/onboarding');
    }
  }, [roleData]);

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Should redirect by useEffect
  }

  // If there's a role error or no role data, show error state
  if (roleError || !roleData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Role Access Required
            </h2>
            <p className="text-gray-600 mb-4">
              Your user profile is not properly set up in the database. This is
              required for security and permission management.
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => (window.location.href = '/onboarding')}
                className="w-full"
              >
                Complete Setup
              </Button>
            </div>
            {roleError && (
              <p className="text-sm text-red-500 mt-4">Error: {roleError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const userRole = roleData.role;
  const navItems =
    userRole === 'student'
      ? studentsRolegate
      : userRole === 'teacher'
        ? managesProgrammes
          ? [
              ...teachersRolegate,
              {
                permission: 'classes.manage',
                text: 'Programmes',
                href: '/dashboard/programmes',
                icon: <Layers />,
              },
            ]
          : teachersRolegate
        : userRole === 'institution_admin'
          ? InstitutionRolegate
          : [];

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <div className="print:hidden">
        <Navbar
          children1={
            navItems.length > 0 ? (
              <DashboardNav userId={user.id} items={navItems} />
            ) : null
          }
          children2={
            <div className="flex items-center gap-1 sm:gap-2">
              <Button asChild variant="ghost" size="sm" title="Help & support">
                <Link
                  href={
                    userRole === 'system_admin'
                      ? '/dashboard/platform/support'
                      : '/dashboard/support'
                  }
                >
                  <LifeBuoy className="h-4 w-4" />
                  <span className="sr-only">Help &amp; support</span>
                </Link>
              </Button>
              <NotificationBell />
              <AccountMenu
                role={userRole}
                institutionId={roleData.institutionId}
              />
              <DashboardMobileNav userId={user.id} items={navItems} />
            </div>
          }
        />
      </div>

      {/* The layout owns width, background and padding: pages render content only. */}
      <main
        className={`mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pt-4 md:px-6 md:pt-6 print:max-w-none print:p-0 ${
          userRole === 'student' ? 'pb-24 md:pb-10' : 'pb-10'
        }`}
      >
        <div className="print:hidden">
          <DashboardOnboardingReminder />
        </div>
        <div className="-mb-2">
          <DashboardHomeLink role={userRole} />
        </div>
        {children}
      </main>
      {userRole === 'student' && <LearnerTabBar />}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardContent>{children}</DashboardContent>;
}
