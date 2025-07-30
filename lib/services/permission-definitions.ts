/**
 * Permission Definitions
 * 
 * Defines all available permissions in the system and their mappings to roles.
 * This serves as the central registry for permission management.
 */

import {
  Permission,
  RolePermission,
  UserRole,
  PermissionCategory,
  PermissionScope,
  PermissionCondition
} from '../types/role-management';

/**
 * All available permissions in the system
 */
export const PERMISSIONS: Permission[] = [
  // Content Management Permissions
  {
    id: 'content.create',
    name: 'content.create',
    description: 'Create new content',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },
  {
    id: 'content.read',
    name: 'content.read',
    description: 'View content',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.SELF,
    createdAt: new Date()
  },
  {
    id: 'content.update',
    name: 'content.update',
    description: 'Edit existing content',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.SELF,
    createdAt: new Date()
  },
  {
    id: 'content.delete',
    name: 'content.delete',
    description: 'Delete content',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.SELF,
    createdAt: new Date()
  },
  {
    id: 'content.manage',
    name: 'content.manage',
    description: 'Full content management access',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },

  // Class Management Permissions
  {
    id: 'class.create',
    name: 'class.create',
    description: 'Create new classes',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },
  {
    id: 'class.read',
    name: 'class.read',
    description: 'View class information',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },
  {
    id: 'class.update',
    name: 'class.update',
    description: 'Edit class information',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.SELF,
    createdAt: new Date()
  },
  {
    id: 'class.delete',
    name: 'class.delete',
    description: 'Delete classes',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.SELF,
    createdAt: new Date()
  },
  {
    id: 'class.manage',
    name: 'class.manage',
    description: 'Full class management access',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },

  // Enrollment Permissions
  {
    id: 'enrollment.create',
    name: 'enrollment.create',
    description: 'Enroll in classes',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.SELF,
    createdAt: new Date()
  },
  {
    id: 'enrollment.read',
    name: 'enrollment.read',
    description: 'View enrollment information',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.SELF,
    createdAt: new Date()
  },
  {
    id: 'enrollment.update',
    name: 'enrollment.update',
    description: 'Modify enrollment status',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },
  {
    id: 'enrollment.delete',
    name: 'enrollment.delete',
    description: 'Remove enrollments',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },
  {
    id: 'enrollment.approve',
    name: 'enrollment.approve',
    description: 'Approve enrollment requests',
    category: PermissionCategory.CONTENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },

  // User Management Permissions
  {
    id: 'user.create',
    name: 'user.create',
    description: 'Create new users',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },
  {
    id: 'user.read',
    name: 'user.read',
    description: 'View user information',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },
  {
    id: 'user.update',
    name: 'user.update',
    description: 'Edit user information',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.SELF,
    createdAt: new Date()
  },
  {
    id: 'user.delete',
    name: 'user.delete',
    description: 'Delete users',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },
  {
    id: 'user.manage',
    name: 'user.manage',
    description: 'Full user management access',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },

  // Role Management Permissions
  {
    id: 'role.assign',
    name: 'role.assign',
    description: 'Assign roles to users',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },
  {
    id: 'role.revoke',
    name: 'role.revoke',
    description: 'Revoke user roles',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },
  {
    id: 'role.approve',
    name: 'role.approve',
    description: 'Approve role requests',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },
  {
    id: 'role.audit',
    name: 'role.audit',
    description: 'View role audit logs',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },

  // Analytics Permissions
  {
    id: 'analytics.read',
    name: 'analytics.read',
    description: 'View analytics data',
    category: PermissionCategory.ANALYTICS,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  },
  {
    id: 'analytics.export',
    name: 'analytics.export',
    description: 'Export analytics data',
    category: PermissionCategory.ANALYTICS,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },

  // System Administration Permissions
  {
    id: 'system.configure',
    name: 'system.configure',
    description: 'Configure system settings',
    category: PermissionCategory.SYSTEM,
    scope: PermissionScope.SYSTEM,
    createdAt: new Date()
  },
  {
    id: 'system.audit',
    name: 'system.audit',
    description: 'View system audit logs',
    category: PermissionCategory.SYSTEM,
    scope: PermissionScope.SYSTEM,
    createdAt: new Date()
  },
  {
    id: 'institution.create',
    name: 'institution.create',
    description: 'Create new institutions',
    category: PermissionCategory.SYSTEM,
    scope: PermissionScope.SYSTEM,
    createdAt: new Date()
  },
  {
    id: 'institution.manage',
    name: 'institution.manage',
    description: 'Manage institution settings',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },

  // Department Management Permissions
  {
    id: 'department.create',
    name: 'department.create',
    description: 'Create new departments',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.INSTITUTION,
    createdAt: new Date()
  },
  {
    id: 'department.manage',
    name: 'department.manage',
    description: 'Manage department settings',
    category: PermissionCategory.USER_MANAGEMENT,
    scope: PermissionScope.DEPARTMENT,
    createdAt: new Date()
  }
];

/**
 * Role to permission mappings with conditions
 */
export const ROLE_PERMISSIONS: RolePermission[] = [
  // Student Permissions
  {
    id: 'student-content-read',
    role: UserRole.STUDENT,
    permissionId: 'content.read',
    conditions: [],
    createdAt: new Date()
  },
  {
    id: 'student-class-read',
    role: UserRole.STUDENT,
    permissionId: 'class.read',
    conditions: [],
    createdAt: new Date()
  },
  {
    id: 'student-enrollment-create',
    role: UserRole.STUDENT,
    permissionId: 'enrollment.create',
    conditions: [],
    createdAt: new Date()
  },
  {
    id: 'student-enrollment-read',
    role: UserRole.STUDENT,
    permissionId: 'enrollment.read',
    conditions: [{ type: 'resource_owner', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'student-user-update',
    role: UserRole.STUDENT,
    permissionId: 'user.update',
    conditions: [{ type: 'resource_owner', parameters: {} }],
    createdAt: new Date()
  },

  // Teacher Permissions
  {
    id: 'teacher-content-create',
    role: UserRole.TEACHER,
    permissionId: 'content.create',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-content-read',
    role: UserRole.TEACHER,
    permissionId: 'content.read',
    conditions: [],
    createdAt: new Date()
  },
  {
    id: 'teacher-content-update',
    role: UserRole.TEACHER,
    permissionId: 'content.update',
    conditions: [{ type: 'resource_owner', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-content-delete',
    role: UserRole.TEACHER,
    permissionId: 'content.delete',
    conditions: [{ type: 'resource_owner', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-class-create',
    role: UserRole.TEACHER,
    permissionId: 'class.create',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-class-read',
    role: UserRole.TEACHER,
    permissionId: 'class.read',
    conditions: [],
    createdAt: new Date()
  },
  {
    id: 'teacher-class-update',
    role: UserRole.TEACHER,
    permissionId: 'class.update',
    conditions: [{ type: 'resource_owner', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-class-delete',
    role: UserRole.TEACHER,
    permissionId: 'class.delete',
    conditions: [{ type: 'resource_owner', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-enrollment-read',
    role: UserRole.TEACHER,
    permissionId: 'enrollment.read',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-enrollment-update',
    role: UserRole.TEACHER,
    permissionId: 'enrollment.update',
    conditions: [{ type: 'resource_owner', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-enrollment-approve',
    role: UserRole.TEACHER,
    permissionId: 'enrollment.approve',
    conditions: [{ type: 'resource_owner', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-user-read',
    role: UserRole.TEACHER,
    permissionId: 'user.read',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'teacher-analytics-read',
    role: UserRole.TEACHER,
    permissionId: 'analytics.read',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },

  // Department Admin Permissions
  {
    id: 'dept-admin-content-manage',
    role: UserRole.DEPARTMENT_ADMIN,
    permissionId: 'content.manage',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'dept-admin-class-manage',
    role: UserRole.DEPARTMENT_ADMIN,
    permissionId: 'class.manage',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'dept-admin-enrollment-update',
    role: UserRole.DEPARTMENT_ADMIN,
    permissionId: 'enrollment.update',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'dept-admin-enrollment-delete',
    role: UserRole.DEPARTMENT_ADMIN,
    permissionId: 'enrollment.delete',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'dept-admin-enrollment-approve',
    role: UserRole.DEPARTMENT_ADMIN,
    permissionId: 'enrollment.approve',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'dept-admin-user-read',
    role: UserRole.DEPARTMENT_ADMIN,
    permissionId: 'user.read',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'dept-admin-analytics-read',
    role: UserRole.DEPARTMENT_ADMIN,
    permissionId: 'analytics.read',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'dept-admin-department-manage',
    role: UserRole.DEPARTMENT_ADMIN,
    permissionId: 'department.manage',
    conditions: [{ type: 'department_match', parameters: {} }],
    createdAt: new Date()
  },

  // Institution Admin Permissions
  {
    id: 'inst-admin-user-create',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'user.create',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-user-manage',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'user.manage',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-user-delete',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'user.delete',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-role-assign',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'role.assign',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-role-revoke',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'role.revoke',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-role-approve',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'role.approve',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-role-audit',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'role.audit',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-analytics-export',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'analytics.export',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-department-create',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'department.create',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },
  {
    id: 'inst-admin-institution-manage',
    role: UserRole.INSTITUTION_ADMIN,
    permissionId: 'institution.manage',
    conditions: [{ type: 'institution_match', parameters: {} }],
    createdAt: new Date()
  },

  // System Admin Permissions (has all permissions)
  {
    id: 'sys-admin-system-configure',
    role: UserRole.SYSTEM_ADMIN,
    permissionId: 'system.configure',
    conditions: [],
    createdAt: new Date()
  },
  {
    id: 'sys-admin-system-audit',
    role: UserRole.SYSTEM_ADMIN,
    permissionId: 'system.audit',
    conditions: [],
    createdAt: new Date()
  },
  {
    id: 'sys-admin-institution-create',
    role: UserRole.SYSTEM_ADMIN,
    permissionId: 'institution.create',
    conditions: [],
    createdAt: new Date()
  }
];

/**
 * Get permission by name
 */
export function getPermission(name: string): Permission | undefined {
  return PERMISSIONS.find(p => p.name === name);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): RolePermission[] {
  return ROLE_PERMISSIONS.filter(rp => rp.role === role);
}

/**
 * Get all permissions by category
 */
export function getPermissionsByCategory(category: PermissionCategory): Permission[] {
  return PERMISSIONS.filter(p => p.category === category);
}

/**
 * Get all permissions by scope
 */
export function getPermissionsByScope(scope: PermissionScope): Permission[] {
  return PERMISSIONS.filter(p => p.scope === scope);
}