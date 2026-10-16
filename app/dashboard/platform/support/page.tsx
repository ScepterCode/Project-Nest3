'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SUPPORT_CATEGORIES,
  SupportCategory,
  SupportStatus,
  SupportStatusBadge,
  SupportThread,
} from '@/components/support/support-thread';
import { ROLE_LABELS, platformRpc, sinceText } from '@/lib/platform/client';
import { errorMessage, toast } from '@/lib/toast';

interface InboxRow {
  id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  requester_id: string;
  requester_name: string | null;
  requester_email: string;
  requester_role: string;
  school_name: string | null;
  messages: number;
  last_message: string | null;
  last_from_staff: boolean;
  last_activity_at: string;
}

function SupportInbox() {
  const router = useRouter();
  const selected = useSearchParams().get('request');
  const [status, setStatus] = useState('active');
  const [rows, setRows] = useState<InboxRow[] | null>(null);

  const load = useCallback(() => {
    platformRpc<InboxRow[]>('platform_support_requests', { p_status: status })
      .then(data => setRows(data ?? []))
      .catch(e => toast.error(errorMessage(e, 'Could not load requests')));
  }, [status]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const setRequestStatus = async (next: SupportStatus, reload: () => void) => {
    if (!selected) return;
    try {
      await platformRpc('platform_set_support_status', {
        p_request: selected,
        p_status: next,
      });
      toast.success(
        next === 'resolved'
          ? 'Marked resolved. They can reply to reopen it.'
          : 'Updated'
      );
      reload();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the request'));
    }
  };

  const selectedRow = rows?.find(r => r.id === selected);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Support requests</CardTitle>
            <CardDescription>
              From learners, tutors and schools. Safeguarding concerns come
              first.
            </CardDescription>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Needs attention</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <ul className="divide-y">
              {rows.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() =>
                      router.replace(
                        `/dashboard/platform/support?request=${r.id}`
                      )
                    }
                    className={`w-full space-y-1 py-3 text-left text-sm ${
                      r.id === selected ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{r.subject}</span>
                      <SupportStatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {r.category === 'safeguarding' ? (
                        <Badge variant="destructive">Safeguarding</Badge>
                      ) : (
                        <span>{SUPPORT_CATEGORIES[r.category]} ·</span>
                      )}
                      <span>
                        {r.requester_name ?? r.requester_email} (
                        {ROLE_LABELS[r.requester_role] ?? r.requester_role}
                        {r.school_name ? `, ${r.school_name}` : ''}) ·{' '}
                        {sinceText(r.last_activity_at)}
                      </span>
                    </div>
                    {r.last_message && (
                      <p className="line-clamp-2 text-xs text-gray-600">
                        {r.last_from_staff ? 'You: ' : ''}
                        {r.last_message}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          {selected ? (
            <>
              {selectedRow && (
                <p className="text-xs text-muted-foreground">
                  {selectedRow.requester_email}
                  {selectedRow.requester_role === 'student' && (
                    <>
                      {' · '}
                      <Link
                        href={`/dashboard/portfolio/${selectedRow.requester_id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        Portfolio
                      </Link>
                    </>
                  )}
                </p>
              )}
              <SupportThread
                requestId={selected}
                staff
                onChanged={load}
                actions={(current, reload) => (
                  <>
                    {current !== 'resolved' && current !== 'closed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRequestStatus('resolved', reload)}
                      >
                        Mark resolved
                      </Button>
                    )}
                    {current !== 'closed' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRequestStatus('closed', reload)}
                      >
                        Close
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRequestStatus('open', reload)}
                      >
                        Reopen
                      </Button>
                    )}
                  </>
                )}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a request to read and reply.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupportInbox />
    </Suspense>
  );
}
