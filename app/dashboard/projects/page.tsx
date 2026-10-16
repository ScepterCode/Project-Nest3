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
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
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

  // Mentorship/fellowship groups this person runs: they can start projects.
  useEffect(() => {
    if (!user) return;
    createClient()
      .from('classes')
      .select('id, name')
      .eq('teacher_id', user.id)
      .not('cohort_stage', 'is', null)
      .order('name')
      .then(({ data }) => setGroups(data ?? []));
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
              For one of your mentorship or fellowship groups. You&apos;ll add
              the team and milestones next.
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
            <p className="text-sm text-muted-foreground">
              No projects yet. Team projects start in the mentorship stage.
            </p>
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
