import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function middleware(request: NextRequest) {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()

  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}