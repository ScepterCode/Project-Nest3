'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

const MAX_RESULTS = 20;

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
 * Search-as-you-type picker for members of the admin's institution (RLS
 * limits results to it). Loads at most MAX_RESULTS rows per search instead of
 * every user in the institution.
 */
export function MemberPicker({ id, role, value, onChange }: MemberPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);

  useEffect(() => {
    if (!value) setSelected(null);
  }, [value]);

  useEffect(() => {
    const cleaned = term.trim().replace(/[%,()]/g, '');
    if (cleaned.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await createClient()
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('role', role)
        .not('institution_id', 'is', null)
        .or(
          `email.ilike.%${cleaned}%,first_name.ilike.%${cleaned}%,last_name.ilike.%${cleaned}%`
        )
        .order('last_name', { ascending: true, nullsFirst: false })
        .limit(MAX_RESULTS);
      if (!cancelled) setResults((data as Member[]) ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, role]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded border p-2 text-sm">
        <span>
          {nameOf(selected)}{' '}
          <span className="text-muted-foreground">({selected.email})</span>
        </span>
        <button
          type="button"
          className="text-blue-600 underline"
          onClick={() => {
            setSelected(null);
            onChange(null);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        id={id}
        placeholder={`Search ${role}s by name or email`}
        value={term}
        onChange={e => setTerm(e.target.value)}
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul
          className="max-h-56 overflow-y-auto rounded border text-sm"
          role="listbox"
        >
          {results.map(member => (
            <li key={member.id}>
              <button
                type="button"
                role="option"
                aria-selected={value === member.id}
                className="w-full px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setSelected(member);
                  setTerm('');
                  setResults([]);
                  onChange(member.id);
                }}
              >
                {nameOf(member)}{' '}
                <span className="text-muted-foreground">({member.email})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {term.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground">No matching {role}s.</p>
      )}
    </div>
  );
}
