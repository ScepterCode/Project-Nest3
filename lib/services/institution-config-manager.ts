import { createClient } from '@/lib/supabase/server';
import {
  BrandingConfig,
  InstitutionSettings,
  FeatureFlags,
  ValidationResult,
  ValidationError,
  IntegrationConfig,
  ContentSharingPolicy,
  DataRetentionPolicy,
  CustomField
} from '@/lib/types/institution';

export interface InstitutionConfig {
  settings: InstitutionSettings;
  branding: BrandingConfig;
  featureFlags: FeatureFlags;
}

export interface ConfigUpdateResult {
  success: boolean;
  config?: InstitutionConfig;
  errors?: ValidationError[];
}

export interface BrandingUpdateResult {
  success: boolean;
  branding?: BrandingConfig;
  errors?: ValidationError[];
}

export interface FeatureFlagsUpdateResult {
  success: boolean;
  featureFlags?: FeatureFlags;
  errors?: ValidationError[];
}

export class InstitutionConfigManager {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Get complete institution configuration
   */
  async getConfig(institutionId: string): Promise<InstitutionConfig | null> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('settings, branding')
        .eq('id', institutionId)
        .single();

      if (error || !data) {
        console.error('Error fetching institution config:', error);
        return null;
      }

      return {
        settings: data.settings || this.getDefaultSettings(),
        branding: data.branding || this.getDefaultBranding(),
        featureFlags: data.settings?.featureFlags || this.getDefaultFeatureFlags()
      };
    } catch (error) {
      console.error('Unexpected error fetching config:', error);
      return null;
    }
  }

  /**
   * Update institution configuration with validation
   */
  async updateConfig(institutionId: string, config: Partial<InstitutionConfig>): Promise<ConfigUpdateResult> {
    try {
      // Get current config for validation
      const currentConfig = await this.getConfig(institutionId);
      if (!currentConfig) {
        return {
          success: false,
          errors: [{ field: 'institutionId', message: 'Institution not found', code: 'NOT_FOUND' }]
        };
      }

      // Merge with current config
      const updatedConfig = {
        settings: { ...currentConfig.settings, ...config.settings },
        branding: { ...currentConfig.branding, ...config.branding },
        featureFlags: { ...currentConfig.featureFlags, ...config.featureFlags }
      };

      // Validate the updated configuration
      const validation = this.validateConfig(updatedConfig);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check system constraints
      const constraintValidation = await this.validateSystemConstraints(institutionId, updatedConfig);
      if (!constraintValidation.isValid) {
        return { success: false, errors: constraintValidation.errors };
      }

      // Update in database
      const { error } = await this.supabase
        .from('institutions')
        .update({
          settings: updatedConfig.settings,
          branding: updatedConfig.branding,
          updated_at: new Date().toISOString()
        })
        .eq('id', institutionId);

      if (error) {
        console.error('Error updating institution config:', error);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to update configuration', code: 'DATABASE_ERROR' }]
        };
      }

      return { success: true, config: updatedConfig };
    } catch (error) {
      console.error('Unexpected error updating config:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Get institution branding configuration
   */
  async getBranding(institutionId: string): Promise<BrandingConfig | null> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('branding')
        .eq('id', institutionId)
        .single();

      if (error || !data) {
        console.error('Error fetching branding config:', error);
        return null;
      }

      return data.branding || this.getDefaultBranding();
    } catch (error) {
      console.error('Unexpected error fetching branding:', error);
      return null;
    }
  }

  /**
   * Update institution branding with validation
   */
  async updateBranding(institutionId: string, branding: Partial<BrandingConfig>): Promise<BrandingUpdateResult> {
    try {
      // Get current branding
      const currentBranding = await this.getBranding(institutionId);
      if (!currentBranding) {
        return {
          success: false,
          errors: [{ field: 'institutionId', message: 'Institution not found', code: 'NOT_FOUND' }]
        };
      }

      // Merge with current branding
      const updatedBranding = { ...currentBranding, ...branding };

      // Validate branding configuration
      const validation = this.validateBranding(updatedBranding);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check if custom branding is enabled
      const featureCheck = await this.checkFeatureEnabled(institutionId, 'enableCustomBranding');
      if (!featureCheck.enabled) {
        return {
          success: false,
          errors: [{ field: 'branding', message: featureCheck.reason, code: 'FEATURE_DISABLED' }]
        };
      }

      // Update in database
      const { error } = await this.supabase
        .from('institutions')
        .update({
          branding: updatedBranding,
          updated_at: new Date().toISOString()
        })
        .eq('id', institutionId);

      if (error) {
        console.error('Error updating branding:', error);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to update branding', code: 'DATABASE_ERROR' }]
        };
      }

      return { success: true, branding: updatedBranding };
    } catch (error) {
      console.error('Unexpected error updating branding:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Get institution feature flags
   */
  async getFeatureFlags(institutionId: string): Promise<FeatureFlags | null> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('settings')
        .eq('id', institutionId)
        .single();

      if (error || !data) {
        console.error('Error fetching feature flags:', error);
        return null;
      }

      return data.settings?.featureFlags || this.getDefaultFeatureFlags();
    } catch (error) {
      console.error('Unexpected error fetching feature flags:', error);
      return null;
    }
  }

  /**
   * Update institution feature flags with subscription validation
   */
  async updateFeatureFlags(institutionId: string, flags: Partial<FeatureFlags>): Promise<FeatureFlagsUpdateResult> {
    try {
      // Get current settings
      const { data, error } = await this.supabase
        .from('institutions')
        .select('settings, subscription')
        .eq('id', institutionId)
        .single();

      if (error || !data) {
        return {
          success: false,
          errors: [{ field: 'institutionId', message: 'Institution not found', code: 'NOT_FOUND' }]
        };
      }

      const currentFlags = data.settings?.featureFlags || this.getDefaultFeatureFlags();
      const updatedFlags = { ...currentFlags, ...flags };

      // Validate feature flags against subscription
      const subscriptionValidation = this.validateFeatureFlagsAgainstSubscription(updatedFlags, data.subscription);
      if (!subscriptionValidation.isValid) {
        return { success: false, errors: subscriptionValidation.errors };
      }

      // Validate feature flag constraints
      const constraintValidation = this.validateFeatureFlagConstraints(updatedFlags);
      if (!constraintValidation.isValid) {
        return { success: false, errors: constraintValidation.errors };
      }

      // Update settings with new feature flags
      const updatedSettings = {
        ...data.settings,
        featureFlags: updatedFlags
      };

      const { error: updateError } = await this.supabase
        .from('institutions')
        .update({
          settings: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', institutionId);

      if (updateError) {
        console.error('Error updating feature flags:', updateError);
        return {
          success: false,
          errors: [{ field: 'general', message: 'Failed to update feature flags', code: 'DATABASE_ERROR' }]
        };
      }

      return { success: true, featureFlags: updatedFlags };
    } catch (error) {
      console.error('Unexpected error updating feature flags:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Upload and process institution logo
   */
  async uploadLogo(institutionId: string, logoFile: File): Promise<{ success: boolean; logoUrl?: string; errors?: ValidationError[] }> {
    try {
      // Validate file
      const fileValidation = this.validateLogoFile(logoFile);
      if (!fileValidation.isValid) {
        return { success: false, errors: fileValidation.errors };
      }

      // Check if custom branding is enabled
      const featureCheck = await this.checkFeatureEnabled(institutionId, 'enableCustomBranding');
      if (!featureCheck.enabled) {
        return {
          success: false,
          errors: [{ field: 'logo', message: featureCheck.reason, code: 'FEATURE_DISABLED' }]
        };
      }

      // Generate unique filename
      const fileExtension = logoFile.name.split('.').pop();
      const fileName = `${institutionId}/logo-${Date.now()}.${fileExtension}`;

      // Upload to storage
      const { data, error } = await this.supabase.storage
        .from('institution-assets')
        .upload(fileName, logoFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Error uploading logo:', error);
        return {
          success: false,
          errors: [{ field: 'logo', message: 'Failed to upload logo', code: 'UPLOAD_ERROR' }]
        };
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from('institution-assets')
        .getPublicUrl(fileName);

      const logoUrl = urlData.publicUrl;

      // Update branding with new logo URL
      const brandingUpdate = await this.updateBranding(institutionId, { logo: logoUrl });
      if (!brandingUpdate.success) {
        // Clean up uploaded file if branding update fails
        await this.supabase.storage
          .from('institution-assets')
          .remove([fileName]);
        
        return { success: false, errors: brandingUpdate.errors };
      }

      return { success: true, logoUrl };
    } catch (error) {
      console.error('Unexpected error uploading logo:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Reset branding to default values
   */
  async resetBranding(institutionId: string): Promise<BrandingUpdateResult> {
    const defaultBranding = this.getDefaultBranding();
    return this.updateBranding(institutionId, defaultBranding);
  }

  /**
   * Get default institution settings
   */
  private getDefaultSettings(): InstitutionSettings {
    return {
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
      featureFlags: this.getDefaultFeatureFlags()
    };
  }

  /**
   * Get default branding configuration
   */
  private getDefaultBranding(): BrandingConfig {
    return {
      primaryColor: '#1f2937',
      secondaryColor: '#374151',
      accentColor: '#3b82f6'
    };
  }

  /**
   * Get default feature flags
   */
  private getDefaultFeatureFlags(): FeatureFlags {
    return {
      allowSelfRegistration: false,
      enableAnalytics: true,
      enableIntegrations: false,
      enableCustomBranding: false,
      enableDepartmentHierarchy: true,
      enableContentSharing: false
    };
  }

  /**
   * Validate complete configuration
   */
  private validateConfig(config: InstitutionConfig): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate settings
    const settingsValidation = this.validateSettings(config.settings);
    errors.push(...settingsValidation.errors);

    // Validate branding
    const brandingValidation = this.validateBranding(config.branding);
    errors.push(...brandingValidation.errors);

    // Validate feature flags
    const flagsValidation = this.validateFeatureFlagConstraints(config.featureFlags);
    errors.push(...flagsValidation.errors);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate institution settings
   */
  private validateSettings(settings: InstitutionSettings): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate user role
    const validRoles = ['student', 'teacher', 'admin'];
    if (!validRoles.includes(settings.defaultUserRole)) {
      errors.push({
        field: 'settings.defaultUserRole',
        message: 'Invalid default user role',
        code: 'INVALID_VALUE'
      });
    }

    // Validate content sharing policy
    if (settings.contentSharingPolicy) {
      const validSharingLevels = ['private', 'department', 'institution', 'public'];
      if (!validSharingLevels.includes(settings.contentSharingPolicy.defaultSharingLevel)) {
        errors.push({
          field: 'settings.contentSharingPolicy.defaultSharingLevel',
          message: 'Invalid default sharing level',
          code: 'INVALID_VALUE'
        });
      }
    }

    // Validate data retention policy
    if (settings.dataRetentionPolicy) {
      if (settings.dataRetentionPolicy.retentionPeriodDays < 30) {
        errors.push({
          field: 'settings.dataRetentionPolicy.retentionPeriodDays',
          message: 'Retention period must be at least 30 days',
          code: 'INVALID_VALUE'
        });
      }
    }

    // Validate custom fields
    if (settings.customFields) {
      settings.customFields.forEach((field, index) => {
        if (!field.key || !field.label) {
          errors.push({
            field: `settings.customFields[${index}]`,
            message: 'Custom field must have key and label',
            code: 'REQUIRED'
          });
        }

        const validTypes = ['text', 'number', 'boolean', 'select', 'date'];
        if (!validTypes.includes(field.type)) {
          errors.push({
            field: `settings.customFields[${index}].type`,
            message: 'Invalid custom field type',
            code: 'INVALID_VALUE'
          });
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate branding configuration
   */
  private validateBranding(branding: BrandingConfig): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate colors (hex format)
    const colorFields = ['primaryColor', 'secondaryColor', 'accentColor'];
    colorFields.forEach(field => {
      const color = branding[field as keyof BrandingConfig] as string;
      if (color && !this.isValidHexColor(color)) {
        errors.push({
          field: `branding.${field}`,
          message: 'Invalid color format (must be hex)',
          code: 'INVALID_FORMAT'
        });
      }
    });

    // Validate logo URL if provided
    if (branding.logo && !this.isValidUrl(branding.logo)) {
      errors.push({
        field: 'branding.logo',
        message: 'Invalid logo URL format',
        code: 'INVALID_FORMAT'
      });
    }

    // Validate favicon URL if provided
    if (branding.favicon && !this.isValidUrl(branding.favicon)) {
      errors.push({
        field: 'branding.favicon',
        message: 'Invalid favicon URL format',
        code: 'INVALID_FORMAT'
      });
    }

    // Validate custom CSS length
    if (branding.customCSS && branding.customCSS.length > 10000) {
      errors.push({
        field: 'branding.customCSS',
        message: 'Custom CSS too long (max 10,000 characters)',
        code: 'INVALID_LENGTH'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate feature flags against subscription plan
   */
  private validateFeatureFlagsAgainstSubscription(flags: FeatureFlags, subscription: any): ValidationResult {
    const errors: ValidationError[] = [];

    // Check subscription plan restrictions
    const plan = subscription?.plan || 'free';

    if (plan === 'free') {
      if (flags.enableCustomBranding) {
        errors.push({
          field: 'featureFlags.enableCustomBranding',
          message: 'Custom branding requires paid subscription',
          code: 'SUBSCRIPTION_REQUIRED'
        });
      }

      if (flags.enableIntegrations) {
        errors.push({
          field: 'featureFlags.enableIntegrations',
          message: 'Integrations require paid subscription',
          code: 'SUBSCRIPTION_REQUIRED'
        });
      }

      if (flags.maxDepartments && flags.maxDepartments > 3) {
        errors.push({
          field: 'featureFlags.maxDepartments',
          message: 'Free plan limited to 3 departments',
          code: 'SUBSCRIPTION_LIMIT'
        });
      }
    }

    if (plan === 'basic') {
      if (flags.maxDepartments && flags.maxDepartments > 10) {
        errors.push({
          field: 'featureFlags.maxDepartments',
          message: 'Basic plan limited to 10 departments',
          code: 'SUBSCRIPTION_LIMIT'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate feature flag constraints
   */
  private validateFeatureFlagConstraints(flags: FeatureFlags): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate numeric limits
    if (flags.maxDepartments !== undefined && flags.maxDepartments < 1) {
      errors.push({
        field: 'featureFlags.maxDepartments',
        message: 'Maximum departments must be at least 1',
        code: 'INVALID_VALUE'
      });
    }

    if (flags.maxUsersPerDepartment !== undefined && flags.maxUsersPerDepartment < 1) {
      errors.push({
        field: 'featureFlags.maxUsersPerDepartment',
        message: 'Maximum users per department must be at least 1',
        code: 'INVALID_VALUE'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate system constraints
   */
  private async validateSystemConstraints(institutionId: string, config: InstitutionConfig): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // Check department limits if specified
      if (config.featureFlags.maxDepartments) {
        const { count } = await this.supabase
          .from('departments')
          .select('id', { count: 'exact' })
          .eq('institution_id', institutionId)
          .eq('status', 'active');

        if (count && count > config.featureFlags.maxDepartments) {
          errors.push({
            field: 'featureFlags.maxDepartments',
            message: `Cannot set limit below current department count (${count})`,
            code: 'CONSTRAINT_VIOLATION'
          });
        }
      }

      // Additional system constraint checks can be added here

    } catch (error) {
      console.error('Error validating system constraints:', error);
      errors.push({
        field: 'general',
        message: 'Error validating system constraints',
        code: 'VALIDATION_ERROR'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if a feature is enabled for the institution
   */
  private async checkFeatureEnabled(institutionId: string, feature: keyof FeatureFlags): Promise<{ enabled: boolean; reason: string }> {
    try {
      const flags = await this.getFeatureFlags(institutionId);
      if (!flags) {
        return { enabled: false, reason: 'Institution not found' };
      }

      if (!flags[feature]) {
        return { enabled: false, reason: `Feature ${feature} is not enabled for this institution` };
      }

      return { enabled: true, reason: 'Feature is enabled' };
    } catch (error) {
      console.error('Error checking feature flag:', error);
      return { enabled: false, reason: 'Error checking feature availability' };
    }
  }

  /**
   * Validate logo file
   */
  private validateLogoFile(file: File): ValidationResult {
    const errors: ValidationError[] = [];

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      errors.push({
        field: 'logo',
        message: 'Logo file size must be less than 5MB',
        code: 'FILE_TOO_LARGE'
      });
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      errors.push({
        field: 'logo',
        message: 'Logo must be JPEG, PNG, or SVG format',
        code: 'INVALID_FILE_TYPE'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate hex color format
   */
  private isValidHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}