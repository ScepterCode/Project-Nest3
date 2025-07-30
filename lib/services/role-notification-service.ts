import { createClient } from '@/lib/supabase/server';
import { NotificationService, NotificationData } from './notification-service';
import { 
  UserRole, 
  RoleRequestStatus, 
  RoleRequest, 
  UserRoleAssignment,
  RoleAuditLog 
} from '@/lib/types/role-management';

export enum RoleNotificationType {
  // Role request notifications
  ROLE_REQUEST_SUBMITTED = 'role_request_submitted',
  ROLE_REQUEST_APPROVED = 'role_request_approved',
  ROLE_REQUEST_DENIED = 'role_request_denied',
  ROLE_REQUEST_EXPIRED = 'role_request_expired',
  
  // Role assignment notifications
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_CHANGED = 'role_changed',
  ROLE_REVOKED = 'role_revoked',
  ROLE_EXPIRED = 'role_expired',
  
  // Temporary role notifications
  TEMPORARY_ROLE_ASSIGNED = 'temporary_role_assigned',
  TEMPORARY_ROLE_EXPIRING = 'temporary_role_expiring',
  TEMPORARY_ROLE_EXPIRED = 'temporary_role_expired',
  TEMPORARY_ROLE_EXTENDED = 'temporary_role_extended',
  
  // Admin notifications
  PENDING_ROLE_REQUESTS = 'pending_role_requests',
  ROLE_REQUEST_REMINDER = 'role_request_reminder',
  BULK_ASSIGNMENT_COMPLETED = 'bulk_assignment_completed',
  
  // Verification notifications
  VERIFICATION_REQUIRED = 'verification_required',
  VERIFICATION_COMPLETED = 'verification_completed',
  VERIFICATION_FAILED = 'verification_failed'
}

export interface RoleNotificationPreferences {
  userId: string;
  roleRequests: {
    email: boolean;
    inApp: boolean;
    sms: boolean;
  };
  roleAssignments: {
    email: boolean;
    inApp: boolean;
    sms: boolean;
  };
  temporaryRoles: {
    email: boolean;
    inApp: boolean;
    sms: boolean;
    reminderDays: number[]; // Days before expiration to send reminders
  };
  adminNotifications: {
    email: boolean;
    inApp: boolean;
    sms: boolean;
    digestFrequency: 'immediate' | 'daily' | 'weekly';
  };
}

export class RoleNotificationService {
  private supabase = createClient();
  private notificationService = new NotificationService();

  /**
   * Send notification when a role request is submitted
   */
  async sendRoleRequestSubmittedNotification(
    request: RoleRequest,
    userEmail: string,
    userName: string
  ): Promise<void> {
    // Notify the user who submitted the request
    const userNotification: NotificationData = {
      userId: request.userId,
      type: RoleNotificationType.ROLE_REQUEST_SUBMITTED as any,
      title: 'Role Request Submitted',
      message: `Your request for ${this.formatRoleName(request.requestedRole)} role has been submitted and is pending review.`,
      data: {
        requestId: request.id,
        requestedRole: request.requestedRole,
        currentRole: request.currentRole,
        institutionId: request.institutionId,
        departmentId: request.departmentId
      },
      channels: ['email', 'in_app'],
      priority: 'medium'
    };

    await this.notificationService.sendNotification(userNotification);

    // Notify relevant administrators
    await this.notifyAdministratorsOfRoleRequest(request, userEmail, userName);
  }

  /**
   * Send notification when a role request is approved
   */
  async sendRoleRequestApprovedNotification(
    request: RoleRequest,
    approvedBy: string,
    approverName: string,
    notes?: string
  ): Promise<void> {
    const notification: NotificationData = {
      userId: request.userId,
      type: RoleNotificationType.ROLE_REQUEST_APPROVED as any,
      title: 'Role Request Approved',
      message: `Your request for ${this.formatRoleName(request.requestedRole)} role has been approved by ${approverName}.${notes ? ` Note: ${notes}` : ''}`,
      data: {
        requestId: request.id,
        requestedRole: request.requestedRole,
        approvedBy,
        approverName,
        notes,
        institutionId: request.institutionId,
        departmentId: request.departmentId
      },
      channels: ['email', 'in_app'],
      priority: 'high'
    };

    await this.notificationService.sendNotification(notification);
  }

  /**
   * Send notification when a role request is denied
   */
  async sendRoleRequestDeniedNotification(
    request: RoleRequest,
    deniedBy: string,
    denierName: string,
    reason: string
  ): Promise<void> {
    const notification: NotificationData = {
      userId: request.userId,
      type: RoleNotificationType.ROLE_REQUEST_DENIED as any,
      title: 'Role Request Denied',
      message: `Your request for ${this.formatRoleName(request.requestedRole)} role has been denied by ${denierName}. Reason: ${reason}`,
      data: {
        requestId: request.id,
        requestedRole: request.requestedRole,
        deniedBy,
        denierName,
        reason,
        institutionId: request.institutionId,
        departmentId: request.departmentId
      },
      channels: ['email', 'in_app'],
      priority: 'high'
    };

    await this.notificationService.sendNotification(notification);
  }

  /**
   * Send notification when a role is assigned
   */
  async sendRoleAssignedNotification(
    assignment: UserRoleAssignment,
    assignedByName: string,
    previousRole?: UserRole
  ): Promise<void> {
    const isRoleChange = previousRole && previousRole !== assignment.role;
    const title = isRoleChange ? 'Role Changed' : 'Role Assigned';
    const message = isRoleChange 
      ? `Your role has been changed from ${this.formatRoleName(previousRole)} to ${this.formatRoleName(assignment.role)} by ${assignedByName}.`
      : `You have been assigned the ${this.formatRoleName(assignment.role)} role by ${assignedByName}.`;

    const notification: NotificationData = {
      userId: assignment.userId,
      type: isRoleChange ? RoleNotificationType.ROLE_CHANGED as any : RoleNotificationType.ROLE_ASSIGNED as any,
      title,
      message: assignment.isTemporary 
        ? `${message} This is a temporary assignment${assignment.expiresAt ? ` expiring on ${assignment.expiresAt.toLocaleDateString()}` : ''}.`
        : message,
      data: {
        assignmentId: assignment.id,
        role: assignment.role,
        previousRole,
        assignedBy: assignment.assignedBy,
        assignedByName,
        isTemporary: assignment.isTemporary,
        expiresAt: assignment.expiresAt?.toISOString(),
        institutionId: assignment.institutionId,
        departmentId: assignment.departmentId
      },
      channels: ['email', 'in_app'],
      priority: 'high'
    };

    await this.notificationService.sendNotification(notification);
  }

  /**
   * Send notification when a temporary role is about to expire
   */
  async sendTemporaryRoleExpiringNotification(
    assignment: UserRoleAssignment,
    daysUntilExpiration: number
  ): Promise<void> {
    if (!assignment.isTemporary || !assignment.expiresAt) return;

    const notification: NotificationData = {
      userId: assignment.userId,
      type: RoleNotificationType.TEMPORARY_ROLE_EXPIRING as any,
      title: 'Temporary Role Expiring Soon',
      message: `Your temporary ${this.formatRoleName(assignment.role)} role will expire in ${daysUntilExpiration} day${daysUntilExpiration !== 1 ? 's' : ''} on ${assignment.expiresAt.toLocaleDateString()}.`,
      data: {
        assignmentId: assignment.id,
        role: assignment.role,
        expiresAt: assignment.expiresAt.toISOString(),
        daysUntilExpiration,
        institutionId: assignment.institutionId,
        departmentId: assignment.departmentId
      },
      channels: ['email', 'in_app'],
      priority: daysUntilExpiration <= 1 ? 'urgent' : 'high'
    };

    await this.notificationService.sendNotification(notification);
  }

  /**
   * Send notification when a temporary role has expired
   */
  async sendTemporaryRoleExpiredNotification(
    assignment: UserRoleAssignment,
    newRole?: UserRole
  ): Promise<void> {
    const message = newRole 
      ? `Your temporary ${this.formatRoleName(assignment.role)} role has expired and you have been reverted to ${this.formatRoleName(newRole)}.`
      : `Your temporary ${this.formatRoleName(assignment.role)} role has expired.`;

    const notification: NotificationData = {
      userId: assignment.userId,
      type: RoleNotificationType.TEMPORARY_ROLE_EXPIRED as any,
      title: 'Temporary Role Expired',
      message,
      data: {
        assignmentId: assignment.id,
        expiredRole: assignment.role,
        newRole,
        expiredAt: assignment.expiresAt?.toISOString(),
        institutionId: assignment.institutionId,
        departmentId: assignment.departmentId
      },
      channels: ['email', 'in_app'],
      priority: 'medium'
    };

    await this.notificationService.sendNotification(notification);
  }

  /**
   * Send notification when a role is revoked
   */
  async sendRoleRevokedNotification(
    userId: string,
    revokedRole: UserRole,
    revokedBy: string,
    revokerName: string,
    reason?: string,
    newRole?: UserRole
  ): Promise<void> {
    const message = newRole
      ? `Your ${this.formatRoleName(revokedRole)} role has been revoked by ${revokerName} and you have been assigned ${this.formatRoleName(newRole)}.`
      : `Your ${this.formatRoleName(revokedRole)} role has been revoked by ${revokerName}.`;

    const notification: NotificationData = {
      userId,
      type: RoleNotificationType.ROLE_REVOKED as any,
      title: 'Role Revoked',
      message: reason ? `${message} Reason: ${reason}` : message,
      data: {
        revokedRole,
        newRole,
        revokedBy,
        revokerName,
        reason
      },
      channels: ['email', 'in_app'],
      priority: 'high'
    };

    await this.notificationService.sendNotification(notification);
  }

  /**
   * Send reminder notifications to administrators about pending role requests
   */
  async sendPendingRoleRequestReminders(): Promise<void> {
    // Get pending requests older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const { data: pendingRequests, error } = await this.supabase
      .from('role_requests')
      .select(`
        *,
        users!role_requests_user_id_fkey(first_name, last_name, email)
      `)
      .eq('status', 'pending')
      .lt('requested_at', oneDayAgo.toISOString());

    if (error || !pendingRequests?.length) return;

    // Group requests by institution and department
    const groupedRequests = this.groupRequestsByInstitution(pendingRequests);

    for (const [institutionId, requests] of Object.entries(groupedRequests)) {
      await this.sendInstitutionPendingRequestsNotification(institutionId, requests);
    }
  }

  /**
   * Send bulk assignment completion notification
   */
  async sendBulkAssignmentCompletedNotification(
    adminId: string,
    successful: number,
    failed: number,
    institutionId: string
  ): Promise<void> {
    const notification: NotificationData = {
      userId: adminId,
      type: RoleNotificationType.BULK_ASSIGNMENT_COMPLETED as any,
      title: 'Bulk Role Assignment Completed',
      message: `Bulk role assignment completed. ${successful} successful, ${failed} failed assignments.`,
      data: {
        successful,
        failed,
        institutionId,
        completedAt: new Date().toISOString()
      },
      channels: ['email', 'in_app'],
      priority: failed > 0 ? 'high' : 'medium'
    };

    await this.notificationService.sendNotification(notification);
  }

  /**
   * Get user's role notification preferences
   */
  async getRoleNotificationPreferences(userId: string): Promise<RoleNotificationPreferences> {
    const { data, error } = await this.supabase
      .from('user_role_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Return default preferences
      return {
        userId,
        roleRequests: {
          email: true,
          inApp: true,
          sms: false
        },
        roleAssignments: {
          email: true,
          inApp: true,
          sms: false
        },
        temporaryRoles: {
          email: true,
          inApp: true,
          sms: false,
          reminderDays: [7, 3, 1]
        },
        adminNotifications: {
          email: true,
          inApp: true,
          sms: false,
          digestFrequency: 'daily'
        }
      };
    }

    return {
      userId: data.user_id,
      roleRequests: {
        email: data.role_requests_email,
        inApp: data.role_requests_in_app,
        sms: data.role_requests_sms
      },
      roleAssignments: {
        email: data.role_assignments_email,
        inApp: data.role_assignments_in_app,
        sms: data.role_assignments_sms
      },
      temporaryRoles: {
        email: data.temporary_roles_email,
        inApp: data.temporary_roles_in_app,
        sms: data.temporary_roles_sms,
        reminderDays: data.temporary_role_reminder_days || [7, 3, 1]
      },
      adminNotifications: {
        email: data.admin_notifications_email,
        inApp: data.admin_notifications_in_app,
        sms: data.admin_notifications_sms,
        digestFrequency: data.admin_digest_frequency || 'daily'
      }
    };
  }

  /**
   * Update user's role notification preferences
   */
  async updateRoleNotificationPreferences(preferences: RoleNotificationPreferences): Promise<void> {
    const { error } = await this.supabase
      .from('user_role_notification_preferences')
      .upsert({
        user_id: preferences.userId,
        role_requests_email: preferences.roleRequests.email,
        role_requests_in_app: preferences.roleRequests.inApp,
        role_requests_sms: preferences.roleRequests.sms,
        role_assignments_email: preferences.roleAssignments.email,
        role_assignments_in_app: preferences.roleAssignments.inApp,
        role_assignments_sms: preferences.roleAssignments.sms,
        temporary_roles_email: preferences.temporaryRoles.email,
        temporary_roles_in_app: preferences.temporaryRoles.inApp,
        temporary_roles_sms: preferences.temporaryRoles.sms,
        temporary_role_reminder_days: preferences.temporaryRoles.reminderDays,
        admin_notifications_email: preferences.adminNotifications.email,
        admin_notifications_in_app: preferences.adminNotifications.inApp,
        admin_notifications_sms: preferences.adminNotifications.sms,
        admin_digest_frequency: preferences.adminNotifications.digestFrequency,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  }

  /**
   * Process scheduled role notifications (to be called by a cron job)
   */
  async processScheduledRoleNotifications(): Promise<void> {
    await Promise.all([
      this.processTemporaryRoleExpirationReminders(),
      this.sendPendingRoleRequestReminders(),
      this.processExpiredRoleRequests()
    ]);
  }

  // Private helper methods

  private async notifyAdministratorsOfRoleRequest(
    request: RoleRequest,
    userEmail: string,
    userName: string
  ): Promise<void> {
    // Get relevant administrators based on the requested role and scope
    const adminIds = await this.getRelevantAdministrators(
      request.requestedRole,
      request.institutionId,
      request.departmentId
    );

    for (const adminId of adminIds) {
      const notification: NotificationData = {
        userId: adminId,
        type: RoleNotificationType.ROLE_REQUEST_SUBMITTED as any,
        title: 'New Role Request',
        message: `${userName} (${userEmail}) has requested ${this.formatRoleName(request.requestedRole)} role.`,
        data: {
          requestId: request.id,
          requestedRole: request.requestedRole,
          requesterName: userName,
          requesterEmail: userEmail,
          justification: request.justification,
          institutionId: request.institutionId,
          departmentId: request.departmentId
        },
        channels: ['email', 'in_app'],
        priority: 'medium'
      };

      await this.notificationService.sendNotification(notification);
    }
  }

  private async getRelevantAdministrators(
    requestedRole: UserRole,
    institutionId: string,
    departmentId?: string
  ): Promise<string[]> {
    let query = this.supabase
      .from('user_role_assignments')
      .select('user_id')
      .eq('status', 'active')
      .eq('institution_id', institutionId);

    // Determine which admin roles can approve this request
    switch (requestedRole) {
      case UserRole.TEACHER:
        // Department admins and institution admins can approve teacher requests
        query = query.in('role', ['department_admin', 'institution_admin', 'system_admin']);
        if (departmentId) {
          query = query.or(`department_id.eq.${departmentId},role.eq.institution_admin,role.eq.system_admin`);
        }
        break;
      case UserRole.DEPARTMENT_ADMIN:
        // Only institution admins and system admins can approve department admin requests
        query = query.in('role', ['institution_admin', 'system_admin']);
        break;
      case UserRole.INSTITUTION_ADMIN:
        // Only system admins can approve institution admin requests
        query = query.eq('role', 'system_admin');
        break;
      default:
        // For student role, any admin can approve
        query = query.in('role', ['department_admin', 'institution_admin', 'system_admin']);
        break;
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching administrators:', error);
      return [];
    }

    return (data || []).map(admin => admin.user_id);
  }

  private async processTemporaryRoleExpirationReminders(): Promise<void> {
    const reminderDays = [7, 3, 1]; // Default reminder days
    
    for (const days of reminderDays) {
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + days);
      reminderDate.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(reminderDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const { data: expiringRoles, error } = await this.supabase
        .from('user_role_assignments')
        .select('*')
        .eq('is_temporary', true)
        .eq('status', 'active')
        .gte('expires_at', reminderDate.toISOString())
        .lt('expires_at', nextDay.toISOString());

      if (error) {
        console.error('Error fetching expiring roles:', error);
        continue;
      }

      for (const assignment of expiringRoles || []) {
        await this.sendTemporaryRoleExpiringNotification(assignment, days);
      }
    }
  }

  private async processExpiredRoleRequests(): Promise<void> {
    const now = new Date();
    
    const { data: expiredRequests, error } = await this.supabase
      .from('role_requests')
      .select('*')
      .eq('status', 'pending')
      .lt('expires_at', now.toISOString());

    if (error) {
      console.error('Error fetching expired requests:', error);
      return;
    }

    for (const request of expiredRequests || []) {
      // Update request status to expired
      await this.supabase
        .from('role_requests')
        .update({ status: 'expired' })
        .eq('id', request.id);

      // Send notification to user
      const notification: NotificationData = {
        userId: request.user_id,
        type: RoleNotificationType.ROLE_REQUEST_EXPIRED as any,
        title: 'Role Request Expired',
        message: `Your request for ${this.formatRoleName(request.requested_role)} role has expired due to no response from administrators.`,
        data: {
          requestId: request.id,
          requestedRole: request.requested_role,
          expiredAt: now.toISOString()
        },
        channels: ['email', 'in_app'],
        priority: 'medium'
      };

      await this.notificationService.sendNotification(notification);
    }
  }

  private groupRequestsByInstitution(requests: any[]): Record<string, any[]> {
    return requests.reduce((acc, request) => {
      const institutionId = request.institution_id;
      if (!acc[institutionId]) {
        acc[institutionId] = [];
      }
      acc[institutionId].push(request);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private async sendInstitutionPendingRequestsNotification(
    institutionId: string,
    requests: any[]
  ): Promise<void> {
    const adminIds = await this.getRelevantAdministrators(
      UserRole.INSTITUTION_ADMIN,
      institutionId
    );

    for (const adminId of adminIds) {
      const notification: NotificationData = {
        userId: adminId,
        type: RoleNotificationType.PENDING_ROLE_REQUESTS as any,
        title: 'Pending Role Requests Reminder',
        message: `You have ${requests.length} pending role request${requests.length !== 1 ? 's' : ''} awaiting review.`,
        data: {
          pendingCount: requests.length,
          institutionId,
          requests: requests.map(r => ({
            id: r.id,
            requesterName: `${r.users.first_name} ${r.users.last_name}`,
            requestedRole: r.requested_role,
            requestedAt: r.requested_at
          }))
        },
        channels: ['email', 'in_app'],
        priority: 'medium'
      };

      await this.notificationService.sendNotification(notification);
    }
  }

  private formatRoleName(role: UserRole): string {
    const roleNames = {
      [UserRole.STUDENT]: 'Student',
      [UserRole.TEACHER]: 'Teacher',
      [UserRole.DEPARTMENT_ADMIN]: 'Department Administrator',
      [UserRole.INSTITUTION_ADMIN]: 'Institution Administrator',
      [UserRole.SYSTEM_ADMIN]: 'System Administrator'
    };
    return roleNames[role] || role;
  }
}