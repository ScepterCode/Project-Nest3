/**
 * Role Manager Service
 * 
 * Handles role assignment, changes, and management operations.
 * Implements the core business logic for role management workflows.
 */

import { 
  UserRole, 
  RoleStatus, 
  RoleRequestStatus,
  VerificationMethod,
  AuditAction,
  UserRoleAssignment,
  RoleRequest,
  RoleAssignmentRequest,
  RoleChangeRequest,
  BulkRoleAssignment,
  BulkRoleAssignmentResult,
  RoleAuditLog
} from '../types/role-management';
import { RoleNotificationService } from './role-notification-service';
import { RoleEscalationPreventionService } from './role-escalation-prevention';
import { RoleRequestRateLimiter } from './role-request-rate-limiter';
import { RoleErrorHandler, RoleErrorCode } from '../utils/role-error-handling';
import { RoleSecurityLogger, SecurityEventType } from './role-security-logger';
import { createClient } from '@/lib/supabase/server';

export interface RoleManagerConfig {
  defaultRoleRequestExpiration: number; // days
  maxTemporaryRoleDuration: number; // days
  requireApprovalForRoles: UserRole[];
  autoApproveRoles: UserRole[];
}

export class RoleManager {
  private config: RoleManagerConfig;
  private notificationService: RoleNotificationService;
  private escalationService: RoleEscalationPreventionService;
  private rateLimiter: RoleRequestRateLimiter;
  private errorHandler: RoleErrorHandler;
  private securityLogger: RoleSecurityLogger;

  constructor(config: RoleManagerConfig) {
    this.config = config;
    this.notificationService = new RoleNotificationService();
    this.escalationService = new RoleEscalationPreventionService();
    this.rateLimiter = new RoleRequestRateLimiter();
    this.errorHandler = RoleErrorHandler.getInstance();
    this.securityLogger = RoleSecurityLogger.getInstance();
  }

  /**
   * Request a role assignment or change
   */
  async requestRole(
    userId: string,
    roleType: UserRole,
    institutionId: string,
    justification?: string,
    departmentId?: string,
    clientIP?: string
  ): Promise<RoleRequest> {
    return await this.errorHandler.withErrorHandling(async () => {
      // 1. Validate input data
      const validationErrors = this.errorHandler.validateRoleRequest({
        userId,
        requestedRole: roleType,
        institutionId,
        justification
      });

      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0].message);
      }

      // 2. Check rate limits
      const rateLimitResult = await this.rateLimiter.checkRateLimit(
        userId,
        roleType,
        institutionId,
        clientIP
      );

      if (!rateLimitResult.allowed) {
        await this.securityLogger.logSecurityEvent(
          SecurityEventType.RATE_LIMIT_EXCEEDED,
          `Rate limit exceeded: ${rateLimitResult.reason}`,
          { requestedRole: roleType, retryAfter: rateLimitResult.retryAfter },
          { userId, institutionId, ipAddress: clientIP }
        );
        throw this.errorHandler.createError(
          RoleErrorCode.RATE_LIMIT_EXCEEDED,
          rateLimitResult.reason || 'Rate limit exceeded',
          { operation: 'requestRole', userId, institutionId }
        );
      }

      // 3. Check escalation rules and security
      const currentRole = await this.getCurrentRole(userId);
      const escalationResult = await this.escalationService.validateRoleRequest(
        userId,
        currentRole,
        roleType,
        institutionId
      );

      if (!escalationResult.allowed) {
        // Log the blocked escalation attempt
        await this.escalationService.logEscalationAttempt({
          userId,
          fromRole: currentRole || UserRole.STUDENT,
          toRole: roleType,
          requestedAt: new Date(),
          blocked: true,
          reason: escalationResult.reason || 'Escalation blocked',
          metadata: { institutionId, departmentId, justification }
        });

        throw this.errorHandler.createError(
          RoleErrorCode.ROLE_ESCALATION_BLOCKED,
          escalationResult.reason || 'Role escalation not allowed',
          { operation: 'requestRole', userId, institutionId }
        );
      }

      // 4. Validate the role request (business rules)
      await this.validateRoleRequest(userId, roleType, institutionId, departmentId);

      // 5. Determine verification method based on role type
      const verificationMethod = this.determineVerificationMethod(roleType);
      
      // 6. Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.config.defaultRoleRequestExpiration);

      const roleRequest: RoleRequest = {
        id: this.generateId(),
        userId,
        requestedRole: roleType,
        currentRole,
        justification: justification || '',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod,
        institutionId,
        departmentId,
        expiresAt,
        metadata: {
          requiresApproval: escalationResult.requiresApproval,
          clientIP,
          securityChecked: true
        }
      };

      // 7. Save the role request
      await this.saveRoleRequest(roleRequest);

      // 8. Log security event
      await this.securityLogger.logRoleRequest(
        'created',
        roleRequest.id,
        userId,
        roleType,
        institutionId,
        { 
          justification,
          verificationMethod,
          requiresApproval: escalationResult.requiresApproval
        },
        { ipAddress: clientIP }
      );

      // 9. Log the request in audit trail
      await this.logRoleAction({
        id: this.generateId(),
        userId,
        action: AuditAction.REQUESTED,
        newRole: roleType,
        changedBy: userId,
        reason: justification,
        timestamp: new Date(),
        institutionId,
        departmentId,
        metadata: { 
          requestId: roleRequest.id,
          securityValidated: true,
          rateLimitChecked: true
        }
      });

      // 10. Send notification about role request submission
      try {
        const userInfo = await this.getUserInfo(userId);
        await this.notificationService.sendRoleRequestSubmittedNotification(
          roleRequest,
          userInfo.email,
          userInfo.name
        );
      } catch (error) {
        console.error('Failed to send role request notification:', error);
        // Don't fail the request for notification errors
      }

      // 11. If role can be auto-approved, process immediately
      if (this.canAutoApprove(roleType, verificationMethod) && !escalationResult.requiresApproval) {
        await this.approveRole(roleRequest.id, 'system', 'Auto-approved based on verification');
      }

      return roleRequest;

    }, { 
      operation: 'requestRole', 
      userId, 
      institutionId, 
      metadata: { requestedRole: roleType, justification } 
    }).then(result => {
      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    });
  }

  /**
   * Approve a role request
   */
  async approveRole(
    requestId: string,
    approverId: string,
    notes?: string
  ): Promise<void> {
    return await this.errorHandler.withErrorHandling(async () => {
      const request = await this.getRoleRequest(requestId);
      
      if (!request) {
        throw this.errorHandler.createError(
          RoleErrorCode.REQUEST_NOT_FOUND,
          'Role request not found',
          { operation: 'approveRole', requestId }
        );
      }

      if (request.status !== RoleRequestStatus.PENDING) {
        throw this.errorHandler.createError(
          RoleErrorCode.REQUEST_ALREADY_PROCESSED,
          'Role request is not in pending status',
          { operation: 'approveRole', requestId, currentStatus: request.status }
        );
      }

      // Validate approver has permission using security service
      const approverValidation = await this.escalationService.validateApproverPermission(
        approverId,
        request
      );

      if (!approverValidation.allowed) {
        // Log the unauthorized approval attempt
        await this.securityLogger.logSecurityEvent(
          SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          `Unauthorized role approval attempt: ${approverValidation.reason}`,
          { requestId, requestedRole: request.requestedRole },
          { userId: approverId, institutionId: request.institutionId }
        );

        throw this.errorHandler.createError(
          RoleErrorCode.INSUFFICIENT_PERMISSIONS,
          approverValidation.reason || 'Insufficient permissions to approve this request',
          { operation: 'approveRole', requestId, approverId }
        );
      }

      // Update request status
      request.status = RoleRequestStatus.APPROVED;
      request.reviewedAt = new Date();
      request.reviewedBy = approverId;
      request.reviewNotes = notes;

      await this.updateRoleRequest(request);

      // Log security event for approval
      await this.securityLogger.logRoleRequest(
        'approved',
        requestId,
        request.userId,
        request.requestedRole,
        request.institutionId,
        { approverNotes: notes },
        { approvedBy: approverId }
      );

      // Send approval notification
      try {
        const approverInfo = await this.getUserInfo(approverId);
        await this.notificationService.sendRoleRequestApprovedNotification(
          request,
          approverId,
          approverInfo.name,
          notes
        );
      } catch (error) {
        console.error('Failed to send role approval notification:', error);
        // Don't fail the approval for notification errors
      }

      // Assign the role
      await this.assignRole({
        userId: request.userId,
        role: request.requestedRole,
        assignedBy: approverId,
        institutionId: request.institutionId,
        departmentId: request.departmentId,
        justification: `Approved role request: ${request.justification}`
      });

      // Log the approval in audit trail
      await this.logRoleAction({
        id: this.generateId(),
        userId: request.userId,
        action: AuditAction.APPROVED,
        oldRole: request.currentRole,
        newRole: request.requestedRole,
        changedBy: approverId,
        reason: notes,
        timestamp: new Date(),
        institutionId: request.institutionId,
        departmentId: request.departmentId,
        metadata: { 
          requestId,
          securityValidated: true,
          approverValidated: true
        }
      });

    }, { 
      operation: 'approveRole', 
      userId: approverId, 
      requestId, 
      metadata: { notes } 
    }).then(result => {
      if (!result.success) {
        throw result.error;
      }
    });
  }

  /**
   * Deny a role request
   */
  async denyRole(
    requestId: string,
    approverId: string,
    reason: string
  ): Promise<void> {
    return await this.errorHandler.withErrorHandling(async () => {
      const request = await this.getRoleRequest(requestId);
      
      if (!request) {
        throw this.errorHandler.createError(
          RoleErrorCode.REQUEST_NOT_FOUND,
          'Role request not found',
          { operation: 'denyRole', requestId }
        );
      }

      if (request.status !== RoleRequestStatus.PENDING) {
        throw this.errorHandler.createError(
          RoleErrorCode.REQUEST_ALREADY_PROCESSED,
          'Role request is not in pending status',
          { operation: 'denyRole', requestId, currentStatus: request.status }
        );
      }

      // Validate approver has permission using security service
      const approverValidation = await this.escalationService.validateApproverPermission(
        approverId,
        request
      );

      if (!approverValidation.allowed) {
        // Log the unauthorized denial attempt
        await this.securityLogger.logSecurityEvent(
          SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          `Unauthorized role denial attempt: ${approverValidation.reason}`,
          { requestId, requestedRole: request.requestedRole },
          { userId: approverId, institutionId: request.institutionId }
        );

        throw this.errorHandler.createError(
          RoleErrorCode.INSUFFICIENT_PERMISSIONS,
          approverValidation.reason || 'Insufficient permissions to deny this request',
          { operation: 'denyRole', requestId, approverId }
        );
      }

      // Update request status
      request.status = RoleRequestStatus.DENIED;
      request.reviewedAt = new Date();
      request.reviewedBy = approverId;
      request.reviewNotes = reason;

      await this.updateRoleRequest(request);

      // Log security event for denial
      await this.securityLogger.logRoleRequest(
        'denied',
        requestId,
        request.userId,
        request.requestedRole,
        request.institutionId,
        { denialReason: reason },
        { approvedBy: approverId }
      );

      // Send denial notification
      try {
        const denierInfo = await this.getUserInfo(approverId);
        await this.notificationService.sendRoleRequestDeniedNotification(
          request,
          approverId,
          denierInfo.name,
          reason
        );
      } catch (error) {
        console.error('Failed to send role denial notification:', error);
        // Don't fail the denial for notification errors
      }

      // Log the denial in audit trail
      await this.logRoleAction({
        id: this.generateId(),
        userId: request.userId,
        action: AuditAction.DENIED,
        oldRole: request.currentRole,
        newRole: request.requestedRole,
        changedBy: approverId,
        reason,
        timestamp: new Date(),
        institutionId: request.institutionId,
        departmentId: request.departmentId,
        metadata: { 
          requestId,
          securityValidated: true,
          approverValidated: true
        }
      });

    }, { 
      operation: 'denyRole', 
      userId: approverId, 
      requestId, 
      metadata: { reason } 
    }).then(result => {
      if (!result.success) {
        throw result.error;
      }
    });
  }

  /**
   * Assign a role directly (for approved requests or admin actions)
   */
  async assignRole(request: RoleAssignmentRequest): Promise<UserRoleAssignment> {
    // Validate the assignment
    await this.validateRoleAssignment(request);

    // Check if user already has this role
    const existingAssignment = await this.getUserRoleAssignment(
      request.userId, 
      request.role, 
      request.institutionId
    );

    if (existingAssignment && existingAssignment.status === RoleStatus.ACTIVE) {
      throw new Error('User already has this role');
    }

    // Create the role assignment
    const assignment: UserRoleAssignment = {
      id: this.generateId(),
      userId: request.userId,
      role: request.role,
      status: RoleStatus.ACTIVE,
      assignedBy: request.assignedBy,
      assignedAt: new Date(),
      expiresAt: request.expiresAt,
      departmentId: request.departmentId,
      institutionId: request.institutionId,
      isTemporary: request.isTemporary || false,
      metadata: request.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save the assignment
    await this.saveRoleAssignment(assignment);

    // Send role assignment notification
    try {
      const assignerInfo = await this.getUserInfo(request.assignedBy);
      const previousRole = await this.getCurrentRole(request.userId);
      await this.notificationService.sendRoleAssignedNotification(
        assignment,
        assignerInfo.name,
        previousRole
      );
    } catch (error) {
      console.error('Failed to send role assignment notification:', error);
    }

    // Log the assignment
    await this.logRoleAction({
      id: this.generateId(),
      userId: request.userId,
      action: AuditAction.ASSIGNED,
      newRole: request.role,
      changedBy: request.assignedBy,
      reason: request.justification,
      timestamp: new Date(),
      institutionId: request.institutionId,
      departmentId: request.departmentId,
      metadata: { assignmentId: assignment.id }
    });

    return assignment;
  }

  /**
   * Change a user's role
   */
  async changeRole(request: RoleChangeRequest): Promise<UserRoleAssignment> {
    // Validate the role change
    await this.validateRoleChange(request);

    // Get current assignment
    const currentAssignment = await this.getUserRoleAssignment(
      request.userId,
      request.currentRole,
      request.institutionId
    );

    if (!currentAssignment) {
      throw new Error('Current role assignment not found');
    }

    // If requires approval and not admin, create a role request instead
    if (request.requiresApproval && !await this.isAdmin(request.changedBy)) {
      const roleRequest = await this.requestRole(
        request.userId,
        request.newRole,
        request.institutionId,
        request.reason,
        request.departmentId
      );
      throw new Error(`Role change requires approval. Request created: ${roleRequest.id}`);
    }

    // Revoke current role
    await this.revokeRole(request.userId, request.currentRole, request.changedBy, request.reason);

    // Assign new role
    return await this.assignRole({
      userId: request.userId,
      role: request.newRole,
      assignedBy: request.changedBy,
      institutionId: request.institutionId,
      departmentId: request.departmentId,
      justification: `Role change: ${request.reason}`,
      metadata: request.metadata
    });
  }

  /**
   * Assign a temporary role with expiration
   */
  async assignTemporaryRole(
    userId: string,
    role: UserRole,
    assignedBy: string,
    institutionId: string,
    expiresAt: Date,
    departmentId?: string,
    justification?: string
  ): Promise<UserRoleAssignment> {
    // Validate expiration date
    const maxExpiration = new Date();
    maxExpiration.setDate(maxExpiration.getDate() + this.config.maxTemporaryRoleDuration);
    
    if (expiresAt > maxExpiration) {
      throw new Error(`Temporary role cannot exceed ${this.config.maxTemporaryRoleDuration} days`);
    }

    return await this.assignRole({
      userId,
      role,
      assignedBy,
      institutionId,
      departmentId,
      isTemporary: true,
      expiresAt,
      justification: justification || 'Temporary role assignment'
    });
  }

  /**
   * Revoke a role from a user
   */
  async revokeRole(
    userId: string,
    roleToRevoke: UserRole,
    revokedBy: string,
    reason?: string
  ): Promise<void> {
    const assignments = await this.getUserRoleAssignments(userId);
    const assignment = assignments.find(a => a.role === roleToRevoke && a.status === RoleStatus.ACTIVE);

    if (!assignment) {
      throw new Error('Active role assignment not found');
    }

    // Update assignment status
    assignment.status = RoleStatus.SUSPENDED;
    assignment.updatedAt = new Date();

    await this.updateRoleAssignment(assignment);

    // Log the revocation
    await this.logRoleAction({
      id: this.generateId(),
      userId,
      action: AuditAction.REVOKED,
      oldRole: roleToRevoke,
      changedBy: revokedBy,
      reason,
      timestamp: new Date(),
      institutionId: assignment.institutionId,
      departmentId: assignment.departmentId,
      metadata: { assignmentId: assignment.id }
    });
  }

  /**
   * Process bulk role assignments
   */
  async processBulkRoleAssignment(
    bulkRequest: BulkRoleAssignment
  ): Promise<BulkRoleAssignmentResult> {
    const result: BulkRoleAssignmentResult = {
      successful: 0,
      failed: 0,
      errors: [],
      assignments: []
    };

    for (let i = 0; i < bulkRequest.assignments.length; i++) {
      const assignment = bulkRequest.assignments[i];
      
      try {
        if (bulkRequest.validateOnly) {
          await this.validateRoleAssignment(assignment);
        } else {
          const roleAssignment = await this.assignRole(assignment);
          result.assignments.push(roleAssignment);
        }
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          index: i,
          userId: assignment.userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return result;
  }

  // Private helper methods

  private determineVerificationMethod(role: UserRole): VerificationMethod {
    if (this.config.autoApproveRoles.includes(role)) {
      return VerificationMethod.EMAIL_DOMAIN;
    }
    if (this.config.requireApprovalForRoles.includes(role)) {
      return VerificationMethod.ADMIN_APPROVAL;
    }
    return VerificationMethod.MANUAL_REVIEW;
  }

  private canAutoApprove(role: UserRole, method: VerificationMethod): boolean {
    return this.config.autoApproveRoles.includes(role) && 
           method === VerificationMethod.EMAIL_DOMAIN;
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  // Abstract methods that need to be implemented with actual database operations
  private async validateRoleRequest(
    userId: string, 
    role: UserRole, 
    institutionId: string, 
    departmentId?: string
  ): Promise<void> {
    // Implementation would validate business rules
    // For now, basic validation
    if (!userId || !role || !institutionId) {
      throw new Error('Missing required fields for role request');
    }
  }

  private async getCurrentRole(userId: string): Promise<UserRole | undefined> {
    // Implementation would query database for current role
    return UserRole.STUDENT; // Placeholder
  }

  private async saveRoleRequest(request: RoleRequest): Promise<void> {
    // Implementation would save to database
    console.log('Saving role request:', request.id);
  }

  private async getRoleRequest(requestId: string): Promise<RoleRequest | null> {
    // Implementation would query database
    return null; // Placeholder
  }

  private async updateRoleRequest(request: RoleRequest): Promise<void> {
    // Implementation would update database
    console.log('Updating role request:', request.id);
  }

  private async validateApproverPermission(approverId: string, request: RoleRequest): Promise<void> {
    // Implementation would check if approver has permission
    if (!approverId) {
      throw new Error('Invalid approver');
    }
  }

  private async validateRoleAssignment(request: RoleAssignmentRequest): Promise<void> {
    // Implementation would validate assignment rules
    if (!request.userId || !request.role || !request.assignedBy || !request.institutionId) {
      throw new Error('Missing required fields for role assignment');
    }
  }

  private async getUserRoleAssignment(
    userId: string, 
    role: UserRole, 
    institutionId: string
  ): Promise<UserRoleAssignment | null> {
    // Implementation would query database
    return null; // Placeholder
  }

  private async saveRoleAssignment(assignment: UserRoleAssignment): Promise<void> {
    // Implementation would save to database
    console.log('Saving role assignment:', assignment.id);
  }

  private async validateRoleChange(request: RoleChangeRequest): Promise<void> {
    // Implementation would validate role change rules
    if (!request.userId || !request.currentRole || !request.newRole) {
      throw new Error('Missing required fields for role change');
    }
  }

  private async isAdmin(userId: string): Promise<boolean> {
    // Implementation would check if user is admin
    return false; // Placeholder
  }

  private async getUserRoleAssignments(userId: string): Promise<UserRoleAssignment[]> {
    // Implementation would query database
    return []; // Placeholder
  }

  private async updateRoleAssignment(assignment: UserRoleAssignment): Promise<void> {
    // Implementation would update database
    console.log('Updating role assignment:', assignment.id);
  }

  private async logRoleAction(log: RoleAuditLog): Promise<void> {
    // Implementation would save audit log
    console.log('Logging role action:', log.action, 'for user:', log.userId);
  }

  private async getUserInfo(userId: string): Promise<{ name: string; email: string }> {
    // Implementation would query database for user info
    const supabase = createClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return { name: 'Unknown User', email: 'unknown@example.com' };
    }

    return {
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User',
      email: user.email || 'unknown@example.com'
    };
  }
}