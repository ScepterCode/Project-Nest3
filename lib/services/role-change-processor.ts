/**
 * Role Change Processor Service
 * 
 * Handles the processing of role change requests, including validation,
 * approval workflows, and permission updates.
 */

import {
  UserRole,
  RoleStatus,
  RoleRequestStatus,
  RoleChangeRequest,
  UserRoleAssignment,
  RoleRequest,
  AuditAction
} from '../types/role-management';
import { RoleManager } from './role-manager';
import { PermissionChecker } from './permission-checker';
import { RoleNotificationService } from './role-notification-service';

export interface RoleChangeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  requiresApproval: boolean;
  approvalReason?: string;
}

export interface RoleChangeProcessingOptions {
  skipValidation?: boolean;
  forceApproval?: boolean;
  bypassApproval?: boolean;
  notifyUser?: boolean;
  auditMetadata?: Record<string, any>;
}

export class RoleChangeProcessor {
  private roleManager: RoleManager;
  private permissionChecker: PermissionChecker;
  private notificationService: RoleNotificationService;

  constructor(
    roleManager: RoleManager,
    permissionChecker: PermissionChecker,
    notificationService: RoleNotificationService
  ) {
    this.roleManager = roleManager;
    this.permissionChecker = permissionChecker;
    this.notificationService = notificationService;
  }

  /**
   * Validate a role change request
   */
  async validateRoleChange(request: RoleChangeRequest): Promise<RoleChangeValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!request.userId || !request.currentRole || !request.newRole) {
      errors.push('Missing required fields for role change');
    }

    if (request.currentRole === request.newRole) {
      errors.push('Current role and new role cannot be the same');
    }

    if (!request.reason?.trim()) {
      errors.push('Reason for role change is required');
    }

    // Validate user exists and has current role
    try {
      const userAssignments = await this.getUserRoleAssignments(request.userId);
      const hasCurrentRole = userAssignments.some(
        assignment => 
          assignment.role === request.currentRole &&
          assignment.status === RoleStatus.ACTIVE &&
          assignment.institutionId === request.institutionId &&
          (!request.departmentId || assignment.departmentId === request.departmentId)
      );

      if (!hasCurrentRole) {
        errors.push('User does not have the specified current role');
      }
    } catch (error) {
      errors.push('Failed to verify user\'s current role');
    }

    // Check for existing pending requests
    try {
      const pendingRequests = await this.getPendingRoleRequests(request.userId, request.institutionId);
      if (pendingRequests.length > 0) {
        warnings.push('User has existing pending role requests');
      }
    } catch (error) {
      warnings.push('Could not check for existing pending requests');
    }

    // Validate role change permissions
    if (request.changedBy !== request.userId) {
      try {
        const canManageRoles = await this.permissionChecker.hasPermission(
          request.changedBy,
          'role.assign',
          {
            resourceId: request.userId,
            resourceType: 'user',
            institutionId: request.institutionId,
            departmentId: request.departmentId
          }
        );

        if (!canManageRoles) {
          errors.push('Insufficient permissions to change roles for other users');
        }
      } catch (error) {
        errors.push('Failed to verify role change permissions');
      }
    }

    // Determine if approval is required
    const { requiresApproval, approvalReason } = await this.determineApprovalRequirement(request);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      requiresApproval,
      approvalReason
    };
  }

  /**
   * Process a role change request
   */
  async processRoleChange(
    request: RoleChangeRequest,
    options: RoleChangeProcessingOptions = {}
  ): Promise<{ success: boolean; result?: UserRoleAssignment | RoleRequest; error?: string }> {
    try {
      // Validate the request unless skipped
      if (!options.skipValidation) {
        const validation = await this.validateRoleChange(request);
        if (!validation.isValid) {
          return {
            success: false,
            error: `Validation failed: ${validation.errors.join(', ')}`
          };
        }

        // Update approval requirement based on validation
        if (options.forceApproval) {
          request.requiresApproval = true;
        } else if (options.bypassApproval) {
          request.requiresApproval = false;
        } else {
          request.requiresApproval = validation.requiresApproval;
        }
      }

      // Process based on approval requirement
      if (request.requiresApproval && !options.bypassApproval) {
        // Create role request for approval
        const roleRequest = await this.createRoleRequest(request);
        
        // Notify administrators
        if (options.notifyUser !== false) {
          await this.notificationService.notifyRoleChangeRequested(roleRequest);
        }

        return {
          success: true,
          result: roleRequest
        };
      } else {
        // Process role change immediately
        const assignment = await this.executeRoleChange(request, options);
        
        // Notify user of successful change
        if (options.notifyUser !== false) {
          await this.notificationService.notifyRoleChanged(
            request.userId,
            request.currentRole,
            request.newRole,
            request.reason
          );
        }

        return {
          success: true,
          result: assignment
        };
      }
    } catch (error) {
      console.error('Error processing role change:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Execute an immediate role change (no approval required)
   */
  async executeRoleChange(
    request: RoleChangeRequest,
    options: RoleChangeProcessingOptions = {}
  ): Promise<UserRoleAssignment> {
    // Revoke current role
    await this.roleManager.revokeRole(
      request.userId,
      request.currentRole,
      request.changedBy,
      `Role change: ${request.reason}`
    );

    // Assign new role
    const assignment = await this.roleManager.assignRole({
      userId: request.userId,
      role: request.newRole,
      assignedBy: request.changedBy,
      institutionId: request.institutionId,
      departmentId: request.departmentId,
      justification: `Role change from ${request.currentRole} to ${request.newRole}: ${request.reason}`,
      metadata: {
        ...request.metadata,
        ...options.auditMetadata,
        roleChangeType: 'immediate',
        previousRole: request.currentRole
      }
    });

    // Invalidate permission cache for the user
    this.permissionChecker.invalidateUserCache(request.userId);

    return assignment;
  }

  /**
   * Create a role request for approval
   */
  async createRoleRequest(request: RoleChangeRequest): Promise<RoleRequest> {
    return await this.roleManager.requestRole(
      request.userId,
      request.newRole,
      request.institutionId,
      request.reason,
      request.departmentId
    );
  }

  /**
   * Approve a role change request
   */
  async approveRoleChange(
    requestId: string,
    approverId: string,
    notes?: string,
    options: RoleChangeProcessingOptions = {}
  ): Promise<UserRoleAssignment> {
    // Get the role request
    const roleRequest = await this.getRoleRequest(requestId);
    if (!roleRequest) {
      throw new Error('Role request not found');
    }

    if (roleRequest.status !== RoleRequestStatus.PENDING) {
      throw new Error('Role request is not in pending status');
    }

    // Validate approver has permission
    const canApprove = await this.permissionChecker.hasPermission(
      approverId,
      'role.approve',
      {
        resourceId: roleRequest.userId,
        resourceType: 'user',
        institutionId: roleRequest.institutionId,
        departmentId: roleRequest.departmentId
      }
    );

    if (!canApprove) {
      throw new Error('Insufficient permissions to approve role requests');
    }

    // Approve the request
    await this.roleManager.approveRole(requestId, approverId, notes);

    // Get the resulting assignment
    const assignments = await this.getUserRoleAssignments(roleRequest.userId);
    const newAssignment = assignments.find(
      a => a.role === roleRequest.requestedRole && 
           a.status === RoleStatus.ACTIVE &&
           a.institutionId === roleRequest.institutionId
    );

    if (!newAssignment) {
      throw new Error('Failed to find new role assignment after approval');
    }

    // Invalidate permission cache
    this.permissionChecker.invalidateUserCache(roleRequest.userId);

    // Notify user of approval
    if (options.notifyUser !== false) {
      await this.notificationService.notifyRoleChangeApproved(
        roleRequest.userId,
        roleRequest.requestedRole,
        notes
      );
    }

    return newAssignment;
  }

  /**
   * Deny a role change request
   */
  async denyRoleChange(
    requestId: string,
    approverId: string,
    reason: string,
    options: RoleChangeProcessingOptions = {}
  ): Promise<void> {
    // Get the role request
    const roleRequest = await this.getRoleRequest(requestId);
    if (!roleRequest) {
      throw new Error('Role request not found');
    }

    // Validate approver has permission
    const canApprove = await this.permissionChecker.hasPermission(
      approverId,
      'role.approve',
      {
        resourceId: roleRequest.userId,
        resourceType: 'user',
        institutionId: roleRequest.institutionId,
        departmentId: roleRequest.departmentId
      }
    );

    if (!canApprove) {
      throw new Error('Insufficient permissions to deny role requests');
    }

    // Deny the request
    await this.roleManager.denyRole(requestId, approverId, reason);

    // Notify user of denial
    if (options.notifyUser !== false) {
      await this.notificationService.notifyRoleChangeDenied(
        roleRequest.userId,
        roleRequest.requestedRole,
        reason
      );
    }
  }

  /**
   * Get role change impact preview
   */
  async getChangeImpactPreview(
    userId: string,
    currentRole: UserRole,
    newRole: UserRole,
    institutionId: string,
    departmentId?: string
  ) {
    // This would integrate with permission definitions to show permission changes
    // Implementation would be similar to the API endpoint we created
    const { PERMISSIONS, getRolePermissions } = await import('./permission-definitions');
    
    const currentRolePermissions = getRolePermissions(currentRole);
    const newRolePermissions = getRolePermissions(newRole);

    const currentPermissions = PERMISSIONS.filter(p =>
      currentRolePermissions.some(rp => rp.permissionId === p.id)
    );
    
    const newPermissions = PERMISSIONS.filter(p =>
      newRolePermissions.some(rp => rp.permissionId === p.id)
    );

    const currentPermissionIds = new Set(currentPermissions.map(p => p.id));
    const newPermissionIds = new Set(newPermissions.map(p => p.id));

    const addedPermissions = newPermissions.filter(p => !currentPermissionIds.has(p.id));
    const removedPermissions = currentPermissions.filter(p => !newPermissionIds.has(p.id));

    return {
      currentPermissions,
      newPermissions,
      addedPermissions,
      removedPermissions
    };
  }

  // Private helper methods

  private async determineApprovalRequirement(
    request: RoleChangeRequest
  ): Promise<{ requiresApproval: boolean; approvalReason?: string }> {
    const roleHierarchy = {
      [UserRole.STUDENT]: 0,
      [UserRole.TEACHER]: 1,
      [UserRole.DEPARTMENT_ADMIN]: 2,
      [UserRole.INSTITUTION_ADMIN]: 3,
      [UserRole.SYSTEM_ADMIN]: 4
    };

    const isUpgrade = roleHierarchy[request.newRole] > roleHierarchy[request.currentRole];

    // Administrative roles always require approval
    if ([UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN].includes(request.newRole)) {
      return {
        requiresApproval: true,
        approvalReason: 'Administrative roles require approval'
      };
    }

    // Teacher role requires approval when upgrading from student
    if (request.newRole === UserRole.TEACHER && request.currentRole === UserRole.STUDENT) {
      return {
        requiresApproval: true,
        approvalReason: 'Teacher role requires verification and approval'
      };
    }

    // Any upgrade requires approval
    if (isUpgrade) {
      return {
        requiresApproval: true,
        approvalReason: 'Role upgrades require administrator approval'
      };
    }

    // Downgrades to student can be automatic
    if (request.newRole === UserRole.STUDENT) {
      return {
        requiresApproval: false
      };
    }

    return {
      requiresApproval: true,
      approvalReason: 'Role changes require approval for security'
    };
  }

  // Database operation placeholders - these would be implemented with actual database queries
  private async getUserRoleAssignments(userId: string): Promise<UserRoleAssignment[]> {
    // Implementation would query user_role_assignments table
    return [];
  }

  private async getPendingRoleRequests(userId: string, institutionId: string): Promise<RoleRequest[]> {
    // Implementation would query role_requests table
    return [];
  }

  private async getRoleRequest(requestId: string): Promise<RoleRequest | null> {
    // Implementation would query role_requests table
    return null;
  }
}