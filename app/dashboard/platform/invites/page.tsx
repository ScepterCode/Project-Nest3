'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { PlatformInvite, formatDate, platformRpc } from '@/lib/platform/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

const STATUS: Record<
  PlatformInvite['status'],
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
  }
> = {
  unused: { label: 'Not used yet', variant: 'default' },
  used: { label: 'Used', variant: 'secondary' },
  expired: { label: 'Expired', variant: 'outline' },
  revoked: { label: 'Cancelled', variant: 'destructive' },
};

function inviteMessage(code: string, note: string | null) {
  const signUp = `${window.location.origin}/auth/sign-up`;
  return [
    `You're invited to set up your school on ProjectNest${note ? ` (${note})` : ''}.`,
    '',
    `1. Go to ${signUp}`,
    '2. Choose "School admin" as your role.',
    `3. Enter this admin invite code: ${code}`,
    '',
    'The code works once. After signing up you’ll fill in a short form about your school.',
  ].join('\n');
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('Could not copy; select the text and copy it instead');
  }
}

export default function PlatformInvitesPage() {
  const [invites, setInvites] = useState<PlatformInvite[] | null>(null);
  const [note, setNote] = useState('');
  const [days, setDays] = useState('14');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{
    code: string;
    note: string | null;
  } | null>(null);

  const load = useCallback(() => {
    platformRpc<PlatformInvite[]>('platform_list_invites')
      .then(setInvites)
      .catch(e => toast.error(errorMessage(e, 'Could not load invites')));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const code = await platformRpc<string>('platform_create_invite', {
        p_note: note.trim() || null,
        p_valid_days: Number(days) || 14,
      });
      setCreated({ code, note: note.trim() || null });
      setNote('');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the invite'));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (invite: PlatformInvite) => {
    const ok = await confirmAction({
      title: `Cancel invite ${invite.code}?`,
      description: 'It stops working straight away.',
      confirmLabel: 'Cancel invite',
      destructive: true,
    });
    if (!ok) return;
    try {
      await platformRpc('platform_revoke_invite', { p_code: invite.code });
      toast.success('Invite cancelled');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not cancel the invite'));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New admin invite</CardTitle>
          <CardDescription>
            One code lets one person sign up as a school admin. Add a note so
            you know who it was for.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={create} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1 space-y-2">
              <Label htmlFor="invite-note">Note</Label>
              <Input
                id="invite-note"
                placeholder="e.g. Lagos Animation Academy – Mrs Ade"
                value={note}
                maxLength={300}
                onChange={e => setNote(e.target.value)}
              />
            </div>
            <div className="w-28 space-y-2">
              <Label htmlFor="invite-days">Valid for (days)</Label>
              <Input
                id="invite-days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={e => setDays(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create invite'}
            </Button>
          </form>

          {created && (
            <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-4">
              <p className="text-sm">
                Invite created{created.note ? ` for ${created.note}` : ''}:
              </p>
              <code className="block font-mono text-2xl tracking-widest">
                {created.code}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(created.code, 'Code copied')}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy code
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copy(
                      inviteMessage(created.code, created.note),
                      'Message copied: paste it into an email or WhatsApp'
                    )
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy invitation message
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All invites</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!invites ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Code</th>
                  <th className="py-2 font-normal">Note</th>
                  <th className="py-2 font-normal">Status</th>
                  <th className="py-2 font-normal">Details</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {invites.map(invite => (
                  <tr key={invite.code} className="border-t align-top">
                    <td className="py-2 font-mono">{invite.code}</td>
                    <td className="py-2">{invite.note ?? '—'}</td>
                    <td className="py-2">
                      <Badge variant={STATUS[invite.status].variant}>
                        {STATUS[invite.status].label}
                      </Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {invite.status === 'used'
                        ? `${invite.used_by_name ?? invite.used_by_email ?? 'Someone'} on ${formatDate(invite.used_at)}${invite.school_name ? ` · ${invite.school_name}` : ''}`
                        : invite.status === 'revoked'
                          ? `Cancelled ${formatDate(invite.revoked_at)}`
                          : `${invite.status === 'expired' ? 'Expired' : 'Expires'} ${formatDate(invite.expires_at)}`}
                    </td>
                    <td className="py-2 text-right">
                      {invite.status === 'unused' && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              copy(
                                inviteMessage(invite.code, invite.note),
                                'Message copied'
                              )
                            }
                          >
                            Copy message
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => revoke(invite)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
