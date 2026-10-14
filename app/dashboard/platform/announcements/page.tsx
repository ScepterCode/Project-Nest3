'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, platformRpc } from '@/lib/platform/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

const AUDIENCES: Record<string, string> = {
  admins: 'School admins',
  teachers: 'Teachers',
  students: 'Students',
  everyone: 'Everyone',
};
const ALL_SCHOOLS = 'all';

interface Sent {
  id: string;
  audience: string;
  school_name: string | null;
  title: string;
  message: string;
  recipients: number;
  created_at: string;
}

export default function PlatformAnnouncementsPage() {
  const [audience, setAudience] = useState('admins');
  const [school, setSchool] = useState(ALL_SCHOOLS);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [history, setHistory] = useState<Sent[] | null>(null);

  const load = useCallback(() => {
    platformRpc<Sent[]>('platform_list_announcements')
      .then(setHistory)
      .catch(e =>
        toast.error(errorMessage(e, 'Could not load past announcements'))
      );
  }, []);

  useEffect(() => {
    load();
    platformRpc<{ id: string; name: string }[]>('platform_schools')
      .then(rows =>
        setSchools((rows ?? []).map(r => ({ id: r.id, name: r.name })))
      )
      .catch(() => setSchools([]));
  }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const schoolName = schools.find(s => s.id === school)?.name;
    const ok = await confirmAction({
      title: `Send to ${AUDIENCES[audience].toLowerCase()}${schoolName ? ` at ${schoolName}` : ' at every school'}?`,
      description: `"${title.trim()}" appears in their notification bell. People who turned off general messages won't get it.`,
      confirmLabel: 'Send',
    });
    if (!ok) return;
    setSending(true);
    try {
      const count = await platformRpc<number>('platform_send_announcement', {
        p_audience: audience,
        p_title: title,
        p_message: message,
        p_school: school === ALL_SCHOOLS ? null : school,
      });
      toast.success(
        count === 1 ? 'Sent to 1 person' : `Sent to ${count} people`
      );
      setTitle('');
      setMessage('');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the announcement'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New announcement</CardTitle>
          <CardDescription>
            Sent as a notification, for things like term dates, maintenance or
            programme news.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={send} className="max-w-2xl space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Send to</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUDIENCES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>At</Label>
                <Select value={school} onValueChange={setSchool}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SCHOOLS}>Every school</SelectItem>
                    {schools.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Title</Label>
              <Input
                id="announcement-title"
                value={title}
                maxLength={200}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-message">Message</Label>
              <Textarea
                id="announcement-message"
                value={message}
                maxLength={2000}
                rows={4}
                onChange={e => setMessage(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={
                sending || title.trim().length < 2 || message.trim().length < 2
              }
            >
              {sending ? 'Sending…' : 'Send announcement'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sent</CardTitle>
        </CardHeader>
        <CardContent>
          {!history ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {history.map(a => (
                <li key={a.id} className="py-3">
                  <p className="font-medium">{a.title}</p>
                  <p className="whitespace-pre-line text-gray-700">
                    {a.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {AUDIENCES[a.audience] ?? a.audience} ·{' '}
                    {a.school_name ?? 'every school'} · {a.recipients}{' '}
                    {a.recipients === 1 ? 'person' : 'people'} ·{' '}
                    {formatDate(a.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
