'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { checkLink } from '@/lib/link-check';
import { createClient } from '@/lib/supabase/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

type MilestoneStatus =
  | 'not_started'
  | 'submitted'
  | 'changes_requested'
  | 'approved';

interface Version {
  id: string;
  version: number;
  link_url: string;
  note: string | null;
  submitted_by: string | null;
  submitted_at: string;
  decision: 'pending' | 'approved' | 'changes_requested' | 'superseded';
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

interface Milestone {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  approved_at: string | null;
  versions: Version[];
}

interface Detail {
  project: {
    id: string;
    class_id: string;
    title: string;
    brief: string | null;
    assets_url: string | null;
    status: 'active' | 'suspended' | 'completed' | 'archived';
    class_name: string;
    cohort_stage: string;
    mentor_name: string | null;
  };
  i_mentor: boolean;
  i_member: boolean;
  team: { student_id: string; name: string; role_title: string | null }[];
  milestones: Milestone[];
}

const MILESTONE_STATUS: Record<
  MilestoneStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  not_started: { label: 'Not started', variant: 'outline' },
  submitted: { label: 'Waiting for review', variant: 'default' },
  changes_requested: { label: 'Changes requested', variant: 'destructive' },
  approved: { label: 'Approved', variant: 'secondary' },
};

const DECISION: Record<Version['decision'], string> = {
  pending: 'Waiting for review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  superseded: 'Replaced by a newer version',
};

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '';

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await createClient().rpc(name, args);
  if (error) throw error;
  return data;
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    createClient()
      .rpc('production_project_detail', { p_project: id })
      .then(({ data, error: rpcError }) => {
        if (rpcError) setError(rpcError.message);
        else setDetail(data as Detail);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!detail)
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const { project, team, milestones, i_mentor, i_member } = detail;
  const approved = milestones.filter(m => m.status === 'approved').length;
  const active = project.status === 'active';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/projects">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All projects
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <p className="text-sm text-muted-foreground">
            {project.class_name}
            {project.mentor_name
              ? ` · mentor ${project.mentor_name}`
              : ''} · {approved}/{milestones.length} milestones approved
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.status !== 'active' && (
            <Badge variant="secondary" className="capitalize">
              {project.status}
            </Badge>
          )}
          {project.assets_url && (
            <Button asChild variant="outline" size="sm">
              <a
                href={project.assets_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                Project files
              </a>
            </Button>
          )}
        </div>
      </div>

      {project.brief && (
        <p className="whitespace-pre-wrap text-sm">{project.brief}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {milestones.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No milestones yet.
              {i_mentor ? ' Add the first one below.' : ''}
            </p>
          )}
          {milestones.map((m, index) => (
            <MilestoneCard
              key={m.id}
              number={index + 1}
              milestone={m}
              projectId={project.id}
              canSubmit={i_member && active}
              canReview={i_mentor}
              onChanged={load}
            />
          ))}
          {i_mentor && active && (
            <MilestoneForm projectId={project.id} onSaved={load} />
          )}
        </div>

        <div className="space-y-4">
          <TeamCard
            projectId={project.id}
            team={team}
            canEdit={i_mentor && active}
            onChanged={load}
          />
          {i_mentor && <ProjectSettings detail={detail} onSaved={load} />}
        </div>
      </div>
    </div>
  );
}

function MilestoneCard({
  number,
  milestone: m,
  projectId,
  canSubmit,
  canReview,
  onChanged,
}: {
  number: number;
  milestone: Milestone;
  projectId: string;
  canSubmit: boolean;
  canReview: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [linkWarning, setLinkWarning] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = m.versions.find(v => v.decision === 'pending');
  const overdue =
    m.status !== 'approved' &&
    m.due_date &&
    new Date(`${m.due_date}T23:59:59`) < new Date();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const version = await rpc('submit_milestone_version', {
        p_milestone: m.id,
        p_link: link.trim(),
        p_note: note.trim() || null,
      });
      toast.success(`Version ${version} handed in`);
      setLink('');
      setNote('');
      setLinkWarning(null);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not hand in this version'));
    } finally {
      setBusy(false);
    }
  };

  const review = async (approve: boolean) => {
    if (!pending) return;
    setBusy(true);
    try {
      await rpc('review_milestone_version', {
        p_version: pending.id,
        p_approve: approve,
        p_note: reviewNote.trim() || null,
      });
      toast.success(approve ? 'Approved' : 'Changes requested');
      setReviewNote('');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not record your review'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: `Remove “${m.title}”?`,
      description: 'Only milestones nobody has handed anything in for.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await rpc('delete_project_milestone', { p_milestone: m.id });
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove the milestone'));
    }
  };

  if (editing) {
    return (
      <MilestoneForm
        projectId={projectId}
        milestone={m}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {m.status === 'approved' && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            {number}. {m.title}
          </CardTitle>
          <CardDescription>
            {m.due_date ? (
              <span className={overdue ? 'font-medium text-red-600' : ''}>
                Due {day(m.due_date)}
                {overdue ? ' (overdue)' : ''}
              </span>
            ) : (
              'No due date'
            )}
            {m.approved_at ? ` · approved ${day(m.approved_at)}` : ''}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={MILESTONE_STATUS[m.status].variant}>
            {MILESTONE_STATUS[m.status].label}
          </Badge>
          {canReview && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(true)}
                title="Edit milestone"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {m.versions.length === 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={remove}
                  title="Remove milestone"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {m.description && (
          <p className="whitespace-pre-wrap text-gray-700">{m.description}</p>
        )}

        {m.versions.length > 0 && (
          <ol className="space-y-2">
            {m.versions.map(v => (
              <li
                key={v.id}
                className={`rounded border p-2 ${
                  v.decision === 'superseded' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={v.link_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 font-medium text-blue-700 underline-offset-4 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Version {v.version}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {v.submitted_by ?? 'Someone'} · {day(v.submitted_at)} ·{' '}
                    {DECISION[v.decision]}
                  </span>
                </div>
                {v.note && <p className="mt-1 text-gray-700">{v.note}</p>}
                {v.decision_note && (
                  <p className="mt-1 rounded bg-gray-50 p-2 text-gray-800">
                    <span className="font-medium">
                      {v.decided_by ?? 'Mentor'}:
                    </span>{' '}
                    {v.decision_note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}

        {canReview && pending && (
          <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
            <p className="font-medium">Review version {pending.version}</p>
            <Textarea
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              placeholder="Feedback for the team (needed when asking for changes)"
              rows={2}
              maxLength={2000}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => review(true)} disabled={busy}>
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => review(false)}
                disabled={busy || reviewNote.trim().length < 5}
              >
                Ask for changes
              </Button>
            </div>
          </div>
        )}

        {canSubmit && m.status !== 'approved' && (
          <form onSubmit={submit} className="space-y-2 border-t pt-3">
            <Label htmlFor={`version-link-${m.id}`}>
              Hand in {m.versions.length ? 'a new version' : 'your work'}
            </Label>
            <Input
              id={`version-link-${m.id}`}
              type="url"
              value={link}
              onChange={e => {
                setLink(e.target.value);
                setLinkWarning(null);
              }}
              onBlur={async () => {
                if (!link.trim()) return;
                const result = await checkLink(link.trim());
                setLinkWarning(result.message);
              }}
              placeholder="Link to the file on Drive, YouTube or Vimeo"
              required
            />
            {linkWarning && (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                {linkWarning}
              </p>
            )}
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What changed in this version? (optional)"
              rows={2}
              maxLength={2000}
            />
            <Button type="submit" size="sm" disabled={busy || !link.trim()}>
              {busy ? 'Sending…' : 'Hand in for review'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function MilestoneForm({
  projectId,
  milestone,
  onSaved,
  onCancel,
}: {
  projectId: string;
  milestone?: Milestone;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(milestone?.title ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [due, setDue] = useState(milestone?.due_date ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('save_project_milestone', {
        p_project: projectId,
        p_milestone: milestone?.id ?? null,
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_due: due || null,
      });
      if (!milestone) {
        setTitle('');
        setDescription('');
        setDue('');
      }
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the milestone'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {milestone ? 'Edit milestone' : 'Add a milestone'}
        </CardTitle>
        {!milestone && (
          <CardDescription>
            For example: script, character designs, storyboard, animatic,
            animation, sound, final render.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            required
            minLength={2}
            maxLength={120}
            aria-label="Milestone title"
          />
          <Input
            type="date"
            value={due}
            onChange={e => setDue(e.target.value)}
            aria-label="Due date"
          />
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What should be handed in (optional)"
            rows={2}
            maxLength={2000}
            className="md:col-span-2"
          />
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : milestone ? 'Save' : 'Add milestone'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TeamCard({
  projectId,
  team,
  canEdit,
  onChanged,
}: {
  projectId: string;
  team: Detail['team'];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [chosen, setChosen] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  const startEditing = async () => {
    setChosen(
      Object.fromEntries(team.map(t => [t.student_id, t.role_title ?? '']))
    );
    // Learners in the project's group (mentor or platform admin only).
    const { data, error } = await createClient().rpc(
      'project_team_candidates',
      { p_project: projectId }
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setRoster(
      (
        (data as {
          id: string;
          name: string | null;
          school_name: string | null;
        }[]) ?? []
      ).map(r => ({
        id: r.id,
        name: `${r.name ?? 'Learner'}${r.school_name ? ` (${r.school_name})` : ''}`,
      }))
    );
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await rpc('set_project_team', {
        p_project: projectId,
        p_members: Object.entries(chosen).map(([student_id, role_title]) => ({
          student_id,
          role_title: role_title?.trim() || null,
        })),
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the team'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Team</CardTitle>
        {canEdit && !editing && (
          <Button size="sm" variant="outline" onClick={startEditing}>
            Edit team
          </Button>
        )}
      </CardHeader>
      <CardContent className="text-sm">
        {editing ? (
          <div className="space-y-2">
            {roster.length === 0 && (
              <p className="text-muted-foreground">
                Nobody has joined this group yet.
              </p>
            )}
            {roster.map(r => {
              const on = r.id in chosen;
              return (
                <div key={r.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`team-${r.id}`}
                    checked={on}
                    onCheckedChange={value =>
                      setChosen(prev => {
                        const next = { ...prev };
                        if (value) next[r.id] = '';
                        else delete next[r.id];
                        return next;
                      })
                    }
                  />
                  <Label htmlFor={`team-${r.id}`} className="flex-1">
                    {r.name}
                  </Label>
                  {on && (
                    <Input
                      value={chosen[r.id] ?? ''}
                      onChange={e =>
                        setChosen(prev => ({
                          ...prev,
                          [r.id]: e.target.value,
                        }))
                      }
                      placeholder="Role, e.g. Animator"
                      maxLength={60}
                      className="h-8 w-40"
                    />
                  )}
                </div>
              );
            })}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save team'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : team.length === 0 ? (
          <p className="text-muted-foreground">No one on the team yet.</p>
        ) : (
          <ul className="space-y-1">
            {team.map(t => (
              <li key={t.student_id} className="flex justify-between gap-2">
                <Link
                  href={`/dashboard/portfolio/${t.student_id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {t.name}
                </Link>
                <span className="text-muted-foreground">{t.role_title}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectSettings({
  detail,
  onSaved,
}: {
  detail: Detail;
  onSaved: () => void;
}) {
  const { project } = detail;
  const [title, setTitle] = useState(project.title);
  const [brief, setBrief] = useState(project.brief ?? '');
  const [assets, setAssets] = useState(project.assets_url ?? '');
  const [status, setStatus] = useState(project.status);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const remove = async () => {
    const ok = await confirmAction({
      title: `Delete “${project.title}”?`,
      description:
        'This deletes the project, its milestones and every version handed in (the files stay wherever the team kept them). The team is told. This cannot be undone.',
      confirmLabel: 'Delete project',
      destructive: true,
    });
    if (!ok) return;
    try {
      await rpc('delete_production_project', { p_project: project.id });
      toast.success('Project deleted');
      router.push('/dashboard/projects');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the project'));
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('update_production_project', {
        p_project: project.id,
        p_title: title.trim(),
        p_brief: brief.trim() || null,
        p_assets_url: assets.trim() || null,
        p_status: status,
      });
      toast.success('Saved');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the project'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Project settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="settings-title">Title</Label>
            <Input
              id="settings-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={150}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="settings-brief">Brief</Label>
            <Textarea
              id="settings-brief"
              value={brief}
              onChange={e => setBrief(e.target.value)}
              rows={3}
              maxLength={4000}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="settings-assets">Shared folder for the files</Label>
            <Input
              id="settings-assets"
              type="url"
              value={assets}
              onChange={e => setAssets(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="settings-status">Status</Label>
            <Select
              value={status}
              onValueChange={v => setStatus(v as typeof status)}
            >
              <SelectTrigger id="settings-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">
                  Suspended (no handing in for now)
                </SelectItem>
                <SelectItem value="completed">Ended (completed)</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-red-600"
              onClick={remove}
            >
              Delete project
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
