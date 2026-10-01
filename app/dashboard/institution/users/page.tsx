'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { RoleGate } from '@/components/ui/permission-gate';
import { ROLE_LABELS } from '@/lib/bulk/roles';

const PAGE_SIZE = 50;

interface Member {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
}

export default function UserManagementPage() {
  const { user, loading: authLoading } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loadingList, setLoadingList] = useState(true);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'teacher' | 'student'>('student');
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // One page at a time, filtered and counted by the database. RLS limits the
  // rows to members of the admin's own institution.
  const loadMembers = useCallback(async () => {
    setLoadingList(true);
    let query = createClient()
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
    if (error)
      setMessage({
        kind: 'error',
        text: `Could not load users: ${error.message}`,
      });
    setMembers((data as Member[]) ?? []);
    setTotal(count ?? 0);
    setLoadingList(false);
  }, [page, roleFilter, search]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setTimeout(loadMembers, 250); // debounce typing
    return () => clearTimeout(timer);
  }, [user, loadMembers]);

  // Accounts are created on the server (see /api/bulk-import): no password
  // is set and no email is sent; the person uses "Forgot password" to sign in.
  const handleInvite = async () => {
    setInviting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'Added from the Users page',
          totalRows: 1,
          final: true,
          rows: [
            {
              line: 1,
              email,
              first_name: firstName,
              last_name: lastName,
              role,
            },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.error || `Request failed (HTTP ${response.status})`
        );
      const problem = data.failed?.[0] ?? data.skipped?.[0];
      if (problem) throw new Error(problem.message);
      setMessage({
        kind: 'success',
        text: `Account created for ${email}. Ask them to open the sign-in page and choose "Forgot password" to set a password.`,
      });
      setEmail('');
      setFirstName('');
      setLastName('');
      setRole('student');
      loadMembers();
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not create the account',
      });
    } finally {
      setInviting(false);
    }
  };

  if (authLoading) return <div>Loading...</div>;
  if (!user) return <div>Access Denied</div>;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
      <div className="flex flex-col gap-4 p-4 md:gap-8 md:p-6">
        <h1 className="text-lg font-semibold md:text-2xl">User Management</h1>

        {message && (
          <Alert variant={message.kind === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Add a User</CardTitle>
            <CardDescription>
              Create a teacher or student account in your institution. For many
              people at once, use Bulk Import.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john.doe@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={role}
                onValueChange={(value: 'teacher' | 'student') => setRole(value)}
              >
                <SelectTrigger id="role" className="w-[180px]">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleInvite}
              disabled={
                inviting ||
                !email.trim() ||
                !firstName.trim() ||
                !lastName.trim()
              }
            >
              {inviting ? 'Creating…' : 'Create Account'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              {total} {total === 1 ? 'person' : 'people'} in your institution.
              Change roles in Bulk Roles.
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

            {loadingList ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(member => (
                    <TableRow key={member.id}>
                      <TableCell>
                        {[member.first_name, member.last_name]
                          .filter(Boolean)
                          .join(' ') || '—'}
                      </TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        {ROLE_LABELS[member.role] ?? member.role}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
      </div>
    </RoleGate>
  );
}
