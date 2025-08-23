import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RoleManager } from '@/lib/services/role-manager';
import { UserRole, RoleRequestStatus } from '@/lib/types/role-management';

const roleManagerConfig = {
  defaultRoleRequestExpiration: 7, // days
  maxTemporaryRoleDuration: 30, // days
  requireApprovalForRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
  autoApproveRoles: [UserRole.STUDENT]
};

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

    const body = await request.json();
    const { requestedRole, justification, institutionId, departmentId } = body;

    // Validate required fields
    if (!requestedRole || !justification || !institutionId) {
      return NextResponse.json(
        { error: 'Missing required fields: requestedRole, justification, institutionId' },
        { status: 400 }
      );
    }

    // Validate role
    if (!Object.values(UserRole).includes(requestedRole)) {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      );
    }

    // Validate justification length
    if (justification.trim().length < 20 || justification.trim().length > 500) {
      return NextResponse.json(
        { error: 'Justification must be between 20 and 500 characters' },
        { status: 400 }
      );
    }

    // Check if user belongs to the institution
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('id, institution_id, primary_role')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    if (userProfile.institution_id !== institutionId) {
      return NextResponse.json(
        { error: 'User does not belong to the specified institution' },
        { status: 403 }
      );
    }

    // Check if user already has this role
    if (userProfile.primary_role === requestedRole) {
      return NextResponse.json(
        { error: 'You already have this role' },
        { status: 400 }
      );
    }

    // Check for existing pending requests
    const { data: existingRequests, error: requestError } = await supabase
      .from('role_requests')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('requested_role', requestedRole)
      .eq('status', RoleRequestStatus.PENDING);

    if (requestError) {
      console.error('Error checking existing requests:', requestError);
      return NextResponse.json(
        { error: 'Failed to check existing requests' },
        { status: 500 }
      );
    }

    if (existingRequests && existingRequests.length > 0) {
      return NextResponse.json(
        { error: 'You already have a pending request for this role' },
        { status: 400 }
      );
    }

    // Create role request using RoleManager
    const roleManager = new RoleManager(roleManagerConfig);
    
    try {
      const roleRequest = await roleManager.requestRole(
        user.id,
        requestedRole,
        institutionId,
        justification.trim(),
        departmentId
      );

      // Save to database
      const { data: savedRequest, error: saveError } = await supabase
        .from('role_requests')
        .insert({
          id: roleRequest.id,
          user_id: roleRequest.userId,
          requested_role: roleRequest.requestedRole,
          current_role: roleRequest.currentRole,
          justification: roleRequest.justification,
          status: roleRequest.status,
          requested_at: roleRequest.requestedAt.toISOString(),
          verification_method: roleRequest.verificationMethod,
          institution_id: roleRequest.institutionId,
          department_id: roleRequest.departmentId,
          expires_at: roleRequest.expiresAt.toISOString(),
          metadata: roleRequest.metadata
        })
        .select()
        .single();

      if (saveError) {
        console.error('Error saving role request:', saveError);
        return NextResponse.json(
          { error: 'Failed to save role request' },
          { status: 500 }
        );
      }

      // If the request requires approval, notify administrators
      if (roleManagerConfig.requireApprovalForRoles.includes(requestedRole)) {
        // Get institution administrators to notify
        const { data: admins, error: adminError } = await supabase
          .from('users')
          .select('id, email, full_name')
          .eq('institution_id', institutionId)
          .in('primary_role', [UserRole.INSTITUTION_ADMIN, UserRole.DEPARTMENT_ADMIN])
          .eq('role_status', 'active');

        if (!adminError && admins && admins.length > 0) {
          // Create notifications for admins (this would typically trigger email notifications)
          const notifications = admins.map(admin => ({
            user_id: admin.id,
            type: 'role_request_pending',
            title: 'New Role Request Pending',
            message: `${userProfile.full_name || user.email} has requested ${requestedRole} role`,
            data: {
              requestId: roleRequest.id,
              requesterId: user.id,
              requesterName: userProfile.full_name || user.email,
              requestedRole: requestedRole,
              institutionId: institutionId
            },
            created_at: new Date().toISOString()
          }));

          await supabase.from('notifications').insert(notifications);
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          id: savedRequest.id,
          requestedRole: savedRequest.requested_role,
          status: savedRequest.status,
          requestedAt: savedRequest.requested_at,
          requiresApproval: roleManagerConfig.requireApprovalForRoles.includes(requestedRole)
        }
      });

    } catch (managerError) {
      console.error('RoleManager error:', managerError);
      return NextResponse.json(
        { error: managerError instanceof Error ? managerError.message : 'Failed to process role request' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Role request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const institutionId = searchParams.get('institutionId');

    // Build query
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
          full_name
        ),
        reviewer:users!role_requests_reviewed_by_fkey (
          id,
          email,
          full_name
        )
      `)
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data: requests, error: requestError } = await query;

    if (requestError) {
      console.error('Error fetching role requests:', requestError);
      return NextResponse.json(
        { error: 'Failed to fetch role requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: requests || []
    });

  } catch (error) {
    console.error('Get role requests error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}