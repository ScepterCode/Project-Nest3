'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { STAGE_LABELS } from '@/components/portfolio/learner-portfolio';
import { formatDate, platformRpc } from '@/lib/platform/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

interface Nomination {
  id: string;
  student_id: string;
  student_name: string;
  school_name: string | null;
  current_stage: keyof typeof STAGE_LABELS;
  target_stage: keyof typeof STAGE_LABELS;
  consent_status: 'not_recorded' | 'granted' | 'withdrawn';
  nominated_by_name: string | null;
  reason: string;
  status: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  submissions: number;
  average_grade: number | null;
  attendance_rate: number | null;
  revision_rounds: number;
}

const CONSENT = {
  granted: { label: 'Consent granted', variant: 'secondary' as const },
  not_recorded: {
    label: 'Consent not recorded',
    variant: 'destructive' as const,
  },
  withdrawn: { label: 'Consent withdrawn', variant: 'destructive' as const },
};

export default function PlatformNominationsPage() {
  const [status, setStatus] = useState('pending');
  const [nominations, setNominations] = useState<Nomination[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setNominations(null);
    platformRpc<Nomination[]>('platform_nominations', {
      p_status: status === 'all' ? null : status,
    })
      .then(rows => setNominations(rows ?? []))
      .catch(e => toast.error(errorMessage(e, 'Could not load nominations')));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (n: Nomination, approve: boolean) => {
    const ok = await confirmAction({
      title: `${approve ? 'Approve' : 'Decline'} ${n.student_name} for ${STAGE_LABELS[n.target_stage]}?`,
      description: approve
        ? 'They move to this stage and can join its groups. The learner and the tutor who nominated them are notified.'
        : 'The tutor who nominated them is notified, with your note.',
      confirmLabel: approve ? 'Approve' : 'Decline',
      destructive: !approve,
    });
    if (!ok) return;
    setBusy(n.id);
    try {
      await platformRpc('platform_review_nomination', {
        p_nomination: n.id,
        p_approve: approve,
        p_note: notes[n.id]?.trim() || null,
      });
      toast.success(approve ? 'Approved' : 'Declined');
      load();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not record the decision'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Nominations</CardTitle>
          <CardDescription>
            Tutors and school admins nominate learners for mentorship or the
            fellowship. Approval needs guardian consent on record.
          </CardDescription>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Waiting for review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!nominations ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : nominations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <ul className="divide-y">
            {nominations.map(n => (
              <li key={n.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/dashboard/portfolio/${n.student_id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {n.student_name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {n.school_name ?? 'No school'} ·{' '}
                      {STAGE_LABELS[n.current_stage]} →{' '}
                      {STAGE_LABELS[n.target_stage]} · nominated{' '}
                      {formatDate(n.created_at)}
                      {n.nominated_by_name ? ` by ${n.nominated_by_name}` : ''}
                    </p>
                  </div>
                  <Badge variant={CONSENT[n.consent_status].variant}>
                    {CONSENT[n.consent_status].label}
                  </Badge>
                </div>
                <p className="text-sm">{n.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {Number(n.submissions)} pieces of work · average grade{' '}
                  {n.average_grade === null ? '—' : `${n.average_grade}%`} ·
                  attendance{' '}
                  {n.attendance_rate === null ? '—' : `${n.attendance_rate}%`} ·{' '}
                  {Number(n.revision_rounds)} revision rounds
                </p>
                {n.status === 'pending' ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={2}
                      placeholder="Note for the tutor (optional)"
                      value={notes[n.id] ?? ''}
                      onChange={e =>
                        setNotes(prev => ({ ...prev, [n.id]: e.target.value }))
                      }
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => decide(n, true)}
                        disabled={
                          busy === n.id || n.consent_status !== 'granted'
                        }
                        title={
                          n.consent_status !== 'granted'
                            ? 'Record guardian consent on their portfolio first'
                            : undefined
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(n, false)}
                        disabled={busy === n.id}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {n.status} {formatDate(n.reviewed_at)}
                    {n.review_note ? ` · ${n.review_note}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
