/**
 * Permission Checking Performance Tests
 * 
 * Tests the performance of the permission checking system under various load conditions.
 * Validates caching effectiveness, bulk operation efficiency, and response times.
 */

import { PermissionChecker, PermissionCheckerConfig } from '../../lib/services/permission-checker';
import { BulkPermissionService } from '../../lib/services/bulk-permission-service';

// Mock Supabase client for testing
jest.mock('../../lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              or: () => Promise.resolve({
                data: [
                  {
                    id: 'test-assignment',
                    user_id: 'user-0',
                    role: 'student',
                    status: 'active',
                    assigned_by: 'system',
                    assigned_at: new Date().toISOString(),
                    expires_at: null,
                    department_id: 'dept-1',
                    institution_id: 'inst-1',
                    is_temporary: false,
                    metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  }
                ],
                error: null
              })
            })
          })
        })
      })
    })
  })
}));

// Mock permission definitions
jest.mock('../../lib/services/permission-definitions', () => ({
  getPermission: jest.fn().mockImplementation((name) => ({
    id: `perm-${name}`,
    name,
    description: `Permission for ${name}`,
    category: 'content',
    scope: 'department',
    createdAt: new Date()
  })),
  getRolePermissions: jest.fn().mockImplementation(() => [
    {
      id: 'student-perm-1',
      role: 'student',
      permissionId: 'content.read',
      conditions: [],
      createdAt: new Date()
    }
  ]),
  PERMISSIONS: [
    {
      id: 'content.read',
      name: 'content.read',
      description: 'Read content',
      category: 'content',
      scope: 'department',
      createdAt: new Date()
    }
  ]
}));

const mockPermissions = [
  'content.read', 'content.create', 'content.update', 'content.delete',
  'class.read', 'class.create', 'class.update', 'class.delete',
  'enrollment.read', 'enrollment.create', 'enrollment.update',
  'user.read', 'user.create', 'user.update', 'analytics.read'
];

describe('Permission Checking Performance Tests', () => {
  let permissionChecker;
  let bulkPermissionService;

  beforeEach(() => {
    const config = {
      cacheEnabled: true,
      cacheTtl: 300,
      bulkCheckLimit: 100
    };
    permissionChecker = new PermissionChecker(config);
    bulkPermissionService = new BulkPermissionService(permissionChecker);
  });

  describe('Single Permission Check Performance', () => {
    test('should check single permission within acceptable time', async () => {
      const userId = 'user-0';
      const permission = 'content.read';
      
      const startTime = performance.now();
      const result = await permissionChecker.hasPermission(userId, permission);
      const endTime = performance.now();
      
      expect(typeof result).toBe('boolean');
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });

    test('should benefit from caching on repeated checks', async () => {
      const userId = 'user-0';
      const permission = 'content.read';
      
      // First check (cache miss)
      const startTime1 = performance.now();
      await permissionChecker.hasPermission(userId, permission);
      const endTime1 = performance.now();
      const firstCheckTime = endTime1 - startTime1;
      
      // Second check (cache hit)
      const startTime2 = performance.now();
      await permissionChecker.hasPermission(userId, permission);
      const endTime2 = performance.now();
      const secondCheckTime = endTime2 - startTime2;
      
      expect(secondCheckTime).toBeLessThan(firstCheckTime); // Should be faster from cache
      expect(secondCheckTime).toBeLessThan(20); // Should be very fast from cache
    });
  });

  describe('Bulk Permission Check Performance', () => {
    test('should handle bulk permission checks efficiently', async () => {
      const userId = 'user-0';
      const permissionChecks = mockPermissions.slice(0, 10).map(permission => ({
        permission,
        context: undefined
      }));
      
      const startTime = performance.now();
      const results = await permissionChecker.checkBulkPermissions(userId, permissionChecks);
      const endTime = performance.now();
      
      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms
      
      // Calculate average time per check
      const avgTimePerCheck = (endTime - startTime) / 10;
      expect(avgTimePerCheck).toBeLessThan(50); // Should average less than 50ms per check
    });

    test('should scale well with increasing number of checks', async () => {
      const userId = 'user-0';
      const testSizes = [5, 10, 25];
      const results = [];
      
      for (const size of testSizes) {
        const permissionChecks = mockPermissions.slice(0, size).map(permission => ({
          permission,
          context: undefined
        }));
        
        const startTime = performance.now();
        await permissionChecker.checkBulkPermissions(userId, permissionChecks);
        const endTime = performance.now();
        
        const totalTime = endTime - startTime;
        const avgTime = totalTime / size;
        
        results.push({ size, time: totalTime, avgTime });
      }
      
      // Check that average time per check doesn't increase dramatically
      const firstAvg = results[0].avgTime;
      const lastAvg = results[results.length - 1].avgTime;
      
      expect(lastAvg).toBeLessThan(firstAvg * 3); // Should not triple the average time
    });
  });

  describe('UI Permission Service Performance', () => {
    test('should handle UI permission checks efficiently', async () => {
      const userId = 'user-0';
      const uiChecks = mockPermissions.slice(0, 10).map((permission, index) => ({
        id: `check-${index}`,
        permission,
        context: undefined
      }));
      
      const startTime = performance.now();
      const results = await bulkPermissionService.checkUIPermissions(userId, uiChecks);
      const endTime = performance.now();
      
      expect(results.size).toBe(10);
      expect(endTime - startTime).toBeLessThan(600); // Should complete within 600ms
    });

    test('should cache UI permission results effectively', async () => {
      const userId = 'user-0';
      const uiChecks = mockPermissions.slice(0, 5).map((permission, index) => ({
        id: `check-${index}`,
        permission,
        context: undefined
      }));
      
      // First check (cache miss)
      const startTime1 = performance.now();
      await bulkPermissionService.checkUIPermissions(userId, uiChecks, { cacheResults: true });
      const endTime1 = performance.now();
      const firstCheckTime = endTime1 - startTime1;
      
      // Second check (cache hit)
      const startTime2 = performance.now();
      await bulkPermissionService.checkUIPermissions(userId, uiChecks, { cacheResults: true });
      const endTime2 = performance.now();
      const secondCheckTime = endTime2 - startTime2;
      
      expect(secondCheckTime).toBeLessThan(firstCheckTime); // Should be faster from cache
    });

    test('should handle feature permission checks efficiently', async () => {
      const userId = 'user-0';
      const features = [
        {
          id: 'content-management',
          requiredPermissions: ['content.read', 'content.create', 'content.update'],
          requireAll: true
        },
        {
          id: 'class-management',
          requiredPermissions: ['class.read', 'class.create'],
          requireAll: false
        },
        {
          id: 'analytics-dashboard',
          requiredPermissions: ['analytics.read'],
          requireAll: true
        }
      ];
      
      const startTime = performance.now();
      const results = await bulkPermissionService.checkFeaturePermissions(userId, features);
      const endTime = performance.now();
      
      expect(results.size).toBe(3);
      expect(endTime - startTime).toBeLessThan(300); // Should complete within 300ms
    });
  });

  describe('Load Testing', () => {
    test('should handle concurrent permission checks', async () => {
      const concurrentChecks = 20;
      const promises = [];
      
      const startTime = performance.now();
      
      for (let i = 0; i < concurrentChecks; i++) {
        const userId = `user-${i % 10}`;
        const permission = mockPermissions[i % mockPermissions.length];
        promises.push(permissionChecker.hasPermission(userId, permission));
      }
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      
      expect(results).toHaveLength(concurrentChecks);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
      
      // Calculate throughput
      const throughput = concurrentChecks / ((endTime - startTime) / 1000);
      expect(throughput).toBeGreaterThan(10); // Should handle at least 10 checks per second
    });

    test('should maintain performance with many users', async () => {
      const userCount = 20;
      const checksPerUser = 3;
      const promises = [];
      
      const startTime = performance.now();
      
      for (let i = 0; i < userCount; i++) {
        const userId = `user-${i}`;
        for (let j = 0; j < checksPerUser; j++) {
          const permission = mockPermissions[j];
          promises.push(permissionChecker.hasPermission(userId, permission));
        }
      }
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      
      expect(results).toHaveLength(userCount * checksPerUser);
      expect(endTime - startTime).toBeLessThan(3000); // Should complete within 3 seconds
      
      // Calculate average time per check
      const avgTimePerCheck = (endTime - startTime) / (userCount * checksPerUser);
      expect(avgTimePerCheck).toBeLessThan(100); // Should average less than 100ms per check
    });
  });

  describe('Cache Management', () => {
    test('should handle cache invalidation efficiently', async () => {
      const userId = 'user-0';
      const permission = 'content.read';
      
      // Populate cache
      await permissionChecker.hasPermission(userId, permission);
      
      // Measure invalidation time
      const startTime = performance.now();
      permissionChecker.invalidateUserCache(userId);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(20); // Should be very fast
      
      // Verify cache was actually cleared by checking timing
      const recheckStart = performance.now();
      await permissionChecker.hasPermission(userId, permission);
      const recheckEnd = performance.now();
      
      // Should take longer than a cached result (indicating cache was cleared)
      expect(recheckEnd - recheckStart).toBeGreaterThan(5);
    });

    test('should clear all cache efficiently', async () => {
      // Populate cache with multiple users
      for (let i = 0; i < 10; i++) {
        await permissionChecker.hasPermission(`user-${i}`, 'content.read');
      }
      
      // Measure cache clear time
      const startTime = performance.now();
      permissionChecker.clearCache();
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle errors gracefully without performance degradation', async () => {
      const userId = 'nonexistent-user';
      const permission = 'invalid.permission';
      
      const startTime = performance.now();
      const result = await permissionChecker.hasPermission(userId, permission);
      const endTime = performance.now();
      
      expect(result).toBe(false);
      expect(endTime - startTime).toBeLessThan(200); // Should fail fast
    });

    test('should handle bulk check errors efficiently', async () => {
      const userId = 'user-0';
      const permissionChecks = [
        { permission: 'content.read', context: undefined },
        { permission: 'invalid.permission', context: undefined },
        { permission: 'class.read', context: undefined }
      ];
      
      const startTime = performance.now();
      const results = await permissionChecker.checkBulkPermissions(userId, permissionChecks);
      const endTime = performance.now();
      
      expect(results).toHaveLength(3);
      expect(endTime - startTime).toBeLessThan(300); // Should handle errors quickly
      
      // Should have some results but not crash
      expect(results.length).toBeGreaterThan(0);
    });
  });
});