/**
 * Role Verification Service
 * 
 * Handles email domain verification and manual verification processes
 * for role assignment validation.
 */

import { createClient } from '../supabase/server';
import {
  UserRole,
  VerificationMethod,
  VerificationResult,
  VerificationEvidence,
  InstitutionDomain
} from '../types/role-management';
import { NotificationService } from './notification-service';

export interface RoleVerificationConfig {
  domainVerificationEnabled: boolean;
  manualVerificationEnabled: boolean;
  verificationTimeoutDays: number;
  maxEvidenceFiles: number;
  allowedFileTypes: string[];
  maxFileSize: number; // bytes
}

export interface VerificationRequest {
  id: string;
  userId: string;
  institutionId: string;
  requestedRole: UserRole;
  verificationMethod: VerificationMethod;
  evidence?: VerificationEvidence[];
  status: 'pending' | 'approved' | 'denied' | 'expired';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  expiresAt: Date;
}

export class RoleVerificationService {
  private config: RoleVerificationConfig;

  constructor(config: RoleVerificationConfig) {
    this.config = config;
  }

  /**
   * Verify email domain against institution's verified domains
   */
  async verifyEmailDomain(
    email: string,
    institutionId: string
  ): Promise<boolean> {
    if (!this.config.domainVerificationEnabled) {
      return false;
    }

    // Extract domain from email
    const domain = this.extractDomain(email);
    if (!domain) {
      return false;
    }

    // Get institution's verified domains
    const institutionDomains = await this.getInstitutionDomains(institutionId);
    
    // Check if domain is verified for this institution
    return institutionDomains.some(
      institutionDomain => 
        institutionDomain.domain.toLowerCase() === domain.toLowerCase() && 
        institutionDomain.verified
    );
  }

  /**
   * Check if a role can be auto-approved for a domain
   */
  async canAutoApproveRole(
    email: string,
    institutionId: string,
    requestedRole: UserRole
  ): Promise<boolean> {
    const domain = this.extractDomain(email);
    if (!domain) {
      return false;
    }

    const institutionDomains = await this.getInstitutionDomains(institutionId);
    const matchingDomain = institutionDomains.find(
      institutionDomain => 
        institutionDomain.domain.toLowerCase() === domain.toLowerCase() && 
        institutionDomain.verified
    );

    return matchingDomain?.autoApproveRoles.includes(requestedRole) || false;
  }

  /**
   * Verify institutional affiliation through various methods
   */
  async verifyInstitutionalAffiliation(
    userId: string,
    institutionId: string,
    method: VerificationMethod = VerificationMethod.EMAIL_DOMAIN
  ): Promise<VerificationResult> {
    const user = await this.getUser(userId);
    if (!user) {
      return {
        verified: false,
        method,
        reason: 'User not found'
      };
    }

    switch (method) {
      case VerificationMethod.EMAIL_DOMAIN:
        return await this.verifyByEmailDomain(user.email, institutionId);
      
      case VerificationMethod.MANUAL_REVIEW:
        return await this.initiateManualVerification(userId, institutionId);
      
      case VerificationMethod.ADMIN_APPROVAL:
        return await this.initiateAdminApproval(userId, institutionId);
      
      default:
        return {
          verified: false,
          method,
          reason: 'Unknown verification method'
        };
    }
  }

  /**
   * Submit evidence for manual verification
   */
  async requestManualVerification(
    userId: string,
    institutionId: string,
    requestedRole: UserRole,
    evidence: VerificationEvidence[]
  ): Promise<VerificationRequest> {
    if (!this.config.manualVerificationEnabled) {
      throw new Error('Manual verification is not enabled');
    }

    // Validate evidence
    await this.validateEvidence(evidence);

    // Create verification request
    const verificationRequest: VerificationRequest = {
      id: this.generateId(),
      userId,
      institutionId,
      requestedRole,
      verificationMethod: VerificationMethod.MANUAL_REVIEW,
      evidence,
      status: 'pending',
      submittedAt: new Date(),
      expiresAt: new Date(Date.now() + (this.config.verificationTimeoutDays * 24 * 60 * 60 * 1000))
    };

    // Save verification request
    await this.saveVerificationRequest(verificationRequest);

    // Notify reviewers
    await this.notifyVerificationReviewers(verificationRequest);

    return verificationRequest;
  }

  /**
   * Process verification result from reviewer
   */
  async processVerificationResult(
    verificationId: string,
    approved: boolean,
    reviewerId: string,
    notes?: string
  ): Promise<VerificationResult> {
    const request = await this.getVerificationRequest(verificationId);
    if (!request) {
      throw new Error('Verification request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Verification request is not pending');
    }

    // Validate reviewer permissions
    await this.validateReviewerPermissions(reviewerId, request.institutionId);

    // Update request
    request.status = approved ? 'approved' : 'denied';
    request.reviewedAt = new Date();
    request.reviewedBy = reviewerId;
    request.reviewNotes = notes;

    await this.updateVerificationRequest(request);

    // Create result
    const result: VerificationResult = {
      verified: approved,
      method: request.verificationMethod,
      reason: notes,
      evidence: request.evidence,
      verifiedBy: reviewerId,
      verifiedAt: new Date()
    };

    // Notify user of result
    await this.notifyVerificationResult(request.userId, result);

    return result;
  }

  /**
   * Get pending verification requests for an institution
   */
  async getPendingVerifications(
    institutionId: string,
    reviewerId?: string
  ): Promise<VerificationRequest[]> {
    // Validate reviewer permissions if provided
    if (reviewerId) {
      await this.validateReviewerPermissions(reviewerId, institutionId);
    }

    return await this.getVerificationRequests({
      institutionId,
      status: 'pending'
    });
  }

  /**
   * Add or update institution domain configuration
   */
  async configureInstitutionDomain(
    institutionId: string,
    domain: string,
    autoApproveRoles: UserRole[],
    adminId: string
  ): Promise<InstitutionDomain> {
    // Validate admin permissions
    await this.validateInstitutionAdmin(adminId, institutionId);

    // Validate domain format
    if (!this.isValidDomain(domain)) {
      throw new Error('Invalid domain format');
    }

    // Check if domain already exists for another institution
    const existingDomain = await this.getDomainByName(domain);
    if (existingDomain && existingDomain.institutionId !== institutionId) {
      throw new Error('Domain is already configured for another institution');
    }

    const institutionDomain: InstitutionDomain = {
      id: existingDomain?.id || this.generateId(),
      institutionId,
      domain: domain.toLowerCase(),
      verified: false, // Requires separate verification process
      autoApproveRoles,
      createdAt: new Date()
    };

    await this.saveInstitutionDomain(institutionDomain);

    // Initiate domain verification process
    await this.initiateDomainVerification(institutionDomain);

    return institutionDomain;
  }

  /**
   * Verify domain ownership
   */
  async verifyDomainOwnership(
    domainId: string,
    verificationToken: string
  ): Promise<boolean> {
    const domain = await this.getInstitutionDomainById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    // Verify the token (implementation would check DNS records or file verification)
    const isValid = await this.validateDomainVerificationToken(domain.domain, verificationToken);
    
    if (isValid) {
      domain.verified = true;
      await this.updateInstitutionDomain(domain);
    }

    return isValid;
  }

  // Private helper methods

  private extractDomain(email: string): string | null {
    const match = email.match(/@([^@]+)$/);
    return match ? match[1] : null;
  }

  private async verifyByEmailDomain(
    email: string,
    institutionId: string
  ): Promise<VerificationResult> {
    const verified = await this.verifyEmailDomain(email, institutionId);
    
    return {
      verified,
      method: VerificationMethod.EMAIL_DOMAIN,
      reason: verified ? 'Email domain verified' : 'Email domain not verified for institution'
    };
  }

  private async initiateManualVerification(
    userId: string,
    institutionId: string
  ): Promise<VerificationResult> {
    return {
      verified: false,
      method: VerificationMethod.MANUAL_REVIEW,
      reason: 'Manual verification required - please submit supporting evidence'
    };
  }

  private async initiateAdminApproval(
    userId: string,
    institutionId: string
  ): Promise<VerificationResult> {
    return {
      verified: false,
      method: VerificationMethod.ADMIN_APPROVAL,
      reason: 'Admin approval required for this role'
    };
  }

  private async validateEvidence(evidence: VerificationEvidence[]): Promise<void> {
    if (evidence.length > this.config.maxEvidenceFiles) {
      throw new Error(`Too many evidence files. Maximum: ${this.config.maxEvidenceFiles}`);
    }

    for (const item of evidence) {
      if (item.fileUrl) {
        // Validate file type and size
        const fileInfo = await this.getFileInfo(item.fileUrl);
        
        if (!this.config.allowedFileTypes.includes(fileInfo.type)) {
          throw new Error(`File type not allowed: ${fileInfo.type}`);
        }
        
        if (fileInfo.size > this.config.maxFileSize) {
          throw new Error(`File too large: ${fileInfo.size} bytes`);
        }
      }
    }
  }

  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    return domainRegex.test(domain);
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  // Database integration methods
  private async getInstitutionDomains(institutionId: string): Promise<InstitutionDomain[]> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('institution_id', institutionId);

    if (error) {
      throw new Error(`Failed to get institution domains: ${error.message}`);
    }

    return data?.map(row => ({
      id: row.id,
      institutionId: row.institution_id,
      domain: row.domain,
      verified: row.verified,
      autoApproveRoles: row.auto_approve_roles || [],
      createdAt: new Date(row.created_at)
    })) || [];
  }

  private async getUser(userId: string): Promise<{ email: string } | null> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  private async saveVerificationRequest(request: VerificationRequest): Promise<void> {
    const supabase = createClient();
    
    // Save verification request
    const { error: requestError } = await supabase
      .from('verification_requests')
      .insert({
        id: request.id,
        user_id: request.userId,
        institution_id: request.institutionId,
        requested_role: request.requestedRole,
        verification_method: request.verificationMethod,
        status: request.status,
        justification: request.justification || '',
        submitted_at: request.submittedAt.toISOString(),
        expires_at: request.expiresAt.toISOString()
      });

    if (requestError) {
      throw new Error(`Failed to save verification request: ${requestError.message}`);
    }

    // Save evidence if provided
    if (request.evidence && request.evidence.length > 0) {
      const evidenceRows = request.evidence.map(evidence => ({
        verification_request_id: request.id,
        type: evidence.type,
        description: evidence.description,
        file_url: evidence.fileUrl,
        metadata: evidence.metadata
      }));

      const { error: evidenceError } = await supabase
        .from('verification_evidence')
        .insert(evidenceRows);

      if (evidenceError) {
        throw new Error(`Failed to save verification evidence: ${evidenceError.message}`);
      }
    }

    // Log status change
    await this.logVerificationStatusChange(request.id, 'pending', request.userId, 'Verification request submitted');
  }

  private async getVerificationRequest(id: string): Promise<VerificationRequest | null> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('verification_requests')
      .select(`
        *,
        verification_evidence (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      return null;
    }

    const evidence: VerificationEvidence[] = data.verification_evidence?.map((ev: any) => ({
      type: ev.type,
      description: ev.description,
      fileUrl: ev.file_url,
      metadata: ev.metadata || {}
    })) || [];

    return {
      id: data.id,
      userId: data.user_id,
      institutionId: data.institution_id,
      requestedRole: data.requested_role,
      verificationMethod: data.verification_method,
      evidence,
      status: data.status,
      submittedAt: new Date(data.submitted_at),
      reviewedAt: data.reviewed_at ? new Date(data.reviewed_at) : undefined,
      reviewedBy: data.reviewed_by,
      reviewNotes: data.review_notes,
      expiresAt: new Date(data.expires_at)
    };
  }

  private async updateVerificationRequest(request: VerificationRequest): Promise<void> {
    const supabase = createClient();
    
    const { error } = await supabase
      .from('verification_requests')
      .update({
        status: request.status,
        reviewed_at: request.reviewedAt?.toISOString(),
        reviewed_by: request.reviewedBy,
        review_notes: request.reviewNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', request.id);

    if (error) {
      throw new Error(`Failed to update verification request: ${error.message}`);
    }

    // Log status change
    await this.logVerificationStatusChange(
      request.id, 
      request.status, 
      request.reviewedBy || request.userId, 
      request.reviewNotes || `Status changed to ${request.status}`
    );
  }

  private async getVerificationRequests(filters: {
    institutionId?: string;
    status?: string;
    userId?: string;
  }): Promise<VerificationRequest[]> {
    const supabase = createClient();
    
    let query = supabase
      .from('verification_requests')
      .select(`
        *,
        verification_evidence (*),
        users!verification_requests_user_id_fkey (email, full_name)
      `);

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    const { data, error } = await query.order('submitted_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get verification requests: ${error.message}`);
    }

    return data?.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      institutionId: row.institution_id,
      requestedRole: row.requested_role,
      verificationMethod: row.verification_method,
      evidence: row.verification_evidence?.map((ev: any) => ({
        type: ev.type,
        description: ev.description,
        fileUrl: ev.file_url,
        metadata: ev.metadata || {}
      })) || [],
      status: row.status,
      submittedAt: new Date(row.submitted_at),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      reviewedBy: row.reviewed_by,
      reviewNotes: row.review_notes,
      expiresAt: new Date(row.expires_at)
    })) || [];
  }

  private async validateReviewerPermissions(reviewerId: string, institutionId: string): Promise<void> {
    const supabase = createClient();
    
    // Check if user is a verification reviewer for this institution
    const { data: reviewer } = await supabase
      .from('verification_reviewers')
      .select('*')
      .eq('user_id', reviewerId)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .single();

    if (!reviewer) {
      // Check if user is institution admin
      const { data: roleAssignment } = await supabase
        .from('user_role_assignments')
        .select('*')
        .eq('user_id', reviewerId)
        .eq('institution_id', institutionId)
        .in('role', ['institution_admin', 'system_admin'])
        .eq('status', 'active')
        .single();

      if (!roleAssignment) {
        throw new Error('User does not have permission to review verification requests');
      }
    }
  }

  private async validateInstitutionAdmin(adminId: string, institutionId: string): Promise<void> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('user_role_assignments')
      .select('*')
      .eq('user_id', adminId)
      .eq('institution_id', institutionId)
      .in('role', ['institution_admin', 'system_admin'])
      .eq('status', 'active')
      .single();

    if (error || !data) {
      throw new Error('User does not have admin permissions for this institution');
    }
  }

  private async getDomainByName(domain: string): Promise<InstitutionDomain | null> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .single();

    if (error) {
      return null;
    }

    return {
      id: data.id,
      institutionId: data.institution_id,
      domain: data.domain,
      verified: data.verified,
      autoApproveRoles: data.auto_approve_roles || [],
      createdAt: new Date(data.created_at)
    };
  }

  private async saveInstitutionDomain(domain: InstitutionDomain): Promise<void> {
    const supabase = createClient();
    
    const { error } = await supabase
      .from('institution_domains')
      .upsert({
        id: domain.id,
        institution_id: domain.institutionId,
        domain: domain.domain,
        verified: domain.verified,
        auto_approve_roles: domain.autoApproveRoles,
        verification_token: crypto.randomUUID()
      });

    if (error) {
      throw new Error(`Failed to save institution domain: ${error.message}`);
    }
  }

  private async getInstitutionDomainById(id: string): Promise<InstitutionDomain | null> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return null;
    }

    return {
      id: data.id,
      institutionId: data.institution_id,
      domain: data.domain,
      verified: data.verified,
      autoApproveRoles: data.auto_approve_roles || [],
      createdAt: new Date(data.created_at)
    };
  }

  private async updateInstitutionDomain(domain: InstitutionDomain): Promise<void> {
    const supabase = createClient();
    
    const { error } = await supabase
      .from('institution_domains')
      .update({
        verified: domain.verified,
        auto_approve_roles: domain.autoApproveRoles,
        verified_at: domain.verified ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', domain.id);

    if (error) {
      throw new Error(`Failed to update institution domain: ${error.message}`);
    }
  }

  private async initiateDomainVerification(domain: InstitutionDomain): Promise<void> {
    // Generate verification token and instructions
    const verificationToken = crypto.randomUUID();
    
    const supabase = createClient();
    await supabase
      .from('institution_domains')
      .update({
        verification_token: verificationToken,
        verification_method: 'dns'
      })
      .eq('id', domain.id);

    // In a real implementation, this would send instructions to the admin
    console.log(`Domain verification initiated for ${domain.domain}`);
    console.log(`Add TXT record: _kiro-verification.${domain.domain} = ${verificationToken}`);
  }

  private async validateDomainVerificationToken(domain: string, token: string): Promise<boolean> {
    // In a real implementation, this would check DNS TXT records
    // For now, we'll simulate the verification
    try {
      // Simulate DNS lookup
      const txtRecord = `_kiro-verification.${domain}`;
      console.log(`Checking DNS TXT record: ${txtRecord} for token: ${token}`);
      
      // For demo purposes, return true if token is valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(token);
    } catch (error) {
      console.error('Domain verification failed:', error);
      return false;
    }
  }

  private async getFileInfo(fileUrl: string): Promise<{ type: string; size: number }> {
    try {
      // In a real implementation, this would check file metadata from storage
      // For now, we'll extract info from URL or make a HEAD request
      const response = await fetch(fileUrl, { method: 'HEAD' });
      
      return {
        type: response.headers.get('content-type') || 'application/octet-stream',
        size: parseInt(response.headers.get('content-length') || '0', 10)
      };
    } catch (error) {
      // Fallback for demo
      return { type: 'application/pdf', size: 1024 };
    }
  }

  private async notifyVerificationReviewers(request: VerificationRequest): Promise<void> {
    const supabase = createClient();
    
    // Get reviewers for this institution
    const { data: reviewers } = await supabase
      .from('verification_reviewers')
      .select(`
        user_id,
        users!verification_reviewers_user_id_fkey (email, full_name)
      `)
      .eq('institution_id', request.institutionId)
      .eq('is_active', true);

    if (reviewers && reviewers.length > 0) {
      const notificationService = new NotificationService();
      
      for (const reviewer of reviewers) {
        await notificationService.sendNotification({
          userId: reviewer.user_id,
          type: 'verification_request',
          title: 'New Verification Request',
          message: `A new role verification request requires your review for ${request.requestedRole} role.`,
          data: {
            verificationRequestId: request.id,
            requestedRole: request.requestedRole,
            institutionId: request.institutionId
          }
        });
      }
    }
  }

  private async notifyVerificationResult(userId: string, result: VerificationResult): Promise<void> {
    const notificationService = new NotificationService();
    
    const status = result.verified ? 'approved' : 'denied';
    const title = result.verified ? 'Verification Approved' : 'Verification Denied';
    const message = result.verified 
      ? 'Your role verification has been approved. Your account access has been updated.'
      : `Your role verification was denied. Reason: ${result.reason}`;

    await notificationService.sendNotification({
      userId,
      type: 'verification_result',
      title,
      message,
      data: {
        verified: result.verified,
        method: result.method,
        reason: result.reason
      }
    });
  }

  private async logVerificationStatusChange(
    verificationRequestId: string,
    status: string,
    changedBy: string,
    reason: string
  ): Promise<void> {
    const supabase = createClient();
    
    await supabase
      .from('verification_status_log')
      .insert({
        verification_request_id: verificationRequestId,
        status,
        changed_by: changedBy,
        reason,
        timestamp: new Date().toISOString()
      });
  }
}