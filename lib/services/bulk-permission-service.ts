/**
 * Bulk Permission Service
 * 
 * Optimized service for checking multiple permissions at once,
 * particularly useful for UI state management where many permission
 * checks are needed simultaneously.
 */

import { PermissionChecker, ResourceContext, Action } from './permission-checker';
import { PermissionResult } from '../types/role-management';

export interface UIPermissionCheck {
  id: string; // Unique identifier for the check
  permission: string;
  context?: ResourceContext;
}

export interface UIResourceCheck {
  id: string;
  resourceId: string;
  resourceType: string;
  action: Action;
  context?: Partial<ResourceContext>;
}

export interface UIPermissionResult {
  id: string;
  granted: boolean;
  reason?: string;
}

export interface BulkPermissionOptions {
  cacheResults?: boolean;
  failFast?: boolean; // Stop on first failure
  timeout?: number; // Timeout in milliseconds
}

export class BulkPermissionService {
  private permissionChecker: PermissionChecker;
  private resultCache: Map<string, { result: UIPermissionResult; expires: number }>;
  private readonly cacheTtl: number = 300000; // 5 minutes

  constructor(permissionChecker: PermissionChecker) {
    this.permissionChecker = permissionChecker;
    this.resultCache = new Map();
  }

  /**
   * Check multiple permissions for UI state management
   */
  async checkUIPermissions(
    userId: string,
    checks: UIPermissionCheck[],
    options: BulkPermissionOptions = {}
  ): Promise<Map<string, UIPermissionResult>> {
    const results = new Map<string, UIPermissionResult>();
    const uncachedChecks: UIPermissionCheck[] = [];

    // Check cache first if enabled
    if (options.cacheResults !== false) {
      for (const check of checks) {
        const cacheKey = this.generateUICacheKey(userId, check);
        const cached = this.resultCache.get(cacheKey);
        
        if (cached && cached.expires > Date.now()) {
          results.set(check.id, cached.result);
        } else {
          uncachedChecks.push(check);
        }
      }
    } else {
      uncachedChecks.push(...checks);
    }

    if (uncachedChecks.length === 0) {
      return results;
    }

    // Process uncached checks
    const permissionChecks = uncachedChecks.map(check => ({
      permission: check.permission,
      context: check.context
    }));

    try {
      const permissionResults = await this.executeWithTimeout(
        () => this.permissionChecker.checkBulkPermissions(userId, permissionChecks),
        options.timeout || 5000
      );

      // Map results back to UI format
      for (let i = 0; i < uncachedChecks.length; i++) {
        const check = uncachedChecks[i];
        const permissionResult = permissionResults[i];
        
        const uiResult: UIPermissionResult = {
          id: check.id,
          granted: permissionResult.granted,
          reason: permissionResult.reason
        };

        results.set(check.id, uiResult);

        // Cache result if enabled
        if (options.cacheResults !== false) {
          const cacheKey = this.generateUICacheKey(userId, check);
          this.resultCache.set(cacheKey, {
            result: uiResult,
            expires: Date.now() + this.cacheTtl
          });
        }

        // Fail fast if enabled and permission denied
        if (options.failFast && !uiResult.granted) {
          break;
        }
      }
    } catch (error) {
      // Handle errors by marking all unchecked permissions as denied
      for (const check of uncachedChecks) {
        if (!results.has(check.id)) {
          results.set(check.id, {
            id: check.id,
            granted: false,
            reason: error instanceof Error ? error.message : 'Permission check failed'
          });
        }
      }
    }

    return results;
  }

  /**
   * Check multiple resource access permissions
   */
  async checkUIResourceAccess(
    userId: string,
    checks: UIResourceCheck[],
    options: BulkPermissionOptions = {}
  ): Promise<Map<string, UIPermissionResult>> {
    const results = new Map<string, UIPermissionResult>();
    const processedChecks: Promise<void>[] = [];

    for (const check of checks) {
      const checkPromise = this.processResourceCheck(userId, check, results);
      processedChecks.push(checkPromise);

      // Fail fast if enabled
      if (options.failFast) {
        await checkPromise;
        const result = results.get(check.id);
        if (result && !result.granted) {
          break;
        }
      }
    }

    // Wait for all checks to complete if not failing fast
    if (!options.failFast) {
      await Promise.all(processedChecks);
    }

    return results;
  }

  /**
   * Check permissions for a list of UI components/features
   */
  async checkFeaturePermissions(
    userId: string,
    features: Array<{
      id: string;
      requiredPermissions: string[];
      requireAll?: boolean;
      context?: ResourceContext;
    }>,
    options: BulkPermissionOptions = {}
  ): Promise<Map<string, UIPermissionResult>> {
    const results = new Map<string, UIPermissionResult>();
    
    for (const feature of features) {
      try {
        const checks = feature.requiredPermissions.map(permission => ({
          permission,
          context: feature.context
        }));

        const permissionResults = await this.permissionChecker.checkBulkPermissions(
          userId,
          checks
        );

        const grantedCount = permissionResults.filter(r => r.granted).length;
        const requireAll = feature.requireAll !== false; // Default to true
        
        const granted = requireAll 
          ? grantedCount === feature.requiredPermissions.length
          : grantedCount > 0;

        results.set(feature.id, {
          id: feature.id,
          granted,
          reason: granted 
            ? 'Feature access granted'
            : `Required ${requireAll ? 'all' : 'any'} of: ${feature.requiredPermissions.join(', ')}`
        });

        // Fail fast if enabled and feature access denied
        if (options.failFast && !granted) {
          break;
        }
      } catch (error) {
        results.set(feature.id, {
          id: feature.id,
          granted: false,
          reason: error instanceof Error ? error.message : 'Feature check failed'
        });
      }
    }

    return results;
  }

  /**
   * Get permissions for navigation menu items
   */
  async checkNavigationPermissions(
    userId: string,
    menuItems: Array<{
      id: string;
      path: string;
      requiredPermission?: string;
      requiredRole?: string;
      adminLevel?: 'system' | 'institution' | 'department';
      context?: ResourceContext;
    }>,
    options: BulkPermissionOptions = {}
  ): Promise<Map<string, UIPermissionResult>> {
    const results = new Map<string, UIPermissionResult>();

    for (const item of menuItems) {
      try {
        let granted = true;
        let reason = 'Navigation access granted';

        // Check required permission
        if (item.requiredPermission) {
          granted = await this.permissionChecker.hasPermission(
            userId,
            item.requiredPermission,
            item.context
          );
          if (!granted) {
            reason = `Missing permission: ${item.requiredPermission}`;
          }
        }

        // Check admin level
        if (granted && item.adminLevel) {
          granted = await this.permissionChecker.isAdmin(userId, item.adminLevel);
          if (!granted) {
            reason = `Requires ${item.adminLevel} admin privileges`;
          }
        }

        results.set(item.id, {
          id: item.id,
          granted,
          reason
        });

        // Fail fast if enabled and access denied
        if (options.failFast && !granted) {
          break;
        }
      } catch (error) {
        results.set(item.id, {
          id: item.id,
          granted: false,
          reason: error instanceof Error ? error.message : 'Navigation check failed'
        });
      }
    }

    return results;
  }

  /**
   * Invalidate cache for specific user
   */
  invalidateUserCache(userId: string): void {
    const keysToDelete: string[] = [];
    this.resultCache.forEach((value, key) => {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.resultCache.delete(key));
    
    // Also invalidate the underlying permission checker cache
    this.permissionChecker.invalidateUserCache(userId);
  }

  /**
   * Clear all cached results
   */
  clearCache(): void {
    this.resultCache.clear();
    this.permissionChecker.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    expiredEntries: number;
  } {
    const now = Date.now();
    let expiredEntries = 0;
    
    this.resultCache.forEach((value) => {
      if (value.expires <= now) {
        expiredEntries++;
      }
    });

    return {
      size: this.resultCache.size,
      hitRate: 0, // Would need to track hits/misses to calculate
      expiredEntries
    };
  }

  // Private helper methods

  private async processResourceCheck(
    userId: string,
    check: UIResourceCheck,
    results: Map<string, UIPermissionResult>
  ): Promise<void> {
    try {
      const context: ResourceContext = {
        resourceId: check.resourceId,
        resourceType: check.resourceType,
        ownerId: check.context?.ownerId,
        departmentId: check.context?.departmentId,
        institutionId: check.context?.institutionId,
        metadata: check.context?.metadata
      };

      const granted = await this.permissionChecker.canAccessResource(
        userId,
        check.resourceId,
        check.action,
        context
      );

      results.set(check.id, {
        id: check.id,
        granted,
        reason: granted 
          ? 'Resource access granted'
          : `Cannot ${check.action} ${check.resourceType} ${check.resourceId}`
      });
    } catch (error) {
      results.set(check.id, {
        id: check.id,
        granted: false,
        reason: error instanceof Error ? error.message : 'Resource check failed'
      });
    }
  }

  private generateUICacheKey(userId: string, check: UIPermissionCheck): string {
    const contextKey = check.context 
      ? `${check.context.resourceId}:${check.context.resourceType}:${check.context.departmentId}:${check.context.institutionId}`
      : 'global';
    return `${userId}:${check.permission}:${contextKey}`;
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
}