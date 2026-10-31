'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { GraduationCap, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { greeting, TutorHomeData, waited, when } from '@/lib/home';
import { turnaroundText } from '@/components/delivery/tutor-metrics-table';
import { AttentionEntry, AttentionList } from '@/components/ui/attention-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeading } from '@/components/ui/page-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgrammeLine } from './programme-line';

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const percent = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`);

/** What needs the tutor, in the order they'd act on it. */
function attentionFor(data: TutorHomeData): AttentionEntry[] {
  const items: AttentionEntry[] = [];
  const oldest = data.queue[0];
  if (data.to_mark > 0 && oldest) {
    const days = waited(data.oldest_waiting);
    items.push({
      key: 'marking',
      tone: data.delivery?.overdue_reviews ? 'warn' : 'info',
      href: `/dashboard/teacher/assignments/${oldest.assignment_id}/grade-submissions`,
      content: (
        <>
          <strong>{plural(data.to_mark, 'piece', 'pieces')} to mark.</strong>{' '}
          {days === 'today'
            ? 'The oldest came in today.'
            : `The oldest has waited ${days}.`}
        </>
      ),
    });
  }
  for (const r of data.join_requests) {
    items.push({
      key: `join-${r.class_id}`,
      tone: 'warn',
      href: `/dashboard/teacher/classes/${r.class_id}/manage?tab=students`,
      content: (
        <>
          <strong>
            {plural(r.count, 'learner is', 'learners are')} asking to join
          </strong>{' '}
          {r.class_name}.
        </>
      ),
    });
  }
  for (const s of data.unregistered_sessions) {
    const day = when(s.held_on);
    items.push({
      key: `register-${s.session_id}`,
      tone: 'warn',
      href: `/dashboard/teacher/classes/${s.class_id}/manage?tab=sessions`,
      content: (
        <>
          <strong>
            {day === 'today' ? "Today's" : `${day}'s`} session for{' '}
            {s.class_name}
          </strong>{' '}
          has no register yet.
        </>
      ),
    });
  }
  const flags = data.delivery?.flags ?? [];
  if (flags.includes('little_feedback')) {
    items.push({
      key: 'flag-feedback',
      tone: 'info',
      href: '/dashboard/teacher/assignments',
      content: (
        <>
          <strong>Your school can see a flag:</strong> written feedback on{' '}
          {percent(data.delivery?.feedback_rate ?? null)} of marked work. Most
          work should get a comment.
        </>
      ),
    });
  }
  if (flags.includes('no_recent_sessions')) {
    items.push({
      key: 'flag-sessions',
      tone: 'info',
      href: '/dashboard/teacher/classes',
      content: (
        <>
          <strong>Your school can see a flag:</strong> no session logged in the
          last 14 days.
        </>
      ),
    });
  }
  if (flags.includes('low_attendance')) {
    items.push({
      key: 'flag-attendance',
      tone: 'info',
      href: '/dashboard/teacher/classes',
      content: (
        <>
          <strong>Your school can see a flag:</strong> attendance is{' '}
          {percent(data.delivery?.attendance_rate ?? null)}.
        </>
      ),
    });
  }
  return items;
}

export function TutorHome() {
  const { getUserDisplayName } = useAuth();
  const [data, setData] = useState<TutorHomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc('my_tutor_home')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setData(data as TutorHomeData);
      });
  }, []);

  const firstName = (getUserDisplayName() || '').split(' ')[0];
  const now = new Date();

  return (
    <div className="space-y-6">
      {data && data.programmes.length > 0 && (
        <ProgrammeLine programmes={data.programmes} />
      )}
      <PageHeading
        eyebrow={format(now, 'EEEE d MMMM')}
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        actions={
          <>
            <Button asChild>
              <Link href="/dashboard/teacher/assignments/create">
                <Plus className="h-4 w-4" />
                New assignment
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={
                  data?.classes.length === 1
                    ? `/dashboard/teacher/classes/${data.classes[0]?.id}/manage?tab=sessions`
                    : '/dashboard/teacher/classes'
                }
              >
                Log a session
              </Link>
            </Button>
          </>
        }
      />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Couldn&apos;t load your home page: {error}
        </p>
      )}

      {!data && !error && <TutorHomeSkeleton />}

      {data && data.classes.length === 0 && (
        <EmptyState
          icon={<GraduationCap />}
          title="You don't have a class yet"
          description="Create a class and share its join code with your learners. What needs you will show up here."
          action={
            <Button asChild>
              <Link href="/dashboard/teacher/classes/create">
                Create a class
              </Link>
            </Button>
          }
        />
      )}

      {data && data.classes.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Needs you</CardTitle>
              </CardHeader>
              <CardContent>
                <AttentionList
                  items={attentionFor(data)}
                  allClear="All clear. Nothing is waiting for you."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-baseline justify-between space-y-0 pb-2">
                <CardTitle className="text-base">
                  Marking queue, oldest first
                </CardTitle>
                <Link
                  href="/dashboard/teacher/assignments"
                  className="text-sm text-primary hover:underline"
                >
                  All assignments
                </Link>
              </CardHeader>
              <CardContent>
                {data.queue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing to mark. New work will appear here.
                  </p>
                ) : (
                  <ul className="-mx-3 divide-y text-sm">
                    <li className="hidden grid-cols-[1fr_1.5fr_6rem_5rem] gap-3 px-3 pb-2 text-xs text-muted-foreground md:grid">
                      <span>Learner</span>
                      <span>Assignment</span>
                      <span>Round</span>
                      <span className="text-right">Waiting</span>
                    </li>
                    {data.queue.map(q => (
                      <li key={q.submission_id}>
                        <Link
                          href={`/dashboard/teacher/assignments/${q.assignment_id}/grade-submissions`}
                          className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md px-3 py-2.5 hover:bg-muted md:grid-cols-[1fr_1.5fr_6rem_5rem] md:items-center"
                        >
                          <span className="font-medium">
                            {q.learner ?? 'A learner'}
                          </span>
                          <span className="text-right font-mono text-xs tabular-nums text-muted-foreground md:hidden">
                            {waited(q.submitted_at)}
                          </span>
                          <span className="col-span-2 truncate text-muted-foreground md:col-span-1 md:text-foreground">
                            {q.assignment}
                            <span className="text-muted-foreground">
                              {' '}
                              · {q.class_name}
                            </span>
                          </span>
                          <span className="hidden text-muted-foreground md:block">
                            {q.round === 1
                              ? 'First'
                              : `Revision ${q.round - 1}`}
                          </span>
                          <span className="hidden text-right font-mono text-xs tabular-nums md:block">
                            {waited(q.submitted_at)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {data.delivery && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Your delivery</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <dl className="divide-y text-sm">
                    {[
                      [
                        'Sessions, last 30 days',
                        String(data.delivery.sessions_30d),
                      ],
                      ['Attendance', percent(data.delivery.attendance_rate)],
                      [
                        'Average time to mark',
                        turnaroundText(data.delivery.avg_turnaround_hours),
                      ],
                      [
                        'Written feedback',
                        percent(data.delivery.feedback_rate),
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-baseline justify-between py-2"
                      >
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Your school admin sees the same figures.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-baseline justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Your classes</CardTitle>
                <Link
                  href="/dashboard/teacher/classes"
                  className="text-sm text-primary hover:underline"
                >
                  All
                </Link>
              </CardHeader>
              <CardContent>
                <ul className="-mx-3 divide-y text-sm">
                  {data.classes.map(c => (
                    <li key={c.id}>
                      <Link
                        href={`/dashboard/teacher/classes/${c.id}`}
                        className="block rounded-md px-3 py-2.5 hover:bg-muted"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {c.code}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          {plural(c.learners, 'learner', 'learners')} ·{' '}
                          {c.next_due
                            ? `${c.next_due.title} due ${when(c.next_due.due_date)}`
                            : 'Nothing due'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function TutorHomeSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
      <div className="space-y-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
