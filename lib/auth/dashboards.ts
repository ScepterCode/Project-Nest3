// Where each role lands. Roles without a dashboard yet go to their profile.
export const ROLE_DASHBOARD: Record<string, string> = {
  student: '/dashboard/student',
  teacher: '/dashboard/teacher',
  institution_admin: '/dashboard/institution',
  department_admin: '/dashboard/profile',
  system_admin: '/dashboard/profile',
};

export function dashboardFor(role: string | null | undefined): string {
  return ROLE_DASHBOARD[role ?? ''] ?? '/dashboard/student';
}

/** True for `base` itself and pages under it, not for siblings sharing a prefix. */
export function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}
