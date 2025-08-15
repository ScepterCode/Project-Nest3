'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { 
  Bell, 
  CheckCircle, 
  Trash2, 
  Filter, 
  Settings,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Notification, NotificationType } from '@/lib/types/notifications';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadNotifications(true);
    }
  }, [user, filter, typeFilter]);

  const loadNotifications = async (reset = false) => {
    try {
      setLoadingNotifications(true);
      const currentPage = reset ? 1 : page;
      
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        unreadOnly: filter === 'unread' ? 'true' : 'false'
      });

      if (typeFilter !== 'all') {
        params.append('types', typeFilter);
      }

      const response = await fetch(`/api/notifications?${params}`);
      if (response.ok) {
        const data = await response.json();
        
        if (reset) {
          setNotifications(data.notifications);
          setPage(1);
        } else {
          setNotifications(prev => [...prev, ...data.notifications]);
        }
        
        setHasMore(data.pagination.hasMore);
        if (!reset) {
          setPage(prev => prev + 1);
        }
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleMarkAsRead = async (notificationIds?: string[]) => {
    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationIds,
          markAll: !notificationIds
        }),
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(notification => 
            !notificationIds || notificationIds.includes(notification.id)
              ? { ...notification, is_read: true, read_at: new Date().toISOString() }
              : notification
          )
        );
        setSelectedNotifications([]);
      }
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  const handleDeleteNotifications = async (notificationIds: string[]) => {
    try {
      const deletePromises = notificationIds.map(id =>
        fetch(`/api/notifications?id=${id}`, { method: 'DELETE' })
      );
      
      await Promise.all(deletePromises);
      
      // Update local state
      setNotifications(prev => 
        prev.filter(notification => !notificationIds.includes(notification.id))
      );
      setSelectedNotifications([]);
    } catch (error) {
      console.error('Error deleting notifications:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if not already read
    if (!notification.is_read) {
      await handleMarkAsRead([notification.id]);
    }

    // Navigate to action URL if provided
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const handleSelectAll = () => {
    if (selectedNotifications.length === notifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(notifications.map(n => n.id));
    }
  };

  const getPriorityColor = (priority: string) => {
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

  if (loading || loadingNotifications) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Bell className="h-6 w-6" />
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="secondary">
                    {unreadCount} unread
                  </Badge>
                )}
              </h1>
              <p className="text-gray-600">Stay updated with your latest activities</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadNotifications(true)}
                disabled={loadingNotifications}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingNotifications ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/dashboard/notifications/settings')}
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters and Actions */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="unread">Unread</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="assignment_graded">Assignment Graded</SelectItem>
                    <SelectItem value="assignment_created">New Assignment</SelectItem>
                    <SelectItem value="assignment_due_soon">Due Soon</SelectItem>
                    <SelectItem value="class_announcement">Announcements</SelectItem>
                    <SelectItem value="role_changed">Role Changes</SelectItem>
                    <SelectItem value="system_message">System Messages</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedNotifications.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {selectedNotifications.length} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMarkAsRead(selectedNotifications)}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Read
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteNotifications(selectedNotifications)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications</h3>
              <p className="text-gray-600">
                {filter === 'unread' 
                  ? "You don't have any unread notifications."
                  : "You don't have any notifications yet."
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Select All */}
            <div className="flex items-center gap-2 px-4">
              <Checkbox
                checked={selectedNotifications.length === notifications.length}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm text-gray-600">Select all</span>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMarkAsRead()}
                  className="ml-auto"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark all as read
                </Button>
              )}
            </div>

            {/* Notification Items */}
            {notifications.map((notification) => (
              <Card 
                key={notification.id}
                className={`cursor-pointer hover:shadow-md transition-all border-l-4 ${getPriorityColor(notification.priority)} ${
                  !notification.is_read ? 'bg-blue-50' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedNotifications.includes(notification.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedNotifications(prev => [...prev, notification.id]);
                        } else {
                          setSelectedNotifications(prev => prev.filter(id => id !== notification.id));
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    <div className="text-2xl flex-shrink-0 mt-1">
                      {getTypeIcon(notification.type)}
                    </div>
                    
                    <div 
                      className="flex-1 min-w-0"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`font-medium ${
                          !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                        }`}>
                          {notification.title}
                        </h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!notification.is_read && (
                            <div className="w-2 h-2 bg-blue-600 rounded-full" />
                          )}
                          <Badge variant="outline" className="text-xs">
                            {notification.priority}
                          </Badge>
                        </div>
                      </div>
                      
                      <p className={`text-sm mt-1 ${
                        !notification.is_read ? 'text-gray-700' : 'text-gray-500'
                      }`}>
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center justify-between mt-3">
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
                </CardContent>
              </Card>
            ))}

            {/* Load More */}
            {hasMore && (
              <div className="text-center py-4">
                <Button
                  variant="outline"
                  onClick={() => loadNotifications(false)}
                  disabled={loadingNotifications}
                >
                  {loadingNotifications ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}