// Types and helpers for the platform admin pages. Data comes from the
// platform_* database functions (supabase/migrations/20261016120000_platform_admin.sql).

import { createClient } from '@/lib/supabase/client';

export interface PlatformSchool {
  id: string;
  name: string;
  status: string;
  institution_type: string | null;
  size_band: string | null;
  contact_name: string | null;
  contact_email: string | null;
  admins: string | null;
  teachers: number;
  students: number;
  classes: number;
  assignments: number;
  submissions: number;
  submission_rate: number | null;
  average_grade: number | null;
  last_activity: string | null;
  created_at: string;
}

export interface PlatformOverview {
  schools: number;
  active_schools: number;
  admins: number;
  teachers: number;
  students: number;
  classes: number;
  assignments: number;
  submissions: number;
  active_7d: number;
  active_30d: number;
  weekly: {
    week: string;
    new_users: number;
    new_classes: number;
    submissions: number;
  }[];
}

export interface PlatformPerson {
  id: string;
  email: string;
  name: string | null;
  role: string;
  school_id: string | null;
  school_name: string | null;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  disabled: boolean;
  created_at: string;
}

export interface PlatformInvite {
  code: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_email: string | null;
  used_by_name: string | null;
  school_name: string | null;
  revoked_at: string | null;
  status: 'unused' | 'used' | 'expired' | 'revoked';
}

/** Calls a platform_* function; throws its error message. */
export async function platformRpc<T>(
  name: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await createClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** PostgREST returns bigint/numeric columns as strings; make them numbers. */
export function toSchool(row: Record<string, unknown>): PlatformSchool {
  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  const maybe = (v: unknown) =>
    v === null || v === undefined ? null : Number(v);
  return {
    ...(row as unknown as PlatformSchool),
    teachers: num(row.teachers),
    students: num(row.students),
    classes: num(row.classes),
    assignments: num(row.assignments),
    submissions: num(row.submissions),
    submission_rate: maybe(row.submission_rate),
    average_grade: maybe(row.average_grade),
  };
}

export const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  teacher: 'Teacher',
  institution_admin: 'School admin',
  department_admin: 'Department admin',
  system_admin: 'Platform admin',
  programme_viewer: 'Programme viewer',
};

export function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

/** "3 days ago", "today", or "never". */
export function sinceText(value: string | null | undefined) {
  if (!value) return 'never';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const QUIET_AFTER_DAYS = 14;

export function isQuiet(
  school: Pick<PlatformSchool, 'last_activity' | 'status'>
) {
  if (school.status !== 'active') return false;
  if (!school.last_activity) return true;
  return (
    Date.now() - new Date(school.last_activity).getTime() >
    QUIET_AFTER_DAYS * 86400000
  );
}
