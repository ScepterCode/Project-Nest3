import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasEnvVars } from '../utils';
import {
  ACTIVITY_COOKIE,
  IDLE_SIGN_OUT_PATH,
  IDLE_TIMEOUT_SECONDS,
} from '../auth/idle';
import { dashboardFor, isWithin } from '../auth/dashboards';

// Short-lived cache of { role, onboarded } for navigation redirects, so rapid
// page changes don't each query `users`. Only used to decide redirects; every
// page and API still enforces access through RLS. Only cached once onboarding
// is complete, so finishing onboarding takes effect immediately; a role change
// takes effect within PROFILE_CACHE_SECONDS.
const SHARED_DASHBOARD_PAGES = [
  '/dashboard/profile',
  '/dashboard/notifications',
];

const PROFILE_COOKIE = 'pn_nav';
const PROFILE_CACHE_SECONDS = 60;

interface NavProfile {
  role: string;
  onboarded: boolean;
}

function readCachedProfile(
  request: NextRequest,
  userId: string
): NavProfile | null {
  const value = request.cookies.get(PROFILE_COOKIE)?.value;
  if (!value) return null;
  const [id, role, expires] = value.split('.');
  if (id !== userId || !role || Number(expires) < Date.now() / 1000)
    return null;
  return { role, onboarded: true };
}

function needsProfile(pathname: string) {
  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/auth')
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // If the env vars are not set, skip middleware check.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and supabase.auth.getUser():
  // it refreshes the session and must happen first.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Redirects must carry the refreshed session cookies, or the browser and
  // server fall out of sync and the user gets logged out.
  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    supabaseResponse.cookies
      .getAll()
      .forEach(cookie => response.cookies.set(cookie));
    return response;
  };

  if (user) {
    // Idle timeout: last activity is the later of the browser's activity
    // stamp and the sign-in itself (the stamp doesn't exist yet right after
    // signing in).
    const now = Math.floor(Date.now() / 1000);
    const stamped = Number(request.cookies.get(ACTIVITY_COOKIE)?.value) || 0;
    const signedIn = user.last_sign_in_at
      ? Math.floor(Date.parse(user.last_sign_in_at) / 1000)
      : 0;
    if (
      now - Math.max(Math.min(stamped, now), signedIn) >=
      IDLE_TIMEOUT_SECONDS
    ) {
      // Revokes this session's refresh token on Supabase and clears the
      // session cookies (through setAll above).
      await supabase.auth.signOut({ scope: 'local' });
      const response = redirectTo(IDLE_SIGN_OUT_PATH);
      response.cookies.delete(ACTIVITY_COOKIE);
      response.cookies.delete(PROFILE_COOKIE);
      return response;
    }
    // A page request is activity too.
    supabaseResponse.cookies.set(ACTIVITY_COOKIE, String(now), {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: IDLE_TIMEOUT_SECONDS,
    });
  }

  if (!user) {
    if (
      pathname === '/' ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/login')
    ) {
      return supabaseResponse;
    }
    return redirectTo('/auth/login');
  }

  if (!needsProfile(pathname)) {
    return supabaseResponse;
  }

  let profile = readCachedProfile(request, user.id);
  if (!profile) {
    const { data, error } = await supabase
      .from('users')
      .select('onboarding_completed, role')
      .eq('id', user.id)
      .single();
    if (error || !data) {
      // Don't lock people out if the profile can't be read; pages enforce
      // access themselves.
      return supabaseResponse;
    }
    profile = {
      role: data.role || 'student',
      onboarded: !!data.onboarding_completed,
    };
    if (profile.onboarded) {
      supabaseResponse.cookies.set(
        PROFILE_COOKIE,
        `${user.id}.${profile.role}.${Math.floor(Date.now() / 1000) + PROFILE_CACHE_SECONDS}`,
        {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: PROFILE_CACHE_SECONDS,
        }
      );
    }
  }

  const dashboard = dashboardFor(profile.role);

  if (!profile.onboarded) {
    return pathname.startsWith('/dashboard')
      ? redirectTo('/onboarding')
      : supabaseResponse;
  }

  // Onboarded users don't belong on onboarding or auth pages (except the
  // email-confirmation callback).
  if (pathname.startsWith('/onboarding')) {
    return redirectTo(dashboard);
  }
  // Except the email-confirmation callback and setting a new password, which
  // a password-reset link opens signed in.
  if (
    pathname.startsWith('/auth') &&
    !isWithin(pathname, '/auth/confirm') &&
    !isWithin(pathname, '/auth/update-password')
  ) {
    return redirectTo(dashboard);
  }

  // Keep users inside their own role's dashboard (profile and notifications
  // are shared by every role).
  if (
    pathname.startsWith('/dashboard/') &&
    !isWithin(pathname, dashboard) &&
    !SHARED_DASHBOARD_PAGES.some(page => isWithin(pathname, page))
  ) {
    return redirectTo(dashboard);
  }

  return supabaseResponse;
}
