/**
 * Department Role Management API Tests
 * 
 * Tests for department role assignment, removal, and restriction endpoints.
 */

import { NextRequest } from 'next/server';
import { POST as assignRole } from '@/app/api/departments/[departmentId]/roles/assign/route';
import { POST as removeRole } from '@/app/api/departments/[departmentId]/roles/remove/route';
import { GET as getRoleRestrictions } from '@/app/api/departments/[departmentId]/role-restrictions/route';
import { GET as getAuditLogs } from '@/app/api/departments/[departmentId]/roles/audit/route';
import { UserRole } from '@/lib/types/role-management';

// Mock the DepartmentRoleManager
jest.mock('@/lib/services/department-role-manager', () => ({
  DepartmentRoleManager: jest.fn().mockImplementation(() => ({
    assignDepartmentRole: jest.fn(),
    removeDepartmentRole: jest.fn(),
    getDepartmentRoleRestrictions: jest.fn(),
    getDepartmentRoleStats: jest.fn(),
    getDepartmentRoleAuditLogs: jest.fn()
  }))
}));

describe('Department Role Management API', () => {
  const departmentId = 'dept-123';
  const mockParams = { params: { departmentId } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/departments/[departmentId]/roles/assign', () => {
    it('should successfully assign a role', async () => {
      const mockAssignment = {
        id: 'assignment-123',
        userId: 'user-456',
        role: UserRole.TEACHER,
        assignedBy: 'admin-user',
        departmentId,
        institutionId: 'inst-789'
      };

      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.assignDepartmentRole.mockResolvedValue(mockAssignment);

      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/assign', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user-456',
          role: UserRole.TEACHER,
          justification: 'Promoting to teacher role'
        })
      });

      const response = await assignRole(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.assignment).toEqual(mockAssignment);
      expect(data.data.message).toBe('Role assigned successfully');
    });

    it('should return 400 for missing required fields', async () => {
      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/assign', {
        method: 'POST',
        body: JSON.stringify({
          // Missing userId and role
          justification: 'Test justification'
        })
      });

      const response = await assignRole(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields: userId, role');
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid role', async () => {
      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/assign', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user-456',
          role: 'invalid_role',
          justification: 'Test justification'
        })
      });

      const response = await assignRole(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid role specified');
      expect(data.success).toBe(false);
    });

    it('should return 500 for service errors', async () => {
      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.assignDepartmentRole.mockRejectedValue(new Error('Service error'));

      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/assign', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user-456',
          role: UserRole.TEACHER,
          justification: 'Test justification'
        })
      });

      const response = await assignRole(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Service error');
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/departments/[departmentId]/roles/remove', () => {
    it('should successfully remove a role', async () => {
      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.removeDepartmentRole.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/remove', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user-456',
          role: UserRole.TEACHER,
          reason: 'No longer teaching'
        })
      });

      const response = await removeRole(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Role removed successfully');
    });

    it('should return 400 for missing required fields', async () => {
      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/remove', {
        method: 'POST',
        body: JSON.stringify({
          // Missing userId and role
          reason: 'Test reason'
        })
      });

      const response = await removeRole(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields: userId, role');
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid role', async () => {
      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/remove', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user-456',
          role: 'invalid_role',
          reason: 'Test reason'
        })
      });

      const response = await removeRole(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid role specified');
      expect(data.success).toBe(false);
    });

    it('should return 500 for service errors', async () => {
      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.removeDepartmentRole.mockRejectedValue(new Error('Removal failed'));

      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/remove', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user-456',
          role: UserRole.TEACHER,
          reason: 'Test reason'
        })
      });

      const response = await removeRole(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Removal failed');
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/departments/[departmentId]/role-restrictions', () => {
    it('should return role restrictions and current counts', async () => {
      const mockRestrictions = {
        allowedRoles: [UserRole.STUDENT, UserRole.TEACHER],
        maxUsersPerRole: {
          [UserRole.STUDENT]: 1000,
          [UserRole.TEACHER]: 50
        },
        requiresInstitutionApproval: [UserRole.DEPARTMENT_ADMIN],
        canManageRoles: [UserRole.DEPARTMENT_ADMIN]
      };

      const mockStats = {
        usersByRole: {
          [UserRole.STUDENT]: 25,
          [UserRole.TEACHER]: 10
        }
      };

      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.getDepartmentRoleRestrictions.mockResolvedValue(mockRestrictions);
      mockManager.getDepartmentRoleStats.mockResolvedValue(mockStats);

      const request = new NextRequest('http://localhost/api/departments/dept-123/role-restrictions');

      const response = await getRoleRestrictions(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.allowedRoles).toEqual(mockRestrictions.allowedRoles);
      expect(data.data.maxUsersPerRole).toEqual(mockRestrictions.maxUsersPerRole);
      expect(data.data.currentCounts).toEqual(mockStats.usersByRole);
    });

    it('should return 500 for service errors', async () => {
      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.getDepartmentRoleRestrictions.mockRejectedValue(new Error('Service error'));

      const request = new NextRequest('http://localhost/api/departments/dept-123/role-restrictions');

      const response = await getRoleRestrictions(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch role restrictions');
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/departments/[departmentId]/roles/audit', () => {
    it('should return audit logs with pagination', async () => {
      const mockAuditLogs = [
        {
          id: 'log-1',
          userId: 'user-1',
          action: 'assigned',
          newRole: UserRole.TEACHER,
          changedBy: 'admin',
          timestamp: new Date()
        },
        {
          id: 'log-2',
          userId: 'user-2',
          action: 'revoked',
          oldRole: UserRole.TEACHER,
          changedBy: 'admin',
          timestamp: new Date()
        }
      ];

      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.getDepartmentRoleAuditLogs.mockResolvedValue(mockAuditLogs);

      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/audit?limit=25&offset=0');

      const response = await getAuditLogs(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.auditLogs).toEqual(mockAuditLogs);
      expect(data.data.pagination).toEqual({
        limit: 25,
        offset: 0,
        total: mockAuditLogs.length
      });
    });

    it('should use default pagination parameters', async () => {
      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.getDepartmentRoleAuditLogs.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/audit');

      const response = await getAuditLogs(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.pagination.limit).toBe(50);
      expect(data.data.pagination.offset).toBe(0);
      expect(mockManager.getDepartmentRoleAuditLogs).toHaveBeenCalledWith(50, 0);
    });

    it('should return 500 for service errors', async () => {
      const { DepartmentRoleManager } = require('@/lib/services/department-role-manager');
      const mockManager = new DepartmentRoleManager();
      mockManager.getDepartmentRoleAuditLogs.mockRejectedValue(new Error('Audit error'));

      const request = new NextRequest('http://localhost/api/departments/dept-123/roles/audit');

      const response = await getAuditLogs(request, mockParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch audit logs');
      expect(data.success).toBe(false);
    });
  });
});