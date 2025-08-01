/**
 * Simple Permission Checker
 * Works with the current database schema where roles are stored in users table
 */

import { createClient } from '../supabase/client';

export interface ResourceContext {
  resourceId?: string;
  resourceType?: string;
  ownerId?: string;
  departmentId?: string;
  institutionId?: string;
}

export class SimplePermissionChecker {
  /**
   * Check if a user has a specific permission based on their role
   */
  async hasPermission(
    userId: string,
    permissionName: string,
    context?: ResourceContext
  ): Promise<boolean> {
    try {
      const supabase = createClient();
      
      // Get user role from users table
      const { data: userData, error } = await supabase
        .from('users')
        .select('role, institution_id, department_id')
        .eq('id', userId)
        .single();

      if (error || !userData) {
        console.log('Database not available for permission check, denying access');
        // Require database role for security - no fallback
        return false;
      }

      const userRole = userData.role;
      
      // Simple permission mapping based on role
      return this.checkRolePermission(userRole, permissionName, {
        ...context,
        userInstitutionId: userData.institution_id,
        userDepartmentId: userData.department_id
      });
    } catch (error) {
      console.log('Permission check error, denying access for security');
      // Require database access for security - no fallback
      return false;
    }
  }

  /**
   * Check if a user is an admin
   */
  async isAdmin(
    userId: string,
    scope: 'system' | 'institution' | 'department',
    scopeId?: string
  ): Promise<boolean> {
    try {
      const supabase = createClient();
      
      const { data: userData, error } = await supabase
        .from('users')
        .select('role, institution_id, department_id')
        .eq('id', userId)
        .single();

      if (error || !userData) {
        console.log('Database not available for admin check, denying admin access');
        return false;
      }

      const userRole = userData.role;

      switch (scope) {
        case 'system':
          return userRole === 'system_admin';
        
        case 'institution':
          return (userRole === 'institution_admin' || userRole === 'system_admin') &&
                 (!scopeId || userData.institution_id === scopeId);
        
        case 'department':
          return (userRole === 'department_admin' || 
                  userRole === 'institution_admin' || 
                  userRole === 'system_admin') &&
                 (!scopeId || userData.department_id === scopeId);
        
        default:
          return false;
      }
    } catch (error) {
      console.log('Admin check error, denying admin access');
      return false;
    }
  }

  /**
   * Simple role-based permission checking
   */
  private checkRolePermission(
    role: string,
    permission: string,
    context?: ResourceContext & {
      userInstitutionId?: string;
      userDepartmentId?: string;
    }
  ): boolean {
    // Define basic permissions for each role
    const rolePermissions: Record<string, string[]> = {
      student: [
        'assignments.read',
        'grades.read',
        'classes.read',
        'peer_reviews.read',
        'profile.update'
      ],
      teacher: [
        'assignments.read',
        'assignments.create',
        'assignments.update',
        'assignments.manage',
        'classes.read',
        'classes.create',
        'classes.update',
        'classes.manage',
        'grades.read',
        'grades.update',
        'grades.manage',
        'peer_reviews.read',
        'peer_reviews.create',
        'peer_reviews.manage',
        'rubrics.read',
        'rubrics.create',
        'rubrics.manage',
        'analytics.read',
        'profile.update'
      ],
      department_admin: [
        'assignments.read',
        'classes.read',
        'grades.read',
        'users.read',
        'department_users.manage',
        'department_classes.manage',
        'analytics.read',
        'reports.read',
        'profile.update'
      ],
      institution_admin: [
        'assignments.read',
        'classes.read',
        'grades.read',
        'users.read',
        'users.manage',
        'departments.read',
        'departments.manage',
        'analytics.read',
        'reports.read',
        'reports.manage',
        'profile.update'
      ],
      system_admin: [
        'system.manage',
        'institutions.manage',
        'users.manage',
        'assignments.manage',
        'classes.manage',
        'grades.manage',
        'departments.manage',
        'analytics.read',
        'reports.manage',
        'profile.update'
      ]
    };

    const allowedPermissions = rolePermissions[role] || [];
    
    // Check if the role has the permission
    if (!allowedPermissions.includes(permission)) {
      return false;
    }

    // Additional context-based checks can be added here
    // For now, we'll just return true if the role has the permission
    return true;
  }
}

// Export singleton instance
export const simplePermissionChecker = new SimplePermissionChecker();