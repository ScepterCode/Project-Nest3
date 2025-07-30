/**
 * Temporary Role Processor Service
 * 
 * Handles automatic expiration of temporary role assignments,
 * scheduled processing, and role reversion logic.
 */

import { 
  UserRole, 
  RoleStatus,
  UserRoleAssignment,
  RoleAuditLog,
  AuditAction
} from '../types/role-management';

export interface TemporaryRoleExpiration {
  assignmentId: string;
  userId: string;
  currentRole: UserRole;
  previousRole: UserRole;
  expiresAt: Date;
  institutionId: string;
  departmentId?: string;
}

export interface ExpirationProcessingResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{
    assignmentId: string;
    userId: string;
    error: string;
  }>;
}

export interface RoleReversionConfig {
  defaultRole: UserRole;
  preserveOriginalRole: boolean;
  notifyOnExpiration: boolean;
  gracePeriodHours: number;
}

export class TemporaryRoleProcessor {
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private config: RoleReversionConfig = {
      defaultRole: UserRole.STUDENT,
      preserveOriginalRole: true,
      notifyOnExpiration: true,
      gracePeriodHours: 24
    }
  ) {}

  /**
   * Start the automatic role expiration processor
   */
  startProcessor(intervalMinutes: number = 60): void {
    if (this.processingInterval) {
      this.stopProcessor();
    }

    console.log(`Starting temporary role processor with ${intervalMinutes} minute intervals`);
    
    // Run immediately on start
    this.processExpiredRoles();

    // Set up recurring processing
    this.processingInterval = setInterval(
      () => this.processExpiredRoles(),
      intervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop the automatic role expiration processor
   */
  stopProcessor(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Temporary role processor stopped');
    }
  }

  /**
   * Process all expired temporary role assignments
   */
  async processExpiredRoles(): Promise<ExpirationProcessingResult> {
    if (this.isProcessing) {
      console.log('Role expiration processing already in progress, skipping...');
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      };
    }

    this.isProcessing = true;
    console.log('Starting expired role processing...');

    try {
      const expiredRoles = await this.getExpiredTemporaryRoles();
      console.log(`Found ${expiredRoles.length} expired temporary roles`);

      const result: ExpirationProcessingResult = {
        processed: expiredRoles.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const expiredRole of expiredRoles) {
        try {
          await this.processRoleExpiration(expiredRole);
          result.successful++;
          console.log(`Successfully expired role for user ${expiredRole.userId}`);
        } catch (error) {
          result.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({
            assignmentId: expiredRole.assignmentId,
            userId: expiredRole.userId,
            error: errorMessage
          });
          console.error(`Failed to expire role for user ${expiredRole.userId}:`, errorMessage);
        }
      }

      console.log(`Role expiration processing complete: ${result.successful} successful, ${result.failed} failed`);
      return result;

    } catch (error) {
      console.error('Error during role expiration processing:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process expiration for a specific role assignment
   */
  async processRoleExpiration(expiredRole: TemporaryRoleExpiration): Promise<void> {
    // Validate that the role is actually expired
    const now = new Date();
    if (expiredRole.expiresAt > now) {
      throw new Error(`Role assignment ${expiredRole.assignmentId} is not yet expired`);
    }

    // Get the user's current role assignment
    const currentAssignment = await this.getCurrentRoleAssignment(expiredRole.userId);
    if (!currentAssignment) {
      throw new Error(`No current role assignment found for user ${expiredRole.userId}`);
    }

    // Verify this is the assignment we're trying to expire
    if (currentAssignment.id !== expiredRole.assignmentId) {
      console.log(`Role assignment ${expiredRole.assignmentId} is no longer current for user ${expiredRole.userId}`);
      return;
    }

    // Determine the role to revert to
    const revertToRole = this.determineReversionRole(expiredRole, currentAssignment);

    // Update the expired assignment status
    await this.updateAssignmentStatus(expiredRole.assignmentId, RoleStatus.EXPIRED);

    // Create new role assignment with reverted role
    const newAssignment = await this.createRoleAssignment({
      userId: expiredRole.userId,
      role: revertToRole,
      assignedBy: 'system',
      institutionId: expiredRole.institutionId,
      departmentId: expiredRole.departmentId,
      isTemporary: false,
      metadata: {
        revertedFrom: expiredRole.currentRole,
        originalAssignmentId: expiredRole.assignmentId,
        autoExpired: true
      }
    });

    // Log the role expiration
    await this.logRoleExpiration({
      id: this.generateId(),
      userId: expiredRole.userId,
      action: AuditAction.EXPIRED,
      oldRole: expiredRole.currentRole,
      newRole: revertToRole,
      changedBy: 'system',
      reason: 'Temporary role assignment expired',
      timestamp: now,
      institutionId: expiredRole.institutionId,
      departmentId: expiredRole.departmentId,
      metadata: {
        expiredAssignmentId: expiredRole.assignmentId,
        newAssignmentId: newAssignment.id,
        expirationDate: expiredRole.expiresAt.toISOString()
      }
    });

    // Send expiration notifications if configured
    if (this.config.notifyOnExpiration) {
      await this.sendExpirationNotifications(expiredRole, revertToRole);
    }
  }

  /**
   * Get roles that are about to expire (for notifications)
   */
  async getRolesExpiringWithin(hours: number): Promise<TemporaryRoleExpiration[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() + hours);

    // This would query the database for roles expiring within the specified timeframe
    // For now, return mock data structure
    return [];
  }

  /**
   * Send expiration warning notifications
   */
  async sendExpirationWarnings(hoursBeforeExpiration: number = 24): Promise<void> {
    const expiringRoles = await this.getRolesExpiringWithin(hoursBeforeExpiration);
    
    for (const role of expiringRoles) {
      try {
        await this.sendExpirationWarning(role, hoursBeforeExpiration);
      } catch (error) {
        console.error(`Failed to send expiration warning for user ${role.userId}:`, error);
      }
    }
  }

  /**
   * Extend a temporary role assignment
   */
  async extendTemporaryRole(
    assignmentId: string,
    newExpirationDate: Date,
    extendedBy: string,
    reason: string
  ): Promise<UserRoleAssignment> {
    const assignment = await this.getRoleAssignment(assignmentId);
    if (!assignment) {
      throw new Error(`Role assignment ${assignmentId} not found`);
    }

    if (!assignment.isTemporary) {
      throw new Error('Cannot extend non-temporary role assignment');
    }

    if (assignment.status !== RoleStatus.ACTIVE) {
      throw new Error(`Cannot extend role assignment with status ${assignment.status}`);
    }

    const now = new Date();
    if (newExpirationDate <= now) {
      throw new Error('New expiration date must be in the future');
    }

    // Update the assignment with new expiration date
    const updatedAssignment = await this.updateRoleAssignment(assignmentId, {
      expiresAt: newExpirationDate,
      metadata: {
        ...assignment.metadata,
        extended: true,
        extensionHistory: [
          ...(assignment.metadata.extensionHistory || []),
          {
            extendedBy,
            extendedAt: now.toISOString(),
            previousExpiration: assignment.expiresAt?.toISOString(),
            newExpiration: newExpirationDate.toISOString(),
            reason
          }
        ]
      }
    });

    // Log the extension
    await this.logRoleExpiration({
      id: this.generateId(),
      userId: assignment.userId,
      action: AuditAction.CHANGED,
      oldRole: assignment.role,
      newRole: assignment.role,
      changedBy: extendedBy,
      reason: `Temporary role extended: ${reason}`,
      timestamp: now,
      institutionId: assignment.institutionId,
      departmentId: assignment.departmentId,
      metadata: {
        assignmentId,
        previousExpiration: assignment.expiresAt?.toISOString(),
        newExpiration: newExpirationDate.toISOString(),
        extensionReason: reason
      }
    });

    return updatedAssignment;
  }

  /**
   * Get statistics about temporary role assignments
   */
  async getTemporaryRoleStats(): Promise<{
    active: number;
    expiringSoon: number;
    expiredToday: number;
    totalProcessed: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const soonCutoff = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours from now

    // These would be actual database queries
    return {
      active: 0, // Count of active temporary roles
      expiringSoon: 0, // Count expiring within 24 hours
      expiredToday: 0, // Count expired today
      totalProcessed: 0 // Total processed by this service
    };
  }

  // Private helper methods

  private async getExpiredTemporaryRoles(): Promise<TemporaryRoleExpiration[]> {
    const now = new Date();
    
    // This would query the database for expired temporary role assignments
    // For now, return mock data structure
    return [];
  }

  private async getCurrentRoleAssignment(userId: string): Promise<UserRoleAssignment | null> {
    // This would query the database for the user's current active role assignment
    return null;
  }

  private determineReversionRole(
    expiredRole: TemporaryRoleExpiration,
    currentAssignment: UserRoleAssignment
  ): UserRole {
    if (this.config.preserveOriginalRole && expiredRole.previousRole) {
      return expiredRole.previousRole;
    }
    
    // Check if there's a stored original role in metadata
    if (currentAssignment.metadata.originalRole) {
      return currentAssignment.metadata.originalRole as UserRole;
    }

    // Fall back to default role
    return this.config.defaultRole;
  }

  private async updateAssignmentStatus(assignmentId: string, status: RoleStatus): Promise<void> {
    // This would update the role assignment status in the database
    console.log(`Updating assignment ${assignmentId} status to ${status}`);
  }

  private async createRoleAssignment(request: {
    userId: string;
    role: UserRole;
    assignedBy: string;
    institutionId: string;
    departmentId?: string;
    isTemporary: boolean;
    metadata: Record<string, any>;
  }): Promise<UserRoleAssignment> {
    // This would create a new role assignment in the database
    const assignment: UserRoleAssignment = {
      id: this.generateId(),
      userId: request.userId,
      role: request.role,
      status: RoleStatus.ACTIVE,
      assignedBy: request.assignedBy,
      assignedAt: new Date(),
      institutionId: request.institutionId,
      departmentId: request.departmentId,
      isTemporary: request.isTemporary,
      metadata: request.metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return assignment;
  }

  private async getRoleAssignment(assignmentId: string): Promise<UserRoleAssignment | null> {
    // This would query the database for the specific role assignment
    return null;
  }

  private async updateRoleAssignment(
    assignmentId: string,
    updates: Partial<UserRoleAssignment>
  ): Promise<UserRoleAssignment> {
    // This would update the role assignment in the database
    const assignment: UserRoleAssignment = {
      id: assignmentId,
      userId: 'mock-user',
      role: UserRole.STUDENT,
      status: RoleStatus.ACTIVE,
      assignedBy: 'system',
      assignedAt: new Date(),
      institutionId: 'mock-institution',
      isTemporary: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...updates
    };

    return assignment;
  }

  private async logRoleExpiration(log: RoleAuditLog): Promise<void> {
    // This would save the audit log to the database
    console.log('Role expiration logged:', log.action, 'for user:', log.userId);
  }

  private async sendExpirationNotifications(
    expiredRole: TemporaryRoleExpiration,
    revertedToRole: UserRole
  ): Promise<void> {
    // This would send notifications about role expiration
    console.log(`Sending expiration notification for user ${expiredRole.userId}`);
  }

  private async sendExpirationWarning(
    role: TemporaryRoleExpiration,
    hoursUntilExpiration: number
  ): Promise<void> {
    // This would send warning notifications about upcoming expiration
    console.log(`Sending expiration warning for user ${role.userId} (${hoursUntilExpiration} hours)`);
  }

  private generateId(): string {
    return crypto.randomUUID();
  }
}

// Singleton instance for application-wide use
export const temporaryRoleProcessor = new TemporaryRoleProcessor();

// Auto-start the processor in production environments
if (process.env.NODE_ENV === 'production') {
  temporaryRoleProcessor.startProcessor(60); // Process every hour
}