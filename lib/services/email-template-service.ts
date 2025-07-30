import { Institution, InstitutionInvitation } from '@/lib/types/institution';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
  category: 'welcome' | 'invitation' | 'notification' | 'approval' | 'reminder';
}

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

export interface TemplateVariables {
  [key: string]: any;
}

export class EmailTemplateService {
  private templates: Map<string, EmailTemplate> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * Initialize default email templates
   */
  private initializeDefaultTemplates(): void {
    // Institution Welcome Template
    this.templates.set('institution-welcome', {
      id: 'institution-welcome',
      name: 'Institution Welcome',
      subject: 'Welcome to {{institutionName}} - Complete Your Admin Setup',
      htmlContent: this.getInstitutionWelcomeHtml(),
      textContent: this.getInstitutionWelcomeText(),
      variables: ['institutionName', 'adminName', 'invitationUrl', 'institutionDomain', 'institutionType', 'primaryColor', 'accentColor'],
      category: 'welcome'
    });

    // Admin Invitation Template
    this.templates.set('admin-invitation', {
      id: 'admin-invitation',
      name: 'Administrator Invitation',
      subject: 'You\'ve been invited to administer {{institutionName}}',
      htmlContent: this.getAdminInvitationHtml(),
      textContent: this.getAdminInvitationText(),
      variables: ['institutionName', 'adminName', 'invitationUrl', 'inviterName', 'expirationDate'],
      category: 'invitation'
    });

    // User Invitation Template
    this.templates.set('user-invitation', {
      id: 'user-invitation',
      name: 'User Invitation',
      subject: 'Join {{institutionName}} - Your Account is Ready',
      htmlContent: this.getUserInvitationHtml(),
      textContent: this.getUserInvitationText(),
      variables: ['institutionName', 'userName', 'invitationUrl', 'role', 'departmentName', 'inviterName'],
      category: 'invitation'
    });

    // Approval Notification Template
    this.templates.set('approval-notification', {
      id: 'approval-notification',
      name: 'Institution Approval Notification',
      subject: 'Institution {{status}} - {{institutionName}}',
      htmlContent: this.getApprovalNotificationHtml(),
      textContent: this.getApprovalNotificationText(),
      variables: ['institutionName', 'status', 'adminName', 'notes', 'conditions', 'dashboardUrl'],
      category: 'approval'
    });

    // Password Reset Template
    this.templates.set('password-reset', {
      id: 'password-reset',
      name: 'Password Reset',
      subject: 'Reset Your Password - {{institutionName}}',
      htmlContent: this.getPasswordResetHtml(),
      textContent: this.getPasswordResetText(),
      variables: ['institutionName', 'userName', 'resetUrl', 'expirationTime'],
      category: 'notification'
    });

    // System Notification Template
    this.templates.set('system-notification', {
      id: 'system-notification',
      name: 'System Notification',
      subject: '{{notificationTitle}} - {{institutionName}}',
      htmlContent: this.getSystemNotificationHtml(),
      textContent: this.getSystemNotificationText(),
      variables: ['institutionName', 'notificationTitle', 'message', 'actionUrl', 'actionText'],
      category: 'notification'
    });
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): EmailTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * Get all templates by category
   */
  getTemplatesByCategory(category: EmailTemplate['category']): EmailTemplate[] {
    return Array.from(this.templates.values()).filter(template => template.category === category);
  }

  /**
   * Render template with variables
   */
  renderTemplate(templateId: string, variables: TemplateVariables): EmailData | null {
    const template = this.getTemplate(templateId);
    if (!template) {
      return null;
    }

    const subject = this.replaceVariables(template.subject, variables);
    const html = this.replaceVariables(template.htmlContent, variables);
    const text = this.replaceVariables(template.textContent, variables);

    return {
      to: variables.to || '',
      subject,
      html,
      text,
      from: variables.from,
      replyTo: variables.replyTo
    };
  }

  /**
   * Generate institution welcome email
   */
  generateInstitutionWelcomeEmail(
    institution: Institution,
    invitation: InstitutionInvitation,
    adminName: string,
    adminEmail: string
  ): EmailData | null {
    const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invitations/${invitation.token}`;
    
    const variables: TemplateVariables = {
      to: adminEmail,
      institutionName: institution.name,
      adminName,
      invitationUrl,
      institutionDomain: institution.domain,
      institutionType: institution.type,
      primaryColor: institution.branding?.primaryColor || '#1f2937',
      accentColor: institution.branding?.accentColor || '#3b82f6'
    };

    return this.renderTemplate('institution-welcome', variables);
  }

  /**
   * Generate admin invitation email
   */
  generateAdminInvitationEmail(
    institution: Institution,
    invitation: InstitutionInvitation,
    adminName: string,
    inviterName: string
  ): EmailData | null {
    const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invitations/${invitation.token}`;
    const expirationDate = invitation.expiresAt.toLocaleDateString();
    
    const variables: TemplateVariables = {
      to: invitation.email,
      institutionName: institution.name,
      adminName,
      invitationUrl,
      inviterName,
      expirationDate
    };

    return this.renderTemplate('admin-invitation', variables);
  }

  /**
   * Generate user invitation email
   */
  generateUserInvitationEmail(
    institutionName: string,
    userName: string,
    userEmail: string,
    role: string,
    departmentName: string,
    inviterName: string,
    invitationUrl: string
  ): EmailData | null {
    const variables: TemplateVariables = {
      to: userEmail,
      institutionName,
      userName,
      invitationUrl,
      role,
      departmentName,
      inviterName
    };

    return this.renderTemplate('user-invitation', variables);
  }

  /**
   * Generate approval notification email
   */
  generateApprovalNotificationEmail(
    institution: Institution,
    adminEmail: string,
    adminName: string,
    approved: boolean,
    notes?: string,
    conditions?: string[]
  ): EmailData | null {
    const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/institution_admin`;
    
    const variables: TemplateVariables = {
      to: adminEmail,
      institutionName: institution.name,
      status: approved ? 'Approved' : 'Rejected',
      adminName,
      notes: notes || '',
      conditions: conditions?.join(', ') || '',
      dashboardUrl
    };

    return this.renderTemplate('approval-notification', variables);
  }

  /**
   * Replace template variables with actual values
   */
  private replaceVariables(content: string, variables: TemplateVariables): string {
    let result = content;
    
    Object.keys(variables).forEach(key => {
      const placeholder = `{{${key}}}`;
      const value = variables[key]?.toString() || '';
      result = result.replace(new RegExp(placeholder, 'g'), value);
    });

    return result;
  }

  /**
   * Template HTML content methods
   */
  private getInstitutionWelcomeHtml(): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: {{primaryColor}}; margin-bottom: 10px;">Welcome to {{institutionName}}!</h1>
          <p style="color: #666; font-size: 16px;">Your institution is now ready to use</p>
        </div>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
          <p style="margin: 0 0 15px 0;">Dear {{adminName}},</p>
          
          <p style="margin: 0 0 15px 0;">
            Congratulations! Your institution <strong>{{institutionName}}</strong> has been successfully set up on our platform.
          </p>
          
          <p style="margin: 0 0 15px 0;">As the institution administrator, you have been granted full access to manage:</p>
          <ul style="margin: 0 0 15px 20px; padding: 0;">
            <li style="margin-bottom: 8px;">Institution settings and branding</li>
            <li style="margin-bottom: 8px;">Department creation and management</li>
            <li style="margin-bottom: 8px;">User invitations and role assignments</li>
            <li style="margin-bottom: 8px;">Analytics and reporting</li>
            <li style="margin-bottom: 8px;">Integration configurations</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{invitationUrl}}" 
             style="background-color: {{accentColor}}; 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    display: inline-block;
                    font-weight: bold;">
            Complete Admin Setup
          </a>
        </div>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #856404;">
            <strong>Important:</strong> This invitation link will expire in 7 days. If you need a new invitation, please contact support.
          </p>
        </div>
        
        <div style="border-top: 1px solid #e9ecef; padding-top: 20px; margin-top: 30px;">
          <h3 style="color: #495057; margin-bottom: 15px;">Institution Details:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Name:</td>
              <td style="padding: 8px 0; color: #6c757d;">{{institutionName}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Domain:</td>
              <td style="padding: 8px 0; color: #6c757d;">{{institutionDomain}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Type:</td>
              <td style="padding: 8px 0; color: #6c757d; text-transform: capitalize;">{{institutionType}}</td>
            </tr>
          </table>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0;">
            If you have any questions or need assistance, please don't hesitate to contact our support team.
          </p>
          <p style="color: #6c757d; margin: 10px 0 0 0;">
            Best regards,<br>The Platform Team
          </p>
        </div>
      </div>
    `;
  }

  private getInstitutionWelcomeText(): string {
    return `
Welcome to {{institutionName}}!

Dear {{adminName}},

Congratulations! Your institution {{institutionName}} has been successfully set up on our platform.

As the institution administrator, you have been granted full access to manage:
- Institution settings and branding
- Department creation and management
- User invitations and role assignments
- Analytics and reporting
- Integration configurations

To complete your account setup and access your admin dashboard, please visit:
{{invitationUrl}}

Important: This invitation link will expire in 7 days. If you need a new invitation, please contact support.

Institution Details:
- Name: {{institutionName}}
- Domain: {{institutionDomain}}
- Type: {{institutionType}}

If you have any questions or need assistance, please don't hesitate to contact our support team.

Best regards,
The Platform Team
    `;
  }

  private getAdminInvitationHtml(): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1f2937; margin-bottom: 10px;">Administrator Invitation</h1>
          <p style="color: #666; font-size: 16px;">You've been invited to administer {{institutionName}}</p>
        </div>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
          <p style="margin: 0 0 15px 0;">Hello {{adminName}},</p>
          
          <p style="margin: 0 0 15px 0;">
            {{inviterName}} has invited you to become an administrator for <strong>{{institutionName}}</strong>.
          </p>
          
          <p style="margin: 0 0 15px 0;">
            As an administrator, you'll be able to manage users, departments, settings, and more.
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{invitationUrl}}" 
             style="background-color: #3b82f6; 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    display: inline-block;
                    font-weight: bold;">
            Accept Invitation
          </a>
        </div>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #856404;">
            <strong>Note:</strong> This invitation expires on {{expirationDate}}.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0;">
            If you have any questions, please contact the person who invited you or our support team.
          </p>
        </div>
      </div>
    `;
  }

  private getAdminInvitationText(): string {
    return `
Administrator Invitation - {{institutionName}}

Hello {{adminName}},

{{inviterName}} has invited you to become an administrator for {{institutionName}}.

As an administrator, you'll be able to manage users, departments, settings, and more.

To accept this invitation, please visit:
{{invitationUrl}}

Note: This invitation expires on {{expirationDate}}.

If you have any questions, please contact the person who invited you or our support team.
    `;
  }

  private getUserInvitationHtml(): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1f2937; margin-bottom: 10px;">Welcome to {{institutionName}}!</h1>
          <p style="color: #666; font-size: 16px;">Your account is ready</p>
        </div>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
          <p style="margin: 0 0 15px 0;">Hello {{userName}},</p>
          
          <p style="margin: 0 0 15px 0;">
            {{inviterName}} has invited you to join <strong>{{institutionName}}</strong> as a {{role}}.
          </p>
          
          {{#if departmentName}}
          <p style="margin: 0 0 15px 0;">
            You'll be part of the <strong>{{departmentName}}</strong> department.
          </p>
          {{/if}}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{invitationUrl}}" 
             style="background-color: #10b981; 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    display: inline-block;
                    font-weight: bold;">
            Join {{institutionName}}
          </a>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0;">
            If you have any questions, please contact {{inviterName}} or our support team.
          </p>
        </div>
      </div>
    `;
  }

  private getUserInvitationText(): string {
    return `
Welcome to {{institutionName}}!

Hello {{userName}},

{{inviterName}} has invited you to join {{institutionName}} as a {{role}}.

{{#if departmentName}}
You'll be part of the {{departmentName}} department.
{{/if}}

To join and set up your account, please visit:
{{invitationUrl}}

If you have any questions, please contact {{inviterName}} or our support team.
    `;
  }

  private getApprovalNotificationHtml(): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1f2937; margin-bottom: 10px;">Institution {{status}}</h1>
          <p style="color: #666; font-size: 16px;">{{institutionName}}</p>
        </div>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
          <p style="margin: 0 0 15px 0;">Dear {{adminName}},</p>
          
          <p style="margin: 0 0 15px 0;">
            Your institution <strong>{{institutionName}}</strong> has been <strong>{{status}}</strong>.
          </p>
          
          {{#if notes}}
          <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 15px 0;">
            <p style="margin: 0; color: #1565c0;"><strong>Review Notes:</strong></p>
            <p style="margin: 10px 0 0 0; color: #1976d2;">{{notes}}</p>
          </div>
          {{/if}}
          
          {{#if conditions}}
          <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 15px 0;">
            <p style="margin: 0; color: #e65100;"><strong>Conditions:</strong></p>
            <p style="margin: 10px 0 0 0; color: #f57c00;">{{conditions}}</p>
          </div>
          {{/if}}
        </div>
        
        {{#if dashboardUrl}}
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{dashboardUrl}}" 
             style="background-color: #3b82f6; 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    display: inline-block;
                    font-weight: bold;">
            Access Dashboard
          </a>
        </div>
        {{/if}}
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0;">
            If you have any questions, please contact our support team.
          </p>
        </div>
      </div>
    `;
  }

  private getApprovalNotificationText(): string {
    return `
Institution {{status}} - {{institutionName}}

Dear {{adminName}},

Your institution {{institutionName}} has been {{status}}.

{{#if notes}}
Review Notes:
{{notes}}
{{/if}}

{{#if conditions}}
Conditions:
{{conditions}}
{{/if}}

{{#if dashboardUrl}}
Access your dashboard at: {{dashboardUrl}}
{{/if}}

If you have any questions, please contact our support team.
    `;
  }

  private getPasswordResetHtml(): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1f2937; margin-bottom: 10px;">Password Reset</h1>
          <p style="color: #666; font-size: 16px;">{{institutionName}}</p>
        </div>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
          <p style="margin: 0 0 15px 0;">Hello {{userName}},</p>
          
          <p style="margin: 0 0 15px 0;">
            We received a request to reset your password for your {{institutionName}} account.
          </p>
          
          <p style="margin: 0 0 15px 0;">
            Click the button below to reset your password:
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{resetUrl}}" 
             style="background-color: #dc2626; 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    display: inline-block;
                    font-weight: bold;">
            Reset Password
          </a>
        </div>
        
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #991b1b;">
            <strong>Security Note:</strong> This link will expire in {{expirationTime}}. If you didn't request this reset, please ignore this email.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0;">
            If you have any questions, please contact our support team.
          </p>
        </div>
      </div>
    `;
  }

  private getPasswordResetText(): string {
    return `
Password Reset - {{institutionName}}

Hello {{userName}},

We received a request to reset your password for your {{institutionName}} account.

To reset your password, please visit:
{{resetUrl}}

Security Note: This link will expire in {{expirationTime}}. If you didn't request this reset, please ignore this email.

If you have any questions, please contact our support team.
    `;
  }

  private getSystemNotificationHtml(): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1f2937; margin-bottom: 10px;">{{notificationTitle}}</h1>
          <p style="color: #666; font-size: 16px;">{{institutionName}}</p>
        </div>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
          <p style="margin: 0;">{{message}}</p>
        </div>
        
        {{#if actionUrl}}
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{actionUrl}}" 
             style="background-color: #3b82f6; 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    display: inline-block;
                    font-weight: bold;">
            {{actionText}}
          </a>
        </div>
        {{/if}}
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0;">
            This is an automated notification from {{institutionName}}.
          </p>
        </div>
      </div>
    `;
  }

  private getSystemNotificationText(): string {
    return `
{{notificationTitle}} - {{institutionName}}

{{message}}

{{#if actionUrl}}
{{actionText}}: {{actionUrl}}
{{/if}}

This is an automated notification from {{institutionName}}.
    `;
  }
}