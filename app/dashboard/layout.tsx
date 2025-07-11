"use client"

import { redirect } from 'next/navigation'
import { AuthProvider, useAuth, logout } from '@/contexts/auth-context'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      redirect('/auth/login')
    }
  }, [user, loading])

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
          {userRole === 'student' && (
            <>
              <Link href="/dashboard/student" className="text-foreground transition-colors hover:text-foreground">
                Student Dashboard
              </Link>
              <Link href="/dashboard/student/assignments" className="text-muted-foreground transition-colors hover:text-foreground">
                Assignments
              </Link>
              <Link href="/dashboard/student/grades" className="text-muted-foreground transition-colors hover:text-foreground">
                Grades
              </Link>
              <Link href="/dashboard/student/peer-reviews" className="text-muted-foreground transition-colors hover:text-foreground">
                Peer Reviews
              </Link>
            </>
          )}
          {userRole === 'teacher' && (
            <>
              <Link href="/dashboard/teacher" className="text-foreground transition-colors hover:text-foreground">
                Teacher Dashboard
              </Link>
              <Link href="/dashboard/teacher/classes" className="text-muted-foreground transition-colors hover:text-foreground">
                Classes
              </Link>
              <Link href="/dashboard/teacher/assignments" className="text-muted-foreground transition-colors hover:text-foreground">
                Assignments
              </Link>
              <Link href="/dashboard/teacher/peer-reviews" className="text-muted-foreground transition-colors hover:text-foreground">
                Peer Reviews
              </Link>
              <Link href="/dashboard/teacher/rubrics" className="text-muted-foreground transition-colors hover:text-foreground">
                Rubrics
              </Link>
              <Link href="/dashboard/teacher/analytics/grades" className="text-muted-foreground transition-colors hover:text-foreground">
                Analytics
              </Link>
            </>
          )}
            {userRole === 'institution' && (
              <>
                <Link href="/dashboard/institution" className="text-foreground transition-colors hover:text-foreground">
                  Institution Dashboard
                </Link>
                <Link href="/dashboard/institution/users" className="text-muted-foreground transition-colors hover:text-foreground">
                  Users
                </Link>
                <Link href="/dashboard/institution/departments" className="text-muted-foreground transition-colors hover:text-foreground">
                  Departments
                </Link>
                <Link href="/dashboard/institution/reports" className="text-muted-foreground transition-colors hover:text-foreground">
                  Reports
                </Link>
              </>
            )}
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
