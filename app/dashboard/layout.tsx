'use client';

import { redirect } from 'next/navigation';
import { useAuth, logout } from '@/contexts/auth-context';
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
import { ROLE_LABELS } from '@/lib/platform/client';
import { DashboardHomeLink } from '@/components/Header/dashboard-home-link';
import {
  InstitutionRolegate,
  studentsRolegate,
  teachersRolegate,
} from './components/Permissiongate';
import Link from 'next/link';
import { Layers, LifeBuoy, LogOut } from 'lucide-react';

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
    <div className="flex min-h-screen w-full flex-col bg-white">
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
              <span className="hidden whitespace-nowrap rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 sm:inline">
                {ROLE_LABELS[userRole] ?? userRole}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">Sign out</span>
              </Button>
              <DashboardMobileNav userId={user.id} items={navItems} />
            </div>
          }
        />
      </div>

      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 print:p-0">
        <div className="print:hidden">
          <DashboardOnboardingReminder />
        </div>
        <div className="-mb-2 md:-mb-6">
          <DashboardHomeLink role={userRole} />
        </div>
        {children}
      </main>
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
