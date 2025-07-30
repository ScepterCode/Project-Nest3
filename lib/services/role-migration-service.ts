/**
 * Role Migration Service
 * Handles migration of existing user roles to the new role assignment system
 */

import { createClient } from '@/lib/supabase/server';
import { UserRole, RoleStatus } from '@/lib/types/role-management';

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  failedCount: number;
  errors: MigrationError[];
  rollbackData?: RollbackData[];
}

export interface MigrationError {
  userId: string;
  error: string;
  originalRole?: string;
}

export interface RollbackData {
  userId: string;
  originalRole: string;
  originalData: any;
  migrationTimestamp: Date;
}

export interface LegacyUserRole {
  id: string;
  role?: string;
  user_type?: string;
  institution_id?: string;
  department_id?: string;
  created_at: string;
  updated_at: string;
}

export class RoleMigrationService {
  private supabase = createClient();
  private rollbackData: RollbackData[] = [];

  /**
   * Migrate existing user roles to new role assignment system
   */
  async migrateUserRoles(dryRun: boolean = false): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      failedCount: 0,
      errors: [],
      rollbackData: []
    };

    try {
      // Get all users with existing roles
      const { data: legacyUsers, error: fetchError } = await this.supabase
        .from('users')
        .select('id, role, user_type, institution_id, department_id, created_at, updated_at')
        .not('role', 'is', null);

      if (fetchError) {
        throw new Error(`Failed to fetch legacy users: ${fetchError.message}`);
      }

      if (!legacyUsers || legacyUsers.length === 0) {
        result.success = true;
        return result;
      }

      // Process each user
      for (const user of legacyUsers) {
        try {
          const migrationData = await this.migrateUserRole(user, dryRun);
          if (migrationData) {
            this.rollbackData.push(migrationData);
            result.migratedCount++;
          }
        } catch (error) {
          result.failedCount++;
          result.errors.push({
            userId: user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            originalRole: user.role || user.user_type
          });
        }
      }

      result.rollbackData = this.rollbackData;
      result.success = result.failedCount === 0;

      return result;
    } catch (error) {
      throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate a single user's role
   */
  private async migrateUserRole(user: LegacyUserRole, dryRun: boolean): Promise<RollbackData | null> {
    const normalizedRole = this.normalizeRole(user.role || user.user_type);
    
    if (!normalizedRole) {
      throw new Error(`Cannot normalize role: ${user.role || user.user_type}`);
    }

    // Create rollback data
    const rollbackData: RollbackData = {
      userId: user.id,
      originalRole: user.role || user.user_type || '',
      originalData: { ...user },
      migrationTimestamp: new Date()
    };

    if (dryRun) {
      return rollbackData;
    }

    // Check if user already has role assignment
    const { data: existingAssignment } = await this.supabase
      .from('user_role_assignments')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existingAssignment) {
      // User already migrated, skip
      return null;
    }

    // Create new role assignment
    const { error: insertError } = await this.supabase
      .from('user_role_assignments')
      .insert({
        user_id: user.id,
        role: normalizedRole,
        status: RoleStatus.ACTIVE,
        assigned_by: null, // System migration
        assigned_at: user.created_at,
        institution_id: user.institution_id,
        department_id: user.department_id,
        is_temporary: false,
        metadata: {
          migrated_from: user.role || user.user_type,
          migration_timestamp: new Date().toISOString()
        }
      });

    if (insertError) {
      throw new Error(`Failed to create role assignment: ${insertError.message}`);
    }

    // Update user's primary role
    const { error: updateError } = await this.supabase
      .from('users')
      .update({
        primary_role: normalizedRole,
        role_status: RoleStatus.ACTIVE,
        role_verified_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(`Failed to update user primary role: ${updateError.message}`);
    }

    return rollbackData;
  }

  /**
   * Normalize legacy role names to new role system
   */
  private normalizeRole(legacyRole?: string): UserRole | null {
    if (!legacyRole) return null;

    const roleMap: Record<string, UserRole> = {
      'student': UserRole.STUDENT,
      'teacher': UserRole.TEACHER,
      'instructor': UserRole.TEACHER,
      'faculty': UserRole.TEACHER,
      'admin': UserRole.INSTITUTION_ADMIN,
      'administrator': UserRole.INSTITUTION_ADMIN,
      'institution_admin': UserRole.INSTITUTION_ADMIN,
      'dept_admin': UserRole.DEPARTMENT_ADMIN,
      'department_admin': UserRole.DEPARTMENT_ADMIN,
      'system_admin': UserRole.SYSTEM_ADMIN,
      'super_admin': UserRole.SYSTEM_ADMIN
    };

    return roleMap[legacyRole.toLowerCase()] || null;
  }

  /**
   * Rollback migration for specific users
   */
  async rollbackMigration(rollbackData: RollbackData[]): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      failedCount: 0,
      errors: []
    };

    for (const data of rollbackData) {
      try {
        // Remove role assignment
        const { error: deleteError } = await this.supabase
          .from('user_role_assignments')
          .delete()
          .eq('user_id', data.userId)
          .eq('metadata->migration_timestamp', data.migrationTimestamp.toISOString());

        if (deleteError) {
          throw new Error(`Failed to delete role assignment: ${deleteError.message}`);
        }

        // Restore original user data
        const { error: restoreError } = await this.supabase
          .from('users')
          .update({
            role: data.originalData.role,
            user_type: data.originalData.user_type,
            primary_role: null,
            role_status: null,
            role_verified_at: null
          })
          .eq('id', data.userId);

        if (restoreError) {
          throw new Error(`Failed to restore user data: ${restoreError.message}`);
        }

        result.migratedCount++;
      } catch (error) {
        result.failedCount++;
        result.errors.push({
          userId: data.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          originalRole: data.originalRole
        });
      }
    }

    result.success = result.failedCount === 0;
    return result;
  }

  /**
   * Validate migration integrity
   */
  async validateMigration(): Promise<{
    isValid: boolean;
    issues: string[];
    statistics: {
      totalUsers: number;
      migratedUsers: number;
      unmappedRoles: string[];
    };
  }> {
    const issues: string[] = [];
    const unmappedRoles: string[] = [];

    // Get total users
    const { count: totalUsers } = await this.supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Get migrated users
    const { count: migratedUsers } = await this.supabase
      .from('user_role_assignments')
      .select('*', { count: 'exact', head: true });

    // Check for users without role assignments
    const { data: usersWithoutRoles } = await this.supabase
      .from('users')
      .select('id, role, user_type')
      .not('role', 'is', null)
      .not('id', 'in', `(SELECT user_id FROM user_role_assignments)`);

    if (usersWithoutRoles && usersWithoutRoles.length > 0) {
      issues.push(`${usersWithoutRoles.length} users have legacy roles but no role assignments`);
      
      // Collect unmapped roles
      for (const user of usersWithoutRoles) {
        const role = user.role || user.user_type;
        if (role && !unmappedRoles.includes(role)) {
          unmappedRoles.push(role);
        }
      }
    }

    // Check for orphaned role assignments
    const { data: orphanedAssignments } = await this.supabase
      .from('user_role_assignments')
      .select('id, user_id')
      .not('user_id', 'in', `(SELECT id FROM users)`);

    if (orphanedAssignments && orphanedAssignments.length > 0) {
      issues.push(`${orphanedAssignments.length} role assignments reference non-existent users`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      statistics: {
        totalUsers: totalUsers || 0,
        migratedUsers: migratedUsers || 0,
        unmappedRoles
      }
    };
  }
}