'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import { selectInChunks } from '@/lib/supabase/chunked-in';
import { ROLE_LABELS } from '@/lib/bulk/roles';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import { confirmAction } from '@/lib/toast';
interface RoleRequest {
  id: string;
  user_id: string;
  requested_role: string;
  existing_role: string | null;
  justification: string | null;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
}

interface Person {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

const roleLabel = (role: string | null) =>
  role ? (ROLE_LABELS[role] ?? role) : '—';

export default function RoleRequestsPage() {
  const [pending, setPending] = useState<RoleRequest[]>([]);
  const [recent, setRecent] = useState<RoleRequest[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // RLS limits both queries to requests from the admin's own institution.
  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const columns =
      'id, user_id, requested_role, existing_role, justification, status, requested_at, reviewed_at, review_notes';
    const [open, done] = await Promise.all([
      supabase
        .from('role_requests')
        .select(columns)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('requested_at', { ascending: true })
        .limit(200),
      supabase
        .from('role_requests')
        .select(columns)
        .neq('status', 'pending')
        .order('reviewed_at', { ascending: false, nullsFirst: false })
        .limit(20),
    ]);
    if (open.error || done.error) {
      setMessage({
        kind: 'error',
        text: `Could not load requests: ${(open.error || done.error)!.message}`,
      });
    }
    const all = [...(open.data ?? []), ...(done.data ?? [])] as RoleRequest[];
    const ids = Array.from(new Set(all.map(r => r.user_id)));
    if (ids.length) {
      const data = await selectInChunks(ids, chunk =>
        supabase
          .from('users')
          .select('id, email, first_name, last_name')
          .in('id', chunk)
      ).catch(() => [] as Person[]);
      setPeople(Object.fromEntries((data ?? []).map(p => [p.id, p as Person])));
    }
    setPending((open.data as RoleRequest[]) ?? []);
    setRecent((done.data as RoleRequest[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (request: RoleRequest, approve: boolean) => {
    const name = displayName(people[request.user_id]);
    if (
      approve &&
      request.requested_role === 'institution_admin' &&
      !(await confirmAction({
        title: `Make ${name} an institution admin?`,
        description:
          'They will be able to manage everyone in your institution.',
        confirmLabel: 'Make admin',
        destructive: true,
      }))
    ) {
      return;
    }
    setBusyId(request.id);
    setMessage(null);
    const { error } = await createClient().rpc('review_role_request', {
      p_request_id: request.id,
      p_approve: approve,
      p_notes: notes[request.id]?.trim() || null,
    });
    setBusyId(null);
    if (error) {
      setMessage({ kind: 'error', text: error.message });
    } else {
      setMessage({
        kind: 'success',
        text: approve
          ? `${name} is now ${roleLabel(request.requested_role).toLowerCase()}.`
          : `Request from ${name} denied.`,
      });
    }
    await load();
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold">Role Requests</h1>
        <p className="text-muted-foreground">
          People in your institution who asked for a different role.
        </p>
      </div>

      {message && (
        <Alert variant={message.kind === 'error' ? 'destructive' : 'default'}>
          {message.kind === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pending ({pending.length})</CardTitle>
          <CardDescription>
            Oldest first. Requests expire after 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending requests.
            </p>
          ) : (
            pending.map(request => {
              const person = people[request.user_id];
              return (
                <div
                  key={request.id}
                  className="space-y-3 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{displayName(person)}</div>
                      {person?.email && (
                        <div className="text-sm text-muted-foreground">
                          {person.email}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">
                        {roleLabel(request.existing_role)}
                      </Badge>
                      <span aria-hidden>→</span>
                      <Badge>{roleLabel(request.requested_role)}</Badge>
                    </div>
                  </div>
                  {request.justification && (
                    <p className="whitespace-pre-wrap rounded bg-muted p-3 text-sm">
                      {request.justification}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Requested {new Date(request.requested_at).toLocaleString()}
                  </p>
                  <Textarea
                    placeholder="Note to the requester (optional)"
                    value={notes[request.id] ?? ''}
                    onChange={e =>
                      setNotes(prev => ({
                        ...prev,
                        [request.id]: e.target.value,
                      }))
                    }
                    rows={2}
                    maxLength={2000}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => review(request, true)}
                      disabled={busyId === request.id}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => review(request, false)}
                      disabled={busyId === request.id}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent decisions</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map(request => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span>
                    <span className="font-medium">
                      {displayName(people[request.user_id])}
                    </span>
                    {' → '}
                    {roleLabel(request.requested_role)}
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {request.reviewed_at &&
                      new Date(request.reviewed_at).toLocaleDateString()}
                    <Badge
                      variant={
                        request.status === 'approved' ? 'default' : 'secondary'
                      }
                    >
                      {request.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function displayName(person?: Person) {
  if (!person) return 'Unknown user';
  return (
    [person.first_name, person.last_name].filter(Boolean).join(' ') ||
    person.email
  );
}
