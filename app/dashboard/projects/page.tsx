'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clapperboard } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { errorMessage, toast } from '@/lib/toast';
import {
  ProgrammeGroup,
  ProgrammesCard,
  programmeLabel,
} from '@/components/projects/programmes-card';

interface ProjectRow {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'archived';
  class_name: string;
  cohort_stage: string;
  mentor_name: string | null;
  team_size: number;
  milestones: number;
  approved: number;
  waiting_review: number;
  next_due: string | null;
  i_mentor: boolean;
}

// Production projects (supabase/migrations/20261021120000_production_projects.sql):
// mentorship and fellowship teams work through milestones; files live on
// Drive/YouTube and each version is handed in as a link.
export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [groups, setGroups] = useState<ProgrammeGroup[]>([]);
  const [access, setAccess] = useState<ProjectAccess | null>(null);
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [assets, setAssets] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    createClient()
      .rpc('my_production_projects')
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setProjects(
          ((data as ProjectRow[]) ?? []).map(p => ({
            ...p,
            team_size: Number(p.team_size),
            milestones: Number(p.milestones),
            approved: Number(p.approved),
            waiting_review: Number(p.waiting_review),
          }))
        );
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Programmes this person can run projects in (their own as a mentor,
  // their school's for school admins, all for platform admins), and what to
  // say when there is nothing.
  const loadGroups = useCallback(() => {
    const supabase = createClient();
    supabase
      .rpc('project_groups')
      .then(({ data }) => setGroups((data as ProgrammeGroup[]) ?? []));
    supabase
      .rpc('my_project_access')
      .then(({ data }) => setAccess((data as ProjectAccess) ?? null));
  }, []);

  useEffect(() => {
    if (user) loadGroups();
  }, [user, loadGroups]);

  // Programmes this person can start projects in (school admins also see,
  // read-only, platform programmes their school takes part in).
  const runnable = groups.filter(g => g.can_run);
  const canStartProgrammes =
    !!access?.platform_admin || access?.role === 'institution_admin';

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId) {
      toast.error('Choose the group');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await createClient().rpc(
        'create_production_project',
        {
          p_class: groupId,
          p_title: title.trim(),
          p_brief: brief.trim() || null,
          p_assets_url: assets.trim() || null,
        }
      );
      if (error) throw error;
      router.push(`/dashboard/projects/${data}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the project'));
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Clapperboard className="h-6 w-6" />
          {canStartProgrammes ? 'Programmes & projects' : 'Production projects'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Team projects run in programmes. Keep the files on Google Drive,
          YouTube or Vimeo; hand in each version here as a link, and the mentor
          approves it or asks for changes.
        </p>
      </div>

      <ProgrammesCard
        groups={canStartProgrammes ? groups : []}
        canStart={canStartProgrammes}
        platformAdmin={!!access?.platform_admin}
        onCreated={loadGroups}
      />

      {runnable.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start a project</CardTitle>
            <CardDescription>
              {canStartProgrammes
                ? 'In one of the programmes above; its mentor runs it with you.'
                : 'In one of the programmes you mentor.'}{' '}
              You&apos;ll add the team and milestones next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="project-group">Group</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger id="project-group">
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {runnable.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} · {programmeLabel(g)}
                        {canStartProgrammes && g.mentor_name
                          ? ` · mentor ${g.mentor_name}`
                          : ''}{' '}
                        · {Number(g.students)} learners
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="project-title">Title</Label>
                <Input
                  id="project-title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={150}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="project-brief">Brief (optional)</Label>
                <Textarea
                  id="project-brief"
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  rows={3}
                  maxLength={4000}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="project-assets">
                  Shared folder for the files (optional)
                </Label>
                <Input
                  id="project-assets"
                  type="url"
                  value={assets}
                  onChange={e => setAssets(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={creating}>
                  {creating ? 'Starting…' : 'Start project'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {!projects ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : projects.length === 0 ? (
            <EmptyProjects access={access} groups={runnable.length} />
          ) : (
            <ul className="divide-y">
              {projects.map(p => (
                <li key={p.id} className="py-3">
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className="flex flex-wrap items-start justify-between gap-2"
                  >
                    <div>
                      <p className="font-medium underline-offset-4 hover:underline">
                        {p.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {p.class_name}
                        {p.mentor_name
                          ? ` · mentor ${p.mentor_name}`
                          : ''} · {p.team_size} on the team
                        {p.next_due
                          ? ` · next due ${new Date(p.next_due).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {p.i_mentor && p.waiting_review > 0 && (
                        <Badge variant="destructive">
                          {p.waiting_review} to review
                        </Badge>
                      )}
                      <span className="text-muted-foreground">
                        {p.approved}/{p.milestones} milestones approved
                      </span>
                      {p.status !== 'active' && (
                        <Badge variant="secondary" className="capitalize">
                          {p.status}
                        </Badge>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ProjectAccess {
  role: string;
  is_mentor: boolean;
  school_mentor: boolean;
  platform_admin: boolean;
  stage: string | null;
  groups: number;
}

/** Says why there is nothing here yet, and what would change that. */
function EmptyProjects({
  access,
  groups,
}: {
  access: ProjectAccess | null;
  groups: number;
}) {
  let text = 'No projects yet.';
  if (access?.platform_admin) {
    text =
      groups > 0
        ? 'No projects yet. Start one above in any programme.'
        : 'No programmes yet. Start one above: a school programme, or a mentorship or fellowship programme for every school.';
  } else if (access?.role === 'institution_admin') {
    text =
      groups > 0
        ? "No projects yet. Start one above in one of your school's programmes. Projects your learners join in cross-school programmes also appear here."
        : "No programmes yet. Start one above and pick the teacher who'll run it; learners join with its code.";
  } else if (access?.role === 'teacher') {
    text = !access.is_mentor
      ? 'Production projects run in programmes. Your school admin can start a programme with you as its mentor, or make you a mentor from the Users page.'
      : groups > 0
        ? 'No projects yet. Start one above.'
        : "You're a mentor, but you don't run a programme yet. Your school admin can start one with you as its mentor.";
  } else if (access?.role === 'student') {
    text =
      access.stage === 'foundation' || !access.stage
        ? 'Team projects start in the mentorship stage. Keep going: your tutor can nominate you.'
        : "No projects yet. When your mentor adds you to a project's team, it appears here.";
  }
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
