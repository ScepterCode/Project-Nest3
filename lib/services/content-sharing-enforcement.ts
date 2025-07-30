import { ContentSharingPolicyManager } from './content-sharing-policy-manager';
import { 
  ResourceType, 
  SharingLevel, 
  CollaborationPermission,
  ContentSharingRequest,
  PolicyViolation 
} from '@/lib/types/content-sharing';
import { createClient } from '@/lib/supabase/server';

export interface SharingContext {
  contentId: string;
  contentType: ResourceType;
  ownerId: string;
  ownerInstitutionId: string;
  ownerDepartmentId?: string;
  requesterId: string;
  requesterInstitutionId: string;
  requesterDepartmentId?: string;
  requestedPermissions: CollaborationPermission[];
  targetSharingLevel: SharingLevel;
}

export interface EnforcementResult {
  allowed: boolean;
  requiresApproval: boolean;
  requiresAttribution: boolean;
  reason?: string;
  violations?: string[];
  approvalWorkflowId?: string;
}

export class ContentSharingEnforcement {
  private policyManager: ContentSharingPolicyManager;
  private supabase = createClient();

  constructor() {
    this.policyManager = new ContentSharingPolicyManager();
  }

  /**
   * Main enforcement method - checks if sharing is allowed based on policies
   */
  async enforceSharing(context: SharingContext): Promise<EnforcementResult> {
    try {
      // Step 1: Check basic sharing permission
      const sharingCheck = await this.policyManager.checkSharingPermission(
        context.contentId,
        context.contentType,
        context.ownerInstitutionId,
        context.requesterInstitutionId,
        context.targetSharingLevel
      );

      if (!sharingCheck.allowed) {
        return {
          allowed: false,
          requiresApproval: false,
          requiresAttribution: false,
          reason: sharingCheck.reason
        };
      }

      // Step 2: Check collaboration settings
      const collaborationCheck = await this.checkCollaborationPermissions(context);
      
      if (!collaborationCheck.allowed) {
        return {
          allowed: false,
          requiresApproval: false,
          requiresAttribution: false,
          reason: collaborationCheck.reason
        };
      }

      // Step 3: Check for policy violations
      const violations = await this.detectPolicyViolations(context);
      
      if (violations.length > 0) {
        // Log violations but may still allow with restrictions
        await this.logViolations(context, violations);
      }

      // Step 4: Determine requirements
      const policies = await this.policyManager.getInstitutionPolicies(context.ownerInstitutionId);
      const applicablePolicy = policies.find(p => p.resourceType === context.contentType);
      
      const requiresApproval = sharingCheck.requiresApproval || collaborationCheck.requiresApproval;
      const requiresAttribution = applicablePolicy?.attributionRequired || false;

      // Step 5: Create approval workflow if needed
      let approvalWorkflowId: string | undefined;
      if (requiresApproval) {
        approvalWorkflowId = await this.createApprovalWorkflow(context);
      }

      return {
        allowed: true,
        requiresApproval,
        requiresAttribution,
        violations: violations.length > 0 ? violations : undefined,
        approvalWorkflowId
      };

    } catch (error) {
      console.error('Error in content sharing enforcement:', error);
      return {
        allowed: false,
        requiresApproval: false,
        requiresAttribution: false,
        reason: 'System error during policy enforcement'
      };
    }
  }

  /**
   * Check collaboration-specific permissions
   */
  private async checkCollaborationPermissions(context: SharingContext): Promise<{
    allowed: boolean;
    requiresApproval: boolean;
    reason?: string;
  }> {
    // Get collaboration settings for the owner's institution/department
    const settings = await this.policyManager.getCollaborationSettings(
      context.ownerInstitutionId,
      context.ownerDepartmentId
    );

    if (!settings) {
      return { allowed: true, requiresApproval: false };
    }

    // Check cross-institution collaboration
    if (context.ownerInstitutionId !== context.requesterInstitutionId) {
      if (!settings.allowCrossInstitutionCollaboration) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: 'Cross-institution collaboration not permitted'
        };
      }
    }

    // Check cross-department collaboration
    if (context.ownerDepartmentId !== context.requesterDepartmentId && 
        context.ownerInstitutionId === context.requesterInstitutionId) {
      if (!settings.allowCrossDepartmentCollaboration) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: 'Cross-department collaboration not permitted'
        };
      }
    }

    // Check if requested permissions are allowed
    const hasDisallowedPermissions = context.requestedPermissions.some(
      permission => !settings.defaultPermissions.includes(permission)
    );

    if (hasDisallowedPermissions && !settings.approvalRequired) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: 'Requested permissions exceed default allowed permissions'
      };
    }

    // Check external collaborators
    if (context.ownerInstitutionId !== context.requesterInstitutionId) {
      if (!settings.allowExternalCollaborators) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: 'External collaborators not permitted'
        };
      }

      // Check domain whitelist if configured
      if (settings.externalDomainWhitelist && settings.externalDomainWhitelist.length > 0) {
        const requesterDomain = await this.getInstitutionDomain(context.requesterInstitutionId);
        if (requesterDomain && !settings.externalDomainWhitelist.includes(requesterDomain)) {
          return {
            allowed: false,
            requiresApproval: false,
            reason: 'Requester institution domain not in whitelist'
          };
        }
      }
    }

    return {
      allowed: true,
      requiresApproval: settings.approvalRequired || hasDisallowedPermissions
    };
  }

  /**
   * Detect potential policy violations
   */
  private async detectPolicyViolations(context: SharingContext): Promise<string[]> {
    const violations: string[] = [];

    // Check for suspicious sharing patterns
    const recentSharing = await this.getRecentSharingActivity(context.ownerId);
    if (recentSharing.length > 10) { // Threshold for suspicious activity
      violations.push('Unusually high sharing activity detected');
    }

    // Check for domain restrictions
    const policies = await this.policyManager.getInstitutionPolicies(context.ownerInstitutionId);
    const applicablePolicy = policies.find(p => p.resourceType === context.contentType);
    
    if (applicablePolicy?.restrictedDomains) {
      const requesterDomain = await this.getInstitutionDomain(context.requesterInstitutionId);
      if (requesterDomain && applicablePolicy.restrictedDomains.includes(requesterDomain)) {
        violations.push('Sharing to restricted domain');
      }
    }

    // Check for permission escalation
    if (context.requestedPermissions.includes('admin') && 
        !context.requestedPermissions.includes('edit')) {
      violations.push('Potential permission escalation detected');
    }

    return violations;
  }

  /**
   * Create approval workflow for sharing requests
   */
  private async createApprovalWorkflow(context: SharingContext): Promise<string> {
    const { data, error } = await this.supabase
      .from('content_sharing_requests')
      .insert({
        content_id: context.contentId,
        content_type: context.contentType,
        requester_id: context.requesterId,
        target_institution_id: context.requesterInstitutionId,
        target_department_id: context.requesterDepartmentId,
        requested_permissions: context.requestedPermissions,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // Notify approvers
    await this.notifyApprovers(context, data.id);

    return data.id;
  }

  /**
   * Process approval workflow decisions
   */
  async processApproval(requestId: string, approved: boolean, approverId: string, reason?: string): Promise<void> {
    const { data: request, error: fetchError } = await this.supabase
      .from('content_sharing_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError) throw fetchError;

    const status = approved ? 'approved' : 'denied';
    
    const { error: updateError } = await this.supabase
      .from('content_sharing_requests')
      .update({
        status,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        denial_reason: reason
      })
      .eq('id', requestId);

    if (updateError) throw updateError;

    // Notify requester of decision
    await this.notifyRequester(request, approved, reason);

    // If approved, grant the permissions
    if (approved) {
      await this.grantSharingPermissions(request);
    }
  }

  /**
   * Enforce attribution requirements
   */
  async enforceAttribution(contentId: string, originalAuthorId: string, originalInstitutionId: string): Promise<void> {
    // Get institution and author information
    const [authorInfo, institutionInfo] = await Promise.all([
      this.getUserInfo(originalAuthorId),
      this.getInstitutionInfo(originalInstitutionId)
    ]);

    const attributionText = `Original content by ${authorInfo.name} from ${institutionInfo.name}`;

    await this.policyManager.enforceAttributionRequirements(contentId, {
      contentId,
      originalAuthorId,
      originalInstitutionId,
      attributionText
    });
  }

  /**
   * Monitor and report policy violations
   */
  async reportViolation(
    contentId: string,
    policyId: string,
    violationType: PolicyViolation['violationType'],
    description: string,
    reportedBy?: string
  ): Promise<void> {
    await this.policyManager.reportPolicyViolation({
      contentId,
      policyId,
      violationType,
      description,
      reportedBy,
      status: 'reported'
    });

    // Notify administrators
    await this.notifyAdministrators(contentId, violationType, description);
  }

  /**
   * Update permissions when policies change
   */
  async updatePermissionsForPolicyChange(institutionId: string, policyId: string): Promise<void> {
    // Get all content affected by this policy
    const { data: affectedContent, error } = await this.supabase
      .from('content_sharing_permissions')
      .select('*')
      .eq('policy_id', policyId);

    if (error) throw error;

    // Re-evaluate permissions for each piece of content
    for (const permission of affectedContent) {
      await this.reevaluateContentPermissions(permission.content_id);
    }

    // Notify affected users
    await this.notifyUsersOfPolicyChange(institutionId, policyId);
  }

  // Helper methods
  private async getRecentSharingActivity(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('content_sharing_requests')
      .select('*')
      .eq('requester_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;
    return data || [];
  }

  private async getInstitutionDomain(institutionId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('institutions')
      .select('domain')
      .eq('id', institutionId)
      .single();

    if (error) return null;
    return data?.domain || null;
  }

  private async getUserInfo(userId: string): Promise<{ name: string; email: string }> {
    const { data, error } = await this.supabase
      .from('users')
      .select('name, email')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  private async getInstitutionInfo(institutionId: string): Promise<{ name: string; domain: string }> {
    const { data, error } = await this.supabase
      .from('institutions')
      .select('name, domain')
      .eq('id', institutionId)
      .single();

    if (error) throw error;
    return data;
  }

  private async logViolations(context: SharingContext, violations: string[]): Promise<void> {
    for (const violation of violations) {
      console.warn(`Policy violation detected: ${violation}`, {
        contentId: context.contentId,
        ownerId: context.ownerId,
        requesterId: context.requesterId
      });
    }
  }

  private async notifyApprovers(context: SharingContext, requestId: string): Promise<void> {
    // Implementation would send notifications to appropriate approvers
    console.log(`Notifying approvers for sharing request ${requestId}`);
  }

  private async notifyRequester(request: any, approved: boolean, reason?: string): Promise<void> {
    // Implementation would send notification to the requester
    console.log(`Notifying requester of ${approved ? 'approval' : 'denial'}`, { request, reason });
  }

  private async grantSharingPermissions(request: any): Promise<void> {
    // Implementation would grant the actual sharing permissions
    console.log('Granting sharing permissions', request);
  }

  private async notifyAdministrators(contentId: string, violationType: string, description: string): Promise<void> {
    // Implementation would notify administrators of policy violations
    console.log('Notifying administrators of policy violation', { contentId, violationType, description });
  }

  private async reevaluateContentPermissions(contentId: string): Promise<void> {
    // Implementation would re-evaluate and update permissions for content
    console.log('Re-evaluating permissions for content', contentId);
  }

  private async notifyUsersOfPolicyChange(institutionId: string, policyId: string): Promise<void> {
    // Implementation would notify users affected by policy changes
    console.log('Notifying users of policy change', { institutionId, policyId });
  }
}