'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Layers } from 'lucide-react';
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
import {
  AnyTeacherPicker,
  ProgrammeStage,
  ProgrammeStatus,
  SchoolsPicker,
  StatusBadge,
  whoTakesPart,
} from '@/components/programmes/pickers';
import { createClient } from '@/lib/supabase/client';
import { errorMessage, toast } from '@/lib/toast';

interface Totals {
  classes: number;
  tutors: number;
  learners: number;
  projects: number;
  milestones: number;
  milestones_approved: number;
  milestones_waiting: number;
  attendance_rate: number | null;
}

interface ProgrammeRow {
  id: string;
  name: string;
  scope: 'school' | 'programme';
  stage: ProgrammeStage;
  status: ProgrammeStatus;
  school_name: string | null;
  schools: string | null;
  can_manage: boolean;
  totals: Totals;
}

// Programmes are containers of classes, each run by its own tutor
// (supabase/migrations/20261102120000_programme_containers.sql).
export default function ProgrammesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProgrammeRow[] | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const load = useCallback(() => {
    const supabase = createClient();
    supabase.rpc('programmes_overview').then(({ data, error }) => {
      if (error) toast.error(error.message);
      setRows((data as ProgrammeRow[]) ?? []);
    });
    supabase.rpc('my_project_access').then(({ data }) => {
      const a = data as { platform_admin: boolean; role: string } | null;
      setPlatformAdmin(!!a?.platform_admin);
      setRole(a?.role ?? null);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canStart = platformAdmin || role === 'institution_admin';
  const managed = rows?.filter(r => r.can_manage) ?? [];
  const takingPart = rows?.filter(r => !r.can_manage) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Layers className="h-6 w-6" />
          Programmes
        </h1>
        <p className="text-sm text-muted-foreground">
          A programme holds classes, each run by its own tutor with its own join
          code. Production projects run in those classes.
        </p>
      </div>

      {canStart && (
        <StartProgramme
          platformAdmin={platformAdmin}
          onCreated={programmeId =>
            router.push(`/dashboard/programmes/${programmeId}`)
          }
        />
      )}

      <ProgrammeList
        title={canStart ? 'Programmes you run' : 'Programmes'}
        rows={managed}
        loading={!rows}
        empty={
          canStart
            ? 'No programmes yet. Start one above.'
            : 'No programmes yet.'
        }
      />
      {takingPart.length > 0 && (
        <ProgrammeList
          title={
            role === 'teacher'
              ? 'Programmes you teach in'
              : 'Programmes your school takes part in'
          }
          rows={takingPart}
          loading={false}
          empty=""
        />
      )}
    </div>
  );
}

function ProgrammeList({
  title,
  rows,
  loading,
  empty,
}: {
  title: string;
  rows: ProgrammeRow[];
  loading: boolean;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {rows.map(p => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/programmes/${p.id}`}
                  className="group flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium group-hover:underline">
                      {p.name}
                      <StatusBadge status={p.status} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.scope === 'school'
                        ? 'School programme'
                        : 'Platform programme'}{' '}
                      · {whoTakesPart(p)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{p.totals.classes} classes</span>
                    <span>{p.totals.tutors} tutors</span>
                    <span>{p.totals.learners} learners</span>
                    <span>{p.totals.projects} projects</span>
                    {p.totals.milestones > 0 && (
                      <span>
                        {p.totals.milestones_approved}/{p.totals.milestones}{' '}
                        milestones approved
                      </span>
                    )}
                    <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-700" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type Who = 'school' | 'selected' | 'all';

function StartProgramme({
  platformAdmin,
  onCreated,
}: {
  platformAdmin: boolean;
  onCreated: (programmeId: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [who, setWho] = useState<Who>('school');
  const [schools, setSchools] = useState<string[]>([]);
  const [stage, setStage] = useState<'' | 'mentorship' | 'fellowship'>('');
  const [className, setClassName] = useState('');
  const [tutor, setTutor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (who === 'selected' && schools.length === 0) {
      toast.error('Choose at least one school');
      return;
    }
    if (platformAdmin && who === 'school' && !tutor) {
      toast.error(
        'Choose the first tutor: the programme belongs to their school'
      );
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await createClient().rpc('create_programme', {
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_scope: who === 'school' ? 'school' : 'programme',
        p_school: null,
        p_schools: who === 'selected' ? schools : null,
        p_stage: who === 'school' ? null : stage || null,
        p_class_name: className.trim() || null,
        p_tutor: tutor,
      });
      if (error) throw error;
      toast.success('Programme started.');
      onCreated((data as { id: string }).id);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the programme'));
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Start a programme</CardTitle>
        <CardDescription>
          {platformAdmin
            ? 'For one school, selected schools or every school; optionally only learners who have reached a stage. Add its first class now or later.'
            : 'For your school. Add its first class and tutor now, or more classes later.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={start} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="programme-name">Programme name</Label>
            <Input
              id="programme-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Mentorship 2027"
              required
              minLength={3}
              maxLength={150}
            />
          </div>
          {platformAdmin ? (
            <div className="space-y-1">
              <Label htmlFor="programme-who">Schools taking part</Label>
              <select
                id="programme-who"
                value={who}
                onChange={e => setWho(e.target.value as Who)}
                className="w-full rounded border bg-white p-2 text-sm"
              >
                <option value="school">One school (the first tutor’s)</option>
                <option value="selected">Selected schools</option>
                <option value="all">All schools</option>
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Schools taking part</Label>
              <p className="rounded border bg-gray-50 p-2 text-sm text-muted-foreground">
                Your school
              </p>
            </div>
          )}
          {platformAdmin && who === 'selected' && (
            <div className="space-y-1">
              <Label htmlFor="programme-schools">Which schools</Label>
              <SchoolsPicker
                id="programme-schools"
                value={schools}
                onChange={setSchools}
              />
            </div>
          )}
          {platformAdmin && who !== 'school' && (
            <div className="space-y-1">
              <Label htmlFor="programme-stage">Which learners</Label>
              <select
                id="programme-stage"
                value={stage}
                onChange={e => setStage(e.target.value as typeof stage)}
                className="w-full rounded border bg-white p-2 text-sm"
              >
                <option value="">Any learner at those schools</option>
                <option value="mentorship">
                  Only learners selected for mentorship
                </option>
                <option value="fellowship">
                  Only learners selected for the fellowship
                </option>
              </select>
            </div>
          )}
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
          <p className="pt-2 text-sm font-medium md:col-span-2">
            First class {platformAdmin && who === 'school' ? '' : '(optional)'}
          </p>
          <div className="space-y-1">
            <Label htmlFor="programme-class">Class name</Label>
            <Input
              id="programme-class"
              value={className}
              onChange={e => setClassName(e.target.value)}
              placeholder="Defaults to the programme name"
              maxLength={150}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="programme-tutor">Tutor</Label>
            {platformAdmin ? (
              <AnyTeacherPicker
                id="programme-tutor"
                value={tutor}
                onChange={setTutor}
              />
            ) : (
              <MemberPicker
                id="programme-tutor"
                role="teacher"
                value={tutor}
                onChange={setTutor}
              />
            )}
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Starting…' : 'Start programme'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
