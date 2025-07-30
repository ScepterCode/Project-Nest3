import { createClient } from '@/lib/supabase/server';
import { ValidationError } from '@/lib/types/institution';
import { UserRole } from '@/lib/types/onboarding';

export interface ClassSettings {
  defaultCapacity: number;
  allowWaitlist: boolean;
  requireApproval: boolean;
  allowSelfEnrollment: boolean;
  gradingScale: 'letter' | 'percentage' | 'points';
  passingGrade: number;
  defaultDuration: number; // in minutes
  allowLateSubmissions: boolean;
  latePenaltyPercent: number;
  maxLateDays: number;
}

export interface GradingPolicy {
  id: string;
  name: string;
  scale: 'letter' | 'percentage' | 'points';
  ranges: Array<{
    min: number;
    max: number;
    grade: string;
    gpa?: number;
  }>;
  allowExtraCredit: boolean;
  roundingRule: 'up' | 'down' | 'nearest';
  isDefault: boolean;
}

export interface AssignmentDefaults {
  allowLateSubmissions: boolean;
  latePenaltyPercent: number;
  maxLateDays: number;
  allowResubmissions: boolean;
  maxResubmissions: number;
  defaultDueDays: number;
  requireRubric: boolean;
  defaultPointValue: number;
  allowPeerReview: boolean;
  anonymousGrading: boolean;
}

export interface CollaborationRules {
  allowPeerReview: boolean;
  allowGroupAssignments: boolean;
  allowCrossClassCollaboration: boolean;
  allowExternalCollaboration: boolean;
  defaultGroupSize: number;
  maxGroupSize: number;
  requireGroupApproval: boolean;
  allowStudentGroupCreation: boolean;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  digestFrequency: 'immediate' | 'daily' | 'weekly' | 'never';
  notifyOnAssignmentCreated: boolean;
  notifyOnGradePosted: boolean;
  notifyOnAnnouncementPosted: boolean;
  notifyOnDiscussionReply: boolean;
}

export interface DepartmentSettings {
  defaultClassSettings: ClassSettings;
  gradingPolicies: GradingPolicy[];
  assignmentDefaults: AssignmentDefaults;
  collaborationRules: CollaborationRules;
  notificationSettings: NotificationSettings;
  customFields: Array<{
    id: string;
    name: string;
    type: 'text' | 'number' | 'boolean' | 'select' | 'date';
    required: boolean;
    options?: string[];
    defaultValue?: any;
  }>;
  budgetCode?: string;
  costCenter?: string;
  academicYear?: {
    startDate: Date;
    endDate: Date;
    terms: Array<{
      name: string;
      startDate: Date;
      endDate: Date;
    }>;
  };
}

export interface DepartmentConfigUpdate {
  departmentId: string;
  settings: Partial<DepartmentSettings>;
  updatedBy: string;
  reason?: string;
}

export interface PolicyConflict {
  field: string;
  departmentValue: any;
  institutionValue: any;
  conflictType: 'restriction' | 'requirement' | 'incompatible';
  message: string;
  resolution?: 'use_institution' | 'use_department' | 'merge' | 'custom';
}

export interface ConfigInheritanceResult {
  finalConfig: DepartmentSettings;
  inheritedFields: string[];
  overriddenFields: string[];
  conflicts: PolicyConflict[];
}

export class DepartmentConfigManager {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Get department configuration with inheritance from institution settings
   */
  async getDepartmentConfig(departmentId: string): Promise<ConfigInheritanceResult> {
    try {
      // Get department and its institution
      const { data: department, error: deptError } = await this.supabase
        .from('departments')
        .select(`
          *,
          institutions (
            id,
            settings,
            branding
          )
        `)
        .eq('id', departmentId)
        .single();

      if (deptError || !department) {
        throw new Error('Department not found');
      }

      // Get institution settings
      const institutionSettings = department.institutions.settings || {};
      const departmentSettings = department.settings || {};

      // Apply inheritance and detect conflicts
      const inheritanceResult = this.applyConfigInheritance(
        institutionSettings,
        departmentSettings
      );

      return inheritanceResult;
    } catch (error) {
      console.error('Error getting department config:', error);
      throw error;
    }
  }

  /**
   * Update department configuration with validation and conflict resolution
   */
  async updateDepartmentConfig(
    update: DepartmentConfigUpdate
  ): Promise<{ success: boolean; conflicts?: PolicyConflict[]; errors?: ValidationError[] }> {
    try {
      // Get current configuration
      const currentConfig = await this.getDepartmentConfig(update.departmentId);

      // Validate the update
      const validation = await this.validateConfigUpdate(update, currentConfig);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check for policy conflicts
      const conflicts = await this.detectPolicyConflicts(update.departmentId, update.settings);
      
      // If there are unresolved conflicts, return them for user resolution
      const unresolvedConflicts = conflicts.filter(c => !c.resolution);
      if (unresolvedConflicts.length > 0) {
        return { success: false, conflicts: unresolvedConflicts };
      }

      // Apply conflict resolutions
      const resolvedSettings = this.applyConflictResolutions(update.settings, conflicts);

      // Merge with existing settings
      const mergedSettings = this.mergeSettings(currentConfig.finalConfig, resolvedSettings);

      // Update database
      const { error } = await this.supabase
        .from('departments')
        .update({
          settings: mergedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.departmentId);

      if (error) {
        console.error('Error updating department config:', error);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to update configuration', code: 'DATABASE_ERROR' }]
        };
      }

      // Log the configuration change
      await this.logConfigChange(update);

      // Notify affected users if needed
      await this.notifyConfigChange(update.departmentId, resolvedSettings, update.updatedBy);

      return { success: true };
    } catch (error) {
      console.error('Error updating department config:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Get default department settings based on institution policies
   */
  async getDefaultDepartmentSettings(institutionId: string): Promise<DepartmentSettings> {
    try {
      const { data: institution, error } = await this.supabase
        .from('institutions')
        .select('settings')
        .eq('id', institutionId)
        .single();

      if (error || !institution) {
        throw new Error('Institution not found');
      }

      return this.generateDefaultSettings(institution.settings);
    } catch (error) {
      console.error('Error getting default department settings:', error);
      throw error;
    }
  }

  /**
   * Validate department configuration against institution policies
   */
  async validateDepartmentConfig(
    departmentId: string,
    settings: Partial<DepartmentSettings>
  ): Promise<{ isValid: boolean; errors: ValidationError[]; conflicts: PolicyConflict[] }> {
    try {
      const errors: ValidationError[] = [];
      
      // Basic validation
      const basicValidation = this.validateBasicSettings(settings);
      errors.push(...basicValidation);

      // Policy conflict detection
      const conflicts = await this.detectPolicyConflicts(departmentId, settings);

      return {
        isValid: errors.length === 0 && conflicts.filter(c => c.conflictType === 'incompatible').length === 0,
        errors,
        conflicts
      };
    } catch (error) {
      console.error('Error validating department config:', error);
      return {
        isValid: false,
        errors: [{ field: 'general', message: 'Validation error', code: 'VALIDATION_ERROR' }],
        conflicts: []
      };
    }
  }

  /**
   * Get configuration inheritance hierarchy
   */
  async getConfigHierarchy(departmentId: string): Promise<{
    institution: any;
    department: any;
    inherited: string[];
    overridden: string[];
  }> {
    try {
      const { data: department, error } = await this.supabase
        .from('departments')
        .select(`
          *,
          institutions (
            id,
            name,
            settings
          )
        `)
        .eq('id', departmentId)
        .single();

      if (error || !department) {
        throw new Error('Department not found');
      }

      const institutionSettings = department.institutions.settings || {};
      const departmentSettings = department.settings || {};

      const inherited: string[] = [];
      const overridden: string[] = [];

      // Analyze inheritance
      this.analyzeInheritance(institutionSettings, departmentSettings, '', inherited, overridden);

      return {
        institution: institutionSettings,
        department: departmentSettings,
        inherited,
        overridden
      };
    } catch (error) {
      console.error('Error getting config hierarchy:', error);
      throw error;
    }
  }

  /**
   * Reset department configuration to institution defaults
   */
  async resetToInstitutionDefaults(
    departmentId: string,
    resetBy: string,
    fieldsToReset?: string[]
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Get department and institution
      const { data: department, error } = await this.supabase
        .from('departments')
        .select(`
          *,
          institutions (
            id,
            settings
          )
        `)
        .eq('id', departmentId)
        .single();

      if (error || !department) {
        return {
          success: false,
          errors: [{ field: 'department', message: 'Department not found', code: 'NOT_FOUND' }]
        };
      }

      const institutionSettings = department.institutions.settings || {};
      const currentSettings = department.settings || {};

      let newSettings;
      if (fieldsToReset && fieldsToReset.length > 0) {
        // Reset only specific fields
        newSettings = { ...currentSettings };
        fieldsToReset.forEach(field => {
          if (this.hasNestedProperty(institutionSettings, field)) {
            this.setNestedProperty(newSettings, field, this.getNestedProperty(institutionSettings, field));
          } else {
            this.deleteNestedProperty(newSettings, field);
          }
        });
      } else {
        // Reset all settings to institution defaults
        newSettings = this.generateDefaultSettings(institutionSettings);
      }

      // Update database
      const { error: updateError } = await this.supabase
        .from('departments')
        .update({
          settings: newSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', departmentId);

      if (updateError) {
        console.error('Error resetting department config:', updateError);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to reset configuration', code: 'DATABASE_ERROR' }]
        };
      }

      // Log the reset
      await this.logConfigChange({
        departmentId,
        settings: newSettings,
        updatedBy: resetBy,
        reason: `Reset to institution defaults${fieldsToReset ? ` for fields: ${fieldsToReset.join(', ')}` : ''}`
      });

      return { success: true };
    } catch (error) {
      console.error('Error resetting department config:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  // Private helper methods

  private applyConfigInheritance(
    institutionSettings: any,
    departmentSettings: any
  ): ConfigInheritanceResult {
    const finalConfig = this.generateDefaultSettings(institutionSettings);
    const inheritedFields: string[] = [];
    const overriddenFields: string[] = [];
    const conflicts: PolicyConflict[] = [];

    // Merge department settings over institution defaults
    this.deepMergeWithTracking(
      finalConfig,
      departmentSettings,
      institutionSettings,
      '',
      inheritedFields,
      overriddenFields,
      conflicts
    );

    return {
      finalConfig,
      inheritedFields,
      overriddenFields,
      conflicts
    };
  }

  private deepMergeWithTracking(
    target: any,
    source: any,
    institution: any,
    path: string,
    inherited: string[],
    overridden: string[],
    conflicts: PolicyConflict[]
  ): void {
    for (const key in source) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.deepMergeWithTracking(
          target[key],
          source[key],
          institution[key] || {},
          currentPath,
          inherited,
          overridden,
          conflicts
        );
      } else {
        // Check for conflicts
        const institutionValue = this.getNestedProperty(institution, currentPath);
        if (institutionValue !== undefined && institutionValue !== source[key]) {
          const conflict = this.analyzeConflict(currentPath, source[key], institutionValue);
          if (conflict) {
            conflicts.push(conflict);
          }
        }

        target[key] = source[key];
        if (institutionValue !== undefined) {
          overridden.push(currentPath);
        }
      }
    }

    // Track inherited fields
    this.trackInheritedFields(target, institution, path, inherited);
  }

  private analyzeConflict(field: string, departmentValue: any, institutionValue: any): PolicyConflict | null {
    // Define conflict rules based on field types and institutional policies
    const conflictRules: Record<string, (deptVal: any, instVal: any) => PolicyConflict | null> = {
      'defaultClassSettings.allowSelfEnrollment': (deptVal, instVal) => {
        if (!instVal && deptVal) {
          return {
            field,
            departmentValue: deptVal,
            institutionValue: instVal,
            conflictType: 'restriction',
            message: 'Institution policy prohibits self-enrollment',
            resolution: 'use_institution'
          };
        }
        return null;
      },
      'collaborationRules.allowExternalCollaboration': (deptVal, instVal) => {
        if (!instVal && deptVal) {
          return {
            field,
            departmentValue: deptVal,
            institutionValue: instVal,
            conflictType: 'restriction',
            message: 'Institution policy prohibits external collaboration',
            resolution: 'use_institution'
          };
        }
        return null;
      },
      'assignmentDefaults.allowLateSubmissions': (deptVal, instVal) => {
        if (!instVal && deptVal) {
          return {
            field,
            departmentValue: deptVal,
            institutionValue: instVal,
            conflictType: 'restriction',
            message: 'Institution policy prohibits late submissions',
            resolution: 'use_institution'
          };
        }
        return null;
      }
    };

    const rule = conflictRules[field];
    return rule ? rule(departmentValue, institutionValue) : null;
  }

  private async detectPolicyConflicts(
    departmentId: string,
    settings: Partial<DepartmentSettings>
  ): Promise<PolicyConflict[]> {
    try {
      const { data: department, error } = await this.supabase
        .from('departments')
        .select(`
          *,
          institutions (
            settings
          )
        `)
        .eq('id', departmentId)
        .single();

      if (error || !department) {
        return [];
      }

      const institutionSettings = department.institutions.settings || {};
      const conflicts: PolicyConflict[] = [];

      // Check each setting for conflicts
      this.checkSettingsForConflicts(settings, institutionSettings, '', conflicts);

      return conflicts;
    } catch (error) {
      console.error('Error detecting policy conflicts:', error);
      return [];
    }
  }

  private checkSettingsForConflicts(
    settings: any,
    institutionSettings: any,
    path: string,
    conflicts: PolicyConflict[]
  ): void {
    for (const key in settings) {
      const currentPath = path ? `${path}.${key}` : key;
      const institutionValue = this.getNestedProperty(institutionSettings, currentPath);
      
      if (settings[key] !== null && typeof settings[key] === 'object' && !Array.isArray(settings[key])) {
        this.checkSettingsForConflicts(settings[key], institutionSettings, currentPath, conflicts);
      } else if (institutionValue !== undefined) {
        const conflict = this.analyzeConflict(currentPath, settings[key], institutionValue);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }
  }

  private applyConflictResolutions(
    settings: Partial<DepartmentSettings>,
    conflicts: PolicyConflict[]
  ): Partial<DepartmentSettings> {
    const resolvedSettings = JSON.parse(JSON.stringify(settings));

    conflicts.forEach(conflict => {
      if (conflict.resolution) {
        switch (conflict.resolution) {
          case 'use_institution':
            this.setNestedProperty(resolvedSettings, conflict.field, conflict.institutionValue);
            break;
          case 'use_department':
            // Keep department value (no change needed)
            break;
          case 'merge':
            // Custom merge logic based on field type
            const mergedValue = this.mergeValues(conflict.departmentValue, conflict.institutionValue);
            this.setNestedProperty(resolvedSettings, conflict.field, mergedValue);
            break;
        }
      }
    });

    return resolvedSettings;
  }

  private generateDefaultSettings(institutionSettings: any): DepartmentSettings {
    return {
      defaultClassSettings: {
        defaultCapacity: institutionSettings.defaultClassCapacity || 30,
        allowWaitlist: institutionSettings.allowWaitlist !== false,
        requireApproval: institutionSettings.requireApproval || false,
        allowSelfEnrollment: institutionSettings.allowSelfEnrollment !== false,
        gradingScale: institutionSettings.defaultGradingScale || 'letter',
        passingGrade: institutionSettings.passingGrade || 60,
        defaultDuration: institutionSettings.defaultClassDuration || 50,
        allowLateSubmissions: institutionSettings.allowLateSubmissions !== false,
        latePenaltyPercent: institutionSettings.latePenaltyPercent || 10,
        maxLateDays: institutionSettings.maxLateDays || 7
      },
      gradingPolicies: institutionSettings.gradingPolicies || [
        {
          id: 'default',
          name: 'Standard Letter Grades',
          scale: 'letter',
          ranges: [
            { min: 97, max: 100, grade: 'A+', gpa: 4.0 },
            { min: 93, max: 96, grade: 'A', gpa: 4.0 },
            { min: 90, max: 92, grade: 'A-', gpa: 3.7 },
            { min: 87, max: 89, grade: 'B+', gpa: 3.3 },
            { min: 83, max: 86, grade: 'B', gpa: 3.0 },
            { min: 80, max: 82, grade: 'B-', gpa: 2.7 },
            { min: 77, max: 79, grade: 'C+', gpa: 2.3 },
            { min: 73, max: 76, grade: 'C', gpa: 2.0 },
            { min: 70, max: 72, grade: 'C-', gpa: 1.7 },
            { min: 67, max: 69, grade: 'D+', gpa: 1.3 },
            { min: 63, max: 66, grade: 'D', gpa: 1.0 },
            { min: 60, max: 62, grade: 'D-', gpa: 0.7 },
            { min: 0, max: 59, grade: 'F', gpa: 0.0 }
          ],
          allowExtraCredit: true,
          roundingRule: 'nearest',
          isDefault: true
        }
      ],
      assignmentDefaults: {
        allowLateSubmissions: institutionSettings.allowLateSubmissions !== false,
        latePenaltyPercent: institutionSettings.latePenaltyPercent || 10,
        maxLateDays: institutionSettings.maxLateDays || 7,
        allowResubmissions: institutionSettings.allowResubmissions !== false,
        maxResubmissions: institutionSettings.maxResubmissions || 3,
        defaultDueDays: institutionSettings.defaultDueDays || 7,
        requireRubric: institutionSettings.requireRubric || false,
        defaultPointValue: institutionSettings.defaultPointValue || 100,
        allowPeerReview: institutionSettings.allowPeerReview !== false,
        anonymousGrading: institutionSettings.anonymousGrading || false
      },
      collaborationRules: {
        allowPeerReview: institutionSettings.allowPeerReview !== false,
        allowGroupAssignments: institutionSettings.allowGroupAssignments !== false,
        allowCrossClassCollaboration: institutionSettings.allowCrossClassCollaboration !== false,
        allowExternalCollaboration: institutionSettings.allowExternalCollaboration !== false,
        defaultGroupSize: institutionSettings.defaultGroupSize || 3,
        maxGroupSize: institutionSettings.maxGroupSize || 6,
        requireGroupApproval: institutionSettings.requireGroupApproval || false,
        allowStudentGroupCreation: institutionSettings.allowStudentGroupCreation !== false
      },
      notificationSettings: {
        emailNotifications: institutionSettings.emailNotifications !== false,
        pushNotifications: institutionSettings.pushNotifications !== false,
        digestFrequency: institutionSettings.digestFrequency || 'daily',
        notifyOnAssignmentCreated: institutionSettings.notifyOnAssignmentCreated !== false,
        notifyOnGradePosted: institutionSettings.notifyOnGradePosted !== false,
        notifyOnAnnouncementPosted: institutionSettings.notifyOnAnnouncementPosted !== false,
        notifyOnDiscussionReply: institutionSettings.notifyOnDiscussionReply !== false
      },
      customFields: institutionSettings.customFields || [],
      budgetCode: institutionSettings.budgetCode,
      costCenter: institutionSettings.costCenter
    };
  }

  private validateBasicSettings(settings: Partial<DepartmentSettings>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate class settings
    if (settings.defaultClassSettings) {
      const classSettings = settings.defaultClassSettings;
      
      if (classSettings.defaultCapacity && (classSettings.defaultCapacity < 1 || classSettings.defaultCapacity > 1000)) {
        errors.push({
          field: 'defaultClassSettings.defaultCapacity',
          message: 'Class capacity must be between 1 and 1000',
          code: 'INVALID_RANGE'
        });
      }

      if (classSettings.passingGrade && (classSettings.passingGrade < 0 || classSettings.passingGrade > 100)) {
        errors.push({
          field: 'defaultClassSettings.passingGrade',
          message: 'Passing grade must be between 0 and 100',
          code: 'INVALID_RANGE'
        });
      }

      if (classSettings.latePenaltyPercent && (classSettings.latePenaltyPercent < 0 || classSettings.latePenaltyPercent > 100)) {
        errors.push({
          field: 'defaultClassSettings.latePenaltyPercent',
          message: 'Late penalty must be between 0 and 100 percent',
          code: 'INVALID_RANGE'
        });
      }
    }

    // Validate grading policies
    if (settings.gradingPolicies) {
      settings.gradingPolicies.forEach((policy, index) => {
        if (!policy.name || policy.name.trim().length === 0) {
          errors.push({
            field: `gradingPolicies[${index}].name`,
            message: 'Grading policy name is required',
            code: 'REQUIRED'
          });
        }

        if (!policy.ranges || policy.ranges.length === 0) {
          errors.push({
            field: `gradingPolicies[${index}].ranges`,
            message: 'Grading policy must have at least one grade range',
            code: 'REQUIRED'
          });
        }

        // Validate grade ranges don't overlap
        if (policy.ranges) {
          const sortedRanges = [...policy.ranges].sort((a, b) => a.min - b.min);
          for (let i = 1; i < sortedRanges.length; i++) {
            if (sortedRanges[i].min <= sortedRanges[i - 1].max) {
              errors.push({
                field: `gradingPolicies[${index}].ranges`,
                message: 'Grade ranges cannot overlap',
                code: 'INVALID_RANGE'
              });
              break;
            }
          }
        }
      });
    }

    // Validate collaboration rules
    if (settings.collaborationRules) {
      const rules = settings.collaborationRules;
      
      if (rules.defaultGroupSize && rules.maxGroupSize && rules.defaultGroupSize > rules.maxGroupSize) {
        errors.push({
          field: 'collaborationRules.defaultGroupSize',
          message: 'Default group size cannot be larger than maximum group size',
          code: 'INVALID_RANGE'
        });
      }

      if (rules.maxGroupSize && (rules.maxGroupSize < 2 || rules.maxGroupSize > 20)) {
        errors.push({
          field: 'collaborationRules.maxGroupSize',
          message: 'Maximum group size must be between 2 and 20',
          code: 'INVALID_RANGE'
        });
      }
    }

    return errors;
  }

  private async validateConfigUpdate(
    update: DepartmentConfigUpdate,
    currentConfig: ConfigInheritanceResult
  ): Promise<{ isValid: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    // Basic validation
    const basicErrors = this.validateBasicSettings(update.settings);
    errors.push(...basicErrors);

    // Check if department exists and user has permission
    const { data: department, error } = await this.supabase
      .from('departments')
      .select('id, admin_id, institution_id')
      .eq('id', update.departmentId)
      .single();

    if (error || !department) {
      errors.push({
        field: 'departmentId',
        message: 'Department not found',
        code: 'NOT_FOUND'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private mergeSettings(
    currentSettings: DepartmentSettings,
    newSettings: Partial<DepartmentSettings>
  ): DepartmentSettings {
    return {
      ...currentSettings,
      ...newSettings,
      // Deep merge for nested objects
      defaultClassSettings: {
        ...currentSettings.defaultClassSettings,
        ...(newSettings.defaultClassSettings || {})
      },
      assignmentDefaults: {
        ...currentSettings.assignmentDefaults,
        ...(newSettings.assignmentDefaults || {})
      },
      collaborationRules: {
        ...currentSettings.collaborationRules,
        ...(newSettings.collaborationRules || {})
      },
      notificationSettings: {
        ...currentSettings.notificationSettings,
        ...(newSettings.notificationSettings || {})
      },
      gradingPolicies: newSettings.gradingPolicies || currentSettings.gradingPolicies,
      customFields: newSettings.customFields || currentSettings.customFields
    };
  }

  private analyzeInheritance(
    institution: any,
    department: any,
    path: string,
    inherited: string[],
    overridden: string[]
  ): void {
    for (const key in institution) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (department[key] === undefined) {
        inherited.push(currentPath);
      } else if (typeof institution[key] === 'object' && typeof department[key] === 'object') {
        this.analyzeInheritance(institution[key], department[key], currentPath, inherited, overridden);
      } else if (department[key] !== institution[key]) {
        overridden.push(currentPath);
      }
    }
  }

  private trackInheritedFields(target: any, institution: any, path: string, inherited: string[]): void {
    for (const key in institution) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (target[key] === undefined) {
        target[key] = institution[key];
        inherited.push(currentPath);
      } else if (typeof institution[key] === 'object' && typeof target[key] === 'object') {
        this.trackInheritedFields(target[key], institution[key], currentPath, inherited);
      }
    }
  }

  private async logConfigChange(update: DepartmentConfigUpdate): Promise<void> {
    try {
      await this.supabase
        .from('department_config_audit')
        .insert({
          department_id: update.departmentId,
          updated_by: update.updatedBy,
          changes: update.settings,
          reason: update.reason,
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging config change:', error);
    }
  }

  private async notifyConfigChange(
    departmentId: string,
    settings: Partial<DepartmentSettings>,
    updatedBy: string
  ): Promise<void> {
    try {
      // Get department users who should be notified
      const { data: users } = await this.supabase
        .from('user_institutions')
        .select(`
          user_id,
          users (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .eq('department_id', departmentId)
        .in('role', ['teacher', 'department_admin']);

      // Send notifications (implementation would depend on notification service)
      console.log(`Notifying ${users?.length || 0} users about department config changes`);
    } catch (error) {
      console.error('Error notifying config change:', error);
    }
  }

  // Utility methods for nested object operations
  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setNestedProperty(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  private hasNestedProperty(obj: any, path: string): boolean {
    return this.getNestedProperty(obj, path) !== undefined;
  }

  private deleteNestedProperty(obj: any, path: string): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => current?.[key], obj);
    if (target) {
      delete target[lastKey];
    }
  }

  private mergeValues(departmentValue: any, institutionValue: any): any {
    // Custom merge logic based on value types
    if (Array.isArray(departmentValue) && Array.isArray(institutionValue)) {
      return [...institutionValue, ...departmentValue];
    }
    if (typeof departmentValue === 'object' && typeof institutionValue === 'object') {
      return { ...institutionValue, ...departmentValue };
    }
    return departmentValue; // Default to department value
  }
}