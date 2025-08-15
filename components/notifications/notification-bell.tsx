'use client';

import React, { useState, useEffect } from 'react';
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

export function NotificationBell() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<NotificationSummary>({
    total_count: 0,
    unread_count: 0,
    high_priority_count: 0,
    recent_notifications: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadNotificationSummary();
      
      // Set up polling for real-time updates
      const interval = setInterval(loadNotificationSummary, 30000); // Poll every 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadNotificationSummary = async () => {
    try {
      const response = await fetch('/api/notifications/summary');
      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      } else {
        // Silently handle API errors - don't spam console
        setSummary({
          total_count: 0,
          unread_count: 0,
          high_priority_count: 0,
          recent_notifications: []
        });
      }
    } catch (error) {
      // Silently handle fetch errors - don't spam console
      setSummary({
        total_count: 0,
        unread_count: 0,
        high_priority_count: 0,
        recent_notifications: []
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationRead = () => {
    // Refresh summary when notifications are read
    loadNotificationSummary();
  };

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
            <Bell className={`h-5 w-5 ${hasUnread ? 'text-blue-600' : 'text-gray-600'}`} />
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
          onNotificationRead={handleNotificationRead}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}