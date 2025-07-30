import { createClient } from '@/lib/supabase/server';
import { ClassInvitation, EnrollmentResult, EnrollmentStatus } from '@/lib/types/enrollment';
import { NotificationService } from './notification-service';
import crypto from 'crypto';

export interface InvitationCreateRequest {
  classId: string;
  studentId?: string;
  email?: string;
  message?: string;
  expiresAt?: Date;
}

export interface BulkInvitationRequest {
  classId: string;
  invitations: Array<{
    studentId?: string;
    email?: string;
    message?: string;
  }>;
  defaultMessage?: string;
  expiresAt?: Date;
  emailTemplate?: {
    subject: string;
    body: string;
  };
}

export interface InvitationValidationResult {
  valid: boolean;
  invitation?: ClassInvitation;
  error?: string;
}

export interface InvitationStats {
  total: number;
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
  acceptanceRate: number;
}

export class InvitationManager {
  private supabase = createClient();
  private notificationService = new NotificationService();

  /**
   * Create a single class invitation
   */
  async createInvitation(
    invitedBy: string,
    request: InvitationCreateRequest
  ): Promise<ClassInvitation> {
    // Validate that the inviter has permission to invite to this class
    await this.validateInviterPermission(invitedBy, request.classId);

    // Generate secure token
    const token = this.generateInvitationToken();

    // Set default expiration (7 days from now)
    const expiresAt = request.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitationData = {
      class_id: request.classId,
      student_id: request.studentId,
      email: request.email,
      invited_by: invitedBy,
      token,
      expires_at: expiresAt.toISOString(),
      message: request.message,
      created_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('class_invitations')
      .insert(invitationData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create invitation: ${error.message}`);
    }

    const invitation = this.mapToInvitation(data);

    // Send invitation notification
    await this.sendInvitationNotification(invitation);

    // Log the invitation creation
    await this.logInvitationAction(invitation.id, 'created', invitedBy);

    return invitation;
  }

  /**
   * Create multiple invitations in bulk
   */
  async createBulkInvitations(
    invitedBy: string,
    request: BulkInvitationRequest
  ): Promise<{
    successful: ClassInvitation[];
    failed: Array<{ request: any; error: string }>;
    stats: { total: number; successful: number; failed: number };
  }> {
    // Validate that the inviter has permission
    await this.validateInviterPermission(invitedBy, request.classId);

    const successful: ClassInvitation[] = [];
    const failed: Array<{ request: any; error: string }> = [];

    // Set default expiration
    const expiresAt = request.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    for (const invitationRequest of request.invitations) {
      try {
        const invitation = await this.createInvitation(invitedBy, {
          classId: request.classId,
          studentId: invitationRequest.studentId,
          email: invitationRequest.email,
          message: invitationRequest.message || request.defaultMessage,
          expiresAt
        });
        successful.push(invitation);
      } catch (error) {
        failed.push({
          request: invitationRequest,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Send bulk notification if custom email template provided
    if (request.emailTemplate && successful.length > 0) {
      await this.sendBulkInvitationNotifications(successful, request.emailTemplate);
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
    const { data, error } = await this.supabase
      .from('class_invitations')
      .select(`
        *,
        classes (
          id,
          name,
          code,
          teacher_id,
          capacity,
          current_enrollment,
          enrollment_config
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

    // Check if invitation has already been accepted or declined
    if (invitation.acceptedAt || invitation.declinedAt) {
      return {
        valid: false,
        error: 'Invitation has already been responded to'
      };
    }

    // Check if class still has capacity
    const classData = data.classes;
    if (classData.current_enrollment >= classData.capacity) {
      return {
        valid: false,
        error: 'Class is now at full capacity'
      };
    }

    return {
      valid: true,
      invitation
    };
  }

  /**
   * Accept an invitation and enroll the student
   */
  async acceptInvitation(
    token: string,
    studentId: string
  ): Promise<EnrollmentResult> {
    const validation = await this.validateInvitation(token);
    
    if (!validation.valid || !validation.invitation) {
      return {
        success: false,
        status: EnrollmentStatus.DROPPED,
        message: validation.error || 'Invalid invitation',
        nextSteps: ['Contact the instructor for a new invitation'],
        errors: [{ field: 'token', message: validation.error || 'Invalid invitation', code: 'INVALID_INVITATION' }]
      };
    }

    const invitation = validation.invitation;

    // Verify the student matches the invitation (if specific student was invited)
    if (invitation.studentId && invitation.studentId !== studentId) {
      return {
        success: false,
        status: EnrollmentStatus.DROPPED,
        message: 'This invitation is not for your account',
        nextSteps: ['Contact the instructor for the correct invitation'],
        errors: [{ field: 'student', message: 'Student mismatch', code: 'STUDENT_MISMATCH' }]
      };
    }

    try {
      // Start transaction
      const { data: enrollmentData, error: enrollmentError } = await this.supabase
        .from('enrollments')
        .insert({
          student_id: studentId,
          class_id: invitation.classId,
          status: 'enrolled',
          enrolled_at: new Date().toISOString(),
          enrolled_by: invitation.invitedBy,
          credits: 0, // Will be updated based on class configuration
          priority: 0,
          metadata: { invitation_token: token }
        })
        .select()
        .single();

      if (enrollmentError) {
        throw new Error(`Failed to create enrollment: ${enrollmentError.message}`);
      }

      // Mark invitation as accepted
      await this.supabase
        .from('class_invitations')
        .update({
          accepted_at: new Date().toISOString()
        })
        .eq('token', token);

      // Update class enrollment count
      await this.supabase.rpc('increment_class_enrollment', {
        class_id: invitation.classId
      });

      // Log the acceptance
      await this.logInvitationAction(invitation.id, 'accepted', studentId);

      // Send confirmation notification
      await this.notificationService.sendEnrollmentConfirmation(
        studentId,
        invitation.classId,
        enrollmentData.id
      );

      return {
        success: true,
        enrollmentId: enrollmentData.id,
        status: EnrollmentStatus.ENROLLED,
        message: 'Successfully enrolled in class via invitation',
        nextSteps: ['Check your class schedule and prepare for the first session']
      };

    } catch (error) {
      return {
        success: false,
        status: EnrollmentStatus.DROPPED,
        message: error instanceof Error ? error.message : 'Failed to accept invitation',
        nextSteps: ['Try again or contact support'],
        errors: [{ field: 'enrollment', message: 'Enrollment failed', code: 'ENROLLMENT_FAILED' }]
      };
    }
  }

  /**
   * Decline an invitation
   */
  async declineInvitation(token: string, studentId?: string): Promise<void> {
    const validation = await this.validateInvitation(token);
    
    if (!validation.valid || !validation.invitation) {
      throw new Error('Invalid invitation token');
    }

    await this.supabase
      .from('class_invitations')
      .update({
        declined_at: new Date().toISOString()
      })
      .eq('token', token);

    // Log the decline
    await this.logInvitationAction(validation.invitation.id, 'declined', studentId);
  }

  /**
   * Get invitations for a class
   */
  async getClassInvitations(classId: string, teacherId: string): Promise<ClassInvitation[]> {
    // Verify teacher has access to this class
    await this.validateInviterPermission(teacherId, classId);

    const { data, error } = await this.supabase
      .from('class_invitations')
      .select(`
        *,
        users!class_invitations_student_id_fkey (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch invitations: ${error.message}`);
    }

    return data.map(this.mapToInvitation);
  }

  /**
   * Get invitation statistics for a class
   */
  async getInvitationStats(classId: string, teacherId: string): Promise<InvitationStats> {
    // Verify teacher has access to this class
    await this.validateInviterPermission(teacherId, classId);

    const { data, error } = await this.supabase
      .from('class_invitations')
      .select('accepted_at, declined_at, expires_at')
      .eq('class_id', classId);

    if (error) {
      throw new Error(`Failed to fetch invitation stats: ${error.message}`);
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
        
        return acc;
      },
      { total: 0, pending: 0, accepted: 0, declined: 0, expired: 0 }
    );

    return {
      ...stats,
      acceptanceRate: stats.total > 0 ? (stats.accepted / stats.total) * 100 : 0
    };
  }

  /**
   * Cancel/revoke an invitation
   */
  async revokeInvitation(invitationId: string, revokedBy: string): Promise<void> {
    const { data: invitation, error } = await this.supabase
      .from('class_invitations')
      .select('class_id, invited_by')
      .eq('id', invitationId)
      .single();

    if (error || !invitation) {
      throw new Error('Invitation not found');
    }

    // Verify permission to revoke
    if (invitation.invited_by !== revokedBy) {
      await this.validateInviterPermission(revokedBy, invitation.class_id);
    }

    // Delete the invitation
    await this.supabase
      .from('class_invitations')
      .delete()
      .eq('id', invitationId);

    // Log the revocation
    await this.logInvitationAction(invitationId, 'revoked', revokedBy);
  }

  /**
   * Clean up expired invitations
   */
  async cleanupExpiredInvitations(): Promise<number> {
    const { data, error } = await this.supabase
      .from('class_invitations')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .is('accepted_at', null)
      .is('declined_at', null)
      .select('id');

    if (error) {
      throw new Error(`Failed to cleanup expired invitations: ${error.message}`);
    }

    return data?.length || 0;
  }

  // Private helper methods

  private generateInvitationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async validateInviterPermission(userId: string, classId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('classes')
      .select('teacher_id')
      .eq('id', classId)
      .single();

    if (error || !data) {
      throw new Error('Class not found');
    }

    if (data.teacher_id !== userId) {
      // Check if user is admin or has permission
      const { data: userRole } = await this.supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .in('role', ['institution_admin', 'department_admin'])
        .single();

      if (!userRole) {
        throw new Error('Insufficient permissions to manage invitations for this class');
      }
    }
  }

  private async sendInvitationNotification(invitation: ClassInvitation): Promise<void> {
    // Get class details for the notification
    const { data: classData } = await this.supabase
      .from('classes')
      .select('name, code, teacher_id, users!classes_teacher_id_fkey(first_name, last_name)')
      .eq('id', invitation.classId)
      .single();

    if (!classData) return;

    const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invitations/${invitation.token}`;
    
    const emailContent = {
      subject: `Class Invitation: ${classData.name} (${classData.code})`,
      body: `
        <h2>You've been invited to join a class!</h2>
        <p><strong>Class:</strong> ${classData.name} (${classData.code})</p>
        <p><strong>Instructor:</strong> ${classData.users?.first_name} ${classData.users?.last_name}</p>
        ${invitation.message ? `<p><strong>Message:</strong> ${invitation.message}</p>` : ''}
        <p><strong>Expires:</strong> ${invitation.expiresAt.toLocaleDateString()}</p>
        
        <p>
          <a href="${invitationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Accept Invitation
          </a>
        </p>
        
        <p>Or copy and paste this link: ${invitationUrl}</p>
        
        <p><em>This invitation will expire on ${invitation.expiresAt.toLocaleDateString()}.</em></p>
      `
    };

    // Send to specific student or email
    if (invitation.studentId) {
      await this.notificationService.sendNotification(
        invitation.studentId,
        'CLASS_INVITATION',
        emailContent.subject,
        emailContent.body,
        { classId: invitation.classId, invitationId: invitation.id }
      );
    } else if (invitation.email) {
      // Send email directly (implement email service integration)
      await this.sendDirectEmail(invitation.email, emailContent);
    }
  }

  private async sendBulkInvitationNotifications(
    invitations: ClassInvitation[],
    emailTemplate: { subject: string; body: string }
  ): Promise<void> {
    // Implementation for bulk email sending with custom template
    // This would integrate with your email service provider
    for (const invitation of invitations) {
      const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invitations/${invitation.token}`;
      
      const personalizedBody = emailTemplate.body
        .replace('{{invitation_url}}', invitationUrl)
        .replace('{{expires_at}}', invitation.expiresAt.toLocaleDateString());

      if (invitation.studentId) {
        await this.notificationService.sendNotification(
          invitation.studentId,
          'CLASS_INVITATION',
          emailTemplate.subject,
          personalizedBody,
          { classId: invitation.classId, invitationId: invitation.id }
        );
      } else if (invitation.email) {
        await this.sendDirectEmail(invitation.email, {
          subject: emailTemplate.subject,
          body: personalizedBody
        });
      }
    }
  }

  private async sendDirectEmail(
    email: string,
    content: { subject: string; body: string }
  ): Promise<void> {
    // Placeholder for direct email sending
    // This would integrate with your email service (SendGrid, AWS SES, etc.)
    console.log(`Sending invitation email to ${email}: ${content.subject}`);
  }

  private async logInvitationAction(
    invitationId: string,
    action: string,
    performedBy?: string
  ): Promise<void> {
    await this.supabase
      .from('invitation_audit_log')
      .insert({
        invitation_id: invitationId,
        action,
        performed_by: performedBy,
        timestamp: new Date().toISOString(),
        metadata: {}
      });
  }

  private mapToInvitation(data: any): ClassInvitation {
    return {
      id: data.id,
      classId: data.class_id,
      studentId: data.student_id,
      email: data.email,
      invitedBy: data.invited_by,
      token: data.token,
      expiresAt: new Date(data.expires_at),
      acceptedAt: data.accepted_at ? new Date(data.accepted_at) : undefined,
      declinedAt: data.declined_at ? new Date(data.declined_at) : undefined,
      message: data.message,
      createdAt: new Date(data.created_at)
    };
  }
}