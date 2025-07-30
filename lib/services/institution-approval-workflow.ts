import { createClient } from '@/lib/supabase/server';
import { InstitutionManager } from './institution-manager';
import { NotificationService } from './notification-service';
import {
  Institution,
  InstitutionStatus,
  ValidationError
} from '@/lib/types/institution';

export interface ApprovalRequest {
  id: string;
  institutionId: string;
  requestedBy: string;
  requestType: 'creation' | 'reactivation' | 'status_change';
  requestData: any;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface ApprovalDecision {
  approved: boolean;
  notes?: string;
  conditions?: string[];
}

export interface VerificationChecklist {
  domainVerified: boolean;
  contactVerified: boolean;
  documentsProvided: boolean;
  complianceChecked: boolean;
  securityReviewed: boolean;
}

export class InstitutionApprovalWorkflow {
  private supabase;
  private institutionManager: InstitutionManager;
  private notificationService: NotificationService;

  constructor() {
    this.supabase = createClient();
    this.institutionManager = new InstitutionManager();
    this.notificationService = new NotificationService();
  }

  /**
   * Submit institution for approval
   */
  async submitForApproval(
    institutionId: string,
    requestType: 'creation' | 'reactivation' | 'status_change',
    requestData: any,
    requestedBy: string
  ): Promise<{ success: boolean; requestId?: string; errors?: ValidationError[] }> {
    try {
      // Validate institution exists
      const institution = await this.institutionManager.getInstitutionById(institutionId);
      if (!institution) {
        return {
          success: false,
          errors: [{ field: 'institutionId', message: 'Institution not found', code: 'NOT_FOUND' }]
        };
      }

      // Check if there's already a pending request
      const existingRequest = await this.getPendingApprovalRequest(institutionId, requestType);
      if (existingRequest) {
        return {
          success: false,
          errors: [{ field: 'request', message: 'Approval request already pending', code: 'DUPLICATE_REQUEST' }]
        };
      }

      // Create approval request
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      
      const requestData_db = {
        institution_id: institutionId,
        requested_by: requestedBy,
        request_type: requestType,
        request_data: requestData,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('institution_approval_requests')
        .insert(requestData_db)
        .select()
        .single();

      if (error) {
        console.error('Error creating approval request:', error);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to create approval request', code: 'DATABASE_ERROR' }]
        };
      }

      // Notify system administrators
      await this.notifySystemAdmins(institution, requestType, data.id);

      // Update institution status if needed
      if (requestType === 'creation') {
        await this.institutionManager.updateInstitutionStatus(institutionId, 'pending');
      }

      return { success: true, requestId: data.id };

    } catch (error) {
      console.error('Unexpected error submitting for approval:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Get pending approval requests for system admin review
   */
  async getPendingApprovalRequests(filters: {
    requestType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ requests: ApprovalRequest[]; total: number }> {
    try {
      let query = this.supabase
        .from('institution_approval_requests')
        .select(`
          *,
          institutions (
            name,
            domain,
            type,
            contact_email
          )
        `, { count: 'exact' })
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (filters.requestType) {
        query = query.eq('request_type', filters.requestType);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 10)) - 1);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching approval requests:', error);
        return { requests: [], total: 0 };
      }

      const requests = (data || []).map(item => this.transformDatabaseToApprovalRequest(item));
      return { requests, total: count || 0 };

    } catch (error) {
      console.error('Unexpected error fetching approval requests:', error);
      return { requests: [], total: 0 };
    }
  }

  /**
   * Get approval request by ID
   */
  async getApprovalRequestById(requestId: string): Promise<ApprovalRequest | null> {
    try {
      const { data, error } = await this.supabase
        .from('institution_approval_requests')
        .select(`
          *,
          institutions (
            name,
            domain,
            type,
            contact_email,
            address,
            settings,
            branding
          )
        `)
        .eq('id', requestId)
        .single();

      if (error || !data) {
        return null;
      }

      return this.transformDatabaseToApprovalRequest(data);

    } catch (error) {
      console.error('Error fetching approval request:', error);
      return null;
    }
  }

  /**
   * Perform verification checks on institution
   */
  async performVerificationChecks(institutionId: string): Promise<VerificationChecklist> {
    try {
      const institution = await this.institutionManager.getInstitutionById(institutionId);
      if (!institution) {
        return {
          domainVerified: false,
          contactVerified: false,
          documentsProvided: false,
          complianceChecked: false,
          securityReviewed: false
        };
      }

      // Domain verification
      const domainVerified = await this.verifyDomain(institution.domain);
      
      // Contact verification
      const contactVerified = await this.verifyContact(institution.contactInfo.email || '');
      
      // Document verification (placeholder - would check for uploaded documents)
      const documentsProvided = await this.checkDocuments(institutionId);
      
      // Compliance check
      const complianceChecked = await this.checkCompliance(institution);
      
      // Security review
      const securityReviewed = await this.reviewSecurity(institution);

      return {
        domainVerified,
        contactVerified,
        documentsProvided,
        complianceChecked,
        securityReviewed
      };

    } catch (error) {
      console.error('Error performing verification checks:', error);
      return {
        domainVerified: false,
        contactVerified: false,
        documentsProvided: false,
        complianceChecked: false,
        securityReviewed: false
      };
    }
  }

  /**
   * Approve institution request
   */
  async approveRequest(
    requestId: string,
    reviewedBy: string,
    decision: ApprovalDecision
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      const request = await this.getApprovalRequestById(requestId);
      if (!request) {
        return {
          success: false,
          errors: [{ field: 'requestId', message: 'Approval request not found', code: 'NOT_FOUND' }]
        };
      }

      if (request.status !== 'pending') {
        return {
          success: false,
          errors: [{ field: 'status', message: 'Request is not pending', code: 'INVALID_STATUS' }]
        };
      }

      // Update approval request
      const { error: updateError } = await this.supabase
        .from('institution_approval_requests')
        .update({
          status: decision.approved ? 'approved' : 'rejected',
          reviewed_by: reviewedBy,
          reviewed_at: new Date().toISOString(),
          review_notes: decision.notes || null
        })
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating approval request:', updateError);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to update request', code: 'DATABASE_ERROR' }]
        };
      }

      if (decision.approved) {
        // Approve the institution
        await this.processApproval(request, decision);
      } else {
        // Handle rejection
        await this.processRejection(request, decision);
      }

      return { success: true };

    } catch (error) {
      console.error('Unexpected error approving request:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Process approval - activate institution and notify
   */
  private async processApproval(
    request: ApprovalRequest,
    decision: ApprovalDecision
  ): Promise<void> {
    try {
      // Update institution status based on request type
      switch (request.requestType) {
        case 'creation':
          await this.institutionManager.updateInstitutionStatus(request.institutionId, 'active');
          break;
        case 'reactivation':
          await this.institutionManager.updateInstitutionStatus(request.institutionId, 'active');
          break;
        case 'status_change':
          const targetStatus = request.requestData?.targetStatus as InstitutionStatus;
          if (targetStatus) {
            await this.institutionManager.updateInstitutionStatus(request.institutionId, targetStatus);
          }
          break;
      }

      // Get institution details for notification
      const institution = await this.institutionManager.getInstitutionById(request.institutionId);
      if (institution) {
        // Notify institution admin
        await this.notifyApprovalDecision(institution, true, decision.notes, decision.conditions);
        
        // Log approval
        await this.logApprovalDecision(request, true, decision);
      }

    } catch (error) {
      console.error('Error processing approval:', error);
    }
  }

  /**
   * Process rejection - notify and update status
   */
  private async processRejection(
    request: ApprovalRequest,
    decision: ApprovalDecision
  ): Promise<void> {
    try {
      // Get institution details for notification
      const institution = await this.institutionManager.getInstitutionById(request.institutionId);
      if (institution) {
        // Notify institution admin
        await this.notifyApprovalDecision(institution, false, decision.notes);
        
        // Update institution status if needed
        if (request.requestType === 'creation') {
          await this.institutionManager.updateInstitutionStatus(request.institutionId, 'suspended');
        }
        
        // Log rejection
        await this.logApprovalDecision(request, false, decision);
      }

    } catch (error) {
      console.error('Error processing rejection:', error);
    }
  }

  /**
   * Get pending approval request for institution and type
   */
  private async getPendingApprovalRequest(
    institutionId: string,
    requestType: string
  ): Promise<ApprovalRequest | null> {
    try {
      const { data, error } = await this.supabase
        .from('institution_approval_requests')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('request_type', requestType)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !data) {
        return null;
      }

      return this.transformDatabaseToApprovalRequest(data);

    } catch (error) {
      console.error('Error checking pending request:', error);
      return null;
    }
  }

  /**
   * Notify system administrators of new approval request
   */
  private async notifySystemAdmins(
    institution: Institution,
    requestType: string,
    requestId: string
  ): Promise<void> {
    try {
      // In a real implementation, this would send notifications to system admins
      console.log(`New ${requestType} approval request for ${institution.name}`, {
        institutionId: institution.id,
        requestId,
        domain: institution.domain
      });

      // Example notification logic:
      // await this.notificationService.sendSystemAdminNotification({
      //   type: 'approval_request',
      //   title: `New Institution ${requestType} Request`,
      //   message: `${institution.name} (${institution.domain}) requires approval`,
      //   data: { institutionId: institution.id, requestId }
      // });

    } catch (error) {
      console.error('Error notifying system admins:', error);
    }
  }

  /**
   * Notify institution of approval decision
   */
  private async notifyApprovalDecision(
    institution: Institution,
    approved: boolean,
    notes?: string,
    conditions?: string[]
  ): Promise<void> {
    try {
      const status = approved ? 'approved' : 'rejected';
      console.log(`Institution ${institution.name} has been ${status}`, {
        institutionId: institution.id,
        notes,
        conditions
      });

      // Example notification logic:
      // await this.notificationService.sendInstitutionNotification(institution.id, {
      //   type: 'approval_decision',
      //   title: `Institution ${approved ? 'Approved' : 'Rejected'}`,
      //   message: approved 
      //     ? 'Your institution has been approved and is now active'
      //     : 'Your institution request has been rejected',
      //   data: { approved, notes, conditions }
      // });

    } catch (error) {
      console.error('Error notifying approval decision:', error);
    }
  }

  /**
   * Log approval decision for audit purposes
   */
  private async logApprovalDecision(
    request: ApprovalRequest,
    approved: boolean,
    decision: ApprovalDecision
  ): Promise<void> {
    try {
      // In a real implementation, this would log to an audit table
      console.log(`Approval decision logged`, {
        requestId: request.id,
        institutionId: request.institutionId,
        approved,
        decision
      });

      // Example audit logging:
      // await this.supabase.from('approval_audit_log').insert({
      //   request_id: request.id,
      //   institution_id: request.institutionId,
      //   action: approved ? 'approved' : 'rejected',
      //   decision_data: decision,
      //   timestamp: new Date().toISOString()
      // });

    } catch (error) {
      console.error('Error logging approval decision:', error);
    }
  }

  /**
   * Verification helper methods
   */
  private async verifyDomain(domain: string): Promise<boolean> {
    try {
      // In a real implementation, this would perform DNS verification
      // For now, we'll do basic format validation
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
      return domainRegex.test(domain);
    } catch (error) {
      console.error('Error verifying domain:', error);
      return false;
    }
  }

  private async verifyContact(email: string): Promise<boolean> {
    try {
      // In a real implementation, this would send verification email
      // For now, we'll do basic email validation
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      return emailRegex.test(email);
    } catch (error) {
      console.error('Error verifying contact:', error);
      return false;
    }
  }

  private async checkDocuments(institutionId: string): Promise<boolean> {
    try {
      // In a real implementation, this would check for uploaded verification documents
      // For now, we'll return true as a placeholder
      return true;
    } catch (error) {
      console.error('Error checking documents:', error);
      return false;
    }
  }

  private async checkCompliance(institution: Institution): Promise<boolean> {
    try {
      // In a real implementation, this would check compliance requirements
      // based on institution type and location
      return institution.type !== 'other'; // Simple check for demo
    } catch (error) {
      console.error('Error checking compliance:', error);
      return false;
    }
  }

  private async reviewSecurity(institution: Institution): Promise<boolean> {
    try {
      // In a real implementation, this would perform security review
      // For now, we'll check if basic security settings are configured
      return institution.settings?.requireEmailVerification === true;
    } catch (error) {
      console.error('Error reviewing security:', error);
      return false;
    }
  }

  /**
   * Transform database result to ApprovalRequest type
   */
  private transformDatabaseToApprovalRequest(data: any): ApprovalRequest {
    return {
      id: data.id,
      institutionId: data.institution_id,
      requestedBy: data.requested_by,
      requestType: data.request_type,
      requestData: data.request_data,
      status: data.status,
      reviewedBy: data.reviewed_by,
      reviewedAt: data.reviewed_at ? new Date(data.reviewed_at) : undefined,
      reviewNotes: data.review_notes,
      expiresAt: new Date(data.expires_at),
      createdAt: new Date(data.created_at)
    };
  }

  /**
   * Clean up expired approval requests
   */
  async cleanupExpiredRequests(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('institution_approval_requests')
        .update({ status: 'expired' })
        .eq('status', 'pending')
        .lt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Error cleaning up expired requests:', error);
      }

    } catch (error) {
      console.error('Unexpected error cleaning up expired requests:', error);
    }
  }
}