"use client"

import { redirect } from 'next/navigation'
import { AuthProvider, useAuth, logout } from '@/contexts/auth-context'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DashboardOnboardingReminder } from '@/components/onboarding/onboarding-reminder'
import { PermissionGate, RoleGate } from '@/components/ui/permission-gate'

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, loading, onboardingStatus } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      redirect('/auth/login')
    }
  }, [user, loading])

  // Redirect to onboarding if user needs to complete it
  useEffect(() => {
    if (!loading && user && onboardingStatus?.needsOnboarding) {
      redirect(onboardingStatus.redirectPath || '/onboarding')
    }
  }, [user, loading, onboardingStatus])

  if (loading) {
    return <div>Loading dashboard...</div>
  }

  if (!user) {
    return null // Should redirect by useEffect
  }

  const userRole = user.user_metadata?.role || 'student'

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
          <Link href="#" className="flex items-center gap-2 text-lg font-semibold md:text-base">
            <span className="sr-only">Project Nest3</span>
          </Link>
          
          {/* Student Navigation */}
          <RoleGate userId={user.id} allowedRoles={['student']}>
            <Link href="/dashboard/student" className="text-foreground transition-colors hover:text-foreground">
              Student Dashboard
            </Link>
            <PermissionGate userId={user.id} permission="assignments.read">
              <Link href="/dashboard/student/assignments" className="text-muted-foreground transition-colors hover:text-foreground">
                Assignments
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="grades.read">
              <Link href="/dashboard/student/grades" className="text-muted-foreground transition-colors hover:text-foreground">
                Grades
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="peer_reviews.read">
              <Link href="/dashboard/student/peer-reviews" className="text-muted-foreground transition-colors hover:text-foreground">
                Peer Reviews
              </Link>
            </PermissionGate>
          </RoleGate>

          {/* Teacher Navigation */}
          <RoleGate userId={user.id} allowedRoles={['teacher']}>
            <Link href="/dashboard/teacher" className="text-foreground transition-colors hover:text-foreground">
              Teacher Dashboard
            </Link>
            <PermissionGate userId={user.id} permission="classes.manage">
              <Link href="/dashboard/teacher/classes" className="text-muted-foreground transition-colors hover:text-foreground">
                Classes
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="assignments.manage">
              <Link href="/dashboard/teacher/assignments" className="text-muted-foreground transition-colors hover:text-foreground">
                Assignments
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="peer_reviews.manage">
              <Link href="/dashboard/teacher/peer-reviews" className="text-muted-foreground transition-colors hover:text-foreground">
                Peer Reviews
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="rubrics.manage">
              <Link href="/dashboard/teacher/rubrics" className="text-muted-foreground transition-colors hover:text-foreground">
                Rubrics
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="analytics.read">
              <Link href="/dashboard/teacher/analytics/grades" className="text-muted-foreground transition-colors hover:text-foreground">
                Analytics
              </Link>
            </PermissionGate>
          </RoleGate>

          {/* Institution Admin Navigation */}
          <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
            <Link href="/dashboard/institution" className="text-foreground transition-colors hover:text-foreground">
              Institution Dashboard
            </Link>
            <PermissionGate userId={user.id} permission="users.manage">
              <Link href="/dashboard/institution/users" className="text-muted-foreground transition-colors hover:text-foreground">
                Users
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="departments.manage">
              <Link href="/dashboard/institution/departments" className="text-muted-foreground transition-colors hover:text-foreground">
                Departments
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="reports.read">
              <Link href="/dashboard/institution/reports" className="text-muted-foreground transition-colors hover:text-foreground">
                Reports
              </Link>
            </PermissionGate>
          </RoleGate>

          {/* Department Admin Navigation */}
          <RoleGate userId={user.id} allowedRoles={['department_admin']}>
            <Link href="/dashboard/department_admin" className="text-foreground transition-colors hover:text-foreground">
              Department Dashboard
            </Link>
            <PermissionGate userId={user.id} permission="department_users.manage">
              <Link href="/dashboard/department_admin/users" className="text-muted-foreground transition-colors hover:text-foreground">
                Department Users
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="department_classes.manage">
              <Link href="/dashboard/department_admin/classes" className="text-muted-foreground transition-colors hover:text-foreground">
                Classes
              </Link>
            </PermissionGate>
          </RoleGate>

          {/* System Admin Navigation */}
          <RoleGate userId={user.id} allowedRoles={['system_admin']}>
            <Link href="/dashboard/admin" className="text-foreground transition-colors hover:text-foreground">
              System Admin
            </Link>
            <PermissionGate userId={user.id} permission="system.manage">
              <Link href="/dashboard/admin/institutions" className="text-muted-foreground transition-colors hover:text-foreground">
                Institutions
              </Link>
            </PermissionGate>
            <PermissionGate userId={user.id} permission="system.manage">
              <Link href="/dashboard/admin/users" className="text-muted-foreground transition-colors hover:text-foreground">
                All Users
              </Link>
            </PermissionGate>
          </RoleGate>
          </nav>
          <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
            <div className="ml-auto flex-1 sm:flex-initial">
              {/* Search or other header elements */}
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
          <DashboardOnboardingReminder />
          {children}
        </main>
      </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  )
}
