'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound, MessageSquareText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setupMessage } from '@/lib/auth/setup-link';
import { toast } from '@/lib/toast';

/** Shows a set-up link to copy and send by WhatsApp, SMS, etc. */
export function SetupLinkPanel({
  name,
  firstName,
  link,
  onClose,
}: {
  name: string;
  firstName: string | null;
  link: string;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);

  const copy = async (what: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(
        what === 'link' ? link : setupMessage(firstName, link)
      );
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-blue-900">
          <KeyRound className="h-4 w-4" />
          Set-up link for {name}
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-blue-900 hover:bg-blue-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="text-blue-900">
        Send this to them by WhatsApp, SMS or any message. They open it, choose
        a password and they&apos;re in. It works once and expires (usually after
        an hour): if it does, make a new one from the members list.
      </p>
      <input
        readOnly
        value={link}
        onFocus={e => e.currentTarget.select()}
        aria-label="Set-up link"
        className="w-full rounded border bg-white px-2 py-1.5 font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => copy('message')}>
          {copied === 'message' ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <MessageSquareText className="mr-2 h-4 w-4" />
          )}
          {copied === 'message' ? 'Copied' : 'Copy message with link'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy('link')}>
          {copied === 'link' ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copied === 'link' ? 'Copied' : 'Copy link only'}
        </Button>
      </div>
      <p className="text-xs text-blue-800">
        Keep it private: anyone with the link can set this person&apos;s
        password.
      </p>
    </div>
  );
}
