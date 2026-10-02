/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { ACTIVITY_COOKIE, IDLE_TIMEOUT_SECONDS } from '@/lib/auth/idle';

jest.mock('@/lib/utils', () => ({ hasEnvVars: true }));

const signOut = jest.fn();
let currentUser: { id: string; last_sign_in_at?: string } | null = null;

jest.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    { cookies }: { cookies: { setAll: (c: unknown[]) => void } }
  ) => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
      signOut: async (options: unknown) => {
        signOut(options);
        // What Supabase does on sign-out: expire the session cookie.
        cookies.setAll([
          { name: 'sb-test-auth-token', value: '', options: { maxAge: 0 } },
        ]);
        return { error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { role: 'student', onboarding_completed: true },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

// Imported after the mocks.
import { updateSession } from '@/lib/supabase/middleware';

const now = () => Math.floor(Date.now() / 1000);
const minutesAgo = (m: number) => now() - m * 60;
const isoMinutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

function request(path: string, lastActive?: number) {
  const req = new NextRequest(new URL(path, 'https://app.test'));
  if (lastActive !== undefined) {
    req.cookies.set(ACTIVITY_COOKIE, String(lastActive));
  }
  return req;
}

describe('middleware idle timeout', () => {
  beforeEach(() => {
    signOut.mockClear();
    currentUser = { id: 'u1', last_sign_in_at: isoMinutesAgo(600) };
  });

  it('lets an active user through and refreshes the activity stamp', async () => {
    const res = await updateSession(
      request('/dashboard/student', minutesAgo(5))
    );

    expect(signOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
    const stamp = res.cookies.get(ACTIVITY_COOKIE);
    expect(Number(stamp?.value)).toBeGreaterThanOrEqual(now() - 1);
    expect(stamp?.maxAge).toBe(IDLE_TIMEOUT_SECONDS);
  });

  it('signs out and redirects after 30 minutes without activity', async () => {
    const res = await updateSession(
      request('/dashboard/student', minutesAgo(31))
    );

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(res.headers.get('location')).toBe(
      'https://app.test/auth/login?reason=idle'
    );
    // The redirect carries the cleared session cookie and drops ours.
    expect(res.cookies.get('sb-test-auth-token')?.value).toBe('');
    expect(res.cookies.get(ACTIVITY_COOKIE)?.value).toBe('');
  });

  it('counts a fresh sign-in as activity before any stamp exists', async () => {
    currentUser = { id: 'u1', last_sign_in_at: isoMinutesAgo(1) };
    const res = await updateSession(request('/dashboard/student'));

    expect(signOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('signs out an old session that has no activity stamp', async () => {
    const res = await updateSession(request('/'));

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(res.headers.get('location')).toBe(
      'https://app.test/auth/login?reason=idle'
    );
  });

  it('ignores an activity stamp set in the future', async () => {
    const res = await updateSession(request('/', now() + 24 * 3600));
    // Clamped to now, so it counts as active right now, not for a day.
    expect(signOut).not.toHaveBeenCalled();
    expect(Number(res.cookies.get(ACTIVITY_COOKIE)?.value)).toBeLessThanOrEqual(
      now()
    );
  });

  it('does nothing for signed-out visitors', async () => {
    currentUser = null;
    const res = await updateSession(request('/', minutesAgo(120)));

    expect(signOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });
});
