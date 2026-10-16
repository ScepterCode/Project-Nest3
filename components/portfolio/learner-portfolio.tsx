'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { useUserRole } from '@/lib/hooks/useUserRole';
import { createClient } from '@/lib/supabase/client';
import {
  getSubmissionFileUrl,
  submissionFileName,
} from '@/lib/storage/submission-files';
import { statusBadgeVariant, statusLabel } from '@/lib/submission-status';
import { errorMessage, toast } from '@/lib/toast';

// Data from learner_portfolio() (supabase/migrations/20261019120000_learner_journey.sql).
interface Portfolio {
  learner: {
    id: string;
    name: string | null;
    email: string;
    school: string | null;
    stage: Stage;
    consent_status: Consent;
    consent_note: string | null;
    consent_recorded_at: string | null;
    joined: string;
  };
  work: {
    submission_id: string;
    assignment: string;
    class: string;
    tutor_id: string;
    submitted_at: string | null;
    status: string;
    grade: number | null;
    points_possible: number;
    feedback: string | null;
    revision_count: number;
    link_url: string | null;
    file_url: string | null;
    featured: boolean;
  }[];
  attendance: { class: string; attended: number; counted: number }[];
  nominations: {
    id: string;
    target_stage: string;
    status: string;
    reason: string;
    review_note: string | null;
    created_at: string;
    nominated_by: string | null;
  }[];
}

type Stage = 'foundation' | 'mentorship' | 'fellowship' | 'alumni';
type Consent = 'not_recorded' | 'granted' | 'withdrawn';

export const STAGE_LABELS: Record<Stage, string> = {
  foundation: 'Foundation',
  mentorship: 'Mentorship',
  fellowship: 'Art Fellowship',
  alumni: 'Alumni',
};
const CONSENT_LABELS: Record<Consent, string> = {
  not_recorded: 'Guardian consent not recorded',
  granted: 'Guardian consent granted',
  withdrawn: 'Guardian consent withdrawn',
};
const NEXT_STAGES: Record<Stage, ('mentorship' | 'fellowship')[]> = {
  foundation: ['mentorship', 'fellowship'],
  mentorship: ['fellowship'],
  fellowship: [],
  alumni: [],
};

/** Average percentage over graded work, or null. */
export function averageGrade(work: Portfolio['work']) {
  const graded = work.filter(w => w.grade !== null && w.points_possible > 0);
  if (graded.length === 0) return null;
  return (
    Math.round(
      (graded.reduce(
        (n, w) => n + (100 * (w.grade as number)) / w.points_possible,
        0
      ) /
        graded.length) *
        10
    ) / 10
  );
}

export function LearnerPortfolio({ studentId }: { studentId: string }) {
  const { user } = useAuth();
  const { roleData } = useUserRole();
  const role = roleData?.role;
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await createClient().rpc(
      'learner_portfolio',
      { p_student: studentId }
    );
    if (rpcError) setError(rpcError.message);
    else setPortfolio(data as Portfolio);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!portfolio)
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const { learner, work, attendance, nominations } = portfolio;
  const isSelf = user?.id === learner.id;
  const canRecordConsent =
    role === 'institution_admin' || role === 'system_admin';
  const canNominate =
    !isSelf &&
    (role === 'teacher' ||
      role === 'institution_admin' ||
      role === 'system_admin');
  const featured = work.filter(w => w.featured);
  const avg = averageGrade(work);
  const attended = attendance.reduce((n, a) => n + Number(a.attended), 0);
  const counted = attendance.reduce((n, a) => n + Number(a.counted), 0);

  const openFile = async (fileUrl: string) => {
    try {
      window.open(
        await getSubmissionFileUrl(createClient(), fileUrl),
        '_blank',
        'noopener,noreferrer'
      );
    } catch (e) {
      toast.error(
        errorMessage(
          e,
          'Only the learner and their tutor can open uploaded files'
        )
      );
    }
  };

  const toggleFeatured = async (submissionId: string, value: boolean) => {
    const { error: updateError } = await createClient()
      .from('submissions')
      .update({ portfolio_featured: value })
      .eq('id', submissionId);
    if (updateError) {
      toast.error(errorMessage(updateError, 'Could not change it'));
      return;
    }
    toast.success(value ? 'Featured in the portfolio' : 'No longer featured');
    load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">
              {isSelf ? 'My portfolio' : (learner.name ?? learner.email)}
            </CardTitle>
            <CardDescription>
              {[
                learner.school,
                `on ProjectNest since ${new Date(learner.joined).toLocaleDateString()}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/portfolio/${learner.id}/summary`}>
                Progress summary
              </Link>
            </Button>
            <Badge>{STAGE_LABELS[learner.stage]}</Badge>
            {!isSelf && (
              <Badge
                variant={
                  learner.consent_status === 'granted' ? 'secondary' : 'outline'
                }
              >
                {CONSENT_LABELS[learner.consent_status]}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{work.length}</p>
            <p className="text-xs text-muted-foreground">pieces of work</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {avg === null ? '—' : `${avg}%`}
            </p>
            <p className="text-xs text-muted-foreground">average grade</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {counted ? `${attended}/${counted}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">sessions attended</p>
          </div>
        </CardContent>
      </Card>

      {featured.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-amber-500" />
              Featured work
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {featured.map(w => (
              <div key={w.submission_id} className="rounded-md border p-3">
                <p className="font-medium">{w.assignment}</p>
                <p className="text-xs text-muted-foreground">{w.class}</p>
                {w.link_url && (
                  <a
                    href={w.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-sm text-blue-700 underline-offset-4 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Watch
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All work</CardTitle>
        </CardHeader>
        <CardContent>
          {work.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing handed in yet.
            </p>
          ) : (
            <ul className="divide-y">
              {work.map(w => (
                <li key={w.submission_id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {w.assignment}
                        {w.featured && (
                          <Star
                            className="ml-1 inline h-4 w-4 text-amber-500"
                            aria-label="Featured"
                          />
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {w.class}
                        {w.submitted_at
                          ? ` · handed in ${new Date(w.submitted_at).toLocaleDateString()}`
                          : ''}
                        {w.revision_count > 0
                          ? ` · ${w.revision_count} revision${w.revision_count === 1 ? '' : 's'}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusBadgeVariant(w.status)}>
                        {w.status === 'graded' && w.grade !== null
                          ? `${w.grade}/${w.points_possible}`
                          : statusLabel(w.status)}
                      </Badge>
                      {w.tutor_id === user?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            toggleFeatured(w.submission_id, !w.featured)
                          }
                        >
                          {w.featured ? 'Unfeature' : 'Feature'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {w.feedback && (
                    <p className="whitespace-pre-line rounded bg-gray-50 p-2 text-sm text-gray-700">
                      {w.feedback}
                    </p>
                  )}
                  <div className="flex gap-3 text-sm">
                    {w.link_url && (
                      <a
                        href={w.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 underline-offset-4 hover:underline"
                      >
                        Open link
                      </a>
                    )}
                    {w.file_url && (
                      <button
                        type="button"
                        className="text-blue-700 underline-offset-4 hover:underline"
                        onClick={() => openFile(w.file_url as string)}
                      >
                        {submissionFileName(w.file_url)}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {attendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {attendance.map(a => (
                <li key={a.class}>
                  {a.class}: attended {a.attended} of {a.counted} session
                  {Number(a.counted) === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {canRecordConsent && <ConsentCard portfolio={portfolio} onSaved={load} />}
      {canNominate && <NominateCard portfolio={portfolio} onSaved={load} />}

      {nominations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progression</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {nominations.map(n => (
                <li key={n.id} className="py-2">
                  <p>
                    <span className="font-medium">
                      {STAGE_LABELS[n.target_stage as Stage] ?? n.target_stage}
                    </span>{' '}
                    nomination · {n.status}
                    <span className="text-muted-foreground">
                      {' '}
                      · {new Date(n.created_at).toLocaleDateString()}
                      {n.nominated_by ? ` by ${n.nominated_by}` : ''}
                    </span>
                  </p>
                  {!isSelf && <p className="text-gray-700">{n.reason}</p>}
                  {n.review_note && (
                    <p className="text-muted-foreground">
                      Reviewer: {n.review_note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ConsentCard({
  portfolio,
  onSaved,
}: {
  portfolio: Portfolio;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<Consent>(
    portfolio.learner.consent_status
  );
  const [note, setNote] = useState(portfolio.learner.consent_note ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await createClient().rpc('set_learner_consent', {
      p_student: portfolio.learner.id,
      p_status: status,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error, 'Could not record consent'));
      return;
    }
    toast.success('Consent recorded');
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Guardian consent</CardTitle>
        <CardDescription>
          Needed before this learner can progress to mentorship or the
          fellowship, or have work shown publicly.
          {portfolio.learner.consent_recorded_at &&
            ` Last recorded ${new Date(portfolio.learner.consent_recorded_at).toLocaleDateString()}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-xs space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={v => setStatus(v as Consent)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_recorded">Not recorded</SelectItem>
              <SelectItem value="granted">Granted</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="consent-note">Note (how and when it was given)</Label>
          <Textarea
            id="consent-note"
            rows={2}
            maxLength={500}
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save consent'}
        </Button>
      </CardContent>
    </Card>
  );
}

function NominateCard({
  portfolio,
  onSaved,
}: {
  portfolio: Portfolio;
  onSaved: () => void;
}) {
  const options = NEXT_STAGES[portfolio.learner.stage];
  const [stage, setStage] = useState<string>(options[0] ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = portfolio.nominations.some(n => n.status === 'pending');

  if (options.length === 0) return null;

  const nominate = async () => {
    setSaving(true);
    const { error } = await createClient().rpc('nominate_learner', {
      p_student: portfolio.learner.id,
      p_stage: stage,
      p_reason: reason,
    });
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error, 'Could not nominate'));
      return;
    }
    toast.success('Nominated. The programme team will review it.');
    setReason('');
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nominate for the next stage</CardTitle>
        <CardDescription>
          The programme team reviews nominations alongside the learner&apos;s
          work and attendance.
          {portfolio.learner.consent_status !== 'granted' &&
            ' Guardian consent must be recorded before they can be approved.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending ? (
          <p className="text-sm text-muted-foreground">
            A nomination is already waiting for review.
          </p>
        ) : (
          <>
            <div className="max-w-xs space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map(o => (
                    <SelectItem key={o} value={o}>
                      {STAGE_LABELS[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomination-reason">Why this learner?</Label>
              <Textarea
                id="nomination-reason"
                rows={3}
                maxLength={2000}
                placeholder="What they've shown in their work, effort and growth"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>
            <Button
              onClick={nominate}
              disabled={saving || reason.trim().length < 10}
            >
              {saving ? 'Sending…' : 'Nominate'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
