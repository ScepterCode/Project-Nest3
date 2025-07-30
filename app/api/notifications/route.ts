import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { NotificationService } from '@/lib/services/notification-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const unreadOnly = searchParams.get('unread_only') === 'true';

    const notificationService = new NotificationService();
    
    if (unreadOnly) {
      const notifications = await notificationService.getUnreadNotifications(user.id, limit);
      return NextResponse.json({ notifications });
    }

    // Get all notifications with pagination
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const formattedNotifications = (notifications || []).map(notification => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      sentAt: new Date(notification.sent_at),
      read: notification.read,
      readAt: notification.read_at ? new Date(notification.read_at) : null,
      priority: notification.priority,
      channels: notification.channels,
      expiresAt: notification.expires_at ? new Date(notification.expires_at) : null
    }));

    return NextResponse.json({ notifications: formattedNotifications });
  } catch (error) {
    console.error('Failed to get notifications:', error);
    return NextResponse.json(
      { error: 'Failed to get notifications' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { notificationIds, action } = body;

    if (!notificationIds || !Array.isArray(notificationIds) || !action) {
      return NextResponse.json(
        { error: 'Notification IDs and action are required' },
        { status: 400 }
      );
    }

    const notificationService = new NotificationService();

    switch (action) {
      case 'mark_read':
        await notificationService.markNotificationsAsRead(user.id, notificationIds);
        break;
      case 'mark_unread':
        const { error } = await supabase
          .from('notifications')
          .update({ read: false, read_at: null })
          .eq('user_id', user.id)
          .in('id', notificationIds);
        if (error) throw error;
        break;
      case 'delete':
        const { error: deleteError } = await supabase
          .from('notifications')
          .delete()
          .eq('user_id', user.id)
          .in('id', notificationIds);
        if (deleteError) throw deleteError;
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({ 
      message: `Successfully ${action.replace('_', ' ')} ${notificationIds.length} notification(s)` 
    });
  } catch (error) {
    console.error('Failed to update notifications:', error);
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}