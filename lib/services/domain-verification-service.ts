/**
 * Domain Verification Service
 * 
 * Handles email domain verification for institutional role assignments.
 * Provides auto-approval logic for verified domains and fallback to manual review.
 */

import { createClient } from '@/lib/supabase/server';
import { UserRole, InstitutionDomain } from '@/lib/types/role-management';

export interface DomainVerificationConfig {
  verificationTimeoutDays: number;
  maxDomainsPerInstitution: number;
  allowedTLDs: string[];
}

export interface DomainVerificationResult {
  verified: boolean;
  canAutoApprove: boolean;
  autoApproveRoles: UserRole[];
  reason?: string;
}

export interface DomainManagementRequest {
  institutionId: string;
  domain: string;
  autoApproveRoles: UserRole[];
  adminId: string;
}

export class DomainVerificationService {
  private config: DomainVerificationConfig;

  constructor(config?: Partial<DomainVerificationConfig>) {
    this.config = {
      verificationTimeoutDays: 30,
      maxDomainsPerInstitution: 10,
      allowedTLDs: ['edu', 'ac.uk', 'edu.au', 'ac.jp', 'org', 'com'],
      ...config
    };
  }

  /**
   * Verify if an email domain is approved for an institution
   */
  async verifyEmailDomain(
    email: string,
    institutionId: string
  ): Promise<DomainVerificationResult> {
    const domain = this.extractDomain(email);
    if (!domain) {
      return {
        verified: false,
        canAutoApprove: false,
        autoApproveRoles: [],
        reason: 'Invalid email format'
      };
    }

    const supabase = createClient();
    
    const { data: institutionDomain, error } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('domain', domain.toLowerCase())
      .eq('verified', true)
      .single();

    if (error || !institutionDomain) {
      return {
        verified: false,
        canAutoApprove: false,
        autoApproveRoles: [],
        reason: 'Domain not verified for this institution'
      };
    }

    return {
      verified: true,
      canAutoApprove: true,
      autoApproveRoles: institutionDomain.auto_approve_roles || [],
      reason: 'Domain verified and configured for auto-approval'
    };
  }

  /**
   * Check if a specific role can be auto-approved for an email domain
   */
  async canAutoApproveRole(
    email: string,
    institutionId: string,
    requestedRole: UserRole
  ): Promise<boolean> {
    const result = await this.verifyEmailDomain(email, institutionId);
    return result.canAutoApprove && result.autoApproveRoles.includes(requestedRole);
  }

  /**
   * Get all verified domains for an institution
   */
  async getInstitutionDomains(institutionId: string): Promise<InstitutionDomain[]> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('institution_id', institutionId)
      .order('domain');

    if (error) {
      throw new Error(`Failed to fetch institution domains: ${error.message}`);
    }

    return data.map(this.mapDatabaseToInstitutionDomain);
  }

  /**
   * Add a new domain for an institution
   */
  async addInstitutionDomain(request: DomainManagementRequest): Promise<InstitutionDomain> {
    // Validate admin permissions
    await this.validateInstitutionAdmin(request.adminId, request.institutionId);

    // Validate domain format
    if (!this.isValidDomain(request.domain)) {
      throw new Error('Invalid domain format');
    }

    // Check domain count limit
    const existingDomains = await this.getInstitutionDomains(request.institutionId);
    if (existingDomains.length >= this.config.maxDomainsPerInstitution) {
      throw new Error(`Maximum ${this.config.maxDomainsPerInstitution} domains allowed per institution`);
    }

    // Check if domain already exists for any institution
    const existingDomain = await this.getDomainByName(request.domain);
    if (existingDomain) {
      throw new Error('Domain is already configured for another institution');
    }

    // Validate auto-approve roles
    this.validateAutoApproveRoles(request.autoApproveRoles);

    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('institution_domains')
      .insert({
        institution_id: request.institutionId,
        domain: request.domain.toLowerCase(),
        auto_approve_roles: request.autoApproveRoles,
        verified: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add domain: ${error.message}`);
    }

    const institutionDomain = this.mapDatabaseToInstitutionDomain(data);

    // Initiate domain verification process
    await this.initiateDomainVerification(institutionDomain);

    return institutionDomain;
  }

  /**
   * Update domain configuration
   */
  async updateInstitutionDomain(
    domainId: string,
    autoApproveRoles: UserRole[],
    adminId: string
  ): Promise<InstitutionDomain> {
    const supabase = createClient();
    
    // Get existing domain
    const { data: existingDomain, error: fetchError } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('id', domainId)
      .single();

    if (fetchError || !existingDomain) {
      throw new Error('Domain not found');
    }

    // Validate admin permissions
    await this.validateInstitutionAdmin(adminId, existingDomain.institution_id);

    // Validate auto-approve roles
    this.validateAutoApproveRoles(autoApproveRoles);

    const { data, error } = await supabase
      .from('institution_domains')
      .update({
        auto_approve_roles: autoApproveRoles,
        updated_at: new Date().toISOString()
      })
      .eq('id', domainId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update domain: ${error.message}`);
    }

    return this.mapDatabaseToInstitutionDomain(data);
  }

  /**
   * Remove a domain from an institution
   */
  async removeInstitutionDomain(domainId: string, adminId: string): Promise<void> {
    const supabase = createClient();
    
    // Get existing domain
    const { data: existingDomain, error: fetchError } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('id', domainId)
      .single();

    if (fetchError || !existingDomain) {
      throw new Error('Domain not found');
    }

    // Validate admin permissions
    await this.validateInstitutionAdmin(adminId, existingDomain.institution_id);

    const { error } = await supabase
      .from('institution_domains')
      .delete()
      .eq('id', domainId);

    if (error) {
      throw new Error(`Failed to remove domain: ${error.message}`);
    }
  }

  /**
   * Verify domain ownership (simplified implementation)
   */
  async verifyDomainOwnership(
    domainId: string,
    verificationMethod: 'dns' | 'file' | 'manual',
    verificationData: string,
    verifierId: string
  ): Promise<boolean> {
    const supabase = createClient();
    
    // Get domain
    const { data: domain, error: fetchError } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('id', domainId)
      .single();

    if (fetchError || !domain) {
      throw new Error('Domain not found');
    }

    // Validate verifier permissions
    await this.validateInstitutionAdmin(verifierId, domain.institution_id);

    let verified = false;

    switch (verificationMethod) {
      case 'dns':
        verified = await this.verifyDNSRecord(domain.domain, verificationData);
        break;
      case 'file':
        verified = await this.verifyFileUpload(domain.domain, verificationData);
        break;
      case 'manual':
        // Manual verification - admin decision
        verified = verificationData === 'approved';
        break;
    }

    if (verified) {
      const { error } = await supabase
        .from('institution_domains')
        .update({
          verified: true,
          verified_at: new Date().toISOString(),
          verified_by: verifierId,
          verification_method: verificationMethod,
          updated_at: new Date().toISOString()
        })
        .eq('id', domainId);

      if (error) {
        throw new Error(`Failed to update domain verification: ${error.message}`);
      }
    }

    return verified;
  }

  // Private helper methods

  private extractDomain(email: string): string | null {
    const match = email.match(/@([^@]+)$/);
    return match ? match[1] : null;
  }

  private isValidDomain(domain: string): boolean {
    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    if (!domainRegex.test(domain)) {
      return false;
    }

    // Check if TLD is in allowed list
    const tld = domain.split('.').pop()?.toLowerCase();
    return tld ? this.config.allowedTLDs.includes(tld) : false;
  }

  private validateAutoApproveRoles(roles: UserRole[]): void {
    const allowedRoles = [UserRole.STUDENT, UserRole.TEACHER];
    const invalidRoles = roles.filter(role => !allowedRoles.includes(role));
    
    if (invalidRoles.length > 0) {
      throw new Error(`Invalid roles for auto-approval: ${invalidRoles.join(', ')}`);
    }
  }

  private async validateInstitutionAdmin(adminId: string, institutionId: string): Promise<void> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('user_role_assignments')
      .select('role')
      .eq('user_id', adminId)
      .eq('institution_id', institutionId)
      .eq('status', 'active')
      .in('role', ['institution_admin', 'system_admin']);

    if (error || !data || data.length === 0) {
      throw new Error('Insufficient permissions to manage institution domains');
    }
  }

  private async getDomainByName(domain: string): Promise<InstitutionDomain | null> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDatabaseToInstitutionDomain(data);
  }

  private mapDatabaseToInstitutionDomain(data: any): InstitutionDomain {
    return {
      id: data.id,
      institutionId: data.institution_id,
      domain: data.domain,
      verified: data.verified,
      autoApproveRoles: data.auto_approve_roles || [],
      createdAt: new Date(data.created_at)
    };
  }

  private async initiateDomainVerification(domain: InstitutionDomain): Promise<void> {
    // In a real implementation, this would:
    // 1. Generate verification token
    // 2. Send instructions to admin
    // 3. Set up monitoring for verification
    console.log(`Domain verification initiated for: ${domain.domain}`);
  }

  private async verifyDNSRecord(domain: string, expectedValue: string): Promise<boolean> {
    // In a real implementation, this would check DNS TXT records
    // For now, return true if expectedValue matches a pattern
    return expectedValue.startsWith('domain-verification=');
  }

  private async verifyFileUpload(domain: string, filePath: string): Promise<boolean> {
    // In a real implementation, this would check for a verification file
    // at https://domain/.well-known/domain-verification.txt
    return filePath.includes('domain-verification.txt');
  }
}