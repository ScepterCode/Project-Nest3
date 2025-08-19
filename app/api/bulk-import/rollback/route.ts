import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnhancedBulkUserImportService } from '@/lib/services/enhanced-bulk-user-import';

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

    // Check if user has permission to rollback imports
    if (!['institution_admin', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { snapshotId } = await request.json();

    if (!snapshotId) {
      return NextResponse.json({ error: 'Snapshot ID is required' }, { status: 400 });
    }

    // Verify snapshot belongs to user's institution
    const { data: snapshot, error: snapshotError } = await supabase
      .from('migration_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .eq('institution_id', userProfile.institution_id)
      .single();

    if (snapshotError || !snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    const importService = new EnhancedBulkUserImportService();
    const result = await importService.rollbackImport(snapshotId, user.id);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Rollback error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}