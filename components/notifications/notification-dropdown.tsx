'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle, ExternalLink, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { NotificationSummary, Notification, NotificationPriority } from '@/lib/types/notifications';
import { formatDistanceToNow } from 'date-fns';

interface NotificationDropdownProps {
  summary: NotificationSummary;
  onNotificationRead: () => void;
}

export function NotificationDropdown({ summary, onNotificationRead }: NotificationDropdownProps) {
  const router = useRouter();

  const handleMarkAllRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markAll: true }),
      });

      if (response.ok) {
        onNotificationRead();
      }
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if not already read
    if (!notification.is_read) {
      try {
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notificationIds: [notification.id] }),
        });
        onNotificationRead();
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }

    // Navigate to action URL if provided
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const getPriorityColor = (priority: NotificationPriority) => {
    switch (priority) {
      case 'urgent':
        return 'border-l-red-500 bg-red-50';
      case 'high':
        return 'border-l-orange-500 bg-orange-50';
      case 'medium':
        return 'border-l-blue-500 bg-blue-50';
      case 'low':
        return 'border-l-gray-500 bg-gray-50';
      default:
        return 'border-l-gray-500 bg-gray-50';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'assignment_graded':
        return '📊';
      case 'assignment_created':
        return '📝';
      case 'assignment_due_soon':
        return '⏰';
      case 'class_announcement':
        return '📢';
      case 'enrollment_approved':
        return '✅';
      case 'role_changed':
        return '👤';
      case 'system_message':
        return '🔔';
      default:
        return '📬';
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h3 className="font-semibold">Notifications</h3>
          {summary.unread_count > 0 && (
            <Badge variant="secondary" className="text-xs">
              {summary.unread_count} new
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {summary.unread_count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/notifications/settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Notifications List */}
      <ScrollArea className="h-96">
        {summary.recent_notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 text-sm">No notifications yet</p>
            <p className="text-gray-400 text-xs">You'll see updates here when they arrive</p>
          </div>
        ) : (
          <div className="divide-y">
            {summary.recent_notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors border-l-4 ${getPriorityColor(notification.priority)} ${
                  !notification.is_read ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className="text-lg flex-shrink-0 mt-0.5">
                    {getTypeIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`text-sm font-medium truncate ${
                        !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                      }`}>
                        {notification.title}
                      </h4>
                      {!notification.is_read && (
                        <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                      )}
                    </div>
                    <p className={`text-xs mt-1 line-clamp-2 ${
                      !notification.is_read ? 'text-gray-700' : 'text-gray-500'
                    }`}>
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </span>
                      {notification.action_label && (
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                          <span>{notification.action_label}</span>
                          <ExternalLink className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <Separator />
      <div className="p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => router.push('/dashboard/notifications')}
        >
          View All Notifications
        </Button>
      </div>
    </div>
  );
}