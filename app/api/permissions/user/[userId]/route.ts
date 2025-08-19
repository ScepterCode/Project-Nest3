import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionChecker } from '@/lib/services/permission-checker';
import { UserRole } from '@/lib/types/role-management';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
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

    const targetUserId = params.userId;
    const { searchParams } = new URL(request.url);
    const includeExpired = searchParams.get('includeExpired') === 'true';
    const institutionId = searchParams.get('institutionId');
    const departmentId = searchParams.get('departmentId');

    // Validate that user can access this information
    const canAccess = await validatePermissionAccess(user.id, targetUserId, supabase);
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view user permissions' },
        { status: 403 }
      );
    }

    // Get user's role assignments
    let roleQuery = supabase
      .from('user_role_assignments')
      .select(`
        id,
        role,
        status,
        assigned_at,
        expires_at,
        is_temporary,
        department_id,
        institution_id,
        departments (
          id,
          name
        ),
        institutions (
          id,
          name
        )
      `)
      .eq('user_id', targetUserId);

    if (!includeExpired) {
      roleQuery = roleQuery.eq('status', 'active');
    }

    if (institutionId) {
      roleQuery = roleQuery.eq('institution_id', institutionId);
    }

    if (departmentId) {
      roleQuery = roleQuery.eq('department_id', departmentId);
    }

    const { data: roleAssignments, error: roleError } = await roleQuery.order('assigned_at', { ascending: false });

    if (roleError) {
      console.error('Error fetching role assignments:', roleError);
      return NextResponse.json(
        { error: 'Failed to fetch user roles' },
        { status: 500 }
      );
    }

    // Get permissions for each role
    const permissionChecker = new PermissionChecker();
    const allPermissions = await permissionChecker.getUserPermissions(targetUserId);

    // Get detailed permission information
    const { data: permissionDetails, error: permissionError } = await supabase
      .from('permissions')
      .select('*')
      .in('id', allPermissions.map(p => p.id));

    if (permissionError) {
      console.error('Error fetching permission details:', permissionError);
      return NextResponse.json(
        { error: 'Failed to fetch permission details' },
        { status: 500 }
      );
    }

    // Group permissions by category
    const permissionsByCategory = permissionDetails?.reduce((acc, permission) => {
      if (!acc[permission.category]) {
        acc[permission.category] = [];
      }
      acc[permission.category].push(permission);
      return acc;
    }, {} as Record<string, any[]>) || {};

    // Get user profile information
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('id, email, full_name, primary_role, role_status')
      .eq('id', targetUserId)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: userProfile.id,
          email: userProfile.email,
          fullName: userProfile.full_name,
          primaryRole: userProfile.primary_role,
          roleStatus: userProfile.role_status
        },
        roleAssignments: roleAssignments || [],
        permissions: {
          total: allPermissions.length,
          byCategory: permissionsByCategory,
          details: permissionDetails || []
        },
        summary: {
          activeRoles: roleAssignments?.filter(r => r.status === 'active').length || 0,
          temporaryRoles: roleAssignments?.filter(r => r.is_temporary && r.status === 'active').length || 0,
          expiredRoles: roleAssignments?.filter(r => r.status === 'expired').length || 0,
          totalPermissions: allPermissions.length
        }
      }
    });

  } catch (error) {
    console.error('Get user permissions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Check if the requesting user can access permission information for the target user
 */
async function validatePermissionAccess(requesterId: string, targetUserId: string, supabase: any): Promise<boolean> {
  // Users can always view their own permissions
  if (requesterId === targetUserId) {
    return true;
  }

  // Get requester's role information
  const { data: requesterRoles, error } = await supabase
    .from('user_role_assignments')
    .select('role, institution_id, department_id, status')
    .eq('user_id', requesterId)
    .eq('status', 'active');

  if (error || !requesterRoles) {
    return false;
  }

  // System admins can view anyone's permissions
  if (requesterRoles.some((r: any) => r.role === UserRole.SYSTEM_ADMIN)) {
    return true;
  }

  // Get target user's institution/department information
  const { data: targetRoles, error: targetError } = await supabase
    .from('user_role_assignments')
    .select('institution_id, department_id')
    .eq('user_id', targetUserId)
    .eq('status', 'active');

  if (targetError || !targetRoles) {
    return false;
  }

  // Institution admins can view permissions of users in their institution
  const institutionAdminRoles = requesterRoles.filter((r: any) => r.role === UserRole.INSTITUTION_ADMIN);
  if (institutionAdminRoles.length > 0) {
    const requesterInstitutions = institutionAdminRoles.map((r: any) => r.institution_id);
    const targetInstitutions = targetRoles.map((r: any) => r.institution_id);
    
    if (requesterInstitutions.some(instId => targetInstitutions.includes(instId))) {
      return true;
    }
  }

  // Department admins can view permissions of users in their department
  const departmentAdminRoles = requesterRoles.filter((r: any) => r.role === UserRole.DEPARTMENT_ADMIN);
  if (departmentAdminRoles.length > 0) {
    for (const adminRole of departmentAdminRoles) {
      const matchingTargetRoles = targetRoles.filter((r: any) => 
        r.institution_id === adminRole.institution_id && 
        r.department_id === adminRole.department_id
      );
      
      if (matchingTargetRoles.length > 0) {
        return true;
      }
    }
  }

  return false;
}