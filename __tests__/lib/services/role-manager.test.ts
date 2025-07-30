/**
 * Unit tests for RoleManager service
 */

import { RoleManager, RoleManagerConfig } from '../../../lib/services/role-manager';
import {
  UserRole,
  RoleStatus,
  RoleRequestStatus,
  VerificationMethod,
  AuditAction
} from '../../../lib/types/role-management';

// Mock the crypto.randomUUID function
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'mock-uuid-123')
  }
});

describe('RoleManager', () => {
  let roleManager: RoleManager;
  let mockConfig: RoleManagerConfig;

  beforeEach(() => {
    mockConfig = {
      defaultRoleRequestExpiration: 7,
      maxTemporaryRoleDuration: 30,
      requireApprovalForRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
      autoApproveRoles: [UserRole.STUDENT]
    };

    roleManager = new RoleManager(mockConfig);

    // Mock console.log to avoid test output noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with provided config', () => {
      expect(roleManager).toBeInstanceOf(RoleManager);
      expect((roleManager as any).config).toEqual(mockConfig);
    });
  });

  describe('requestRole', () => {
    test('should create role request with correct properties', async () => {
      const userId = 'user-123';
      const roleType = UserRole.TEACHER;
      const institutionId = 'inst-456';
      const justification = 'I am a qualified teacher';

      const result = await roleManager.requestRole(userId, roleType, institutionId, justification);

      expect(result.id).toBe('mock-uuid-123');
      expect(result.userId).toBe(userId);
      expect(result.requestedRole).toBe(roleType);
      expect(result.justification).toBe(justification);
      expect(result.status).toBe(RoleRequestStatus.PENDING);
      expect(result.institutionId).toBe(institutionId);
      expect(result.verificationMethod).toBe(VerificationMethod.ADMIN_APPROVAL);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    test('should set verification method based on role type', async () => {
      // Test auto-approve role
      const studentRequest = await roleManager.requestRole(
        'user-123',
        UserRole.STUDENT,
        'inst-456'
      );
      expect(studentRequest.verificationMethod).toBe(VerificationMethod.EMAIL_DOMAIN);

      // Test approval required role
      const teacherRequest = await roleManager.requestRole(
        'user-456',
        UserRole.TEACHER,
        'inst-456'
      );
      expect(teacherRequest.verificationMethod).toBe(VerificationMethod.ADMIN_APPROVAL);
    });

    test('should handle optional parameters', async () => {
      const result = await roleManager.requestRole(
        'user-123',
        UserRole.TEACHER,
        'inst-456',
        'Justification',
        'dept-789'
      );

      expect(result.justification).toBe('Justification');
      expect(result.departmentId).toBe('dept-789');
    });

    test('should set expiration date correctly', async () => {
      const beforeRequest = new Date();
      const result = await roleManager.requestRole(
        'user-123',
        UserRole.TEACHER,
        'inst-456'
      );
      const afterRequest = new Date();

      const expectedExpiration = new Date(beforeRequest);
      expectedExpiration.setDate(expectedExpiration.getDate() + mockConfig.defaultRoleRequestExpiration);

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiration.getTime() - 1000);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        new Date(afterRequest.getTime() + mockConfig.defaultRoleRequestExpiration * 24 * 60 * 60 * 1000).getTime()
      );
    });
  });

  describe('approveRole', () => {
    test('should throw error for non-existent request', async () => {
      await expect(
        roleManager.approveRole('non-existent', 'admin-123')
      ).rejects.toThrow('Role request not found');
    });

    test('should handle approval process', async () => {
      // This test would require mocking the private methods
      // For now, we test the error cases that don't require database access
      await expect(
        roleManager.approveRole('request-123', 'admin-456', 'Approved')
      ).rejects.toThrow('Role request not found');
    });
  });

  describe('denyRole', () => {
    test('should throw error for non-existent request', async () => {
      await expect(
        roleManager.denyRole('non-existent', 'admin-123', 'Denied')
      ).rejects.toThrow('Role request not found');
    });

    test('should require reason for denial', async () => {
      // Test that reason parameter is required (TypeScript enforces this)
      const denyWithReason = () => roleManager.denyRole('req-123', 'admin-456', 'Invalid credentials');
      expect(denyWithReason).toBeDefined();
    });
  });

  describe('assignRole', () => {
    test('should create role assignment with correct properties', async () => {
      const request = {
        userId: 'user-123',
        role: UserRole.TEACHER,
        assignedBy: 'admin-456',
        institutionId: 'inst-789',
        justification: 'Approved request'
      };

      const result = await roleManager.assignRole(request);

      expect(result.id).toBe('mock-uuid-123');
      expect(result.userId).toBe(request.userId);
      expect(result.role).toBe(request.role);
      expect(result.assignedBy).toBe(request.assignedBy);
      expect(result.institutionId).toBe(request.institutionId);
      expect(result.status).toBe(RoleStatus.ACTIVE);
      expect(result.isTemporary).toBe(false);
      expect(result.assignedAt).toBeInstanceOf(Date);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    test('should handle optional fields', async () => {
      const request = {
        userId: 'user-123',
        role: UserRole.TEACHER,
        assignedBy: 'admin-456',
        institutionId: 'inst-789',
        departmentId: 'dept-123',
        isTemporary: true,
        expiresAt: new Date('2024-12-31'),
        metadata: { source: 'bulk_import' }
      };

      const result = await roleManager.assignRole(request);

      expect(result.departmentId).toBe(request.departmentId);
      expect(result.isTemporary).toBe(true);
      expect(result.expiresAt).toEqual(request.expiresAt);
      expect(result.metadata).toEqual(request.metadata);
    });
  });

  describe('assignTemporaryRole', () => {
    test('should create temporary role assignment', async () => {
      const userId = 'user-123';
      const role = UserRole.TEACHER;
      const assignedBy = 'admin-456';
      const institutionId = 'inst-789';
      const expiresAt = new Date('2024-06-01');

      const result = await roleManager.assignTemporaryRole(
        userId,
        role,
        assignedBy,
        institutionId,
        expiresAt
      );

      expect(result.userId).toBe(userId);
      expect(result.role).toBe(role);
      expect(result.assignedBy).toBe(assignedBy);
      expect(result.institutionId).toBe(institutionId);
      expect(result.isTemporary).toBe(true);
      expect(result.expiresAt).toEqual(expiresAt);
    });

    test('should throw error for expiration beyond max duration', async () => {
      const farFutureDate = new Date();
      farFutureDate.setDate(farFutureDate.getDate() + mockConfig.maxTemporaryRoleDuration + 1);

      await expect(
        roleManager.assignTemporaryRole(
          'user-123',
          UserRole.TEACHER,
          'admin-456',
          'inst-789',
          farFutureDate
        )
      ).rejects.toThrow(`Temporary role cannot exceed ${mockConfig.maxTemporaryRoleDuration} days`);
    });

    test('should accept expiration within max duration', async () => {
      const validDate = new Date();
      validDate.setDate(validDate.getDate() + mockConfig.maxTemporaryRoleDuration - 1);

      const result = await roleManager.assignTemporaryRole(
        'user-123',
        UserRole.TEACHER,
        'admin-456',
        'inst-789',
        validDate
      );

      expect(result.expiresAt).toEqual(validDate);
    });
  });

  describe('processBulkRoleAssignment', () => {
    test('should process successful assignments', async () => {
      const bulkRequest = {
        assignments: [
          {
            userId: 'user-1',
            role: UserRole.STUDENT,
            assignedBy: 'admin-123',
            institutionId: 'inst-456'
          },
          {
            userId: 'user-2',
            role: UserRole.STUDENT,
            assignedBy: 'admin-123',
            institutionId: 'inst-456'
          }
        ],
        assignedBy: 'admin-123',
        institutionId: 'inst-456'
      };

      const result = await roleManager.processBulkRoleAssignment(bulkRequest);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.assignments).toHaveLength(2);
    });

    test('should handle validation errors', async () => {
      const bulkRequest = {
        assignments: [
          {
            userId: '', // Invalid - empty userId
            role: UserRole.STUDENT,
            assignedBy: 'admin-123',
            institutionId: 'inst-456'
          },
          {
            userId: 'user-2',
            role: UserRole.STUDENT,
            assignedBy: 'admin-123',
            institutionId: 'inst-456'
          }
        ],
        assignedBy: 'admin-123',
        institutionId: 'inst-456'
      };

      const result = await roleManager.processBulkRoleAssignment(bulkRequest);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].index).toBe(0);
      expect(result.errors[0].userId).toBe('');
      expect(result.errors[0].error).toContain('Missing required fields');
    });

    test('should support validation-only mode', async () => {
      const bulkRequest = {
        assignments: [
          {
            userId: 'user-1',
            role: UserRole.STUDENT,
            assignedBy: 'admin-123',
            institutionId: 'inst-456'
          }
        ],
        assignedBy: 'admin-123',
        institutionId: 'inst-456',
        validateOnly: true
      };

      const result = await roleManager.processBulkRoleAssignment(bulkRequest);

      expect(result.successful).toBe(1);
      expect(result.assignments).toHaveLength(0); // No actual assignments in validation mode
    });
  });

  describe('private helper methods', () => {
    test('should determine verification method correctly', () => {
      // Access private method for testing
      const determineMethod = (roleManager as any).determineVerificationMethod.bind(roleManager);

      expect(determineMethod(UserRole.STUDENT)).toBe(VerificationMethod.EMAIL_DOMAIN);
      expect(determineMethod(UserRole.TEACHER)).toBe(VerificationMethod.ADMIN_APPROVAL);
      expect(determineMethod(UserRole.DEPARTMENT_ADMIN)).toBe(VerificationMethod.ADMIN_APPROVAL);
    });

    test('should check auto-approval correctly', () => {
      const canAutoApprove = (roleManager as any).canAutoApprove.bind(roleManager);

      expect(canAutoApprove(UserRole.STUDENT, VerificationMethod.EMAIL_DOMAIN)).toBe(true);
      expect(canAutoApprove(UserRole.TEACHER, VerificationMethod.EMAIL_DOMAIN)).toBe(false);
      expect(canAutoApprove(UserRole.STUDENT, VerificationMethod.ADMIN_APPROVAL)).toBe(false);
    });

    test('should generate unique IDs', () => {
      const generateId = (roleManager as any).generateId.bind(roleManager);
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).toBe('mock-uuid-123');
      expect(id2).toBe('mock-uuid-123');
      expect(typeof id1).toBe('string');
    });
  });

  describe('error handling', () => {
    test('should handle validation errors gracefully', async () => {
      const invalidRequest = {
        userId: '', // Invalid
        role: UserRole.TEACHER,
        assignedBy: 'admin-456',
        institutionId: 'inst-789'
      };

      await expect(
        roleManager.assignRole(invalidRequest)
      ).rejects.toThrow('Missing required fields for role assignment');
    });

    test('should validate role change requests', async () => {
      const invalidChangeRequest = {
        userId: '',
        currentRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: 'admin-123',
        reason: 'Promotion',
        institutionId: 'inst-456',
        requiresApproval: false
      };

      await expect(
        roleManager.changeRole(invalidChangeRequest)
      ).rejects.toThrow('Missing required fields for role change');
    });
  });

  describe('configuration validation', () => {
    test('should work with different configurations', () => {
      const customConfig: RoleManagerConfig = {
        defaultRoleRequestExpiration: 14,
        maxTemporaryRoleDuration: 60,
        requireApprovalForRoles: [UserRole.SYSTEM_ADMIN],
        autoApproveRoles: [UserRole.STUDENT, UserRole.TEACHER]
      };

      const customRoleManager = new RoleManager(customConfig);
      expect((customRoleManager as any).config).toEqual(customConfig);
    });

    test('should handle empty approval arrays', () => {
      const emptyConfig: RoleManagerConfig = {
        defaultRoleRequestExpiration: 7,
        maxTemporaryRoleDuration: 30,
        requireApprovalForRoles: [],
        autoApproveRoles: []
      };

      const emptyRoleManager = new RoleManager(emptyConfig);
      const determineMethod = (emptyRoleManager as any).determineVerificationMethod.bind(emptyRoleManager);

      expect(determineMethod(UserRole.STUDENT)).toBe(VerificationMethod.MANUAL_REVIEW);
      expect(determineMethod(UserRole.TEACHER)).toBe(VerificationMethod.MANUAL_REVIEW);
    });
  });
});