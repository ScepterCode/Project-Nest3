/**
 * Permission Checker Service
 * 
 * Handles permission validation and access control checks.
 * Provides caching and bulk checking capabilities for performance.
 */

import {
  UserRole,
  Permission,
  PermissionResult,
  PermissionCondition,
  PermissionScope,
  UserRoleAssignment,
  RolePermission
} from '../types/role-management';

export interface PermissionCheckerConfig {
  cacheEnabled: boolean;
  cacheTtl: number; // seconds
  bulkCheckLimit: number;
}

export interface ResourceContext {
  resourceId: string;
  resourceType: string;
  ownerId?: string;
  departmentId?: string;
  institutionId?: string;
  metadata?: Record<string, any>;
}

export enum Action {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage',
  APPROVE = 'approve'
}

export class PermissionChecker {
  private config: PermissionCheckerConfig;
  private permissionCache: Map<string, { result: boolean; expires: number }>;

  constructor(config: PermissionCheckerConfig) {
    this.config = config;
    this.permissionCache = new Map();
  }

  /**
   * Check if a user has a specific permission
   */
  async hasPermission(
    userId: string,
    permissionName: string,
    context?: ResourceContext
  ): Promise<boolean> {
    const cacheKey = this.generateCacheKey(userId, permissionName, context);
    
    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.permissionCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.result;
      }
    }

    // Get user's roles and permissions
    const userRoles = await this.getUserRoles(userId);
    const permission = await this.getPermission(permissionName);
    
    if (!permission) {
      return false;
    }

    // Check each role for the permission
    let hasPermission = false;
    for (const roleAssignment of userRoles) {
      if (await this.roleHasPermission(roleAssignment, permission, context)) {
        hasPermission = true;
        break;
      }
    }

    // Cache the result
    if (this.config.cacheEnabled) {
      this.permissionCache.set(cacheKey, {
        result: hasPermission,
        expires: Date.now() + (this.config.cacheTtl * 1000)
      });
    }

    return hasPermission;
  }

  /**
   * Check if a user can access a specific resource with a given action
   */
  async canAccessResource(
    userId: string,
    resourceId: string,
    action: Action,
    context?: Partial<ResourceContext>
  ): Promise<boolean> {
    const fullContext: ResourceContext = {
      resourceId,
      resourceType: context?.resourceType || 'unknown',
      ownerId: context?.ownerId,
      departmentId: context?.departmentId,
      institutionId: context?.institutionId,
      metadata: context?.metadata
    };

    // Map action to permission names
    const permissionNames = this.mapActionToPermissions(action, fullContext.resourceType);
    
    // Check if user has any of the required permissions
    for (const permissionName of permissionNames) {
      if (await this.hasPermission(userId, permissionName, fullContext)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    const userRoles = await this.getUserRoles(userId);
    const permissions = new Set<Permission>();

    for (const roleAssignment of userRoles) {
      const rolePermissions = await this.getRolePermissions(roleAssignment.role);
      rolePermissions.forEach(permission => permissions.add(permission));
    }

    return Array.from(permissions);
  }

  /**
   * Check multiple permissions at once for performance
   */
  async checkBulkPermissions(
    userId: string,
    permissionChecks: Array<{
      permission: string;
      context?: ResourceContext;
    }>
  ): Promise<PermissionResult[]> {
    if (permissionChecks.length > this.config.bulkCheckLimit) {
      throw new Error(`Bulk check limit exceeded: ${this.config.bulkCheckLimit}`);
    }

    const results: PermissionResult[] = [];
    
    // Get user roles once for all checks
    const userRoles = await this.getUserRoles(userId);
    
    for (const check of permissionChecks) {
      try {
        const granted = await this.hasPermission(userId, check.permission, check.context);
        results.push({
          permission: check.permission,
          granted,
          reason: granted ? 'Permission granted' : 'Permission denied'
        });
      } catch (error) {
        results.push({
          permission: check.permission,
          granted: false,
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Check if a user has admin privileges for a specific scope
   */
  async isAdmin(
    userId: string,
    scope: 'system' | 'institution' | 'department',
    scopeId?: string
  ): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    
    for (const roleAssignment of userRoles) {
      if (this.isAdminRole(roleAssignment.role, scope, roleAssignment, scopeId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Invalidate permission cache for a user
   */
  invalidateUserCache(userId: string): void {
    if (!this.config.cacheEnabled) return;

    const keysToDelete: string[] = [];
    this.permissionCache.forEach((value, key) => {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.permissionCache.delete(key));
  }

  /**
   * Clear all cached permissions
   */
  clearCache(): void {
    this.permissionCache.clear();
  }

  // Private helper methods

  private async roleHasPermission(
    roleAssignment: UserRoleAssignment,
    permission: Permission,
    context?: ResourceContext
  ): Promise<boolean> {
    // Get role permission mappings
    const rolePermissionMappings = await this.getRolePermissionMappings(roleAssignment.role);
    const rolePermission = rolePermissionMappings.find(rp => rp.permissionId === permission.id);
    
    if (!rolePermission) {
      return false;
    }

    // Check permission scope
    if (!this.checkPermissionScope(permission, roleAssignment, context)) {
      return false;
    }

    // Check permission conditions
    if (rolePermission.conditions && rolePermission.conditions.length > 0) {
      return await this.checkPermissionConditions(
        rolePermission.conditions,
        roleAssignment,
        context
      );
    }

    return true;
  }

  private checkPermissionScope(
    permission: Permission,
    roleAssignment: UserRoleAssignment,
    context?: ResourceContext
  ): boolean {
    switch (permission.scope) {
      case PermissionScope.SELF:
        return !context || context.ownerId === roleAssignment.userId;
      
      case PermissionScope.DEPARTMENT:
        return !context || 
               !context.departmentId || 
               context.departmentId === roleAssignment.departmentId;
      
      case PermissionScope.INSTITUTION:
        return !context || 
               !context.institutionId || 
               context.institutionId === roleAssignment.institutionId;
      
      case PermissionScope.SYSTEM:
        return roleAssignment.role === UserRole.SYSTEM_ADMIN;
      
      default:
        return false;
    }
  }

  private async checkPermissionConditions(
    conditions: PermissionCondition[],
    roleAssignment: UserRoleAssignment,
    context?: ResourceContext
  ): Promise<boolean> {
    for (const condition of conditions) {
      if (!await this.checkSingleCondition(condition, roleAssignment, context)) {
        return false;
      }
    }
    return true;
  }

  private async checkSingleCondition(
    condition: PermissionCondition,
    roleAssignment: UserRoleAssignment,
    context?: ResourceContext
  ): Promise<boolean> {
    switch (condition.type) {
      case 'department_match':
        return context?.departmentId === roleAssignment.departmentId;
      
      case 'institution_match':
        return context?.institutionId === roleAssignment.institutionId;
      
      case 'resource_owner':
        return context?.ownerId === roleAssignment.userId;
      
      case 'time_based':
        return this.checkTimeBasedCondition(condition.parameters, roleAssignment);
      
      default:
        return false;
    }
  }

  private checkTimeBasedCondition(
    parameters: Record<string, any>,
    roleAssignment: UserRoleAssignment
  ): boolean {
    const now = new Date();
    
    if (parameters.startTime) {
      const startTime = new Date(parameters.startTime);
      if (now < startTime) return false;
    }
    
    if (parameters.endTime) {
      const endTime = new Date(parameters.endTime);
      if (now > endTime) return false;
    }
    
    if (roleAssignment.expiresAt && now > roleAssignment.expiresAt) {
      return false;
    }
    
    return true;
  }

  private isAdminRole(
    role: UserRole,
    scope: 'system' | 'institution' | 'department',
    roleAssignment: UserRoleAssignment,
    scopeId?: string
  ): boolean {
    switch (scope) {
      case 'system':
        return role === UserRole.SYSTEM_ADMIN;
      
      case 'institution':
        return (role === UserRole.INSTITUTION_ADMIN || role === UserRole.SYSTEM_ADMIN) &&
               (!scopeId || roleAssignment.institutionId === scopeId);
      
      case 'department':
        return (role === UserRole.DEPARTMENT_ADMIN || 
                role === UserRole.INSTITUTION_ADMIN || 
                role === UserRole.SYSTEM_ADMIN) &&
               (!scopeId || roleAssignment.departmentId === scopeId);
      
      default:
        return false;
    }
  }

  private mapActionToPermissions(action: Action, resourceType: string): string[] {
    const basePermissions = [`${resourceType}.${action}`];
    
    // Add manage permission as it typically includes all actions
    if (action !== Action.MANAGE) {
      basePermissions.push(`${resourceType}.${Action.MANAGE}`);
    }
    
    return basePermissions;
  }

  private generateCacheKey(
    userId: string,
    permission: string,
    context?: ResourceContext
  ): string {
    const contextKey = context ? 
      `${context.resourceId}:${context.resourceType}:${context.departmentId}:${context.institutionId}` : 
      'global';
    return `${userId}:${permission}:${contextKey}`;
  }

  // Database operations - these would be implemented with actual database queries
  private async getUserRoles(userId: string): Promise<UserRoleAssignment[]> {
    // In a real implementation, this would query the user_role_assignments table
    // For now, we'll use a mock implementation
    const { createClient } = await import('../supabase/client');
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('user_role_assignments')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .or('expires_at.is.null');

    if (error) {
      console.error('Error fetching user roles:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      role: row.role as UserRole,
      status: row.status,
      assignedBy: row.assigned_by,
      assignedAt: new Date(row.assigned_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      departmentId: row.department_id,
      institutionId: row.institution_id,
      isTemporary: row.is_temporary,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  private async getPermission(permissionName: string): Promise<Permission | null> {
    // Import permission definitions
    const { getPermission } = await import('./permission-definitions');
    return getPermission(permissionName) || null;
  }

  private async getRolePermissions(role: UserRole): Promise<Permission[]> {
    const { getRolePermissions, PERMISSIONS } = await import('./permission-definitions');
    const rolePermissions = getRolePermissions(role);
    
    return PERMISSIONS.filter(permission => 
      rolePermissions.some(rp => rp.permissionId === permission.id)
    );
  }

  private async getRolePermissionMappings(role: UserRole): Promise<RolePermission[]> {
    const { getRolePermissions } = await import('./permission-definitions');
    return getRolePermissions(role);
  }
}