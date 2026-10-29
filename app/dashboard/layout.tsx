'use client';

import { redirect } from 'next/navigation';
import { useAuth, logout } from '@/contexts/auth-context';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { DashboardOnboardingReminder } from '@/components/onboarding/onboarding-reminder';
import { NotificationBell } from '@/components/notifications/notification-bell';

import Navbar from '@/components/Header/Navbar';
import {
  DashboardMobileNav,
  DashboardNav,
} from '@/components/Header/dashboard-nav';
import { ROLE_LABELS } from '@/lib/platform/client';
import {
  InstitutionRolegate,
  studentsRolegate,
  teachersRolegate,
} from './components/Permissiongate';
import Link from 'next/link';
import { LifeBuoy, LogOut } from 'lucide-react';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, loading, onboardingStatus } = useAuth();
  const { roleData, loading: roleLoading, error: roleError } = useUserRole();

  useEffect(() => {
    if (!loading && !user) {
      redirect('/auth/login');
    }
  }, [user, loading]);

  // Redirect to onboarding if user needs to complete it
  useEffect(() => {
    if (!loading && user && onboardingStatus?.needsOnboarding) {
      redirect(onboardingStatus.redirectPath || '/onboarding');
    }
  }, [user, loading, onboardingStatus]);

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
        ? teachersRolegate
        : userRole === 'institution_admin'
          ? InstitutionRolegate
          : [];

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      <div className="print:hidden">
        <Navbar
          children1={<DashboardNav userId={user.id} items={navItems} />}
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
