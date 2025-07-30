import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types/role-management';

export async function GET(request: NextRequest) {
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

    // Get user profile to check permissions
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('id, institution_id, primary_role, department_id')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to search users
    const canSearchUsers = [
      UserRole.SYSTEM_ADMIN,
      UserRole.INSTITUTION_ADMIN,
      UserRole.DEPARTMENT_ADMIN
    ].includes(userProfile.primary_role);

    if (!canSearchUsers) {
      return NextResponse.json(
        { error: 'Insufficient permissions to search users' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || 'all';
    const status = searchParams.get('status') || 'all';
    const institution = searchParams.get('institution') || 'all';
    const sortBy = searchParams.get('sortBy') || 'name';
    const sortOrder = searchParams.get('sortOrder') || 'asc';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build base query
    let query = supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        created_at,
        primary_role,
        role_status,
        institution_id,
        department_id,
        last_sign_in_at,
        institutions!users_institution_id_fkey (
          id,
          name
        ),
        departments!users_department_id_fkey (
          id,
          name
        )
      `, { count: 'exact' });

    // Apply permission-based filters
    if (userProfile.primary_role === UserRole.SYSTEM_ADMIN) {
      // System admins can see all users
      if (institution !== 'all') {
        query = query.eq('institution_id', institution);
      }
    } else if (userProfile.primary_role === UserRole.INSTITUTION_ADMIN) {
      // Institution admins can only see users from their institution
      query = query.eq('institution_id', userProfile.institution_id);
    } else if (userProfile.primary_role === UserRole.DEPARTMENT_ADMIN) {
      // Department admins can only see users from their department
      query = query
        .eq('institution_id', userProfile.institution_id)
        .eq('department_id', userProfile.department_id);
    }

    // Apply search filter
    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,id.eq.${search}`);
    }

    // Apply role filter
    if (role !== 'all') {
      query = query.eq('primary_role', role);
    }

    // Apply status filter
    if (status !== 'all') {
      query = query.eq('role_status', status);
    }

    // Apply sorting
    const sortColumn = sortBy === 'name' ? 'full_name' : sortBy;
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: users, error: usersError, count } = await query;

    if (usersError) {
      console.error('Error searching users:', usersError);
      return NextResponse.json(
        { error: 'Failed to search users' },
        { status: 500 }
      );
    }

    // Get role assignments for each user
    const userIds = (users || []).map(u => u.id);
    let roleAssignments: any[] = [];

    if (userIds.length > 0) {
      const { data: assignments, error: assignmentsError } = await supabase
        .from('user_role_assignments')
        .select('*')
        .in('user_id', userIds)
        .eq('status', 'active');

      if (!assignmentsError) {
        roleAssignments = assignments || [];
      }
    }

    // Combine user data with role assignments
    const processedUsers = (users || []).map(user => ({
      ...user,
      institution: user.institutions,
      department: user.departments,
      roles: roleAssignments.filter(ra => ra.user_id === user.id).map(ra => ({
        id: ra.id,
        userId: ra.user_id,
        role: ra.role,
        status: ra.status,
        assignedBy: ra.assigned_by,
        assignedAt: new Date(ra.assigned_at),
        expiresAt: ra.expires_at ? new Date(ra.expires_at) : undefined,
        departmentId: ra.department_id,
        institutionId: ra.institution_id,
        isTemporary: ra.is_temporary,
        metadata: ra.metadata || {},
        createdAt: new Date(ra.created_at),
        updatedAt: new Date(ra.updated_at)
      }))
    }));

    return NextResponse.json({
      success: true,
      data: {
        users: processedUsers,
        pagination: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit),
          hasMore: (count || 0) > offset + limit
        },
        filters: {
          search,
          role,
          status,
          institution,
          sortBy,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('User search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}