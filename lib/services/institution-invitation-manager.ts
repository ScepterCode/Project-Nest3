import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types/onboarding';
import { InstitutionInvitation, ValidationError } from '@/lib/types/institution';
import { NotificationService } from './notification-service';
import crypto from 'crypto';

export interface BulkInvitationRequest {
  institutionId: string;
  invitations: Array<{
    email: string;
    role: UserRole;
    departmentId?: string;
    firstName?: string;
    lastName?: string;
    customMessage?: string;
  }>;
  invitedBy: string;
  defaultMessage?: string;
  expiresAt?: Date;
  emailTemplate?: {
    subject: string;
    body: string;
  };
  sendImmediately?: boolean;
}

export interface InvitationCreateRequest {
  institutionId: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  firstName?: string;
  lastName?: string;
  message?: string;
  expiresAt?: Date;
  invitedBy: string;
}

export interface InvitationValidationResult {
  valid: boolean;
  invitation?: InstitutionInvitation;
  error?: string;
}

export interface InvitationStats {
  total: number;
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
  acceptanceRate: number;
  byRole: Record<UserRole, number>;
  byDepartment: Record<string, number>;
}

export interface InvitationFilters {
  status?: 'pending' | 'accepted' | 'declined' | 'expired';
  role?: UserRole;
  departmentId?: string;
  invitedBy?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export class InstitutionInvitationManager {
  private supabase;
  private notificationService;

  constructor() {
    this.supabase = createClient();
    this.notificationService = new NotificationService();
  }

  /**
   * Create a single institution invitation
   */
  async createInvitation(
    request: InvitationCreateRequest
  ): Promise<{ success: boolean; invitation?: InstitutionInvitation; errors?: ValidationError[] }> {
    try {
      // Validate the invitation request
      const validation = await this.validateInvitationRequest(request);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check if user is already invited or exists
      const existingCheck = await this.checkExistingUserOrInvitation(request.email, request.institutionId);
      if (!existingCheck.canInvite) {
        return {
          success: false,
          errors: [{ field: 'email', message: existingCheck.reason, code: 'DUPLICATE_INVITATION' }]
        };
      }

      // Generate secure token
      const token = this.generateInvitationToken();

      // Set default expiration (7 days from now)
      const expiresAt = request.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invitationData = {
        institution_id: request.institutionId,
        email: request.email.toLowerCase(),
        role: request.role,
        department_id: request.departmentId,
        first_name: request.firstName,
        last_name: request.lastName,
        invited_by: request.invitedBy,
        token,
        expires_at: expiresAt.toISOString(),
        message: request.message,
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('institution_invitations')
        .insert(invitationData)
        .select()
        .single();

      if (error) {
        console.error('Error creating invitation:', error);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to create invitation', code: 'DATABASE_ERROR' }]
        };
      }

      const invitation = this.mapToInvitation(data);

      // Send invitation email
      await this.sendInvitationEmail(invitation);

      // Log the invitation creation
      await this.logInvitationAction(invitation.id, 'created', request.invitedBy);

      return { success: true, invitation };
    } catch (error) {
      console.error('Unexpected error creating invitation:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Create multiple invitations in bulk
   */
  async createBulkInvitations(
    request: BulkInvitationRequest
  ): Promise<{
    successful: InstitutionInvitation[];
    failed: Array<{ email: string; error: string }>;
    stats: { total: number; successful: number; failed: number };
  }> {
    const successful: InstitutionInvitation[] = [];
    const failed: Array<{ email: string; error: string }> = [];

    // Validate institution exists and user has permission
    const institutionValidation = await this.validateInstitutionAccess(request.institutionId, request.invitedBy);
    if (!institutionValidation.isValid) {
      // If institution validation fails, all invitations fail
      const errorMessage = institutionValidation.errors?.[0]?.message || 'Institution access denied';
      return {
        successful: [],
        failed: request.invitations.map(inv => ({ email: inv.email, error: errorMessage })),
        stats: { total: request.invitations.length, successful: 0, failed: request.invitations.length }
      };
    }

    // Process each invitation
    for (const invitationRequest of request.invitations) {
      try {
        const result = await this.createInvitation({
          institutionId: request.institutionId,
          email: invitationRequest.email,
          role: invitationRequest.role,
          departmentId: invitationRequest.departmentId,
          firstName: invitationRequest.firstName,
          lastName: invitationRequest.lastName,
          message: invitationRequest.customMessage || request.defaultMessage,
          expiresAt: request.expiresAt,
          invitedBy: request.invitedBy
        });

        if (result.success && result.invitation) {
          successful.push(result.invitation);
        } else {
          const errorMessage = result.errors?.[0]?.message || 'Unknown error';
          failed.push({ email: invitationRequest.email, error: errorMessage });
        }
      } catch (error) {
        failed.push({
          email: invitationRequest.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Send bulk notification if custom email template provided
    if (request.emailTemplate && successful.length > 0 && request.sendImmediately !== false) {
      await this.sendBulkInvitationEmails(successful, request.emailTemplate);
    }

    return {
      successful,
      failed,
      stats: {
        total: request.invitations.length,
        successful: successful.length,
        failed: failed.length
      }
    };
  }

  /**
   * Validate an invitation token
   */
  async validateInvitation(token: string): Promise<InvitationValidationResult> {
    try {
      const { data, error } = await this.supabase
        .from('institution_invitations')
        .select(`
          *,
          institutions (
            id,
            name,
            domain,
            status,
            branding
          ),
          departments (
            id,
            name,
            code
          )
        `)
        .eq('token', token)
        .single();

      if (error || !data) {
        return {
          valid: false,
          error: 'Invalid invitation token'
        };
      }

      const invitation = this.mapToInvitation(data);

      // Check if invitation has expired
      if (new Date() > invitation.expiresAt) {
        return {
          valid: false,
          error: 'Invitation has expired'
        };
      }

      // Check if invitation has already been accepted
      if (invitation.acceptedAt) {
        return {
          valid: false,
          error: 'Invitation has already been accepted'
        };
      }

      // Check if institution is still active
      if (data.institutions?.status !== 'active') {
        return {
          valid: false,
          error: 'Institution is no longer active'
        };
      }

      return {
        valid: true,
        invitation
      };
    } catch (error) {
      console.error('Error validating invitation:', error);
      return {
        valid: false,
        error: 'Error validating invitation'
      };
    }
  }

  /**
   * Accept an invitation and create user account
   */
  async acceptInvitation(
    token: string,
    userData: {
      firstName: string;
      lastName: string;
      password: string;
    }
  ): Promise<{ success: boolean; userId?: string; errors?: ValidationError[] }> {
    try {
      const validation = await this.validateInvitation(token);
      
      if (!validation.valid || !validation.invitation) {
        return {
          success: false,
          errors: [{ field: 'token', message: validation.error || 'Invalid invitation', code: 'INVALID_INVITATION' }]
        };
      }

      const invitation = validation.invitation;

      // Check if user already exists with this email
      const { data: existingUser } = await this.supabase
        .from('users')
        .select('id')
        .eq('email', invitation.email)
        .single();

      let userId: string;

      if (existingUser) {
        // User exists, just add them to the institution
        userId = existingUser.id;
      } else {
        // Create new user account
        const { data: newUser, error: userError } = await this.supabase.auth.signUp({
          email: invitation.email,
          password: userData.password,
          options: {
            data: {
              first_name: userData.firstName,
              last_name: userData.lastName,
              role: invitation.role
            }
          }
        });

        if (userError || !newUser.user) {
          console.error('Error creating user account:', userError);
          return {
            success: false,
            errors: [{ field: 'account', message: 'Failed to create user account', code: 'ACCOUNT_CREATION_FAILED' }]
          };
        }

        userId = newUser.user.id;
      }

      // Add user to institution
      const { error: institutionError } = await this.supabase
        .from('user_institutions')
        .insert({
          user_id: userId,
          institution_id: invitation.institutionId,
          role: invitation.role,
          department_id: invitation.departmentId,
          invited_by: invitation.invitedBy,
          joined_at: new Date().toISOString(),
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (institutionError) {
        console.error('Error adding user to institution:', institutionError);
        return {
          success: false,
          errors: [{ field: 'institution', message: 'Failed to add user to institution', code: 'INSTITUTION_JOIN_FAILED' }]
        };
      }

      // Mark invitation as accepted
      await this.supabase
        .from('institution_invitations')
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by: userId
        })
        .eq('token', token);

      // Log the acceptance
      await this.logInvitationAction(invitation.id, 'accepted', userId);

      // Send welcome notification
      await this.sendWelcomeNotification(userId, invitation);

      return { success: true, userId };
    } catch (error) {
      console.error('Unexpected error accepting invitation:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Decline an invitation
   */
  async declineInvitation(token: string, reason?: string): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      const validation = await this.validateInvitation(token);
      
      if (!validation.valid || !validation.invitation) {
        return {
          success: false,
          errors: [{ field: 'token', message: validation.error || 'Invalid invitation', code: 'INVALID_INVITATION' }]
        };
      }

      await this.supabase
        .from('institution_invitations')
        .update({
          declined_at: new Date().toISOString(),
          decline_reason: reason
        })
        .eq('token', token);

      // Log the decline
      await this.logInvitationAction(validation.invitation.id, 'declined', null, { reason });

      return { success: true };
    } catch (error) {
      console.error('Unexpected error declining invitation:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Get invitations for an institution
   */
  async getInstitutionInvitations(
    institutionId: string,
    filters: InvitationFilters = {}
  ): Promise<{ invitations: InstitutionInvitation[]; total: number }> {
    try {
      let query = this.supabase
        .from('institution_invitations')
        .select(`
          *,
          departments (
            id,
            name,
            code
          ),
          users!institution_invitations_invited_by_fkey (
            id,
            first_name,
            last_name,
            email
          )
        `, { count: 'exact' })
        .eq('institution_id', institutionId);

      // Apply filters
      if (filters.status) {
        switch (filters.status) {
          case 'pending':
            query = query.is('accepted_at', null).is('declined_at', null).gt('expires_at', new Date().toISOString());
            break;
          case 'accepted':
            query = query.not('accepted_at', 'is', null);
            break;
          case 'declined':
            query = query.not('declined_at', 'is', null);
            break;
          case 'expired':
            query = query.is('accepted_at', null).is('declined_at', null).lt('expires_at', new Date().toISOString());
            break;
        }
      }

      if (filters.role) {
        query = query.eq('role', filters.role);
      }
      if (filters.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters.invitedBy) {
        query = query.eq('invited_by', filters.invitedBy);
      }
      if (filters.search) {
        query = query.or(`email.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`);
      }
      if (filters.createdAfter) {
        query = query.gte('created_at', filters.createdAfter.toISOString());
      }
      if (filters.createdBefore) {
        query = query.lte('created_at', filters.createdBefore.toISOString());
      }

      // Apply pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 10)) - 1);
      }

      // Order by created date
      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching institution invitations:', error);
        return { invitations: [], total: 0 };
      }

      const invitations = (data || []).map(this.mapToInvitation);
      return { invitations, total: count || 0 };
    } catch (error) {
      console.error('Unexpected error fetching invitations:', error);
      return { invitations: [], total: 0 };
    }
  }

  /**
   * Get invitation statistics for an institution
   */
  async getInvitationStats(institutionId: string): Promise<InvitationStats> {
    try {
      const { data, error } = await this.supabase
        .from('institution_invitations')
        .select('role, department_id, accepted_at, declined_at, expires_at')
        .eq('institution_id', institutionId);

      if (error || !data) {
        return {
          total: 0,
          pending: 0,
          accepted: 0,
          declined: 0,
          expired: 0,
          acceptanceRate: 0,
          byRole: {} as Record<UserRole, number>,
          byDepartment: {}
        };
      }

      const now = new Date();
      const stats = data.reduce(
        (acc, invitation) => {
          acc.total++;
          
          if (invitation.accepted_at) {
            acc.accepted++;
          } else if (invitation.declined_at) {
            acc.declined++;
          } else if (new Date(invitation.expires_at) < now) {
            acc.expired++;
          } else {
            acc.pending++;
          }

          // Count by role
          acc.byRole[invitation.role as UserRole] = (acc.byRole[invitation.role as UserRole] || 0) + 1;

          // Count by department
          if (invitation.department_id) {
            acc.byDepartment[invitation.department_id] = (acc.byDepartment[invitation.department_id] || 0) + 1;
          }
          
          return acc;
        },
        {
          total: 0,
          pending: 0,
          accepted: 0,
          declined: 0,
          expired: 0,
          byRole: {} as Record<UserRole, number>,
          byDepartment: {} as Record<string, number>
        }
      );

      return {
        ...stats,
        acceptanceRate: stats.total > 0 ? (stats.accepted / stats.total) * 100 : 0
      };
    } catch (error) {
      console.error('Error fetching invitation stats:', error);
      return {
        total: 0,
        pending: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
        acceptanceRate: 0,
        byRole: {} as Record<UserRole, number>,
        byDepartment: {}
      };
    }
  }

  /**
   * Resend an invitation
   */
  async resendInvitation(
    invitationId: string,
    resentBy: string
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      const { data: invitation, error } = await this.supabase
        .from('institution_invitations')
        .select('*')
        .eq('id', invitationId)
        .single();

      if (error || !invitation) {
        return {
          success: false,
          errors: [{ field: 'invitation', message: 'Invitation not found', code: 'INVITATION_NOT_FOUND' }]
        };
      }

      // Check if invitation is still valid for resending
      if (invitation.accepted_at) {
        return {
          success: false,
          errors: [{ field: 'invitation', message: 'Invitation has already been accepted', code: 'ALREADY_ACCEPTED' }]
        };
      }

      // Extend expiration date
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await this.supabase
        .from('institution_invitations')
        .update({
          expires_at: newExpiresAt.toISOString(),
          resent_at: new Date().toISOString(),
          resent_by: resentBy
        })
        .eq('id', invitationId);

      // Send invitation email again
      const mappedInvitation = this.mapToInvitation(invitation);
      mappedInvitation.expiresAt = newExpiresAt;
      await this.sendInvitationEmail(mappedInvitation);

      // Log the resend action
      await this.logInvitationAction(invitationId, 'resent', resentBy);

      return { success: true };
    } catch (error) {
      console.error('Unexpected error resending invitation:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Cancel/revoke an invitation
   */
  async revokeInvitation(
    invitationId: string,
    revokedBy: string,
    reason?: string
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      const { data: invitation, error } = await this.supabase
        .from('institution_invitations')
        .select('*')
        .eq('id', invitationId)
        .single();

      if (error || !invitation) {
        return {
          success: false,
          errors: [{ field: 'invitation', message: 'Invitation not found', code: 'INVITATION_NOT_FOUND' }]
        };
      }

      // Check if invitation can be revoked
      if (invitation.accepted_at) {
        return {
          success: false,
          errors: [{ field: 'invitation', message: 'Cannot revoke accepted invitation', code: 'ALREADY_ACCEPTED' }]
        };
      }

      // Mark as revoked (soft delete)
      await this.supabase
        .from('institution_invitations')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: revokedBy,
          revoke_reason: reason
        })
        .eq('id', invitationId);

      // Log the revocation
      await this.logInvitationAction(invitationId, 'revoked', revokedBy, { reason });

      return { success: true };
    } catch (error) {
      console.error('Unexpected error revoking invitation:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Clean up expired invitations
   */
  async cleanupExpiredInvitations(): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('institution_invitations')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .is('accepted_at', null)
        .is('declined_at', null)
        .is('revoked_at', null)
        .select('id');

      if (error) {
        console.error('Error cleaning up expired invitations:', error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Unexpected error cleaning up invitations:', error);
      return 0;
    }
  }

  // Private helper methods

  private generateInvitationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async validateInvitationRequest(
    request: InvitationCreateRequest
  ): Promise<{ isValid: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    // Validate email
    if (!request.email || !this.isValidEmail(request.email)) {
      errors.push({ field: 'email', message: 'Valid email is required', code: 'INVALID_EMAIL' });
    }

    // Validate role
    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(request.role)) {
      errors.push({ field: 'role', message: 'Invalid role', code: 'INVALID_ROLE' });
    }

    // Validate institution exists
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('id, status')
      .eq('id', request.institutionId)
      .single();

    if (!institution) {
      errors.push({ field: 'institutionId', message: 'Institution not found', code: 'INSTITUTION_NOT_FOUND' });
    } else if (institution.status !== 'active') {
      errors.push({ field: 'institutionId', message: 'Institution is not active', code: 'INSTITUTION_INACTIVE' });
    }

    // Validate department if provided
    if (request.departmentId) {
      const { data: department } = await this.supabase
        .from('departments')
        .select('id, institution_id, status')
        .eq('id', request.departmentId)
        .single();

      if (!department) {
        errors.push({ field: 'departmentId', message: 'Department not found', code: 'DEPARTMENT_NOT_FOUND' });
      } else if (department.institution_id !== request.institutionId) {
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

  private async validateInstitutionAccess(
    institutionId: string,
    userId: string
  ): Promise<{ isValid: boolean; errors?: ValidationError[] }> {
    const { data: userRole } = await this.supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .eq('status', 'active')
      .single();

    if (!userRole || !['institution_admin', 'department_admin'].includes(userRole.role)) {
      return {
        isValid: false,
        errors: [{ field: 'permission', message: 'Insufficient permissions', code: 'INSUFFICIENT_PERMISSIONS' }]
      };
    }

    return { isValid: true };
  }

  private async checkExistingUserOrInvitation(
    email: string,
    institutionId: string
  ): Promise<{ canInvite: boolean; reason: string }> {
    // Check if user already exists in institution
    const { data: existingUser } = await this.supabase
      .from('users')
      .select(`
        id,
        user_institutions!inner (
          institution_id,
          status
        )
      `)
      .eq('email', email.toLowerCase())
      .eq('user_institutions.institution_id', institutionId)
      .single();

    if (existingUser) {
      const userInstitution = existingUser.user_institutions[0];
      if (userInstitution.status === 'active') {
        return { canInvite: false, reason: 'User is already a member of this institution' };
      } else if (userInstitution.status === 'pending') {
        return { canInvite: false, reason: 'User already has a pending invitation to this institution' };
      }
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await this.supabase
      .from('institution_invitations')
      .select('id, expires_at, accepted_at, declined_at, revoked_at')
      .eq('email', email.toLowerCase())
      .eq('institution_id', institutionId)
      .single();

    if (existingInvitation) {
      if (existingInvitation.accepted_at) {
        return { canInvite: false, reason: 'User has already accepted an invitation to this institution' };
      }
      
      if (!existingInvitation.declined_at && !existingInvitation.revoked_at && 
          new Date(existingInvitation.expires_at) > new Date()) {
        return { canInvite: false, reason: 'User already has a pending invitation to this institution' };
      }
    }

    return { canInvite: true, reason: 'User can be invited' };
  }

  private async sendInvitationEmail(invitation: InstitutionInvitation): Promise<void> {
    try {
      // Get institution details for the email
      const { data: institution } = await this.supabase
        .from('institutions')
        .select('name, branding')
        .eq('id', invitation.institutionId)
        .single();

      if (!institution) return;

      const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invitations/${invitation.token}`;
      
      const emailContent = {
        subject: `Invitation to join ${institution.name}`,
        body: this.generateInvitationEmailBody(invitation, institution, invitationUrl)
      };

      // Send email using notification service
      await this.notificationService.sendEmail(
        invitation.email,
        emailContent.subject,
        emailContent.body
      );
    } catch (error) {
      console.error('Error sending invitation email:', error);
    }
  }

  private async sendBulkInvitationEmails(
    invitations: InstitutionInvitation[],
    emailTemplate: { subject: string; body: string }
  ): Promise<void> {
    for (const invitation of invitations) {
      try {
        const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invitations/${invitation.token}`;
        
        const personalizedBody = emailTemplate.body
          .replace('{{invitation_url}}', invitationUrl)
          .replace('{{expires_at}}', invitation.expiresAt.toLocaleDateString())
          .replace('{{role}}', invitation.role)
          .replace('{{first_name}}', invitation.firstName || '')
          .replace('{{last_name}}', invitation.lastName || '');

        await this.notificationService.sendEmail(
          invitation.email,
          emailTemplate.subject,
          personalizedBody
        );
      } catch (error) {
        console.error(`Error sending bulk invitation email to ${invitation.email}:`, error);
      }
    }
  }

  private generateInvitationEmailBody(
    invitation: InstitutionInvitation,
    institution: any,
    invitationUrl: string
  ): string {
    const roleName = this.getRoleDisplayName(invitation.role);
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${institution.branding?.primaryColor || '#1f2937'};">
          You've been invited to join ${institution.name}!
        </h2>
        
        ${invitation.firstName ? `<p>Hello ${invitation.firstName},</p>` : '<p>Hello,</p>'}
        
        <p>You have been invited to join <strong>${institution.name}</strong> as a <strong>${roleName}</strong>.</p>
        
        ${invitation.message ? `<div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Personal message:</strong></p>
          <p style="font-style: italic;">${invitation.message}</p>
        </div>` : ''}
        
        <p>To accept this invitation and create your account, please click the button below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}" 
             style="background-color: ${institution.branding?.primaryColor || '#3b82f6'}; 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 5px; 
                    display: inline-block;">
            Accept Invitation
          </a>
        </div>
        
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background-color: #f9fafb; padding: 10px; border-radius: 3px;">
          ${invitationUrl}
        </p>
        
        <p style="color: #6b7280; font-size: 14px;">
          <strong>Important:</strong> This invitation will expire on ${invitation.expiresAt.toLocaleDateString()}.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 12px;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `;
  }

  private async sendWelcomeNotification(userId: string, invitation: InstitutionInvitation): Promise<void> {
    try {
      await this.notificationService.sendNotification(
        userId,
        'INSTITUTION_WELCOME',
        'Welcome to the institution!',
        `Welcome! You have successfully joined as a ${this.getRoleDisplayName(invitation.role)}.`,
        { institutionId: invitation.institutionId, role: invitation.role }
      );
    } catch (error) {
      console.error('Error sending welcome notification:', error);
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

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    return emailRegex.test(email);
  }

  private async logInvitationAction(
    invitationId: string,
    action: string,
    performedBy: string | null,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await this.supabase
        .from('invitation_audit_log')
        .insert({
          invitation_id: invitationId,
          action,
          performed_by: performedBy,
          metadata: metadata || {},
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging invitation action:', error);
    }
  }

  private mapToInvitation(data: any): InstitutionInvitation {
    return {
      id: data.id,
      institutionId: data.institution_id,
      email: data.email,
      role: data.role,
      departmentId: data.department_id,
      firstName: data.first_name,
      lastName: data.last_name,
      invitedBy: data.invited_by,
      token: data.token,
      expiresAt: new Date(data.expires_at),
      acceptedAt: data.accepted_at ? new Date(data.accepted_at) : undefined,
      message: data.message,
      createdAt: new Date(data.created_at)
    };
  }
}