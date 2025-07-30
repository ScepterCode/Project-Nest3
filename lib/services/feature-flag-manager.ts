// Feature flag management service with tenant-specific enforcement
import { createClient } from "@supabase/supabase-js";
import { TenantContext, FeatureFlags } from "@/lib/types/institution";

export interface FeatureFlagRule {
  flag: string;
  enabled: boolean;
  conditions?: {
    roles?: string[];
    permissions?: string[];
    subscriptionPlans?: string[];
    institutionTypes?: string[];
  };
  metadata?: Record<string, any>;
}

export interface FeatureFlagEvaluation {
  flag: string;
  enabled: boolean;
  reason: string;
  metadata?: Record<string, any>;
}

export class FeatureFlagManager {
  private supabase;
  private cache: Map<string, { flags: FeatureFlags; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Get feature flags for a specific institution
   */
  async getInstitutionFeatureFlags(institutionId: string): Promise<FeatureFlags> {
    // Check cache first
    const cached = this.cache.get(institutionId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.flags;
    }

    try {
      const { data: institution, error } = await this.supabase
        .from('institutions')
        .select('settings, subscription')
        .eq('id', institutionId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch institution: ${error.message}`);
      }

      const flags: FeatureFlags = {
        allowSelfRegistration: institution.settings?.featureFlags?.allowSelfRegistration ?? true,
        enableAnalytics: institution.settings?.featureFlags?.enableAnalytics ?? true,
        enableIntegrations: institution.settings?.featureFlags?.enableIntegrations ?? false,
        enableCustomBranding: institution.settings?.featureFlags?.enableCustomBranding ?? false,
        enableDepartmentHierarchy: institution.settings?.featureFlags?.enableDepartmentHierarchy ?? true,
        enableContentSharing: institution.settings?.featureFlags?.enableContentSharing ?? true,
        maxDepartments: institution.settings?.featureFlags?.maxDepartments ?? 10,
        maxUsersPerDepartment: institution.settings?.featureFlags?.maxUsersPerDepartment ?? 100,
        ...this.getSubscriptionBasedFlags(institution.subscription)
      };

      // Cache the result
      this.cache.set(institutionId, { flags, timestamp: Date.now() });

      return flags;
    } catch (error) {
      console.error('Error fetching feature flags:', error);
      return this.getDefaultFeatureFlags();
    }
  }

  /**
   * Evaluate a specific feature flag for a tenant context
   */
  async evaluateFeatureFlag(
    context: TenantContext,
    flagName: string,
    rules?: FeatureFlagRule[]
  ): Promise<FeatureFlagEvaluation> {
    // System admins bypass all feature flags
    if (context.role === 'system_admin') {
      return {
        flag: flagName,
        enabled: true,
        reason: 'System admin override'
      };
    }

    // Get institution feature flags
    const institutionFlags = await this.getInstitutionFeatureFlags(context.institutionId);

    // Check if flag exists in institution settings
    const flagValue = (institutionFlags as any)[flagName];
    if (flagValue === undefined) {
      return {
        flag: flagName,
        enabled: false,
        reason: 'Flag not defined'
      };
    }

    // Apply custom rules if provided
    if (rules) {
      for (const rule of rules) {
        if (rule.flag === flagName) {
          const ruleResult = this.evaluateRule(rule, context, institutionFlags);
          if (!ruleResult.enabled) {
            return {
              flag: flagName,
              enabled: false,
              reason: ruleResult.reason,
              metadata: rule.metadata
            };
          }
        }
      }
    }

    return {
      flag: flagName,
      enabled: Boolean(flagValue),
      reason: 'Institution setting',
      metadata: { value: flagValue }
    };
  }

  /**
   * Evaluate multiple feature flags at once
   */
  async evaluateFeatureFlags(
    context: TenantContext,
    flagNames: string[],
    rules?: FeatureFlagRule[]
  ): Promise<Record<string, FeatureFlagEvaluation>> {
    const results: Record<string, FeatureFlagEvaluation> = {};

    for (const flagName of flagNames) {
      results[flagName] = await this.evaluateFeatureFlag(context, flagName, rules);
    }

    return results;
  }

  /**
   * Check if a feature is enabled for the tenant
   */
  async isFeatureEnabled(
    context: TenantContext,
    flagName: string,
    rules?: FeatureFlagRule[]
  ): Promise<boolean> {
    const evaluation = await this.evaluateFeatureFlag(context, flagName, rules);
    return evaluation.enabled;
  }

  /**
   * Update feature flags for an institution
   */
  async updateInstitutionFeatureFlags(
    institutionId: string,
    flags: Partial<FeatureFlags>,
    updatedBy: string
  ): Promise<void> {
    try {
      // Get current settings
      const { data: institution, error: fetchError } = await this.supabase
        .from('institutions')
        .select('settings')
        .eq('id', institutionId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch institution: ${fetchError.message}`);
      }

      // Merge with existing settings
      const updatedSettings = {
        ...institution.settings,
        featureFlags: {
          ...institution.settings?.featureFlags,
          ...flags
        }
      };

      // Update in database
      const { error: updateError } = await this.supabase
        .from('institutions')
        .update({ 
          settings: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', institutionId);

      if (updateError) {
        throw new Error(`Failed to update feature flags: ${updateError.message}`);
      }

      // Clear cache
      this.cache.delete(institutionId);

      // Log the change
      await this.logFeatureFlagChange(institutionId, flags, updatedBy);
    } catch (error) {
      console.error('Error updating feature flags:', error);
      throw error;
    }
  }

  /**
   * Get feature flags that are enforced by subscription plan
   */
  private getSubscriptionBasedFlags(subscription: any): Partial<FeatureFlags> {
    const plan = subscription?.plan || 'free';

    switch (plan) {
      case 'free':
        return {
          enableCustomBranding: false,
          enableIntegrations: false,
          maxDepartments: 3,
          maxUsersPerDepartment: 25
        };
      case 'basic':
        return {
          enableCustomBranding: true,
          enableIntegrations: false,
          maxDepartments: 10,
          maxUsersPerDepartment: 100
        };
      case 'premium':
        return {
          enableCustomBranding: true,
          enableIntegrations: true,
          maxDepartments: 50,
          maxUsersPerDepartment: 500
        };
      case 'enterprise':
        return {
          enableCustomBranding: true,
          enableIntegrations: true,
          maxDepartments: undefined, // Unlimited
          maxUsersPerDepartment: undefined // Unlimited
        };
      default:
        return {};
    }
  }

  /**
   * Get default feature flags for fallback
   */
  private getDefaultFeatureFlags(): FeatureFlags {
    return {
      allowSelfRegistration: true,
      enableAnalytics: false,
      enableIntegrations: false,
      enableCustomBranding: false,
      enableDepartmentHierarchy: true,
      enableContentSharing: true,
      maxDepartments: 5,
      maxUsersPerDepartment: 50
    };
  }

  /**
   * Evaluate a custom rule
   */
  private evaluateRule(
    rule: FeatureFlagRule,
    context: TenantContext,
    institutionFlags: FeatureFlags
  ): { enabled: boolean; reason: string } {
    // Check role conditions
    if (rule.conditions?.roles && !rule.conditions.roles.includes(context.role)) {
      return { enabled: false, reason: 'Role not allowed' };
    }

    // Check permission conditions
    if (rule.conditions?.permissions) {
      const hasAllPermissions = rule.conditions.permissions.every(
        permission => context.permissions.includes(permission)
      );
      if (!hasAllPermissions) {
        return { enabled: false, reason: 'Missing required permissions' };
      }
    }

    // Check subscription plan conditions
    if (rule.conditions?.subscriptionPlans) {
      // Would need to fetch subscription info
      // For now, assume it passes
    }

    return { enabled: rule.enabled, reason: 'Rule evaluation passed' };
  }

  /**
   * Log feature flag changes for audit
   */
  private async logFeatureFlagChange(
    institutionId: string,
    changes: Partial<FeatureFlags>,
    updatedBy: string
  ): Promise<void> {
    const logEntry = {
      institution_id: institutionId,
      changed_by: updatedBy,
      changes: changes,
      timestamp: new Date().toISOString()
    };

    console.log('[FEATURE_FLAG_CHANGE]', JSON.stringify(logEntry));
    
    // In production, this should be stored in an audit table
  }

  /**
   * Validate feature flag constraints
   */
  async validateFeatureFlagConstraints(
    institutionId: string,
    flags: Partial<FeatureFlags>
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Get current subscription
      const { data: institution } = await this.supabase
        .from('institutions')
        .select('subscription')
        .eq('id', institutionId)
        .single();

      const subscriptionFlags = this.getSubscriptionBasedFlags(institution?.subscription);

      // Check subscription constraints
      if (flags.maxDepartments !== undefined && subscriptionFlags.maxDepartments !== undefined) {
        if (flags.maxDepartments > subscriptionFlags.maxDepartments) {
          errors.push(`Max departments (${flags.maxDepartments}) exceeds subscription limit (${subscriptionFlags.maxDepartments})`);
        }
      }

      if (flags.maxUsersPerDepartment !== undefined && subscriptionFlags.maxUsersPerDepartment !== undefined) {
        if (flags.maxUsersPerDepartment > subscriptionFlags.maxUsersPerDepartment) {
          errors.push(`Max users per department (${flags.maxUsersPerDepartment}) exceeds subscription limit (${subscriptionFlags.maxUsersPerDepartment})`);
        }
      }

      // Check feature availability
      if (flags.enableCustomBranding && subscriptionFlags.enableCustomBranding === false) {
        errors.push('Custom branding not available in current subscription plan');
      }

      if (flags.enableIntegrations && subscriptionFlags.enableIntegrations === false) {
        errors.push('Integrations not available in current subscription plan');
      }

      return { isValid: errors.length === 0, errors };
    } catch (error) {
      return { 
        isValid: false, 
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`] 
      };
    }
  }

  /**
   * Clear feature flag cache
   */
  clearCache(institutionId?: string): void {
    if (institutionId) {
      this.cache.delete(institutionId);
    } else {
      this.cache.clear();
    }
  }
}