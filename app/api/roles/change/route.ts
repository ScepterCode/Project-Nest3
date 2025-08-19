import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole, RoleChangeRequest } from '@/lib/types/role-management';
import { RoleManager } from '@/lib/services/role-manager';
import { PermissionChecker } from '@/lib/services/permission-checker';
import { RoleNotificationService } from '@/lib/services/role-notification-service';

interface RoleChangeRequestData {
  userId: string;
  currentRole: UserRole;
  newRole: UserRole;
  reason: string;
  institutionId: string;
  departmentId?: string;
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: RoleChangeRequestData = await request.json();
    const { userId, currentRole, newRole, reason, institutionId, departmentId, metadata } = body;

    // Validate input
    if (!userId || !currentRole || !newRole || !reason?.trim() || !institutionId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify user can request role changes (either for themselves or they have permission)
    if (userId !== user.id) {
      const permissionChecker = new PermissionChecker({
        cacheEnabled: true,
        cacheTtl: 300,
        bulkCheckLimit: 50
      });

      const canManageRoles = await permissionChecker.hasPermission(
        user.id,
        'role.assign',
        {
          resourceId: userId,
          resourceType: 'user',
          institutionId,
          departmentId
        }
      );

      if (!canManageRoles) {
        return NextResponse.json(
          { error: 'Insufficient permissions to request role changes for other users' },
          { status: 403 }
        );
      }
    }

    // Validate that the user actually has the current role
    const { data: currentAssignments, error: assignmentError } = await supabase
      .from('user_role_assignments')
      .select('*')
      .eq('user_id', userId)
      .eq('role', currentRole)
      .eq('status', 'active')
      .eq('institution_id', institutionId);

    if (assignmentError) {
      console.error('Error checking current role:', assignmentError);
      return NextResponse.json(
        { error: 'Failed to verify current role' },
        { status: 500 }
      );
    }

    if (!currentAssignments || currentAssignments.length === 0) {
      return NextResponse.json(
        { error: 'User does not have the specified current role' },
        { status: 400 }
      );
    }

    // Check if there's already a pending role change request
    const { data: existingRequests, error: requestError } = await supabase
      .from('role_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('institution_id', institutionId);

    if (requestError) {
      console.error('Error checking existing requests:', requestError);
      return NextResponse.json(
        { error: 'Failed to check existing requests' },
        { status: 500 }
      );
    }

    if (existingRequests && existingRequests.length > 0) {
      return NextResponse.json(
        { error: 'You already have a pending role change request' },
        { status: 400 }
      );
    }

    // Determine if approval is required
    const requiresApproval = await determineIfApprovalRequired(
      currentRole,
      newRole,
      institutionId,
      departmentId
    );

    // Initialize role manager
    const roleManager = new RoleManager({
      defaultRoleRequestExpiration: 7,
      maxTemporaryRoleDuration: 90,
      requireApprovalForRoles: [
        UserRole.TEACHER,
        UserRole.DEPARTMENT_ADMIN,
        UserRole.INSTITUTION_ADMIN,
        UserRole.SYSTEM_ADMIN
      ],
      autoApproveRoles: [UserRole.STUDENT]
    });

    try {
      if (requiresApproval) {
        // Create a role request for approval
        const roleRequest = await roleManager.requestRole(
          userId,
          newRole,
          institutionId,
          reason,
          departmentId
        );

        // Send notification to administrators
        const notificationService = new RoleNotificationService();
        await notificationService.notifyRoleChangeRequested(roleRequest);

        return NextResponse.json({
          success: true,
          requiresApproval: true,
          requestId: roleRequest.id,
          message: 'Role change request submitted for approval'
        });
      } else {
        // Process role change immediately
        const changeRequest: RoleChangeRequest = {
          userId,
          currentRole,
          newRole,
          changedBy: user.id,
          reason,
          institutionId,
          departmentId,
          requiresApproval: false,
          metadata
        };

        const newAssignment = await roleManager.changeRole(changeRequest);

        // Send notification about successful role change
        const notificationService = new RoleNotificationService();
        await notificationService.notifyRoleChanged(userId, currentRole, newRole, reason);

        return NextResponse.json({
          success: true,
          requiresApproval: false,
          assignmentId: newAssignment.id,
          message: 'Role change processed successfully'
        });
      }
    } catch (roleError) {
      console.error('Error processing role change:', roleError);
      
      // Handle specific role manager errors
      if (roleError instanceof Error && roleError.message.includes('Role change requires approval')) {
        // Extract request ID from error message if available
        const requestIdMatch = roleError.message.match(/Request created: ([a-f0-9-]+)/);
        const requestId = requestIdMatch ? requestIdMatch[1] : null;
        
        return NextResponse.json({
          success: true,
          requiresApproval: true,
          requestId,
          message: 'Role change request submitted for approval'
        });
      }
      
      return NextResponse.json(
        { error: roleError instanceof Error ? roleError.message : 'Failed to process role change' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error processing role change request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function determineIfApprovalRequired(
  currentRole: UserRole,
  newRole: UserRole,
  institutionId: string,
  departmentId?: string
): Promise<boolean> {
  // Define role hierarchy
  const roleHierarchy = {
    [UserRole.STUDENT]: 0,
    [UserRole.TEACHER]: 1,
    [UserRole.DEPARTMENT_ADMIN]: 2,
    [UserRole.INSTITUTION_ADMIN]: 3,
    [UserRole.SYSTEM_ADMIN]: 4
  };

  const isUpgrade = roleHierarchy[newRole] > roleHierarchy[currentRole];
  const isDowngrade = roleHierarchy[newRole] < roleHierarchy[currentRole];

  // Administrative roles always require approval
  if ([UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN].includes(newRole)) {
    return true;
  }

  // Teacher role requires approval when upgrading from student
  if (newRole === UserRole.TEACHER && currentRole === UserRole.STUDENT) {
    return true;
  }

  // Any upgrade requires approval
  if (isUpgrade) {
    return true;
  }

  // Downgrades to student can be automatic
  if (newRole === UserRole.STUDENT && isDowngrade) {
    return false;
  }

  // Default to requiring approval for safety
  return true;
}