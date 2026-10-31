'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, FileText, GraduationCap, Link2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { LearnerHomeData, when } from '@/lib/home';
import { formatBytes } from '@/lib/materials';
import { AttentionEntry, AttentionList } from '@/components/ui/attention-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgrammeLine } from './programme-line';

const STAGES = ['foundation', 'mentorship', 'fellowship'] as const;
const STAGE_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  mentorship: 'Mentorship',
  fellowship: 'Fellowship',
};

/** Foundation → Mentorship → Fellowship, with where the learner is now. */
function StageSteps({ stage }: { stage: LearnerHomeData['stage'] }) {
  const current = stage === 'alumni' ? STAGES.length : STAGES.indexOf(stage);
  return (
    <ol aria-label="Your stage" className="flex items-center gap-2 text-sm">
      {STAGES.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
          <span
            aria-current={i === current ? 'step' : undefined}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 ${
              i === current
                ? 'bg-primary font-medium text-primary-foreground'
                : i < current
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground'
            }`}
          >
            {i < current && <Check className="h-3.5 w-3.5" aria-hidden />}
            {STAGE_LABELS[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TwoLines({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="block">
      <span className="block font-medium">{title}</span>
      <span className="block text-muted-foreground">{detail}</span>
    </span>
  );
}

/** Work waiting on the learner: revisions first, then reviews, then missed. */
function attentionFor(data: LearnerHomeData): AttentionEntry[] {
  const due = (iso: string | null) => (iso ? ` Due ${when(iso)}.` : '');
  return [
    ...data.revisions.map(r => ({
      key: `revise-${r.assignment_id}`,
      tone: 'warn' as const,
      href: `/dashboard/student/assignments/${r.assignment_id}`,
      content: (
        <TwoLines
          title={`Revise "${r.title}"`}
          detail={`${
            r.feedback
              ? `Your tutor asked for changes: "${r.feedback}"`
              : 'Your tutor asked for changes.'
          }${due(r.due_date)}`}
        />
      ),
    })),
    ...data.peer_reviews.map(p => ({
      key: `review-${p.peer_review_assignment_id}`,
      tone: 'warn' as const,
      href: `/dashboard/student/peer-reviews/${p.peer_review_assignment_id}/review/${p.first_review_id}`,
      content: (
        <TwoLines
          title={`Review ${p.count === 1 ? '1 classmate' : `${p.count} classmates`}`}
          detail={`${p.title}${p.anonymous ? ', anonymous' : ''}.${due(p.end_date)}`}
        />
      ),
    })),
    ...data.missed.map(m => ({
      key: `missed-${m.assignment_id}`,
      tone: 'info' as const,
      href: `/dashboard/student/assignments/${m.assignment_id}`,
      content: (
        <TwoLines
          title={`"${m.title}" wasn't handed in`}
          detail={`${m.class_name}. It was due ${when(m.due_date)}.`}
        />
      ),
    })),
  ];
}

export function LearnerHome() {
  const { getUserDisplayName } = useAuth();
  const [data, setData] = useState<LearnerHomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc('my_learner_home')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setData(data as LearnerHomeData);
      });
  }, []);

  const firstName = (getUserDisplayName() || '').split(' ')[0];
  const fb = data?.latest_feedback;

  return (
    <div className="space-y-6">
      <div className="space-y-3 border-b pb-5">
        {data && data.programmes.length > 0 && (
          <ProgrammeLine programmes={data.programmes} />
        )}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">
          {firstName ? `Hi ${firstName}` : 'Hi'}
        </h1>
        {data && <StageSteps stage={data.stage} />}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Couldn&apos;t load your home page: {error}
        </p>
      )}

      {!data && !error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}

      {data && data.class_count === 0 && (
        <EmptyState
          icon={<GraduationCap />}
          title="Join your first class"
          description="Your tutor will give you a class code. Once you've joined, your work and feedback show up here."
          action={
            <Button asChild>
              <Link href="/dashboard/student/classes/join">Enter a code</Link>
            </Button>
          }
        />
      )}

      {data && data.class_count > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Needs you</CardTitle>
            </CardHeader>
            <CardContent>
              <AttentionList
                items={attentionFor(data)}
                allClear="You're up to date. Nothing is waiting on you."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-baseline justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Coming up</CardTitle>
              <Link
                href="/dashboard/student/assignments"
                className="text-sm text-primary hover:underline"
              >
                All work
              </Link>
            </CardHeader>
            <CardContent>
              {data.coming_up.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing due right now.
                </p>
              ) : (
                <ul className="-mx-3 divide-y text-sm">
                  {data.coming_up.map(w => (
                    <li key={w.assignment_id}>
                      <Link
                        href={`/dashboard/student/assignments/${w.assignment_id}`}
                        className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {w.title}
                          </span>
                          <span className="block truncate text-muted-foreground">
                            {w.class_name}
                            {w.started && ' · started'}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {when(w.due_date)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-baseline justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Latest feedback</CardTitle>
              {fb && fb.grade !== null && (
                <span className="font-mono text-sm tabular-nums">
                  {fb.grade}/{fb.points_possible ?? '—'}
                </span>
              )}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!fb ? (
                <p className="text-muted-foreground">
                  When your tutor marks your work, their feedback shows up here.
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {fb.title}
                    </span>
                    {fb.marked_by && ` · marked by ${fb.marked_by}`}
                  </p>
                  {fb.feedback && (
                    <blockquote className="border-l-2 border-primary pl-3">
                      {fb.feedback}
                    </blockquote>
                  )}
                  <Link
                    href={`/dashboard/student/grades/${fb.assignment_id}`}
                    className="inline-block text-primary hover:underline"
                  >
                    See all the feedback →
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          {data.new_materials.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">New in your classes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="-mx-3 divide-y text-sm">
                  {data.new_materials.map(m => (
                    <li key={m.id}>
                      <Link
                        href={`/dashboard/student/classes/${m.class_id}?tab=materials`}
                        className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted"
                      >
                        <span className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
                          {m.kind === 'link' ? <Link2 /> : <FileText />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {m.title}
                            {m.kind === 'file' && m.file_size !== null && (
                              <span className="font-normal text-muted-foreground">
                                {' '}
                                ({formatBytes(m.file_size)})
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-muted-foreground">
                            {m.class_name} · {when(m.created_at)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
