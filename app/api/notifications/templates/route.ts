import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedNotificationService } from '@/lib/services/enhanced-notification-service';

const notificationService = new EnhancedNotificationService();

export async function GET(request: NextRequest) {
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
    const type = searchParams.get('type');
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get templates
    const templates = await notificationService.getTemplates(userData.institution_id, {
      type: type || undefined,
      activeOnly,
      limit,
      offset
    });

    return NextResponse.json({
      templates,
      pagination: {
        limit,
        offset,
        hasMore: templates.length === limit
      }
    });

  } catch (error) {
    console.error('Get templates error:', error);
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
    const supabase = await createClient();
    
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
      type, 
      subject_template, 
      html_template, 
      text_template,
      variables = [],
      conditions = [],
      is_active = true
    } = body;

    // Validate required fields
    if (!name || !type || !subject_template || !html_template) {
      return NextResponse.json(
        { error: 'Name, type, subject_template, and html_template are required' },
        { status: 400 }
      );
    }

    // Create template
    const template = await notificationService.createTemplate(
      userData.institution_id,
      user.id,
      {
        name,
        type,
        subject_template,
        html_template,
        text_template,
        variables,
        conditions,
        is_active
      }
    );

    if (!template) {
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      template 
    }, { status: 201 });

  } catch (error) {
    console.error('Create template error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}