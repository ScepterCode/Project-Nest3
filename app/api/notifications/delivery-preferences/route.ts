import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedNotificationService } from '@/lib/services/enhanced-notification-service';

const notificationService = new EnhancedNotificationService();

export async function GET(request: NextRequest) {
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

    // Get delivery preferences
    const preferences = await notificationService.getDeliveryPreferences(user.id);

    return NextResponse.json({ 
      preferences: preferences || {
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
        digest_time: '09:00'
      }
    });

  } catch (error) {
    console.error('Get delivery preferences error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
    
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    
    if (body.preferred_time_start && !timeRegex.test(body.preferred_time_start)) {
      return NextResponse.json(
        { error: 'Invalid preferred_time_start format. Use HH:MM' },
        { status: 400 }
      );
    }
    
    if (body.preferred_time_end && !timeRegex.test(body.preferred_time_end)) {
      return NextResponse.json(
        { error: 'Invalid preferred_time_end format. Use HH:MM' },
        { status: 400 }
      );
    }
    
    if (body.quiet_hours_start && !timeRegex.test(body.quiet_hours_start)) {
      return NextResponse.json(
        { error: 'Invalid quiet_hours_start format. Use HH:MM' },
        { status: 400 }
      );
    }
    
    if (body.quiet_hours_end && !timeRegex.test(body.quiet_hours_end)) {
      return NextResponse.json(
        { error: 'Invalid quiet_hours_end format. Use HH:MM' },
        { status: 400 }
      );
    }
    
    if (body.digest_time && !timeRegex.test(body.digest_time)) {
      return NextResponse.json(
        { error: 'Invalid digest_time format. Use HH:MM' },
        { status: 400 }
      );
    }

    // Validate frequency limit
    if (body.frequency_limit && (body.frequency_limit < 1 || body.frequency_limit > 50)) {
      return NextResponse.json(
        { error: 'Frequency limit must be between 1 and 50' },
        { status: 400 }
      );
    }

    // Validate digest frequency
    if (body.digest_frequency && !['daily', 'weekly', 'monthly'].includes(body.digest_frequency)) {
      return NextResponse.json(
        { error: 'Invalid digest frequency. Must be daily, weekly, or monthly' },
        { status: 400 }
      );
    }

    // Validate digest day
    if (body.digest_day !== undefined) {
      if (body.digest_frequency === 'weekly' && (body.digest_day < 0 || body.digest_day > 6)) {
        return NextResponse.json(
          { error: 'Digest day for weekly frequency must be between 0 (Sunday) and 6 (Saturday)' },
          { status: 400 }
        );
      }
      if (body.digest_frequency === 'monthly' && (body.digest_day < 1 || body.digest_day > 31)) {
        return NextResponse.json(
          { error: 'Digest day for monthly frequency must be between 1 and 31' },
          { status: 400 }
        );
      }
    }
    
    // Update delivery preferences
    const success = await notificationService.updateDeliveryPreferences(user.id, body);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update delivery preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update delivery preferences error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}