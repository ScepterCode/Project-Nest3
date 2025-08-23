import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedNotificationService } from '@/lib/services/enhanced-notification-service';

const notificationService = new EnhancedNotificationService();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('notification_campaigns')
      .select('*')
      .eq('id', params.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check permissions
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (campaign.institution_id !== userData.institution_id || 
        !['institution_admin', 'department_admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get campaign analytics
    const analytics = await notificationService.getCampaignAnalytics(params.id);

    if (!analytics) {
      return NextResponse.json(
        { error: 'Analytics not found' },
        { status: 404 }
      );
    }

    // Get detailed engagement data
    const { data: engagementData, error: engagementError } = await supabase
      .from('notification_engagement')
      .select(`
        event_type,
        timestamp,
        event_data
      `)
      .eq('campaign_id', params.id)
      .order('timestamp', { ascending: false })
      .limit(1000);

    if (engagementError) {
      console.error('Error fetching engagement data:', engagementError);
    }

    // Process engagement data for charts
    const engagementByHour = {};
    const engagementByDay = {};
    
    if (engagementData) {
      engagementData.forEach(event => {
        const date = new Date(event.timestamp);
        const hour = date.getHours();
        const day = date.toISOString().split('T')[0];
        
        if (!engagementByHour[hour]) {
          engagementByHour[hour] = { sent: 0, opened: 0, clicked: 0 };
        }
        if (!engagementByDay[day]) {
          engagementByDay[day] = { sent: 0, opened: 0, clicked: 0 };
        }
        
        if (event.event_type in engagementByHour[hour]) {
          engagementByHour[hour][event.event_type]++;
        }
        if (event.event_type in engagementByDay[day]) {
          engagementByDay[day][event.event_type]++;
        }
      });
    }

    return NextResponse.json({
      analytics,
      engagement_by_hour: engagementByHour,
      engagement_by_day: engagementByDay,
      recent_events: engagementData?.slice(0, 50) || []
    });

  } catch (error) {
    console.error('Get campaign analytics error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}