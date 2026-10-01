import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Notification,
  NotificationSummary,
} from '@/lib/types/notifications';

export const EMPTY_SUMMARY: NotificationSummary = {
  total_count: 0,
  unread_count: 0,
  high_priority_count: 0,
  recent_notifications: [],
};

const RECENT_LIMIT = 5;

/**
 * Loads the notification bell's data straight from Supabase (two indexed
 * queries, run in parallel). RLS limits both to the signed-in user's own
 * notifications, so no API route or extra auth round trip is needed.
 */
export async function loadNotificationSummary(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationSummary> {
  const now = new Date().toISOString();
  const [counts, recent] = await Promise.all([
    supabase.rpc('get_notification_summary', { p_user_id: userId }),
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  if (counts.error || recent.error) {
    throw counts.error ?? recent.error;
  }

  const row = (
    counts.data as Array<Record<string, number | string>> | null
  )?.[0];
  return {
    total_count: Number(row?.total_count ?? 0),
    unread_count: Number(row?.unread_count ?? 0),
    high_priority_count: Number(row?.high_priority_count ?? 0),
    recent_notifications: (recent.data ?? []) as Notification[],
  };
}
