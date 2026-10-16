'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { errorMessage, toast } from '@/lib/toast';

// Support requests (supabase/migrations/20261020120000_support_requests.sql):
// shared by the "Help & support" page and the platform support inbox.

export const SUPPORT_CATEGORIES = {
  complaint: 'Complaint',
  technical: 'Something isn’t working',
  question: 'Question',
  safeguarding: 'Safeguarding concern',
  other: 'Something else',
} as const;
export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;

export const SUPPORT_STATUS = {
  open: { label: 'Open', variant: 'destructive' as const },
  in_progress: { label: 'In progress', variant: 'default' as const },
  resolved: { label: 'Resolved', variant: 'secondary' as const },
  closed: { label: 'Closed', variant: 'outline' as const },
};
export type SupportStatus = keyof typeof SUPPORT_STATUS;

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  const s = SUPPORT_STATUS[status] ?? SUPPORT_STATUS.open;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

interface Thread {
  request: {
    id: string;
    category: SupportCategory;
    subject: string;
    status: SupportStatus;
    created_at: string;
    requester_name: string | null;
    school_name: string | null;
  };
  messages: {
    id: string;
    body: string;
    link_url: string | null;
    from_staff: boolean;
    author: string | null;
    created_at: string;
  }[];
}

const when = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * One request's conversation with a reply box. `staff` marks the platform
 * side (replies are signed "Programme team").
 */
export function SupportThread({
  requestId,
  staff = false,
  onChanged,
  actions,
}: {
  requestId: string;
  staff?: boolean;
  onChanged?: () => void;
  actions?: (status: SupportStatus, reload: () => void) => React.ReactNode;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    createClient()
      .rpc('support_thread', { p_request: requestId })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setThread(data as Thread);
      });
  }, [requestId]);

  useEffect(() => {
    setThread(null);
    load();
  }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const { error } = await createClient().rpc('reply_support_request', {
        p_request: requestId,
        p_body: body.trim(),
        p_link: link.trim() || null,
      });
      if (error) throw error;
      setBody('');
      setLink('');
      load();
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send your message'));
    } finally {
      setSending(false);
    }
  };

  if (!thread) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { request, messages } = thread;
  const closed = request.status === 'closed';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{request.subject}</h2>
          <p className="text-sm text-muted-foreground">
            {SUPPORT_CATEGORIES[request.category]}
            {staff && request.requester_name
              ? ` · from ${request.requester_name}`
              : ''}
            {staff && request.school_name ? ` (${request.school_name})` : ''} ·{' '}
            {when(request.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SupportStatusBadge status={request.status} />
          {actions?.(request.status, () => {
            load();
            onChanged?.();
          })}
        </div>
      </div>

      <ol className="space-y-3">
        {messages.map(m => (
          <li
            key={m.id}
            className={`rounded-lg border p-3 text-sm ${
              m.from_staff ? 'border-blue-200 bg-blue-50' : 'bg-white'
            }`}
          >
            <p className="mb-1 text-xs text-muted-foreground">
              <span className="font-medium text-gray-700">
                {m.author ?? 'Unknown'}
              </span>{' '}
              · {when(m.created_at)}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
            {m.link_url && (
              <a
                href={m.link_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 inline-flex items-center gap-1 text-blue-700 underline-offset-4 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {m.link_url}
              </a>
            )}
          </li>
        ))}
      </ol>

      {closed ? (
        <p className="text-sm text-muted-foreground">
          This request is closed.
          {staff ? '' : ' Start a new one if you still need help.'}
        </p>
      ) : (
        <form onSubmit={send} className="space-y-2">
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={
              staff ? 'Reply as the programme team…' : 'Add a message…'
            }
            rows={3}
            maxLength={4000}
          />
          <div className="flex flex-wrap gap-2">
            <Input
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="Link to a screenshot or file (optional)"
              type="url"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={sending || !body.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
