'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

// Building blocks for the programme pages
// (supabase/migrations/20261102120000_programme_containers.sql).

export type ProgrammeStatus = 'active' | 'suspended' | 'ended';
export type ProgrammeStage = 'mentorship' | 'fellowship' | null;

export const STAGE_LABELS: Record<'mentorship' | 'fellowship', string> = {
  mentorship: 'Mentorship',
  fellowship: 'Art Fellowship',
};

/** Who can take part, in a few words. */
export function whoTakesPart(p: {
  scope: string;
  stage: ProgrammeStage;
  school_name?: string | null;
  schools?: string | null;
}) {
  const who =
    p.scope === 'school'
      ? (p.school_name ?? 'One school')
      : (p.schools ?? 'All schools');
  return p.stage ? `${STAGE_LABELS[p.stage]} · ${who}` : who;
}

export function StatusBadge({ status }: { status: ProgrammeStatus }) {
  if (status === 'active') return <Badge variant="secondary">Active</Badge>;
  if (status === 'suspended')
    return (
      <Badge
        className="border-amber-300 bg-amber-50 text-amber-800"
        variant="outline"
      >
        Suspended
      </Badge>
    );
  return <Badge variant="outline">Ended</Badge>;
}

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Could not copy the code');
        }
      }}
      className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs tracking-widest hover:bg-gray-200"
      title="Copy join code"
    >
      {code}
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

/** Every school, as a drop-down of check boxes (platform admins). */
export function SchoolsPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [schools, setSchools] = useState<
    { id: string; name: string; status: string }[] | null
  >(null);

  useEffect(() => {
    createClient()
      .rpc('platform_schools')
      .then(({ data }) =>
        setSchools(
          ((data as { id: string; name: string; status: string }[]) ?? []).sort(
            (a, b) => a.name.localeCompare(b.name)
          )
        )
      );
  }, []);

  const names = (schools ?? [])
    .filter(s => value.includes(s.id))
    .map(s => s.name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          id={id}
        >
          <span className="truncate">
            {names.length === 0
              ? 'Choose schools'
              : names.length <= 2
                ? names.join(', ')
                : `${names.length} schools chosen`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 w-72 overflow-y-auto">
        <DropdownMenuLabel>
          {schools ? `${schools.length} schools` : 'Loading schools…'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(schools ?? []).map(s => (
          <DropdownMenuCheckboxItem
            key={s.id}
            checked={value.includes(s.id)}
            // Keep the menu open while ticking several schools.
            onSelect={e => e.preventDefault()}
            onCheckedChange={on =>
              onChange(on ? [...value, s.id] : value.filter(x => x !== s.id))
            }
          >
            {s.name}
            {s.status !== 'active' ? ' (suspended)' : ''}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TutorRow {
  teacher_id: string;
  teacher_name: string | null;
  teacher_email: string;
  school_name: string | null;
}

/**
 * Teachers from every school, for platform admins; `schoolName` limits it to
 * one school (a school programme's tutors).
 */
export function AnyTeacherPicker({
  id,
  value,
  onChange,
  schoolName,
}: {
  id?: string;
  value: string | null;
  onChange: (teacherId: string | null) => void;
  schoolName?: string | null;
}) {
  const [teachers, setTeachers] = useState<TutorRow[] | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    createClient()
      .rpc('platform_tutor_metrics')
      .then(({ data }) => setTeachers((data as TutorRow[]) ?? []));
  }, []);

  if (!teachers)
    return <p className="text-sm text-muted-foreground">Loading teachers…</p>;
  const term = filter.trim().toLowerCase();
  const pool = schoolName
    ? teachers.filter(t => t.school_name === schoolName)
    : teachers;
  const shown = pool
    .filter(
      t =>
        !term ||
        t.teacher_id === value ||
        `${t.teacher_name ?? ''} ${t.teacher_email} ${t.school_name ?? ''}`
          .toLowerCase()
          .includes(term)
    )
    .sort((a, b) =>
      (a.teacher_name ?? a.teacher_email).localeCompare(
        b.teacher_name ?? b.teacher_email
      )
    );

  return (
    <div className="space-y-2">
      {pool.length > 15 && (
        <Input
          placeholder={`Filter ${pool.length} teachers by name, email or school`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          aria-label="Filter teachers"
        />
      )}
      <select
        id={id}
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full rounded border bg-white p-2 text-sm"
      >
        <option value="">-- Choose a teacher ({shown.length}) --</option>
        {shown.map(t => (
          <option key={t.teacher_id} value={t.teacher_id}>
            {t.teacher_name ?? t.teacher_email}
            {schoolName
              ? ''
              : t.school_name
                ? ` · ${t.school_name}`
                : ' · no school'}
          </option>
        ))}
      </select>
    </div>
  );
}
