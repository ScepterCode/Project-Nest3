'use client';

import { redirect } from 'next/navigation';
import { useAuth, logout } from '@/contexts/auth-context';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { DashboardOnboardingReminder } from '@/components/onboarding/onboarding-reminder';
import { PermissionGate, RoleGate } from '@/components/ui/permission-gate';
import { NotificationBell } from '@/components/notifications/notification-bell';

import Navbar from '@/components/Header/Navbar';
import NavLinks from '@/components/Header/Navlinks';
import {
  DepartmentRolegate,
  InstitutionRolegate,
  studentsRolegate,
  SystemRolegate,
  teachersRolegate,
} from './components/Permissiongate';
import { LogOut } from 'lucide-react';

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
                onClick={() => (window.location.href = '/debug')}
                className="w-full"
              >
                Go to Debug Page
              </Button>
              <Button
                variant="outline"
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

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      <Navbar
        children1={
          <>
            <RoleGate userId={user.id} allowedRoles={['student']}>
              {studentsRolegate.map((student, index) => (
                <PermissionGate
                  key={index}
                  userId={user.id}
                  permission={student.permission}
                >
                  <NavLinks className="" href={student.href}>
                    <div className="flex items-center space-x-2">
                      {student.icon}
                      <span>{student.text}</span>
                    </div>
                  </NavLinks>
                </PermissionGate>
              ))}
            </RoleGate>
            {/* Teacher Navigation */}
            <RoleGate userId={user.id} allowedRoles={['teacher']}>
              {teachersRolegate.map((teacher, index) => (
                <PermissionGate
                  key={index}
                  userId={user.id}
                  permission={teacher.permission}
                >
                  <NavLinks href={teacher.href}>
                    <div className="flex items-center space-x-2">
                      {teacher.icon}
                      <span>{teacher.text}</span>
                    </div>
                  </NavLinks>
                </PermissionGate>
              ))}
            </RoleGate>
            {/* Institution Admin Navigation */}
            <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
              {InstitutionRolegate.map((institution, index) => (
                <PermissionGate
                  key={index}
                  userId={user.id}
                  permission={institution.permission}
                >
                  <NavLinks href={institution.href}>
                    <div className="flex items-center space-x-2">
                      {institution.icon}
                      <span>{institution.text}</span>
                    </div>
                  </NavLinks>
                </PermissionGate>
              ))}
            </RoleGate>
            {/* Department Admin Navigation */}
            <RoleGate userId={user.id} allowedRoles={['department_admin']}>
              {DepartmentRolegate.map((department, index) => (
                <PermissionGate
                  userId={user.id}
                  key={index}
                  permission={department.permission}
                >
                  <NavLinks href={department.href}>
                    {' '}
                    <div className="flex items-center space-x-2">
                      {department.icon}
                      <span>{department.text}</span>
                    </div>
                  </NavLinks>
                </PermissionGate>
              ))}
            </RoleGate>
            {/* System Admin Navigation */}
            <RoleGate userId={user.id} allowedRoles={['system_admin']}>
              {SystemRolegate.map((system, index) => (
                <PermissionGate
                  key={index}
                  userId={user.id}
                  permission={system.permission}
                >
                  <NavLinks href={system.href}>
                    {' '}
                    <div className="flex items-center space-x-2">
                      {system.icon}
                      <span>{system.text}</span>
                    </div>
                  </NavLinks>
                </PermissionGate>
              ))}
            </RoleGate>
          </>
        }
        children2={
          <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
            <div className="ml-auto flex-1 sm:flex-initial">
              {/* Search or other header elements */}
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <span className="text-sm font-semibold text-gray-600">
                Role: <span className="font-medium capitalize">{userRole}</span>
              </span>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-2 w-2" />
              </Button>
            </div>
          </div>
        }
      />

      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <DashboardOnboardingReminder />
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
