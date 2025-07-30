import { createClient } from '@/lib/supabase/server';
import {
  ContentSharingPolicy,
  CollaborationSettings,
  ContentSharingRequest,
  ContentAttribution,
  PolicyViolation,
  ResourceType,
  SharingLevel,
  CollaborationPermission,
  PolicyConditions
} from '@/lib/types/content-sharing';

export class ContentSharingPolicyManager {
  private supabase = createClient();

  // Policy Management
  async createSharingPolicy(policy: Omit<ContentSharingPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContentSharingPolicy> {
    const { data, error } = await this.supabase
      .from('content_sharing_policies')
      .insert({
        institution_id: policy.institutionId,
        resource_type: policy.resourceType,
        sharing_level: policy.sharingLevel,
        conditions: policy.conditions,
        attribution_required: policy.attributionRequired,
        allow_cross_institution: policy.allowCrossInstitution,
        restricted_domains: policy.restrictedDomains,
        allowed_domains: policy.allowedDomains,
        created_by: policy.createdBy
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapPolicyFromDb(data);
  }

  async updateSharingPolicy(id: string, updates: Partial<ContentSharingPolicy>): Promise<ContentSharingPolicy> {
    const updateData: any = {};
    
    if (updates.resourceType) updateData.resource_type = updates.resourceType;
    if (updates.sharingLevel) updateData.sharing_level = updates.sharingLevel;
    if (updates.conditions) updateData.conditions = updates.conditions;
    if (updates.attributionRequired !== undefined) updateData.attribution_required = updates.attributionRequired;
    if (updates.allowCrossInstitution !== undefined) updateData.allow_cross_institution = updates.allowCrossInstitution;
    if (updates.restrictedDomains) updateData.restricted_domains = updates.restrictedDomains;
    if (updates.allowedDomains) updateData.allowed_domains = updates.allowedDomains;

    const { data, error } = await this.supabase
      .from('content_sharing_policies')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.mapPolicyFromDb(data);
  }

  async getSharingPolicy(id: string): Promise<ContentSharingPolicy | null> {
    const { data, error } = await this.supabase
      .from('content_sharing_policies')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return this.mapPolicyFromDb(data);
  }

  async getInstitutionPolicies(institutionId: string): Promise<ContentSharingPolicy[]> {
    const { data, error } = await this.supabase
      .from('content_sharing_policies')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data.map(this.mapPolicyFromDb);
  }

  async deleteSharingPolicy(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('content_sharing_policies')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Collaboration Settings Management
  async createCollaborationSettings(settings: Omit<CollaborationSettings, 'id' | 'createdAt' | 'updatedAt'>): Promise<CollaborationSettings> {
    const { data, error } = await this.supabase
      .from('collaboration_settings')
      .insert({
        institution_id: settings.institutionId,
        department_id: settings.departmentId,
        allow_cross_institution_collaboration: settings.allowCrossInstitutionCollaboration,
        allow_cross_department_collaboration: settings.allowCrossDepartmentCollaboration,
        default_permissions: settings.defaultPermissions,
        approval_required: settings.approvalRequired,
        approver_roles: settings.approverRoles,
        max_collaborators: settings.maxCollaborators,
        allow_external_collaborators: settings.allowExternalCollaborators,
        external_domain_whitelist: settings.externalDomainWhitelist
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapCollaborationSettingsFromDb(data);
  }

  async getCollaborationSettings(institutionId: string, departmentId?: string): Promise<CollaborationSettings | null> {
    let query = this.supabase
      .from('collaboration_settings')
      .select('*')
      .eq('institution_id', institutionId);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    } else {
      query = query.is('department_id', null);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return this.mapCollaborationSettingsFromDb(data);
  }

  async updateCollaborationSettings(id: string, updates: Partial<CollaborationSettings>): Promise<CollaborationSettings> {
    const updateData: any = {};
    
    if (updates.allowCrossInstitutionCollaboration !== undefined) {
      updateData.allow_cross_institution_collaboration = updates.allowCrossInstitutionCollaboration;
    }
    if (updates.allowCrossDepartmentCollaboration !== undefined) {
      updateData.allow_cross_department_collaboration = updates.allowCrossDepartmentCollaboration;
    }
    if (updates.defaultPermissions) updateData.default_permissions = updates.defaultPermissions;
    if (updates.approvalRequired !== undefined) updateData.approval_required = updates.approvalRequired;
    if (updates.approverRoles) updateData.approver_roles = updates.approverRoles;
    if (updates.maxCollaborators !== undefined) updateData.max_collaborators = updates.maxCollaborators;
    if (updates.allowExternalCollaborators !== undefined) updateData.allow_external_collaborators = updates.allowExternalCollaborators;
    if (updates.externalDomainWhitelist) updateData.external_domain_whitelist = updates.externalDomainWhitelist;

    const { data, error } = await this.supabase
      .from('collaboration_settings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.mapCollaborationSettingsFromDb(data);
  }

  // Policy Enforcement
  async checkSharingPermission(
    contentId: string,
    contentType: ResourceType,
    fromInstitutionId: string,
    toInstitutionId: string,
    requestedLevel: SharingLevel
  ): Promise<{ allowed: boolean; reason?: string; requiresApproval?: boolean }> {
    // Get applicable policies for the content type and institution
    const policies = await this.getApplicablePolicies(fromInstitutionId, contentType);
    
    if (policies.length === 0) {
      return { allowed: false, reason: 'No sharing policy defined for this content type' };
    }

    // Check each policy
    for (const policy of policies) {
      const result = this.evaluatePolicy(policy, fromInstitutionId, toInstitutionId, requestedLevel);
      if (result.allowed) {
        return result;
      }
    }

    return { allowed: false, reason: 'Content sharing not permitted by institution policies' };
  }

  async enforceAttributionRequirements(contentId: string, attribution: Omit<ContentAttribution, 'id' | 'createdAt'>): Promise<ContentAttribution> {
    const { data, error } = await this.supabase
      .from('content_attributions')
      .insert({
        content_id: attribution.contentId,
        original_author_id: attribution.originalAuthorId,
        original_institution_id: attribution.originalInstitutionId,
        original_department_id: attribution.originalDepartmentId,
        attribution_text: attribution.attributionText,
        license_type: attribution.licenseType
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapAttributionFromDb(data);
  }

  async reportPolicyViolation(violation: Omit<PolicyViolation, 'id' | 'createdAt'>): Promise<PolicyViolation> {
    const { data, error } = await this.supabase
      .from('policy_violations')
      .insert({
        content_id: violation.contentId,
        policy_id: violation.policyId,
        violation_type: violation.violationType,
        description: violation.description,
        reported_by: violation.reportedBy,
        status: violation.status
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapViolationFromDb(data);
  }

  // Helper methods
  private async getApplicablePolicies(institutionId: string, resourceType: ResourceType): Promise<ContentSharingPolicy[]> {
    const { data, error } = await this.supabase
      .from('content_sharing_policies')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('resource_type', resourceType);

    if (error) throw error;
    return data.map(this.mapPolicyFromDb);
  }

  private evaluatePolicy(
    policy: ContentSharingPolicy,
    fromInstitutionId: string,
    toInstitutionId: string,
    requestedLevel: SharingLevel
  ): { allowed: boolean; reason?: string; requiresApproval?: boolean } {
    // Check if cross-institution sharing is allowed
    if (fromInstitutionId !== toInstitutionId && !policy.allowCrossInstitution) {
      return { allowed: false, reason: 'Cross-institution sharing not permitted' };
    }

    // Check sharing level hierarchy
    const levelHierarchy: SharingLevel[] = ['private', 'department', 'institution', 'cross_institution', 'public'];
    const policyLevelIndex = levelHierarchy.indexOf(policy.sharingLevel);
    const requestedLevelIndex = levelHierarchy.indexOf(requestedLevel);

    if (requestedLevelIndex > policyLevelIndex) {
      return { allowed: false, reason: `Sharing level ${requestedLevel} exceeds policy limit of ${policy.sharingLevel}` };
    }

    // Check domain restrictions
    if (policy.restrictedDomains && policy.restrictedDomains.length > 0) {
      // This would need institution domain lookup - simplified for now
      return { allowed: true, requiresApproval: policy.conditions.requireApproval };
    }

    return { allowed: true, requiresApproval: policy.conditions.requireApproval };
  }

  // Database mapping methods
  private mapPolicyFromDb(data: any): ContentSharingPolicy {
    return {
      id: data.id,
      institutionId: data.institution_id,
      resourceType: data.resource_type,
      sharingLevel: data.sharing_level,
      conditions: data.conditions || {},
      attributionRequired: data.attribution_required || false,
      allowCrossInstitution: data.allow_cross_institution || false,
      restrictedDomains: data.restricted_domains,
      allowedDomains: data.allowed_domains,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      createdBy: data.created_by
    };
  }

  private mapCollaborationSettingsFromDb(data: any): CollaborationSettings {
    return {
      id: data.id,
      institutionId: data.institution_id,
      departmentId: data.department_id,
      allowCrossInstitutionCollaboration: data.allow_cross_institution_collaboration || false,
      allowCrossDepartmentCollaboration: data.allow_cross_department_collaboration || false,
      defaultPermissions: data.default_permissions || [],
      approvalRequired: data.approval_required || false,
      approverRoles: data.approver_roles || [],
      maxCollaborators: data.max_collaborators,
      allowExternalCollaborators: data.allow_external_collaborators || false,
      externalDomainWhitelist: data.external_domain_whitelist,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  private mapAttributionFromDb(data: any): ContentAttribution {
    return {
      id: data.id,
      contentId: data.content_id,
      originalAuthorId: data.original_author_id,
      originalInstitutionId: data.original_institution_id,
      originalDepartmentId: data.original_department_id,
      attributionText: data.attribution_text,
      licenseType: data.license_type,
      createdAt: new Date(data.created_at)
    };
  }

  private mapViolationFromDb(data: any): PolicyViolation {
    return {
      id: data.id,
      contentId: data.content_id,
      policyId: data.policy_id,
      violationType: data.violation_type,
      description: data.description,
      reportedBy: data.reported_by,
      status: data.status,
      resolvedBy: data.resolved_by,
      resolvedAt: data.resolved_at ? new Date(data.resolved_at) : undefined,
      createdAt: new Date(data.created_at)
    };
  }
}