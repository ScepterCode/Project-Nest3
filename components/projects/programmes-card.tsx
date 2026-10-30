'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { MemberPicker } from '@/components/institution/member-picker';
import { createClient } from '@/lib/supabase/client';
import { errorMessage, toast } from '@/lib/toast';

// Programmes (supabase/migrations/20261031120000_school_programmes.sql):
// school admins start them for their school; platform admins also start
// cross-school mentorship and fellowship programmes.

export interface ProgrammeGroup {
  id: string;
  name: string;
  scope: 'school' | 'mentorship' | 'fellowship';
  school_name: string | null;
  code: string;
  mentor_name: string | null;
  students: number;
  projects: number;
}

export const SCOPE_LABELS: Record<ProgrammeGroup['scope'], string> = {
  school: 'School programme',
  mentorship: 'Mentorship (all schools)',
  fellowship: 'Art Fellowship (all schools)',
};

type Scope = ProgrammeGroup['scope'];

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Could not copy the code');
        }
      }}
      className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs tracking-widest hover:bg-gray-200"
      title="Copy join code"
    >
      {code}
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

/** Teachers from every school, for platform admins choosing a mentor. */
function AnyTeacherPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [teachers, setTeachers] = useState<
    | {
        teacher_id: string;
        teacher_name: string | null;
        teacher_email: string;
        school_name: string | null;
      }[]
    | null
  >(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    createClient()
      .rpc('platform_tutor_metrics')
      .then(({ data }) => setTeachers((data as typeof teachers) ?? []));
  }, []);

  if (!teachers)
    return <p className="text-sm text-muted-foreground">Loading teachers…</p>;
  const term = filter.trim().toLowerCase();
  const shown = teachers
    .filter(
      t =>
        !term ||
        t.teacher_id === value ||
        `${t.teacher_name ?? ''} ${t.teacher_email} ${t.school_name ?? ''}`
          .toLowerCase()
          .includes(term)
    )
    .sort((a, b) =>
      (a.teacher_name ?? a.teacher_email).localeCompare(
        b.teacher_name ?? b.teacher_email
      )
    );

  return (
    <div className="space-y-2">
      {teachers.length > 15 && (
        <Input
          placeholder={`Filter ${teachers.length} teachers by name, email or school`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          aria-label="Filter teachers"
        />
      )}
      <select
        id="programme-mentor"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full rounded border bg-white p-2 text-sm"
      >
        <option value="">-- Choose a teacher ({shown.length}) --</option>
        {shown.map(t => (
          <option key={t.teacher_id} value={t.teacher_id}>
            {t.teacher_name ?? t.teacher_email}
            {t.school_name ? ` · ${t.school_name}` : ' · no school'}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ProgrammesCard({
  groups,
  canStart,
  platformAdmin,
  onCreated,
}: {
  groups: ProgrammeGroup[];
  /** School admins and platform admins can start programmes. */
  canStart: boolean;
  platformAdmin: boolean;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('school');
  const [mentor, setMentor] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mentor) {
      toast.error('Choose the teacher who will run it');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await createClient().rpc(
        'create_programme_group',
        {
          p_name: name.trim(),
          p_mentor: mentor,
          p_scope: scope,
          p_description: description.trim() || null,
        }
      );
      if (error) throw error;
      toast.success(
        `Programme started. Its join code is ${(data as { code: string }).code}; the mentor has been told.`
      );
      setName('');
      setMentor(null);
      setDescription('');
      onCreated();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the programme'));
    } finally {
      setSaving(false);
    }
  };

  if (!canStart && groups.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Programmes</CardTitle>
        <CardDescription>
          {platformAdmin
            ? 'School programmes take one school’s learners; mentorship and fellowship programmes take learners from every school who have reached that stage.'
            : 'A programme is a group for production work, run by one of your teachers as its mentor. Learners join with its code; only your school’s learners can join.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.length > 0 && (
          <ul className="divide-y rounded border">
            {groups.map(g => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.school_name && g.scope === 'school'
                      ? `${g.school_name} · `
                      : ''}
                    mentor {g.mentor_name ?? '—'} · {Number(g.students)}{' '}
                    learners · {Number(g.projects)} projects
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={g.scope === 'school' ? 'secondary' : 'default'}
                  >
                    {SCOPE_LABELS[g.scope]}
                  </Badge>
                  <CopyCode code={g.code} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {canStart && (
          <form
            onSubmit={start}
            className="grid gap-3 rounded border p-3 md:grid-cols-2"
          >
            <p className="font-medium md:col-span-2">Start a programme</p>
            <div className="space-y-1">
              <Label htmlFor="programme-name">Name</Label>
              <Input
                id="programme-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Animation club 2027"
                required
                minLength={3}
                maxLength={120}
              />
            </div>
            {platformAdmin ? (
              <div className="space-y-1">
                <Label htmlFor="programme-scope">Who can take part</Label>
                <select
                  id="programme-scope"
                  value={scope}
                  onChange={e => setScope(e.target.value as Scope)}
                  className="w-full rounded border bg-white p-2 text-sm"
                >
                  <option value="school">One school (the mentor’s)</option>
                  <option value="mentorship">
                    Mentorship learners from every school
                  </option>
                  <option value="fellowship">
                    Fellowship learners from every school
                  </option>
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Who can take part</Label>
                <p className="rounded border bg-gray-50 p-2 text-sm text-muted-foreground">
                  Your school’s learners
                </p>
              </div>
            )}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="programme-mentor">
                Mentor (the teacher who runs it)
              </Label>
              {platformAdmin ? (
                <AnyTeacherPicker value={mentor} onChange={setMentor} />
              ) : (
                <MemberPicker
                  id="programme-mentor"
                  role="teacher"
                  value={mentor}
                  onChange={setMentor}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {scope === 'school'
                  ? 'They become a school mentor if they aren’t one already.'
                  : 'They become a programme mentor if they aren’t one already.'}
              </p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="programme-description">About it (optional)</Label>
              <Textarea
                id="programme-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Starting…' : 'Start programme'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
