'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ResendConfirmation } from '@/components/auth/resend-confirmation';
import { SIGNUP_EMAIL_KEY } from '@/lib/auth/email-links';

export default function Page() {
  const { user, loading, onboardingStatus } = useAuth();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    try {
      setEmail(sessionStorage.getItem(SIGNUP_EMAIL_KEY) ?? '');
    } catch {
      // Storage blocked: the resend form asks for the email.
    }
  }, []);

  useEffect(() => {
    // Confirmed in this browser: carry on to onboarding.
    if (!loading && user && user.email_confirmed_at && !isRedirecting) {
      setIsRedirecting(true);
      if (onboardingStatus?.needsOnboarding) {
        router.push(onboardingStatus.redirectPath || '/onboarding');
      } else {
        // /dashboard sends each user to their role's dashboard, using the
        // role stored in the database (user_metadata is user-editable).
        router.push('/dashboard');
      }
    }
  }, [user, loading, onboardingStatus, router, isRedirecting]);

  if (loading || isRedirecting) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <p className="text-sm text-muted-foreground">
          {isRedirecting ? 'Taking you to set up your profile…' : 'Loading…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We sent a confirmation link{email ? ` to ${email}` : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Open the link to confirm your account. It works on any device,
              including your phone. After confirming, sign in here to finish
              setting up your profile.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth/login">I&apos;ve confirmed: sign in</Link>
            </Button>
            <div className="space-y-2 border-t pt-4">
              <p className="text-muted-foreground">
                No email after a few minutes? Check your spam or junk folder,
                then send it again.
              </p>
              <ResendConfirmation defaultEmail={email} askForEmail={!email} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
