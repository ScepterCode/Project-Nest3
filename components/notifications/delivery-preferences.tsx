'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Save, 
  Bell, 
  Clock, 
  Mail, 
  Smartphone, 
  MessageSquare,
  Settings,
  Volume2,
  VolumeX
} from 'lucide-react';
import { DeliveryPreferences } from '@/lib/types/enhanced-notifications';
import { useAuth } from '@/contexts/auth-context';

interface DeliveryPreferencesProps {
  preferences?: DeliveryPreferences;
  onSave: (preferences: Partial<DeliveryPreferences>) => Promise<void>;
}

export function DeliveryPreferencesManager({ preferences, onSave }: DeliveryPreferencesProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<Partial<DeliveryPreferences>>({
    email_enabled: true,
    push_enabled: true,
    sms_enabled: false,
    preferred_time_start: '09:00',
    preferred_time_end: '17:00',
    time_zone: 'UTC',
    frequency_limit: 10,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    digest_enabled: false,
    digest_frequency: 'daily',
    digest_time: '09:00',
    ...preferences
  });

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('channels');

  useEffect(() => {
    if (preferences) {
      setFormData(preferences);
    }
  }, [preferences]);

  const handleInputChange = (field: keyof DeliveryPreferences, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  const timeZones = [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
    { value: 'Europe/Paris', label: 'Central European Time (CET)' },
    { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
    { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
    { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' }
  ];

  const generateTimeOptions = () => {
    const times = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayTime = new Date(`2000-01-01T${timeString}`).toLocaleTimeString([], { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        times.push({ value: timeString, label: displayTime });
      }
    }
    return times;
  };

  const timeOptions = generateTimeOptions();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Notification Preferences</h2>
          <p className="text-gray-600">
            Customize how and when you receive notifications
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="timing">Timing</TabsTrigger>
          <TabsTrigger value="frequency">Frequency</TabsTrigger>
          <TabsTrigger value="digest">Digest</TabsTrigger>
        </TabsList>

        {/* Channels Tab */}
        <TabsContent value="channels" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notification Channels
              </CardTitle>
              <p className="text-sm text-gray-600">
                Choose how you want to receive notifications
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Email Notifications */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-blue-500" />
                  <div>
                    <h4 className="font-medium">Email Notifications</h4>
                    <p className="text-sm text-gray-600">
                      Receive notifications via email
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.email_enabled}
                  onCheckedChange={(checked) => handleInputChange('email_enabled', checked)}
                />
              </div>

              {/* Push Notifications */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-green-500" />
                  <div>
                    <h4 className="font-medium">Push Notifications</h4>
                    <p className="text-sm text-gray-600">
                      Receive browser and mobile push notifications
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.push_enabled}
                  onCheckedChange={(checked) => handleInputChange('push_enabled', checked)}
                />
              </div>

              {/* SMS Notifications */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-purple-500" />
                  <div>
                    <h4 className="font-medium">SMS Notifications</h4>
                    <p className="text-sm text-gray-600">
                      Receive notifications via text message (premium feature)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.sms_enabled}
                  onCheckedChange={(checked) => handleInputChange('sms_enabled', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timing Tab */}
        <TabsContent value="timing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Preferred Hours
              </CardTitle>
              <p className="text-sm text-gray-600">
                Set your preferred hours for receiving notifications
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="time_zone">Time Zone</Label>
                <Select
                  value={formData.time_zone}
                  onValueChange={(value) => handleInputChange('time_zone', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select time zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeZones.map(tz => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="preferred_time_start">Preferred Start Time</Label>
                  <Select
                    value={formData.preferred_time_start}
                    onValueChange={(value) => handleInputChange('preferred_time_start', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Start time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map(time => (
                        <SelectItem key={time.value} value={time.value}>
                          {time.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="preferred_time_end">Preferred End Time</Label>
                  <Select
                    value={formData.preferred_time_end}
                    onValueChange={(value) => handleInputChange('preferred_time_end', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="End time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map(time => (
                        <SelectItem key={time.value} value={time.value}>
                          {time.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {formData.quiet_hours_enabled ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                Quiet Hours
              </CardTitle>
              <p className="text-sm text-gray-600">
                Set hours when you don't want to receive notifications
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.quiet_hours_enabled}
                  onCheckedChange={(checked) => handleInputChange('quiet_hours_enabled', checked)}
                />
                <Label>Enable quiet hours</Label>
              </div>

              {formData.quiet_hours_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="quiet_hours_start">Quiet Hours Start</Label>
                    <Select
                      value={formData.quiet_hours_start}
                      onValueChange={(value) => handleInputChange('quiet_hours_start', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Start time" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeOptions.map(time => (
                          <SelectItem key={time.value} value={time.value}>
                            {time.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="quiet_hours_end">Quiet Hours End</Label>
                    <Select
                      value={formData.quiet_hours_end}
                      onValueChange={(value) => handleInputChange('quiet_hours_end', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="End time" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeOptions.map(time => (
                          <SelectItem key={time.value} value={time.value}>
                            {time.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Frequency Tab */}
        <TabsContent value="frequency" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Frequency Limits
              </CardTitle>
              <p className="text-sm text-gray-600">
                Control how many notifications you receive
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="frequency_limit">
                  Maximum notifications per day: {formData.frequency_limit}
                </Label>
                <Input
                  id="frequency_limit"
                  type="range"
                  min="1"
                  max="50"
                  value={formData.frequency_limit}
                  onChange={(e) => handleInputChange('frequency_limit', parseInt(e.target.value))}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>25</span>
                  <span>50</span>
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">How it works</h4>
                <p className="text-sm text-blue-800">
                  When you reach your daily limit, only urgent notifications will be delivered. 
                  Other notifications will be held for your daily digest.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Digest Tab */}
        <TabsContent value="digest" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Digest</CardTitle>
              <p className="text-sm text-gray-600">
                Receive a summary of notifications at regular intervals
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.digest_enabled}
                  onCheckedChange={(checked) => handleInputChange('digest_enabled', checked)}
                />
                <Label>Enable notification digest</Label>
              </div>

              {formData.digest_enabled && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="digest_frequency">Digest Frequency</Label>
                    <Select
                      value={formData.digest_frequency}
                      onValueChange={(value) => handleInputChange('digest_frequency', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.digest_frequency === 'weekly' && (
                    <div>
                      <Label htmlFor="digest_day">Day of Week</Label>
                      <Select
                        value={formData.digest_day?.toString()}
                        onValueChange={(value) => handleInputChange('digest_day', parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select day" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Sunday</SelectItem>
                          <SelectItem value="1">Monday</SelectItem>
                          <SelectItem value="2">Tuesday</SelectItem>
                          <SelectItem value="3">Wednesday</SelectItem>
                          <SelectItem value="4">Thursday</SelectItem>
                          <SelectItem value="5">Friday</SelectItem>
                          <SelectItem value="6">Saturday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {formData.digest_frequency === 'monthly' && (
                    <div>
                      <Label htmlFor="digest_day">Day of Month</Label>
                      <Input
                        id="digest_day"
                        type="number"
                        min="1"
                        max="31"
                        value={formData.digest_day || 1}
                        onChange={(e) => handleInputChange('digest_day', parseInt(e.target.value))}
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="digest_time">Digest Time</Label>
                    <Select
                      value={formData.digest_time}
                      onValueChange={(value) => handleInputChange('digest_time', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select time" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeOptions.map(time => (
                          <SelectItem key={time.value} value={time.value}>
                            {time.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="p-4 bg-green-50 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">Digest Benefits</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Reduces notification fatigue</li>
                  <li>• Provides organized summary of activities</li>
                  <li>• Includes notifications that exceeded daily limits</li>
                  <li>• Can be customized to your schedule</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}