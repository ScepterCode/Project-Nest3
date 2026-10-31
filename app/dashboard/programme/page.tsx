'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { turnaroundText } from '@/components/delivery/tutor-metrics-table';
import {
  PlatformOverview,
  platformRpc,
  sinceText,
} from '@/lib/platform/client';
import { Stat } from '@/components/ui/stat';

interface SchoolRow {
  school_id: string;
  school_name: string;
  status: string;
  institution_type: string | null;
  teachers: number;
  students: number;
  classes: number;
  assignments: number;
  submissions: number;
  average_grade: number | null;
  sessions_30d: number;
  attendance_rate: number | null;
  avg_turnaround_hours: number | null;
  overdue_reviews: number;
  missed_deadlines: number;
  tutors_flagged: number;
  last_activity: string | null;
}

const NUMERIC: (keyof SchoolRow)[] = [
  'teachers',
  'students',
  'classes',
  'assignments',
  'submissions',
  'sessions_30d',
  'overdue_reviews',
  'missed_deadlines',
  'tutors_flagged',
];

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

export default function ProgrammePage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      platformRpc<PlatformOverview>('programme_overview'),
      platformRpc<Record<string, unknown>[]>('programme_schools'),
    ])
      .then(([o, rows]) => {
        setOverview(o);
        setSchools(
          (rows ?? []).map(r => {
            const row = { ...(r as unknown as SchoolRow) };
            for (const k of NUMERIC) (row[k] as unknown) = Number(r[k] ?? 0);
            for (const k of [
              'average_grade',
              'attendance_rate',
              'avg_turnaround_hours',
            ] as const) {
              row[k] =
                r[k] === null || r[k] === undefined ? null : Number(r[k]);
            }
            return row;
          })
        );
      })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!overview)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Schools"
          value={overview.schools}
          hint={`${overview.active_schools} active`}
        />
        <Stat label="Tutors" value={overview.teachers} />
        <Stat label="Learners" value={overview.students} />
        <Stat
          label="Active people"
          value={overview.active_7d}
          hint={`last 7 days · ${overview.active_30d} in 30`}
        />
        <Stat label="Classes" value={overview.classes} />
        <Stat label="Assignments" value={overview.assignments} />
        <Stat label="Submissions" value={overview.submissions} />
        <Stat
          label="Sessions (30 days)"
          value={schools.reduce((n, s) => n + s.sessions_30d, 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schools</CardTitle>
          <CardDescription>
            Results and delivery per school. &ldquo;Tutors flagged&rdquo; counts
            tutors with no recent sessions, overdue reviews, little written
            feedback or low attendance.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {schools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schools yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-normal">School</th>
                  <th className="py-2 pr-3 font-normal">Tutors / learners</th>
                  <th className="py-2 pr-3 font-normal">Sessions (30 days)</th>
                  <th className="py-2 pr-3 font-normal">Attendance</th>
                  <th className="py-2 pr-3 font-normal">Average grade</th>
                  <th className="py-2 pr-3 font-normal">Marking time</th>
                  <th className="py-2 pr-3 font-normal">Overdue reviews</th>
                  <th className="py-2 pr-3 font-normal">Missed deadlines</th>
                  <th className="py-2 pr-3 font-normal">Tutors flagged</th>
                  <th className="py-2 font-normal">Last work in</th>
                </tr>
              </thead>
              <tbody>
                {schools.map(s => (
                  <tr key={s.school_id} className="border-t">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{s.school_name}</p>
                      {s.status !== 'active' && (
                        <p className="text-xs text-red-600">Suspended</p>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {s.teachers} / {s.students}
                    </td>
                    <td className="py-2 pr-3">{s.sessions_30d}</td>
                    <td className="py-2 pr-3">{pct(s.attendance_rate)}</td>
                    <td className="py-2 pr-3">{pct(s.average_grade)}</td>
                    <td className="py-2 pr-3">
                      {turnaroundText(s.avg_turnaround_hours)}
                    </td>
                    <td
                      className={`py-2 pr-3 ${s.overdue_reviews > 0 ? 'text-red-600' : ''}`}
                    >
                      {s.overdue_reviews}
                    </td>
                    <td className="py-2 pr-3">{s.missed_deadlines}</td>
                    <td
                      className={`py-2 pr-3 ${s.tutors_flagged > 0 ? 'text-amber-700' : ''}`}
                    >
                      {s.tutors_flagged}
                    </td>
                    <td className="py-2">{sinceText(s.last_activity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
