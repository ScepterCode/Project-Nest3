'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bell, Mail, Smartphone, Monitor, Settings } from 'lucide-react';
import { RoleNotificationPreferences } from '@/lib/services/role-notification-service';

interface RoleNotificationPreferencesProps {
  userId: string;
  onPreferencesChange?: (preferences: RoleNotificationPreferences) => void;
}

export function RoleNotificationPreferencesComponent({ 
  userId, 
  onPreferencesChange 
}: RoleNotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<RoleNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPreferences();
  }, [userId]);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/roles/notifications/preferences');
      
      if (!response.ok) {
        throw new Error('Failed to fetch preferences');
      }

      const data = await response.json();
      setPreferences(data.preferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    if (!preferences) return;

    try {
      setSaving(true);
      setError(null);

      const response = await fetch('/api/roles/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferences }),
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      onPreferencesChange?.(preferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const updatePreferences = (updates: Partial<RoleNotificationPreferences>) => {
    if (!preferences) return;
    
    const updated = { ...preferences, ...updates };
    setPreferences(updated);
  };

  const updateChannelPreference = (
    category: keyof Pick<RoleNotificationPreferences, 'roleRequests' | 'roleAssignments' | 'temporaryRoles' | 'adminNotifications'>,
    channel: 'email' | 'inApp' | 'sms',
    enabled: boolean
  ) => {
    if (!preferences) return;

    const updated = {
      ...preferences,
      [category]: {
        ...preferences[category],
        [channel]: enabled
      }
    };
    setPreferences(updated);
  };

  const updateReminderDays = (days: number[]) => {
    if (!preferences) return;

    const updated = {
      ...preferences,
      temporaryRoles: {
        ...preferences.temporaryRoles,
        reminderDays: days
      }
    };
    setPreferences(updated);
  };

  const updateDigestFrequency = (frequency: 'immediate' | 'daily' | 'weekly') => {
    if (!preferences) return;

    const updated = {
      ...preferences,
      adminNotifications: {
        ...preferences.adminNotifications,
        digestFrequency: frequency
      }
    };
    setPreferences(updated);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Role Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!preferences) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Role Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-500">Failed to load notification preferences</p>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <Button onClick={fetchPreferences} className="mt-4">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ChannelIcons = {
    email: Mail,
    inApp: Monitor,
    sms: Smartphone
  };

  const NotificationSection = ({ 
    title, 
    description, 
    preferences: sectionPrefs,
    onUpdate 
  }: {
    title: string;
    description: string;
    preferences: { email: boolean; inApp: boolean; sms: boolean };
    onUpdate: (channel: 'email' | 'inApp' | 'sms', enabled: boolean) => void;
  }) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(sectionPrefs).map(([channel, enabled]) => {
          const Icon = ChannelIcons[channel as keyof typeof ChannelIcons];
          const channelName = channel === 'inApp' ? 'In-App' : channel.charAt(0).toUpperCase() + channel.slice(1);
          
          return (
            <div key={channel} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <Label htmlFor={`${title}-${channel}`}>{channelName}</Label>
              </div>
              <Switch
                id={`${title}-${channel}`}
                checked={enabled}
                onCheckedChange={(checked) => onUpdate(channel as 'email' | 'inApp' | 'sms', checked)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Role Notification Preferences
        </CardTitle>
        <CardDescription>
          Manage how you receive notifications about role requests, assignments, and changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <NotificationSection
          title="Role Requests"
          description="Notifications about role request submissions, approvals, and denials"
          preferences={preferences.roleRequests}
          onUpdate={(channel, enabled) => updateChannelPreference('roleRequests', channel, enabled)}
        />

        <Separator />

        <NotificationSection
          title="Role Assignments"
          description="Notifications when roles are assigned, changed, or revoked"
          preferences={preferences.roleAssignments}
          onUpdate={(channel, enabled) => updateChannelPreference('roleAssignments', channel, enabled)}
        />

        <Separator />

        <div className="space-y-4">
          <div>
            <h4 className="font-medium">Temporary Roles</h4>
            <p className="text-sm text-gray-600">
              Notifications about temporary role assignments and expiration reminders
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(preferences.temporaryRoles).map(([channel, enabled]) => {
              if (channel === 'reminderDays') return null;
              
              const Icon = ChannelIcons[channel as keyof typeof ChannelIcons];
              const channelName = channel === 'inApp' ? 'In-App' : channel.charAt(0).toUpperCase() + channel.slice(1);
              
              return (
                <div key={channel} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <Label htmlFor={`temporary-${channel}`}>{channelName}</Label>
                  </div>
                  <Switch
                    id={`temporary-${channel}`}
                    checked={enabled as boolean}
                    onCheckedChange={(checked) => updateChannelPreference('temporaryRoles', channel as 'email' | 'inApp' | 'sms', checked)}
                  />
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label>Reminder Schedule</Label>
            <p className="text-sm text-gray-600">
              Get reminders before temporary roles expire
            </p>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 7, 14].map((days) => (
                <Badge
                  key={days}
                  variant={preferences.temporaryRoles.reminderDays.includes(days) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    const currentDays = preferences.temporaryRoles.reminderDays;
                    const newDays = currentDays.includes(days)
                      ? currentDays.filter(d => d !== days)
                      : [...currentDays, days].sort((a, b) => b - a);
                    updateReminderDays(newDays);
                  }}
                >
                  {days} day{days !== 1 ? 's' : ''} before
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div>
            <h4 className="font-medium">Admin Notifications</h4>
            <p className="text-sm text-gray-600">
              Notifications for administrators about pending requests and system events
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(preferences.adminNotifications).map(([channel, enabled]) => {
              if (channel === 'digestFrequency') return null;
              
              const Icon = ChannelIcons[channel as keyof typeof ChannelIcons];
              const channelName = channel === 'inApp' ? 'In-App' : channel.charAt(0).toUpperCase() + channel.slice(1);
              
              return (
                <div key={channel} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <Label htmlFor={`admin-${channel}`}>{channelName}</Label>
                  </div>
                  <Switch
                    id={`admin-${channel}`}
                    checked={enabled as boolean}
                    onCheckedChange={(checked) => updateChannelPreference('adminNotifications', channel as 'email' | 'inApp' | 'sms', checked)}
                  />
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label htmlFor="digest-frequency">Digest Frequency</Label>
            <Select
              value={preferences.adminNotifications.digestFrequency}
              onValueChange={(value: 'immediate' | 'daily' | 'weekly') => updateDigestFrequency(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediate</SelectItem>
                <SelectItem value="daily">Daily Digest</SelectItem>
                <SelectItem value="weekly">Weekly Digest</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-600">
              How often to receive summary notifications for admin activities
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button 
            onClick={savePreferences} 
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}