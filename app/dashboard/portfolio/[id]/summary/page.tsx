'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  STAGE_LABELS,
  averageGrade,
} from '@/components/portfolio/learner-portfolio';
import { createClient } from '@/lib/supabase/client';
import { statusLabel } from '@/lib/submission-status';

// Same data as the portfolio (learner_portfolio), laid out as one printable
// page a school can hand to guardians or authorised representatives.
interface Summary {
  learner: {
    id: string;
    name: string | null;
    email: string;
    school: string | null;
    stage: keyof typeof STAGE_LABELS;
  };
  work: {
    submission_id: string;
    assignment: string;
    class: string;
    submitted_at: string | null;
    status: string;
    grade: number | null;
    points_possible: number;
    feedback: string | null;
    revision_count: number;
    featured: boolean;
    tutor_id: string;
    link_url: string | null;
    file_url: string | null;
  }[];
  attendance: { class: string; attended: number; counted: number }[];
}

const clip = (text: string | null, n = 220) =>
  !text ? '' : text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text;

export default function ProgressSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc('learner_portfolio', { p_student: id })
      .then(({ data, error: rpcError }) => {
        if (rpcError) setError(rpcError.message);
        else setSummary(data as Summary);
      });
  }, [id]);

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!summary)
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const { learner, work, attendance } = summary;
  const avg = averageGrade(work as never);
  const graded = work.filter(w => w.grade !== null).length;
  const attended = attendance.reduce((n, a) => n + Number(a.attended), 0);
  const counted = attendance.reduce((n, a) => n + Number(a.counted), 0);
  const revisions = work.reduce((n, w) => n + (w.revision_count ?? 0), 0);
  const featured = work.filter(w => w.featured);
  const today = new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-white p-6 text-sm text-gray-900 print:max-w-none print:p-0">
      <div className="flex justify-between gap-2 print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/portfolio/${learner.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to portfolio
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print or save as PDF
        </Button>
      </div>

      <header className="border-b pb-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          Learner progress summary
        </p>
        <h1 className="text-2xl font-bold">{learner.name ?? learner.email}</h1>
        <p className="text-gray-600">
          {[
            learner.school,
            `${STAGE_LABELS[learner.stage]} stage`,
            `prepared ${today}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      <section className="grid grid-cols-4 gap-3 text-center">
        {[
          ['Work handed in', String(work.length)],
          ['Average grade', avg === null ? '—' : `${avg}%`],
          ['Sessions attended', counted ? `${attended} of ${counted}` : '—'],
          ['Revision rounds', String(revisions)],
        ].map(([label, value]) => (
          <div key={label} className="rounded border p-2">
            <p className="text-lg font-semibold">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </section>

      {attendance.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Attendance</h2>
          <ul className="list-disc pl-5">
            {attendance.map(a => (
              <li key={a.class}>
                {a.class}: {a.attended} of {a.counted} sessions
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-1 font-semibold">Work and feedback</h2>
        {work.length === 0 ? (
          <p className="text-gray-500">No work handed in yet.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="py-1 pr-2 font-normal">Assignment</th>
                <th className="py-1 pr-2 font-normal">Handed in</th>
                <th className="py-1 pr-2 font-normal">Result</th>
                <th className="py-1 font-normal">Tutor&apos;s comment</th>
              </tr>
            </thead>
            <tbody>
              {work.map(w => (
                <tr
                  key={w.submission_id}
                  className="break-inside-avoid border-b align-top"
                >
                  <td className="py-1 pr-2">
                    {w.assignment}
                    {w.featured ? ' ★' : ''}
                    <div className="text-xs text-gray-500">{w.class}</div>
                  </td>
                  <td className="py-1 pr-2">
                    {w.submitted_at
                      ? new Date(w.submitted_at).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="py-1 pr-2">
                    {w.status === 'graded' && w.grade !== null
                      ? `${w.grade}/${w.points_possible}`
                      : statusLabel(w.status)}
                  </td>
                  <td className="py-1 text-gray-700">{clip(w.feedback)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {graded < work.length && (
          <p className="mt-1 text-xs text-gray-500">
            {work.length - graded} piece(s) not graded yet.
          </p>
        )}
      </section>

      {featured.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Featured by tutors (★)</h2>
          <p>{featured.map(w => w.assignment).join(', ')}</p>
        </section>
      )}

      <footer className="grid grid-cols-3 gap-6 pt-8 text-xs text-gray-600">
        <div className="border-t pt-1">Prepared by (name and role)</div>
        <div className="border-t pt-1">Signature</div>
        <div className="border-t pt-1">Date</div>
      </footer>
    </div>
  );
}
