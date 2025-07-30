/**
 * Department Role Manager Tests
 * 
 * Tests for department-scoped role assignment restrictions, validation,
 * and audit logging functionality.
 */

import { DepartmentRoleManager } from '@/lib/services/department-role-manager';
import { UserRole, RoleStatus, AuditAction } from '@/lib/types/role-management';

// Mock the crypto.randomUUID function
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9))
  }
});

describe('DepartmentRoleManager', () => {
  let roleManager: DepartmentRoleManager;
  const departmentId = 'dept-123';
  const institutionId = 'inst-456';

  beforeEach(() => {
    roleManager = new DepartmentRoleManager(departmentId, institutionId);
    jest.clearAllMocks();
  });

  describe('getDepartmentRoleRestrictions', () => {
    it('should return default department role restrictions', async () => {
      const restrictions = await roleManager.getDepartmentRoleRestrictions();

      expect(restrictions).toEqual({
        allowedRoles: [
          UserRole.STUDENT,
          UserRole.TEACHER,
          UserRole.DEPARTMENT_ADMIN
        ],
        maxUsersPerRole: {
          [UserRole.STUDENT]: 1000,
          [UserRole.TEACHER]: 50,
          [UserRole.DEPARTMENT_ADMIN]: 5,
          [UserRole.INSTITUTION_ADMIN]: 0,
          [UserRole.SYSTEM_ADMIN]: 0
        },
        requiresInstitutionApproval: [
          UserRole.DEPARTMENT_ADMIN
        ],
        canManageRoles: [
          UserRole.DEPARTMENT_ADMIN,
          UserRole.INSTITUTION_ADMIN,
          UserRole.SYSTEM_ADMIN
        ]
      });
    });
  });

  describe('canManageRoles', () => {
    beforeEach(() => {
      // Mock the private methods
      jest.spyOn(roleManager as any, 'getUserRole').mockImplementation(async (userId: string) => {
        if (userId === 'dept-admin-user') return UserRole.DEPARTMENT_ADMIN;
        if (userId === 'inst-admin-user') return UserRole.INSTITUTION_ADMIN;
        if (userId === 'system-admin-user') return UserRole.SYSTEM_ADMIN;
        if (userId === 'teacher-user') return UserRole.TEACHER;
        return UserRole.STUDENT;
      });

      jest.spyOn(roleManager as any, 'getUserDepartment').mockImplementation(async (userId: string) => {
        if (userId === 'dept-admin-user') return departmentId;
        if (userId === 'other-dept-admin') return 'other-dept';
        return departmentId;
      });
    });

    it('should allow department admin to manage roles in their department', async () => {
      const canManage = await roleManager.canManageRoles('dept-admin-user');
      expect(canManage).toBe(true);
    });

    it('should not allow department admin to manage roles in other departments', async () => {
      const canManage = await roleManager.canManageRoles('other-dept-admin');
      expect(canManage).toBe(false);
    });

    it('should allow institution admin to manage any department roles', async () => {
      const canManage = await roleManager.canManageRoles('inst-admin-user');
      expect(canManage).toBe(true);
    });

    it('should allow system admin to manage any department roles', async () => {
      const canManage = await roleManager.canManageRoles('system-admin-user');
      expect(canManage).toBe(true);
    });

    it('should not allow teachers to manage roles', async () => {
      const canManage = await roleManager.canManageRoles('teacher-user');
      expect(canManage).toBe(false);
    });

    it('should not allow students to manage roles', async () => {
      const canManage = await roleManager.canManageRoles('student-user');
      expect(canManage).toBe(false);
    });
  });

  describe('validateDepartmentRoleAssignment', () => {
    beforeEach(() => {
      jest.spyOn(roleManager, 'canManageRoles').mockResolvedValue(true);
      jest.spyOn(roleManager as any, 'getRoleCount').mockResolvedValue(0);
      jest.spyOn(roleManager as any, 'getUserRole').mockResolvedValue(UserRole.DEPARTMENT_ADMIN);
      jest.spyOn(roleManager as any, 'getUserDepartment').mockResolvedValue(departmentId);
    });

    it('should validate successful role assignment', async () => {
      const result = await roleManager.validateDepartmentRoleAssignment(
        'admin-user',
        'target-user',
        UserRole.TEACHER
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject assignment if user cannot manage roles', async () => {
      jest.spyOn(roleManager, 'canManageRoles').mockResolvedValue(false);

      const result = await roleManager.validateDepartmentRoleAssignment(
        'non-admin-user',
        'target-user',
        UserRole.TEACHER
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Insufficient permissions to manage roles');
    });

    it('should reject assignment of disallowed roles', async () => {
      const result = await roleManager.validateDepartmentRoleAssignment(
        'admin-user',
        'target-user',
        UserRole.SYSTEM_ADMIN
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Role system_admin cannot be assigned at department level');
    });

    it('should reject assignment when role capacity is reached', async () => {
      jest.spyOn(roleManager as any, 'getRoleCount').mockResolvedValue(50); // Max teachers

      const result = await roleManager.validateDepartmentRoleAssignment(
        'admin-user',
        'target-user',
        UserRole.TEACHER
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Maximum 50 users allowed for role teacher');
    });

    it('should reject cross-department assignment by department admin', async () => {
      jest.spyOn(roleManager as any, 'getUserDepartment').mockResolvedValue('other-dept');

      const result = await roleManager.validateDepartmentRoleAssignment(
        'dept-admin-user',
        'target-user',
        UserRole.TEACHER
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Cannot assign roles to users outside your department');
    });

    it('should reject department admin role assignment by department admin', async () => {
      const result = await roleManager.validateDepartmentRoleAssignment(
        'dept-admin-user',
        'target-user',
        UserRole.DEPARTMENT_ADMIN
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Role department_admin requires institution administrator approval');
    });
  });

  describe('assignDepartmentRole', () => {
    beforeEach(() => {
      jest.spyOn(roleManager, 'validateDepartmentRoleAssignment').mockResolvedValue({ valid: true });
      jest.spyOn(roleManager as any, 'processRoleAssignment').mockResolvedValue({
        id: 'assignment-123',
        userId: 'target-user',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-user',
        assignedAt: new Date(),
        departmentId,
        institutionId,
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      });
      jest.spyOn(roleManager as any, 'logDepartmentRoleAction').mockResolvedValue(undefined);
    });

    it('should successfully assign department role', async () => {
      const assignment = await roleManager.assignDepartmentRole(
        'admin-user',
        'target-user',
        UserRole.TEACHER,
        'Promoting to teacher role'
      );

      expect(assignment.userId).toBe('target-user');
      expect(assignment.role).toBe(UserRole.TEACHER);
      expect(assignment.assignedBy).toBe('admin-user');
      expect(assignment.departmentId).toBe(departmentId);
      expect(assignment.institutionId).toBe(institutionId);
    });

    it('should log the role assignment action', async () => {
      const logSpy = jest.spyOn(roleManager as any, 'logDepartmentRoleAction');

      await roleManager.assignDepartmentRole(
        'admin-user',
        'target-user',
        UserRole.TEACHER,
        'Promoting to teacher role'
      );

      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'target-user',
        action: AuditAction.ASSIGNED,
        newRole: UserRole.TEACHER,
        changedBy: 'admin-user',
        reason: 'Promoting to teacher role',
        institutionId,
        departmentId,
        metadata: expect.objectContaining({
          departmentScoped: true
        })
      }));
    });

    it('should throw error if validation fails', async () => {
      jest.spyOn(roleManager, 'validateDepartmentRoleAssignment').mockResolvedValue({
        valid: false,
        reason: 'Validation failed'
      });

      await expect(
        roleManager.assignDepartmentRole('admin-user', 'target-user', UserRole.TEACHER)
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('removeDepartmentRole', () => {
    beforeEach(() => {
      jest.spyOn(roleManager, 'canManageRoles').mockResolvedValue(true);
      jest.spyOn(roleManager as any, 'getUserRole').mockResolvedValue(UserRole.DEPARTMENT_ADMIN);
      jest.spyOn(roleManager as any, 'getUserDepartment').mockResolvedValue(departmentId);
      jest.spyOn(roleManager as any, 'processRoleRemoval').mockResolvedValue(undefined);
      jest.spyOn(roleManager as any, 'logDepartmentRoleAction').mockResolvedValue(undefined);
    });

    it('should successfully remove department role', async () => {
      await expect(
        roleManager.removeDepartmentRole(
          'admin-user',
          'target-user',
          UserRole.TEACHER,
          'No longer teaching'
        )
      ).resolves.not.toThrow();
    });

    it('should log the role removal action', async () => {
      const logSpy = jest.spyOn(roleManager as any, 'logDepartmentRoleAction');

      await roleManager.removeDepartmentRole(
        'admin-user',
        'target-user',
        UserRole.TEACHER,
        'No longer teaching'
      );

      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'target-user',
        action: AuditAction.REVOKED,
        oldRole: UserRole.TEACHER,
        changedBy: 'admin-user',
        reason: 'No longer teaching',
        institutionId,
        departmentId,
        metadata: expect.objectContaining({
          departmentScoped: true
        })
      }));
    });

    it('should throw error if user cannot manage roles', async () => {
      jest.spyOn(roleManager, 'canManageRoles').mockResolvedValue(false);

      await expect(
        roleManager.removeDepartmentRole('non-admin-user', 'target-user', UserRole.TEACHER)
      ).rejects.toThrow('Insufficient permissions to manage roles');
    });

    it('should throw error for cross-department removal by department admin', async () => {
      jest.spyOn(roleManager as any, 'getUserDepartment').mockResolvedValue('other-dept');

      await expect(
        roleManager.removeDepartmentRole('dept-admin-user', 'target-user', UserRole.TEACHER)
      ).rejects.toThrow('Cannot remove roles from users outside your department');
    });
  });

  describe('bulkAssignDepartmentRoles', () => {
    beforeEach(() => {
      jest.spyOn(roleManager, 'assignDepartmentRole')
        .mockImplementation(async (assignerId, userId, role, justification) => {
          if (userId === 'fail-user') {
            throw new Error('Assignment failed');
          }
          return {
            id: `assignment-${userId}`,
            userId,
            role,
            status: RoleStatus.ACTIVE,
            assignedBy: assignerId,
            assignedAt: new Date(),
            departmentId,
            institutionId,
            isTemporary: false,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date()
          };
        });
    });

    it('should process bulk assignments with mixed success/failure', async () => {
      const assignments = [
        { userId: 'user1', role: UserRole.TEACHER, justification: 'Promotion' },
        { userId: 'fail-user', role: UserRole.TEACHER, justification: 'Will fail' },
        { userId: 'user3', role: UserRole.STUDENT, justification: 'New student' }
      ];

      const result = await roleManager.bulkAssignDepartmentRoles('admin-user', assignments);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.successful[0].userId).toBe('user1');
      expect(result.successful[1].userId).toBe('user3');
      expect(result.failed[0]).toEqual({
        userId: 'fail-user',
        error: 'Assignment failed'
      });
    });

    it('should handle all successful assignments', async () => {
      const assignments = [
        { userId: 'user1', role: UserRole.TEACHER, justification: 'Promotion' },
        { userId: 'user2', role: UserRole.STUDENT, justification: 'New student' }
      ];

      const result = await roleManager.bulkAssignDepartmentRoles('admin-user', assignments);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('getDepartmentRoleStats', () => {
    beforeEach(() => {
      jest.spyOn(roleManager, 'getDepartmentUsers').mockResolvedValue([
        {
          id: 'user1',
          name: 'John Doe',
          email: 'john@example.com',
          role: UserRole.TEACHER,
          status: RoleStatus.ACTIVE,
          departmentId,
          institutionId,
          assignedAt: new Date(),
          assignedBy: 'admin'
        },
        {
          id: 'user2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          role: UserRole.STUDENT,
          status: RoleStatus.ACTIVE,
          departmentId,
          institutionId,
          assignedAt: new Date(),
          assignedBy: 'admin'
        },
        {
          id: 'user3',
          name: 'Bob Johnson',
          email: 'bob@example.com',
          role: UserRole.STUDENT,
          status: RoleStatus.ACTIVE,
          departmentId,
          institutionId,
          assignedAt: new Date(),
          assignedBy: 'admin'
        }
      ]);

      jest.spyOn(roleManager as any, 'getPendingRequestsCount').mockResolvedValue(3);
      jest.spyOn(roleManager as any, 'getRecentChangesCount').mockResolvedValue(5);
    });

    it('should return correct department role statistics', async () => {
      const stats = await roleManager.getDepartmentRoleStats();

      expect(stats).toEqual({
        totalUsers: 3,
        usersByRole: {
          [UserRole.TEACHER]: 1,
          [UserRole.STUDENT]: 2
        },
        pendingRequests: 3,
        recentChanges: 5
      });
    });
  });
});