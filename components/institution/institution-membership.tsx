'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Check, Copy, RefreshCw } from 'lucide-react';
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
import { confirmAction, errorMessage, toast } from '@/lib/toast';

export interface MyInstitution {
  id: string;
  name: string;
  /** Student join code; only returned to the institution's admins. */
  join_code: string | null;
  /** Teacher sign-up code; only returned to the institution's admins. */
  staff_code?: string | null;
  // School details from admin onboarding; only returned to its admins.
  institution_type?: string | null;
  size_band?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  department_count?: number;
}

async function fetchMyInstitution(): Promise<MyInstitution | null> {
  const { data, error } = await createClient().rpc('get_my_institution');
  if (error) throw error;
  return (data as MyInstitution | null) ?? null;
}

/**
 * Institution admin dashboard frame: until the admin has an institution it
 * shows the setup form instead of `children`. Afterwards, `children` as a
 * function gets the institution to lay out itself; plain children are shown
 * under the school's name and codes.
 */
export function InstitutionAdminPanel({
  children,
}: {
  children:
    | React.ReactNode
    | ((
        institution: MyInstitution,
        update: (institution: MyInstitution) => void
      ) => React.ReactNode);
}) {
  const [institution, setInstitution] = useState<MyInstitution | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setInstitution(await fetchMyInstitution());
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load your institution'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="max-w-lg">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-red-600">{loadError}</p>
          <Button variant="outline" onClick={load}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!institution) {
    return <CreateInstitutionForm onCreated={() => load()} />;
  }

  if (typeof children === 'function') {
    return <>{children(institution, setInstitution)}</>;
  }
  return (
    <>
      <JoinCodeCard institution={institution} onChange={setInstitution} />
      {children}
    </>
  );
}

/** The student and teacher codes, compact, for the dashboard's side column. */
export function SchoolCodesCard({
  institution,
  onChange,
}: {
  institution: MyInstitution;
  onChange: (institution: MyInstitution) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Join codes</CardTitle>
        <CardDescription>
          Share each code only with the people it&apos;s for.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CodeRow
          label="Teacher code"
          help="New teachers enter this when they sign up. Keep it to staff."
          code={institution.staff_code ?? null}
          kind="staff"
          compact
          onReplaced={code => onChange({ ...institution, staff_code: code })}
        />
        <CodeRow
          label="Student code"
          help="Optional. Students join automatically when a teacher accepts them into a class; existing accounts can also enter this on their profile."
          code={institution.join_code}
          kind="student"
          compact
          onReplaced={code => onChange({ ...institution, join_code: code })}
        />
      </CardContent>
    </Card>
  );
}

function CreateInstitutionForm({
  onCreated,
}: {
  onCreated: (institution: MyInstitution) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await createClient().rpc(
        'create_my_institution',
        { p_name: name }
      );
      if (error) throw error;
      toast.success('Institution created');
      onCreated(data as MyInstitution);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create the institution'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Set up your institution
        </CardTitle>
        <CardDescription>
          Teachers and students join it with a code you&apos;ll get next.
          Students also join automatically when they enter a class taught by one
          of your teachers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="institution-name">Institution name</Label>
            <Input
              id="institution-name"
              value={name}
              onChange={e => setName(e.target.value)}
              minLength={2}
              maxLength={200}
              required
            />
          </div>
          <Button type="submit" disabled={saving || name.trim().length < 2}>
            {saving ? 'Creating...' : 'Create institution'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function JoinCodeCard({
  institution,
  onChange,
}: {
  institution: MyInstitution;
  onChange: (institution: MyInstitution) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {institution.name}
        </CardTitle>
        <SchoolDetails institution={institution} />
        <CardDescription>
          Share each code only with the people it&apos;s for. Students who join
          a class taught by one of your teachers are added automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <CodeRow
          label="Student code"
          help="Students (and existing teachers) enter this on their profile page to join your school."
          code={institution.join_code}
          kind="student"
          onReplaced={code => onChange({ ...institution, join_code: code })}
        />
        <CodeRow
          label="Teacher code"
          help="New teachers enter this when they sign up. It makes them a teacher at your school, so keep it to staff."
          code={institution.staff_code ?? null}
          kind="staff"
          onReplaced={code => onChange({ ...institution, staff_code: code })}
        />
      </CardContent>
    </Card>
  );
}

function SchoolDetails({ institution }: { institution: MyInstitution }) {
  const about = [institution.institution_type, institution.size_band]
    .filter(Boolean)
    .join(' · ');
  const contact = [
    [institution.contact_name, institution.contact_title]
      .filter(Boolean)
      .join(', '),
    institution.contact_email,
    institution.contact_phone,
  ]
    .filter(Boolean)
    .join(' · ');
  const departments = institution.department_count ?? 0;
  if (!about && !contact && departments === 0) return null;
  return (
    <div className="space-y-1 text-sm text-gray-700">
      {about && <p>{about}</p>}
      {contact && <p>Main contact: {contact}</p>}
      <p>
        {departments === 1 ? '1 department' : `${departments} departments`}
        {' · '}
        <Link
          href="/dashboard/institution/departments"
          className="underline underline-offset-4"
        >
          Manage departments
        </Link>
      </p>
    </div>
  );
}

function CodeRow({
  label,
  help,
  code,
  kind,
  onReplaced,
  compact = false,
}: {
  label: string;
  help: string;
  code: string | null;
  kind: 'student' | 'staff';
  onReplaced: (code: string) => void;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the code');
    }
  };

  const regenerate = async () => {
    const ok = await confirmAction({
      title: `Replace the ${label.toLowerCase()}?`,
      description:
        'The current code stops working. People who already joined keep their access.',
      confirmLabel: 'Replace code',
      destructive: true,
    });
    if (!ok) return;
    setRegenerating(true);
    try {
      const { data, error } = await createClient().rpc(
        'regenerate_institution_join_code',
        { p_kind: kind }
      );
      if (error) throw error;
      onReplaced(data as string);
      toast.success(`New ${label.toLowerCase()} created`);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not replace the code'));
    } finally {
      setRegenerating(false);
    }
  };

  if (compact) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="flex items-center gap-1">
          <code className="mr-auto rounded bg-gray-100 px-2 py-1 font-mono text-base tracking-widest">
            {code ?? '········'}
          </code>
          <Button
            variant="ghost"
            size="icon"
            onClick={copy}
            disabled={!code}
            title={`Copy ${label.toLowerCase()}`}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span className="sr-only">Copy</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={regenerate}
            disabled={regenerating}
            title={`Replace ${label.toLowerCase()}`}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">New code</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-md bg-gray-100 px-3 py-2 font-mono text-lg tracking-widest">
          {code ?? '········'}
        </code>
        <Button variant="outline" size="sm" onClick={copy} disabled={!code}>
          {copied ? (
            <Check className="h-4 w-4 mr-2" />
          ) : (
            <Copy className="h-4 w-4 mr-2" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={regenerate}
          disabled={regenerating}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          New code
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

/** Profile card for teachers and students: shows or joins an institution. */
export function JoinInstitutionCard({
  onJoined,
}: {
  onJoined?: (institution: MyInstitution) => void;
}) {
  const [institution, setInstitution] = useState<MyInstitution | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchMyInstitution()
      .then(setInstitution)
      .catch(error =>
        toast.error(errorMessage(error, 'Could not load your institution'))
      )
      .finally(() => setLoading(false));
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    try {
      const { data, error } = await createClient().rpc(
        'join_institution_by_code',
        { p_code: code }
      );
      if (error) throw error;
      const joined = { ...(data as MyInstitution), join_code: null };
      setInstitution(joined);
      onJoined?.(joined);
      toast.success(`You joined ${joined.name}`);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not join the institution'));
    } finally {
      setJoining(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Building2 className="h-5 w-5 mr-2" />
          Institution
        </CardTitle>
        <CardDescription>
          {institution
            ? 'Your school or organisation on ProjectNest.'
            : 'Enter the join code from your institution’s administrator.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {institution ? (
          <p className="font-medium">{institution.name}</p>
        ) : (
          <form onSubmit={handleJoin} className="flex max-w-md gap-2">
            <Input
              aria-label="Institution join code"
              placeholder="e.g. ABCD2345"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="font-mono uppercase"
              required
            />
            <Button type="submit" disabled={joining || !code.trim()}>
              {joining ? 'Joining...' : 'Join'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
