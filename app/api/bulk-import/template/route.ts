import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedBulkUserImportService } from '@/lib/services/enhanced-bulk-user-import';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile and check permissions
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check if user has permission to access templates
    if (!['institution_admin', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') as 'csv' | 'json' | null;

    if (!format || !['csv', 'json'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format. Use csv or json' }, { status: 400 });
    }

    const importService = new EnhancedBulkUserImportService();

    if (format === 'csv') {
      const csvTemplate = importService.generateCSVTemplate();
      
      return new NextResponse(csvTemplate, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="user-import-template.csv"'
        }
      });
    } else if (format === 'json') {
      const template = importService.getImportTemplate();
      const jsonTemplate = {
        description: 'User import template',
        requiredFields: template.requiredFields,
        optionalFields: template.optionalFields,
        fieldDescriptions: template.fieldDescriptions,
        sampleData: template.sampleData
      };
      
      return new NextResponse(JSON.stringify(jsonTemplate, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="user-import-template.json"'
        }
      });
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });

  } catch (error) {
    console.error('Template generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}