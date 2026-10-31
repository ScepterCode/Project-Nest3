'use client';

import { Badge } from '@/components/ui/badge';

// Rows from platform_tutor_metrics() / school_tutor_metrics()
// (supabase/migrations/20261018120000_sessions_attendance_and_delivery.sql).
export interface TutorMetrics {
  teacher_id: string;
  teacher_name: string | null;
  teacher_email: string;
  school_name: string | null;
  classes: number;
  students: number;
  sessions_30d: number;
  sessions_total: number;
  last_session: string | null;
  attendance_rate: number | null;
  assignments: number;
  submissions: number;
  graded: number;
  avg_turnaround_hours: number | null;
  awaiting_review: number;
  overdue_reviews: number;
  feedback_rate: number | null;
  missed_deadlines: number;
  flags: string[];
}

export const FLAG_LABELS: Record<string, string> = {
  no_recent_sessions: 'No session in 14 days',
  overdue_reviews: 'Reviews overdue',
  little_feedback: 'Little written feedback',
  low_attendance: 'Low attendance',
};

/** PostgREST returns bigint/numeric as strings. */
export function toTutorMetrics(row: Record<string, unknown>): TutorMetrics {
  const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  const maybe = (v: unknown) =>
    v === null || v === undefined ? null : Number(v);
  return {
    ...(row as unknown as TutorMetrics),
    classes: n(row.classes),
    students: n(row.students),
    sessions_30d: n(row.sessions_30d),
    sessions_total: n(row.sessions_total),
    attendance_rate: maybe(row.attendance_rate),
    assignments: n(row.assignments),
    submissions: n(row.submissions),
    graded: n(row.graded),
    avg_turnaround_hours: maybe(row.avg_turnaround_hours),
    awaiting_review: n(row.awaiting_review),
    overdue_reviews: n(row.overdue_reviews),
    feedback_rate: maybe(row.feedback_rate),
    missed_deadlines: n(row.missed_deadlines),
    flags: (row.flags as string[] | null) ?? [],
  };
}

/** "18 h" under two days, otherwise "3.5 days". */
export function turnaroundText(hours: number | null) {
  if (hours === null) return '—';
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1).replace(/\.0$/, '')} days`;
}

export function TutorMetricsTable({
  tutors,
  showSchool = false,
}: {
  tutors: TutorMetrics[];
  showSchool?: boolean;
}) {
  if (tutors.length === 0) {
    return <p className="text-sm text-muted-foreground">No tutors yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-normal">Tutor</th>
            <th
              className="py-2 pr-3 font-normal"
              title="Sessions logged in the last 30 days (all time)"
            >
              Sessions
            </th>
            <th
              className="py-2 pr-3 font-normal"
              title="Present or late, out of sessions marked (excused not counted)"
            >
              Attendance
            </th>
            <th
              className="py-2 pr-3 font-normal"
              title="Average time from hand-in to grade"
            >
              Marking time
            </th>
            <th
              className="py-2 pr-3 font-normal"
              title="Handed in and not reviewed yet (over 7 days)"
            >
              Waiting review
            </th>
            <th
              className="py-2 pr-3 font-normal"
              title="Graded or sent back with written feedback"
            >
              Feedback
            </th>
            <th
              className="py-2 pr-3 font-normal"
              title="Past-due work a learner never handed in"
            >
              Missed deadlines
            </th>
            <th className="py-2 font-normal">Needs attention</th>
          </tr>
        </thead>
        <tbody>
          {tutors.map(t => (
            <tr key={t.teacher_id} className="border-t align-top">
              <td className="py-2 pr-3">
                <p className="font-medium">
                  {t.teacher_name ?? t.teacher_email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {showSchool && t.school_name ? `${t.school_name} · ` : ''}
                  {t.classes} class{t.classes === 1 ? '' : 'es'} · {t.students}{' '}
                  students
                </p>
              </td>
              <td className="py-2 pr-3">
                {t.sessions_30d}
                <span className="text-xs text-muted-foreground">
                  {' '}
                  ({t.sessions_total})
                </span>
              </td>
              <td className="py-2 pr-3">
                {t.attendance_rate === null ? '—' : `${t.attendance_rate}%`}
              </td>
              <td className="py-2 pr-3">
                {turnaroundText(t.avg_turnaround_hours)}
              </td>
              <td
                className={`py-2 pr-3 ${t.overdue_reviews > 0 ? 'text-red-600' : ''}`}
              >
                {t.awaiting_review}
                {t.overdue_reviews > 0 && (
                  <span className="text-xs">
                    {' '}
                    ({t.overdue_reviews} overdue)
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">
                {t.feedback_rate === null ? '—' : `${t.feedback_rate}%`}
              </td>
              <td className="py-2 pr-3">{t.missed_deadlines}</td>
              <td className="py-2">
                <div className="flex flex-wrap gap-1">
                  {t.flags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    t.flags.map(f => (
                      <Badge
                        key={f}
                        variant="destructive"
                        className="font-normal"
                      >
                        {FLAG_LABELS[f] ?? f}
                      </Badge>
                    ))
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
