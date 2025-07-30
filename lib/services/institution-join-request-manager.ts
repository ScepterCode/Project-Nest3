import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types/onboarding';
import { ValidationError } from '@/lib/types/institution';
import { NotificationService } from './notification-service';

export interface JoinRequest {
  id: string;
  userId: string;
  institutionId: string;
  requestedRole: UserRole;
  departmentId?: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requestedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  userData: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
  institutionData: {
    name: string;
    domain: string;
  };
  departmentData?: {
    name: string;
    code: string;
  };
}

export interface JoinRequestCreateData {
  userId: string;
  institutionId: string;
  requestedRole: UserRole;
  departmentId?: string;
  message?: string;
}

export interface JoinRequestReviewData {
  requestId: string;
  reviewedBy: string;
  approved: boolean;
  reviewNotes?: string;
  assignedRole?: UserRole; // Can assign different role than requested
  assignedDepartmentId?: string;
}

export interface JoinRequestFilters {
  status?: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requestedRole?: UserRole;
  departmentId?: string;
  requestedAfter?: Date;
  requestedBefore?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface JoinRequestStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  approvalRate: number;
  byRole: Record<UserRole, number>;
  byDepartment: Record<string, number>;
  avgProcessingTime: number; // in hours
}

export class InstitutionJoinRequestManager {
  private supabase;
  private notificationService;

  constructor() {
    this.supabase = createClient();
    this.notificationService = new NotificationService();
  }

  /**
   * Create a new join request
   */
  async createJoinRequest(
    data: JoinRequestCreateData
  ): Promise<{ success: boolean; request?: JoinRequest; errors?: ValidationError[] }> {
    try {
      // Validate the join request
      const validation = await this.validateJoinRequest(data);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check if user already has a pending request or is already a member
      const existingCheck = await this.checkExistingRequestOrMembership(data.userId, data.institutionId);
      if (!existingCheck.canRequest) {
        return {
          success: false,
          errors: [{ field: 'request', message: existingCheck.reason, code: 'DUPLICATE_REQUEST' }]
        };
      }

      const requestData = {
        user_id: data.userId,
        institution_id: data.institutionId,
        requested_role: data.requestedRole,
        department_id: data.departmentId,
        message: data.message,
        status: 'pending',
        requested_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: request, error } = await this.supabase
        .from('institution_join_requests')
        .insert(requestData)
        .select(`
          *,
          users (
            id,
            email,
            first_name,
            last_name
          ),
          institutions (
            id,
            name,
            domain
          ),
          departments (
            id,
            name,
            code
          )
        `)
        .single();

      if (error) {
        console.error('Error creating join request:', error);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to create join request', code: 'DATABASE_ERROR' }]
        };
      }

      const joinRequest = this.mapToJoinRequest(request);

      // Notify institution admins about the new request
      await this.notifyAdminsOfNewRequest(joinRequest);

      // Log the request creation
      await this.logJoinRequestAction(joinRequest.id, 'created', data.userId);

      return { success: true, request: joinRequest };
    } catch (error) {
      console.error('Unexpected error creating join request:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Review a join request (approve or reject)
   */
  async reviewJoinRequest(
    reviewData: JoinRequestReviewData
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Get the join request
      const { data: request, error: fetchError } = await this.supabase
        .from('institution_join_requests')
        .select(`
          *,
          users (
            id,
            email,
            first_name,
            last_name
          ),
          institutions (
            id,
            name,
            domain
          ),
          departments (
            id,
            name,
            code
          )
        `)
        .eq('id', reviewData.requestId)
        .single();

      if (fetchError || !request) {
        return {
          success: false,
          errors: [{ field: 'request', message: 'Join request not found', code: 'REQUEST_NOT_FOUND' }]
        };
      }

      // Validate reviewer has permission
      const hasPermission = await this.validateReviewerPermission(reviewData.reviewedBy, request.institution_id);
      if (!hasPermission) {
        return {
          success: false,
          errors: [{ field: 'permission', message: 'Insufficient permissions to review requests', code: 'INSUFFICIENT_PERMISSIONS' }]
        };
      }

      // Check if request is still pending
      if (request.status !== 'pending') {
        return {
          success: false,
          errors: [{ field: 'status', message: 'Request has already been reviewed', code: 'ALREADY_REVIEWED' }]
        };
      }

      const now = new Date().toISOString();
      const newStatus = reviewData.approved ? 'approved' : 'rejected';

      // Update the request status
      const { error: updateError } = await this.supabase
        .from('institution_join_requests')
        .update({
          status: newStatus,
          reviewed_at: now,
          reviewed_by: reviewData.reviewedBy,
          review_notes: reviewData.reviewNotes,
          updated_at: now
        })
        .eq('id', reviewData.requestId);

      if (updateError) {
        console.error('Error updating join request:', updateError);
        return {
          success: false,
          errors: [{ field: 'update', message: 'Failed to update request status', code: 'DATABASE_ERROR' }]
        };
      }

      if (reviewData.approved) {
        // Add user to institution
        const addUserResult = await this.addUserToInstitution(
          request.user_id,
          request.institution_id,
          reviewData.assignedRole || request.requested_role,
          reviewData.assignedDepartmentId || request.department_id,
          reviewData.reviewedBy
        );

        if (!addUserResult.success) {
          // Rollback the request approval
          await this.supabase
            .from('institution_join_requests')
            .update({
              status: 'pending',
              reviewed_at: null,
              reviewed_by: null,
              review_notes: null,
              updated_at: now
            })
            .eq('id', reviewData.requestId);

          return addUserResult;
        }
      }

      // Notify the user about the decision
      await this.notifyUserOfDecision(request, reviewData.approved, reviewData.reviewNotes);

      // Log the review action
      await this.logJoinRequestAction(
        reviewData.requestId,
        reviewData.approved ? 'approved' : 'rejected',
        reviewData.reviewedBy,
        { reviewNotes: reviewData.reviewNotes }
      );

      return { success: true };
    } catch (error) {
      console.error('Unexpected error reviewing join request:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Withdraw a join request (by the user who created it)
   */
  async withdrawJoinRequest(
    requestId: string,
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Verify the request belongs to the user and is pending
      const { data: request, error } = await this.supabase
        .from('institution_join_requests')
        .select('id, user_id, status')
        .eq('id', requestId)
        .single();

      if (error || !request) {
        return {
          success: false,
          errors: [{ field: 'request', message: 'Join request not found', code: 'REQUEST_NOT_FOUND' }]
        };
      }

      if (request.user_id !== userId) {
        return {
          success: false,
          errors: [{ field: 'permission', message: 'Cannot withdraw another user\'s request', code: 'INSUFFICIENT_PERMISSIONS' }]
        };
      }

      if (request.status !== 'pending') {
        return {
          success: false,
          errors: [{ field: 'status', message: 'Can only withdraw pending requests', code: 'INVALID_STATUS' }]
        };
      }

      // Update request status to withdrawn
      const { error: updateError } = await this.supabase
        .from('institution_join_requests')
        .update({
          status: 'withdrawn',
          withdrawn_at: new Date().toISOString(),
          withdrawal_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (updateError) {
        console.error('Error withdrawing join request:', updateError);
        return {
          success: false,
          errors: [{ field: 'update', message: 'Failed to withdraw request', code: 'DATABASE_ERROR' }]
        };
      }

      // Log the withdrawal
      await this.logJoinRequestAction(requestId, 'withdrawn', userId, { reason });

      return { success: true };
    } catch (error) {
      console.error('Unexpected error withdrawing join request:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Get join requests for an institution
   */
  async getInstitutionJoinRequests(
    institutionId: string,
    filters: JoinRequestFilters = {}
  ): Promise<{ requests: JoinRequest[]; total: number }> {
    try {
      let query = this.supabase
        .from('institution_join_requests')
        .select(`
          *,
          users (
            id,
            email,
            first_name,
            last_name
          ),
          institutions (
            id,
            name,
            domain
          ),
          departments (
            id,
            name,
            code
          ),
          reviewers:users!institution_join_requests_reviewed_by_fkey (
            id,
            first_name,
            last_name,
            email
          )
        `, { count: 'exact' })
        .eq('institution_id', institutionId);

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.requestedRole) {
        query = query.eq('requested_role', filters.requestedRole);
      }
      if (filters.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters.search) {
        query = query.or(`users.first_name.ilike.%${filters.search}%,users.last_name.ilike.%${filters.search}%,users.email.ilike.%${filters.search}%`);
      }
      if (filters.requestedAfter) {
        query = query.gte('requested_at', filters.requestedAfter.toISOString());
      }
      if (filters.requestedBefore) {
        query = query.lte('requested_at', filters.requestedBefore.toISOString());
      }

      // Apply pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 10)) - 1);
      }

      // Order by requested date (newest first)
      query = query.order('requested_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching join requests:', error);
        return { requests: [], total: 0 };
      }

      const requests = (data || []).map(this.mapToJoinRequest);
      return { requests, total: count || 0 };
    } catch (error) {
      console.error('Unexpected error fetching join requests:', error);
      return { requests: [], total: 0 };
    }
  }

  /**
   * Get join requests for a specific user
   */
  async getUserJoinRequests(
    userId: string,
    filters: Omit<JoinRequestFilters, 'search'> = {}
  ): Promise<{ requests: JoinRequest[]; total: number }> {
    try {
      let query = this.supabase
        .from('institution_join_requests')
        .select(`
          *,
          users (
            id,
            email,
            first_name,
            last_name
          ),
          institutions (
            id,
            name,
            domain
          ),
          departments (
            id,
            name,
            code
          ),
          reviewers:users!institution_join_requests_reviewed_by_fkey (
            id,
            first_name,
            last_name,
            email
          )
        `, { count: 'exact' })
        .eq('user_id', userId);

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.requestedRole) {
        query = query.eq('requested_role', filters.requestedRole);
      }
      if (filters.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters.requestedAfter) {
        query = query.gte('requested_at', filters.requestedAfter.toISOString());
      }
      if (filters.requestedBefore) {
        query = query.lte('requested_at', filters.requestedBefore.toISOString());
      }

      // Apply pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 10)) - 1);
      }

      // Order by requested date (newest first)
      query = query.order('requested_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching user join requests:', error);
        return { requests: [], total: 0 };
      }

      const requests = (data || []).map(this.mapToJoinRequest);
      return { requests, total: count || 0 };
    } catch (error) {
      console.error('Unexpected error fetching user join requests:', error);
      return { requests: [], total: 0 };
    }
  }

  /**
   * Get join request statistics for an institution
   */
  async getJoinRequestStats(institutionId: string): Promise<JoinRequestStats> {
    try {
      const { data, error } = await this.supabase
        .from('institution_join_requests')
        .select('requested_role, department_id, status, requested_at, reviewed_at')
        .eq('institution_id', institutionId);

      if (error || !data) {
        return {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          withdrawn: 0,
          approvalRate: 0,
          byRole: {} as Record<UserRole, number>,
          byDepartment: {},
          avgProcessingTime: 0
        };
      }

      const stats = data.reduce(
        (acc, request) => {
          acc.total++;
          
          switch (request.status) {
            case 'pending':
              acc.pending++;
              break;
            case 'approved':
              acc.approved++;
              break;
            case 'rejected':
              acc.rejected++;
              break;
            case 'withdrawn':
              acc.withdrawn++;
              break;
          }

          // Count by role
          acc.byRole[request.requested_role as UserRole] = (acc.byRole[request.requested_role as UserRole] || 0) + 1;

          // Count by department
          if (request.department_id) {
            acc.byDepartment[request.department_id] = (acc.byDepartment[request.department_id] || 0) + 1;
          }

          // Calculate processing time for reviewed requests
          if (request.reviewed_at) {
            const requestedAt = new Date(request.requested_at);
            const reviewedAt = new Date(request.reviewed_at);
            const processingTimeHours = (reviewedAt.getTime() - requestedAt.getTime()) / (1000 * 60 * 60);
            acc.totalProcessingTime += processingTimeHours;
            acc.reviewedCount++;
          }
          
          return acc;
        },
        {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          withdrawn: 0,
          byRole: {} as Record<UserRole, number>,
          byDepartment: {} as Record<string, number>,
          totalProcessingTime: 0,
          reviewedCount: 0
        }
      );

      return {
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        rejected: stats.rejected,
        withdrawn: stats.withdrawn,
        approvalRate: stats.total > 0 ? (stats.approved / (stats.approved + stats.rejected)) * 100 : 0,
        byRole: stats.byRole,
        byDepartment: stats.byDepartment,
        avgProcessingTime: stats.reviewedCount > 0 ? stats.totalProcessingTime / stats.reviewedCount : 0
      };
    } catch (error) {
      console.error('Error fetching join request stats:', error);
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        withdrawn: 0,
        approvalRate: 0,
        byRole: {} as Record<UserRole, number>,
        byDepartment: {},
        avgProcessingTime: 0
      };
    }
  }

  /**
   * Bulk approve/reject multiple requests
   */
  async bulkReviewRequests(
    requestIds: string[],
    reviewedBy: string,
    approved: boolean,
    reviewNotes?: string
  ): Promise<{
    successful: string[];
    failed: Array<{ requestId: string; error: string }>;
    stats: { total: number; successful: number; failed: number };
  }> {
    const successful: string[] = [];
    const failed: Array<{ requestId: string; error: string }> = [];

    for (const requestId of requestIds) {
      try {
        const result = await this.reviewJoinRequest({
          requestId,
          reviewedBy,
          approved,
          reviewNotes
        });

        if (result.success) {
          successful.push(requestId);
        } else {
          const errorMessage = result.errors?.[0]?.message || 'Unknown error';
          failed.push({ requestId, error: errorMessage });
        }
      } catch (error) {
        failed.push({
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      successful,
      failed,
      stats: {
        total: requestIds.length,
        successful: successful.length,
        failed: failed.length
      }
    };
  }

  // Private helper methods

  private async validateJoinRequest(
    data: JoinRequestCreateData
  ): Promise<{ isValid: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    // Validate user exists
    const { data: user } = await this.supabase
      .from('users')
      .select('id, email')
      .eq('id', data.userId)
      .single();

    if (!user) {
      errors.push({ field: 'userId', message: 'User not found', code: 'USER_NOT_FOUND' });
    }

    // Validate institution exists and allows self-registration
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('id, name, status, settings')
      .eq('id', data.institutionId)
      .single();

    if (!institution) {
      errors.push({ field: 'institutionId', message: 'Institution not found', code: 'INSTITUTION_NOT_FOUND' });
    } else if (institution.status !== 'active') {
      errors.push({ field: 'institutionId', message: 'Institution is not active', code: 'INSTITUTION_INACTIVE' });
    } else if (!institution.settings?.allowSelfRegistration) {
      errors.push({ field: 'institutionId', message: 'Institution does not allow join requests', code: 'SELF_REGISTRATION_DISABLED' });
    }

    // Validate role
    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(data.requestedRole)) {
      errors.push({ field: 'requestedRole', message: 'Invalid role', code: 'INVALID_ROLE' });
    }

    // Validate department if provided
    if (data.departmentId) {
      const { data: department } = await this.supabase
        .from('departments')
        .select('id, institution_id, status')
        .eq('id', data.departmentId)
        .single();

      if (!department) {
        errors.push({ field: 'departmentId', message: 'Department not found', code: 'DEPARTMENT_NOT_FOUND' });
      } else if (department.institution_id !== data.institutionId) {
        errors.push({ field: 'departmentId', message: 'Department does not belong to institution', code: 'DEPARTMENT_MISMATCH' });
      } else if (department.status !== 'active') {
        errors.push({ field: 'departmentId', message: 'Department is not active', code: 'DEPARTMENT_INACTIVE' });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async checkExistingRequestOrMembership(
    userId: string,
    institutionId: string
  ): Promise<{ canRequest: boolean; reason: string }> {
    // Check if user is already a member
    const { data: existingMembership } = await this.supabase
      .from('user_institutions')
      .select('status')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .single();

    if (existingMembership) {
      if (existingMembership.status === 'active') {
        return { canRequest: false, reason: 'User is already a member of this institution' };
      } else if (existingMembership.status === 'pending') {
        return { canRequest: false, reason: 'User already has a pending membership' };
      }
    }

    // Check for existing pending request
    const { data: existingRequest } = await this.supabase
      .from('institution_join_requests')
      .select('status')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return { canRequest: false, reason: 'User already has a pending join request' };
    }

    return { canRequest: true, reason: 'User can request to join' };
  }

  private async validateReviewerPermission(reviewerId: string, institutionId: string): Promise<boolean> {
    const { data: reviewerRole } = await this.supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', reviewerId)
      .eq('institution_id', institutionId)
      .eq('status', 'active')
      .single();

    return reviewerRole && ['institution_admin', 'department_admin'].includes(reviewerRole.role);
  }

  private async addUserToInstitution(
    userId: string,
    institutionId: string,
    role: UserRole,
    departmentId: string | null,
    addedBy: string
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      const { error } = await this.supabase
        .from('user_institutions')
        .insert({
          user_id: userId,
          institution_id: institutionId,
          role,
          department_id: departmentId,
          assigned_by: addedBy,
          joined_at: new Date().toISOString(),
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error adding user to institution:', error);
        return {
          success: false,
          errors: [{ field: 'membership', message: 'Failed to add user to institution', code: 'DATABASE_ERROR' }]
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Unexpected error adding user to institution:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  private async notifyAdminsOfNewRequest(request: JoinRequest): Promise<void> {
    try {
      // Get institution admins
      const { data: admins } = await this.supabase
        .from('user_institutions')
        .select(`
          user_id,
          users (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .eq('institution_id', request.institutionId)
        .eq('role', 'institution_admin')
        .eq('status', 'active');

      if (!admins || admins.length === 0) return;

      const roleName = this.getRoleDisplayName(request.requestedRole);
      
      for (const admin of admins) {
        await this.notificationService.sendNotification(
          admin.user_id,
          'JOIN_REQUEST_RECEIVED',
          'New join request received',
          `${request.userData.firstName || ''} ${request.userData.lastName || ''} (${request.userData.email}) has requested to join as ${roleName}.`,
          {
            requestId: request.id,
            institutionId: request.institutionId,
            requestedRole: request.requestedRole
          }
        );
      }
    } catch (error) {
      console.error('Error notifying admins of new request:', error);
    }
  }

  private async notifyUserOfDecision(
    request: any,
    approved: boolean,
    reviewNotes?: string
  ): Promise<void> {
    try {
      const status = approved ? 'approved' : 'rejected';
      const title = approved 
        ? `Your request to join ${request.institutions.name} has been approved!`
        : `Your request to join ${request.institutions.name} has been rejected`;
      
      let message = approved
        ? `Congratulations! You have been accepted as a ${this.getRoleDisplayName(request.requested_role)} at ${request.institutions.name}.`
        : `Unfortunately, your request to join ${request.institutions.name} as a ${this.getRoleDisplayName(request.requested_role)} has been rejected.`;

      if (reviewNotes) {
        message += `\n\nReviewer notes: ${reviewNotes}`;
      }

      await this.notificationService.sendNotification(
        request.user_id,
        `JOIN_REQUEST_${status.toUpperCase()}`,
        title,
        message,
        {
          requestId: request.id,
          institutionId: request.institution_id,
          approved
        }
      );
    } catch (error) {
      console.error('Error notifying user of decision:', error);
    }
  }

  private getRoleDisplayName(role: UserRole): string {
    const roleNames: Record<UserRole, string> = {
      [UserRole.STUDENT]: 'Student',
      [UserRole.TEACHER]: 'Teacher',
      [UserRole.DEPARTMENT_ADMIN]: 'Department Administrator',
      [UserRole.INSTITUTION_ADMIN]: 'Institution Administrator',
      [UserRole.SYSTEM_ADMIN]: 'System Administrator'
    };
    return roleNames[role] || role;
  }

  private async logJoinRequestAction(
    requestId: string,
    action: string,
    performedBy: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await this.supabase
        .from('join_request_audit_log')
        .insert({
          request_id: requestId,
          action,
          performed_by: performedBy,
          metadata: metadata || {},
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging join request action:', error);
    }
  }

  private mapToJoinRequest(data: any): JoinRequest {
    return {
      id: data.id,
      userId: data.user_id,
      institutionId: data.institution_id,
      requestedRole: data.requested_role,
      departmentId: data.department_id,
      message: data.message,
      status: data.status,
      requestedAt: new Date(data.requested_at),
      reviewedAt: data.reviewed_at ? new Date(data.reviewed_at) : undefined,
      reviewedBy: data.reviewed_by,
      reviewNotes: data.review_notes,
      userData: {
        email: data.users.email,
        firstName: data.users.first_name,
        lastName: data.users.last_name
      },
      institutionData: {
        name: data.institutions.name,
        domain: data.institutions.domain
      },
      departmentData: data.departments ? {
        name: data.departments.name,
        code: data.departments.code
      } : undefined
    };
  }
}