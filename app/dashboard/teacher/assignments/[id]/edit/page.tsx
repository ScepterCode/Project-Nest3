'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
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
import { useSupabase } from '@/components/session-provider';
import { errorMessage, toast } from '@/lib/toast';

/** An ISO time as the value a datetime-local input expects (local time). */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useSupabase();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(
    'loading'
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [points, setPoints] = useState('');
  const [className, setClassName] = useState('');
  const [highestGrade, setHighestGrade] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: a, error } = await supabase
        .from('assignments')
        .select('id, title, description, due_date, points_possible, class_id')
        .eq('id', id)
        .maybeSingle();
      if (error || !a) {
        if (error)
          toast.error(`Couldn't load the assignment: ${error.message}`);
        setState('missing');
        return;
      }
      setTitle(a.title ?? '');
      setDescription(a.description ?? '');
      setDueDate(toLocalInput(a.due_date));
      setPoints(String(a.points_possible ?? 100));

      const [{ data: cls }, { data: graded }] = await Promise.all([
        supabase
          .from('classes')
          .select('name')
          .eq('id', a.class_id)
          .maybeSingle(),
        supabase
          .from('submissions')
          .select('grade')
          .eq('assignment_id', id)
          .not('grade', 'is', null)
          .order('grade', { ascending: false })
          .limit(1),
      ]);
      setClassName(cls?.name ?? '');
      setHighestGrade(graded?.[0]?.grade ?? null);
      setState('ready');
    })();
  }, [id, supabase]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const pointsPossible = Number(points);
    if (!title.trim()) {
      toast.error('Give the assignment a title.');
      return;
    }
    if (!dueDate) {
      toast.error('Choose a due date.');
      return;
    }
    if (!Number.isInteger(pointsPossible) || pointsPossible < 0) {
      toast.error('Points must be a whole number of 0 or more.');
      return;
    }
    if (highestGrade !== null && pointsPossible < highestGrade) {
      toast.error(
        `A learner already has ${highestGrade} points, so points possible can't be lower than that.`
      );
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('assignments')
        .update({
          title: title.trim(),
          description,
          due_date: new Date(dueDate).toISOString(),
          points_possible: pointsPossible,
        })
        .eq('id', id)
        .select('id');
      if (error) {
        toast.error(`Couldn't save the changes: ${error.message}`);
        return;
      }
      if (!data?.length) {
        toast.error('Only the tutor of this class can edit this assignment.');
        return;
      }
      toast.success('Assignment updated.');
      router.push(`/dashboard/teacher/assignments/${id}`);
    } catch (err) {
      toast.error(`Couldn't save the changes: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const back = (
    <Link
      href={`/dashboard/teacher/assignments/${id}`}
      className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="mr-1 h-4 w-4" />
      Back to the assignment
    </Link>
  );

  if (state === 'loading') {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (state === 'missing') {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link
          href="/dashboard/teacher/assignments"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to assignments
        </Link>
        <p>This assignment doesn&apos;t exist or isn&apos;t yours to edit.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      {back}
      <Card>
        <CardHeader>
          <CardTitle>Edit assignment</CardTitle>
          <CardDescription>
            {className ? `${className} · ` : ''}Learners see the changes
            straight away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date</Label>
              <Input
                id="dueDate"
                type="datetime-local"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="points">Points possible</Label>
              <Input
                id="points"
                type="number"
                min={highestGrade ?? 0}
                step={1}
                value={points}
                onChange={e => setPoints(e.target.value)}
                required
              />
              {highestGrade !== null && (
                <p className="text-xs text-muted-foreground">
                  The highest grade given so far is {highestGrade}, so this
                  can&apos;t go below that.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(`/dashboard/teacher/assignments/${id}`)
                }
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
