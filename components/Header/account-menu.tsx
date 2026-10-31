'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { ROLE_LABELS } from '@/lib/platform/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ''))
    .toUpperCase()
    .slice(0, 2);
}

/** Who you are and where: name, role and school, with profile and sign out. */
export function AccountMenu({
  role,
  institutionId,
}: {
  role: string;
  institutionId?: string | null | undefined;
}) {
  const { user, getUserDisplayName, logout } = useAuth();
  const [school, setSchool] = useState<string | null>(null);

  useEffect(() => {
    if (!institutionId) {
      setSchool(null);
      return;
    }
    createClient()
      .from('institutions')
      .select('name')
      .eq('id', institutionId)
      .maybeSingle()
      .then(({ data }) => setSchool(data?.name ?? null));
  }, [institutionId]);

  const name = getUserDisplayName() || user?.email || '';
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <div className="flex items-center gap-2">
      {school && (
        <span className="hidden max-w-48 truncate text-sm text-muted-foreground lg:inline">
          {school}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Your account: ${name}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {initials(name)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate font-medium">{name}</p>
            {user?.email && name !== user.email && (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            )}
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {school ? `${roleLabel} · ${school}` : roleLabel}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/profile">
              <UserRound className="mr-2 h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
