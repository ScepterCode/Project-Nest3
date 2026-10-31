'use client';

import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { dashboardFor } from '@/lib/auth/dashboards';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ResendConfirmation } from '@/components/auth/resend-confirmation';
import { isEmailNotConfirmed } from '@/lib/auth/email-links';

export function LoginForm({
  className,
  notice,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & { notice?: string | undefined }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);
    setUnconfirmed(false);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (isEmailNotConfirmed(error)) {
          setUnconfirmed(true);
          return;
        }
        throw error;
      }

      // Check if user has completed onboarding
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Check if user profile exists and onboarding is complete
        const { data: userProfile } = await supabase
          .from('users')
          .select('onboarding_completed, role')
          .eq('id', user.id)
          .single();

        if (userProfile?.onboarding_completed) {
          // User has completed onboarding, go to dashboard
          router.push(dashboardFor(userProfile.role));
        } else {
          // User needs to complete onboarding
          router.push('/onboarding');
        }
      } else {
        console.error('No user found after sign in');
        setError('Authentication failed - no user found');
      }
    } catch (error: unknown) {
      console.error('Sign in process error:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Enter your email below to sign in to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notice && (
            <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              {notice}
            </p>
          )}
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              {unconfirmed && (
                <div className="space-y-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  <p>
                    You haven&apos;t confirmed your email yet. Open the link we
                    sent you (check spam or junk too), or send a new one.
                  </p>
                  <ResendConfirmation
                    defaultEmail={email}
                    askForEmail={false}
                  />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{' '}
              <Link
                href="/auth/sign-up"
                className="underline underline-offset-4"
              >
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
