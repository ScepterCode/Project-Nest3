'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

const WAIT_SECONDS = 60;

/** Sends the sign-up confirmation email again. */
export function ResendConfirmation({
  defaultEmail = '',
  askForEmail = true,
}: {
  defaultEmail?: string;
  askForEmail?: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  useEffect(() => setEmail(defaultEmail), [defaultEmail]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async () => {
    if (!email.trim()) {
      setResult({ ok: false, text: 'Enter the email you signed up with.' });
      return;
    }
    setSending(true);
    setResult(null);
    const { error } = await createClient().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setSending(false);
    if (error) {
      setResult({
        ok: false,
        text: /rate limit|too many|seconds/i.test(error.message)
          ? 'Too many emails have been sent just now. Wait a few minutes and try again.'
          : error.message,
      });
      return;
    }
    setWait(WAIT_SECONDS);
    setResult({
      ok: true,
      text: 'Sent. Check your inbox and your spam or junk folder. Only the newest link works.',
    });
  };

  return (
    <div className="space-y-2">
      {askForEmail && (
        <div className="grid gap-1">
          <Label htmlFor="resend-email">Email you signed up with</Label>
          <Input
            id="resend-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={send}
        disabled={sending || wait > 0}
      >
        {sending
          ? 'Sending…'
          : wait > 0
            ? `Send again in ${wait}s`
            : 'Send the confirmation email again'}
      </Button>
      {result && (
        <p
          className={`text-xs ${result.ok ? 'text-green-700' : 'text-red-600'}`}
          role="status"
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
