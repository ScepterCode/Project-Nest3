'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { type EmailOtpType } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
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

type LinkState = 'checking' | 'ready' | 'unusable';

/**
 * Signs the person in from the reset link they arrived with, whatever its
 * form: a session in the URL fragment (links sent by our server), a PKCE
 * ?code= (only works in the browser that asked), a ?token_hash= (custom
 * email template), or a session already set by /auth/confirm.
 */
async function sessionFromLink(): Promise<boolean> {
  const supabase = createClient();
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    // Keep the tokens out of the address bar and history.
    window.history.replaceState(null, '', url.pathname);
    if (!error) return true;
  }

  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    window.history.replaceState(null, '', url.pathname);
    if (!error) return true;
  }

  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    window.history.replaceState(null, '', url.pathname);
    if (!error) return true;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return !!session;
}

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>('checking');

  useEffect(() => {
    sessionFromLink()
      .then(ok => setLinkState(ok ? 'ready' : 'unusable'))
      .catch(() => setLinkState('unusable'));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    if (password !== repeat) {
      setError("The two passwords don't match.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      // A full load, so the dashboard reads the account fresh.
      window.location.assign('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(
        /session/i.test(message)
          ? 'This reset link has expired. Request a new one below.'
          : message
      );
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          <CardDescription>
            {linkState === 'unusable'
              ? 'This reset link can’t be used.'
              : 'Enter your new password below.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkState === 'checking' ? (
            <p className="text-sm text-muted-foreground">Checking your link…</p>
          ) : linkState === 'unusable' ? (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                It has expired or was already used. Reset links work once and
                for a limited time. Ask for a new one and open the newest email.
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/forgot-password">Send a new reset link</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={save}>
              <div className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="repeat-password">Repeat it</Label>
                  <Input
                    id="repeat-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={repeat}
                    onChange={e => setRepeat(e.target.value)}
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600" role="alert">
                    {error}{' '}
                    {/expired/.test(error) && (
                      <Link
                        href="/auth/forgot-password"
                        className="underline underline-offset-4"
                      >
                        Send a new link
                      </Link>
                    )}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Saving…' : 'Save new password'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
