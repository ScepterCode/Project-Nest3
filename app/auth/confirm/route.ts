import { createClient } from '@/lib/supabase/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/auth/email-links';

const OTP_TYPES: EmailOtpType[] = [
  'signup',
  'email',
  'recovery',
  'invite',
  'magiclink',
  'email_change',
];

/**
 * Where the links in our emails land (see docs/accounts-and-codes.md for the
 * email templates). The link carries a one-time token hash, so it works on
 * any device, not just the browser the person signed up in.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'));

  if (!token_hash || !type || !OTP_TYPES.includes(type)) {
    redirect('/auth/error?error=link_incomplete');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    redirect('/auth/error?error=link_expired');
  }

  if (type === 'recovery') {
    // Password-reset link: straight to choosing a new password.
    redirect('/auth/update-password');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login?reason=confirmed');
  }

  const { OnboardingGuard } = await import('@/lib/utils/onboarding-guard');
  const onboardingStatus = await OnboardingGuard.checkOnboardingStatus(user);
  if (onboardingStatus.needsOnboarding) {
    redirect(onboardingStatus.redirectPath || '/onboarding');
  }
  // /dashboard sends each user to their own role's dashboard.
  redirect(next && next.startsWith('/dashboard/') ? next : '/dashboard');
}
