'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { createClient } from '@/lib/supabase/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export const ATTENDANCE: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
];

interface Student {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
}

interface Session {
  id: string;
  held_on: string;
  topic: string;
  notes: string | null;
  session_attendance: { student_id: string; status: AttendanceStatus }[];
}

interface Draft {
  id: string | null;
  held_on: string;
  topic: string;
  notes: string;
  marks: Record<string, AttendanceStatus>;
}

const today = () => new Date().toISOString().slice(0, 10);
const name = (s: Student) =>
  `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email;

/** Attendance counts for one session, e.g. "12 present · 1 late · 2 absent". */
export function attendanceSummary(marks: { status: AttendanceStatus }[]) {
  const counts = ATTENDANCE.map(
    a =>
      [
        a.label.toLowerCase(),
        marks.filter(m => m.status === a.value).length,
      ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${label}`);
  return counts.length ? counts.join(' · ') : 'No attendance marked';
}

/** A class's sessions with attendance. The class's tutor logs and edits them. */
export function ClassSessions({
  classId,
  students,
}: {
  classId: string;
  students: Student[];
}) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from('class_sessions')
      .select(
        'id, held_on, topic, notes, session_attendance(student_id, status)'
      )
      .eq('class_id', classId)
      .order('held_on', { ascending: false });
    if (error) {
      toast.error(errorMessage(error, 'Could not load sessions'));
      setSessions([]);
    } else {
      setSessions((data as Session[]) ?? []);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () =>
    setDraft({
      id: null,
      held_on: today(),
      topic: '',
      notes: '',
      marks: Object.fromEntries(
        students.map(s => [s.id, 'present' as AttendanceStatus])
      ),
    });

  const startEdit = (session: Session) =>
    setDraft({
      id: session.id,
      held_on: session.held_on,
      topic: session.topic,
      notes: session.notes ?? '',
      marks: Object.fromEntries(
        students.map(s => [
          s.id,
          session.session_attendance.find(a => a.student_id === s.id)?.status ??
            'present',
        ])
      ),
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.topic.trim()) {
      toast.error('Add the session topic');
      return;
    }
    const supabase = createClient();
    setSaving(true);
    let createdId: string | null = null;
    try {
      const fields = {
        held_on: draft.held_on,
        topic: draft.topic.trim(),
        notes: draft.notes.trim() || null,
      };
      let sessionId = draft.id;
      if (sessionId) {
        const { error } = await supabase
          .from('class_sessions')
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('id', sessionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('class_sessions')
          .insert({ ...fields, class_id: classId })
          .select('id')
          .single();
        if (error) throw error;
        sessionId = createdId = data.id;
      }
      if (students.length > 0) {
        const { error } = await supabase.from('session_attendance').upsert(
          students.map(s => ({
            session_id: sessionId,
            student_id: s.id,
            status: draft.marks[s.id] ?? 'present',
            recorded_at: new Date().toISOString(),
          })),
          { onConflict: 'session_id,student_id' }
        );
        if (error) throw error;
      }
      toast.success(draft.id ? 'Session updated' : 'Session logged');
      setDraft(null);
      load();
    } catch (err) {
      if (createdId)
        await supabase.from('class_sessions').delete().eq('id', createdId);
      toast.error(errorMessage(err, 'Could not save the session'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (session: Session) => {
    const ok = await confirmAction({
      title: `Delete the session "${session.topic}"?`,
      description: 'Its attendance record is deleted too.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await createClient()
      .from('class_sessions')
      .delete()
      .eq('id', session.id);
    if (error) {
      toast.error(errorMessage(error, 'Could not delete the session'));
      return;
    }
    toast.success('Session deleted');
    load();
  };

  return (
    <div className="space-y-4">
      {!draft && (
        <div className="flex justify-end">
          <Button onClick={startNew}>
            <Plus className="mr-2 h-4 w-4" />
            Log a session
          </Button>
        </div>
      )}

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? 'Edit session' : 'Log a session'}
            </CardTitle>
            <CardDescription>
              Record what you taught and who was there.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="session-date">Date</Label>
                  <Input
                    id="session-date"
                    type="date"
                    value={draft.held_on}
                    max={today()}
                    onChange={e =>
                      setDraft({ ...draft, held_on: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="session-topic">Topic</Label>
                  <Input
                    id="session-topic"
                    placeholder="e.g. Week 3: squash and stretch"
                    value={draft.topic}
                    maxLength={200}
                    onChange={e =>
                      setDraft({ ...draft, topic: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-notes">
                  Notes{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="session-notes"
                  rows={2}
                  maxLength={2000}
                  value={draft.notes}
                  onChange={e => setDraft({ ...draft, notes: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Attendance</Label>
                  {students.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          marks: Object.fromEntries(
                            students.map(s => [
                              s.id,
                              'present' as AttendanceStatus,
                            ])
                          ),
                        })
                      }
                    >
                      Mark all present
                    </Button>
                  )}
                </div>
                {students.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No students in this class yet.
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {students.map(student => (
                      <li
                        key={student.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <span className="text-sm">{name(student)}</span>
                        <div
                          className="flex gap-1"
                          role="radiogroup"
                          aria-label={`Attendance for ${name(student)}`}
                        >
                          {ATTENDANCE.map(option => (
                            <Button
                              key={option.value}
                              type="button"
                              size="sm"
                              role="radio"
                              aria-checked={
                                draft.marks[student.id] === option.value
                              }
                              variant={
                                draft.marks[student.id] === option.value
                                  ? 'default'
                                  : 'outline'
                              }
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  marks: {
                                    ...draft.marks,
                                    [student.id]: option.value,
                                  },
                                })
                              }
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? 'Saving…'
                    : draft.id
                      ? 'Save changes'
                      : 'Save session'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {!sessions ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No sessions logged yet. Log each lesson so the school and programme
            can see delivery and attendance.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sessions.map(session => (
            <li key={session.id}>
              <Card>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="flex gap-3">
                    <CalendarCheck className="mt-0.5 h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium">{session.topic}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(
                          `${session.held_on}T00:00:00`
                        ).toLocaleDateString()}{' '}
                        · {attendanceSummary(session.session_attendance)}
                      </p>
                      {session.notes && (
                        <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
                          {session.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(session)}
                      aria-label={`Edit ${session.topic}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(session)}
                      aria-label={`Delete ${session.topic}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A student's own attendance in one class. */
export function MyAttendance({ classId }: { classId: string }) {
  const [marks, setMarks] = useState<
    { status: AttendanceStatus; held_on: string; topic: string }[] | null
  >(null);

  useEffect(() => {
    createClient()
      .from('session_attendance')
      .select('status, class_sessions!inner(class_id, held_on, topic)')
      .eq('class_sessions.class_id', classId)
      .then(({ data }) => {
        setMarks(
          (
            (data as unknown as {
              status: AttendanceStatus;
              class_sessions: { held_on: string; topic: string };
            }[]) ?? []
          )
            .map(r => ({
              status: r.status,
              held_on: r.class_sessions.held_on,
              topic: r.class_sessions.topic,
            }))
            .sort((a, b) => b.held_on.localeCompare(a.held_on))
        );
      });
  }, [classId]);

  if (!marks || marks.length === 0) return null;
  const counted = marks.filter(m => m.status !== 'excused');
  const attended = counted.filter(
    m => m.status === 'present' || m.status === 'late'
  ).length;

  return (
    <div>
      <h4 className="font-medium mb-2">Attendance</h4>
      <p className="text-sm text-gray-700">
        Attended {attended} of {counted.length} session
        {counted.length === 1 ? '' : 's'}
        {marks.length > counted.length
          ? ` (${marks.length - counted.length} excused)`
          : ''}
      </p>
    </div>
  );
}
