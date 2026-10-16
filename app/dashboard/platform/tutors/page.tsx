'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  TutorMetrics,
  TutorMetricsTable,
  toTutorMetrics,
} from '@/components/delivery/tutor-metrics-table';
import { platformRpc } from '@/lib/platform/client';

export default function PlatformTutorsPage() {
  const [tutors, setTutors] = useState<TutorMetrics[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  useEffect(() => {
    platformRpc<Record<string, unknown>[]>('platform_tutor_metrics')
      .then(rows => setTutors((rows ?? []).map(toTutorMetrics)))
      .catch(e => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (tutors ?? []).filter(
      t =>
        (!flaggedOnly || t.flags.length > 0) &&
        (!term ||
          (t.teacher_name ?? '').toLowerCase().includes(term) ||
          t.teacher_email.toLowerCase().includes(term) ||
          (t.school_name ?? '').toLowerCase().includes(term))
    );
  }, [tutors, filter, flaggedOnly]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!tutors) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const flagged = tutors.filter(t => t.flags.length > 0).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tutor delivery</CardTitle>
        <CardDescription>
          {tutors.length} tutors · {flagged} need attention. Sessions and
          attendance come from what tutors log on each class&apos;s Sessions
          tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Filter by tutor or school"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="max-w-xs"
            aria-label="Filter tutors"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={e => setFlaggedOnly(e.target.checked)}
            />
            Only tutors who need attention
          </label>
        </div>
        <TutorMetricsTable tutors={shown} showSchool />
      </CardContent>
    </Card>
  );
}
