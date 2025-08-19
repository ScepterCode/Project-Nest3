import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedNotificationService } from '@/lib/services/enhanced-notification-service';

const notificationService = new EnhancedNotificationService();

export async function POST(
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

    // Get template
    const { data: template, error: templateError } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
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

    if (template.institution_id !== userData.institution_id || 
        !['institution_admin', 'department_admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { recipients = [], variables = {} } = body;

    // Validate recipients
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipients array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Validate that recipients exist and belong to the same institution
    const { data: validRecipients, error: recipientsError } = await supabase
      .from('users')
      .select('id, email')
      .in('id', recipients)
      .eq('institution_id', userData.institution_id);

    if (recipientsError) {
      return NextResponse.json(
        { error: 'Failed to validate recipients' },
        { status: 500 }
      );
    }

    if (validRecipients.length !== recipients.length) {
      return NextResponse.json(
        { error: 'Some recipients are invalid or not in your institution' },
        { status: 400 }
      );
    }

    // Send test notifications
    const testResult = await notificationService.testTemplate(
      params.id, 
      recipients, 
      variables
    );

    return NextResponse.json({ 
      success: true, 
      result: testResult 
    });

  } catch (error) {
    console.error('Test template error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}