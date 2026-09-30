'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationDropdown } from './notification-dropdown';
import { useAuth } from '@/contexts/auth-context';
import { NotificationSummary } from '@/lib/types/notifications';
import { createClient } from '@/lib/supabase/client';
import {
  EMPTY_SUMMARY,
  loadNotificationSummary as fetchSummary,
} from '@/lib/notifications/load-summary';

// Notifications aren't time-critical. Refreshing every 2 minutes, only while
// the tab is visible (plus when it becomes visible again and after marking
// read), keeps load proportional to people actually looking at the app.
const REFRESH_MS = 2 * 60 * 1000;

export function NotificationBell() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);

  const loadNotificationSummary = useCallback(async () => {
    if (!user) return;
    try {
      setSummary(await fetchSummary(createClient(), user.id));
    } catch {
      // Keep the last known summary; the next refresh retries.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined)
        timer = setInterval(loadNotificationSummary, REFRESH_MS);
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadNotificationSummary();
        start();
      } else {
        stop();
      }
    };

    loadNotificationSummary();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user, loadNotificationSummary]);

  if (!user || loading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  const hasUnread = summary.unread_count > 0;
  const hasHighPriority = summary.high_priority_count > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          {hasHighPriority ? (
            <BellRing className="h-5 w-5 text-red-500" />
          ) : (
            <Bell
              className={`h-5 w-5 ${hasUnread ? 'text-blue-600' : 'text-gray-600'}`}
            />
          )}
          {hasUnread && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {summary.unread_count > 99 ? '99+' : summary.unread_count}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <NotificationDropdown
          summary={summary}
          onNotificationRead={loadNotificationSummary}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
