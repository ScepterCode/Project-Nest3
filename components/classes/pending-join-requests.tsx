'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

interface JoinRequest {
  class_id: string;
  class_name: string;
  teacher_name: string | null;
  requested_at: string;
}

/** A student's class join requests that their teacher hasn't answered yet. */
export function PendingJoinRequests() {
  const [requests, setRequests] = useState<JoinRequest[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc('my_join_requests');
    if (error) {
      console.error('Could not load join requests:', error.message);
      return;
    }
    setRequests((data as JoinRequest[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = async (request: JoinRequest) => {
    const ok = await confirmAction({
      title: `Withdraw your request to join ${request.class_name}?`,
      description: 'You can ask again later with the class code.',
      confirmLabel: 'Withdraw',
    });
    if (!ok) return;
    const { error } = await createClient().rpc('leave_class', {
      p_class: request.class_id,
    });
    if (error) {
      toast.error(errorMessage(error, 'Could not withdraw the request'));
      return;
    }
    setRequests(current =>
      current.filter(r => r.class_id !== request.class_id)
    );
    toast.success('Request withdrawn');
  };

  if (requests.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="space-y-3 p-4">
        <p className="flex items-center gap-2 font-medium text-amber-900">
          <Clock className="h-4 w-4" />
          Waiting for your tutor to accept
        </p>
        <ul className="space-y-2">
          {requests.map(request => (
            <li
              key={request.class_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2"
            >
              <div>
                <p className="font-medium">{request.class_name}</p>
                <p className="text-xs text-gray-500">
                  {request.teacher_name ? `${request.teacher_name} · ` : ''}
                  Asked {new Date(request.requested_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => withdraw(request)}
              >
                Withdraw
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
