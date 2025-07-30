// Enrollment Configuration Service
// Handles class enrollment configuration management, validation, and enforcement

import { createClient } from '@/lib/supabase/server';
import {
  ClassEnrollmentConfig,
  EnrollmentType,
  ClassPrerequisite,
  EnrollmentRestriction,
  PrerequisiteType,
  RestrictionType
} from '@/lib/types/enrollment';

export interface EnrollmentConfigUpdate {
  enrollmentType?: EnrollmentType;
  capacity?: number;
  waitlistCapacity?: number;
  enrollmentStart?: Date | null;
  enrollmentEnd?: Date | null;
  dropDeadline?: Date | null;
  withdrawDeadline?: Date | null;
  autoApprove?: boolean;
  requiresJustification?: boolean;
  allowWaitlist?: boolean;
  maxWaitlistPosition?: number | null;
  notificationSettings?: {
    enrollmentConfirmation?: boolean;
    waitlistUpdates?: boolean;
    deadlineReminders?: boolean;
    capacityAlerts?: boolean;
  };
}

export interface PrerequisiteData {
  type: PrerequisiteType;
  requirement: string;
  description?: string;
  strict?: boolean;
}

export interface RestrictionData {
  type: RestrictionType;
  condition: string;
  description?: string;
  overridable?: boolean;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

export class EnrollmentConfigService {
  private supabase = createClient();

  /**
   * Get enrollment configuration for a class
   */
  async getClassConfig(classId: string): Promise<ClassEnrollmentConfig | null> {
    const { data: classData, error } = await this.supabase
      .from('classes')
      .select(`
        enrollment_config,
        capacity,
        waitlist_capacity,
        enrollment_type,
        enrollment_start,
        enrollment_end,
        drop_deadline,
        withdraw_deadline
      `)
      .eq('id', classId)
      .single();

    if (error || !classData) {
      throw new Error(`Failed to fetch class configuration: ${error?.message}`);
    }

    // Parse enrollment_config JSON and merge with direct columns
    const config = classData.enrollment_config || {};
    
    return {
      enrollmentType: classData.enrollment_type as EnrollmentType || EnrollmentType.OPEN,
      capacity: classData.capacity || 30,
      waitlistCapacity: classData.waitlist_capacity || 10,
      enrollmentStart: classData.enrollment_start ? new Date(classData.enrollment_start) : undefined,
      enrollmentEnd: classData.enrollment_end ? new Date(classData.enrollment_end) : undefined,
      dropDeadline: classData.drop_deadline ? new Date(classData.drop_deadline) : undefined,
      withdrawDeadline: classData.withdraw_deadline ? new Date(classData.withdraw_deadline) : undefined,
      autoApprove: config.autoApprove ?? (classData.enrollment_type === 'open'),
      requiresJustification: config.requiresJustification ?? (classData.enrollment_type === 'restricted'),
      allowWaitlist: config.allowWaitlist ?? true,
      maxWaitlistPosition: config.maxWaitlistPosition || null,
      notificationSettings: {
        enrollmentConfirmation: config.notificationSettings?.enrollmentConfirmation ?? true,
        waitlistUpdates: config.notificationSettings?.waitlistUpdates ?? true,
        deadlineReminders: config.notificationSettings?.deadlineReminders ?? true,
        capacityAlerts: config.notificationSettings?.capacityAlerts ?? true,
      }
    };
  }

  /**
   * Update enrollment configuration for a class
   */
  async updateClassConfig(
    classId: string, 
    updates: EnrollmentConfigUpdate,
    updatedBy: string
  ): Promise<ClassEnrollmentConfig> {
    // Validate the configuration updates
    const validation = await this.validateConfig(classId, updates);
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Get current config to merge with updates
    const currentConfig = await this.getClassConfig(classId);
    if (!currentConfig) {
      throw new Error('Class not found');
    }

    // Prepare the update data
    const configUpdate: any = {};
    const directUpdates: any = {};

    // Handle direct column updates
    if (updates.enrollmentType !== undefined) {
      directUpdates.enrollment_type = updates.enrollmentType;
      // Auto-adjust related settings based on enrollment type
      if (updates.enrollmentType === EnrollmentType.OPEN) {
        configUpdate.autoApprove = true;
        configUpdate.requiresJustification = false;
      } else if (updates.enrollmentType === EnrollmentType.RESTRICTED) {
        configUpdate.autoApprove = updates.autoApprove ?? false;
        configUpdate.requiresJustification = updates.requiresJustification ?? true;
      }
    }

    if (updates.capacity !== undefined) directUpdates.capacity = updates.capacity;
    if (updates.waitlistCapacity !== undefined) directUpdates.waitlist_capacity = updates.waitlistCapacity;
    if (updates.enrollmentStart !== undefined) directUpdates.enrollment_start = updates.enrollmentStart;
    if (updates.enrollmentEnd !== undefined) directUpdates.enrollment_end = updates.enrollmentEnd;
    if (updates.dropDeadline !== undefined) directUpdates.drop_deadline = updates.dropDeadline;
    if (updates.withdrawDeadline !== undefined) directUpdates.withdraw_deadline = updates.withdrawDeadline;

    // Handle JSON config updates
    if (updates.autoApprove !== undefined) configUpdate.autoApprove = updates.autoApprove;
    if (updates.requiresJustification !== undefined) configUpdate.requiresJustification = updates.requiresJustification;
    if (updates.allowWaitlist !== undefined) configUpdate.allowWaitlist = updates.allowWaitlist;
    if (updates.maxWaitlistPosition !== undefined) configUpdate.maxWaitlistPosition = updates.maxWaitlistPosition;
    if (updates.notificationSettings) {
      configUpdate.notificationSettings = {
        ...currentConfig.notificationSettings,
        ...updates.notificationSettings
      };
    }

    // Merge current config with updates
    const newConfig = {
      ...currentConfig.enrollmentConfig || {},
      ...configUpdate
    };

    directUpdates.enrollment_config = newConfig;
    directUpdates.updated_at = new Date().toISOString();

    // Update the database
    const { error } = await this.supabase
      .from('classes')
      .update(directUpdates)
      .eq('id', classId);

    if (error) {
      throw new Error(`Failed to update class configuration: ${error.message}`);
    }

    // Log the configuration change
    await this.logConfigChange(classId, updates, updatedBy);

    // Return the updated configuration
    return await this.getClassConfig(classId) as ClassEnrollmentConfig;
  }

  /**
   * Validate enrollment configuration
   */
  async validateConfig(classId: string, config: EnrollmentConfigUpdate): Promise<ConfigValidationResult> {
    const errors: Array<{ field: string; message: string; code: string }> = [];
    const warnings: Array<{ field: string; message: string; code: string }> = [];

    // Validate capacity
    if (config.capacity !== undefined) {
      if (config.capacity < 1) {
        errors.push({
          field: 'capacity',
          message: 'Class capacity must be at least 1',
          code: 'INVALID_CAPACITY'
        });
      }

      // Check if reducing capacity below current enrollment
      const { data: currentEnrollment } = await this.supabase
        .from('enrollments')
        .select('id')
        .eq('class_id', classId)
        .eq('status', 'enrolled');

      if (currentEnrollment && config.capacity < currentEnrollment.length) {
        warnings.push({
          field: 'capacity',
          message: `Reducing capacity below current enrollment (${currentEnrollment.length} students)`,
          code: 'CAPACITY_BELOW_ENROLLMENT'
        });
      }
    }

    // Validate waitlist capacity
    if (config.waitlistCapacity !== undefined && config.waitlistCapacity < 0) {
      errors.push({
        field: 'waitlistCapacity',
        message: 'Waitlist capacity cannot be negative',
        code: 'INVALID_WAITLIST_CAPACITY'
      });
    }

    // Validate date ranges
    if (config.enrollmentStart && config.enrollmentEnd) {
      if (config.enrollmentStart >= config.enrollmentEnd) {
        errors.push({
          field: 'enrollmentEnd',
          message: 'Enrollment end date must be after start date',
          code: 'INVALID_DATE_RANGE'
        });
      }
    }

    // Validate deadline order
    if (config.dropDeadline && config.withdrawDeadline) {
      if (config.dropDeadline >= config.withdrawDeadline) {
        errors.push({
          field: 'withdrawDeadline',
          message: 'Withdraw deadline must be after drop deadline',
          code: 'INVALID_DEADLINE_ORDER'
        });
      }
    }

    // Validate enrollment type specific settings
    if (config.enrollmentType === EnrollmentType.INVITATION_ONLY) {
      if (config.autoApprove === true) {
        warnings.push({
          field: 'autoApprove',
          message: 'Auto-approve is not applicable for invitation-only classes',
          code: 'INCOMPATIBLE_SETTING'
        });
      }
    }

    // Validate max waitlist position
    if (config.maxWaitlistPosition !== undefined && config.waitlistCapacity !== undefined) {
      if (config.maxWaitlistPosition > config.waitlistCapacity) {
        errors.push({
          field: 'maxWaitlistPosition',
          message: 'Max waitlist position cannot exceed waitlist capacity',
          code: 'INVALID_WAITLIST_POSITION'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get class prerequisites
   */
  async getPrerequisites(classId: string): Promise<ClassPrerequisite[]> {
    const { data, error } = await this.supabase
      .from('class_prerequisites')
      .select('*')
      .eq('class_id', classId)
      .order('created_at');

    if (error) {
      throw new Error(`Failed to fetch prerequisites: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Add prerequisite to class
   */
  async addPrerequisite(
    classId: string, 
    prerequisite: PrerequisiteData,
    addedBy: string
  ): Promise<ClassPrerequisite> {
    // Validate prerequisite data
    const validation = this.validatePrerequisite(prerequisite);
    if (!validation.valid) {
      throw new Error(`Prerequisite validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    const { data, error } = await this.supabase
      .from('class_prerequisites')
      .insert({
        class_id: classId,
        type: prerequisite.type,
        requirement: prerequisite.requirement,
        description: prerequisite.description,
        strict: prerequisite.strict ?? true
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add prerequisite: ${error.message}`);
    }

    // Log the change
    await this.logPrerequisiteChange(classId, 'added', data.id, addedBy);

    return data;
  }

  /**
   * Update prerequisite
   */
  async updatePrerequisite(
    prerequisiteId: string,
    updates: Partial<PrerequisiteData>,
    updatedBy: string
  ): Promise<ClassPrerequisite> {
    const { data, error } = await this.supabase
      .from('class_prerequisites')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', prerequisiteId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update prerequisite: ${error.message}`);
    }

    // Log the change
    await this.logPrerequisiteChange(data.class_id, 'updated', prerequisiteId, updatedBy);

    return data;
  }

  /**
   * Remove prerequisite
   */
  async removePrerequisite(prerequisiteId: string, removedBy: string): Promise<void> {
    // Get the prerequisite first to log the class_id
    const { data: prerequisite } = await this.supabase
      .from('class_prerequisites')
      .select('class_id')
      .eq('id', prerequisiteId)
      .single();

    const { error } = await this.supabase
      .from('class_prerequisites')
      .delete()
      .eq('id', prerequisiteId);

    if (error) {
      throw new Error(`Failed to remove prerequisite: ${error.message}`);
    }

    // Log the change
    if (prerequisite) {
      await this.logPrerequisiteChange(prerequisite.class_id, 'removed', prerequisiteId, removedBy);
    }
  }

  /**
   * Get class restrictions
   */
  async getRestrictions(classId: string): Promise<EnrollmentRestriction[]> {
    const { data, error } = await this.supabase
      .from('enrollment_restrictions')
      .select('*')
      .eq('class_id', classId)
      .order('created_at');

    if (error) {
      throw new Error(`Failed to fetch restrictions: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Add restriction to class
   */
  async addRestriction(
    classId: string, 
    restriction: RestrictionData,
    addedBy: string
  ): Promise<EnrollmentRestriction> {
    // Validate restriction data
    const validation = this.validateRestriction(restriction);
    if (!validation.valid) {
      throw new Error(`Restriction validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    const { data, error } = await this.supabase
      .from('enrollment_restrictions')
      .insert({
        class_id: classId,
        type: restriction.type,
        condition: restriction.condition,
        description: restriction.description,
        overridable: restriction.overridable ?? false
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add restriction: ${error.message}`);
    }

    // Log the change
    await this.logRestrictionChange(classId, 'added', data.id, addedBy);

    return data;
  }

  /**
   * Update restriction
   */
  async updateRestriction(
    restrictionId: string,
    updates: Partial<RestrictionData>,
    updatedBy: string
  ): Promise<EnrollmentRestriction> {
    const { data, error } = await this.supabase
      .from('enrollment_restrictions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', restrictionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update restriction: ${error.message}`);
    }

    // Log the change
    await this.logRestrictionChange(data.class_id, 'updated', restrictionId, updatedBy);

    return data;
  }

  /**
   * Remove restriction
   */
  async removeRestriction(restrictionId: string, removedBy: string): Promise<void> {
    // Get the restriction first to log the class_id
    const { data: restriction } = await this.supabase
      .from('enrollment_restrictions')
      .select('class_id')
      .eq('id', restrictionId)
      .single();

    const { error } = await this.supabase
      .from('enrollment_restrictions')
      .delete()
      .eq('id', restrictionId);

    if (error) {
      throw new Error(`Failed to remove restriction: ${error.message}`);
    }

    // Log the change
    if (restriction) {
      await this.logRestrictionChange(restriction.class_id, 'removed', restrictionId, removedBy);
    }
  }

  /**
   * Check if enrollment is currently open for a class
   */
  async isEnrollmentOpen(classId: string): Promise<boolean> {
    const config = await this.getClassConfig(classId);
    if (!config) return false;

    const now = new Date();
    
    // Check enrollment period
    if (config.enrollmentStart && now < config.enrollmentStart) return false;
    if (config.enrollmentEnd && now > config.enrollmentEnd) return false;

    return true;
  }

  /**
   * Check if class has capacity for new enrollments
   */
  async hasCapacity(classId: string): Promise<boolean> {
    const config = await this.getClassConfig(classId);
    if (!config) return false;

    const { data: enrollments } = await this.supabase
      .from('enrollments')
      .select('id')
      .eq('class_id', classId)
      .eq('status', 'enrolled');

    const currentCount = enrollments?.length || 0;
    return currentCount < config.capacity;
  }

  /**
   * Check if waitlist has capacity
   */
  async hasWaitlistCapacity(classId: string): Promise<boolean> {
    const config = await this.getClassConfig(classId);
    if (!config || !config.allowWaitlist) return false;

    const { data: waitlistEntries } = await this.supabase
      .from('waitlist_entries')
      .select('id')
      .eq('class_id', classId);

    const currentCount = waitlistEntries?.length || 0;
    return currentCount < config.waitlistCapacity;
  }

  /**
   * Validate prerequisite data
   */
  private validatePrerequisite(prerequisite: PrerequisiteData): ConfigValidationResult {
    const errors: Array<{ field: string; message: string; code: string }> = [];

    if (!prerequisite.requirement || prerequisite.requirement.trim() === '') {
      errors.push({
        field: 'requirement',
        message: 'Prerequisite requirement is required',
        code: 'MISSING_REQUIREMENT'
      });
    }

    // Validate requirement format based on type
    try {
      switch (prerequisite.type) {
        case PrerequisiteType.COURSE:
          // Should be a course ID or course code
          if (prerequisite.requirement.length < 3) {
            errors.push({
              field: 'requirement',
              message: 'Course requirement must be at least 3 characters',
              code: 'INVALID_COURSE_REQUIREMENT'
            });
          }
          break;
        case PrerequisiteType.GPA:
          const gpa = parseFloat(prerequisite.requirement);
          if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
            errors.push({
              field: 'requirement',
              message: 'GPA requirement must be a number between 0 and 4.0',
              code: 'INVALID_GPA_REQUIREMENT'
            });
          }
          break;
        case PrerequisiteType.YEAR:
          const year = parseInt(prerequisite.requirement);
          if (isNaN(year) || year < 1 || year > 8) {
            errors.push({
              field: 'requirement',
              message: 'Year requirement must be a number between 1 and 8',
              code: 'INVALID_YEAR_REQUIREMENT'
            });
          }
          break;
      }
    } catch (e) {
      errors.push({
        field: 'requirement',
        message: 'Invalid requirement format',
        code: 'INVALID_REQUIREMENT_FORMAT'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Validate restriction data
   */
  private validateRestriction(restriction: RestrictionData): ConfigValidationResult {
    const errors: Array<{ field: string; message: string; code: string }> = [];

    if (!restriction.condition || restriction.condition.trim() === '') {
      errors.push({
        field: 'condition',
        message: 'Restriction condition is required',
        code: 'MISSING_CONDITION'
      });
    }

    // Validate condition format based on type
    try {
      switch (restriction.type) {
        case RestrictionType.GPA:
          const gpa = parseFloat(restriction.condition);
          if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
            errors.push({
              field: 'condition',
              message: 'GPA condition must be a number between 0 and 4.0',
              code: 'INVALID_GPA_CONDITION'
            });
          }
          break;
        case RestrictionType.YEAR_LEVEL:
          const year = parseInt(restriction.condition);
          if (isNaN(year) || year < 1 || year > 8) {
            errors.push({
              field: 'condition',
              message: 'Year level condition must be a number between 1 and 8',
              code: 'INVALID_YEAR_CONDITION'
            });
          }
          break;
      }
    } catch (e) {
      errors.push({
        field: 'condition',
        message: 'Invalid condition format',
        code: 'INVALID_CONDITION_FORMAT'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Log configuration changes for audit trail
   */
  private async logConfigChange(
    classId: string, 
    changes: EnrollmentConfigUpdate, 
    changedBy: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('enrollment_audit_log')
        .insert({
          student_id: changedBy, // Using as changed_by since we don't have a separate field
          class_id: classId,
          action: 'config_updated',
          reason: 'Enrollment configuration updated',
          metadata: { changes },
          performed_by: changedBy
        });
    } catch (error) {
      // Log error but don't fail the main operation
      console.error('Failed to log configuration change:', error);
    }
  }

  /**
   * Log prerequisite changes
   */
  private async logPrerequisiteChange(
    classId: string,
    action: 'added' | 'updated' | 'removed',
    prerequisiteId: string,
    changedBy: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('enrollment_audit_log')
        .insert({
          student_id: changedBy,
          class_id: classId,
          action: `prerequisite_${action}`,
          reason: `Prerequisite ${action}`,
          metadata: { prerequisiteId },
          performed_by: changedBy
        });
    } catch (error) {
      console.error('Failed to log prerequisite change:', error);
    }
  }

  /**
   * Log restriction changes
   */
  private async logRestrictionChange(
    classId: string,
    action: 'added' | 'updated' | 'removed',
    restrictionId: string,
    changedBy: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('enrollment_audit_log')
        .insert({
          student_id: changedBy,
          class_id: classId,
          action: `restriction_${action}`,
          reason: `Restriction ${action}`,
          metadata: { restrictionId },
          performed_by: changedBy
        });
    } catch (error) {
      console.error('Failed to log restriction change:', error);
    }
  }
}

export const enrollmentConfigService = new EnrollmentConfigService();