'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PlatformPerson,
  ROLE_LABELS,
  platformRpc,
  sinceText,
} from '@/lib/platform/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

const NO_SCHOOL = 'none';

export default function PlatformPeoplePage() {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<PlatformPerson[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    platformRpc<{ id: string; name: string }[]>('platform_schools')
      .then(rows =>
        setSchools((rows ?? []).map(r => ({ id: r.id, name: r.name })))
      )
      .catch(() => setSchools([]));
  }, []);

  const search = async (term = query) => {
    if (term.trim().length < 2) return;
    setSearching(true);
    try {
      setPeople(
        await platformRpc<PlatformPerson[]>('platform_search_people', {
          p_query: term.trim(),
          p_limit: 50,
        })
      );
    } catch (e) {
      toast.error(errorMessage(e, 'Search failed'));
    } finally {
      setSearching(false);
    }
  };

  // Debounced search as you type.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const replace = (person: PlatformPerson) =>
    setPeople(
      current => current?.map(p => (p.id === person.id ? person : p)) ?? null
    );

  return (
    <div className="space-y-4">
      <form
        onSubmit={e => {
          e.preventDefault();
          search();
        }}
        className="flex max-w-lg gap-2"
      >
        <Input
          placeholder="Search by name or email (2+ characters)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search people"
        />
        <Button type="submit" disabled={searching || query.trim().length < 2}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {people && people.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nobody matches.
          </CardContent>
        </Card>
      )}

      {people && people.length > 0 && (
        <div className="divide-y rounded-md border">
          {people.map(person => (
            <div key={person.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {person.name ?? person.email}
                    {person.disabled && (
                      <Badge variant="destructive" className="ml-2">
                        Disabled
                      </Badge>
                    )}
                    {!person.email_confirmed && (
                      <Badge variant="outline" className="ml-2">
                        Email not confirmed
                      </Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {person.email} · {ROLE_LABELS[person.role] ?? person.role} ·{' '}
                    {person.school_name ?? 'no school'} · last signed in{' '}
                    {sinceText(person.last_sign_in_at)}
                  </p>
                </div>
                {person.role !== 'system_admin' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setOpen(open === person.id ? null : person.id)
                    }
                    aria-expanded={open === person.id}
                  >
                    {open === person.id ? 'Close' : 'Manage'}
                  </Button>
                )}
              </div>
              {open === person.id && (
                <ManagePerson
                  person={person}
                  schools={schools}
                  onChanged={replace}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagePerson({
  person,
  schools,
  onChanged,
}: {
  person: PlatformPerson;
  schools: { id: string; name: string }[];
  onChanged: (person: PlatformPerson) => void;
}) {
  const [role, setRole] = useState(person.role);
  const [school, setSchool] = useState(person.school_id ?? NO_SCHOOL);
  const [busy, setBusy] = useState(false);
  const who = person.name ?? person.email;

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      toast.success(label);
    } catch (e) {
      toast.error(errorMessage(e, 'That didn’t work'));
    } finally {
      setBusy(false);
    }
  };

  const saveRole = async () => {
    const ok = await confirmAction({
      title: `Make ${who} a ${ROLE_LABELS[role]?.toLowerCase() ?? role}?`,
      confirmLabel: 'Change role',
    });
    if (!ok) return;
    await run('Role changed', async () => {
      await platformRpc('platform_set_role', {
        p_user: person.id,
        p_role: role,
      });
      onChanged({ ...person, role });
    });
  };

  const saveSchool = async () => {
    const target = school === NO_SCHOOL ? null : school;
    const name = schools.find(s => s.id === target)?.name ?? 'no school';
    const ok = await confirmAction({
      title: `Move ${who} to ${name}?`,
      description:
        'Their department is cleared, since departments belong to a school.',
      confirmLabel: 'Move',
    });
    if (!ok) return;
    await run('Moved', async () => {
      await platformRpc('platform_move_user', {
        p_user: person.id,
        p_school: target,
      });
      onChanged({
        ...person,
        school_id: target,
        school_name: target ? name : null,
      });
    });
  };

  const account = async (action: 'disable' | 'enable' | 'reset_password') => {
    const prompts = {
      disable: {
        title: `Disable ${who}'s account?`,
        description:
          'They can’t sign in until you enable it again. Their work is kept.',
        confirmLabel: 'Disable',
        destructive: true,
      },
      enable: { title: `Enable ${who}'s account?`, confirmLabel: 'Enable' },
      reset_password: {
        title: `Email ${who} a password-reset link?`,
        description: `It goes to ${person.email}.`,
        confirmLabel: 'Send',
      },
    } as const;
    const ok = await confirmAction(prompts[action]);
    if (!ok) return;
    await run(
      action === 'reset_password'
        ? 'Reset link sent'
        : action === 'disable'
          ? 'Account disabled'
          : 'Account enabled',
      async () => {
        const response = await fetch(`/api/platform/users/${person.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(data.error || `Request failed (${response.status})`);
        if (action !== 'reset_password')
          onChanged({ ...person, disabled: action === 'disable' });
      }
    );
  };

  return (
    <div className="mt-3 grid gap-4 rounded-md bg-gray-50 p-3 md:grid-cols-3">
      <div className="space-y-2">
        <Label>Role</Label>
        <div className="flex gap-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="teacher">Teacher</SelectItem>
              <SelectItem value="institution_admin">School admin</SelectItem>
              <SelectItem value="programme_viewer">Programme viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={saveRole}
            disabled={busy || role === person.role}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>School</Label>
        <div className="flex gap-2">
          <Select value={school} onValueChange={setSchool}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SCHOOL}>No school</SelectItem>
              {schools.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={saveSchool}
            disabled={busy || school === (person.school_id ?? NO_SCHOOL)}
          >
            Move
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Account</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => account('reset_password')}
            disabled={busy}
          >
            Send password reset
          </Button>
          {person.disabled ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => account('enable')}
              disabled={busy}
            >
              Enable
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600"
              onClick={() => account('disable')}
              disabled={busy}
            >
              Disable
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
