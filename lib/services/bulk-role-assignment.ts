import { createClient } from '@/lib/supabase/server';
import { 
  BulkRoleAssignment, 
  BulkAssignmentResult, 
  ValidationResult, 
  BulkAssignmentStatus,
  UserSelectionCriteria,
  UserSelectionResult,
  RoleAssignmentConflict,
  AssignmentError,
  AssignmentWarning,
  PolicyValidationResult,
  NotificationResult,
  RollbackResult,
  RollbackOptions,
  PerformanceMetrics,
  UserRole,
  AssignmentStatus,
  InstitutionalPolicy
} from '@/lib/types/bulk-role-assignment';
import { AuditLogger } from './audit-logger';
import { NotificationService } from './notification-service';

export class BulkRoleAssignmentService {
  private supabase: any;
  private auditLogger = new AuditLogger();
  private notificationService = new NotificationService();

  constructor(supabaseClient?: any) {
    this.supabase = supabaseClient;
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient();
    }
    return this.supabase;
  }

  /**
   * Validate bulk role assignment before processing
   */
  async validateBulkAssignment(assignment: BulkRoleAssignment): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: any[] = [];
    const warnings: any[] = [];

    try {
      // Validate basic assignment data
      if (!assignment.userIds || assignment.userIds.length === 0) {
        errors.push({
          userId: '',
          field: 'userIds',
          errorCode: 'EMPTY_USER_LIST',
          errorMessage: 'No users selected for role assignment',
          currentValue: assignment.userIds
        });
      }

      if (!assignment.role) {
        errors.push({
          userId: '',
          field: 'role',
          errorCode: 'MISSING_ROLE',
          errorMessage: 'Target role is required',
          currentValue: assignment.role
        });
      }

      if (!assignment.institutionId) {
        errors.push({
          userId: '',
          field: 'institutionId',
          errorCode: 'MISSING_INSTITUTION',
          errorMessage: 'Institution ID is required',
          currentValue: assignment.institutionId
        });
      }

      // If basic validation fails, return early
      if (errors.length > 0) {
        return {
          isValid: false,
          errors,
          warnings,
          affectedUsers: 0,
          estimatedDuration: 0
        };
      }

      // Validate users exist and get their current roles
      const supabase = await this.getSupabase();
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, role, department_id, is_active')
        .in('id', assignment.userIds)
        .eq('institution_id', assignment.institutionId);

      if (usersError) {
        errors.push({
          userId: '',
          field: 'userIds',
          errorCode: 'USER_FETCH_ERROR',
          errorMessage: `Failed to fetch users: ${usersError.message}`,
          currentValue: assignment.userIds
        });
        return {
          isValid: false,
          errors,
          warnings,
          affectedUsers: 0,
          estimatedDuration: 0
        };
      }

      // Check for missing users
      const foundUserIds = users?.map(u => u.id) || [];
      const missingUserIds = assignment.userIds.filter(id => !foundUserIds.includes(id));
      
      for (const missingId of missingUserIds) {
        errors.push({
          userId: missingId,
          field: 'userId',
          errorCode: 'USER_NOT_FOUND',
          errorMessage: 'User not found in institution',
          currentValue: missingId
        });
      }

      // Validate each user's role transition
      for (const user of users || []) {
        // Check if user is active
        if (!user.is_active) {
          warnings.push({
            userId: user.id,
            warningType: 'INACTIVE_USER',
            warningMessage: `User ${user.email} is inactive`,
            impact: 'medium' as const
          });
        }

        // Check if role change is needed
        if (user.role === assignment.role) {
          warnings.push({
            userId: user.id,
            warningType: 'SAME_ROLE',
            warningMessage: `User ${user.email} already has role ${assignment.role}`,
            impact: 'low' as const
          });
        }

        // Validate role transition against institutional policies
        const policyValidation = await this.validateRoleTransition(
          assignment.institutionId,
          user.id,
          user.role,
          assignment.role,
          assignment.departmentId
        );

        if (!policyValidation.isValid) {
          errors.push({
            userId: user.id,
            field: 'role',
            errorCode: 'POLICY_VIOLATION',
            errorMessage: policyValidation.errorMessage || 'Role transition violates institutional policy',
            currentValue: user.role,
            expectedValue: assignment.role
          });
        }

        if (policyValidation.warningMessage) {
          warnings.push({
            userId: user.id,
            warningType: 'POLICY_WARNING',
            warningMessage: policyValidation.warningMessage,
            impact: 'medium' as const
          });
        }
      }

      // Validate temporary role settings
      if (assignment.isTemporary) {
        if (!assignment.expiresAt) {
          errors.push({
            userId: '',
            field: 'expiresAt',
            errorCode: 'MISSING_EXPIRATION',
            errorMessage: 'Expiration date is required for temporary roles',
            currentValue: assignment.expiresAt
          });
        } else if (assignment.expiresAt <= new Date()) {
          errors.push({
            userId: '',
            field: 'expiresAt',
            errorCode: 'INVALID_EXPIRATION',
            errorMessage: 'Expiration date must be in the future',
            currentValue: assignment.expiresAt
          });
        }
      }

      const estimatedDuration = this.calculateEstimatedDuration(assignment.userIds.length);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        affectedUsers: foundUserIds.length,
        estimatedDuration
      };

    } catch (error) {
      console.error('Validation error:', error);
      return {
        isValid: false,
        errors: [{
          userId: '',
          field: 'system',
          errorCode: 'VALIDATION_ERROR',
          errorMessage: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          currentValue: null
        }],
        warnings,
        affectedUsers: 0,
        estimatedDuration: 0
      };
    }
  }

  /**
   * Process bulk role assignment
   */
  async assignRolesToUsers(assignment: BulkRoleAssignment): Promise<BulkAssignmentResult> {
    const startTime = Date.now();
    
    try {
      // First validate the assignment
      if (!assignment.validateOnly) {
        const validation = await this.validateBulkAssignment(assignment);
        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.map(e => e.errorMessage).join(', ')}`);
        }
      }

      // Create bulk assignment record
      const { data: bulkAssignment, error: createError } = await this.supabase
        .from('bulk_role_assignments')
        .insert({
          institution_id: assignment.institutionId,
          initiated_by: assignment.assignedBy,
          assignment_name: assignment.assignmentName || `Bulk Role Assignment - ${new Date().toISOString()}`,
          target_role: assignment.role,
          department_id: assignment.departmentId,
          total_users: assignment.userIds.length,
          is_temporary: assignment.isTemporary,
          expires_at: assignment.expiresAt,
          justification: assignment.justification,
          assignment_options: {
            sendNotifications: assignment.sendNotifications,
            validateOnly: assignment.validateOnly
          },
          status: 'processing'
        })
        .select()
        .single();

      if (createError || !bulkAssignment) {
        throw new Error(`Failed to create bulk assignment: ${createError?.message}`);
      }

      const assignmentId = bulkAssignment.id;
      const result: BulkAssignmentResult = {
        assignmentId,
        totalUsers: assignment.userIds.length,
        successfulAssignments: 0,
        failedAssignments: 0,
        skippedAssignments: 0,
        conflicts: [],
        errors: [],
        warnings: [],
        summary: {
          totalUsers: assignment.userIds.length,
          processedUsers: 0,
          successfulAssignments: 0,
          failedAssignments: 0,
          skippedAssignments: 0,
          conflictsFound: 0,
          warningsGenerated: 0,
          duration: 0,
          batchSize: 50
        },
        duration: 0,
        requiresApproval: false
      };

      // Process users in batches
      const batchSize = 50;
      const batches = this.createBatches(assignment.userIds, batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchResult = await this.processBatch(
          assignmentId,
          batch,
          assignment,
          batchIndex + 1,
          batches.length
        );

        // Aggregate results
        result.successfulAssignments += batchResult.successfulAssignments;
        result.failedAssignments += batchResult.failedAssignments;
        result.skippedAssignments += batchResult.skippedAssignments;
        result.conflicts.push(...batchResult.conflicts);
        result.errors.push(...batchResult.errors);
        result.warnings.push(...batchResult.warnings);

        // Update progress
        await this.updateAssignmentProgress(assignmentId, {
          processed_users: (batchIndex + 1) * batchSize,
          successful_assignments: result.successfulAssignments,
          failed_assignments: result.failedAssignments,
          skipped_assignments: result.skippedAssignments
        });
      }

      // Update final status
      const finalStatus: AssignmentStatus = result.failedAssignments > 0 ? 'failed' : 'completed';
      await this.supabase
        .from('bulk_role_assignments')
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          processed_users: result.totalUsers,
          successful_assignments: result.successfulAssignments,
          failed_assignments: result.failedAssignments,
          skipped_assignments: result.skippedAssignments
        })
        .eq('id', assignmentId);

      // Calculate final metrics
      const endTime = Date.now();
      result.duration = endTime - startTime;
      result.summary.duration = result.duration;
      result.summary.processedUsers = result.totalUsers;
      result.summary.conflictsFound = result.conflicts.length;
      result.summary.warningsGenerated = result.warnings.length;

      // Send notifications if requested
      if (assignment.sendNotifications && result.successfulAssignments > 0) {
        await this.sendBulkNotifications(assignmentId, assignment);
      }

      return result;

    } catch (error) {
      console.error('Bulk assignment error:', error);
      throw error;
    }
  }

  /**
   * Get bulk assignment status
   */
  async getBulkAssignmentStatus(assignmentId: string): Promise<BulkAssignmentStatus> {
    const { data: assignment, error } = await this.supabase
      .from('bulk_role_assignments')
      .select('*')
      .eq('id', assignmentId)
      .single();

    if (error || !assignment) {
      throw new Error(`Assignment not found: ${error?.message}`);
    }

    const { data: items } = await this.supabase
      .from('bulk_role_assignment_items')
      .select('assignment_status, error_message, error_code')
      .eq('bulk_assignment_id', assignmentId);

    const errors: AssignmentError[] = (items || [])
      .filter(item => item.assignment_status === 'failed')
      .map(item => ({
        userId: '',
        errorCode: item.error_code || 'UNKNOWN',
        errorMessage: item.error_message || 'Unknown error',
        errorType: 'system' as const,
        retryable: true
      }));

    const progress = assignment.total_users > 0 
      ? (assignment.processed_users / assignment.total_users) * 100 
      : 0;

    return {
      assignmentId,
      status: assignment.status,
      progress,
      currentBatch: Math.ceil(assignment.processed_users / 50),
      totalBatches: Math.ceil(assignment.total_users / 50),
      startedAt: new Date(assignment.started_at),
      estimatedCompletion: this.calculateEstimatedCompletion(assignment),
      lastUpdated: new Date(assignment.updated_at),
      errors,
      warnings: []
    };
  }

  /**
   * Search and filter users for selection
   */
  async searchUsers(criteria: UserSelectionCriteria): Promise<UserSelectionResult> {
    let query = this.supabase
      .from('users')
      .select(`
        id,
        email,
        first_name,
        last_name,
        role,
        department_id,
        is_active,
        last_login_at,
        departments(name)
      `)
      .eq('institution_id', criteria.institutionId);

    // Apply filters
    if (criteria.departmentIds && criteria.departmentIds.length > 0) {
      query = query.in('department_id', criteria.departmentIds);
    }

    if (criteria.currentRoles && criteria.currentRoles.length > 0) {
      query = query.in('role', criteria.currentRoles);
    }

    if (criteria.searchQuery) {
      query = query.or(`email.ilike.%${criteria.searchQuery}%,first_name.ilike.%${criteria.searchQuery}%,last_name.ilike.%${criteria.searchQuery}%`);
    }

    if (!criteria.includeInactive) {
      query = query.eq('is_active', true);
    }

    if (criteria.excludeUserIds && criteria.excludeUserIds.length > 0) {
      query = query.not('id', 'in', `(${criteria.excludeUserIds.join(',')})`);
    }

    const { data: users, error, count } = await query
      .order('last_name')
      .limit(100);

    if (error) {
      throw new Error(`Failed to search users: ${error.message}`);
    }

    const selectedUsers = (users || []).map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      currentRole: user.role as UserRole,
      departmentId: user.department_id,
      departmentName: user.departments?.name,
      isActive: user.is_active,
      lastLoginAt: user.last_login_at ? new Date(user.last_login_at) : undefined,
      conflictRisk: 'low' as const, // TODO: Implement conflict risk assessment
      conflictReasons: []
    }));

    return {
      users: selectedUsers,
      totalCount: count || 0,
      filteredCount: selectedUsers.length,
      hasMore: (count || 0) > selectedUsers.length,
      nextCursor: undefined
    };
  }

  /**
   * Rollback bulk assignment
   */
  async rollbackAssignment(options: RollbackOptions): Promise<RollbackResult> {
    try {
      // Get assignment details
      const { data: assignment, error: assignmentError } = await this.supabase
        .from('bulk_role_assignments')
        .select('*')
        .eq('id', options.assignmentId)
        .single();

      if (assignmentError || !assignment) {
        throw new Error(`Assignment not found: ${assignmentError?.message}`);
      }

      // Get successful assignment items
      const { data: items, error: itemsError } = await this.supabase
        .from('bulk_role_assignment_items')
        .select('user_id, previous_role, target_role')
        .eq('bulk_assignment_id', options.assignmentId)
        .eq('assignment_status', 'success');

      if (itemsError) {
        throw new Error(`Failed to get assignment items: ${itemsError.message}`);
      }

      const result: RollbackResult = {
        success: true,
        rolledBackUsers: 0,
        failedRollbacks: 0,
        errors: [],
        auditLogId: ''
      };

      // Rollback each user's role
      for (const item of items || []) {
        try {
          if (item.previous_role) {
            const { error: updateError } = await this.supabase
              .from('users')
              .update({ role: item.previous_role })
              .eq('id', item.user_id);

            if (updateError) {
              result.errors.push({
                userId: item.user_id,
                errorCode: 'ROLLBACK_FAILED',
                errorMessage: `Failed to rollback user role: ${updateError.message}`,
                errorType: 'system',
                retryable: true
              });
              result.failedRollbacks++;
            } else {
              result.rolledBackUsers++;
            }
          }
        } catch (error) {
          result.errors.push({
            userId: item.user_id,
            errorCode: 'ROLLBACK_ERROR',
            errorMessage: `Rollback error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            errorType: 'system',
            retryable: true
          });
          result.failedRollbacks++;
        }
      }

      // Log rollback action
      const auditLogId = await this.auditLogger.logBulkRoleAssignmentRollback(
        options.assignmentId,
        options.rollbackBy,
        options.rollbackReason,
        result
      );

      result.auditLogId = auditLogId;
      result.success = result.failedRollbacks === 0;

      return result;

    } catch (error) {
      console.error('Rollback error:', error);
      throw error;
    }
  }

  // Private helper methods

  private async validateRoleTransition(
    institutionId: string,
    userId: string,
    fromRole: string,
    toRole: string,
    departmentId?: string
  ): Promise<PolicyValidationResult> {
    try {
      const { data, error } = await this.supabase
        .rpc('validate_role_transition', {
          p_institution_id: institutionId,
          p_user_id: userId,
          p_from_role: fromRole,
          p_to_role: toRole,
          p_department_id: departmentId
        });

      if (error) {
        return {
          isValid: false,
          requiresApproval: false,
          errorMessage: `Policy validation failed: ${error.message}`
        };
      }

      const result = data[0];
      return {
        isValid: result.is_valid,
        requiresApproval: result.requires_approval,
        approvalRole: result.approval_role as UserRole,
        errorMessage: result.error_message,
        warningMessage: result.requires_approval ? `Approval required from ${result.approval_role}` : undefined
      };

    } catch (error) {
      return {
        isValid: false,
        requiresApproval: false,
        errorMessage: `Policy validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatch(
    assignmentId: string,
    userIds: string[],
    assignment: BulkRoleAssignment,
    batchNumber: number,
    totalBatches: number
  ): Promise<{
    successfulAssignments: number;
    failedAssignments: number;
    skippedAssignments: number;
    conflicts: RoleAssignmentConflict[];
    errors: AssignmentError[];
    warnings: AssignmentWarning[];
  }> {
    const result = {
      successfulAssignments: 0,
      failedAssignments: 0,
      skippedAssignments: 0,
      conflicts: [] as RoleAssignmentConflict[],
      errors: [] as AssignmentError[],
      warnings: [] as AssignmentWarning[]
    };

    // Get user details
    const { data: users, error: usersError } = await this.supabase
      .from('users')
      .select('id, email, role, department_id, is_active')
      .in('id', userIds)
      .eq('institution_id', assignment.institutionId);

    if (usersError || !users) {
      for (const userId of userIds) {
        result.errors.push({
          userId,
          errorCode: 'USER_FETCH_ERROR',
          errorMessage: `Failed to fetch user: ${usersError?.message}`,
          errorType: 'system',
          retryable: true
        });
        result.failedAssignments++;
      }
      return result;
    }

    // Process each user
    for (const user of users) {
      try {
        // Create assignment item record
        const { error: itemError } = await this.supabase
          .from('bulk_role_assignment_items')
          .insert({
            bulk_assignment_id: assignmentId,
            user_id: user.id,
            previous_role: user.role,
            target_role: assignment.role,
            assignment_status: 'pending',
            expires_at: assignment.expiresAt
          });

        if (itemError) {
          result.errors.push({
            userId: user.id,
            errorCode: 'ITEM_CREATE_ERROR',
            errorMessage: `Failed to create assignment item: ${itemError.message}`,
            errorType: 'system',
            retryable: true
          });
          result.failedAssignments++;
          continue;
        }

        // Skip if same role
        if (user.role === assignment.role) {
          await this.supabase
            .from('bulk_role_assignment_items')
            .update({ assignment_status: 'skipped', error_message: 'User already has target role' })
            .eq('bulk_assignment_id', assignmentId)
            .eq('user_id', user.id);
          
          result.skippedAssignments++;
          continue;
        }

        // Update user role
        const { error: updateError } = await this.supabase
          .from('users')
          .update({ role: assignment.role })
          .eq('id', user.id);

        if (updateError) {
          await this.supabase
            .from('bulk_role_assignment_items')
            .update({ 
              assignment_status: 'failed', 
              error_message: updateError.message,
              error_code: 'ROLE_UPDATE_FAILED'
            })
            .eq('bulk_assignment_id', assignmentId)
            .eq('user_id', user.id);

          result.errors.push({
            userId: user.id,
            errorCode: 'ROLE_UPDATE_FAILED',
            errorMessage: `Failed to update user role: ${updateError.message}`,
            errorType: 'system',
            retryable: true
          });
          result.failedAssignments++;
          continue;
        }

        // Mark as successful
        await this.supabase
          .from('bulk_role_assignment_items')
          .update({ 
            assignment_status: 'success',
            assigned_at: new Date().toISOString()
          })
          .eq('bulk_assignment_id', assignmentId)
          .eq('user_id', user.id);

        // Log audit trail
        await this.auditLogger.logRoleChange(
          user.id,
          assignment.institutionId,
          assignmentId,
          user.role,
          assignment.role,
          assignment.assignedBy,
          assignment.justification,
          assignment.isTemporary,
          assignment.expiresAt
        );

        result.successfulAssignments++;

      } catch (error) {
        result.errors.push({
          userId: user.id,
          errorCode: 'PROCESSING_ERROR',
          errorMessage: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          errorType: 'system',
          retryable: true
        });
        result.failedAssignments++;
      }
    }

    return result;
  }

  private async updateAssignmentProgress(assignmentId: string, progress: {
    processed_users: number;
    successful_assignments: number;
    failed_assignments: number;
    skipped_assignments: number;
  }): Promise<void> {
    await this.supabase
      .from('bulk_role_assignments')
      .update({
        processed_users: progress.processed_users,
        successful_assignments: progress.successful_assignments,
        failed_assignments: progress.failed_assignments,
        skipped_assignments: progress.skipped_assignments,
        updated_at: new Date().toISOString()
      })
      .eq('id', assignmentId);
  }

  private async sendBulkNotifications(assignmentId: string, assignment: BulkRoleAssignment): Promise<void> {
    // Get successful assignments
    const { data: items } = await this.supabase
      .from('bulk_role_assignment_items')
      .select('user_id, target_role')
      .eq('bulk_assignment_id', assignmentId)
      .eq('assignment_status', 'success');

    if (!items || items.length === 0) return;

    // Send notifications to each user
    for (const item of items) {
      try {
        await this.notificationService.sendRoleAssignmentNotification(
          item.user_id,
          item.target_role as UserRole,
          assignment.isTemporary,
          assignment.expiresAt
        );

        // Log notification
        await this.supabase
          .from('role_assignment_notifications')
          .insert({
            bulk_assignment_id: assignmentId,
            user_id: item.user_id,
            notification_type: assignment.isTemporary ? 'temporary_role_assigned' : 'role_assigned',
            subject: `Role Assignment: ${item.target_role}`,
            message: `Your role has been ${assignment.isTemporary ? 'temporarily ' : ''}assigned to ${item.target_role}`,
            delivery_status: 'sent',
            sent_at: new Date().toISOString()
          });

      } catch (error) {
        console.error(`Failed to send notification to user ${item.user_id}:`, error);
        
        // Log failed notification
        await this.supabase
          .from('role_assignment_notifications')
          .insert({
            bulk_assignment_id: assignmentId,
            user_id: item.user_id,
            notification_type: assignment.isTemporary ? 'temporary_role_assigned' : 'role_assigned',
            subject: `Role Assignment: ${item.target_role}`,
            message: `Your role has been ${assignment.isTemporary ? 'temporarily ' : ''}assigned to ${item.target_role}`,
            delivery_status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            delivery_attempts: 1
          });
      }
    }
  }

  private calculateEstimatedDuration(userCount: number): number {
    // Estimate ~100ms per user for processing
    return Math.ceil(userCount * 0.1);
  }

  private calculateEstimatedCompletion(assignment: any): Date | undefined {
    if (assignment.status === 'completed' || assignment.status === 'failed') {
      return undefined;
    }

    const remainingUsers = assignment.total_users - assignment.processed_users;
    if (remainingUsers <= 0) return undefined;

    const estimatedRemainingTime = this.calculateEstimatedDuration(remainingUsers);
    return new Date(Date.now() + estimatedRemainingTime * 1000);
  }
}