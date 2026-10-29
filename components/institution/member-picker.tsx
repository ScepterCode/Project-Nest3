'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

// Plenty for one school; the filter box narrows it down.
const MAX_MEMBERS = 1000;
const FILTER_FROM = 15;

interface Member {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface MemberPickerProps {
  id: string;
  role: 'teacher' | 'student';
  value: string | null;
  onChange: (userId: string | null) => void;
}

const nameOf = (m: Member) =>
  [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email;

/**
 * Drop-down of the admin's school's teachers or students (RLS limits the
 * list to their institution), with a filter box once the list is long.
 */
export function MemberPicker({ id, role, value, onChange }: MemberPickerProps) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [filter, setFilter] = useState('');
  const plural = role === 'teacher' ? 'teachers' : 'students';

  useEffect(() => {
    createClient()
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('role', role)
      .not('institution_id', 'is', null)
      .order('first_name', { ascending: true, nullsFirst: false })
      .order('last_name', { ascending: true, nullsFirst: false })
      .limit(MAX_MEMBERS)
      .then(({ data }) => setMembers((data as Member[]) ?? []));
  }, [role]);

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!members || !term) return members ?? [];
    return members.filter(
      m =>
        m.id === value ||
        nameOf(m).toLowerCase().includes(term) ||
        m.email.toLowerCase().includes(term)
    );
  }, [members, filter, value]);

  if (!members) {
    return <p className="text-sm text-muted-foreground">Loading {plural}…</p>;
  }
  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No {plural} at your school yet.
        {role === 'teacher'
          ? ' Teachers join with the teacher code, or add them on the Users page.'
          : ' Students join when a teacher accepts them into a class, or add them on the Users page.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {members.length > FILTER_FROM && (
        <Input
          placeholder={`Filter ${members.length} ${plural} by name or email`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          aria-label={`Filter ${plural}`}
          autoComplete="off"
        />
      )}
      <select
        id={id}
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full rounded border bg-white p-2 text-sm"
      >
        <option value="">
          -- Choose {role === 'teacher' ? 'a teacher' : 'a student'} (
          {shown.length}) --
        </option>
        {shown.map(m => (
          <option key={m.id} value={m.id}>
            {nameOf(m)} ({m.email})
          </option>
        ))}
      </select>
    </div>
  );
}
