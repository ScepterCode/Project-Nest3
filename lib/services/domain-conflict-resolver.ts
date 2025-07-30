import { createClient } from '@/lib/supabase/server';
import { InstitutionManager } from './institution-manager';
import { Institution, ValidationError } from '@/lib/types/institution';

export interface DomainConflictInfo {
  domain: string;
  subdomain?: string;
  conflictType: 'domain' | 'subdomain' | 'both';
  existingInstitution: {
    id: string;
    name: string;
    status: string;
    createdAt: Date;
  };
  suggestions: string[];
}

export interface DomainResolutionOptions {
  preferredDomain?: string;
  preferredSubdomain?: string;
  allowSuggestions?: boolean;
  maxSuggestions?: number;
}

export class DomainConflictResolver {
  private supabase;
  private institutionManager: InstitutionManager;

  constructor() {
    this.supabase = createClient();
    this.institutionManager = new InstitutionManager();
  }

  /**
   * Check for domain conflicts and provide resolution options
   */
  async checkDomainConflicts(
    domain: string, 
    subdomain?: string, 
    excludeInstitutionId?: string
  ): Promise<{ hasConflict: boolean; conflicts: DomainConflictInfo[]; errors?: ValidationError[] }> {
    try {
      const conflicts: DomainConflictInfo[] = [];

      // Check domain conflicts
      const domainConflict = await this.checkDomainConflict(domain, excludeInstitutionId);
      if (domainConflict) {
        const suggestions = await this.generateDomainSuggestions(domain);
        conflicts.push({
          domain,
          conflictType: 'domain',
          existingInstitution: domainConflict,
          suggestions
        });
      }

      // Check subdomain conflicts if provided
      if (subdomain) {
        const subdomainConflict = await this.checkSubdomainConflict(subdomain, excludeInstitutionId);
        if (subdomainConflict) {
          const suggestions = await this.generateSubdomainSuggestions(subdomain);
          conflicts.push({
            domain,
            subdomain,
            conflictType: 'subdomain',
            existingInstitution: subdomainConflict,
            suggestions
          });
        }
      }

      return {
        hasConflict: conflicts.length > 0,
        conflicts
      };

    } catch (error) {
      console.error('Error checking domain conflicts:', error);
      return {
        hasConflict: false,
        conflicts: [],
        errors: [{ field: 'general', message: 'Error checking domain conflicts', code: 'CONFLICT_CHECK_ERROR' }]
      };
    }
  }

  /**
   * Resolve domain conflicts with automatic suggestions
   */
  async resolveDomainConflicts(
    originalDomain: string,
    originalSubdomain?: string,
    options: DomainResolutionOptions = {}
  ): Promise<{ 
    success: boolean; 
    resolvedDomain?: string; 
    resolvedSubdomain?: string; 
    suggestions?: { domains: string[]; subdomains: string[] };
    errors?: ValidationError[] 
  }> {
    try {
      const conflicts = await this.checkDomainConflicts(originalDomain, originalSubdomain);
      
      if (!conflicts.hasConflict) {
        return {
          success: true,
          resolvedDomain: originalDomain,
          resolvedSubdomain: originalSubdomain
        };
      }

      // Try preferred options first
      if (options.preferredDomain) {
        const preferredCheck = await this.checkDomainConflicts(options.preferredDomain, options.preferredSubdomain);
        if (!preferredCheck.hasConflict) {
          return {
            success: true,
            resolvedDomain: options.preferredDomain,
            resolvedSubdomain: options.preferredSubdomain
          };
        }
      }

      // Generate automatic suggestions
      if (options.allowSuggestions !== false) {
        const domainSuggestions = await this.generateDomainSuggestions(originalDomain, options.maxSuggestions);
        const subdomainSuggestions = originalSubdomain 
          ? await this.generateSubdomainSuggestions(originalSubdomain, options.maxSuggestions)
          : [];

        // Find first available combination
        for (const suggestedDomain of domainSuggestions) {
          const suggestionCheck = await this.checkDomainConflicts(suggestedDomain, originalSubdomain);
          if (!suggestionCheck.hasConflict) {
            return {
              success: true,
              resolvedDomain: suggestedDomain,
              resolvedSubdomain: originalSubdomain,
              suggestions: { domains: domainSuggestions, subdomains: subdomainSuggestions }
            };
          }
        }

        return {
          success: false,
          suggestions: { domains: domainSuggestions, subdomains: subdomainSuggestions },
          errors: [{ field: 'domain', message: 'Unable to automatically resolve domain conflict', code: 'AUTO_RESOLUTION_FAILED' }]
        };
      }

      return {
        success: false,
        errors: [{ field: 'domain', message: 'Domain conflict exists and no resolution options provided', code: 'CONFLICT_UNRESOLVED' }]
      };

    } catch (error) {
      console.error('Error resolving domain conflicts:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Error resolving domain conflicts', code: 'RESOLUTION_ERROR' }]
      };
    }
  }

  /**
   * Get detailed conflict information for manual resolution
   */
  async getConflictDetails(domain: string, subdomain?: string): Promise<{
    conflicts: Array<{
      type: 'domain' | 'subdomain';
      value: string;
      institution: Institution;
      canOverride: boolean;
      overrideReason?: string;
    }>;
    resolutionOptions: {
      canForceOverride: boolean;
      canContactExisting: boolean;
      suggestedAlternatives: string[];
    };
  }> {
    try {
      const conflicts = [];
      const suggestedAlternatives = [];

      // Check domain conflict details
      const domainConflict = await this.checkDomainConflict(domain);
      if (domainConflict) {
        const institution = await this.institutionManager.getInstitutionById(domainConflict.id);
        if (institution) {
          conflicts.push({
            type: 'domain' as const,
            value: domain,
            institution,
            canOverride: institution.status === 'inactive' || institution.status === 'suspended',
            overrideReason: institution.status === 'inactive' 
              ? 'Institution is archived and domain can be reclaimed'
              : institution.status === 'suspended'
              ? 'Institution is suspended and domain may be available'
              : undefined
          });
        }
        
        const domainSuggestions = await this.generateDomainSuggestions(domain, 5);
        suggestedAlternatives.push(...domainSuggestions);
      }

      // Check subdomain conflict details
      if (subdomain) {
        const subdomainConflict = await this.checkSubdomainConflict(subdomain);
        if (subdomainConflict) {
          const institution = await this.institutionManager.getInstitutionById(subdomainConflict.id);
          if (institution) {
            conflicts.push({
              type: 'subdomain' as const,
              value: subdomain,
              institution,
              canOverride: institution.status === 'inactive' || institution.status === 'suspended',
              overrideReason: institution.status === 'inactive' 
                ? 'Institution is archived and subdomain can be reclaimed'
                : institution.status === 'suspended'
                ? 'Institution is suspended and subdomain may be available'
                : undefined
            });
          }

          const subdomainSuggestions = await this.generateSubdomainSuggestions(subdomain, 5);
          suggestedAlternatives.push(...subdomainSuggestions);
        }
      }

      return {
        conflicts,
        resolutionOptions: {
          canForceOverride: conflicts.some(c => c.canOverride),
          canContactExisting: conflicts.some(c => c.institution.status === 'active'),
          suggestedAlternatives: [...new Set(suggestedAlternatives)] // Remove duplicates
        }
      };

    } catch (error) {
      console.error('Error getting conflict details:', error);
      return {
        conflicts: [],
        resolutionOptions: {
          canForceOverride: false,
          canContactExisting: false,
          suggestedAlternatives: []
        }
      };
    }
  }

  /**
   * Force override domain conflict (admin only)
   */
  async forceOverrideDomainConflict(
    domain: string,
    subdomain: string | undefined,
    newInstitutionId: string,
    adminUserId: string,
    reason: string
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      const conflicts = await this.getConflictDetails(domain, subdomain);
      
      // Check if override is allowed
      const canOverride = conflicts.conflicts.every(c => c.canOverride);
      if (!canOverride) {
        return {
          success: false,
          errors: [{ field: 'domain', message: 'Cannot override active institution domains', code: 'OVERRIDE_NOT_ALLOWED' }]
        };
      }

      // Clear existing domain/subdomain assignments
      for (const conflict of conflicts.conflicts) {
        if (conflict.type === 'domain') {
          await this.supabase
            .from('institutions')
            .update({ 
              domain: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', conflict.institution.id);
        } else if (conflict.type === 'subdomain') {
          await this.supabase
            .from('institutions')
            .update({ 
              subdomain: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', conflict.institution.id);
        }
      }

      // Log the override action
      await this.logDomainOverride(domain, subdomain, newInstitutionId, adminUserId, reason, conflicts.conflicts);

      return { success: true };

    } catch (error) {
      console.error('Error forcing domain override:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Error overriding domain conflict', code: 'OVERRIDE_ERROR' }]
      };
    }
  }

  /**
   * Check for domain conflict
   */
  private async checkDomainConflict(domain: string, excludeId?: string): Promise<{ id: string; name: string; status: string; createdAt: Date } | null> {
    try {
      let query = this.supabase
        .from('institutions')
        .select('id, name, status, created_at')
        .eq('domain', domain);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data } = await query.single();

      if (data) {
        return {
          id: data.id,
          name: data.name,
          status: data.status,
          createdAt: new Date(data.created_at)
        };
      }

      return null;
    } catch (error) {
      // Single query throws error if no results, which is expected
      return null;
    }
  }

  /**
   * Check for subdomain conflict
   */
  private async checkSubdomainConflict(subdomain: string, excludeId?: string): Promise<{ id: string; name: string; status: string; createdAt: Date } | null> {
    try {
      let query = this.supabase
        .from('institutions')
        .select('id, name, status, created_at')
        .eq('subdomain', subdomain);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data } = await query.single();

      if (data) {
        return {
          id: data.id,
          name: data.name,
          status: data.status,
          createdAt: new Date(data.created_at)
        };
      }

      return null;
    } catch (error) {
      // Single query throws error if no results, which is expected
      return null;
    }
  }

  /**
   * Generate domain suggestions
   */
  private async generateDomainSuggestions(originalDomain: string, maxSuggestions: number = 5): Promise<string[]> {
    const suggestions: string[] = [];
    const baseDomain = originalDomain.split('.')[0];
    const extension = originalDomain.substring(originalDomain.indexOf('.'));

    // Generate variations
    const variations = [
      `${baseDomain}-edu${extension}`,
      `${baseDomain}-academy${extension}`,
      `${baseDomain}-institute${extension}`,
      `${baseDomain}-college${extension}`,
      `${baseDomain}-university${extension}`,
      `${baseDomain}1${extension}`,
      `${baseDomain}2${extension}`,
      `new-${baseDomain}${extension}`,
      `${baseDomain}-online${extension}`,
      `${baseDomain}-campus${extension}`
    ];

    // Check availability of each variation
    for (const variation of variations) {
      if (suggestions.length >= maxSuggestions) break;
      
      const conflict = await this.checkDomainConflict(variation);
      if (!conflict) {
        suggestions.push(variation);
      }
    }

    return suggestions;
  }

  /**
   * Generate subdomain suggestions
   */
  private async generateSubdomainSuggestions(originalSubdomain: string, maxSuggestions: number = 5): Promise<string[]> {
    const suggestions: string[] = [];

    // Generate variations
    const variations = [
      `${originalSubdomain}-edu`,
      `${originalSubdomain}-academy`,
      `${originalSubdomain}-institute`,
      `${originalSubdomain}1`,
      `${originalSubdomain}2`,
      `new-${originalSubdomain}`,
      `${originalSubdomain}-online`,
      `${originalSubdomain}-campus`,
      `${originalSubdomain}-main`,
      `${originalSubdomain}-portal`
    ];

    // Check availability of each variation
    for (const variation of variations) {
      if (suggestions.length >= maxSuggestions) break;
      
      const conflict = await this.checkSubdomainConflict(variation);
      if (!conflict) {
        suggestions.push(variation);
      }
    }

    return suggestions;
  }

  /**
   * Log domain override action
   */
  private async logDomainOverride(
    domain: string,
    subdomain: string | undefined,
    newInstitutionId: string,
    adminUserId: string,
    reason: string,
    conflicts: any[]
  ): Promise<void> {
    try {
      // In a real implementation, this would log to an audit table
      console.log('Domain override performed', {
        domain,
        subdomain,
        newInstitutionId,
        adminUserId,
        reason,
        conflictsResolved: conflicts.length,
        timestamp: new Date().toISOString()
      });

      // Example audit log insertion:
      // await this.supabase.from('domain_override_log').insert({
      //   domain,
      //   subdomain,
      //   new_institution_id: newInstitutionId,
      //   admin_user_id: adminUserId,
      //   reason,
      //   conflicts_resolved: JSON.stringify(conflicts),
      //   created_at: new Date().toISOString()
      // });

    } catch (error) {
      console.error('Error logging domain override:', error);
    }
  }
}