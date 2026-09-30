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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ASSIGNABLE_ROLES,
  AssignableRole,
  BULK_ROLE_MAX_USERS,
  ROLE_LABELS,
} from '@/lib/bulk/roles';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const PAGE_SIZE = 50;

interface Member {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
}

interface HistoryItem {
  id: string;
  assignment_name: string;
  successful_assignments: number;
  skipped_assignments: number;
  failed_assignments: number;
  status: string;
  created_at: string;
}

export default function BulkRoleAssignmentPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetRole, setTargetRole] = useState<AssignableRole>('teacher');
  const [justification, setJustification] = useState('');
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // RLS limits this to members of the admin's own institution.
  const loadMembers = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('users')
      .select('id, email, first_name, last_name, role', { count: 'exact' })
      .not('institution_id', 'is', null)
      .order('last_name', { ascending: true, nullsFirst: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (roleFilter !== 'all') query = query.eq('role', roleFilter);
    const term = search.trim().replace(/[%,()]/g, '');
    if (term) {
      query = query.or(
        `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`
      );
    }
    const { data, count, error } = await query;
    if (error) {
      setMessage({
        kind: 'error',
        text: `Could not load users: ${error.message}`,
      });
    }
    setMembers((data as Member[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, roleFilter, search]);

  const loadHistory = useCallback(async () => {
    const response = await fetch('/api/bulk-role-assignment');
    const data = await response.json().catch(() => ({}));
    if (response.ok) setHistory(data.assignments ?? []);
    else if (data.error) setMessage({ kind: 'error', text: data.error });
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadMembers, 250); // debounce typing
    return () => clearTimeout(timer);
  }, [loadMembers]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const selectable = members.filter(m => m.id !== user?.id);
  const allOnPageSelected =
    selectable.length > 0 && selectable.every(m => selected.has(m.id));

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected(prev => {
      const next = new Set(prev);
      for (const m of selectable) {
        if (allOnPageSelected) next.delete(m.id);
        else next.add(m.id);
      }
      return next;
    });

  const apply = async () => {
    if (
      targetRole === 'institution_admin' &&
      !confirm(
        `Make ${selected.size} user(s) institution admins? They will be able to manage all users in your institution.`
      )
    ) {
      return;
    }
    setApplying(true);
    setMessage(null);
    try {
      const response = await fetch('/api/bulk-role-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(selected),
          targetRole,
          justification,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.error || `Request failed (HTTP ${response.status})`
        );
      setMessage({
        kind: data.failed.length ? 'error' : 'success',
        text:
          `${data.changed} changed to ${ROLE_LABELS[targetRole]}, ${data.skipped} already had that role` +
          (data.failed.length
            ? `, ${data.failed.length} failed: ${data.failed[0].message}`
            : '.'),
      });
      setSelected(new Set());
      setJustification('');
      await Promise.all([loadMembers(), loadHistory()]);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Role change failed',
      });
    } finally {
      setApplying(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Role Assignment</h1>
        <p className="text-muted-foreground">
          Change the role of several people in your institution at once.
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
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {total} {total === 1 ? 'person' : 'people'} · {selected.size}{' '}
            selected (max {BULK_ROLE_MAX_USERS})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search name or email"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <Select
              value={roleFilter}
              onValueChange={value => {
                setRoleFilter(value);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {['student', 'teacher', 'institution_admin'].map(r => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No members found. Only people linked to your institution appear
              here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="w-8 py-1">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={togglePage}
                        aria-label="Select page"
                      />
                    </th>
                    <th className="py-1 pr-4">Name</th>
                    <th className="py-1 pr-4">Email</th>
                    <th className="py-1">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id} className="border-t">
                      <td className="py-1">
                        <Checkbox
                          checked={selected.has(m.id)}
                          disabled={m.id === user?.id}
                          onCheckedChange={() => toggle(m.id)}
                          aria-label={`Select ${m.email}`}
                        />
                      </td>
                      <td className="py-1 pr-4">
                        {[m.first_name, m.last_name]
                          .filter(Boolean)
                          .join(' ') || '—'}
                        {m.id === user?.id && (
                          <span className="ml-1 text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-4">{m.email}</td>
                      <td className="py-1">
                        <Badge variant="outline">
                          {ROLE_LABELS[m.role] ?? m.role}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change role</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>New role</Label>
              <Select
                value={targetRole}
                onValueChange={v => setTargetRole(v as AssignableRole)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map(r => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-64 flex-1 space-y-1">
              <Label htmlFor="justification">
                Reason (optional, kept in the history)
              </Label>
              <Input
                id="justification"
                value={justification}
                onChange={e => setJustification(e.target.value)}
              />
            </div>
            <Button
              onClick={apply}
              disabled={
                applying ||
                selected.size === 0 ||
                selected.size > BULK_ROLE_MAX_USERS
              }
            >
              {applying
                ? 'Applying…'
                : `Apply to ${selected.size} user${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent changes</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bulk role changes yet.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {history.map(h => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="font-medium">{h.assignment_name}</span>
                  <span className="text-muted-foreground">
                    {new Date(h.created_at).toLocaleString()} ·{' '}
                    {h.successful_assignments} changed · {h.skipped_assignments}{' '}
                    skipped · {h.failed_assignments} failed
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
