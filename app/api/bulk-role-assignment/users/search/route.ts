import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BulkRoleAssignmentService } from '@/lib/services/bulk-role-assignment';
import { UserSelectionCriteria } from '@/lib/types/bulk-role-assignment';

const bulkRoleAssignmentService = new BulkRoleAssignmentService();

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

    // Get user details
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check permissions
    const allowedRoles = ['institution_admin', 'department_admin'];
    if (!allowedRoles.includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const criteria: UserSelectionCriteria = {
      ...body,
      institutionId: userData.institution_id
    };

    // Search users
    const searchResult = await bulkRoleAssignmentService.searchUsers(criteria);

    return NextResponse.json(searchResult);

  } catch (error) {
    console.error('User search error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}