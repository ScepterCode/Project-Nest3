'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
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
import {
  SUPPORT_CATEGORIES,
  SupportCategory,
  SupportStatus,
  SupportStatusBadge,
  SupportThread,
} from '@/components/support/support-thread';
import { createClient } from '@/lib/supabase/client';
import { errorMessage, toast } from '@/lib/toast';

interface MyRequest {
  id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  last_activity_at: string;
}

// Anyone signed in can reach the programme team here: complaints, problems,
// questions and safeguarding concerns. Only they and the platform admins
// can read what they send.
function SupportPage() {
  const router = useRouter();
  const selected = useSearchParams().get('request');
  const [requests, setRequests] = useState<MyRequest[] | null>(null);
  const [category, setCategory] = useState<SupportCategory | ''>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    createClient()
      .from('support_requests')
      .select('id, category, subject, status, last_activity_at')
      .order('last_activity_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRequests((data as MyRequest[]) ?? []);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (id: string | null) =>
    router.replace(
      id ? `/dashboard/support?request=${id}` : '/dashboard/support'
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      toast.error('Choose what this is about');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await createClient().rpc(
        'create_support_request',
        {
          p_category: category,
          p_subject: subject.trim(),
          p_body: body.trim(),
          p_link: link.trim() || null,
        }
      );
      if (error) throw error;
      toast.success('Sent. The programme team will reply here.');
      setCategory('');
      setSubject('');
      setBody('');
      setLink('');
      load();
      open(data as string);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send your request'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LifeBuoy className="h-6 w-6" />
          Help &amp; support
        </h1>
        <p className="text-sm text-muted-foreground">
          Tell the programme team about a problem, a complaint or a question.
          Only you and the programme team can read it, and you&apos;ll be
          notified when they reply.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New request</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="support-category">What is this about?</Label>
                  <Select
                    value={category}
                    onValueChange={v => setCategory(v as SupportCategory)}
                  >
                    <SelectTrigger id="support-category">
                      <SelectValue placeholder="Choose one" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SUPPORT_CATEGORIES).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {category === 'safeguarding' && (
                  <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    Safeguarding concerns go to the programme team straight away
                    as urgent. If a child is in immediate danger, also contact
                    your school&apos;s head and the emergency services now.
                    Don&apos;t wait for a reply here.
                  </p>
                )}
                <div className="space-y-1">
                  <Label htmlFor="support-subject">Subject</Label>
                  <Input
                    id="support-subject"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    maxLength={150}
                    required
                    minLength={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="support-body">What happened?</Label>
                  <Textarea
                    id="support-body"
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={5}
                    maxLength={4000}
                    required
                    minLength={10}
                    placeholder="Say what happened, when, and in which class if it applies."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="support-link">
                    Link to a screenshot or file (optional)
                  </Label>
                  <Input
                    id="support-link"
                    type="url"
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    placeholder="https://"
                  />
                </div>
                <Button type="submit" disabled={sending} className="w-full">
                  {sending ? 'Sending…' : 'Send to the programme team'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your requests</CardTitle>
              <CardDescription>Most recent activity first.</CardDescription>
            </CardHeader>
            <CardContent>
              {!requests ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t sent any yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {requests.map(r => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => open(r.id)}
                        className={`flex w-full items-start justify-between gap-2 py-2 text-left text-sm ${
                          r.id === selected ? 'font-medium text-blue-700' : ''
                        }`}
                      >
                        <span>
                          {r.subject}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {SUPPORT_CATEGORIES[r.category]} ·{' '}
                            {new Date(r.last_activity_at).toLocaleDateString()}
                          </span>
                        </span>
                        <SupportStatusBadge status={r.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            {selected ? (
              <SupportThread requestId={selected} onChanged={load} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Choose a request to read the conversation.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupportPage />
    </Suspense>
  );
}
