import { createClient } from '@/lib/supabase/server';
import { InstitutionManager } from './institution-manager';
import {
  Institution,
  InstitutionCreationData,
  ValidationError,
  InstitutionInvitation
} from '@/lib/types/institution';

export interface AdminAccountData {
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: string;
}

export interface InstitutionSetupResult {
  success: boolean;
  institution?: Institution;
  adminInvitation?: InstitutionInvitation;
  errors?: ValidationError[];
}

export class InstitutionSetupWorkflow {
  private supabase;
  private institutionManager: InstitutionManager;

  constructor() {
    this.supabase = createClient();
    this.institutionManager = new InstitutionManager();
  }

  /**
   * Complete institution setup workflow
   * 1. Create institution
   * 2. Create admin account invitation
   * 3. Send welcome email
   */
  async setupInstitution(
    institutionData: InstitutionCreationData,
    adminData: AdminAccountData,
    createdBy: string
  ): Promise<InstitutionSetupResult> {
    try {
      // Step 1: Create institution
      const institutionResult = await this.institutionManager.createInstitution(institutionData, createdBy);
      
      if (!institutionResult.success || !institutionResult.institution) {
        return {
          success: false,
          errors: institutionResult.errors || [{ field: 'general', message: 'Failed to create institution', code: 'CREATION_FAILED' }]
        };
      }

      const institution = institutionResult.institution;

      // Step 2: Create admin invitation
      const invitationResult = await this.createAdminInvitation(institution.id, adminData, createdBy);
      
      if (!invitationResult.success || !invitationResult.invitation) {
        // Rollback institution creation if admin invitation fails
        await this.institutionManager.updateInstitutionStatus(institution.id, 'suspended');
        
        return {
          success: false,
          errors: invitationResult.errors || [{ field: 'admin', message: 'Failed to create admin invitation', code: 'INVITATION_FAILED' }]
        };
      }

      // Step 3: Send welcome email (in a real implementation)
      await this.sendWelcomeEmail(institution, invitationResult.invitation, adminData);

      // Step 4: Update institution status to active
      await this.institutionManager.updateInstitutionStatus(institution.id, 'active');

      return {
        success: true,
        institution,
        adminInvitation: invitationResult.invitation
      };

    } catch (error) {
      console.error('Unexpected error in institution setup workflow:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error during setup', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Create admin invitation for new institution
   */
  private async createAdminInvitation(
    institutionId: string,
    adminData: AdminAccountData,
    invitedBy: string
  ): Promise<{ success: boolean; invitation?: InstitutionInvitation; errors?: ValidationError[] }> {
    try {
      // Validate admin data
      const validation = this.validateAdminData(adminData);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check if email is already in use
      const emailCheck = await this.checkEmailAvailability(adminData.email);
      if (!emailCheck.isAvailable) {
        return {
          success: false,
          errors: [{ field: 'email', message: emailCheck.message, code: 'EMAIL_IN_USE' }]
        };
      }

      // Generate invitation token
      const token = this.generateInvitationToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

      // Create invitation record
      const invitationData = {
        institution_id: institutionId,
        email: adminData.email,
        role: 'institution_admin',
        invited_by: invitedBy,
        token,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('institution_invitations')
        .insert(invitationData)
        .select()
        .single();

      if (error) {
        console.error('Error creating admin invitation:', error);
        return {
          success: false,
          errors: [{ field: 'invitation', message: 'Failed to create invitation', code: 'DATABASE_ERROR' }]
        };
      }

      const invitation: InstitutionInvitation = {
        id: data.id,
        institutionId: data.institution_id,
        email: data.email,
        role: data.role,
        invitedBy: data.invited_by,
        token: data.token,
        expiresAt: new Date(data.expires_at),
        createdAt: new Date(data.created_at)
      };

      return { success: true, invitation };

    } catch (error) {
      console.error('Unexpected error creating admin invitation:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Send welcome email to new institution admin
   */
  private async sendWelcomeEmail(
    institution: Institution,
    invitation: InstitutionInvitation,
    adminData: AdminAccountData
  ): Promise<void> {
    try {
      // In a real implementation, this would integrate with an email service
      // For now, we'll just log the email content
      
      const emailContent = this.generateWelcomeEmailContent(institution, invitation, adminData);
      
      console.log('Welcome email would be sent to:', adminData.email);
      console.log('Email content:', emailContent);
      
      // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
      // await emailService.send({
      //   to: adminData.email,
      //   subject: emailContent.subject,
      //   html: emailContent.html,
      //   text: emailContent.text
      // });

    } catch (error) {
      console.error('Error sending welcome email:', error);
      // Don't fail the entire workflow if email fails
    }
  }

  /**
   * Generate welcome email content
   */
  private generateWelcomeEmailContent(
    institution: Institution,
    invitation: InstitutionInvitation,
    adminData: AdminAccountData
  ): { subject: string; html: string; text: string } {
    const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invitations/${invitation.token}`;
    const institutionName = institution.name;
    const adminName = `${adminData.firstName} ${adminData.lastName}`;

    const subject = `Welcome to ${institutionName} - Complete Your Admin Setup`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: ${institution.branding.primaryColor || '#1f2937'};">Welcome to ${institutionName}!</h1>
        
        <p>Dear ${adminName},</p>
        
        <p>Congratulations! Your institution <strong>${institutionName}</strong> has been successfully set up on our platform.</p>
        
        <p>As the institution administrator, you have been granted full access to manage:</p>
        <ul>
          <li>Institution settings and branding</li>
          <li>Department creation and management</li>
          <li>User invitations and role assignments</li>
          <li>Analytics and reporting</li>
          <li>Integration configurations</li>
        </ul>
        
        <p>To complete your account setup and access your admin dashboard, please click the button below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}" 
             style="background-color: ${institution.branding.accentColor || '#3b82f6'}; 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    display: inline-block;">
            Complete Admin Setup
          </a>
        </div>
        
        <p><strong>Important:</strong> This invitation link will expire in 7 days. If you need a new invitation, please contact support.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <h3>Institution Details:</h3>
        <ul>
          <li><strong>Name:</strong> ${institutionName}</li>
          <li><strong>Domain:</strong> ${institution.domain}</li>
          <li><strong>Type:</strong> ${institution.type}</li>
          <li><strong>Status:</strong> ${institution.status}</li>
        </ul>
        
        <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
        
        <p>Best regards,<br>The Platform Team</p>
      </div>
    `;

    const text = `
Welcome to ${institutionName}!

Dear ${adminName},

Congratulations! Your institution ${institutionName} has been successfully set up on our platform.

As the institution administrator, you have been granted full access to manage:
- Institution settings and branding
- Department creation and management
- User invitations and role assignments
- Analytics and reporting
- Integration configurations

To complete your account setup and access your admin dashboard, please visit:
${invitationUrl}

Important: This invitation link will expire in 7 days. If you need a new invitation, please contact support.

Institution Details:
- Name: ${institutionName}
- Domain: ${institution.domain}
- Type: ${institution.type}
- Status: ${institution.status}

If you have any questions or need assistance, please don't hesitate to contact our support team.

Best regards,
The Platform Team
    `;

    return { subject, html, text };
  }

  /**
   * Validate admin account data
   */
  private validateAdminData(data: AdminAccountData): { isValid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    if (!data.email || !this.isValidEmail(data.email)) {
      errors.push({ field: 'email', message: 'Valid email is required', code: 'INVALID_EMAIL' });
    }

    if (!data.firstName || data.firstName.trim().length === 0) {
      errors.push({ field: 'firstName', message: 'First name is required', code: 'REQUIRED' });
    }

    if (!data.lastName || data.lastName.trim().length === 0) {
      errors.push({ field: 'lastName', message: 'Last name is required', code: 'REQUIRED' });
    }

    if (data.phone && !this.isValidPhone(data.phone)) {
      errors.push({ field: 'phone', message: 'Invalid phone number format', code: 'INVALID_PHONE' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if email is available for new admin account
   */
  private async checkEmailAvailability(email: string): Promise<{ isAvailable: boolean; message: string }> {
    try {
      // Check existing invitations
      const { data: invitations } = await this.supabase
        .from('institution_invitations')
        .select('id')
        .eq('email', email)
        .is('accepted_at', null);

      if (invitations && invitations.length > 0) {
        return { isAvailable: false, message: 'Email already has a pending invitation' };
      }

      // In a real implementation, you would also check the users table
      // For now, we'll assume the email is available if no pending invitations exist

      return { isAvailable: true, message: 'Email is available' };

    } catch (error) {
      console.error('Error checking email availability:', error);
      return { isAvailable: false, message: 'Error checking email availability' };
    }
  }

  /**
   * Generate secure invitation token
   */
  private generateInvitationToken(): string {
    // Generate a secure random token
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  /**
   * Email validation helper
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (email.includes('..') || email.startsWith('.') || email.endsWith('.') || 
        email.startsWith('@') || email.endsWith('@') || !email.includes('@')) {
      return false;
    }
    return emailRegex.test(email);
  }

  /**
   * Phone validation helper
   */
  private isValidPhone(phone: string): boolean {
    // Basic phone validation - accepts various formats
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
    return phoneRegex.test(cleanPhone);
  }

  /**
   * Get invitation by token
   */
  async getInvitationByToken(token: string): Promise<InstitutionInvitation | null> {
    try {
      const { data, error } = await this.supabase
        .from('institution_invitations')
        .select('*')
        .eq('token', token)
        .is('accepted_at', null)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        id: data.id,
        institutionId: data.institution_id,
        email: data.email,
        role: data.role,
        invitedBy: data.invited_by,
        token: data.token,
        expiresAt: new Date(data.expires_at),
        createdAt: new Date(data.created_at)
      };

    } catch (error) {
      console.error('Error fetching invitation by token:', error);
      return null;
    }
  }

  /**
   * Accept invitation and complete admin setup
   */
  async acceptInvitation(token: string, userId: string): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      const invitation = await this.getInvitationByToken(token);
      
      if (!invitation) {
        return {
          success: false,
          errors: [{ field: 'token', message: 'Invalid or expired invitation', code: 'INVALID_TOKEN' }]
        };
      }

      // Check if invitation is expired
      if (invitation.expiresAt < new Date()) {
        return {
          success: false,
          errors: [{ field: 'token', message: 'Invitation has expired', code: 'EXPIRED_TOKEN' }]
        };
      }

      // Mark invitation as accepted
      const { error } = await this.supabase
        .from('institution_invitations')
        .update({ 
          accepted_at: new Date().toISOString()
        })
        .eq('token', token);

      if (error) {
        console.error('Error accepting invitation:', error);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to accept invitation', code: 'DATABASE_ERROR' }]
        };
      }

      // In a real implementation, you would also:
      // 1. Create or update the user record with institution_admin role
      // 2. Associate the user with the institution
      // 3. Set up default permissions

      return { success: true };

    } catch (error) {
      console.error('Unexpected error accepting invitation:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }
}