'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pause, Pencil, Play, Square, Trash2 } from 'lucide-react';
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
import {
  CopyCode,
  ProgrammeStage,
  ProgrammeStatus,
  SchoolsPicker,
  StatusBadge,
  whoTakesPart,
} from '@/components/programmes/pickers';
import { createClient } from '@/lib/supabase/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

interface ClassRow {
  id: string;
  name: string;
  code: string;
  tutor_id: string;
  tutor_name: string | null;
  tutor_school: string | null;
  school_id: string | null;
  school_name: string | null;
  learners: number;
  pending: number;
  sessions: number;
  attendance_rate: number | null;
  projects: number;
  milestones: number;
  milestones_approved: number;
}

interface Totals {
  classes: number;
  tutors: number;
  learners: number;
  pending_requests: number;
  schools_represented: number;
  sessions: number;
  attendance_rate: number | null;
  projects: number;
  projects_active: number;
  projects_completed: number;
  projects_suspended: number;
  milestones: number;
  milestones_approved: number;
  milestones_waiting: number;
  milestones_changes: number;
  milestones_overdue: number;
  versions: number;
  avg_review_hours: number | null;
  last_activity: string | null;
}

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  class: string;
  team: number;
  milestones: number;
  approved: number;
  waiting: number;
  overdue: number;
  last_activity: string | null;
}

interface Detail {
  programme: {
    id: string;
    name: string;
    description: string | null;
    scope: 'school' | 'programme';
    stage: ProgrammeStage;
    status: ProgrammeStatus;
    school_name: string | null;
    created_by_name: string | null;
    created_at: string;
  };
  can_manage: boolean;
  can_delete: boolean;
  is_platform_admin: boolean;
  managers:
    | {
        user_id: string;
        name: string | null;
        role: string;
        school: string | null;
      }[]
    | null;
  my_school: {
    school: string;
    learners: number;
    attendance_rate: number | null;
    projects: number;
    milestones: number;
    milestones_approved: number;
    milestones_overdue: number;
  } | null;
  schools: { id: string; name: string }[];
  classes: ClassRow[];
  totals: Totals | null;
  by_school: { school: string; learners: number }[] | null;
  projects: ProjectRow[] | null;
}

const pct = (v: number | null) =>
  v === null ? '—' : `${Math.round(v * 100)}%`;
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await createClient().rpc(name, args);
  if (error) throw error;
  return data;
}

export default function ProgrammePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    const supabase = createClient();
    supabase
      .rpc('programme_detail', { p_programme: id })
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setDetail(data as Detail);
      });
    supabase
      .rpc('my_project_access')
      .then(({ data }) =>
        setPlatformAdmin(
          !!(data as { platform_admin: boolean } | null)?.platform_admin
        )
      );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!detail)
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const { programme: p, can_manage: canManage } = detail;
  const schoolNames = detail.schools.map(s => s.name).join(', ') || null;

  const setStatus = async (status: ProgrammeStatus) => {
    const copy = {
      suspended: {
        title: `Suspend ${p.name}?`,
        description:
          'Learners can’t join its classes or hand in project work until you resume it. Nothing is deleted.',
        confirmLabel: 'Suspend',
        destructive: true,
      },
      ended: {
        title: `End ${p.name}?`,
        description:
          'The programme closes for good: no joining or handing in, and its projects are marked complete. Classes, projects and work are kept for the record.',
        confirmLabel: 'End programme',
        destructive: true,
      },
      active: {
        title: `Make ${p.name} active again?`,
        description: 'Learners can join and hand in work again.',
        confirmLabel: 'Resume',
      },
    }[status];
    if (!(await confirmAction(copy))) return;
    try {
      await rpc('set_programme_status', {
        p_programme: p.id,
        p_status: status,
      });
      toast.success('Updated. The tutors have been told.');
      load();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the programme'));
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: `Delete ${p.name}?`,
      description:
        'This deletes the programme and its production projects (milestones and handed-in links). Its classes, learners, assignments and grades are kept as ordinary classes. This cannot be undone.',
      confirmLabel: 'Delete programme',
      destructive: true,
    });
    if (!ok) return;
    try {
      await rpc('delete_programme', { p_programme: p.id });
      toast.success('Programme deleted');
      router.push('/dashboard/programmes');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the programme'));
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/programmes">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All programmes
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {p.name}
            <StatusBadge status={p.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {p.scope === 'school' ? 'School programme' : 'Platform programme'} ·{' '}
            {whoTakesPart({ ...p, schools: schoolNames })}
            {p.created_by_name
              ? ` · started by ${p.created_by_name}`
              : ''} · {day(p.created_at)}
          </p>
          {p.description && <p className="mt-2 text-sm">{p.description}</p>}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(e => !e)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {p.status === 'active' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus('suspended')}
              >
                <Pause className="mr-2 h-4 w-4" />
                Suspend
              </Button>
            )}
            {p.status !== 'active' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus('active')}
              >
                <Play className="mr-2 h-4 w-4" />
                {p.status === 'ended' ? 'Reopen' : 'Resume'}
              </Button>
            )}
            {p.status !== 'ended' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus('ended')}
              >
                <Square className="mr-2 h-4 w-4" />
                End
              </Button>
            )}
            {detail.can_delete && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={remove}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && canManage && (
        <EditProgramme
          detail={detail}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}

      {detail.my_school && !canManage && <MySchool detail={detail} />}

      {detail.totals && <Analytics detail={detail} />}

      {detail.managers && <Managers detail={detail} onChanged={load} />}

      <Classes detail={detail} platformAdmin={platformAdmin} onChanged={load} />
    </div>
  );
}

function EditProgramme({
  detail,
  onSaved,
}: {
  detail: Detail;
  onSaved: () => void;
}) {
  const p = detail.programme;
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description ?? '');
  const [allSchools, setAllSchools] = useState(detail.schools.length === 0);
  const [schools, setSchools] = useState(detail.schools.map(s => s.id));
  const [stage, setStage] = useState<string>(p.stage ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (p.scope === 'programme' && !allSchools && schools.length === 0) {
      toast.error('Choose at least one school, or all schools');
      return;
    }
    setSaving(true);
    try {
      await rpc('update_programme', {
        p_programme: p.id,
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_schools: p.scope === 'programme' && !allSchools ? schools : null,
        p_stage: p.scope === 'programme' ? stage || null : null,
      });
      toast.success('Saved');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Edit programme</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              minLength={3}
              maxLength={150}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="edit-description">About it</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>
          {p.scope === 'programme' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="edit-who">Schools taking part</Label>
                <select
                  id="edit-who"
                  value={allSchools ? 'all' : 'selected'}
                  onChange={e => setAllSchools(e.target.value === 'all')}
                  className="w-full rounded border bg-white p-2 text-sm"
                >
                  <option value="selected">Selected schools</option>
                  <option value="all">All schools</option>
                </select>
                {!allSchools && (
                  <SchoolsPicker
                    value={schools}
                    onChange={setSchools}
                    programmeId={p.id}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-stage">Which learners</Label>
                <select
                  id="edit-stage"
                  value={stage}
                  onChange={e => setStage(e.target.value)}
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
            </>
          )}
          <div className="md:col-span-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Analytics({ detail }: { detail: Detail }) {
  const t = detail.totals!;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Analytics</CardTitle>
        <CardDescription>
          Across all {t.classes} classes · last activity {day(t.last_activity)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Tile
            label="Learners"
            value={t.learners}
            hint={`${t.pending_requests} waiting to join`}
          />
          <Tile label="Tutors" value={t.tutors} hint={`${t.classes} classes`} />
          <Tile
            label="Schools"
            value={t.schools_represented}
            hint="learners come from"
          />
          <Tile
            label="Attendance"
            value={pct(t.attendance_rate)}
            hint={`${t.sessions} sessions logged`}
          />
          <Tile
            label="Projects"
            value={t.projects}
            hint={`${t.projects_active} active · ${t.projects_completed} done${t.projects_suspended ? ` · ${t.projects_suspended} paused` : ''}`}
          />
          <Tile
            label="Milestones"
            value={`${t.milestones_approved}/${t.milestones}`}
            hint="approved"
          />
          <Tile
            label="To review"
            value={t.milestones_waiting}
            hint={`${t.milestones_changes} with changes asked`}
          />
          <Tile
            label="Overdue"
            value={t.milestones_overdue}
            hint="milestones past due"
          />
          <Tile label="Versions" value={t.versions} hint="handed in" />
          <Tile
            label="Review time"
            value={
              t.avg_review_hours === null ? '—' : `${t.avg_review_hours} h`
            }
            hint="average"
          />
        </div>

        {detail.by_school && detail.by_school.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">Learners by school</p>
            <ul className="flex flex-wrap gap-2 text-sm">
              {detail.by_school.map(s => (
                <li
                  key={s.school}
                  className="rounded-full bg-gray-100 px-3 py-1"
                >
                  {s.school}: <strong>{s.learners}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail.projects && detail.projects.length > 0 && (
          <div className="overflow-x-auto">
            <p className="mb-1 text-sm font-medium">Projects</p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Project</th>
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 text-right font-medium">Team</th>
                  <th className="py-2 pr-3 text-right font-medium">Approved</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    To review
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Overdue</th>
                  <th className="py-2 font-medium">Last work</th>
                </tr>
              </thead>
              <tbody>
                {detail.projects.map(pr => (
                  <tr key={pr.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/dashboard/projects/${pr.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {pr.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{pr.class}</td>
                    <td className="py-2 pr-3 capitalize">{pr.status}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {pr.team}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {pr.approved}/{pr.milestones}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {pr.waiting}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right tabular-nums ${pr.overdue ? 'text-red-600' : ''}`}
                    >
                      {pr.overdue}
                    </td>
                    <td className="py-2">{day(pr.last_activity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TutorPicker({
  detail,
  value,
  onChange,
  id,
}: {
  detail: Detail;
  platformAdmin?: boolean;
  value: string | null;
  onChange: (id: string | null) => void;
  id: string;
}) {
  const [tutors, setTutors] = useState<
    | {
        id: string;
        name: string | null;
        email: string;
        school_name: string | null;
      }[]
    | null
  >(null);
  const [filter, setFilter] = useState('');
  const programmeId = detail.programme.id;

  useEffect(() => {
    createClient()
      .rpc('programme_tutor_candidates', { p_programme: programmeId })
      .then(({ data }) => setTutors((data as typeof tutors) ?? []));
  }, [programmeId]);

  if (!tutors)
    return <p className="text-sm text-muted-foreground">Loading tutors…</p>;
  const term = filter.trim().toLowerCase();
  const shown = tutors.filter(
    t =>
      !term ||
      t.id === value ||
      `${t.name ?? ''} ${t.email} ${t.school_name ?? ''}`
        .toLowerCase()
        .includes(term)
  );
  return (
    <div className="space-y-2">
      {tutors.length > 15 && (
        <Input
          placeholder={`Filter ${tutors.length} teachers`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          aria-label="Filter tutors"
        />
      )}
      <select
        id={id}
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full rounded border bg-white p-2 text-sm"
      >
        <option value="">-- Choose a tutor ({shown.length}) --</option>
        {shown.map(t => (
          <option key={t.id} value={t.id}>
            {t.name ?? t.email}
            {t.school_name ? ` · ${t.school_name}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Schools a class can serve (the programme's schools). */
function useSchoolOptions(programmeId: string, enabled: boolean) {
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!enabled) return;
    createClient()
      .rpc('programme_school_options', { p_programme: programmeId })
      .then(({ data }) =>
        setOptions((data as { id: string; name: string }[]) ?? [])
      );
  }, [programmeId, enabled]);
  return options;
}

function Managers({
  detail,
  onChanged,
}: {
  detail: Detail;
  onChanged: () => void;
}) {
  const managers = detail.managers ?? [];
  const p = detail.programme;
  const [people, setPeople] = useState<
    | {
        id: string;
        name: string | null;
        email: string;
        role: string;
        school_name: string | null;
      }[]
    | null
  >(null);
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState('');
  const canEdit = detail.is_platform_admin;

  useEffect(() => {
    if (!canEdit) return;
    createClient()
      .rpc('programme_manager_candidates')
      .then(({ data }) => setPeople((data as typeof people) ?? []));
  }, [canEdit]);

  const change = async (fnName: string, userId: string, done: string) => {
    try {
      await rpc(fnName, { p_programme: p.id, p_user: userId });
      toast.success(done);
      setChosen('');
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, 'That did not work'));
    }
  };

  const term = filter.trim().toLowerCase();
  const shown = (people ?? []).filter(
    x =>
      !managers.some(m => m.user_id === x.id) &&
      (!term ||
        `${x.name ?? ''} ${x.email} ${x.school_name ?? ''}`
          .toLowerCase()
          .includes(term))
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Programme managers</CardTitle>
        <CardDescription>
          People who run this programme with their own login: they can edit it,
          add or remove classes and tutors, suspend or end it, and see its
          analytics, but nothing else on the platform.
          {p.scope === 'school' && ' The school’s admin manages it too.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {managers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No extra managers.</p>
        ) : (
          <ul className="divide-y rounded border text-sm">
            {managers.map(m => (
              <li
                key={m.user_id}
                className="flex items-center justify-between gap-2 p-2"
              >
                <span>
                  {m.name ?? 'Someone'}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({m.role === 'institution_admin' ? 'school admin' : m.role}
                    {m.school ? `, ${m.school}` : ''})
                  </span>
                </span>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() =>
                      change(
                        'remove_programme_manager',
                        m.user_id,
                        'Manager removed'
                      )
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="space-y-2 rounded border p-3">
            <p className="text-sm font-medium">Add a manager</p>
            {!people ? (
              <p className="text-sm text-muted-foreground">Loading people…</p>
            ) : (
              <>
                {people.length > 15 && (
                  <Input
                    placeholder="Filter by name, email or school"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    aria-label="Filter people"
                  />
                )}
                <select
                  value={chosen}
                  onChange={e => setChosen(e.target.value)}
                  className="w-full rounded border bg-white p-2 text-sm"
                  aria-label="Person to add as manager"
                >
                  <option value="">
                    -- Choose a school admin or teacher ({shown.length}) --
                  </option>
                  {shown.map(x => (
                    <option key={x.id} value={x.id}>
                      {x.name ?? x.email} ·{' '}
                      {x.role === 'institution_admin'
                        ? 'school admin'
                        : 'teacher'}
                      {x.school_name ? ` · ${x.school_name}` : ''}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!chosen}
                  onClick={() =>
                    change(
                      'add_programme_manager',
                      chosen,
                      'Manager added; they have been told'
                    )
                  }
                >
                  Add manager
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MySchool({ detail }: { detail: Detail }) {
  const m = detail.my_school!;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {m.school} in this programme
        </CardTitle>
        <CardDescription>Your school’s learners only.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Your learners" value={m.learners} />
          <Tile label="Attendance" value={pct(m.attendance_rate)} />
          <Tile label="Their projects" value={m.projects} />
          <Tile
            label="Milestones"
            value={`${m.milestones_approved}/${m.milestones}`}
            hint={
              m.milestones_overdue
                ? `${m.milestones_overdue} overdue`
                : 'approved'
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Classes({
  detail,
  platformAdmin,
  onChanged,
}: {
  detail: Detail;
  platformAdmin: boolean;
  onChanged: () => void;
}) {
  const p = detail.programme;
  const canManage = detail.can_manage;
  const [newName, setNewName] = useState('');
  const [newTutor, setNewTutor] = useState<string | null>(null);
  const [available, setAvailable] = useState<
    | {
        id: string;
        name: string;
        tutor_name: string | null;
        school_name: string | null;
        learners: number;
      }[]
    | null
  >(null);
  const [existing, setExisting] = useState('');
  const [changing, setChanging] = useState<string | null>(null);
  const [changeTo, setChangeTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newSchool, setNewSchool] = useState('');
  const multiSchool = p.scope === 'programme';
  const schoolOptions = useSchoolOptions(p.id, canManage && multiSchool);

  const loadAvailable = useCallback(() => {
    if (!canManage) return;
    createClient()
      .rpc('programme_classes_available', { p_programme: p.id })
      .then(({ data }) => setAvailable((data as typeof available) ?? []));
  }, [canManage, p.id]);

  useEffect(() => {
    loadAvailable();
  }, [loadAvailable]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      onChanged();
      loadAvailable();
    } catch (e) {
      toast.error(errorMessage(e, 'That did not work'));
    } finally {
      setBusy(false);
    }
  };

  const open = p.status !== 'ended';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Classes and tutors</CardTitle>
        <CardDescription>
          Each class has its own tutor and join code. Give the code to the
          learners taking part; they enter it under Join a class and the tutor
          accepts them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {detail.classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 font-medium">Tutor</th>
                  <th className="py-2 pr-3 font-medium">Join code</th>
                  <th className="py-2 pr-3 text-right font-medium">Learners</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Attendance
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Projects</th>
                  {canManage && <th className="py-2" />}
                </tr>
              </thead>
              <tbody>
                {detail.classes.map(c => (
                  <tr key={c.id} className="border-b align-top last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{c.name}</span>
                      {multiSchool &&
                        (canManage ? (
                          <select
                            value={c.school_id ?? ''}
                            onChange={e =>
                              run('School updated', () =>
                                rpc('set_programme_class_school', {
                                  p_class: c.id,
                                  p_school: e.target.value || null,
                                })
                              )
                            }
                            className="mt-1 block w-full max-w-[12rem] rounded border bg-white p-1 text-xs"
                            aria-label={`School for ${c.name}`}
                          >
                            <option value="">Any school taking part</option>
                            {schoolOptions.map(o => (
                              <option key={o.id} value={o.id}>
                                For {o.name} only
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="block text-xs text-muted-foreground">
                            {c.school_name
                              ? `For ${c.school_name} learners`
                              : 'Any school taking part'}
                          </span>
                        ))}
                    </td>
                    <td className="py-2 pr-3">
                      {changing === c.id ? (
                        <div className="min-w-[14rem] space-y-2">
                          <TutorPicker
                            id={`tutor-${c.id}`}
                            detail={detail}
                            platformAdmin={platformAdmin}
                            value={changeTo}
                            onChange={setChangeTo}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!changeTo || busy}
                              onClick={() =>
                                run(
                                  'Tutor changed; they have been told',
                                  async () => {
                                    await rpc('set_programme_class_tutor', {
                                      p_class: c.id,
                                      p_tutor: changeTo,
                                    });
                                    setChanging(null);
                                  }
                                )
                              }
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setChanging(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {c.tutor_name ?? '—'}
                          {c.tutor_school && (
                            <span className="block text-xs text-muted-foreground">
                              {c.tutor_school}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <CopyCode code={c.code} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {c.learners}
                      {c.pending > 0 && (
                        <Badge variant="outline" className="ml-1">
                          +{c.pending} waiting
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {pct(c.attendance_rate)}
                      <span className="block text-xs text-muted-foreground">
                        {c.sessions} sessions
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {c.projects}
                      {c.milestones > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {c.milestones_approved}/{c.milestones} approved
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="whitespace-nowrap py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setChanging(c.id);
                            setChangeTo(null);
                          }}
                        >
                          Change tutor
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          disabled={busy}
                          onClick={async () => {
                            const ok = await confirmAction({
                              title: `Remove ${c.name} from the programme?`,
                              description:
                                'The class, its learners and their work stay as an ordinary class. Its production projects are suspended.',
                              confirmLabel: 'Remove',
                              destructive: true,
                            });
                            if (ok)
                              run('Class removed from the programme', () =>
                                rpc('detach_programme_class', {
                                  p_programme: p.id,
                                  p_class: c.id,
                                })
                              );
                          }}
                        >
                          Remove
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage && open && (
          <div className="grid gap-4 md:grid-cols-2">
            <form
              className="space-y-2 rounded border p-3"
              onSubmit={e => {
                e.preventDefault();
                if (!newTutor) {
                  toast.error('Choose the tutor');
                  return;
                }
                run('Class added; the tutor has the join code', async () => {
                  await rpc('add_programme_class', {
                    p_programme: p.id,
                    p_name: newName.trim(),
                    p_tutor: newTutor,
                    p_school: multiSchool ? newSchool || null : null,
                  });
                  setNewName('');
                  setNewTutor(null);
                  setNewSchool('');
                });
              }}
            >
              <p className="text-sm font-medium">Add a new class</p>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Class name, e.g. Aba North group"
                required
                minLength={2}
                maxLength={150}
                aria-label="New class name"
              />
              {multiSchool && (
                <select
                  value={newSchool}
                  onChange={e => setNewSchool(e.target.value)}
                  className="w-full rounded border bg-white p-2 text-sm"
                  aria-label="School this class serves"
                >
                  <option value="">For any school taking part</option>
                  {schoolOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      For {o.name} learners only
                    </option>
                  ))}
                </select>
              )}
              <TutorPicker
                id="new-class-tutor"
                detail={detail}
                platformAdmin={platformAdmin}
                value={newTutor}
                onChange={setNewTutor}
              />
              <Button type="submit" size="sm" disabled={busy}>
                Add class
              </Button>
            </form>

            <form
              className="space-y-2 rounded border p-3"
              onSubmit={e => {
                e.preventDefault();
                if (!existing) return;
                run('Class added to the programme', async () => {
                  await rpc('attach_programme_class', {
                    p_programme: p.id,
                    p_class: existing,
                  });
                  setExisting('');
                });
              }}
            >
              <p className="text-sm font-medium">Add an existing class</p>
              {!available ? (
                <p className="text-sm text-muted-foreground">
                  Loading classes…
                </p>
              ) : available.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No other classes available
                  {p.scope === 'school' ? ' at this school' : ''}.
                </p>
              ) : (
                <select
                  value={existing}
                  onChange={e => setExisting(e.target.value)}
                  className="w-full rounded border bg-white p-2 text-sm"
                  aria-label="Existing class"
                >
                  <option value="">
                    -- Choose a class ({available.length}) --
                  </option>
                  {available.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.tutor_name ?? 'no tutor'}
                      {c.school_name ? ` · ${c.school_name}` : ''} ·{' '}
                      {Number(c.learners)} learners
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-muted-foreground">
                Its tutor and learners come with it; learners who already joined
                stay in.
              </p>
              <Button type="submit" size="sm" disabled={busy || !existing}>
                Add class
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
