import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if user is accessing dashboard routes
  if (pathname.startsWith("/dashboard")) {
    const sessionCookie = request.cookies.get("session")

    if (!sessionCookie) {
      // Redirect to login if no session
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }
  }

  // Allow access to auth routes and public routes
  if (pathname.startsWith("/auth") || pathname === "/" || pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
