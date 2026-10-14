'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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
import { createClient } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/toast';

type Stage =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'verify'; factorId: string }
  | { kind: 'enroll'; factorId: string; qr: string; secret: string }
  | { kind: 'error'; message: string };

/**
 * Platform pages need a two-factor sign-in (Supabase TOTP; the database
 * checks the session's aal2 on every platform function). First visit: scan a
 * QR code with an authenticator app and confirm a code. Afterwards: enter
 * the current code once per sign-in.
 */
export function TwoFactorGate({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const start = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data: aal, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) throw aalError;
      if (aal.currentLevel === 'aal2') {
        setStage({ kind: 'ready' });
        return;
      }
      const { data: factors, error: listError } =
        await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = factors.totp.find(f => f.status === 'verified');
      if (verified) {
        setStage({ kind: 'verify', factorId: verified.id });
        return;
      }
      // Clear half-finished set-ups so a fresh one can start.
      for (const factor of factors.all) {
        if (factor.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data: enrolled, error: enrollError } =
        await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `ProjectNest platform ${new Date().toISOString().slice(0, 10)}`,
        });
      if (enrollError) throw enrollError;
      setStage({
        kind: 'enroll',
        factorId: enrolled.id,
        qr: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      });
    } catch (error) {
      setStage({
        kind: 'error',
        message: errorMessage(error, 'Could not start two-factor sign-in'),
      });
    }
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stage.kind !== 'verify' && stage.kind !== 'enroll') return;
    setChecking(true);
    setCodeError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({
      factorId: stage.factorId,
      code: code.replace(/\s/g, ''),
    });
    setChecking(false);
    if (error) {
      setCodeError(
        'That code didn’t work. Check your authenticator app and try the current code.'
      );
      return;
    }
    setCode('');
    setStage({ kind: 'ready' });
  };

  if (stage.kind === 'ready') return <>{children}</>;

  if (stage.kind === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (stage.kind === 'error') {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-red-600">{stage.message}</p>
          <p className="text-sm text-muted-foreground">
            If this keeps happening, check that TOTP multi-factor authentication
            is enabled in Supabase (Authentication → Multi factor).
          </p>
          <Button variant="outline" onClick={start}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {stage.kind === 'enroll'
            ? 'Set up two-factor sign-in'
            : 'Enter your two-factor code'}
        </CardTitle>
        <CardDescription>
          {stage.kind === 'enroll'
            ? 'The platform dashboard can see every school, so it needs a second step at sign-in. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or 1Password), then enter the 6-digit code it shows.'
            : 'Open your authenticator app and enter the current 6-digit code for ProjectNest.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stage.kind === 'enroll' && (
          <div className="space-y-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stage.qr}
              alt="QR code for your authenticator app"
              className="mx-auto h-48 w-48"
            />
            <p className="text-xs text-muted-foreground">
              Can&apos;t scan? Enter this key instead:
              <br />
              <code className="break-all font-mono">{stage.secret}</code>
            </p>
          </div>
        )}
        <form onSubmit={confirm} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="totp-code">6-digit code</Label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={e => setCode(e.target.value)}
              className="font-mono tracking-widest"
              autoFocus
            />
            {codeError && <p className="text-sm text-red-600">{codeError}</p>}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={checking || code.replace(/\s/g, '').length < 6}
          >
            {checking ? 'Checking...' : 'Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
