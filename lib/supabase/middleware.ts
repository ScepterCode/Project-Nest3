import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { OnboardingGuard } from "../utils/onboarding-guard";
import { extractTenantContext } from "../utils/tenant-context";
import { CrossTenantMonitor } from "../services/cross-tenant-monitor";

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
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
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
    // Check onboarding status for authenticated users
    const onboardingStatus = await OnboardingGuard.checkOnboardingStatus(user);
    
    // If user needs onboarding and is trying to access protected routes
    if (onboardingStatus.needsOnboarding && OnboardingGuard.requiresOnboarding(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = onboardingStatus.redirectPath || '/onboarding';
      return NextResponse.redirect(url);
    }

    // If user is trying to access auth pages after authentication, redirect appropriately
    if (request.nextUrl.pathname.startsWith("/auth")) {
      const url = request.nextUrl.clone();
      if (onboardingStatus.needsOnboarding) {
        url.pathname = onboardingStatus.redirectPath || '/onboarding';
      } else {
        const userRole = user.user_metadata?.role || 'student';
        url.pathname = OnboardingGuard.getDashboardPath(userRole);
      }
      return NextResponse.redirect(url);
    }

    // If user is accessing root, redirect appropriately
    if (request.nextUrl.pathname === "/") {
      const url = request.nextUrl.clone();
      if (onboardingStatus.needsOnboarding) {
        url.pathname = onboardingStatus.redirectPath || '/onboarding';
      } else {
        const userRole = user.user_metadata?.role || 'student';
        url.pathname = OnboardingGuard.getDashboardPath(userRole);
      }
      return NextResponse.redirect(url);
    }

    // If user completed onboarding but is still on onboarding page, redirect to dashboard
    if (!onboardingStatus.needsOnboarding && request.nextUrl.pathname.startsWith("/onboarding")) {
      const userRole = user.user_metadata?.role || 'student';
      const url = request.nextUrl.clone();
      url.pathname = OnboardingGuard.getDashboardPath(userRole);
      return NextResponse.redirect(url);
    }
  }

  // If user is not authenticated and trying to access protected routes, redirect to login
  if (
    !user &&
    request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Legacy protected route redirect
  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
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
