/**
 * Role Compatibility Service
 * 
 * Provides backward compatibility layer during the transition from old role system
 * to new comprehensive role management system.
 * 
 * Requirements: 1.1, 1.5
 */

import { UserRole, RoleStatus, UserRoleAssignment } from '../types/role-management';
import { createClient } from '@/lib/supabase/server';

export interface LegacyRoleData {
  userId: string;
  role: string;
  institutionId?: string;
  departmentId?: string;
}

export interface CompatibilityConfig {
  enableLegacySupport: boolean;
  migrationMode: 'strict' | 'permissive' | 'hybrid';
  fallbackToLegacy: boolean;
  logCompatibilityIssues: boolean;
}

export class RoleCompatibilityService {
  private config: CompatibilityConfig;
  private supabase = createClient();

  constructor(config: CompatibilityConfig = {
    enableLegacySupport: true,
    migrationMode: 'hybrid',
    fallbackToLegacy: true,
    logCompatibilityIssues: true
  }) {
    this.config = config;
  }

  /**
   * Get user role with backward compatibility
   * Tries new system first, falls back to legacy if needed
   */
  async getUserRole(userId: string): Promise<UserRole | null> {
    try {
      // Try new role system first
      const newRole = await this.getUserRoleFromNewSystem(userId);
      if (newRole) {
        return newRole;
      }

      // Fall back to legacy system if enabled
      if (this.config.fallbackToLegacy) {
        const legacyRole = await this.getUserRoleFromLegacySystem(userId);
        if (legacyRole) {
          // Optionally migrate on-the-fly
          if (this.config.migrationMode === 'hybrid') {
            await this.migrateUserRoleOnTheFly(userId, legacyRole);
          }
          return this.mapLegacyRole(legacyRole);
        }
      }

      return null;
    } catch (error) {
      this.logCompatibilityIssue('getUserRole', error, { userId });
      
      // In permissive mode, try legacy system on error
      if (this.config.migrationMode === 'permissive' && this.config.fallbackToLegacy) {
        try {
          const legacyRole = await this.getUserRoleFromLegacySystem(userId);
          return legacyRole ? this.mapLegacyRole(legacyRole) : null;
        } catch (legacyError) {
          this.logCompatibilityIssue('getUserRole-legacy-fallback', legacyError, { userId });
          return null;
        }
      }

      throw error;
    }
  }

  /**
   * Get user roles (multiple) with backward compatibility
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    try {
      // Try new role system first
      const newRoles = await this.getUserRolesFromNewSystem(userId);
      if (newRoles.length > 0) {
        return newRoles;
      }

      // Fall back to legacy system
      if (this.config.fallbackToLegacy) {
        const legacyRole = await this.getUserRoleFromLegacySystem(userId);
        if (legacyRole) {
          const mappedRole = this.mapLegacyRole(legacyRole);
          return mappedRole ? [mappedRole] : [];
        }
      }

      return [];
    } catch (error) {
      this.logCompatibilityIssue('getUserRoles', error, { userId });
      
      if (this.config.migrationMode === 'permissive' && this.config.fallbackToLegacy) {
        try {
          const legacyRole = await this.getUserRoleFromLegacySystem(userId);
          const mappedRole = legacyRole ? this.mapLegacyRole(legacyRole) : null;
          return mappedRole ? [mappedRole] : [];
        } catch (legacyError) {
          this.logCompatibilityIssue('getUserRoles-legacy-fallback', legacyError, { userId });
          return [];
        }
      }

      throw error;
    }
  }

  /**
   * Check if user has specific role with backward compatibility
   */
  async hasRole(userId: string, role: UserRole): Promise<boolean> {
    try {
      const userRoles = await this.getUserRoles(userId);
      return userRoles.includes(role);
    } catch (error) {
      this.logCompatibilityIssue('hasRole', error, { userId, role });
      return false;
    }
  }

  /**
   * Get user role assignments with compatibility layer
   */
  async getUserRoleAssignments(userId: string): Promise<UserRoleAssignment[]> {
    try {
      // Try new system first
      const { data: assignments, error } = await this.supabase
        .from('user_role_assignments')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        throw error;
      }

      if (assignments && assignments.length > 0) {
        return assignments.map(this.mapDatabaseToRoleAssignment);
      }

      // Fall back to creating assignment from legacy data
      if (this.config.fallbackToLegacy) {
        const legacyRole = await this.getUserRoleFromLegacySystem(userId);
        if (legacyRole) {
          return [await this.createCompatibilityAssignment(userId, legacyRole)];
        }
      }

      return [];
    } catch (error) {
      this.logCompatibilityIssue('getUserRoleAssignments', error, { userId });
      
      if (this.config.migrationMode === 'permissive') {
        return [];
      }
      
      throw error;
    }
  }

  /**
   * Migrate user role on-the-fly during access
   */
  private async migrateUserRoleOnTheFly(userId: string, legacyRole: string): Promise<void> {
    try {
      const mappedRole = this.mapLegacyRole(legacyRole);
      if (!mappedRole) {
        return;
      }

      // Get user's institution
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('institution_id, department_id')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        this.logCompatibilityIssue('migrateUserRoleOnTheFly-user-fetch', userError, { userId });
        return;
      }

      // Check if assignment already exists
      const { data: existing, error: existingError } = await this.supabase
        .from('user_role_assignments')
        .select('id')
        .eq('user_id', userId)
        .eq('role', mappedRole)
        .eq('status', 'active')
        .single();

      if (!existingError && existing) {
        // Assignment already exists
        return;
      }

      // Create new role assignment
      const { error: insertError } = await this.supabase
        .from('user_role_assignments')
        .insert({
          user_id: userId,
          role: mappedRole,
          status: 'active',
          assigned_by: userId, // Self-assigned during migration
          assigned_at: new Date().toISOString(),
          institution_id: user.institution_id,
          department_id: user.department_id,
          is_temporary: false,
          metadata: {
            migratedOnTheFly: true,
            legacyRole,
            migratedAt: new Date().toISOString()
          }
        });

      if (insertError) {
        this.logCompatibilityIssue('migrateUserRoleOnTheFly-insert', insertError, { userId, mappedRole });
        return;
      }

      // Update user's primary role
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          primary_role: mappedRole,
          role_status: 'active',
          role_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        this.logCompatibilityIssue('migrateUserRoleOnTheFly-update', updateError, { userId, mappedRole });
      }

    } catch (error) {
      this.logCompatibilityIssue('migrateUserRoleOnTheFly', error, { userId, legacyRole });
    }
  }

  /**
   * Get user role from new role management system
   */
  private async getUserRoleFromNewSystem(userId: string): Promise<UserRole | null> {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('primary_role, role_status')
      .eq('id', userId)
      .single();

    if (error || !user || !user.primary_role || user.role_status !== 'active') {
      return null;
    }

    return user.primary_role as UserRole;
  }

  /**
   * Get user roles from new role management system
   */
  private async getUserRolesFromNewSystem(userId: string): Promise<UserRole[]> {
    const { data: assignments, error } = await this.supabase
      .from('user_role_assignments')
      .select('role')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error || !assignments) {
      return [];
    }

    return assignments.map(a => a.role as UserRole);
  }

  /**
   * Get user role from legacy system
   */
  private async getUserRoleFromLegacySystem(userId: string): Promise<string | null> {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !user || !user.role) {
      return null;
    }

    return user.role;
  }

  /**
   * Map legacy role to new role system
   */
  private mapLegacyRole(legacyRole: string): UserRole | null {
    const roleMapping: Record<string, UserRole> = {
      'student': UserRole.STUDENT,
      'teacher': UserRole.TEACHER,
      'instructor': UserRole.TEACHER,
      'faculty': UserRole.TEACHER,
      'staff': UserRole.TEACHER,
      'admin': UserRole.INSTITUTION_ADMIN,
      'administrator': UserRole.INSTITUTION_ADMIN,
      'department_admin': UserRole.DEPARTMENT_ADMIN,
      'system_admin': UserRole.SYSTEM_ADMIN
    };

    return roleMapping[legacyRole.toLowerCase()] || null;
  }

  /**
   * Create a compatibility role assignment from legacy data
   */
  private async createCompatibilityAssignment(userId: string, legacyRole: string): Promise<UserRoleAssignment> {
    const mappedRole = this.mapLegacyRole(legacyRole);
    if (!mappedRole) {
      throw new Error(`Cannot map legacy role: ${legacyRole}`);
    }

    // Get user's institution and department
    const { data: user, error } = await this.supabase
      .from('users')
      .select('institution_id, department_id')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new Error(`Cannot fetch user data for compatibility assignment: ${error?.message}`);
    }

    return {
      id: `compat_${userId}_${Date.now()}`,
      userId,
      role: mappedRole,
      status: RoleStatus.ACTIVE,
      assignedBy: userId,
      assignedAt: new Date(),
      institutionId: user.institution_id || '',
      departmentId: user.department_id,
      isTemporary: false,
      metadata: {
        compatibility: true,
        legacyRole,
        createdAt: new Date().toISOString()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Map database row to UserRoleAssignment interface
   */
  private mapDatabaseToRoleAssignment(row: any): UserRoleAssignment {
    return {
      id: row.id,
      userId: row.user_id,
      role: row.role as UserRole,
      status: row.status as RoleStatus,
      assignedBy: row.assigned_by,
      assignedAt: new Date(row.assigned_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      departmentId: row.department_id,
      institutionId: row.institution_id,
      isTemporary: row.is_temporary,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * Log compatibility issues for monitoring and debugging
   */
  private logCompatibilityIssue(operation: string, error: any, context: any): void {
    if (!this.config.logCompatibilityIssues) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'RoleCompatibilityService',
      operation,
      error: error?.message || 'Unknown error',
      context,
      config: this.config
    };

    console.warn('[ROLE_COMPATIBILITY]', JSON.stringify(logEntry));

    // In production, you might want to send this to a logging service
    // await this.sendToLoggingService(logEntry);
  }

  /**
   * Check if system is in migration mode
   */
  isMigrationMode(): boolean {
    return this.config.enableLegacySupport && this.config.migrationMode !== 'strict';
  }

  /**
   * Get compatibility status for a user
   */
  async getCompatibilityStatus(userId: string): Promise<{
    hasNewRoleData: boolean;
    hasLegacyRoleData: boolean;
    needsMigration: boolean;
    compatibilityMode: string;
  }> {
    const hasNewRole = await this.getUserRoleFromNewSystem(userId);
    const hasLegacyRole = await this.getUserRoleFromLegacySystem(userId);

    return {
      hasNewRoleData: !!hasNewRole,
      hasLegacyRoleData: !!hasLegacyRole,
      needsMigration: !hasNewRole && !!hasLegacyRole,
      compatibilityMode: this.config.migrationMode
    };
  }

  /**
   * Force migration for a specific user
   */
  async forceMigrateUser(userId: string): Promise<boolean> {
    try {
      const legacyRole = await this.getUserRoleFromLegacySystem(userId);
      if (!legacyRole) {
        return false;
      }

      await this.migrateUserRoleOnTheFly(userId, legacyRole);
      return true;
    } catch (error) {
      this.logCompatibilityIssue('forceMigrateUser', error, { userId });
      return false;
    }
  }

  /**
   * Update compatibility configuration
   */
  updateConfig(newConfig: Partial<CompatibilityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): CompatibilityConfig {
    return { ...this.config };
  }
}

// Singleton instance for global use
let compatibilityServiceInstance: RoleCompatibilityService | null = null;

export function getRoleCompatibilityService(config?: CompatibilityConfig): RoleCompatibilityService {
  if (!compatibilityServiceInstance) {
    compatibilityServiceInstance = new RoleCompatibilityService(config);
  }
  return compatibilityServiceInstance;
}

// Utility functions for easy integration
export async function getUserRoleCompatible(userId: string): Promise<UserRole | null> {
  const service = getRoleCompatibilityService();
  return service.getUserRole(userId);
}

export async function getUserRolesCompatible(userId: string): Promise<UserRole[]> {
  const service = getRoleCompatibilityService();
  return service.getUserRoles(userId);
}

export async function hasRoleCompatible(userId: string, role: UserRole): Promise<boolean> {
  const service = getRoleCompatibilityService();
  return service.hasRole(userId, role);
}