import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on pages only. Skipped:
     * - api/* : every route authenticates the caller itself, so running the
     *   middleware there only duplicated the auth round trip
     * - _next/static, _next/image, favicon.ico and image files
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
