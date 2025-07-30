/**
 * Role Migration Tests
 * 
 * Tests for migration and integration utilities to ensure data integrity
 * during system transition.
 * 
 * Requirements: 1.1, 1.5
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RoleCompatibilityService } from '../../../lib/services/role-compatibility-service';
import { RoleValidationService } from '../../../lib/services/role-validation-service';
import { RoleRollbackService } from '../../../lib/services/role-rollback-service';
import { UserRole, RoleStatus } from '../../../lib/types/role-management';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        limit: jest.fn(() => ({ single: jest.fn() }))
      })),
      in: jest.fn(() => ({
        single: jest.fn()
      })),
      gte: jest.fn(() => ({
        in: jest.fn(() => ({ single: jest.fn() }))
      })),
      lt: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn()
        }))
      })),
      order: jest.fn(() => ({
        limit: jest.fn(),
        ascending: jest.fn(() => ({
          limit: jest.fn()
        }))
      })),
      contains: jest.fn()
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(),
      in: jest.fn()
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(),
      in: jest.fn()
    })),
    is: jest.fn(() => ({
      single: jest.fn()
    }))
  })),
  rpc: jest.fn()
};

jest.mock('../../../lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('Role Migration System', () => {
  let compatibilityService: RoleCompatibilityService;
  let validationService: RoleValidationService;
  let rollbackService: RoleRollbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    compatibilityService = new RoleCompatibilityService({
      enableLegacySupport: true,
      migrationMode: 'hybrid',
      fallbackToLegacy: true,
      logCompatibilityIssues: false // Disable logging in tests
    });
    validationService = new RoleValidationService();
    rollbackService = new RoleRollbackService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('RoleCompatibilityService', () => {
    describe('getUserRole', () => {
      it('should return role from new system when available', async () => {
        // Mock new system response
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: { primary_role: 'teacher', role_status: 'active' },
          error: null
        });

        const result = await compatibilityService.getUserRole('user-123');
        
        expect(result).toBe(UserRole.TEACHER);
        expect(mockSupabase.from).toHaveBeenCalledWith('users');
      });

      it('should fallback to legacy system when new system has no data', async () => {
        // Mock new system returning null
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({
            data: null,
            error: null
          })
          // Mock legacy system response
          .mockResolvedValueOnce({
            data: { role: 'instructor' },
            error: null
          });

        const result = await compatibilityService.getUserRole('user-123');
        
        expect(result).toBe(UserRole.TEACHER); // instructor maps to teacher
      });

      it('should handle migration mode correctly', async () => {
        // Mock new system returning null
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({
            data: null,
            error: null
          })
          // Mock legacy system response
          .mockResolvedValueOnce({
            data: { role: 'admin' },
            error: null
          })
          // Mock user data for migration
          .mockResolvedValueOnce({
            data: { institution_id: 'inst-123', department_id: null },
            error: null
          })
          // Mock existing assignment check
          .mockResolvedValueOnce({
            data: null,
            error: { message: 'Not found' }
          });

        // Mock insert for on-the-fly migration
        mockSupabase.from().insert.mockResolvedValueOnce({
          error: null
        });

        // Mock update for user primary role
        mockSupabase.from().update().eq.mockResolvedValueOnce({
          error: null
        });

        const result = await compatibilityService.getUserRole('user-123');
        
        expect(result).toBe(UserRole.INSTITUTION_ADMIN); // admin maps to institution_admin
        expect(mockSupabase.from().insert).toHaveBeenCalled(); // Should trigger migration
      });

      it('should return null when no role found in either system', async () => {
        // Mock both systems returning null
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({
            data: null,
            error: null
          })
          .mockResolvedValueOnce({
            data: null,
            error: null
          });

        const result = await compatibilityService.getUserRole('user-123');
        
        expect(result).toBeNull();
      });
    });

    describe('getUserRoles', () => {
      it('should return multiple roles from new system', async () => {
        mockSupabase.from().select().eq().eq.mockResolvedValueOnce({
          data: [
            { role: 'teacher' },
            { role: 'department_admin' }
          ],
          error: null
        });

        const result = await compatibilityService.getUserRoles('user-123');
        
        expect(result).toEqual([UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN]);
      });

      it('should fallback to single legacy role', async () => {
        // Mock new system returning empty array
        mockSupabase.from().select().eq().eq
          .mockResolvedValueOnce({
            data: [],
            error: null
          });

        // Mock legacy system response
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({
            data: { role: 'student' },
            error: null
          });

        const result = await compatibilityService.getUserRoles('user-123');
        
        expect(result).toEqual([UserRole.STUDENT]);
      });
    });

    describe('hasRole', () => {
      it('should correctly check if user has specific role', async () => {
        mockSupabase.from().select().eq().eq.mockResolvedValueOnce({
          data: [
            { role: 'teacher' },
            { role: 'department_admin' }
          ],
          error: null
        });

        const hasTeacher = await compatibilityService.hasRole('user-123', UserRole.TEACHER);
        const hasStudent = await compatibilityService.hasRole('user-123', UserRole.STUDENT);
        
        expect(hasTeacher).toBe(true);
        expect(hasStudent).toBe(false);
      });
    });

    describe('getCompatibilityStatus', () => {
      it('should return correct compatibility status', async () => {
        // Mock new system response
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({
            data: { primary_role: 'teacher', role_status: 'active' },
            error: null
          })
          // Mock legacy system response
          .mockResolvedValueOnce({
            data: { role: 'instructor' },
            error: null
          });

        const status = await compatibilityService.getCompatibilityStatus('user-123');
        
        expect(status).toEqual({
          hasNewRoleData: true,
          hasLegacyRoleData: true,
          needsMigration: false,
          compatibilityMode: 'hybrid'
        });
      });
    });
  });

  describe('RoleValidationService', () => {
    describe('validateUserRoles', () => {
      it('should validate user roles successfully', async () => {
        // Mock user data
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            id: 'user-123',
            email: 'test@example.com',
            primary_role: 'teacher',
            role_status: 'active',
            institution_id: 'inst-123',
            department_id: null
          },
          error: null
        });

        // Mock role assignments
        mockSupabase.from().select().eq.mockResolvedValueOnce({
          data: [{
            id: 'assignment-123',
            user_id: 'user-123',
            role: 'teacher',
            status: 'active',
            assigned_at: new Date().toISOString(),
            institution_id: 'inst-123',
            is_temporary: false
          }],
          error: null
        });

        const result = await validationService.validateUserRoles('user-123');
        
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.metadata?.userId).toBe('user-123');
      });

      it('should detect missing primary role', async () => {
        // Mock user without primary role
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            id: 'user-123',
            email: 'test@example.com',
            primary_role: null,
            role_status: 'active',
            institution_id: 'inst-123',
            department_id: null
          },
          error: null
        });

        // Mock empty assignments
        mockSupabase.from().select().eq.mockResolvedValueOnce({
          data: [],
          error: null
        });

        const result = await validationService.validateUserRoles('user-123');
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            code: 'MISSING_PRIMARY_ROLE',
            severity: 'high'
          })
        );
      });

      it('should detect expired active assignments', async () => {
        // Mock user data
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            id: 'user-123',
            email: 'test@example.com',
            primary_role: 'teacher',
            role_status: 'active',
            institution_id: 'inst-123',
            department_id: null
          },
          error: null
        });

        // Mock expired assignment
        const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
        mockSupabase.from().select().eq.mockResolvedValueOnce({
          data: [{
            id: 'assignment-123',
            user_id: 'user-123',
            role: 'teacher',
            status: 'active',
            assigned_at: new Date().toISOString(),
            expires_at: expiredDate.toISOString(),
            institution_id: 'inst-123',
            is_temporary: true
          }],
          error: null
        });

        const result = await validationService.validateUserRoles('user-123');
        
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            code: 'EXPIRED_ACTIVE_ASSIGNMENT'
          })
        );
      });
    });

    describe('validateRoleAssignment', () => {
      it('should validate valid role assignment', async () => {
        const assignment = {
          id: 'assignment-123',
          userId: 'user-123',
          role: UserRole.TEACHER,
          status: RoleStatus.ACTIVE,
          assignedBy: 'admin-123',
          assignedAt: new Date(),
          institutionId: 'inst-123',
          isTemporary: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Mock foreign key validations
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({ data: { id: 'user-123' }, error: null }) // User exists
          .mockResolvedValueOnce({ data: { id: 'inst-123' }, error: null }); // Institution exists

        const result = await validationService.validateRoleAssignment(assignment);
        
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should detect missing required fields', async () => {
        const assignment = {
          id: 'assignment-123',
          userId: '', // Missing
          role: UserRole.TEACHER,
          status: RoleStatus.ACTIVE,
          assignedBy: 'admin-123',
          assignedAt: new Date(),
          institutionId: '', // Missing
          isTemporary: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const result = await validationService.validateRoleAssignment(assignment);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            code: 'MISSING_USER_ID',
            severity: 'critical'
          })
        );
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            code: 'MISSING_INSTITUTION_ID',
            severity: 'critical'
          })
        );
      });

      it('should detect invalid expiration date', async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const assignment = {
          id: 'assignment-123',
          userId: 'user-123',
          role: UserRole.TEACHER,
          status: RoleStatus.ACTIVE,
          assignedBy: 'admin-123',
          assignedAt: now,
          expiresAt: yesterday, // Invalid: expires before assignment
          institutionId: 'inst-123',
          isTemporary: true,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Mock foreign key validations
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({ data: { id: 'user-123' }, error: null })
          .mockResolvedValueOnce({ data: { id: 'inst-123' }, error: null });

        const result = await validationService.validateRoleAssignment(assignment);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            code: 'INVALID_EXPIRATION',
            severity: 'high'
          })
        );
      });
    });

    describe('validateSystem', () => {
      it('should run comprehensive system validation', async () => {
        // Mock users query
        mockSupabase.from().select.mockResolvedValueOnce({
          data: [
            {
              id: 'user-1',
              email: 'user1@example.com',
              primary_role: 'teacher',
              role_status: 'active',
              institution_id: 'inst-123',
              department_id: null
            },
            {
              id: 'user-2',
              email: 'user2@example.com',
              primary_role: null, // Invalid
              role_status: 'active',
              institution_id: 'inst-123',
              department_id: null
            }
          ],
          error: null
        });

        // Mock individual user validations
        mockSupabase.from().select().eq().single
          // User 1 validation
          .mockResolvedValueOnce({
            data: {
              id: 'user-1',
              email: 'user1@example.com',
              primary_role: 'teacher',
              role_status: 'active',
              institution_id: 'inst-123',
              department_id: null
            },
            error: null
          });

        mockSupabase.from().select().eq
          .mockResolvedValueOnce({
            data: [{
              id: 'assignment-1',
              user_id: 'user-1',
              role: 'teacher',
              status: 'active',
              assigned_at: new Date().toISOString(),
              institution_id: 'inst-123',
              is_temporary: false
            }],
            error: null
          });

        // User 2 validation
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({
            data: {
              id: 'user-2',
              email: 'user2@example.com',
              primary_role: null,
              role_status: 'active',
              institution_id: 'inst-123',
              department_id: null
            },
            error: null
          });

        mockSupabase.from().select().eq
          .mockResolvedValueOnce({
            data: [],
            error: null
          });

        const report = await validationService.validateSystem();
        
        expect(report.totalUsers).toBe(2);
        expect(report.validUsers).toBe(1);
        expect(report.invalidUsers).toBe(1);
        expect(report.issues).toContainEqual(
          expect.objectContaining({
            userId: 'user-2',
            issueType: 'MISSING_PRIMARY_ROLE'
          })
        );
        expect(report.summary.healthScore).toBeLessThan(100);
      });
    });
  });

  describe('RoleRollbackService', () => {
    describe('createRollbackSnapshot', () => {
      it('should create rollback snapshot successfully', async () => {
        // Mock users query
        mockSupabase.from().select
          .mockResolvedValueOnce({
            data: [
              {
                id: 'user-123',
                email: 'test@example.com',
                primary_role: 'teacher',
                role_status: 'active',
                institution_id: 'inst-123'
              }
            ],
            error: null
          });

        // Mock assignments query
        mockSupabase.from().select
          .mockResolvedValueOnce({
            data: [
              {
                id: 'assignment-123',
                user_id: 'user-123',
                role: 'teacher',
                status: 'active'
              }
            ],
            error: null
          });

        // Mock audit logs query
        mockSupabase.from().select().gte
          .mockResolvedValueOnce({
            data: [],
            error: null
          });

        // Mock snapshot insert
        mockSupabase.from().insert.mockResolvedValueOnce({
          error: null
        });

        const snapshot = await rollbackService.createRollbackSnapshot(
          'Test snapshot',
          ['user-123']
        );
        
        expect(snapshot.id).toMatch(/^snapshot_/);
        expect(snapshot.description).toBe('Test snapshot');
        expect(snapshot.userCount).toBe(1);
        expect(snapshot.assignmentCount).toBe(1);
        expect(mockSupabase.from().insert).toHaveBeenCalled();
      });
    });

    describe('rollbackRoleAssignment', () => {
      it('should rollback role assignment successfully', async () => {
        // Mock assignment query
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            id: 'assignment-123',
            user_id: 'user-123',
            role: 'teacher',
            status: 'active',
            assigned_at: new Date().toISOString(),
            institution_id: 'inst-123',
            department_id: null
          },
          error: null
        });

        // Mock audit log query for previous state
        mockSupabase.from().select().eq().lt().order().limit.mockResolvedValueOnce({
          data: [{
            old_role: 'student',
            timestamp: new Date(Date.now() - 60000).toISOString()
          }],
          error: null
        });

        // Mock assignment deletion
        mockSupabase.from().delete().eq.mockResolvedValueOnce({
          error: null
        });

        // Mock previous role restoration
        mockSupabase.from().insert.mockResolvedValueOnce({
          error: null
        });

        mockSupabase.from().update().eq.mockResolvedValueOnce({
          error: null
        });

        // Mock rollback operation logging
        mockSupabase.from().insert.mockResolvedValueOnce({
          error: null
        });

        const result = await rollbackService.rollbackRoleAssignment(
          'assignment-123',
          'Test rollback'
        );
        
        expect(result.success).toBe(true);
        expect(result.affectedUsers).toBe(1);
        expect(result.rollbackActions).toHaveLength(2); // Remove + restore
        expect(result.errors).toHaveLength(0);
      });

      it('should handle assignment not found', async () => {
        // Mock assignment not found
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: null,
          error: { message: 'Not found' }
        });

        const result = await rollbackService.rollbackRoleAssignment(
          'nonexistent-assignment',
          'Test rollback'
        );
        
        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            action: 'rollback_role_assignment',
            severity: 'critical'
          })
        );
      });
    });

    describe('getAvailableSnapshots', () => {
      it('should return available snapshots', async () => {
        mockSupabase.from().select().order().limit.mockResolvedValueOnce({
          data: [
            {
              id: 'snapshot-1',
              description: 'Test snapshot 1',
              user_count: 10,
              assignment_count: 15,
              metadata: {},
              created_at: new Date().toISOString()
            },
            {
              id: 'snapshot-2',
              description: 'Test snapshot 2',
              user_count: 5,
              assignment_count: 8,
              metadata: {},
              created_at: new Date().toISOString()
            }
          ],
          error: null
        });

        const snapshots = await rollbackService.getAvailableSnapshots();
        
        expect(snapshots).toHaveLength(2);
        expect(snapshots[0].id).toBe('snapshot-1');
        expect(snapshots[0].description).toBe('Test snapshot 1');
        expect(snapshots[0].userCount).toBe(10);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete migration workflow', async () => {
      // Test the complete workflow: compatibility check -> validation -> rollback if needed
      
      // 1. Check compatibility status
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({
          data: null, // No new role data
          error: null
        })
        .mockResolvedValueOnce({
          data: { role: 'instructor' }, // Legacy role data
          error: null
        });

      const status = await compatibilityService.getCompatibilityStatus('user-123');
      expect(status.needsMigration).toBe(true);

      // 2. Perform validation after migration
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: 'user-123',
          email: 'test@example.com',
          primary_role: 'teacher',
          role_status: 'active',
          institution_id: 'inst-123',
          department_id: null
        },
        error: null
      });

      mockSupabase.from().select().eq.mockResolvedValueOnce({
        data: [{
          id: 'assignment-123',
          user_id: 'user-123',
          role: 'teacher',
          status: 'active',
          assigned_at: new Date().toISOString(),
          institution_id: 'inst-123',
          is_temporary: false
        }],
        error: null
      });

      const validation = await validationService.validateUserRoles('user-123');
      expect(validation.isValid).toBe(true);

      // 3. Create rollback snapshot for safety
      mockSupabase.from().select
        .mockResolvedValueOnce({
          data: [{ id: 'user-123', email: 'test@example.com' }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [{ id: 'assignment-123', user_id: 'user-123' }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [],
          error: null
        });

      mockSupabase.from().insert.mockResolvedValueOnce({
        error: null
      });

      const snapshot = await rollbackService.createRollbackSnapshot(
        'Pre-migration snapshot',
        ['user-123']
      );
      
      expect(snapshot.id).toMatch(/^snapshot_/);
    });

    it('should handle error scenarios gracefully', async () => {
      // Test error handling in compatibility service
      mockSupabase.from().select().eq().single.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const result = await compatibilityService.getUserRole('user-123');
      expect(result).toBeNull(); // Should handle error gracefully
    });
  });
});