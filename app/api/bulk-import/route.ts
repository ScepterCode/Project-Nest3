import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedBulkUserImportService } from '@/lib/services/enhanced-bulk-user-import';
import { BulkImportOptions, FileFormat } from '@/lib/types/bulk-import';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile and check permissions
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*, institutions(*)')
      .eq('user_id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check if user has permission to import users
    if (!['institution_admin', 'department_admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const optionsJson = formData.get('options') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Parse options
    let options: BulkImportOptions;
    try {
      options = JSON.parse(optionsJson);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid options format' }, { status: 400 });
    }

    // Validate file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    let fileType: FileFormat;
    
    switch (fileExtension) {
      case 'csv':
        fileType = 'csv';
        break;
      case 'xlsx':
      case 'xls':
        fileType = 'excel';
        break;
      case 'json':
        fileType = 'json';
        break;
      default:
        return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    // Read file content
    const fileContent = fileType === 'excel' 
      ? Buffer.from(await file.arrayBuffer())
      : await file.text();

    // Process import
    const importService = new EnhancedBulkUserImportService();
    const result = await importService.processImport(
      userProfile.institution_id,
      user.id,
      fileContent,
      file.name,
      fileType,
      options
    );

    return NextResponse.json(result);

  } catch (error) {
    console.error('Bulk import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check permissions
    if (!['institution_admin', 'department_admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const importService = new EnhancedBulkUserImportService();
    const history = await importService.getImportHistory(userProfile.institution_id);

    return NextResponse.json({ imports: history });

  } catch (error) {
    console.error('Get import history error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}