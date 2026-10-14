'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, platformRpc } from '@/lib/platform/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

interface SchoolDetail {
  school: {
    id: string;
    name: string;
    status: string;
    institution_type: string | null;
    size_band: string | null;
    contact_name: string | null;
    contact_title: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    created_at: string;
  };
  admins: { id: string; email: string; name: string | null }[];
  departments: string[];
  classes: {
    id: string;
    name: string;
    status: string;
    teacher: string | null;
    students: number;
    assignments: number;
    submissions_7d: number;
    created_at: string;
  }[];
}

export default function PlatformSchoolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    platformRpc<SchoolDetail>('platform_school_detail', { p_school: id })
      .then(setDetail)
      .catch(e => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const setActive = async (active: boolean) => {
    if (!detail) return;
    const ok = await confirmAction(
      active
        ? {
            title: `Reactivate ${detail.school.name}?`,
            description: 'Its student and teacher codes work again.',
            confirmLabel: 'Reactivate',
          }
        : {
            title: `Suspend ${detail.school.name}?`,
            description:
              'Its student and teacher codes stop working, so nobody new can join. Existing members keep their accounts, classes and work.',
            confirmLabel: 'Suspend',
            destructive: true,
          }
    );
    if (!ok) return;
    setSaving(true);
    try {
      await platformRpc('platform_set_school_status', {
        p_school: id,
        p_active: active,
      });
      toast.success(active ? 'School reactivated' : 'School suspended');
      load();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the school'));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { school } = detail;
  const active = school.status === 'active';
  const contact = [
    [school.contact_name, school.contact_title].filter(Boolean).join(', '),
    school.contact_email,
    school.contact_phone,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/platform/schools">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All schools
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {school.name}
              {!active && <Badge variant="destructive">Suspended</Badge>}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {[
                school.institution_type,
                school.size_band,
                `joined ${formatDate(school.created_at)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Button
            variant={active ? 'outline' : 'default'}
            onClick={() => setActive(!active)}
            disabled={saving}
            className={active ? 'text-red-600' : ''}
          >
            {active ? 'Suspend school' : 'Reactivate school'}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Main contact</p>
            {contact.length ? (
              contact.map(line => <p key={line}>{line}</p>)
            ) : (
              <p>—</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">School admins</p>
            {detail.admins.length ? (
              detail.admins.map(a => (
                <p key={a.id}>
                  {a.name ?? a.email}
                  {a.name && (
                    <span className="text-muted-foreground"> · {a.email}</span>
                  )}
                </p>
              ))
            ) : (
              <p>None</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">Departments</p>
            <p>
              {detail.departments.length
                ? detail.departments.join(', ')
                : 'None'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Classes ({detail.classes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {detail.classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Class</th>
                  <th className="py-2 font-normal">Teacher</th>
                  <th className="py-2 font-normal">Students</th>
                  <th className="py-2 font-normal">Assignments</th>
                  <th className="py-2 font-normal">Work handed in (7 days)</th>
                  <th className="py-2 font-normal">Created</th>
                </tr>
              </thead>
              <tbody>
                {detail.classes.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2">
                      {c.name}
                      {c.status !== 'active' && (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          ({c.status})
                        </span>
                      )}
                    </td>
                    <td className="py-2">{c.teacher ?? '—'}</td>
                    <td className="py-2">{c.students}</td>
                    <td className="py-2">{c.assignments}</td>
                    <td className="py-2">{c.submissions_7d}</td>
                    <td className="py-2">{formatDate(c.created_at)}</td>
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
