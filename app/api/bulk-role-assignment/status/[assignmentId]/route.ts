import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BulkRoleAssignmentService } from '@/lib/services/bulk-role-assignment';

const bulkRoleAssignmentService = new BulkRoleAssignmentService();

export async function GET(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
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

    const { assignmentId } = params;

    // Verify assignment belongs to user's institution
    const { data: assignment, error: assignmentError } = await supabase
      .from('bulk_role_assignments')
      .select('institution_id')
      .eq('id', assignmentId)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      );
    }

    if (assignment.institution_id !== userData.institution_id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get assignment status
    const status = await bulkRoleAssignmentService.getBulkAssignmentStatus(assignmentId);

    return NextResponse.json(status);

  } catch (error) {
    console.error('Get assignment status error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}