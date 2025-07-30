import { createClient } from '@/lib/supabase/server';
import {
  Institution,
  InstitutionCreationData,
  InstitutionFilters,
  ValidationResult,
  ValidationError,
  InstitutionType,
  InstitutionStatus,
  BrandingConfig,
  InstitutionSettings,
  SubscriptionInfo
} from '@/lib/types/institution';

export class InstitutionManager {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Create a new institution with validation
   */
  async createInstitution(data: InstitutionCreationData, createdBy: string): Promise<{ success: boolean; institution?: Institution; errors?: ValidationError[] }> {
    try {
      // Validate input data
      const validation = this.validateInstitutionData(data);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check domain uniqueness
      const domainCheck = await this.checkDomainUniqueness(data.domain, data.subdomain);
      if (!domainCheck.isUnique) {
        return { 
          success: false, 
          errors: [{ field: 'domain', message: domainCheck.message, code: 'DOMAIN_CONFLICT' }] 
        };
      }

      // Prepare institution data with defaults
      const institutionData = this.prepareInstitutionData(data, createdBy);

      // Insert institution
      const { data: institution, error } = await this.supabase
        .from('institutions')
        .insert(institutionData)
        .select()
        .single();

      if (error) {
        console.error('Error creating institution:', error);
        return { 
          success: false, 
          errors: [{ field: 'general', message: 'Failed to create institution', code: 'DATABASE_ERROR' }] 
        };
      }

      // Transform database result to Institution type
      const transformedInstitution = this.transformDatabaseToInstitution(institution);

      return { success: true, institution: transformedInstitution };
    } catch (error) {
      console.error('Unexpected error creating institution:', error);
      return { 
        success: false, 
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }] 
      };
    }
  }

  /**
   * Get institution by ID
   */
  async getInstitutionById(id: string): Promise<Institution | null> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return null;
      }

      return this.transformDatabaseToInstitution(data);
    } catch (error) {
      console.error('Error fetching institution:', error);
      return null;
    }
  }

  /**
   * Get institution by domain
   */
  async getInstitutionByDomain(domain: string): Promise<Institution | null> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('*')
        .eq('domain', domain)
        .single();

      if (error || !data) {
        return null;
      }

      return this.transformDatabaseToInstitution(data);
    } catch (error) {
      console.error('Error fetching institution by domain:', error);
      return null;
    }
  }

  /**
   * Update institution
   */
  async updateInstitution(id: string, updates: Partial<InstitutionCreationData>): Promise<{ success: boolean; institution?: Institution; errors?: ValidationError[] }> {
    try {
      // Validate updates
      if (updates.domain || updates.subdomain) {
        const domainCheck = await this.checkDomainUniqueness(
          updates.domain || '', 
          updates.subdomain,
          id
        );
        if (!domainCheck.isUnique) {
          return { 
            success: false, 
            errors: [{ field: 'domain', message: domainCheck.message, code: 'DOMAIN_CONFLICT' }] 
          };
        }
      }

      // Prepare update data
      const updateData = this.prepareUpdateData(updates);

      const { data, error } = await this.supabase
        .from('institutions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating institution:', error);
        return { 
          success: false, 
          errors: [{ field: 'general', message: 'Failed to update institution', code: 'DATABASE_ERROR' }] 
        };
      }

      const transformedInstitution = this.transformDatabaseToInstitution(data);
      return { success: true, institution: transformedInstitution };
    } catch (error) {
      console.error('Unexpected error updating institution:', error);
      return { 
        success: false, 
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }] 
      };
    }
  }

  /**
   * Update institution status with validation and lifecycle management
   */
  async updateInstitutionStatus(id: string, status: InstitutionStatus, reason?: string): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Get current institution to validate status transition
      const currentInstitution = await this.getInstitutionById(id);
      if (!currentInstitution) {
        return {
          success: false,
          errors: [{ field: 'id', message: 'Institution not found', code: 'NOT_FOUND' }]
        };
      }

      // Validate status transition
      const transitionValidation = this.validateStatusTransition(currentInstitution.status, status);
      if (!transitionValidation.isValid) {
        return {
          success: false,
          errors: transitionValidation.errors
        };
      }

      // Perform pre-transition actions
      const preTransitionResult = await this.performPreTransitionActions(currentInstitution, status);
      if (!preTransitionResult.success) {
        return preTransitionResult;
      }

      // Update status
      const { error } = await this.supabase
        .from('institutions')
        .update({ 
          status, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) {
        console.error('Error updating institution status:', error);
        return { 
          success: false, 
          errors: [{ field: 'status', message: 'Failed to update status', code: 'DATABASE_ERROR' }] 
        };
      }

      // Perform post-transition actions
      await this.performPostTransitionActions(currentInstitution, status, reason);

      return { success: true };
    } catch (error) {
      console.error('Unexpected error updating institution status:', error);
      return { 
        success: false, 
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }] 
      };
    }
  }

  /**
   * Suspend institution (sets status to suspended)
   */
  async suspendInstitution(id: string, reason: string): Promise<{ success: boolean; errors?: ValidationError[] }> {
    return this.updateInstitutionStatus(id, 'suspended', reason);
  }

  /**
   * Reactivate institution (sets status to active)
   */
  async reactivateInstitution(id: string): Promise<{ success: boolean; errors?: ValidationError[] }> {
    return this.updateInstitutionStatus(id, 'active');
  }

  /**
   * Archive institution (sets status to inactive with data preservation)
   */
  async archiveInstitution(id: string): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Check if institution can be archived
      const canArchive = await this.canArchiveInstitution(id);
      if (!canArchive.canArchive) {
        return {
          success: false,
          errors: [{ field: 'general', message: canArchive.reason, code: 'ARCHIVE_RESTRICTED' }]
        };
      }

      // Archive all departments first
      await this.archiveInstitutionDepartments(id);

      // Set institution status to inactive
      return this.updateInstitutionStatus(id, 'inactive', 'Archived by admin');

    } catch (error) {
      console.error('Unexpected error archiving institution:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Delete institution (soft delete by setting status to inactive)
   */
  async deleteInstitution(id: string): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Check if institution has active users or departments
      const canDelete = await this.canDeleteInstitution(id);
      if (!canDelete.canDelete) {
        return { 
          success: false, 
          errors: [{ field: 'general', message: canDelete.reason, code: 'DELETE_RESTRICTED' }] 
        };
      }

      // Soft delete by setting status to inactive
      const { error } = await this.supabase
        .from('institutions')
        .update({ 
          status: 'inactive' as InstitutionStatus, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) {
        console.error('Error deleting institution:', error);
        return { 
          success: false, 
          errors: [{ field: 'general', message: 'Failed to delete institution', code: 'DATABASE_ERROR' }] 
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Unexpected error deleting institution:', error);
      return { 
        success: false, 
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }] 
      };
    }
  }

  /**
   * List institutions with filtering
   */
  async listInstitutions(filters: InstitutionFilters = {}): Promise<{ institutions: Institution[]; total: number }> {
    try {
      let query = this.supabase.from('institutions').select('*', { count: 'exact' });

      // Apply filters
      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.domain) {
        query = query.ilike('domain', `%${filters.domain}%`);
      }
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,domain.ilike.%${filters.search}%`);
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

      // Order by created_at desc by default
      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        console.error('Error listing institutions:', error);
        return { institutions: [], total: 0 };
      }

      const institutions = (data || []).map(item => this.transformDatabaseToInstitution(item));
      return { institutions, total: count || 0 };
    } catch (error) {
      console.error('Unexpected error listing institutions:', error);
      return { institutions: [], total: 0 };
    }
  }

  /**
   * Validate institution data
   */
  private validateInstitutionData(data: InstitutionCreationData): ValidationResult {
    const errors: ValidationError[] = [];

    // Required fields
    if (!data.name || data.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Institution name is required', code: 'REQUIRED' });
    }

    if (!data.domain || !this.isValidDomain(data.domain)) {
      errors.push({ field: 'domain', message: 'Valid domain is required', code: 'INVALID_FORMAT' });
    }

    if (data.subdomain && !this.isValidSubdomain(data.subdomain)) {
      errors.push({ field: 'subdomain', message: 'Invalid subdomain format', code: 'INVALID_FORMAT' });
    }

    // Validate contact info
    if (data.contactInfo?.email && !this.isValidEmail(data.contactInfo.email)) {
      errors.push({ field: 'contactInfo.email', message: 'Invalid email format', code: 'INVALID_FORMAT' });
    }

    // Validate type
    const validTypes: InstitutionType[] = ['university', 'college', 'school', 'training_center', 'other'];
    if (!validTypes.includes(data.type)) {
      errors.push({ field: 'type', message: 'Invalid institution type', code: 'INVALID_VALUE' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check domain uniqueness
   */
  private async checkDomainUniqueness(domain: string, subdomain?: string, excludeId?: string): Promise<{ isUnique: boolean; message: string }> {
    try {
      // Check domain uniqueness
      let domainQuery = this.supabase
        .from('institutions')
        .select('id')
        .eq('domain', domain);

      if (excludeId) {
        domainQuery = domainQuery.neq('id', excludeId);
      }

      const { data: domainData } = await domainQuery;

      if (domainData && domainData.length > 0) {
        return { isUnique: false, message: 'Domain is already in use' };
      }

      // Check subdomain uniqueness if provided
      if (subdomain) {
        let subdomainQuery = this.supabase
          .from('institutions')
          .select('id')
          .eq('subdomain', subdomain);

        if (excludeId) {
          subdomainQuery = subdomainQuery.neq('id', excludeId);
        }

        const { data: subdomainData } = await subdomainQuery;

        if (subdomainData && subdomainData.length > 0) {
          return { isUnique: false, message: 'Subdomain is already in use' };
        }
      }

      return { isUnique: true, message: 'Domain is available' };
    } catch (error) {
      console.error('Error checking domain uniqueness:', error);
      return { isUnique: false, message: 'Error checking domain availability' };
    }
  }

  /**
   * Check if institution can be deleted
   */
  private async canDeleteInstitution(id: string): Promise<{ canDelete: boolean; reason: string }> {
    try {
      // Check for active departments
      const { data: departments } = await this.supabase
        .from('departments')
        .select('id')
        .eq('institution_id', id)
        .eq('status', 'active');

      if (departments && departments.length > 0) {
        return { canDelete: false, reason: 'Institution has active departments' };
      }

      // In a real implementation, you would also check for active users, classes, etc.
      // For now, we'll allow deletion if no active departments exist

      return { canDelete: true, reason: 'Institution can be deleted' };
    } catch (error) {
      console.error('Error checking if institution can be deleted:', error);
      return { canDelete: false, reason: 'Error checking deletion eligibility' };
    }
  }

  /**
   * Prepare institution data for database insertion
   */
  private prepareInstitutionData(data: InstitutionCreationData, createdBy: string): any {
    const now = new Date().toISOString();

    // Default settings
    const defaultSettings: InstitutionSettings = {
      allowSelfRegistration: false,
      requireEmailVerification: true,
      defaultUserRole: 'student',
      allowCrossInstitutionCollaboration: false,
      contentSharingPolicy: {
        allowCrossInstitution: false,
        allowPublicSharing: false,
        requireAttribution: true,
        defaultSharingLevel: 'private'
      },
      dataRetentionPolicy: {
        retentionPeriodDays: 2555, // 7 years
        autoDeleteInactive: false,
        backupBeforeDelete: true
      },
      integrations: [],
      customFields: [],
      featureFlags: {
        allowSelfRegistration: false,
        enableAnalytics: true,
        enableIntegrations: false,
        enableCustomBranding: false,
        enableDepartmentHierarchy: true,
        enableContentSharing: false
      }
    };

    // Default branding
    const defaultBranding: BrandingConfig = {
      primaryColor: '#1f2937',
      secondaryColor: '#374151',
      accentColor: '#3b82f6'
    };

    // Default subscription
    const defaultSubscription: SubscriptionInfo = {
      plan: 'free',
      userLimit: 100,
      storageLimit: 5, // 5GB
      features: ['basic_features'],
      billingCycle: 'monthly',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      status: 'trial'
    };

    return {
      name: data.name,
      domain: data.domain,
      subdomain: data.subdomain || null,
      type: data.type,
      status: 'pending' as InstitutionStatus,
      contact_email: data.contactInfo?.email || null,
      contact_phone: data.contactInfo?.phone || null,
      address: data.address || {},
      settings: { ...defaultSettings, ...data.settings },
      branding: { ...defaultBranding, ...data.branding },
      subscription: { ...defaultSubscription, ...data.subscription },
      created_at: now,
      updated_at: now,
      created_by: createdBy
    };
  }

  /**
   * Prepare update data
   */
  private prepareUpdateData(updates: Partial<InstitutionCreationData>): any {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.domain) updateData.domain = updates.domain;
    if (updates.subdomain !== undefined) updateData.subdomain = updates.subdomain;
    if (updates.type) updateData.type = updates.type;
    if (updates.contactInfo) {
      updateData.contact_email = updates.contactInfo.email || null;
      updateData.contact_phone = updates.contactInfo.phone || null;
    }
    if (updates.address) updateData.address = updates.address;
    if (updates.settings) updateData.settings = updates.settings;
    if (updates.branding) updateData.branding = updates.branding;
    if (updates.subscription) updateData.subscription = updates.subscription;

    return updateData;
  }

  /**
   * Transform database result to Institution type
   */
  private transformDatabaseToInstitution(data: any): Institution {
    return {
      id: data.id,
      name: data.name,
      domain: data.domain,
      subdomain: data.subdomain,
      type: data.type,
      status: data.status,
      contactInfo: {
        email: data.contact_email,
        phone: data.contact_phone
      },
      address: data.address || {},
      settings: data.settings || {},
      branding: data.branding || {},
      subscription: data.subscription || {},
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      createdBy: data.created_by
    };
  }

  /**
   * Domain validation helper
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }

  /**
   * Subdomain validation helper
   */
  private isValidSubdomain(subdomain: string): boolean {
    if (!subdomain || subdomain.length === 0) return false;
    const subdomainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
    return subdomainRegex.test(subdomain);
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
   * Validate status transition
   */
  private validateStatusTransition(currentStatus: InstitutionStatus, newStatus: InstitutionStatus): ValidationResult {
    const errors: ValidationError[] = [];

    // Define valid status transitions
    const validTransitions: Record<InstitutionStatus, InstitutionStatus[]> = {
      'pending': ['active', 'suspended', 'inactive'],
      'active': ['suspended', 'inactive'],
      'suspended': ['active', 'inactive'],
      'inactive': ['active'] // Can reactivate archived institutions
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      errors.push({
        field: 'status',
        message: `Cannot transition from ${currentStatus} to ${newStatus}`,
        code: 'INVALID_TRANSITION'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Perform pre-transition actions
   */
  private async performPreTransitionActions(institution: Institution, newStatus: InstitutionStatus): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      switch (newStatus) {
        case 'suspended':
          // Check if there are any critical operations in progress
          // In a real implementation, you might check for ongoing enrollments, active classes, etc.
          break;
        
        case 'inactive':
          // Ensure all departments are properly archived
          const activeDepartments = await this.getActiveDepartmentCount(institution.id);
          if (activeDepartments > 0) {
            return {
              success: false,
              errors: [{ field: 'status', message: 'Cannot archive institution with active departments', code: 'ACTIVE_DEPENDENCIES' }]
            };
          }
          break;
        
        case 'active':
          // Validate that institution meets requirements for activation
          if (!institution.contactInfo.email) {
            return {
              success: false,
              errors: [{ field: 'contactInfo', message: 'Contact email required for activation', code: 'MISSING_CONTACT' }]
            };
          }
          break;
      }

      return { success: true };
    } catch (error) {
      console.error('Error in pre-transition actions:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Error validating transition', code: 'VALIDATION_ERROR' }]
      };
    }
  }

  /**
   * Perform post-transition actions
   */
  private async performPostTransitionActions(institution: Institution, newStatus: InstitutionStatus, reason?: string): Promise<void> {
    try {
      // Log the status change
      await this.logStatusChange(institution.id, institution.status, newStatus, reason);

      switch (newStatus) {
        case 'suspended':
          // Notify users about suspension
          await this.notifyInstitutionSuspension(institution, reason);
          break;
        
        case 'active':
          // Send activation notification
          await this.notifyInstitutionActivation(institution);
          break;
        
        case 'inactive':
          // Archive related data and send final notifications
          await this.notifyInstitutionArchival(institution);
          break;
      }
    } catch (error) {
      console.error('Error in post-transition actions:', error);
      // Don't fail the main operation if post-transition actions fail
    }
  }

  /**
   * Check if institution can be archived
   */
  private async canArchiveInstitution(id: string): Promise<{ canArchive: boolean; reason: string }> {
    try {
      // Check for active departments
      const activeDepartments = await this.getActiveDepartmentCount(id);
      if (activeDepartments > 0) {
        return { canArchive: false, reason: 'Institution has active departments' };
      }

      // Check for active users (in a real implementation)
      // const activeUsers = await this.getActiveUserCount(id);
      // if (activeUsers > 0) {
      //   return { canArchive: false, reason: 'Institution has active users' };
      // }

      return { canArchive: true, reason: 'Institution can be archived' };
    } catch (error) {
      console.error('Error checking if institution can be archived:', error);
      return { canArchive: false, reason: 'Error checking archive eligibility' };
    }
  }

  /**
   * Archive all departments for an institution
   */
  private async archiveInstitutionDepartments(institutionId: string): Promise<void> {
    try {
      await this.supabase
        .from('departments')
        .update({ 
          status: 'archived',
          updated_at: new Date().toISOString()
        })
        .eq('institution_id', institutionId)
        .in('status', ['active', 'inactive']);
    } catch (error) {
      console.error('Error archiving institution departments:', error);
    }
  }

  /**
   * Get count of active departments for an institution
   */
  private async getActiveDepartmentCount(institutionId: string): Promise<number> {
    try {
      const { count } = await this.supabase
        .from('departments')
        .select('id', { count: 'exact' })
        .eq('institution_id', institutionId)
        .eq('status', 'active');

      return count || 0;
    } catch (error) {
      console.error('Error getting active department count:', error);
      return 0;
    }
  }

  /**
   * Log status change for audit purposes
   */
  private async logStatusChange(institutionId: string, oldStatus: InstitutionStatus, newStatus: InstitutionStatus, reason?: string): Promise<void> {
    try {
      // In a real implementation, this would log to an audit table
      console.log(`Institution ${institutionId} status changed from ${oldStatus} to ${newStatus}`, { reason });
      
      // You could insert into an audit log table here:
      // await this.supabase.from('institution_audit_log').insert({
      //   institution_id: institutionId,
      //   action: 'status_change',
      //   old_value: oldStatus,
      //   new_value: newStatus,
      //   reason,
      //   timestamp: new Date().toISOString()
      // });
    } catch (error) {
      console.error('Error logging status change:', error);
    }
  }

  /**
   * Notify about institution suspension
   */
  private async notifyInstitutionSuspension(institution: Institution, reason?: string): Promise<void> {
    try {
      // In a real implementation, this would send notifications to institution admins
      console.log(`Institution ${institution.name} has been suspended`, { reason });
      
      // Example notification logic:
      // await this.notificationService.sendInstitutionSuspensionNotification(institution, reason);
    } catch (error) {
      console.error('Error sending suspension notification:', error);
    }
  }

  /**
   * Notify about institution activation
   */
  private async notifyInstitutionActivation(institution: Institution): Promise<void> {
    try {
      // In a real implementation, this would send activation notifications
      console.log(`Institution ${institution.name} has been activated`);
      
      // Example notification logic:
      // await this.notificationService.sendInstitutionActivationNotification(institution);
    } catch (error) {
      console.error('Error sending activation notification:', error);
    }
  }

  /**
   * Notify about institution archival
   */
  private async notifyInstitutionArchival(institution: Institution): Promise<void> {
    try {
      // In a real implementation, this would send final notifications
      console.log(`Institution ${institution.name} has been archived`);
      
      // Example notification logic:
      // await this.notificationService.sendInstitutionArchivalNotification(institution);
    } catch (error) {
      console.error('Error sending archival notification:', error);
    }
  }
}