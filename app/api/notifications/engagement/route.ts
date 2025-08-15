import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedNotificationService } from '@/lib/services/enhanced-notification-service';

const notificationService = new EnhancedNotificationService();

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      notification_id, 
      event_type, 
      campaign_id,
      event_data = {},
      user_agent,
      ip_address
    } = body;

    // Validate required fields
    if (!notification_id || !event_type) {
      return NextResponse.json(
        { error: 'notification_id and event_type are required' },
        { status: 400 }
      );
    }

    // Validate event type
    const validEventTypes = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed'];
    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { error: 'Invalid event_type' },
        { status: 400 }
      );
    }

    // Verify notification exists and belongs to user
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .select('id, user_id')
      .eq('id', notification_id)
      .single();

    if (notificationError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    if (notification.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get client IP and user agent from headers if not provided
    const clientIP = ip_address || 
      request.headers.get('x-forwarded-for') || 
      request.headers.get('x-real-ip') || 
      'unknown';
    
    const clientUserAgent = user_agent || 
      request.headers.get('user-agent') || 
      'unknown';

    // Track engagement
    const success = await notificationService.trackEngagement(
      notification_id,
      user.id,
      event_type,
      campaign_id,
      event_data,
      clientUserAgent,
      clientIP
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to track engagement' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Track engagement error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Handle pixel tracking for email opens
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('notification_id');
    const campaignId = searchParams.get('campaign_id');
    const userId = searchParams.get('user_id');

    if (!notificationId || !userId) {
      // Return a 1x1 transparent pixel
      const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      );
      
      return new NextResponse(pixel, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': pixel.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    // Track the open event
    const supabase = createClient();
    
    // Get client info
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const clientIP = request.headers.get('x-forwarded-for') || 
      request.headers.get('x-real-ip') || 
      'unknown';

    // Track engagement (don't wait for response)
    notificationService.trackEngagement(
      notificationId,
      userId,
      'opened',
      campaignId,
      { tracking_method: 'pixel' },
      userAgent,
      clientIP
    ).catch(error => {
      console.error('Error tracking pixel engagement:', error);
    });

    // Return tracking pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    return new NextResponse(pixel, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': pixel.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('Pixel tracking error:', error);
    
    // Always return a pixel even on error
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    return new NextResponse(pixel, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': pixel.length.toString()
      }
    });
  }
}