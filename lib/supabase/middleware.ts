import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasEnvVars } from '../utils';

// Where each role lands. Roles without a dashboard yet go to their profile.
const ROLE_DASHBOARD: Record<string, string> = {
  student: '/dashboard/student',
  teacher: '/dashboard/teacher',
  institution_admin: '/dashboard/institution',
  department_admin: '/dashboard/profile',
  system_admin: '/dashboard/profile',
};

// Short-lived cache of { role, onboarded } for navigation redirects, so rapid
// page changes don't each query `users`. Only used to decide redirects; every
// page and API still enforces access through RLS. Only cached once onboarding
// is complete, so finishing onboarding takes effect immediately; a role change
// takes effect within PROFILE_CACHE_SECONDS.
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
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = '';
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach(cookie => response.cookies.set(cookie));
    return response;
  };

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

  const dashboard = ROLE_DASHBOARD[profile.role] ?? '/dashboard/student';

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
  if (pathname.startsWith('/auth') && !pathname.includes('/confirm')) {
    return redirectTo(dashboard);
  }

  // Keep users inside their own role's dashboard (profile and /dashboard are shared).
  if (
    pathname.startsWith('/dashboard/') &&
    !pathname.startsWith(dashboard) &&
    !pathname.startsWith('/dashboard/profile')
  ) {
    return redirectTo(dashboard);
  }

  return supabaseResponse;
}
