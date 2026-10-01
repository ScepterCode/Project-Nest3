'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { UserPlus, AlertCircle, CheckCircle, Info, Clock } from 'lucide-react';
import { useSupabase } from '@/components/session-provider';
import { ROLE_LABELS } from '@/lib/bulk/roles';

// Roles a member can ask for; mirrors request_role() in the database.
const REQUESTABLE_ROLES = [
  {
    value: 'teacher',
    label: 'Teacher',
    description: 'Create and manage classes, grade assignments',
  },
  {
    value: 'institution_admin',
    label: 'Institution Admin',
    description: 'Manage users, departments and settings for your institution',
  },
] as const;

interface PendingRequest {
  id: string;
  requested_role: string;
  requested_at: string;
  expires_at: string;
}

interface RoleRequestFormProps {
  userId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function RoleRequestForm({
  userId,
  onSuccess,
  onCancel,
  className,
}: RoleRequestFormProps) {
  const supabase = useSupabase();
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestedRole, setRequestedRole] = useState('');
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: me }, { data: open }] = await Promise.all([
      supabase.from('users').select('role').eq('id', userId).single(),
      supabase
        .from('role_requests')
        .select('id, requested_role, requested_at, expires_at')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('requested_at', { ascending: false })
        .limit(1),
    ]);
    setCurrentRole(me?.role ?? null);
    setPending(open?.[0] ?? null);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedRole || !justification.trim()) {
      setError('Please select a role and explain why you need it');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    // Validation, rate limiting and notifying the admins happen in the database.
    const { error: submitError } = await supabase.rpc('request_role', {
      p_requested_role: requestedRole,
      p_justification: justification.trim(),
    });
    setIsSubmitting(false);

    if (submitError) {
      setError(submitError.message);
      return;
    }
    setRequestedRole('');
    setJustification('');
    await load();
    onSuccess?.();
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (pending) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Request pending</h3>
            <p className="text-muted-foreground">
              You asked to become{' '}
              <strong>
                {ROLE_LABELS[pending.requested_role] ?? pending.requested_role}
              </strong>{' '}
              on {new Date(pending.requested_at).toLocaleDateString()}. An
              administrator of your institution will review it, and you&apos;ll
              get a notification here when they do.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              If nobody reviews it, it expires on{' '}
              {new Date(pending.expires_at).toLocaleDateString()}.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const options = REQUESTABLE_ROLES.filter(r => r.value !== currentRole);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <UserPlus className="h-5 w-5 mr-2" />
          Request Role Change
        </CardTitle>
        <CardDescription>
          Ask an administrator of your institution for a different role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {currentRole && (
            <div>
              <Label className="text-sm font-medium">Current Role</Label>
              <div className="mt-1">
                <Badge variant="secondary">
                  {ROLE_LABELS[currentRole] ?? currentRole}
                </Badge>
              </div>
            </div>
          )}

          {options.length === 0 ? (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                There are no other roles you can request.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="role">Requested Role *</Label>
                <Select value={requestedRole} onValueChange={setRequestedRole}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select a role to request" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(role => (
                      <SelectItem key={role.value} value={role.value}>
                        <div>
                          <div className="font-medium">{role.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {role.description}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="justification">
                  Why do you need this role? *
                </Label>
                <Textarea
                  id="justification"
                  placeholder="For example: I teach Biology 101 this semester and need to create the class."
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Your institution&apos;s administrators are notified and can
                  approve or deny the request. You&apos;ll see their decision in
                  your notifications. Requests expire after 30 days.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={
                    isSubmitting || !requestedRole || !justification.trim()
                  }
                  className="flex-1"
                >
                  {isSubmitting ? 'Submitting…' : 'Submit Request'}
                </Button>
                {onCancel && (
                  <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                )}
              </div>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
