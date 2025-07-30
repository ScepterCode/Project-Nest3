"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { pushNotificationService } from '@/lib/services/push-notification-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Bell, 
  BellOff, 
  Smartphone, 
  AlertCircle, 
  CheckCircle,
  Settings,
  Loader2
} from 'lucide-react';

interface PushNotificationSetupProps {
  className?: string;
}

export function PushNotificationSetup({ className }: PushNotificationSetupProps) {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState({
    enrollmentApproved: true,
    enrollmentDenied: true,
    waitlistAdvanced: true,
    spotAvailable: true,
    deadlineReminders: true,
    enrollmentPeriodOpen: true
  });

  useEffect(() => {
    checkNotificationSupport();
    loadNotificationPreferences();
  }, [user]);

  const checkNotificationSupport = async () => {
    const supported = pushNotificationService.isSupported();
    setIsSupported(supported);
    
    if (supported) {
      setPermission(pushNotificationService.getPermission());
      
      // Initialize service worker
      const initialized = await pushNotificationService.initialize();
      if (!initialized) {
        setError('Failed to initialize push notifications');
      }
    }
  };

  const loadNotificationPreferences = async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/notifications/preferences');
      if (response.ok) {
        const data = await response.json();
        setPreferences(data.preferences || preferences);
        setIsSubscribed(data.isSubscribed || false);
      }
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    }
  };

  const handleEnableNotifications = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const subscription = await pushNotificationService.subscribe(user.id);
      if (subscription) {
        setIsSubscribed(true);
        setPermission('granted');
        
        // Save preferences
        await saveNotificationPreferences();
        
        // Show test notification
        await pushNotificationService.showNotification({
          title: 'Notifications Enabled! 🔔',
          body: 'You\'ll now receive enrollment alerts on this device',
          tag: 'setup-success'
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const success = await pushNotificationService.unsubscribe(user.id);
      if (success) {
        setIsSubscribed(false);
        await saveNotificationPreferences();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable notifications');
    } finally {
      setLoading(false);
    }
  };

  const handlePreferenceChange = async (key: keyof typeof preferences, value: boolean) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    await saveNotificationPreferences(newPreferences);
  };

  const saveNotificationPreferences = async (prefs = preferences) => {
    if (!user) return;

    try {
      await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferences: prefs,
          isSubscribed
        })
      });
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
    }
  };

  const sendTestNotification = async () => {
    try {
      await pushNotificationService.sendEnrollmentNotification('spot_available', {
        className: 'Introduction to Computer Science',
        classId: 'test-class-id'
      });
    } catch (err) {
      setError('Failed to send test notification');
    }
  };

  if (!isSupported) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BellOff className="h-5 w-5" />
            <span>Push Notifications</span>
          </CardTitle>
          <CardDescription>
            Push notifications are not supported on this device or browser
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              To receive enrollment alerts, try using a modern browser like Chrome, Firefox, or Safari on a supported device.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bell className="h-5 w-5" />
          <span>Push Notifications</span>
          <Badge variant={isSubscribed ? "default" : "secondary"}>
            {isSubscribed ? 'Enabled' : 'Disabled'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Get instant alerts about enrollment opportunities and deadlines
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Enable/Disable Notifications */}
        <div className="space-y-4">
          {permission === 'denied' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Notifications are blocked. Please enable them in your browser settings and refresh the page.
              </AlertDescription>
            </Alert>
          )}

          {permission !== 'denied' && (
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">Enable Push Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Receive enrollment alerts even when the app is closed
                </p>
              </div>
              <Button
                onClick={isSubscribed ? handleDisableNotifications : handleEnableNotifications}
                disabled={loading}
                variant={isSubscribed ? "outline" : "default"}
                className="flex items-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSubscribed ? (
                  <BellOff className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                <span>{isSubscribed ? 'Disable' : 'Enable'}</span>
              </Button>
            </div>
          )}
        </div>

        {/* Notification Preferences */}
        {isSubscribed && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <h4 className="font-medium">Notification Types</h4>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enrollment Approved</p>
                  <p className="text-xs text-muted-foreground">When your enrollment request is approved</p>
                </div>
                <Switch
                  checked={preferences.enrollmentApproved}
                  onCheckedChange={(value) => handlePreferenceChange('enrollmentApproved', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enrollment Denied</p>
                  <p className="text-xs text-muted-foreground">When your enrollment request is denied</p>
                </div>
                <Switch
                  checked={preferences.enrollmentDenied}
                  onCheckedChange={(value) => handlePreferenceChange('enrollmentDenied', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Waitlist Updates</p>
                  <p className="text-xs text-muted-foreground">When your waitlist position changes</p>
                </div>
                <Switch
                  checked={preferences.waitlistAdvanced}
                  onCheckedChange={(value) => handlePreferenceChange('waitlistAdvanced', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Spots Available</p>
                  <p className="text-xs text-muted-foreground">When a spot opens in a waitlisted class</p>
                </div>
                <Switch
                  checked={preferences.spotAvailable}
                  onCheckedChange={(value) => handlePreferenceChange('spotAvailable', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Deadline Reminders</p>
                  <p className="text-xs text-muted-foreground">Reminders for drop/withdraw deadlines</p>
                </div>
                <Switch
                  checked={preferences.deadlineReminders}
                  onCheckedChange={(value) => handlePreferenceChange('deadlineReminders', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enrollment Periods</p>
                  <p className="text-xs text-muted-foreground">When enrollment opens for new terms</p>
                </div>
                <Switch
                  checked={preferences.enrollmentPeriodOpen}
                  onCheckedChange={(value) => handlePreferenceChange('enrollmentPeriodOpen', value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Test Notification */}
        {isSubscribed && (
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={sendTestNotification}
              className="flex items-center space-x-2"
            >
              <Smartphone className="h-4 w-4" />
              <span>Send Test Notification</span>
            </Button>
          </div>
        )}

        {/* Mobile-specific tips */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start space-x-2">
            <Smartphone className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Mobile Tips:</p>
              <ul className="text-blue-700 mt-1 space-y-1">
                <li>• Add this app to your home screen for the best experience</li>
                <li>• Notifications work even when the app is closed</li>
                <li>• Check your device's notification settings if alerts aren't appearing</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}