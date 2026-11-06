import { NextRequest, NextResponse } from 'next/server';
import { sendPasswordReset } from '@/lib/auth/password-reset';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST { email } → sends a password-reset link that works on any device.
 * Always answers the same way whether or not the email has an account, so
 * it can't be used to find out who is registered (Supabase's own rate
 * limits apply).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!EMAIL.test(email) || email.length > 320) {
    return NextResponse.json(
      { error: 'Enter a valid email address' },
      { status: 400 }
    );
  }

  const { error } = await sendPasswordReset(email, request.nextUrl.origin);
  if (error) {
    // Rate limits are worth telling the person about; anything else is
    // logged and answered like a success.
    if (/rate limit|too many|seconds/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            'Too many reset emails have been sent just now. Wait a few minutes and try again.',
        },
        { status: 429 }
      );
    }
    console.error('Password reset failed:', error.message);
  }
  return NextResponse.json({ ok: true });
}
