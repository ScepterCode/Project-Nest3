import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types/onboarding';
import { ValidationError } from '@/lib/types/institution';

export interface InstitutionUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  institutionId: string;
  departmentId?: string;
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  joinedAt: Date;
  lastActiveAt?: Date;
  invitedBy?: string;
  metadata?: Record<string, any>;
}

export interface UserRoleAssignment {
  userId: string;
  institutionId: string;
  role: UserRole;
  departmentId?: string;
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date;
}

export interface InstitutionUserFilters {
  role?: UserRole;
  status?: 'active' | 'inactive' | 'pending' | 'suspended';
  departmentId?: string;
  search?: string;
  joinedAfter?: Date;
  joinedBefore?: Date;
  limit?: number;
  offset?: number;
}

export interface BulkRoleAssignmentRequest {
  userIds: string[];
  role: UserRole;
  departmentId?: string;
  assignedBy: string;
  notifyUsers?: boolean;
}

export interface UserAccessModificationRequest {
  userId: string;
  institutionId: string;
  changes: {
    role?: UserRole;
    departmentId?: string;
    status?: 'active' | 'inactive' | 'suspended';
  };
  modifiedBy: string;
  reason?: string;
}

export class InstitutionUserManager {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Get all users for an institution with filtering
   */
  async getInstitutionUsers(
    institutionId: string,
    filters: InstitutionUserFilters = {}
  ): Promise<{ users: InstitutionUser[]; total: number }> {
    try {
      let query = this.supabase
        .from('users')
        .select(`
          *,
          user_institutions!inner (
            institution_id,
            role,
            department_id,
            status,
            joined_at,
            invited_by,
            metadata
          ),
          departments (
            id,
            name,
            code
          )
        `, { count: 'exact' })
        .eq('user_institutions.institution_id', institutionId);

      // Apply filters
      if (filters.role) {
        query = query.eq('user_institutions.role', filters.role);
      }
      if (filters.status) {
        query = query.eq('user_institutions.status', filters.status);
      }
      if (filters.departmentId) {
        query = query.eq('user_institutions.department_id', filters.departmentId);
      }
      if (filters.search) {
        query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }
      if (filters.joinedAfter) {
        query = query.gte('user_institutions.joined_at', filters.joinedAfter.toISOString());
      }
      if (filters.joinedBefore) {
        query = query.lte('user_institutions.joined_at', filters.joinedBefore.toISOString());
      }

      // Apply pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 10)) - 1);
      }

      // Order by joined date
      query = query.order('joined_at', { ascending: false, foreignTable: 'user_institutions' });

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching institution users:', error);
        return { users: [], total: 0 };
      }

      const users = (data || []).map(this.mapToInstitutionUser);
      return { users, total: count || 0 };
    } catch (error) {
      console.error('Unexpected error fetching institution users:', error);
      return { users: [], total: 0 };
    }
  }

  /**
   * Get user's role and permissions within an institution
   */
  async getUserInstitutionRole(
    userId: string,
    institutionId: string
  ): Promise<UserRoleAssignment | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_institutions')
        .select('*')
        .eq('user_id', userId)
        .eq('institution_id', institutionId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        userId: data.user_id,
        institutionId: data.institution_id,
        role: data.role,
        departmentId: data.department_id,
        assignedBy: data.assigned_by || data.invited_by,
        assignedAt: new Date(data.joined_at || data.created_at),
        expiresAt: data.expires_at ? new Date(data.expires_at) : undefined
      };
    } catch (error) {
      console.error('Error fetching user institution role:', error);
      return null;
    }
  }

  /**
   * Assign role to a user within an institution
   */
  async assignUserRole(
    userId: string,
    institutionId: string,
    role: UserRole,
    assignedBy: string,
    departmentId?: string
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Validate role assignment
      const validation = await this.validateRoleAssignment(userId, institutionId, role, departmentId);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check if user already has a role in this institution
      const existingRole = await this.getUserInstitutionRole(userId, institutionId);
      
      const now = new Date().toISOString();
      
      if (existingRole) {
        // Update existing role
        const { error } = await this.supabase
          .from('user_institutions')
          .update({
            role,
            department_id: departmentId,
            assigned_by: assignedBy,
            updated_at: now,
            status: 'active'
          })
          .eq('user_id', userId)
          .eq('institution_id', institutionId);

        if (error) {
          console.error('Error updating user role:', error);
          return {
            success: false,
            errors: [{ field: 'role', message: 'Failed to update user role', code: 'DATABASE_ERROR' }]
          };
        }
      } else {
        // Create new role assignment
        const { error } = await this.supabase
          .from('user_institutions')
          .insert({
            user_id: userId,
            institution_id: institutionId,
            role,
            department_id: departmentId,
            assigned_by: assignedBy,
            joined_at: now,
            status: 'active',
            created_at: now,
            updated_at: now
          });

        if (error) {
          console.error('Error assigning user role:', error);
          return {
            success: false,
            errors: [{ field: 'role', message: 'Failed to assign user role', code: 'DATABASE_ERROR' }]
          };
        }
      }

      // Log the role assignment
      await this.logUserAction(userId, institutionId, 'role_assigned', assignedBy, { role, departmentId });

      return { success: true };
    } catch (error) {
      console.error('Unexpected error assigning user role:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Bulk assign roles to multiple users
   */
  async bulkAssignRoles(
    request: BulkRoleAssignmentRequest
  ): Promise<{
    successful: string[];
    failed: Array<{ userId: string; error: string }>;
    stats: { total: number; successful: number; failed: number };
  }> {
    const successful: string[] = [];
    const failed: Array<{ userId: string; error: string }> = [];

    for (const userId of request.userIds) {
      try {
        // Get user's institution ID (assuming we're working within a single institution context)
        const userInstitution = await this.getUserPrimaryInstitution(userId);
        if (!userInstitution) {
          failed.push({ userId, error: 'User not found or not associated with any institution' });
          continue;
        }

        const result = await this.assignUserRole(
          userId,
          userInstitution.institutionId,
          request.role,
          request.assignedBy,
          request.departmentId
        );

        if (result.success) {
          successful.push(userId);
        } else {
          const errorMessage = result.errors?.[0]?.message || 'Unknown error';
          failed.push({ userId, error: errorMessage });
        }
      } catch (error) {
        failed.push({
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Send notifications if requested
    if (request.notifyUsers && successful.length > 0) {
      await this.notifyUsersOfRoleChange(successful, request.role, request.assignedBy);
    }

    return {
      successful,
      failed,
      stats: {
        total: request.userIds.length,
        successful: successful.length,
        failed: failed.length
      }
    };
  }

  /**
   * Modify user access (role, department, status) with immediate permission updates
   */
  async modifyUserAccess(
    request: UserAccessModificationRequest
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Validate the modification request
      const validation = await this.validateAccessModification(request);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Get current user state
      const currentRole = await this.getUserInstitutionRole(request.userId, request.institutionId);
      if (!currentRole) {
        return {
          success: false,
          errors: [{ field: 'user', message: 'User not found in institution', code: 'USER_NOT_FOUND' }]
        };
      }

      // Store previous state for rollback if needed
      const previousState = {
        role: currentRole.role,
        departmentId: currentRole.departmentId,
        status: 'active' // Assuming current status is active if user exists
      };

      // Prepare update data
      const updateData: any = {
        updated_at: new Date().toISOString(),
        modified_by: request.modifiedBy
      };

      if (request.changes.role) {
        updateData.role = request.changes.role;
      }
      if (request.changes.departmentId !== undefined) {
        updateData.department_id = request.changes.departmentId;
      }
      if (request.changes.status) {
        updateData.status = request.changes.status;
      }

      // Start transaction-like operation
      const { error } = await this.supabase
        .from('user_institutions')
        .update(updateData)
        .eq('user_id', request.userId)
        .eq('institution_id', request.institutionId);

      if (error) {
        console.error('Error modifying user access:', error);
        return {
          success: false,
          errors: [{ field: 'access', message: 'Failed to modify user access', code: 'DATABASE_ERROR' }]
        };
      }

      // Immediately update user permissions and invalidate sessions if needed
      const permissionUpdateResult = await this.updateUserPermissionsImmediately(
        request.userId,
        request.institutionId,
        request.changes,
        previousState
      );

      if (!permissionUpdateResult.success) {
        // Rollback the database changes
        await this.rollbackUserAccessChanges(request.userId, request.institutionId, previousState);
        return {
          success: false,
          errors: permissionUpdateResult.errors || [{ field: 'permissions', message: 'Failed to update permissions', code: 'PERMISSION_UPDATE_FAILED' }]
        };
      }

      // Log the access modification
      await this.logUserAction(
        request.userId,
        request.institutionId,
        'access_modified',
        request.modifiedBy,
        { 
          changes: request.changes, 
          previousState,
          reason: request.reason,
          immediateUpdate: true
        }
      );

      // Notify user of access change
      await this.notifyUserOfAccessChange(request.userId, request.changes, request.modifiedBy);

      // Trigger real-time updates for active sessions
      await this.triggerRealTimePermissionUpdate(request.userId, request.institutionId, request.changes);

      return { success: true };
    } catch (error) {
      console.error('Unexpected error modifying user access:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Remove user from institution
   */
  async removeUserFromInstitution(
    userId: string,
    institutionId: string,
    removedBy: string,
    reason?: string
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Check if user exists in institution
      const userRole = await this.getUserInstitutionRole(userId, institutionId);
      if (!userRole) {
        return {
          success: false,
          errors: [{ field: 'user', message: 'User not found in institution', code: 'USER_NOT_FOUND' }]
        };
      }

      // Validate removal (e.g., can't remove the last admin)
      const validation = await this.validateUserRemoval(userId, institutionId, userRole.role);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Soft delete by setting status to inactive
      const { error } = await this.supabase
        .from('user_institutions')
        .update({
          status: 'inactive',
          removed_by: removedBy,
          removed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('institution_id', institutionId);

      if (error) {
        console.error('Error removing user from institution:', error);
        return {
          success: false,
          errors: [{ field: 'removal', message: 'Failed to remove user', code: 'DATABASE_ERROR' }]
        };
      }

      // Log the removal
      await this.logUserAction(userId, institutionId, 'user_removed', removedBy, { reason });

      // Notify user of removal
      await this.notifyUserOfRemoval(userId, institutionId, removedBy, reason);

      return { success: true };
    } catch (error) {
      console.error('Unexpected error removing user:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Get user activity and engagement metrics
   */
  async getUserActivityMetrics(
    institutionId: string,
    userId?: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<{
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    usersByRole: Record<UserRole, number>;
    usersByDepartment: Record<string, number>;
  }> {
    try {
      const dateFilter = dateRange ? {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString()
      } : null;

      // Get total and active users
      const { data: userStats } = await this.supabase
        .from('user_institutions')
        .select('role, department_id, status, joined_at, last_active_at')
        .eq('institution_id', institutionId)
        .neq('status', 'inactive');

      if (!userStats) {
        return {
          totalUsers: 0,
          activeUsers: 0,
          newUsers: 0,
          usersByRole: {} as Record<UserRole, number>,
          usersByDepartment: {}
        };
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const metrics = userStats.reduce((acc, user) => {
        // Count total users
        acc.totalUsers++;

        // Count active users (active in last 30 days)
        if (user.last_active_at && new Date(user.last_active_at) > thirtyDaysAgo) {
          acc.activeUsers++;
        }

        // Count new users (joined in date range or last 30 days)
        const joinedAt = new Date(user.joined_at);
        const isNewUser = dateFilter 
          ? joinedAt >= new Date(dateFilter.start) && joinedAt <= new Date(dateFilter.end)
          : joinedAt > thirtyDaysAgo;
        
        if (isNewUser) {
          acc.newUsers++;
        }

        // Count by role
        acc.usersByRole[user.role as UserRole] = (acc.usersByRole[user.role as UserRole] || 0) + 1;

        // Count by department
        if (user.department_id) {
          acc.usersByDepartment[user.department_id] = (acc.usersByDepartment[user.department_id] || 0) + 1;
        }

        return acc;
      }, {
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        usersByRole: {} as Record<UserRole, number>,
        usersByDepartment: {} as Record<string, number>
      });

      return metrics;
    } catch (error) {
      console.error('Error fetching user activity metrics:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        usersByRole: {} as Record<UserRole, number>,
        usersByDepartment: {}
      };
    }
  }

  // Private helper methods

  private async validateRoleAssignment(
    userId: string,
    institutionId: string,
    role: UserRole,
    departmentId?: string
  ): Promise<{ isValid: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    // Validate user exists
    const { data: user } = await this.supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (!user) {
      errors.push({ field: 'userId', message: 'User not found', code: 'USER_NOT_FOUND' });
    }

    // Validate institution exists
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('id')
      .eq('id', institutionId)
      .single();

    if (!institution) {
      errors.push({ field: 'institutionId', message: 'Institution not found', code: 'INSTITUTION_NOT_FOUND' });
    }

    // Validate department if provided
    if (departmentId) {
      const { data: department } = await this.supabase
        .from('departments')
        .select('id, institution_id')
        .eq('id', departmentId)
        .single();

      if (!department) {
        errors.push({ field: 'departmentId', message: 'Department not found', code: 'DEPARTMENT_NOT_FOUND' });
      } else if (department.institution_id !== institutionId) {
        errors.push({ field: 'departmentId', message: 'Department does not belong to institution', code: 'DEPARTMENT_MISMATCH' });
      }
    }

    // Validate role
    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(role)) {
      errors.push({ field: 'role', message: 'Invalid role', code: 'INVALID_ROLE' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async validateAccessModification(
    request: UserAccessModificationRequest
  ): Promise<{ isValid: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    // Validate that at least one change is specified
    if (!request.changes.role && !request.changes.departmentId && !request.changes.status) {
      errors.push({ field: 'changes', message: 'At least one change must be specified', code: 'NO_CHANGES' });
    }

    // Validate role if changing
    if (request.changes.role) {
      const validRoles = Object.values(UserRole);
      if (!validRoles.includes(request.changes.role)) {
        errors.push({ field: 'role', message: 'Invalid role', code: 'INVALID_ROLE' });
      }
    }

    // Validate department if changing
    if (request.changes.departmentId) {
      const { data: department } = await this.supabase
        .from('departments')
        .select('id, institution_id')
        .eq('id', request.changes.departmentId)
        .single();

      if (!department) {
        errors.push({ field: 'departmentId', message: 'Department not found', code: 'DEPARTMENT_NOT_FOUND' });
      } else if (department.institution_id !== request.institutionId) {
        errors.push({ field: 'departmentId', message: 'Department does not belong to institution', code: 'DEPARTMENT_MISMATCH' });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async validateUserRemoval(
    userId: string,
    institutionId: string,
    userRole: UserRole
  ): Promise<{ isValid: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    // Check if this is the last admin
    if (userRole === UserRole.INSTITUTION_ADMIN) {
      const { count } = await this.supabase
        .from('user_institutions')
        .select('id', { count: 'exact' })
        .eq('institution_id', institutionId)
        .eq('role', UserRole.INSTITUTION_ADMIN)
        .eq('status', 'active');

      if (count && count <= 1) {
        errors.push({ 
          field: 'role', 
          message: 'Cannot remove the last institution admin', 
          code: 'LAST_ADMIN' 
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async getUserPrimaryInstitution(userId: string): Promise<{ institutionId: string } | null> {
    const { data } = await this.supabase
      .from('user_institutions')
      .select('institution_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true })
      .limit(1)
      .single();

    return data ? { institutionId: data.institution_id } : null;
  }

  private mapToInstitutionUser(data: any): InstitutionUser {
    const userInstitution = data.user_institutions[0]; // Since we're filtering by institution
    
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      role: userInstitution.role,
      institutionId: userInstitution.institution_id,
      departmentId: userInstitution.department_id,
      status: userInstitution.status,
      joinedAt: new Date(userInstitution.joined_at),
      lastActiveAt: data.last_active_at ? new Date(data.last_active_at) : undefined,
      invitedBy: userInstitution.invited_by,
      metadata: userInstitution.metadata
    };
  }

  private async logUserAction(
    userId: string,
    institutionId: string,
    action: string,
    performedBy: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await this.supabase
        .from('user_audit_log')
        .insert({
          user_id: userId,
          institution_id: institutionId,
          action,
          performed_by: performedBy,
          metadata: metadata || {},
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging user action:', error);
    }
  }

  private async notifyUsersOfRoleChange(
    userIds: string[],
    newRole: UserRole,
    assignedBy: string
  ): Promise<void> {
    // Implementation would integrate with notification service
    console.log(`Notifying ${userIds.length} users of role change to ${newRole} by ${assignedBy}`);
  }

  private async notifyUserOfAccessChange(
    userId: string,
    changes: any,
    modifiedBy: string
  ): Promise<void> {
    // Implementation would integrate with notification service
    console.log(`Notifying user ${userId} of access changes:`, changes, `by ${modifiedBy}`);
  }

  private async notifyUserOfRemoval(
    userId: string,
    institutionId: string,
    removedBy: string,
    reason?: string
  ): Promise<void> {
    // Implementation would integrate with notification service
    console.log(`Notifying user ${userId} of removal from institution ${institutionId} by ${removedBy}`, { reason });
  }

  /**
   * Immediately update user permissions and invalidate sessions if needed
   */
  private async updateUserPermissionsImmediately(
    userId: string,
    institutionId: string,
    changes: UserAccessModificationRequest['changes'],
    previousState: any
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Update user session data if they have active sessions
      await this.invalidateUserSessions(userId, institutionId, changes);

      // Update cached permissions
      await this.updateCachedPermissions(userId, institutionId, changes);

      // If role changed significantly, revoke existing tokens/sessions
      if (changes.role && changes.role !== previousState.role) {
        await this.revokeUserTokensForRoleChange(userId, institutionId, previousState.role, changes.role);
      }

      // If status changed to inactive/suspended, immediately revoke access
      if (changes.status && ['inactive', 'suspended'].includes(changes.status)) {
        await this.revokeAllUserAccess(userId, institutionId);
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating user permissions immediately:', error);
      return {
        success: false,
        errors: [{ field: 'permissions', message: 'Failed to update permissions immediately', code: 'PERMISSION_UPDATE_ERROR' }]
      };
    }
  }

  /**
   * Rollback user access changes in case of permission update failure
   */
  private async rollbackUserAccessChanges(
    userId: string,
    institutionId: string,
    previousState: any
  ): Promise<void> {
    try {
      await this.supabase
        .from('user_institutions')
        .update({
          role: previousState.role,
          department_id: previousState.departmentId,
          status: previousState.status,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('institution_id', institutionId);

      console.log(`Rolled back user access changes for user ${userId} in institution ${institutionId}`);
    } catch (error) {
      console.error('Error rolling back user access changes:', error);
    }
  }

  /**
   * Trigger real-time permission updates for active user sessions
   */
  private async triggerRealTimePermissionUpdate(
    userId: string,
    institutionId: string,
    changes: UserAccessModificationRequest['changes']
  ): Promise<void> {
    try {
      // Send real-time notification to user's active sessions
      const channel = `user_permissions:${userId}`;
      
      // In a real implementation, this would use your real-time service (e.g., Supabase Realtime, Socket.io, etc.)
      await this.supabase
        .channel(channel)
        .send({
          type: 'broadcast',
          event: 'permission_updated',
          payload: {
            userId,
            institutionId,
            changes,
            timestamp: new Date().toISOString()
          }
        });

      console.log(`Triggered real-time permission update for user ${userId}`);
    } catch (error) {
      console.error('Error triggering real-time permission update:', error);
    }
  }

  /**
   * Invalidate user sessions when permissions change
   */
  private async invalidateUserSessions(
    userId: string,
    institutionId: string,
    changes: UserAccessModificationRequest['changes']
  ): Promise<void> {
    try {
      // If role or status changed significantly, invalidate sessions
      const significantChange = changes.role || (changes.status && ['inactive', 'suspended'].includes(changes.status));
      
      if (significantChange) {
        // In a real implementation, this would invalidate JWT tokens or session tokens
        // For now, we'll log the action and potentially update a session invalidation table
        
        await this.supabase
          .from('user_session_invalidations')
          .insert({
            user_id: userId,
            institution_id: institutionId,
            reason: 'permission_change',
            invalidated_at: new Date().toISOString(),
            changes: changes
          });

        console.log(`Invalidated sessions for user ${userId} due to permission changes`);
      }
    } catch (error) {
      console.error('Error invalidating user sessions:', error);
    }
  }

  /**
   * Update cached permissions for immediate effect
   */
  private async updateCachedPermissions(
    userId: string,
    institutionId: string,
    changes: UserAccessModificationRequest['changes']
  ): Promise<void> {
    try {
      // Update any cached permission data
      // This could involve updating Redis cache, in-memory cache, etc.
      
      const cacheKey = `user_permissions:${userId}:${institutionId}`;
      
      // In a real implementation, you would update your cache here
      // For now, we'll simulate by logging the cache update
      console.log(`Updated cached permissions for ${cacheKey}:`, changes);
      
      // You might also want to update any permission-related tables
      await this.supabase
        .from('user_permission_cache')
        .upsert({
          user_id: userId,
          institution_id: institutionId,
          role: changes.role,
          department_id: changes.departmentId,
          status: changes.status,
          updated_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error updating cached permissions:', error);
    }
  }

  /**
   * Revoke user tokens when role changes significantly
   */
  private async revokeUserTokensForRoleChange(
    userId: string,
    institutionId: string,
    oldRole: UserRole,
    newRole: UserRole
  ): Promise<void> {
    try {
      // Define role hierarchy to determine if change is significant
      const roleHierarchy = {
        [UserRole.SYSTEM_ADMIN]: 5,
        [UserRole.INSTITUTION_ADMIN]: 4,
        [UserRole.DEPARTMENT_ADMIN]: 3,
        [UserRole.TEACHER]: 2,
        [UserRole.STUDENT]: 1
      };

      const oldLevel = roleHierarchy[oldRole] || 0;
      const newLevel = roleHierarchy[newRole] || 0;

      // If role level changed significantly (more than 1 level), revoke tokens
      if (Math.abs(oldLevel - newLevel) > 1) {
        await this.supabase
          .from('user_token_revocations')
          .insert({
            user_id: userId,
            institution_id: institutionId,
            old_role: oldRole,
            new_role: newRole,
            reason: 'significant_role_change',
            revoked_at: new Date().toISOString()
          });

        console.log(`Revoked tokens for user ${userId} due to significant role change: ${oldRole} -> ${newRole}`);
      }
    } catch (error) {
      console.error('Error revoking user tokens for role change:', error);
    }
  }

  /**
   * Revoke all user access immediately (for suspension/deactivation)
   */
  private async revokeAllUserAccess(
    userId: string,
    institutionId: string
  ): Promise<void> {
    try {
      // Revoke all active sessions and tokens
      await this.supabase
        .from('user_access_revocations')
        .insert({
          user_id: userId,
          institution_id: institutionId,
          reason: 'account_suspended_or_deactivated',
          revoked_at: new Date().toISOString()
        });

      // In a real implementation, you would also:
      // 1. Invalidate JWT tokens
      // 2. Clear session cookies
      // 3. Update any real-time connections
      // 4. Clear cached permissions
      
      console.log(`Revoked all access for user ${userId} in institution ${institutionId}`);
    } catch (error) {
      console.error('Error revoking all user access:', error);
    }
  }
}