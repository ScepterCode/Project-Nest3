import { RoleAuditService } from '@/lib/services/role-audit-service';
import { RoleManager } from '@/lib/services/role-manager';
import { UserRole, AuditAction, UserRoleAssignment, RoleRequest, RoleRequestStatus } from '@/lib/types/role-management';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

// Mock AuditLogger
jest.mock('@/lib/services/audit-logger', () => ({
  AuditLogger: jest.fn().mockImplementation(() => ({
    logAdministrativeAction: jest.fn().mockResolvedValue('audit-id'),
    logSystemAction: jest.fn().mockResolvedValue('audit-id')
  }))
}));

describe('Role Audit Integration Tests', () => {
  let roleAuditService: RoleAuditService;
  let mockSupabase: any;
  let mockAuditData: any[];
  let mockSuspiciousData: any[];

  beforeEach(() => {
    mockAuditData = [];
    mockSuspiciousData = [];

    mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockImplementation((data: any) => {
          if (table === 'role_audit_log') {
            mockAuditData.push({ ...data, id: `audit-${mockAuditData.length + 1}` });
          } else if (table === 'role_suspicious_activities') {
            mockSuspiciousData.push({ ...data, id: `suspicious-${mockSuspiciousData.length + 1}` });
          }
          return Promise.resolve({ error: null });
        }),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis()
      }))
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    roleAuditService = new RoleAuditService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockAuditData = [];
    mockSuspiciousData = [];
  });

  describe('Complete Role Assignment Audit Flow', () => {
    it('should audit complete role assignment workflow', async () => {
      const userId = 'user-1';
      const adminId = 'admin-1';
      const institutionId = 'inst-1';

      // Step 1: User requests role
      const roleRequest: RoleRequest = {
        id: 'request-1',
        userId,
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'I am now teaching at this institution',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        metadata: {}
      };

      await roleAuditService.logRoleRequest(roleRequest);

      // Step 2: Admin approves request
      await roleAuditService.logRoleRequestDecision(
        roleRequest,
        'approved',
        adminId,
        'Verified teaching credentials'
      );

      // Step 3: Role is assigned
      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId,
        role: UserRole.TEACHER,
        status: 'active' as any,
        assignedBy: adminId,
        assignedAt: new Date(),
        institutionId,
        isTemporary: false,
        metadata: { requestId: roleRequest.id },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await roleAuditService.logRoleAssignment(assignment, adminId, 'Role request approved');

      // Verify audit trail
      expect(mockAuditData).toHaveLength(3);
      
      // Check role request log
      expect(mockAuditData[0]).toMatchObject({
        user_id: userId,
        action: AuditAction.REQUESTED,
        old_role: UserRole.STUDENT,
        new_role: UserRole.TEACHER,
        changed_by: userId,
        reason: 'I am now teaching at this institution'
      });

      // Check approval log
      expect(mockAuditData[1]).toMatchObject({
        user_id: userId,
        action: AuditAction.APPROVED,
        changed_by: adminId,
        reason: 'Verified teaching credentials'
      });

      // Check assignment log
      expect(mockAuditData[2]).toMatchObject({
        user_id: userId,
        action: AuditAction.ASSIGNED,
        new_role: UserRole.TEACHER,
        changed_by: adminId,
        reason: 'Role request approved'
      });
    });

    it('should audit role denial workflow', async () => {
      const userId = 'user-1';
      const adminId = 'admin-1';

      const roleRequest: RoleRequest = {
        id: 'request-1',
        userId,
        requestedRole: UserRole.INSTITUTION_ADMIN,
        currentRole: UserRole.STUDENT,
        justification: 'I need admin access',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: 'inst-1',
        expiresAt: new Date(),
        metadata: {}
      };

      await roleAuditService.logRoleRequest(roleRequest);
      await roleAuditService.logRoleRequestDecision(
        roleRequest,
        'denied',
        adminId,
        'Insufficient justification for admin role'
      );

      expect(mockAuditData).toHaveLength(2);
      expect(mockAuditData[1]).toMatchObject({
        action: AuditAction.DENIED,
        changed_by: adminId,
        reason: 'Insufficient justification for admin role'
      });
    });
  });

  describe('Suspicious Activity Detection Integration', () => {
    it('should detect and log rapid role changes', async () => {
      const userId = 'user-1';
      const adminId = 'admin-1';

      // Mock rapid changes query to return 3 recent changes
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'role_audit_log') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockResolvedValue({
              data: [
                { id: 'audit-1', action: AuditAction.CHANGED },
                { id: 'audit-2', action: AuditAction.ASSIGNED },
                { id: 'audit-3', action: AuditAction.REVOKED }
              ],
              error: null
            }),
            insert: jest.fn().mockImplementation((data: any) => {
              mockAuditData.push({ ...data, id: `audit-${mockAuditData.length + 1}` });
              return Promise.resolve({ error: null });
            })
          };
        } else if (table === 'role_suspicious_activities') {
          return {
            insert: jest.fn().mockImplementation((data: any) => {
              mockSuspiciousData.push({ ...data, id: `suspicious-${mockSuspiciousData.length + 1}` });
              return Promise.resolve({ error: null });
            })
          };
        }
        return mockSupabase.from(table);
      });

      // Simulate rapid role change
      await roleAuditService.logRoleChange(
        userId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        adminId,
        'Fourth role change in an hour'
      );

      // Verify audit log entry
      expect(mockAuditData).toHaveLength(1);
      expect(mockAuditData[0]).toMatchObject({
        action: AuditAction.CHANGED,
        old_role: UserRole.STUDENT,
        new_role: UserRole.TEACHER
      });

      // Verify suspicious activity detection
      expect(mockSuspiciousData).toHaveLength(1);
      expect(mockSuspiciousData[0]).toMatchObject({
        type: 'rapid_role_changes',
        severity: 'high',
        user_id: userId,
        performed_by: adminId
      });
    });

    it('should detect privilege escalation', async () => {
      const userId = 'user-1';
      const adminId = 'admin-1';

      // Mock no rapid changes
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'role_audit_log') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockResolvedValue({ data: [], error: null }),
            insert: jest.fn().mockImplementation((data: any) => {
              mockAuditData.push({ ...data, id: `audit-${mockAuditData.length + 1}` });
              return Promise.resolve({ error: null });
            })
          };
        } else if (table === 'role_suspicious_activities') {
          return {
            insert: jest.fn().mockImplementation((data: any) => {
              mockSuspiciousData.push({ ...data, id: `suspicious-${mockSuspiciousData.length + 1}` });
              return Promise.resolve({ error: null });
            })
          };
        }
        return mockSupabase.from(table);
      });

      // Simulate significant privilege escalation
      await roleAuditService.logRoleChange(
        userId,
        UserRole.STUDENT,
        UserRole.SYSTEM_ADMIN,
        adminId,
        'Emergency system admin assignment'
      );

      expect(mockSuspiciousData).toHaveLength(1);
      expect(mockSuspiciousData[0]).toMatchObject({
        type: 'privilege_escalation',
        severity: 'critical',
        description: expect.stringContaining('student to system_admin')
      });
    });

    it('should detect unusual timing patterns', async () => {
      const userId = 'user-1';
      const adminId = 'admin-1';
      const weekendDate = new Date('2024-01-06T22:00:00'); // Saturday night

      // Mock no rapid changes
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'role_audit_log') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockResolvedValue({ data: [], error: null }),
            insert: jest.fn().mockImplementation((data: any) => {
              mockAuditData.push({ ...data, id: `audit-${mockAuditData.length + 1}` });
              return Promise.resolve({ error: null });
            })
          };
        } else if (table === 'role_suspicious_activities') {
          return {
            insert: jest.fn().mockImplementation((data: any) => {
              mockSuspiciousData.push({ ...data, id: `suspicious-${mockSuspiciousData.length + 1}` });
              return Promise.resolve({ error: null });
            })
          };
        }
        return mockSupabase.from(table);
      });

      // Create audit entry with unusual timing
      const auditEntry = {
        id: 'audit-1',
        userId,
        action: AuditAction.CHANGED,
        oldRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: adminId,
        timestamp: weekendDate,
        metadata: {}
      };

      await roleAuditService.detectSuspiciousActivity(auditEntry as any);

      expect(mockSuspiciousData).toHaveLength(1);
      expect(mockSuspiciousData[0]).toMatchObject({
        type: 'unusual_pattern',
        severity: 'medium',
        description: expect.stringContaining('outside business hours')
      });
    });
  });

  describe('Audit Report Generation Integration', () => {
    it('should generate comprehensive audit report with statistics', async () => {
      const institutionId = 'inst-1';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // Mock audit entries query
      const mockAuditEntries = [
        {
          id: 'audit-1',
          userId: 'user-1',
          action: AuditAction.ASSIGNED,
          newRole: UserRole.TEACHER,
          changedBy: 'admin-1',
          timestamp: new Date(),
          metadata: {},
          performedByName: 'Admin User',
          userName: 'Test User'
        },
        {
          id: 'audit-2',
          userId: 'user-2',
          action: AuditAction.REVOKED,
          oldRole: UserRole.STUDENT,
          changedBy: 'admin-1',
          timestamp: new Date(),
          metadata: {},
          performedByName: 'Admin User',
          userName: 'Another User'
        }
      ];

      const mockSuspiciousActivities = [
        {
          id: 'suspicious-1',
          type: 'rapid_role_changes' as const,
          severity: 'high' as const,
          description: 'Test suspicious activity',
          userId: 'user-1',
          performedBy: 'admin-1',
          detectedAt: new Date(),
          relatedAuditIds: ['audit-1'],
          metadata: {},
          flagged: false
        }
      ];

      // Mock queryRoleAuditLogs
      jest.spyOn(roleAuditService, 'queryRoleAuditLogs').mockResolvedValue({
        entries: mockAuditEntries as any,
        totalCount: 2,
        hasMore: false
      });

      // Mock getSuspiciousActivities
      jest.spyOn(roleAuditService, 'getSuspiciousActivities').mockResolvedValue(
        mockSuspiciousActivities
      );

      // Mock report storage
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'role_audit_reports') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        return mockSupabase.from(table);
      });

      const report = await roleAuditService.generateRoleAuditReport(
        'Integration Test Report',
        'admin-1',
        startDate,
        endDate,
        institutionId
      );

      // Verify report structure
      expect(report.title).toBe('Integration Test Report');
      expect(report.generatedBy).toBe('admin-1');
      expect(report.periodStart).toEqual(startDate);
      expect(report.periodEnd).toEqual(endDate);
      expect(report.institutionId).toBe(institutionId);

      // Verify summary statistics
      expect(report.summary.totalRoleChanges).toBe(2);
      expect(report.summary.roleAssignments).toBe(1);
      expect(report.summary.roleRevocations).toBe(1);
      expect(report.summary.suspiciousActivities).toBe(1);

      // Verify role distribution
      expect(report.summary.roleDistribution[UserRole.TEACHER]).toBe(1);

      // Verify entries and suspicious activities
      expect(report.entries).toHaveLength(2);
      expect(report.suspiciousActivities).toHaveLength(1);
    });

    it('should handle empty audit data gracefully', async () => {
      jest.spyOn(roleAuditService, 'queryRoleAuditLogs').mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      jest.spyOn(roleAuditService, 'getSuspiciousActivities').mockResolvedValue([]);

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'role_audit_reports') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        return mockSupabase.from(table);
      });

      const report = await roleAuditService.generateRoleAuditReport(
        'Empty Report',
        'admin-1',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report.summary.totalRoleChanges).toBe(0);
      expect(report.summary.roleAssignments).toBe(0);
      expect(report.summary.suspiciousActivities).toBe(0);
      expect(report.entries).toHaveLength(0);
      expect(report.suspiciousActivities).toHaveLength(0);
    });
  });

  describe('Audit Data Integrity', () => {
    it('should maintain audit trail consistency across role operations', async () => {
      const userId = 'user-1';
      const adminId = 'admin-1';
      const institutionId = 'inst-1';

      // Simulate a series of role operations
      const operations = [
        {
          type: 'assignment',
          role: UserRole.TEACHER,
          reason: 'Initial teacher assignment'
        },
        {
          type: 'change',
          oldRole: UserRole.TEACHER,
          newRole: UserRole.DEPARTMENT_ADMIN,
          reason: 'Promoted to department admin'
        },
        {
          type: 'revocation',
          oldRole: UserRole.DEPARTMENT_ADMIN,
          reason: 'Role no longer needed'
        }
      ];

      for (const [index, operation] of operations.entries()) {
        if (operation.type === 'assignment') {
          const assignment: UserRoleAssignment = {
            id: `assignment-${index}`,
            userId,
            role: operation.role,
            status: 'active' as any,
            assignedBy: adminId,
            assignedAt: new Date(),
            institutionId,
            isTemporary: false,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date()
          };
          await roleAuditService.logRoleAssignment(assignment, adminId, operation.reason);
        } else if (operation.type === 'change') {
          await roleAuditService.logRoleChange(
            userId,
            operation.oldRole!,
            operation.newRole!,
            adminId,
            operation.reason
          );
        } else if (operation.type === 'revocation') {
          await roleAuditService.logRoleRevocation(
            userId,
            operation.oldRole!,
            adminId,
            operation.reason,
            institutionId
          );
        }
      }

      // Verify all operations were logged
      expect(mockAuditData).toHaveLength(3);

      // Verify chronological order and data consistency
      expect(mockAuditData[0]).toMatchObject({
        action: AuditAction.ASSIGNED,
        new_role: UserRole.TEACHER,
        reason: 'Initial teacher assignment'
      });

      expect(mockAuditData[1]).toMatchObject({
        action: AuditAction.CHANGED,
        old_role: UserRole.TEACHER,
        new_role: UserRole.DEPARTMENT_ADMIN,
        reason: 'Promoted to department admin'
      });

      expect(mockAuditData[2]).toMatchObject({
        action: AuditAction.REVOKED,
        old_role: UserRole.DEPARTMENT_ADMIN,
        reason: 'Role no longer needed'
      });

      // Verify all entries have consistent user and institution data
      mockAuditData.forEach(entry => {
        expect(entry.user_id).toBe(userId);
        expect(entry.changed_by).toBe(adminId);
        expect(entry.institution_id).toBe(institutionId);
        expect(entry.timestamp).toBeDefined();
      });
    });

    it('should handle concurrent audit logging without data corruption', async () => {
      const userId1 = 'user-1';
      const userId2 = 'user-2';
      const adminId = 'admin-1';

      // Simulate concurrent role assignments
      const concurrentOperations = [
        roleAuditService.logRoleChange(userId1, UserRole.STUDENT, UserRole.TEACHER, adminId, 'Concurrent op 1'),
        roleAuditService.logRoleChange(userId2, UserRole.STUDENT, UserRole.TEACHER, adminId, 'Concurrent op 2'),
        roleAuditService.logRoleRevocation(userId1, UserRole.TEACHER, adminId, 'Concurrent op 3'),
        roleAuditService.logRoleRevocation(userId2, UserRole.TEACHER, adminId, 'Concurrent op 4')
      ];

      await Promise.all(concurrentOperations);

      // Verify all operations were logged
      expect(mockAuditData).toHaveLength(4);

      // Verify data integrity - each entry should have unique ID and correct user
      const userIds = mockAuditData.map(entry => entry.user_id);
      expect(userIds.filter(id => id === userId1)).toHaveLength(2);
      expect(userIds.filter(id => id === userId2)).toHaveLength(2);

      // Verify all entries have required fields
      mockAuditData.forEach(entry => {
        expect(entry.id).toBeDefined();
        expect(entry.user_id).toBeDefined();
        expect(entry.action).toBeDefined();
        expect(entry.changed_by).toBe(adminId);
        expect(entry.timestamp).toBeDefined();
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database errors gracefully', async () => {
      const userId = 'user-1';
      const adminId = 'admin-1';

      // Mock database error
      mockSupabase.from.mockImplementation(() => ({
        insert: jest.fn().mockResolvedValue({
          error: { message: 'Database connection failed' }
        })
      }));

      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId,
        role: UserRole.TEACHER,
        status: 'active' as any,
        assignedBy: adminId,
        assignedAt: new Date(),
        institutionId: 'inst-1',
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await expect(
        roleAuditService.logRoleAssignment(assignment, adminId)
      ).rejects.toThrow('Failed to store role audit entry: Database connection failed');
    });

    it('should continue operation when suspicious activity detection fails', async () => {
      const userId = 'user-1';
      const adminId = 'admin-1';

      // Mock audit log insert success but suspicious activity insert failure
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'role_audit_log') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockResolvedValue({ data: [], error: null }),
            insert: jest.fn().mockResolvedValue({ error: null })
          };
        } else if (table === 'role_suspicious_activities') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: { message: 'Suspicious activity logging failed' }
            })
          };
        }
        return mockSupabase.from(table);
      });

      // This should not throw an error even if suspicious activity detection fails
      await expect(
        roleAuditService.logRoleChange(userId, UserRole.STUDENT, UserRole.TEACHER, adminId)
      ).resolves.toBeDefined();
    });
  });
});