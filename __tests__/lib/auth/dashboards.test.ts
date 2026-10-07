import { dashboardFor, isWithin } from '@/lib/auth/dashboards';

describe('dashboardFor', () => {
  it.each([
    ['student', '/dashboard/student'],
    ['teacher', '/dashboard/teacher'],
    ['institution_admin', '/dashboard/institution'],
    ['department_admin', '/dashboard/profile'],
    [null, '/dashboard/student'],
    ['something-else', '/dashboard/student'],
  ])('%s → %s', (role, path) => {
    expect(dashboardFor(role)).toBe(path);
  });
});

describe('isWithin', () => {
  it('matches the page and pages under it', () => {
    expect(isWithin('/dashboard/institution', '/dashboard/institution')).toBe(
      true
    );
    expect(
      isWithin('/dashboard/institution/users', '/dashboard/institution')
    ).toBe(true);
  });

  it('does not match a sibling that shares a prefix', () => {
    expect(
      isWithin('/dashboard/institution_admin', '/dashboard/institution')
    ).toBe(false);
  });
});
