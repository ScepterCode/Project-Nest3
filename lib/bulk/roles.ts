// Roles an institution admin may assign in bulk. department_admin has no
// dashboard yet and system_admin is never assignable; the users guard trigger
// in the database enforces the same rule.
export const ASSIGNABLE_ROLES = [
  'student',
  'teacher',
  'institution_admin',
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  teacher: 'Teacher',
  institution_admin: 'Institution admin',
  department_admin: 'Department admin',
  system_admin: 'System admin',
};

export const BULK_ROLE_MAX_USERS = 500;
