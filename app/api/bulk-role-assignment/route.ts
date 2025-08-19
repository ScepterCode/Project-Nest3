import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BulkRoleAssignmentService } from '@/lib/services/bulk-role-assignment';
import { BulkRoleAssignment } from '@/lib/types/bulk-role-assignment';

const bulkRoleAssignmentService = new BulkRoleAssignmentService();

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
      institutionId: userData.institution_id
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

    if (!assignment.justification) {
      return NextResponse.json(
        { error: 'Justification is required' },
        { status: 400 }
      );
    }

    // Process the bulk assignment
    const result = await bulkRoleAssignmentService.assignRolesToUsers(assignment);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Bulk role assignment error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('bulk_role_assignments')
      .select(`
        *,
        users!bulk_role_assignments_initiated_by_fkey(first_name, last_name, email)
      `)
      .eq('institution_id', userData.institution_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: assignments, error: assignmentsError, count } = await query;

    if (assignmentsError) {
      throw assignmentsError;
    }

    return NextResponse.json({
      assignments: assignments || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Get bulk assignments error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}