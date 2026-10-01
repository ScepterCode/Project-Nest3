import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasEnvVars } from '../utils';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip middleware check. You can remove this once you setup the project.
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
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Handle authenticated users
  if (user) {
    // Simple onboarding check - just check if user profile exists
    try {
      const { data: userProfile } = await supabase
        .from('users')
        .select('onboarding_completed, role')
        .eq('id', user.id)
        .single();

      const needsOnboarding = !userProfile?.onboarding_completed;

      // If user needs onboarding and is trying to access protected routes
      if (
        needsOnboarding &&
        request.nextUrl.pathname.startsWith('/dashboard')
      ) {
        const url = request.nextUrl.clone();
        url.pathname = '/onboarding';
        return NextResponse.redirect(url);
      }

      // If user completed onboarding but is still on onboarding page, redirect to their role dashboard
      if (
        !needsOnboarding &&
        request.nextUrl.pathname.startsWith('/onboarding')
      ) {
        const userRole = userProfile?.role || 'student';
        const url = request.nextUrl.clone();
        url.pathname = `/dashboard/${userRole}`;
        return NextResponse.redirect(url);
      }

      // Enforce role-based dashboard access - redirect to correct dashboard if on wrong one
      if (
        !needsOnboarding &&
        request.nextUrl.pathname.startsWith('/dashboard/')
      ) {
        const userRole = userProfile?.role || 'student';
        const currentPath = request.nextUrl.pathname;

        // Map roles to their dashboard paths
        const roleDashboardMap: Record<string, string> = {
          student: '/dashboard/student',
          teacher: '/dashboard/teacher',
          institution_admin: '/dashboard/institution',
          department_admin: '/dashboard/department_admin',
          system_admin: '/dashboard/admin',
        };

        const correctDashboard =
          roleDashboardMap[userRole] || '/dashboard/student';

        // If user is on wrong dashboard, redirect to correct one
        // Allow access to sub-pages of the correct dashboard
        if (
          !currentPath.startsWith(correctDashboard) &&
          !currentPath.startsWith('/dashboard/profile') &&
          currentPath !== '/dashboard'
        ) {
          const url = request.nextUrl.clone();
          url.pathname = correctDashboard;
          return NextResponse.redirect(url);
        }
      }

      // Only redirect away from auth pages if user is fully authenticated AND has completed onboarding
      // This prevents redirect loops for users who are authenticated but need to complete setup
      if (
        request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.includes('/confirm') &&
        userProfile &&
        !needsOnboarding
      ) {
        const userRole = userProfile.role || 'student';
        const url = request.nextUrl.clone();
        url.pathname = `/dashboard/${userRole}`;
        return NextResponse.redirect(url);
      }
    } catch (error) {
      console.error('Error checking user profile in middleware:', error);
      // If there's an error checking profile, allow the request to continue
      // This prevents users from getting stuck if there are database issues
    }
  }

  // If user is not authenticated and trying to access protected routes, redirect to login
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // Public uptime check (reveals only up/down).
  if (request.nextUrl.pathname === '/api/health') {
    return supabaseResponse;
  }

  // Signed-out API calls get a JSON 401 instead of a redirect to the login
  // page. This is also the safety net for API routes without their own check.
  if (!user && request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Legacy protected route redirect
  if (
    request.nextUrl.pathname !== '/' &&
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/dashboard')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
