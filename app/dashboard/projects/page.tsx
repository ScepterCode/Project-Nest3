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
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
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

  // Groups this person can start projects in (their own as a mentor; every
  // group for platform admins), and what to say when there is nothing.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .rpc('project_groups')
      .then(({ data }) => setGroups((data as ProjectGroup[]) ?? []));
    supabase
      .rpc('my_project_access')
      .then(({ data }) => setAccess((data as ProjectAccess) ?? null));
  }, [user]);

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
          Production projects
        </h1>
        <p className="text-sm text-muted-foreground">
          Team projects for the mentorship and fellowship stages. Keep the files
          on Google Drive, YouTube or Vimeo; hand in each version here as a
          link, and the mentor approves it or asks for changes.
        </p>
      </div>

      {groups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start a project</CardTitle>
            <CardDescription>
              {access?.platform_admin
                ? 'For any mentorship or fellowship group; its mentor runs it with you.'
                : 'For one of your mentorship or fellowship groups.'}{' '}
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
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                        {access?.platform_admin && g.mentor_name
                          ? ` (mentor ${g.mentor_name})`
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
            <EmptyProjects access={access} groups={groups.length} />
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

interface ProjectGroup {
  id: string;
  name: string;
  cohort_stage: string;
  mentor_name: string | null;
  students: number;
}

interface ProjectAccess {
  role: string;
  is_mentor: boolean;
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
        ? 'No projects yet. Start one above for any mentorship or fellowship group.'
        : 'No mentorship or fellowship groups yet. Make a tutor a programme mentor (People), then they set one of their classes to a mentorship or fellowship group in its Settings → Group type. Projects are started in those groups.';
  } else if (access?.role === 'institution_admin') {
    text =
      'Projects your learners are on appear here. Programme mentors run them in mentorship and fellowship groups, so they start once your learners are selected for those stages.';
  } else if (access?.role === 'teacher') {
    text = !access.is_mentor
      ? 'Production projects are run by programme mentors in mentorship and fellowship groups. If you should be mentoring, ask the programme team to make you a mentor.'
      : groups > 0
        ? 'No projects yet. Start one above.'
        : "You're a programme mentor, but none of your classes is a mentorship or fellowship group yet. Open a class, go to Settings and set its Group type; then start a project here.";
  } else if (access?.role === 'student') {
    text =
      access.stage === 'foundation' || !access.stage
        ? 'Team projects start in the mentorship stage. Keep going: your tutor can nominate you.'
        : "No projects yet. When your mentor adds you to a project's team, it appears here.";
  }
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
