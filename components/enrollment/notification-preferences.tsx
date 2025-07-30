'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { NotificationPreferences } from '@/lib/types/enrollment';

interface NotificationPreferencesProps {
  userId: string;
  onPreferencesChange?: (preferences: NotificationPreferences) => void;
}

export function NotificationPreferencesComponent({ userId, onPreferencesChange }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPreferences();
  }, [userId]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/notifications/preferences');
      
      if (!response.ok) {
        throw new Error('Failed to load preferences');
      }

      const data = await response.json();
      setPreferences(data.preferences);
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
      setError('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    if (!preferences) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferences }),
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      const data = await response.json();
      setSuccessMessage('Notification preferences saved successfully');
      onPreferencesChange?.(data.preferences);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
      setError('Failed to save notification preferences');
    } finally {
      setSaving(false);
    }
  };

  const updatePreferences = (updates: Partial<NotificationPreferences>) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      ...updates
    });
  };

  const updateChannelPreference = (
    category: keyof Pick<NotificationPreferences, 'enrollmentConfirmation' | 'waitlistUpdates' | 'deadlineReminders' | 'capacityAlerts'>,
    channel: 'email' | 'inApp' | 'sms',
    enabled: boolean
  ) => {
    if (!preferences) return;

    setPreferences({
      ...preferences,
      [category]: {
        ...preferences[category],
        [channel]: enabled
      }
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Loading your notification settings...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!preferences) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Unable to load notification preferences</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-red-600 text-sm mb-4">{error}</div>
          )}
          <Button onClick={loadPreferences} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Customize how and when you receive enrollment notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {successMessage}
          </div>
        )}

        {/* Enrollment Confirmations */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Enrollment Confirmations</h3>
            <p className="text-sm text-gray-600">
              Notifications when your enrollment status changes
            </p>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="enrollment-email"
                checked={preferences.enrollmentConfirmation.email}
                onCheckedChange={(checked) => 
                  updateChannelPreference('enrollmentConfirmation', 'email', checked)
                }
              />
              <Label htmlFor="enrollment-email">Email</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="enrollment-in-app"
                checked={preferences.enrollmentConfirmation.inApp}
                onCheckedChange={(checked) => 
                  updateChannelPreference('enrollmentConfirmation', 'inApp', checked)
                }
              />
              <Label htmlFor="enrollment-in-app">In-App</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="enrollment-sms"
                checked={preferences.enrollmentConfirmation.sms}
                onCheckedChange={(checked) => 
                  updateChannelPreference('enrollmentConfirmation', 'sms', checked)
                }
              />
              <Label htmlFor="enrollment-sms">SMS</Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Waitlist Updates */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Waitlist Updates</h3>
            <p className="text-sm text-gray-600">
              Notifications about waitlist position changes and enrollment opportunities
            </p>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="waitlist-email"
                checked={preferences.waitlistUpdates.email}
                onCheckedChange={(checked) => 
                  updateChannelPreference('waitlistUpdates', 'email', checked)
                }
              />
              <Label htmlFor="waitlist-email">Email</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="waitlist-in-app"
                checked={preferences.waitlistUpdates.inApp}
                onCheckedChange={(checked) => 
                  updateChannelPreference('waitlistUpdates', 'inApp', checked)
                }
              />
              <Label htmlFor="waitlist-in-app">In-App</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="waitlist-sms"
                checked={preferences.waitlistUpdates.sms}
                onCheckedChange={(checked) => 
                  updateChannelPreference('waitlistUpdates', 'sms', checked)
                }
              />
              <Label htmlFor="waitlist-sms">SMS</Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Deadline Reminders */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Deadline Reminders</h3>
            <p className="text-sm text-gray-600">
              Reminders about enrollment, drop, and withdrawal deadlines
            </p>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="deadline-email"
                checked={preferences.deadlineReminders.email}
                onCheckedChange={(checked) => 
                  updateChannelPreference('deadlineReminders', 'email', checked)
                }
              />
              <Label htmlFor="deadline-email">Email</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="deadline-in-app"
                checked={preferences.deadlineReminders.inApp}
                onCheckedChange={(checked) => 
                  updateChannelPreference('deadlineReminders', 'inApp', checked)
                }
              />
              <Label htmlFor="deadline-in-app">In-App</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="deadline-sms"
                checked={preferences.deadlineReminders.sms}
                onCheckedChange={(checked) => 
                  updateChannelPreference('deadlineReminders', 'sms', checked)
                }
              />
              <Label htmlFor="deadline-sms">SMS</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-days">Reminder Schedule</Label>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 7, 14].map((days) => (
                <Badge
                  key={days}
                  variant={preferences.deadlineReminders.daysBeforeDeadline.includes(days) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    const currentDays = preferences.deadlineReminders.daysBeforeDeadline;
                    const newDays = currentDays.includes(days)
                      ? currentDays.filter(d => d !== days)
                      : [...currentDays, days].sort((a, b) => b - a);
                    
                    updatePreferences({
                      deadlineReminders: {
                        ...preferences.deadlineReminders,
                        daysBeforeDeadline: newDays
                      }
                    });
                  }}
                >
                  {days} day{days !== 1 ? 's' : ''} before
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* Capacity Alerts */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Capacity Alerts</h3>
            <p className="text-sm text-gray-600">
              Notifications about class capacity and new section availability
            </p>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="capacity-email"
                checked={preferences.capacityAlerts.email}
                onCheckedChange={(checked) => 
                  updateChannelPreference('capacityAlerts', 'email', checked)
                }
              />
              <Label htmlFor="capacity-email">Email</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="capacity-in-app"
                checked={preferences.capacityAlerts.inApp}
                onCheckedChange={(checked) => 
                  updateChannelPreference('capacityAlerts', 'inApp', checked)
                }
              />
              <Label htmlFor="capacity-in-app">In-App</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="capacity-sms"
                checked={preferences.capacityAlerts.sms}
                onCheckedChange={(checked) => 
                  updateChannelPreference('capacityAlerts', 'sms', checked)
                }
              />
              <Label htmlFor="capacity-sms">SMS</Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Digest Frequency */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Digest Frequency</h3>
            <p className="text-sm text-gray-600">
              How often to receive summary notifications
            </p>
          </div>
          
          <Select
            value={preferences.digestFrequency}
            onValueChange={(value: 'immediate' | 'daily' | 'weekly' | 'never') => 
              updatePreferences({ digestFrequency: value })
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">Immediate</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="never">Never</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            onClick={loadPreferences}
            disabled={saving}
          >
            Reset
          </Button>
          <Button
            onClick={savePreferences}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}