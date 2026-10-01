'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSupabase } from '@/components/session-provider';
import { DatabaseStatusBanner } from '@/components/database-status-banner';
import { errorMessage, toast } from '@/lib/toast';

export default function CreateAssignmentPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classId, setClassId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [points, setPoints] = useState('100');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchClasses = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user.id)
        .order('name');
      if (error) {
        toast.error(`Couldn't load your classes: ${error.message}`);
        return;
      }
      setClasses(data ?? []);
      // Preselect the class when coming from a class page (?class=<id>).
      const preselected = new URLSearchParams(window.location.search).get(
        'class'
      );
      if (preselected && data?.some(c => c.id === preselected)) {
        setClassId(preselected);
      }
    };

    fetchClasses();
  }, [supabase]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) {
      toast.error('Choose a class for this assignment.');
      return;
    }
    const pointsPossible = Number(points);
    if (!Number.isInteger(pointsPossible) || pointsPossible < 0) {
      toast.error('Points must be a whole number of 0 or more.');
      return;
    }
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Your session has expired. Please sign in again.');
        return;
      }

      const { error } = await supabase.from('assignments').insert({
        title,
        description,
        class_id: classId,
        due_date: new Date(dueDate).toISOString(),
        teacher_id: user.id,
        points_possible: pointsPossible,
        // Students in the class can see assignments as soon as they exist,
        // so record them as published rather than as a draft.
        status: 'published',
      });

      if (error) {
        toast.error(`Couldn't create the assignment: ${error.message}`);
        return;
      }
      toast.success('Assignment created.');
      router.push('/dashboard/teacher/assignments');
    } catch (error) {
      toast.error(`Couldn't create the assignment: ${errorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <DatabaseStatusBanner />
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Create a New Assignment</CardTitle>
          <CardDescription>
            Fill out the details below to create a new assignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateAssignment} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g., Cell Structure Lab Report"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="e.g., A report on the structure of a cell."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class">Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      You don&apos;t have any classes yet.
                    </div>
                  )}
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
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
                min={0}
                step={1}
                value={points}
                onChange={e => setPoints(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating Assignment...' : 'Create Assignment'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
