'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import { errorMessage, toast } from '@/lib/toast';

// The database skips notifications in a category that's switched off
// (supabase/migrations/20261015120000_school_setup_and_notification_settings.sql).
type Preference =
  | 'assignment_notifications'
  | 'grade_notifications'
  | 'announcement_notifications'
  | 'system_notifications';

const CATEGORIES: { key: Preference; label: string; help: string }[] = [
  {
    key: 'assignment_notifications',
    label: 'Assignments',
    help: 'New assignments, due-date reminders, and (for teachers) work handed in.',
  },
  {
    key: 'grade_notifications',
    label: 'Grades',
    help: 'When your work is graded.',
  },
  {
    key: 'announcement_notifications',
    label: 'Class updates',
    help: 'New study materials and class announcements.',
  },
  {
    key: 'system_notifications',
    label: 'General messages',
    help: 'Other messages from ProjectNest.',
  },
];

type Preferences = Record<Preference, boolean>;
const DEFAULTS: Preferences = {
  assignment_notifications: true,
  grade_notifications: true,
  announcement_notifications: true,
  system_notifications: true,
};

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Preference | null>(null);

  useEffect(() => {
    if (!user) return;
    createClient()
      .from('notification_preferences')
      .select(CATEGORIES.map(c => c.key).join(', '))
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          toast.error(errorMessage(error, 'Could not load your settings'));
        } else if (data) {
          setPrefs({
            ...DEFAULTS,
            ...(data as unknown as Partial<Preferences>),
          });
        }
        setLoading(false);
      });
  }, [user]);

  const change = async (key: Preference, value: boolean) => {
    if (!user) return;
    const previous = prefs[key];
    setPrefs(p => ({ ...p, [key]: value }));
    setSaving(key);
    const { error } = await createClient()
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          [key]: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    setSaving(null);
    if (error) {
      setPrefs(p => ({ ...p, [key]: previous }));
      toast.error(errorMessage(error, 'Could not save that setting'));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/notifications">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to notifications
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Notification settings</CardTitle>
          <CardDescription>
            Choose what appears in your notification bell. Join requests and
            their answers, and changes to your account, are always sent because
            they need action.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {CATEGORIES.map(category => (
            <div
              key={category.key}
              className="flex items-center justify-between gap-4 py-4"
            >
              <div>
                <Label htmlFor={category.key} className="text-base">
                  {category.label}
                </Label>
                <p className="text-sm text-muted-foreground">{category.help}</p>
              </div>
              <Switch
                id={category.key}
                checked={prefs[category.key]}
                disabled={loading || saving === category.key}
                onCheckedChange={value => change(category.key, value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
