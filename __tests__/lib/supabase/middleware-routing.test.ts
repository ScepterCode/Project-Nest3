/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { ACTIVITY_COOKIE } from '@/lib/auth/idle';

jest.mock('@/lib/utils', () => ({ hasEnvVars: true }));

let role = 'student';

jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: 'u1', last_sign_in_at: new Date().toISOString() },
        },
      }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { role, onboarding_completed: true },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

// Imported after the mocks.
import { updateSession } from '@/lib/supabase/middleware';

async function visit(path: string) {
  const req = new NextRequest(new URL(path, 'https://app.test'));
  req.cookies.set(ACTIVITY_COOKIE, String(Math.floor(Date.now() / 1000)));
  const res = await updateSession(req);
  return res.headers.get('location');
}

describe('middleware routing for signed-in, onboarded users', () => {
  it.each([
    ['student', '/dashboard/student/classes'],
    ['teacher', '/dashboard/teacher'],
    ['institution_admin', '/dashboard/institution/users'],
    ['student', '/dashboard/profile'],
    ['teacher', '/dashboard/notifications'],
    ['institution_admin', '/dashboard/notifications'],
    ['student', '/auth/update-password'],
  ])('lets a %s open %s', async (r, path) => {
    role = r;
    expect(await visit(path)).toBeNull();
  });

  it.each([
    [
      'institution_admin',
      '/dashboard/institution_admin',
      '/dashboard/institution',
    ],
    ['student', '/dashboard/teacher', '/dashboard/student'],
    ['teacher', '/dashboard/institution', '/dashboard/teacher'],
    ['student', '/dashboard/studentx', '/dashboard/student'],
    ['teacher', '/auth/login', '/dashboard/teacher'],
    ['student', '/onboarding', '/dashboard/student'],
  ])('sends a %s from %s to %s', async (r, path, target) => {
    role = r;
    expect(await visit(path)).toBe(`https://app.test${target}`);
  });
});
