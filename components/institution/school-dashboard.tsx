'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Layers,
  LifeBuoy,
  ShieldCheck,
  Upload,
  UserCog,
  Users,
} from 'lucide-react';
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
  FLAG_LABELS,
  TutorMetrics,
  toTutorMetrics,
} from '@/components/delivery/tutor-metrics-table';
import {
  MyInstitution,
  SchoolCodesCard,
} from '@/components/institution/institution-membership';
import { createClient } from '@/lib/supabase/client';

interface Overview {
  teachers: number;
  students: number;
  classes: {
    id: string;
    name: string;
    teacher_id: string;
    cohort_stage: string | null;
    students: number;
  }[];
  assignments: number;
  pendingRoleRequests: number;
  consentGranted: number;
  tutors: TutorMetrics[];
}

// Everything is read with the admin's own access: RLS limits each query to
// their school.
async function loadOverview(): Promise<Overview> {
  const supabase = createClient();
  const members = () =>
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .not('institution_id', 'is', null);
  const [
    teachers,
    students,
    classes,
    enrollments,
    assignments,
    requests,
    consent,
    tutors,
  ] = await Promise.all([
    members().eq('role', 'teacher'),
    members().eq('role', 'student'),
    supabase
      .from('classes')
      .select('id, name, teacher_id, cohort_stage')
      .neq('status', 'archived')
      .order('name'),
    supabase
      .from('enrollments')
      .select('class_id')
      .in('status', ['enrolled', 'active']),
    supabase.from('assignments').select('id', { count: 'exact', head: true }),
    supabase
      .from('role_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()),
    supabase
      .from('learner_profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('consent_status', 'granted'),
    supabase.rpc('school_tutor_metrics'),
  ]);

  const perClass = new Map<string, number>();
  for (const e of enrollments.data ?? []) {
    perClass.set(e.class_id, (perClass.get(e.class_id) ?? 0) + 1);
  }
  return {
    teachers: teachers.count ?? 0,
    students: students.count ?? 0,
    classes: (classes.data ?? []).map(c => ({
      ...c,
      students: perClass.get(c.id) ?? 0,
    })),
    assignments: assignments.count ?? 0,
    pendingRoleRequests: requests.count ?? 0,
    consentGranted: consent.count ?? 0,
    tutors: ((tutors.data as Record<string, unknown>[] | null) ?? []).map(
      toTutorMetrics
    ),
  };
}

const pct = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string | undefined;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AttentionItem({
  href,
  tone,
  children,
}: {
  href: string;
  tone: 'warn' | 'info';
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-gray-50"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            tone === 'warn' ? 'bg-amber-500' : 'bg-blue-500'
          }`}
          aria-hidden
        />
        <span className="flex-1">{children}</span>
        <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-700" />
      </Link>
    </li>
  );
}

const QUICK_LINKS = [
  {
    href: '/dashboard/institution/users',
    label: 'People and consent',
    icon: Users,
  },
  {
    href: '/dashboard/institution/bulk-import',
    label: 'Add people from a spreadsheet',
    icon: Upload,
  },
  {
    href: '/dashboard/institution/role-requests',
    label: 'Role requests',
    icon: ClipboardCheck,
  },
  {
    href: '/dashboard/institution/bulk-role-assignment',
    label: 'Change roles in bulk',
    icon: UserCog,
  },
  {
    href: '/dashboard/institution/departments',
    label: 'Departments',
    icon: Layers,
  },
  {
    href: '/dashboard/institution/reports',
    label: 'Reports and exports',
    icon: BarChart3,
  },
  { href: '/dashboard/support', label: 'Help & support', icon: LifeBuoy },
];

/** The school admin's home: what needs doing, the numbers, classes, tutors. */
export function SchoolDashboard({
  institution,
  onInstitutionChange,
}: {
  institution: MyInstitution;
  onInstitutionChange: (institution: MyInstitution) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    loadOverview().then(setData);
  }, []);

  const tutorName = (id: string) => {
    const t = data?.tutors.find(x => x.teacher_id === id);
    return t ? (t.teacher_name ?? t.teacher_email) : 'Teacher';
  };

  const flagged = data?.tutors.filter(t => t.flags.length > 0) ?? [];
  const overdue = data?.tutors.reduce((n, t) => n + t.overdue_reviews, 0) ?? 0;
  const handedIn = data?.tutors.reduce((n, t) => n + t.submissions, 0) ?? 0;
  const missed = data?.tutors.reduce((n, t) => n + t.missed_deadlines, 0) ?? 0;
  const withAttendance = data?.tutors.filter(t => t.attendance_rate !== null);
  const attendance =
    withAttendance && withAttendance.length
      ? withAttendance.reduce((n, t) => n + (t.attendance_rate ?? 0), 0) /
        withAttendance.length
      : null;
  const noConsent = data ? Math.max(0, data.students - data.consentGranted) : 0;
  const emptyClasses = data?.classes.filter(c => c.students === 0).length ?? 0;

  const about = [
    institution.institution_type,
    institution.size_band,
    institution.department_count
      ? `${institution.department_count} ${
          institution.department_count === 1 ? 'department' : 'departments'
        }`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const attention = data
    ? [
        data.pendingRoleRequests > 0 && (
          <AttentionItem
            key="requests"
            href="/dashboard/institution/role-requests"
            tone="warn"
          >
            <strong>{data.pendingRoleRequests}</strong> role{' '}
            {data.pendingRoleRequests === 1 ? 'request' : 'requests'} waiting
            for you
          </AttentionItem>
        ),
        noConsent > 0 && (
          <AttentionItem
            key="consent"
            href="/dashboard/institution/users"
            tone="warn"
          >
            <strong>{noConsent}</strong> of {data.students} learners have no
            guardian consent recorded
          </AttentionItem>
        ),
        flagged.length > 0 && (
          <AttentionItem key="flagged" href="#tutors" tone="warn">
            <strong>{flagged.length}</strong>{' '}
            {flagged.length === 1 ? 'tutor needs' : 'tutors need'} attention
          </AttentionItem>
        ),
        overdue > 0 && (
          <AttentionItem
            key="overdue"
            href="/dashboard/institution/reports"
            tone="warn"
          >
            <strong>{overdue}</strong> pieces of work waiting more than a week
            for marking
          </AttentionItem>
        ),
        data.teachers === 0 && (
          <AttentionItem key="no-teachers" href="#codes" tone="info">
            No teachers yet: share the teacher code with your staff
          </AttentionItem>
        ),
        emptyClasses > 0 && (
          <AttentionItem
            key="empty"
            href="/dashboard/institution/reports"
            tone="info"
          >
            <strong>{emptyClasses}</strong>{' '}
            {emptyClasses === 1 ? 'class has' : 'classes have'} no students yet
          </AttentionItem>
        ),
      ].filter(Boolean)
    : [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* School header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
            School dashboard
          </p>
          <h1 className="truncate text-2xl font-bold text-gray-900 md:text-3xl">
            {institution.name}
          </h1>
          {about && <p className="text-sm text-muted-foreground">{about}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/institution/reports">
              <BarChart3 className="mr-2 h-4 w-4" />
              Reports
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/institution/bulk-import">
              <Upload className="mr-2 h-4 w-4" />
              Add people
            </Link>
          </Button>
        </div>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Students"
          value={data?.students ?? '…'}
          hint={data ? `${data.consentGranted} with consent` : undefined}
          icon={<GraduationCap />}
        />
        <Stat label="Teachers" value={data?.teachers ?? '…'} icon={<Users />} />
        <Stat
          label="Classes"
          value={data?.classes.length ?? '…'}
          icon={<BookOpen />}
        />
        <Stat
          label="Assignments"
          value={data?.assignments ?? '…'}
          icon={<ClipboardCheck />}
        />
        <Stat
          label="Work handed in"
          value={data ? handedIn : '…'}
          hint={data ? `${missed} missed deadlines` : undefined}
          icon={<Upload />}
        />
        <Stat
          label="Attendance"
          value={data ? pct(attendance) : '…'}
          hint="across logged sessions"
          icon={<CheckCircle2 />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Needs attention */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Needs your attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data ? (
                <p className="text-sm text-muted-foreground">Checking…</p>
              ) : attention.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <ShieldCheck className="h-4 w-4" />
                  All clear. Nothing is waiting for you.
                </p>
              ) : (
                <ul className="-mx-3 divide-y">{attention}</ul>
              )}
            </CardContent>
          </Card>

          {/* Tutors */}
          <Card id="tutors" className="scroll-mt-20">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Tutors</CardTitle>
                <CardDescription>
                  Sessions logged in the last 30 days, marking and flags.
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/institution/reports">Full table</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {!data ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : data.tutors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No teachers yet. They join with the teacher code.
                </p>
              ) : (
                <ul className="divide-y">
                  {[...data.tutors]
                    .sort((a, b) => b.flags.length - a.flags.length)
                    .slice(0, 8)
                    .map(t => (
                      <li
                        key={t.teacher_id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {t.teacher_name ?? t.teacher_email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t.classes} {t.classes === 1 ? 'class' : 'classes'}{' '}
                            · {t.students} students · {t.sessions_30d} sessions
                            · {t.awaiting_review} to mark
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {t.flags.length === 0 ? (
                            <Badge variant="secondary">On track</Badge>
                          ) : (
                            t.flags.map(f => (
                              <Badge
                                key={f}
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-amber-800"
                              >
                                {FLAG_LABELS[f] ?? f}
                              </Badge>
                            ))
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Classes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Classes</CardTitle>
              <CardDescription>
                Every active class at your school and how many students are in
                it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!data ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : data.classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No classes yet. Teachers create them from their dashboard.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Class</th>
                        <th className="py-2 pr-3 font-medium">Teacher</th>
                        <th className="py-2 text-right font-medium">
                          Students
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.classes.map(c => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {c.name}
                            {c.cohort_stage && (
                              <Badge
                                variant="secondary"
                                className="ml-2 capitalize"
                              >
                                {c.cohort_stage}
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">
                            {tutorName(c.teacher_id)}
                          </td>
                          <td
                            className={`py-2 text-right tabular-nums ${
                              c.students === 0 ? 'text-amber-700' : ''
                            }`}
                          >
                            {c.students}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <div id="codes" className="scroll-mt-20">
            <SchoolCodesCard
              institution={institution}
              onChange={onInstitutionChange}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Manage</CardTitle>
            </CardHeader>
            <CardContent className="px-3">
              <ul>
                {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {(institution.contact_name || institution.contact_email) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Main contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5 text-sm">
                <p className="font-medium">
                  {[institution.contact_name, institution.contact_title]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {institution.contact_email && (
                  <p className="text-muted-foreground">
                    {institution.contact_email}
                  </p>
                )}
                {institution.contact_phone && (
                  <p className="text-muted-foreground">
                    {institution.contact_phone}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
