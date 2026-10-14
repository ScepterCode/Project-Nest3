'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PlatformOverview,
  PlatformSchool,
  QUIET_AFTER_DAYS,
  isQuiet,
  platformRpc,
  sinceText,
  toSchool,
} from '@/lib/platform/client';

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

export default function PlatformOverviewPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [schools, setSchools] = useState<PlatformSchool[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      platformRpc<PlatformOverview>('platform_overview'),
      platformRpc<Record<string, unknown>[]>('platform_schools'),
    ])
      .then(([o, s]) => {
        setOverview(o);
        setSchools((s ?? []).map(toSchool));
      })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!overview)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  const quiet = schools.filter(isQuiet);
  const ranked = [...schools]
    .filter(s => s.status === 'active')
    .sort((a, b) => (b.submission_rate ?? -1) - (a.submission_rate ?? -1));
  const maxWeek = Math.max(
    1,
    ...overview.weekly.map(w => Math.max(w.new_users, w.submissions))
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Schools"
          value={overview.schools}
          note={`${overview.active_schools} active`}
        />
        <Stat
          label="Teachers"
          value={overview.teachers}
          note={`${overview.admins} school admins`}
        />
        <Stat label="Students" value={overview.students} />
        <Stat
          label="Active people"
          value={overview.active_7d}
          note={`last 7 days · ${overview.active_30d} in 30 days`}
        />
        <Stat label="Classes" value={overview.classes} />
        <Stat label="Assignments" value={overview.assignments} />
        <Stat label="Submissions" value={overview.submissions} />
        <Stat
          label="Quiet schools"
          value={quiet.length}
          note={`no activity in ${QUIET_AFTER_DAYS} days`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 8 weeks</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-normal">Week of</th>
                <th className="py-2 font-normal">New people</th>
                <th className="py-2 font-normal">New classes</th>
                <th className="py-2 font-normal">Submissions</th>
              </tr>
            </thead>
            <tbody>
              {overview.weekly.map(w => (
                <tr key={w.week} className="border-t">
                  <td className="py-2">
                    {new Date(w.week).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    <Bar value={w.new_users} max={maxWeek} />
                  </td>
                  <td className="py-2">{w.new_classes}</td>
                  <td className="py-2">
                    <Bar value={w.submissions} max={maxWeek} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {quiet.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base">
              Schools that may need a call
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {quiet.map(s => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2">
                  <Link
                    href={`/dashboard/platform/schools/${s.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {s.name}
                  </Link>
                  <span className="text-muted-foreground">
                    last activity {sinceText(s.last_activity)}
                    {s.contact_email ? ` · ${s.contact_email}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schools compared</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {ranked.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active schools yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">School</th>
                  <th className="py-2 font-normal">Teachers</th>
                  <th className="py-2 font-normal">Students</th>
                  <th className="py-2 font-normal">Assignments</th>
                  <th
                    className="py-2 font-normal"
                    title="Work handed in out of work expected"
                  >
                    Submission rate
                  </th>
                  <th className="py-2 font-normal">Average grade</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(s => (
                  <tr key={s.id} className="border-t">
                    <td className="py-2">
                      <Link
                        href={`/dashboard/platform/schools/${s.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="py-2">{s.teachers}</td>
                    <td className="py-2">{s.students}</td>
                    <td className="py-2">{s.assignments}</td>
                    <td className="py-2">
                      {s.submission_rate === null
                        ? '—'
                        : `${s.submission_rate}%`}
                    </td>
                    <td className="py-2">
                      {s.average_grade === null ? '—' : `${s.average_grade}%`}
                    </td>
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

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded bg-gray-100">
        <div
          className="h-2 rounded bg-blue-500"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span>{value}</span>
    </div>
  );
}
