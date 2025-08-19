import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedBulkUserImportService } from '@/lib/services/enhanced-bulk-user-import';

export async function GET(
  request: NextRequest,
  { params }: { params: { importId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { importId } = params;

    // Verify user has access to this import
    const { data: importRecord, error: importError } = await supabase
      .from('bulk_imports')
      .select(`
        *,
        institutions!inner(id)
      `)
      .eq('id', importId)
      .single();

    if (importError || !importRecord) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    // Check if user belongs to the same institution
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('institution_id, role')
      .eq('user_id', user.id)
      .single();

    if (!userProfile || userProfile.institution_id !== importRecord.institution_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const importService = new EnhancedBulkUserImportService();
    const status = await importService.getImportStatus(importId);

    if (!status) {
      return NextResponse.json({ error: 'Import status not found' }, { status: 404 });
    }

    return NextResponse.json(status);

  } catch (error) {
    console.error('Get import status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}