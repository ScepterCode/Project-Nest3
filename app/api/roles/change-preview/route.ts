import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types/role-management';
import { PermissionChecker } from '@/lib/services/permission-checker';
import { PERMISSIONS, getRolePermissions } from '@/lib/services/permission-definitions';

interface RoleChangePreviewRequest {
  userId: string;
  currentRole: UserRole;
  newRole: UserRole;
  institutionId: string;
  departmentId?: string;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
  scope: string;
}

interface RoleChangePreview {
  currentPermissions: Permission[];
  newPermissions: Permission[];
  addedPermissions: Permission[];
  removedPermissions: Permission[];
  requiresApproval: boolean;
  approvalReason: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: RoleChangePreviewRequest = await request.json();
    const { userId, currentRole, newRole, institutionId, departmentId } = body;

    // Validate input
    if (!userId || !currentRole || !newRole || !institutionId) {
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

    // Get current and new role permissions
    const currentRolePermissions = getRolePermissions(currentRole);
    const newRolePermissions = getRolePermissions(newRole);

    // Map to full permission objects
    const currentPermissions = PERMISSIONS.filter(p =>
      currentRolePermissions.some(rp => rp.permissionId === p.id)
    );
    
    const newPermissions = PERMISSIONS.filter(p =>
      newRolePermissions.some(rp => rp.permissionId === p.id)
    );

    // Calculate permission differences
    const currentPermissionIds = new Set(currentPermissions.map(p => p.id));
    const newPermissionIds = new Set(newPermissions.map(p => p.id));

    const addedPermissions = newPermissions.filter(p => !currentPermissionIds.has(p.id));
    const removedPermissions = currentPermissions.filter(p => !newPermissionIds.has(p.id));

    // Determine if approval is required
    const { requiresApproval, approvalReason } = determineApprovalRequirement(
      currentRole,
      newRole,
      addedPermissions,
      removedPermissions
    );

    const preview: RoleChangePreview = {
      currentPermissions,
      newPermissions,
      addedPermissions,
      removedPermissions,
      requiresApproval,
      approvalReason
    };

    return NextResponse.json(preview);

  } catch (error) {
    console.error('Error generating role change preview:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function determineApprovalRequirement(
  currentRole: UserRole,
  newRole: UserRole,
  addedPermissions: Permission[],
  removedPermissions: Permission[]
): { requiresApproval: boolean; approvalReason: string } {
  // Define role hierarchy for upgrade detection
  const roleHierarchy = {
    [UserRole.STUDENT]: 0,
    [UserRole.TEACHER]: 1,
    [UserRole.DEPARTMENT_ADMIN]: 2,
    [UserRole.INSTITUTION_ADMIN]: 3,
    [UserRole.SYSTEM_ADMIN]: 4
  };

  const isUpgrade = roleHierarchy[newRole] > roleHierarchy[currentRole];
  const isDowngrade = roleHierarchy[newRole] < roleHierarchy[currentRole];

  // System admin changes always require approval
  if (newRole === UserRole.SYSTEM_ADMIN) {
    return {
      requiresApproval: true,
      approvalReason: 'System administrator role requires approval from existing system administrators.'
    };
  }

  // Institution admin changes require approval
  if (newRole === UserRole.INSTITUTION_ADMIN) {
    return {
      requiresApproval: true,
      approvalReason: 'Institution administrator role requires approval from institution or system administrators.'
    };
  }

  // Department admin changes require approval
  if (newRole === UserRole.DEPARTMENT_ADMIN) {
    return {
      requiresApproval: true,
      approvalReason: 'Department administrator role requires approval from institution administrators.'
    };
  }

  // Teacher role changes require approval
  if (newRole === UserRole.TEACHER && currentRole === UserRole.STUDENT) {
    return {
      requiresApproval: true,
      approvalReason: 'Teacher role requires verification of institutional affiliation and approval.'
    };
  }

  // Role upgrades generally require approval
  if (isUpgrade) {
    return {
      requiresApproval: true,
      approvalReason: 'Role upgrades require administrator approval to ensure proper authorization.'
    };
  }

  // Check if significant permissions are being added
  const hasSignificantPermissions = addedPermissions.some(p => 
    p.category === 'user_management' || 
    p.category === 'system' ||
    p.scope === 'institution' ||
    p.scope === 'system'
  );

  if (hasSignificantPermissions) {
    return {
      requiresApproval: true,
      approvalReason: 'This role change grants significant permissions that require administrator approval.'
    };
  }

  // Downgrades can typically be processed automatically
  if (isDowngrade) {
    return {
      requiresApproval: false,
      approvalReason: 'Role downgrades can be processed automatically with user confirmation.'
    };
  }

  // Student role changes are typically automatic
  if (newRole === UserRole.STUDENT) {
    return {
      requiresApproval: false,
      approvalReason: 'Student role can be assigned automatically.'
    };
  }

  // Default to requiring approval for safety
  return {
    requiresApproval: true,
    approvalReason: 'Role changes require administrator review for security and compliance.'
  };
}