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

    // Get user's institution
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

    // Check permissions
    if (!['institution_admin', 'department_admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get campaigns
    let query = supabase
      .from('notification_campaigns')
      .select(`
        *,
        notification_templates(name, type)
      `)
      .eq('institution_id', userData.institution_id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data: campaigns, error: campaignsError } = await query;

    if (campaignsError) {
      return NextResponse.json(
        { error: 'Failed to fetch campaigns' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      campaigns: campaigns || [],
      pagination: {
        limit,
        offset,
        hasMore: campaigns ? campaigns.length === limit : false
      }
    });

  } catch (error) {
    console.error('Get campaigns error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

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

    // Get user's institution
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

    // Check permissions
    if (!['institution_admin', 'department_admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      name, 
      template_id, 
      target_audience, 
      ab_test_config,
      scheduled_at,
      status = 'draft'
    } = body;

    // Validate required fields
    if (!name || !template_id || !target_audience) {
      return NextResponse.json(
        { error: 'Name, template_id, and target_audience are required' },
        { status: 400 }
      );
    }

    // Validate template exists and belongs to institution
    const { data: template, error: templateError } = await supabase
      .from('notification_templates')
      .select('id')
      .eq('id', template_id)
      .eq('institution_id', userData.institution_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found or access denied' },
        { status: 400 }
      );
    }

    // Validate A/B test config if provided
    if (ab_test_config) {
      if (!ab_test_config.variant_a_template_id || !ab_test_config.variant_b_template_id) {
        return NextResponse.json(
          { error: 'A/B test requires both variant template IDs' },
          { status: 400 }
        );
      }

      // Validate both variant templates exist
      const { data: variantTemplates, error: variantError } = await supabase
        .from('notification_templates')
        .select('id')
        .in('id', [ab_test_config.variant_a_template_id, ab_test_config.variant_b_template_id])
        .eq('institution_id', userData.institution_id);

      if (variantError || !variantTemplates || variantTemplates.length !== 2) {
        return NextResponse.json(
          { error: 'One or both variant templates not found' },
          { status: 400 }
        );
      }
    }

    // Create campaign
    const campaign = await notificationService.createCampaign(
      userData.institution_id,
      user.id,
      {
        name,
        template_id,
        target_audience,
        ab_test_config,
        status,
        scheduled_at
      }
    );

    if (!campaign) {
      return NextResponse.json(
        { error: 'Failed to create campaign' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      campaign 
    }, { status: 201 });

  } catch (error) {
    console.error('Create campaign error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}