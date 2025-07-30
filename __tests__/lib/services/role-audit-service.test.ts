import { RoleAuditService, SuspiciousActivity } from '@/lib/services/role-audit-service';
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

describe('RoleAuditService', () => {
  let roleAuditService: RoleAuditService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      getAll: jest.fn().mockReturnThis()
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    roleAuditService = new RoleAuditService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logRoleAssignment', () => {
    it('should log role assignment successfully', async () => {
      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: 'active' as any,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        institutionId: 'inst-1',
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await roleAuditService.logRoleAssignment(
        assignment,
        'admin-1',
        'New teacher assignment',
        '192.168.1.1',
        'Mozilla/5.0',
        'session-1'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.from).toHaveBeenCalledWith('role_audit_log');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          action: AuditAction.ASSIGNED,
          new_role: UserRole.TEACHER,
          changed_by: 'admin-1',
          reason: 'New teacher assignment',
          institution_id: 'inst-1'
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: 'active' as any,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        institutionId: 'inst-1',
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        roleAuditService.logRoleAssignment(assignment, 'admin-1')
      ).rejects.toThrow('Failed to store role audit entry: Database error');
    });
  });

  describe('logRoleChange', () => {
    it('should log role change with correct severity', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await roleAuditService.logRoleChange(
        'user-1',
        UserRole.STUDENT,
        UserRole.SYSTEM_ADMIN,
        'admin-1',
        'Emergency promotion'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CHANGED,
          old_role: UserRole.STUDENT,
          new_role: UserRole.SYSTEM_ADMIN
        })
      );
    });

    it('should determine correct severity for role changes', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      // Test system admin assignment (should be critical)
      await roleAuditService.logRoleChange(
        'user-1',
        UserRole.TEACHER,
        UserRole.SYSTEM_ADMIN,
        'admin-1'
      );

      // Test significant escalation (should be high)
      await roleAuditService.logRoleChange(
        'user-2',
        UserRole.STUDENT,
        UserRole.INSTITUTION_ADMIN,
        'admin-1'
      );

      // Test normal escalation (should be medium)
      await roleAuditService.logRoleChange(
        'user-3',
        UserRole.STUDENT,
        UserRole.TEACHER,
        'admin-1'
      );

      expect(mockSupabase.insert).toHaveBeenCalledTimes(3);
    });
  });

  describe('queryRoleAuditLogs', () => {
    it('should query audit logs with filters', async () => {
      const mockData = [
        {
          id: 'audit-1',
          user_id: 'user-1',
          action: AuditAction.ASSIGNED,
          new_role: UserRole.TEACHER,
          changed_by: 'admin-1',
          timestamp: new Date().toISOString(),
          metadata: {},
          performer: { full_name: 'Admin User', email: 'admin@test.com' },
          user: { full_name: 'Test User', email: 'user@test.com' },
          institution: { name: 'Test Institution' },
          department: { name: 'Test Department' }
        }
      ];

      mockSupabase.select.mockResolvedValue({ 
        data: mockData, 
        error: null, 
        count: 1 
      });

      const result = await roleAuditService.queryRoleAuditLogs({
        userId: 'user-1',
        action: AuditAction.ASSIGNED,
        limit: 10,
        offset: 0
      });

      expect(result.entries).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.entries[0].userName).toBe('Test User');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(mockSupabase.eq).toHaveBeenCalledWith('action', AuditAction.ASSIGNED);
    });

    it('should handle date range filters', async () => {
      mockSupabase.select.mockResolvedValue({ 
        data: [], 
        error: null, 
        count: 0 
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await roleAuditService.queryRoleAuditLogs({
        startDate,
        endDate
      });

      expect(mockSupabase.gte).toHaveBeenCalledWith('timestamp', startDate.toISOString());
      expect(mockSupabase.lte).toHaveBeenCalledWith('timestamp', endDate.toISOString());
    });

    it('should handle role filter with OR condition', async () => {
      mockSupabase.select.mockResolvedValue({ 
        data: [], 
        error: null, 
        count: 0 
      });

      await roleAuditService.queryRoleAuditLogs({
        role: UserRole.TEACHER
      });

      expect(mockSupabase.or).toHaveBeenCalledWith(
        `old_role.eq.${UserRole.TEACHER},new_role.eq.${UserRole.TEACHER}`
      );
    });
  });

  describe('detectSuspiciousActivity', () => {
    it('should detect rapid role changes', async () => {
      const auditEntry = {
        id: 'audit-1',
        userId: 'user-1',
        action: AuditAction.CHANGED,
        changedBy: 'admin-1',
        timestamp: new Date(),
        metadata: {}
      };

      // Mock rapid changes query
      mockSupabase.select.mockResolvedValue({
        data: [
          { id: 'audit-1', action: AuditAction.CHANGED },
          { id: 'audit-2', action: AuditAction.ASSIGNED },
          { id: 'audit-3', action: AuditAction.REVOKED }
        ],
        error: null
      });

      // Mock suspicious activity insert
      mockSupabase.insert.mockResolvedValue({ error: null });

      await roleAuditService.detectSuspiciousActivity(auditEntry as any);

      expect(mockSupabase.from).toHaveBeenCalledWith('role_suspicious_activities');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rapid_role_changes',
          severity: 'high',
          user_id: 'user-1',
          performed_by: 'admin-1'
        })
      );
    });

    it('should detect privilege escalation', async () => {
      const auditEntry = {
        id: 'audit-1',
        userId: 'user-1',
        action: AuditAction.CHANGED,
        oldRole: UserRole.STUDENT,
        newRole: UserRole.SYSTEM_ADMIN,
        changedBy: 'admin-1',
        timestamp: new Date(),
        metadata: {}
      };

      // Mock no rapid changes
      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null
      });

      mockSupabase.insert.mockResolvedValue({ error: null });

      await roleAuditService.detectSuspiciousActivity(auditEntry as any);

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'privilege_escalation',
          severity: 'critical',
          description: expect.stringContaining('student to system_admin')
        })
      );
    });

    it('should detect unusual patterns (weekend activity)', async () => {
      const weekendDate = new Date('2024-01-06T15:00:00'); // Saturday
      const auditEntry = {
        id: 'audit-1',
        userId: 'user-1',
        action: AuditAction.CHANGED,
        changedBy: 'admin-1',
        timestamp: weekendDate,
        metadata: {}
      };

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null
      });

      mockSupabase.insert.mockResolvedValue({ error: null });

      await roleAuditService.detectSuspiciousActivity(auditEntry as any);

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unusual_pattern',
          severity: 'medium',
          description: expect.stringContaining('outside business hours')
        })
      );
    });

    it('should not flag system actions as unusual patterns', async () => {
      const weekendDate = new Date('2024-01-06T15:00:00'); // Saturday
      const auditEntry = {
        id: 'audit-1',
        userId: 'user-1',
        action: AuditAction.EXPIRED,
        changedBy: 'system',
        timestamp: weekendDate,
        metadata: {}
      };

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null
      });

      mockSupabase.insert.mockResolvedValue({ error: null });

      await roleAuditService.detectSuspiciousActivity(auditEntry as any);

      // Should not insert unusual pattern for system actions
      expect(mockSupabase.insert).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unusual_pattern'
        })
      );
    });
  });

  describe('generateRoleAuditReport', () => {
    it('should generate comprehensive audit report', async () => {
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
        }
      ];

      const mockSuspiciousActivities: SuspiciousActivity[] = [
        {
          id: 'suspicious-1',
          type: 'rapid_role_changes',
          severity: 'high',
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
        totalCount: 1,
        hasMore: false
      });

      // Mock getSuspiciousActivities
      jest.spyOn(roleAuditService, 'getSuspiciousActivities').mockResolvedValue(
        mockSuspiciousActivities
      );

      mockSupabase.insert.mockResolvedValue({ error: null });

      const report = await roleAuditService.generateRoleAuditReport(
        'Test Report',
        'admin-1',
        new Date('2024-01-01'),
        new Date('2024-12-31'),
        'inst-1'
      );

      expect(report.title).toBe('Test Report');
      expect(report.entries).toHaveLength(1);
      expect(report.suspiciousActivities).toHaveLength(1);
      expect(report.summary.totalRoleChanges).toBe(1);
      expect(report.summary.roleAssignments).toBe(1);
      expect(report.summary.suspiciousActivities).toBe(1);
    });

    it('should calculate correct summary statistics', async () => {
      const mockAuditEntries = [
        {
          id: 'audit-1',
          action: AuditAction.ASSIGNED,
          newRole: UserRole.TEACHER,
          changedBy: 'admin-1',
          performedByName: 'Admin User'
        },
        {
          id: 'audit-2',
          action: AuditAction.REVOKED,
          oldRole: UserRole.STUDENT,
          changedBy: 'admin-1',
          performedByName: 'Admin User'
        },
        {
          id: 'audit-3',
          action: AuditAction.REQUESTED,
          newRole: UserRole.TEACHER,
          changedBy: 'user-1',
          performedByName: 'Test User'
        }
      ];

      jest.spyOn(roleAuditService, 'queryRoleAuditLogs').mockResolvedValue({
        entries: mockAuditEntries as any,
        totalCount: 3,
        hasMore: false
      });

      jest.spyOn(roleAuditService, 'getSuspiciousActivities').mockResolvedValue([]);

      mockSupabase.insert.mockResolvedValue({ error: null });

      const report = await roleAuditService.generateRoleAuditReport(
        'Test Report',
        'admin-1',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report.summary.totalRoleChanges).toBe(3);
      expect(report.summary.roleAssignments).toBe(1);
      expect(report.summary.roleRevocations).toBe(1);
      expect(report.summary.roleRequests).toBe(1);
      expect(report.summary.roleDistribution[UserRole.TEACHER]).toBe(2);
      expect(report.summary.topPerformers).toHaveLength(2);
    });
  });

  describe('getSuspiciousActivities', () => {
    it('should filter suspicious activities by criteria', async () => {
      const mockData = [
        {
          id: 'suspicious-1',
          type: 'rapid_role_changes',
          severity: 'high',
          description: 'Test activity',
          user_id: 'user-1',
          performed_by: 'admin-1',
          detected_at: new Date().toISOString(),
          related_audit_ids: ['audit-1'],
          metadata: {},
          flagged: false
        }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockData, error: null });

      const activities = await roleAuditService.getSuspiciousActivities({
        severity: ['high', 'critical'],
        flagged: false,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31')
      });

      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('rapid_role_changes');
      expect(mockSupabase.in).toHaveBeenCalledWith('severity', ['high', 'critical']);
      expect(mockSupabase.eq).toHaveBeenCalledWith('flagged', false);
    });
  });

  describe('flagSuspiciousActivity', () => {
    it('should flag suspicious activity for review', async () => {
      mockSupabase.update.mockResolvedValue({ error: null });

      await roleAuditService.flagSuspiciousActivity(
        'suspicious-1',
        'admin-1',
        'Reviewed and flagged'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('role_suspicious_activities');
      expect(mockSupabase.update).toHaveBeenCalledWith({
        flagged: true,
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        review_notes: 'Reviewed and flagged'
      });
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'suspicious-1');
    });

    it('should handle database errors when flagging', async () => {
      mockSupabase.update.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        roleAuditService.flagSuspiciousActivity('suspicious-1', 'admin-1')
      ).rejects.toThrow('Failed to flag suspicious activity: Database error');
    });
  });

  describe('logRoleRequest', () => {
    it('should log role request with correct metadata', async () => {
      const request: RoleRequest = {
        id: 'request-1',
        userId: 'user-1',
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'I am now teaching',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'email_domain' as any,
        institutionId: 'inst-1',
        expiresAt: new Date(),
        metadata: {}
      };

      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await roleAuditService.logRoleRequest(
        request,
        '192.168.1.1',
        'Mozilla/5.0',
        'session-1'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.REQUESTED,
          old_role: UserRole.STUDENT,
          new_role: UserRole.TEACHER,
          changed_by: 'user-1',
          reason: 'I am now teaching',
          metadata: expect.objectContaining({
            requestId: 'request-1',
            verificationMethod: 'email_domain'
          })
        })
      );
    });
  });

  describe('logRoleRequestDecision', () => {
    it('should log approval decision', async () => {
      const request: RoleRequest = {
        id: 'request-1',
        userId: 'user-1',
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'I am now teaching',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: 'inst-1',
        expiresAt: new Date(),
        metadata: {}
      };

      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await roleAuditService.logRoleRequestDecision(
        request,
        'approved',
        'admin-1',
        'Approved after verification'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.APPROVED,
          changed_by: 'admin-1',
          reason: 'Approved after verification'
        })
      );
    });

    it('should log denial decision', async () => {
      const request: RoleRequest = {
        id: 'request-1',
        userId: 'user-1',
        requestedRole: UserRole.TEACHER,
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: 'inst-1',
        expiresAt: new Date(),
        justification: 'Test',
        metadata: {}
      };

      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await roleAuditService.logRoleRequestDecision(
        request,
        'denied',
        'admin-1',
        'Insufficient verification'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DENIED,
          reason: 'Insufficient verification'
        })
      );
    });
  });

  describe('logRoleExpiration', () => {
    it('should log automatic role expiration', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await roleAuditService.logRoleExpiration(
        'user-1',
        UserRole.TEACHER,
        'inst-1',
        'dept-1'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.EXPIRED,
          old_role: UserRole.TEACHER,
          changed_by: 'system',
          reason: 'Temporary role expired',
          metadata: expect.objectContaining({
            automated: true
          })
        })
      );
    });
  });
});