import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole, RoleRequestStatus } from '@/lib/types/role-management';

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

    // Check if user has permission to view pending requests
    const canViewRequests = [
      UserRole.SYSTEM_ADMIN,
      UserRole.INSTITUTION_ADMIN,
      UserRole.DEPARTMENT_ADMIN
    ].includes(userProfile.primary_role);

    if (!canViewRequests) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view pending role requests' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institutionId');
    const departmentId = searchParams.get('departmentId');
    const requestedRole = searchParams.get('requestedRole');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query based on user permissions
    let query = supabase
      .from('role_requests')
      .select(`
        id,
        user_id,
        requested_role,
        current_role,
        justification,
        status,
        requested_at,
        reviewed_at,
        reviewed_by,
        review_notes,
        verification_method,
        institution_id,
        department_id,
        expires_at,
        users!role_requests_user_id_fkey (
          id,
          email,
          full_name,
          created_at
        ),
        reviewer:users!role_requests_reviewed_by_fkey (
          id,
          email,
          full_name
        )
      `)
      .eq('status', RoleRequestStatus.PENDING)
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters based on user role and permissions
    if (userProfile.primary_role === UserRole.SYSTEM_ADMIN) {
      // System admins can see all requests
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }
    } else if (userProfile.primary_role === UserRole.INSTITUTION_ADMIN) {
      // Institution admins can only see requests from their institution
      query = query.eq('institution_id', userProfile.institution_id);
    } else if (userProfile.primary_role === UserRole.DEPARTMENT_ADMIN) {
      // Department admins can only see requests from their department
      query = query
        .eq('institution_id', userProfile.institution_id)
        .eq('department_id', userProfile.department_id);
    }

    // Apply additional filters
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (requestedRole) {
      query = query.eq('requested_role', requestedRole);
    }

    // Filter out expired requests
    query = query.gt('expires_at', new Date().toISOString());

    const { data: requests, error: requestError } = await query;

    if (requestError) {
      console.error('Error fetching pending role requests:', requestError);
      return NextResponse.json(
        { error: 'Failed to fetch pending role requests' },
        { status: 500 }
      );
    }

    // Get count for pagination
    let countQuery = supabase
      .from('role_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', RoleRequestStatus.PENDING)
      .gt('expires_at', new Date().toISOString());

    // Apply same filters for count
    if (userProfile.primary_role === UserRole.INSTITUTION_ADMIN) {
      countQuery = countQuery.eq('institution_id', userProfile.institution_id);
    } else if (userProfile.primary_role === UserRole.DEPARTMENT_ADMIN) {
      countQuery = countQuery
        .eq('institution_id', userProfile.institution_id)
        .eq('department_id', userProfile.department_id);
    } else if (institutionId) {
      countQuery = countQuery.eq('institution_id', institutionId);
    }

    if (departmentId) {
      countQuery = countQuery.eq('department_id', departmentId);
    }

    if (requestedRole) {
      countQuery = countQuery.eq('requested_role', requestedRole);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('Error counting pending role requests:', countError);
    }

    // Process requests to add additional metadata
    const processedRequests = (requests || []).map(request => ({
      ...request,
      canApprove: canUserApproveRequest(userProfile, request),
      daysUntilExpiration: Math.ceil(
        (new Date(request.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      ),
      isUrgent: new Date(request.expires_at).getTime() - new Date().getTime() < 2 * 24 * 60 * 60 * 1000 // Less than 2 days
    }));

    return NextResponse.json({
      success: true,
      data: {
        requests: processedRequests,
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit
        },
        summary: {
          totalPending: count || 0,
          urgent: processedRequests.filter(r => r.isUrgent).length,
          byRole: processedRequests.reduce((acc, request) => {
            acc[request.requested_role] = (acc[request.requested_role] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      }
    });

  } catch (error) {
    console.error('Get pending role requests error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function canUserApproveRequest(approver: any, request: any): boolean {
  // System admins can approve any request
  if (approver.primary_role === UserRole.SYSTEM_ADMIN) {
    return true;
  }

  // Institution admins can approve requests within their institution
  if (approver.primary_role === UserRole.INSTITUTION_ADMIN) {
    return approver.institution_id === request.institution_id;
  }

  // Department admins can approve certain roles within their department
  if (approver.primary_role === UserRole.DEPARTMENT_ADMIN) {
    // Must be same institution and department
    if (approver.institution_id !== request.institution_id ||
        approver.department_id !== request.department_id) {
      return false;
    }

    // Department admins can only approve teacher and student roles
    return [UserRole.TEACHER, UserRole.STUDENT].includes(request.requested_role);
  }

  return false;
}