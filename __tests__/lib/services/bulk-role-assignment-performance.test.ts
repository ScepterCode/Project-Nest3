import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BulkRoleAssignmentService } from '@/lib/services/bulk-role-assignment';
import { BulkRoleAssignment, UserRole } from '@/lib/types/bulk-role-assignment';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        in: jest.fn(() => ({
          eq: jest.fn()
        }))
      })),
      in: jest.fn(() => ({
        eq: jest.fn()
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn()
      }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn()
    }))
  })),
  rpc: jest.fn()
};

// Mock the createClient function
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

// Mock audit logger and notification service
jest.mock('@/lib/services/audit-logger', () => ({
  AuditLogger: jest.fn().mockImplementation(() => ({
    logRoleChange: jest.fn().mockResolvedValue('audit-id'),
    logBulkRoleAssignmentRollback: jest.fn().mockResolvedValue('audit-id')
  }))
}));

jest.mock('@/lib/services/notification-service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    sendRoleAssignmentNotification: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('BulkRoleAssignmentService Performance Tests', () => {
  let service: BulkRoleAssignmentService;
  let performanceMetrics: {
    startTime: number;
    endTime: number;
    duration: number;
    memoryUsage: NodeJS.MemoryUsage;
  };

  beforeEach(() => {
    service = new BulkRoleAssignmentService();
    performanceMetrics = {
      startTime: 0,
      endTime: 0,
      duration: 0,
      memoryUsage: process.memoryUsage()
    };
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any resources
    jest.clearAllTimers();
  });

  const generateTestUsers = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `user-${i + 1}`,
      email: `user${i + 1}@test.com`,
      role: 'student' as UserRole,
      department_id: `dept-${Math.floor(i / 100) + 1}`,
      is_active: true
    }));
  };

  const createBulkAssignment = (userCount: number): BulkRoleAssignment => ({
    userIds: Array.from({ length: userCount }, (_, i) => `user-${i + 1}`),
    role: 'teacher' as UserRole,
    assignedBy: 'admin-user',
    institutionId: 'test-institution',
    assignmentName: `Performance Test - ${userCount} users`,
    justification: 'Performance testing bulk role assignment',
    isTemporary: false,
    sendNotifications: false,
    validateOnly: false
  });

  describe('Large Scale User Processing', () => {
    it('should handle 1000 users within 5 minutes', async () => {
      const userCount = 1000;
      const testUsers = generateTestUsers(userCount);
      const assignment = createBulkAssignment(userCount);

      // Mock successful database responses
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                eq: jest.fn(() => Promise.resolve({
                  data: testUsers,
                  error: null
                }))
              }))
            }))
          };
        }
        if (table === 'bulk_role_assignments') {
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({
                  data: { id: 'test-assignment-id' },
                  error: null
                }))
              }))
            })),
            update: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({ error: null }))
            }))
          };
        }
        if (table === 'bulk_role_assignment_items') {
          return {
            insert: jest.fn(() => Promise.resolve({ error: null })),
            update: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => Promise.resolve({ error: null }))
              }))
            }))
          };
        }
        return {
          insert: jest.fn(() => Promise.resolve({ error: null })),
          update: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ error: null }))
          }))
        };
      });

      // Mock RPC for validation
      mockSupabase.rpc.mockResolvedValue([{
        is_valid: true,
        requires_approval: false,
        approval_role: null,
        error_message: null
      }]);

      performanceMetrics.startTime = Date.now();
      const initialMemory = process.memoryUsage();

      const result = await service.assignRolesToUsers(assignment);

      performanceMetrics.endTime = Date.now();
      performanceMetrics.duration = performanceMetrics.endTime - performanceMetrics.startTime;
      performanceMetrics.memoryUsage = process.memoryUsage();

      // Performance assertions
      expect(performanceMetrics.duration).toBeLessThan(5 * 60 * 1000); // 5 minutes
      expect(result.totalUsers).toBe(userCount);
      expect(result.successfulAssignments).toBe(userCount);
      expect(result.failedAssignments).toBe(0);

      // Memory usage should not exceed reasonable limits
      const memoryIncrease = performanceMetrics.memoryUsage.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB

      console.log(`Performance Test Results for ${userCount} users:`);
      console.log(`Duration: ${performanceMetrics.duration}ms`);
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      console.log(`Average time per user: ${Math.round(performanceMetrics.duration / userCount)}ms`);
    }, 10 * 60 * 1000); // 10 minute timeout

    it('should handle 5000 users with acceptable performance', async () => {
      const userCount = 5000;
      const testUsers = generateTestUsers(userCount);
      const assignment = createBulkAssignment(userCount);

      // Mock successful database responses with batching simulation
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                eq: jest.fn(() => Promise.resolve({
                  data: testUsers,
                  error: null
                }))
              }))
            }))
          };
        }
        if (table === 'bulk_role_assignments') {
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({
                  data: { id: 'test-assignment-id' },
                  error: null
                }))
              }))
            })),
            update: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({ error: null }))
            }))
          };
        }
        return {
          insert: jest.fn(() => Promise.resolve({ error: null })),
          update: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ error: null }))
          }))
        };
      });

      mockSupabase.rpc.mockResolvedValue([{
        is_valid: true,
        requires_approval: false,
        approval_role: null,
        error_message: null
      }]);

      performanceMetrics.startTime = Date.now();
      const initialMemory = process.memoryUsage();

      const result = await service.assignRolesToUsers(assignment);

      performanceMetrics.endTime = Date.now();
      performanceMetrics.duration = performanceMetrics.endTime - performanceMetrics.startTime;
      performanceMetrics.memoryUsage = process.memoryUsage();

      // Performance assertions for larger scale
      expect(performanceMetrics.duration).toBeLessThan(15 * 60 * 1000); // 15 minutes
      expect(result.totalUsers).toBe(userCount);
      
      // Average processing time should be reasonable
      const avgTimePerUser = performanceMetrics.duration / userCount;
      expect(avgTimePerUser).toBeLessThan(200); // Less than 200ms per user

      // Memory usage should scale reasonably
      const memoryIncrease = performanceMetrics.memoryUsage.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024); // 500MB

      console.log(`Performance Test Results for ${userCount} users:`);
      console.log(`Duration: ${performanceMetrics.duration}ms`);
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      console.log(`Average time per user: ${Math.round(avgTimePerUser)}ms`);
    }, 20 * 60 * 1000); // 20 minute timeout

    it('should handle 10000 users with batch processing efficiency', async () => {
      const userCount = 10000;
      const testUsers = generateTestUsers(userCount);
      const assignment = createBulkAssignment(userCount);

      // Mock database responses with realistic delays
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                eq: jest.fn(() => new Promise(resolve => {
                  // Simulate database query time
                  setTimeout(() => resolve({
                    data: testUsers,
                    error: null
                  }), 50);
                }))
              }))
            }))
          };
        }
        if (table === 'bulk_role_assignments') {
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({
                  data: { id: 'test-assignment-id' },
                  error: null
                }))
              }))
            })),
            update: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({ error: null }))
            }))
          };
        }
        return {
          insert: jest.fn(() => new Promise(resolve => {
            // Simulate batch insert time
            setTimeout(() => resolve({ error: null }), 10);
          })),
          update: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ error: null }))
          }))
        };
      });

      mockSupabase.rpc.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve([{
          is_valid: true,
          requires_approval: false,
          approval_role: null,
          error_message: null
        }]), 5);
      }));

      performanceMetrics.startTime = Date.now();
      const initialMemory = process.memoryUsage();

      const result = await service.assignRolesToUsers(assignment);

      performanceMetrics.endTime = Date.now();
      performanceMetrics.duration = performanceMetrics.endTime - performanceMetrics.startTime;
      performanceMetrics.memoryUsage = process.memoryUsage();

      // Performance assertions for very large scale
      expect(performanceMetrics.duration).toBeLessThan(30 * 60 * 1000); // 30 minutes
      expect(result.totalUsers).toBe(userCount);
      
      // Batch processing should be efficient
      const avgTimePerUser = performanceMetrics.duration / userCount;
      expect(avgTimePerUser).toBeLessThan(300); // Less than 300ms per user

      // Memory usage should not grow excessively
      const memoryIncrease = performanceMetrics.memoryUsage.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(1024 * 1024 * 1024); // 1GB

      console.log(`Performance Test Results for ${userCount} users:`);
      console.log(`Duration: ${performanceMetrics.duration}ms`);
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      console.log(`Average time per user: ${Math.round(avgTimePerUser)}ms`);
      console.log(`Estimated batches: ${Math.ceil(userCount / 50)}`);
    }, 35 * 60 * 1000); // 35 minute timeout
  });

  describe('Validation Performance', () => {
    it('should validate 1000 users quickly', async () => {
      const userCount = 1000;
      const testUsers = generateTestUsers(userCount);
      const assignment = createBulkAssignment(userCount);

      // Mock validation responses
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                eq: jest.fn(() => Promise.resolve({
                  data: testUsers,
                  error: null
                }))
              }))
            }))
          };
        }
        return { select: jest.fn() };
      });

      mockSupabase.rpc.mockResolvedValue([{
        is_valid: true,
        requires_approval: false,
        approval_role: null,
        error_message: null
      }]);

      performanceMetrics.startTime = Date.now();

      const validationResult = await service.validateBulkAssignment(assignment);

      performanceMetrics.endTime = Date.now();
      performanceMetrics.duration = performanceMetrics.endTime - performanceMetrics.startTime;

      // Validation should be fast
      expect(performanceMetrics.duration).toBeLessThan(30 * 1000); // 30 seconds
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.affectedUsers).toBe(userCount);

      console.log(`Validation Performance for ${userCount} users:`);
      console.log(`Duration: ${performanceMetrics.duration}ms`);
      console.log(`Average validation time per user: ${Math.round(performanceMetrics.duration / userCount)}ms`);
    });
  });

  describe('Search Performance', () => {
    it('should search through large user base efficiently', async () => {
      const totalUsers = 10000;
      const searchResults = generateTestUsers(100); // Return 100 results

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            in: jest.fn(() => ({
              or: jest.fn(() => ({
                eq: jest.fn(() => ({
                  not: jest.fn(() => ({
                    order: jest.fn(() => ({
                      limit: jest.fn(() => Promise.resolve({
                        data: searchResults,
                        error: null,
                        count: totalUsers
                      }))
                    }))
                  }))
                }))
              }))
            }))
          }))
        }))
      }));

      performanceMetrics.startTime = Date.now();

      const searchResult = await service.searchUsers({
        institutionId: 'test-institution',
        searchQuery: 'test',
        currentRoles: ['student'],
        includeInactive: false
      });

      performanceMetrics.endTime = Date.now();
      performanceMetrics.duration = performanceMetrics.endTime - performanceMetrics.startTime;

      // Search should be fast even with large datasets
      expect(performanceMetrics.duration).toBeLessThan(5 * 1000); // 5 seconds
      expect(searchResult.users).toHaveLength(100);
      expect(searchResult.totalCount).toBe(totalUsers);

      console.log(`Search Performance:`);
      console.log(`Duration: ${performanceMetrics.duration}ms`);
      console.log(`Results returned: ${searchResult.users.length}`);
      console.log(`Total users searched: ${searchResult.totalCount}`);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent validations', async () => {
      const concurrentOperations = 5;
      const usersPerOperation = 200;
      
      const operations = Array.from({ length: concurrentOperations }, (_, i) => {
        const testUsers = generateTestUsers(usersPerOperation);
        const assignment = createBulkAssignment(usersPerOperation);
        
        mockSupabase.from.mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: jest.fn(() => ({
                in: jest.fn(() => ({
                  eq: jest.fn(() => Promise.resolve({
                    data: testUsers,
                    error: null
                  }))
                }))
              }))
            };
          }
          return { select: jest.fn() };
        });

        return service.validateBulkAssignment(assignment);
      });

      mockSupabase.rpc.mockResolvedValue([{
        is_valid: true,
        requires_approval: false,
        approval_role: null,
        error_message: null
      }]);

      performanceMetrics.startTime = Date.now();

      const results = await Promise.all(operations);

      performanceMetrics.endTime = Date.now();
      performanceMetrics.duration = performanceMetrics.endTime - performanceMetrics.startTime;

      // All operations should complete successfully
      expect(results).toHaveLength(concurrentOperations);
      results.forEach(result => {
        expect(result.isValid).toBe(true);
        expect(result.affectedUsers).toBe(usersPerOperation);
      });

      // Concurrent operations should not take much longer than sequential
      const expectedSequentialTime = concurrentOperations * 1000; // Rough estimate
      expect(performanceMetrics.duration).toBeLessThan(expectedSequentialTime * 2);

      console.log(`Concurrent Operations Performance:`);
      console.log(`Operations: ${concurrentOperations}`);
      console.log(`Users per operation: ${usersPerOperation}`);
      console.log(`Total duration: ${performanceMetrics.duration}ms`);
      console.log(`Average per operation: ${Math.round(performanceMetrics.duration / concurrentOperations)}ms`);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory during large operations', async () => {
      const userCount = 2000;
      const iterations = 3;
      
      const initialMemory = process.memoryUsage();
      let maxMemoryUsage = initialMemory.heapUsed;

      for (let i = 0; i < iterations; i++) {
        const testUsers = generateTestUsers(userCount);
        const assignment = createBulkAssignment(userCount);

        mockSupabase.from.mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: jest.fn(() => ({
                in: jest.fn(() => ({
                  eq: jest.fn(() => Promise.resolve({
                    data: testUsers,
                    error: null
                  }))
                }))
              }))
            };
          }
          return {
            insert: jest.fn(() => Promise.resolve({ error: null })),
            update: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({ error: null }))
            }))
          };
        });

        mockSupabase.rpc.mockResolvedValue([{
          is_valid: true,
          requires_approval: false,
          approval_role: null,
          error_message: null
        }]);

        await service.validateBulkAssignment(assignment);

        const currentMemory = process.memoryUsage();
        maxMemoryUsage = Math.max(maxMemoryUsage, currentMemory.heapUsed);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const maxMemoryIncrease = maxMemoryUsage - initialMemory.heapUsed;

      // Memory should not increase significantly after operations
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
      expect(maxMemoryIncrease).toBeLessThan(200 * 1024 * 1024); // 200MB peak

      console.log(`Memory Management Test:`);
      console.log(`Iterations: ${iterations}`);
      console.log(`Users per iteration: ${userCount}`);
      console.log(`Initial memory: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(`Final memory: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(`Max memory: ${Math.round(maxMemoryUsage / 1024 / 1024)}MB`);
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
    });
  });
});