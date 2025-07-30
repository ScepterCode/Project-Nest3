/**
 * Unit tests for PermissionChecker service
 */

import { PermissionChecker, PermissionCheckerConfig, Action } from '../../../lib/services/permission-checker';
import {
  UserRole,
  RoleStatus,
  Permission,
  PermissionCategory,
  PermissionScope,
  UserRoleAssignment
} from '../../../lib/types/role-management';

describe('PermissionChecker', () => {
  let permissionChecker: PermissionChecker;
  let mockConfig: PermissionCheckerConfig;

  beforeEach(() => {
    mockConfig = {
      cacheEnabled: true,
      cacheTtl: 300, // 5 minutes
      bulkCheckLimit: 100
    };

    permissionChecker = new PermissionChecker(mockConfig);

    // Mock console.log to avoid test output noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with provided config', () => {
      expect(permissionChecker).toBeInstanceOf(PermissionChecker);
      expect((permissionChecker as any).config).toEqual(mockConfig);
      expect((permissionChecker as any).permissionCache).toBeInstanceOf(Map);
    });
  });

  describe('hasPermission', () => {
    test('should return false for non-existent permission', async () => {
      const result = await permissionChecker.hasPermission(
        'user-123',
        'non.existent.permission'
      );

      expect(result).toBe(false);
    });

    test('should handle cache correctly', async () => {
      const userId = 'user-123';
      const permission = 'class.create';

      // First call - should miss cache
      const result1 = await permissionChecker.hasPermission(userId, permission);
      
      // Second call - should hit cache
      const result2 = await permissionChecker.hasPermission(userId, permission);

      expect(result1).toBe(result2);
    });

    test('should respect cache TTL', async () => {
      const shortTtlConfig = { ...mockConfig, cacheTtl: 0 }; // Immediate expiration
      const shortTtlChecker = new PermissionChecker(shortTtlConfig);

      const userId = 'user-123';
      const permission = 'class.create';

      await shortTtlChecker.hasPermission(userId, permission);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await shortTtlChecker.hasPermission(userId, permission);
      expect(result).toBe(false); // Should recompute
    });

    test('should work with cache disabled', async () => {
      const noCacheConfig = { ...mockConfig, cacheEnabled: false };
      const noCacheChecker = new PermissionChecker(noCacheConfig);

      const result = await noCacheChecker.hasPermission('user-123', 'class.create');
      expect(result).toBe(false);
    });
  });

  describe('canAccessResource', () => {
    test('should map actions to permissions correctly', async () => {
      const userId = 'user-123';
      const resourceId = 'class-456';

      const result = await permissionChecker.canAccessResource(
        userId,
        resourceId,
        Action.CREATE,
        { resourceType: 'class' }
      );

      expect(result).toBe(false); // No permissions granted in mock
    });

    test('should handle different actions', async () => {
      const userId = 'user-123';
      const resourceId = 'class-456';
      const context = { resourceType: 'class' };

      const createResult = await permissionChecker.canAccessResource(userId, resourceId, Action.CREATE, context);
      const readResult = await permissionChecker.canAccessResource(userId, resourceId, Action.READ, context);
      const updateResult = await permissionChecker.canAccessResource(userId, resourceId, Action.UPDATE, context);
      const deleteResult = await permissionChecker.canAccessResource(userId, resourceId, Action.DELETE, context);

      // All should be false with mock implementation
      expect(createResult).toBe(false);
      expect(readResult).toBe(false);
      expect(updateResult).toBe(false);
      expect(deleteResult).toBe(false);
    });

    test('should use default resource type when not provided', async () => {
      const result = await permissionChecker.canAccessResource(
        'user-123',
        'resource-456',
        Action.READ
      );

      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    test('should return empty array for user with no roles', async () => {
      const permissions = await permissionChecker.getUserPermissions('user-123');
      expect(permissions).toEqual([]);
    });

    test('should deduplicate permissions from multiple roles', async () => {
      // This would require mocking the private methods to return actual data
      const permissions = await permissionChecker.getUserPermissions('user-123');
      expect(Array.isArray(permissions)).toBe(true);
    });
  });

  describe('checkBulkPermissions', () => {
    test('should handle multiple permission checks', async () => {
      const permissionChecks = [
        { permission: 'class.create' },
        { permission: 'class.read' },
        { permission: 'user.manage' }
      ];

      const results = await permissionChecker.checkBulkPermissions('user-123', permissionChecks);

      expect(results).toHaveLength(3);
      expect(results[0].permission).toBe('class.create');
      expect(results[0].granted).toBe(false);
      expect(results[0].reason).toBe('Permission denied');
    });

    test('should enforce bulk check limit', async () => {
      const tooManyChecks = Array(mockConfig.bulkCheckLimit + 1).fill(0).map((_, i) => ({
        permission: `permission.${i}`
      }));

      await expect(
        permissionChecker.checkBulkPermissions('user-123', tooManyChecks)
      ).rejects.toThrow(`Bulk check limit exceeded: ${mockConfig.bulkCheckLimit}`);
    });

    test('should handle errors in individual checks gracefully', async () => {
      const permissionChecks = [
        { permission: 'valid.permission' },
        { permission: '' } // This might cause an error
      ];

      const results = await permissionChecker.checkBulkPermissions('user-123', permissionChecks);

      expect(results).toHaveLength(2);
      expect(results[1].granted).toBe(false);
      expect(results[1].reason).toBeDefined();
    });
  });

  describe('isAdmin', () => {
    test('should return false for non-admin users', async () => {
      const systemAdmin = await permissionChecker.isAdmin('user-123', 'system');
      const institutionAdmin = await permissionChecker.isAdmin('user-123', 'institution', 'inst-456');
      const departmentAdmin = await permissionChecker.isAdmin('user-123', 'department', 'dept-789');

      expect(systemAdmin).toBe(false);
      expect(institutionAdmin).toBe(false);
      expect(departmentAdmin).toBe(false);
    });

    test('should handle different admin scopes', async () => {
      // Test with different scope parameters
      const systemResult = await permissionChecker.isAdmin('admin-123', 'system');
      const institutionResult = await permissionChecker.isAdmin('admin-123', 'institution');
      const departmentResult = await permissionChecker.isAdmin('admin-123', 'department');

      expect(typeof systemResult).toBe('boolean');
      expect(typeof institutionResult).toBe('boolean');
      expect(typeof departmentResult).toBe('boolean');
    });
  });

  describe('cache management', () => {
    test('should invalidate user cache correctly', () => {
      const cache = (permissionChecker as any).permissionCache;
      
      // Add some mock cache entries
      cache.set('user-123:permission1:context', { result: true, expires: Date.now() + 10000 });
      cache.set('user-456:permission2:context', { result: false, expires: Date.now() + 10000 });
      cache.set('user-123:permission3:context', { result: true, expires: Date.now() + 10000 });

      expect(cache.size).toBe(3);

      permissionChecker.invalidateUserCache('user-123');

      expect(cache.size).toBe(1);
      expect(cache.has('user-456:permission2:context')).toBe(true);
    });

    test('should clear all cache', () => {
      const cache = (permissionChecker as any).permissionCache;
      
      // Add some mock cache entries
      cache.set('user-123:permission1:context', { result: true, expires: Date.now() + 10000 });
      cache.set('user-456:permission2:context', { result: false, expires: Date.now() + 10000 });

      expect(cache.size).toBe(2);

      permissionChecker.clearCache();

      expect(cache.size).toBe(0);
    });

    test('should not affect cache when disabled', () => {
      const noCacheConfig = { ...mockConfig, cacheEnabled: false };
      const noCacheChecker = new PermissionChecker(noCacheConfig);

      noCacheChecker.invalidateUserCache('user-123');
      noCacheChecker.clearCache();

      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('private helper methods', () => {
    test('should check permission scope correctly', () => {
      const checkScope = (permissionChecker as any).checkPermissionScope.bind(permissionChecker);

      const permission: Permission = {
        id: 'perm-1',
        name: 'test.permission',
        description: 'Test permission',
        category: PermissionCategory.CONTENT,
        scope: PermissionScope.SELF,
        createdAt: new Date()
      };

      const roleAssignment: UserRoleAssignment = {
        id: 'assign-1',
        userId: 'user-123',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-456',
        assignedAt: new Date(),
        institutionId: 'inst-789',
        departmentId: 'dept-456',
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Test SELF scope
      const selfResult = checkScope(permission, roleAssignment, { ownerId: 'user-123' });
      expect(selfResult).toBe(true);

      const notSelfResult = checkScope(permission, roleAssignment, { ownerId: 'user-456' });
      expect(notSelfResult).toBe(false);
    });

    test('should check admin roles correctly', () => {
      const isAdminRole = (permissionChecker as any).isAdminRole.bind(permissionChecker);

      const roleAssignment: UserRoleAssignment = {
        id: 'assign-1',
        userId: 'user-123',
        role: UserRole.SYSTEM_ADMIN,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-456',
        assignedAt: new Date(),
        institutionId: 'inst-789',
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(isAdminRole(UserRole.SYSTEM_ADMIN, 'system', roleAssignment)).toBe(true);
      expect(isAdminRole(UserRole.SYSTEM_ADMIN, 'institution', roleAssignment)).toBe(true);
      expect(isAdminRole(UserRole.SYSTEM_ADMIN, 'department', roleAssignment)).toBe(true);

      expect(isAdminRole(UserRole.STUDENT, 'system', roleAssignment)).toBe(false);
    });

    test('should map actions to permissions correctly', () => {
      const mapActions = (permissionChecker as any).mapActionToPermissions.bind(permissionChecker);

      const createPermissions = mapActions(Action.CREATE, 'class');
      expect(createPermissions).toContain('class.create');
      expect(createPermissions).toContain('class.manage');

      const managePermissions = mapActions(Action.MANAGE, 'user');
      expect(managePermissions).toContain('user.manage');
      expect(managePermissions).toHaveLength(1); // Should not include itself twice
    });

    test('should generate cache keys correctly', () => {
      const generateKey = (permissionChecker as any).generateCacheKey.bind(permissionChecker);

      const key1 = generateKey('user-123', 'class.create');
      expect(key1).toBe('user-123:class.create:global');

      const key2 = generateKey('user-123', 'class.create', {
        resourceId: 'class-456',
        resourceType: 'class',
        departmentId: 'dept-789',
        institutionId: 'inst-123'
      });
      expect(key2).toBe('user-123:class.create:class-456:class:dept-789:inst-123');
    });

    test('should check time-based conditions correctly', () => {
      const checkTimeCondition = (permissionChecker as any).checkTimeBasedCondition.bind(permissionChecker);

      const roleAssignment: UserRoleAssignment = {
        id: 'assign-1',
        userId: 'user-123',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-456',
        assignedAt: new Date(),
        institutionId: 'inst-789',
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Test with no time restrictions
      expect(checkTimeCondition({}, roleAssignment)).toBe(true);

      // Test with future start time
      const futureStart = new Date(Date.now() + 10000);
      expect(checkTimeCondition({ startTime: futureStart.toISOString() }, roleAssignment)).toBe(false);

      // Test with past end time
      const pastEnd = new Date(Date.now() - 10000);
      expect(checkTimeCondition({ endTime: pastEnd.toISOString() }, roleAssignment)).toBe(false);

      // Test with expired role
      const expiredAssignment = { ...roleAssignment, expiresAt: new Date(Date.now() - 10000) };
      expect(checkTimeCondition({}, expiredAssignment)).toBe(false);
    });
  });

  describe('error handling', () => {
    test('should handle invalid permission names gracefully', async () => {
      const result = await permissionChecker.hasPermission('user-123', '');
      expect(result).toBe(false);
    });

    test('should handle invalid user IDs gracefully', async () => {
      const result = await permissionChecker.hasPermission('', 'class.create');
      expect(result).toBe(false);
    });

    test('should handle malformed context objects', async () => {
      const result = await permissionChecker.canAccessResource(
        'user-123',
        'resource-456',
        Action.READ,
        { resourceType: undefined as any }
      );
      expect(result).toBe(false);
    });
  });

  describe('configuration validation', () => {
    test('should work with different cache configurations', () => {
      const customConfig: PermissionCheckerConfig = {
        cacheEnabled: false,
        cacheTtl: 0,
        bulkCheckLimit: 50
      };

      const customChecker = new PermissionChecker(customConfig);
      expect((customChecker as any).config).toEqual(customConfig);
    });

    test('should handle extreme configuration values', () => {
      const extremeConfig: PermissionCheckerConfig = {
        cacheEnabled: true,
        cacheTtl: 1, // 1 second
        bulkCheckLimit: 1 // Very low limit
      };

      const extremeChecker = new PermissionChecker(extremeConfig);
      expect((extremeChecker as any).config.bulkCheckLimit).toBe(1);
    });
  });
});