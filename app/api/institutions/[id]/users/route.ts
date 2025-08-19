import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionUserManager } from '@/lib/services/institution-user-manager';
import { UserRole } from '@/lib/types/onboarding';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const institutionId = params.id;
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const filters = {
      role: searchParams.get('role') as UserRole | undefined,
      status: searchParams.get('status') as 'active' | 'inactive' | 'pending' | 'suspended' | undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      search: searchParams.get('search') || undefined,
      joinedAfter: searchParams.get('joinedAfter') ? new Date(searchParams.get('joinedAfter')!) : undefined,
      joinedBefore: searchParams.get('joinedBefore') ? new Date(searchParams.get('joinedBefore')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    };

    // Validate user has permission to view institution users
    const userManager = new InstitutionUserManager();
    const userRole = await userManager.getUserInstitutionRole(user.id, institutionId);
    
    if (!userRole || !['institution_admin', 'department_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get institution users
    const result = await userManager.getInstitutionUsers(institutionId, filters);

    return NextResponse.json({
      success: true,
      data: {
        users: result.users,
        total: result.total,
        filters
      }
    });

  } catch (error) {
    console.error('Error fetching institution users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const institutionId = params.id;
    const body = await request.json();

    // Validate user has permission to manage institution users
    const userManager = new InstitutionUserManager();
    const userRole = await userManager.getUserInstitutionRole(user.id, institutionId);
    
    if (!userRole || !['institution_admin', 'department_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Handle different actions
    const { action, ...actionData } = body;

    switch (action) {
      case 'assign_role':
        const { userId, role, departmentId } = actionData;
        const assignResult = await userManager.assignUserRole(
          userId,
          institutionId,
          role,
          user.id,
          departmentId
        );

        if (!assignResult.success) {
          return NextResponse.json({
            success: false,
            errors: assignResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: 'User role assigned successfully'
        });

      case 'bulk_assign_roles':
        const { userIds, role: bulkRole, departmentId: bulkDeptId, notifyUsers } = actionData;
        const bulkResult = await userManager.bulkAssignRoles({
          userIds,
          role: bulkRole,
          departmentId: bulkDeptId,
          assignedBy: user.id,
          notifyUsers
        });

        return NextResponse.json({
          success: true,
          data: bulkResult
        });

      case 'modify_access':
        const { userId: modifyUserId, changes, reason } = actionData;
        const modifyResult = await userManager.modifyUserAccess({
          userId: modifyUserId,
          institutionId,
          changes,
          modifiedBy: user.id,
          reason
        });

        if (!modifyResult.success) {
          return NextResponse.json({
            success: false,
            errors: modifyResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: 'User access modified successfully'
        });

      case 'remove_user':
        const { userId: removeUserId, reason: removeReason } = actionData;
        const removeResult = await userManager.removeUserFromInstitution(
          removeUserId,
          institutionId,
          user.id,
          removeReason
        );

        if (!removeResult.success) {
          return NextResponse.json({
            success: false,
            errors: removeResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: 'User removed from institution successfully'
        });

      default:
        return NextResponse.json({
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error managing institution users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}