import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedBulkUserImportService } from '@/lib/services/enhanced-bulk-user-import';
import { FileFormat } from '@/lib/types/bulk-import';

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
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check if user has permission to import users
    if (!['institution_admin', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
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

    // Parse and validate file
    const importService = new EnhancedBulkUserImportService();
    
    // Parse file
    const parseResult = await importService.parseFile(fileContent, file.name, fileType);
    
    if (parseResult.errors.length > 0) {
      return NextResponse.json({
        success: false,
        parseResult,
        validationResult: null
      });
    }

    // Validate data
    const validationResult = await importService.validateImportData(
      userProfile.institution_id,
      parseResult.data
    );

    return NextResponse.json({
      success: true,
      parseResult,
      validationResult
    });

  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}