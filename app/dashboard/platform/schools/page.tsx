'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  PlatformSchool,
  isQuiet,
  platformRpc,
  sinceText,
  toSchool,
} from '@/lib/platform/client';

export default function PlatformSchoolsPage() {
  const [schools, setSchools] = useState<PlatformSchool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    platformRpc<Record<string, unknown>[]>('platform_schools')
      .then(rows => setSchools((rows ?? []).map(toSchool)))
      .catch(e => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (schools ?? []).filter(
      s =>
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.admins ?? '').toLowerCase().includes(term) ||
        (s.contact_email ?? '').toLowerCase().includes(term)
    );
  }, [schools, filter]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!schools)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <Input
        placeholder="Filter by school, admin or contact email"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="max-w-sm"
        aria-label="Filter schools"
      />
      {shown.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {schools.length === 0
              ? 'No schools yet. Send an admin invite to get the first one started.'
              : 'No schools match.'}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-muted-foreground">
              <tr>
                <th className="p-3 font-normal">School</th>
                <th className="p-3 font-normal">Admins / contact</th>
                <th className="p-3 font-normal">Teachers</th>
                <th className="p-3 font-normal">Students</th>
                <th className="p-3 font-normal">Classes</th>
                <th className="p-3 font-normal">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <tr key={s.id} className="border-t align-top">
                  <td className="p-3">
                    <Link
                      href={`/dashboard/platform/schools/${s.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {s.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[s.institution_type, s.size_band]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {s.status !== 'active' && (
                      <Badge variant="destructive" className="mt-1">
                        Suspended
                      </Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div>{s.admins ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.contact_email}
                    </div>
                  </td>
                  <td className="p-3">{s.teachers}</td>
                  <td className="p-3">{s.students}</td>
                  <td className="p-3">{s.classes}</td>
                  <td className={`p-3 ${isQuiet(s) ? 'text-amber-700' : ''}`}>
                    {sinceText(s.last_activity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
