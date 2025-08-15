import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BulkRoleAssignmentService } from '@/lib/services/bulk-role-assignment';
import { BulkRoleAssignment } from '@/lib/types/bulk-role-assignment';

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

    // Get user details to check permissions
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

    // Check if user has permission to perform bulk role assignments
    const allowedRoles = ['institution_admin', 'department_admin'];
    if (!allowedRoles.includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const assignment: BulkRoleAssignment = {
      ...body,
      assignedBy: user.id,
      institutionId: userData.institution_id,
      validateOnly: true
    };

    // Validate required fields
    if (!assignment.userIds || assignment.userIds.length === 0) {
      return NextResponse.json(
        { error: 'User IDs are required' },
        { status: 400 }
      );
    }

    if (!assignment.role) {
      return NextResponse.json(
        { error: 'Target role is required' },
        { status: 400 }
      );
    }

    // Perform validation
    const validationResult = await bulkRoleAssignmentService.validateBulkAssignment(assignment);

    return NextResponse.json(validationResult);

  } catch (error) {
    console.error('Bulk role assignment validation error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}