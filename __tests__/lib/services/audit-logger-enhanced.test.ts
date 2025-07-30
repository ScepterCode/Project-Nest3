import { AuditLogger } from '@/lib/services/audit-logger';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

// Mock crypto for Node.js environment
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-audit-uuid'
  }
});

describe('AuditLogger - Enhanced Features', () => {
  let auditLogger: AuditLogger;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    auditLogger = new AuditLogger();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logAdministrativeAction', () => {
    it('should log administrative action with all details', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await auditLogger.logAdministrativeAction(
        'institution',
        'inst-123',
        'institution_created',
        'admin-456',
        'system_admin',
        {
          before: {},
          after: { name: 'Test University', status: 'active' },
          fields: ['name', 'status']
        },
        { requestId: 'req-789', source: 'admin_panel' },
        'high',
        '192.168.1.1',
        'Mozilla/5.0...',
        'session-abc'
      );

      expect(auditId).toBe('test-audit-uuid');
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        id: 'test-audit-uuid',
        entity_type: 'institution',
        entity_id: 'inst-123',
        action: 'institution_created',
        performed_by: 'admin-456',
        performed_by_role: 'system_admin',
        timestamp: expect.any(String),
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0...',
        session_id: 'session-abc',
        changes: {
          before: {},
          after: { name: 'Test University', status: 'active' },
          fields: ['name', 'status']
        },
        metadata: { requestId: 'req-789', source: 'admin_panel' },
        severity: 'high',
        category: 'administrative'
      });
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      // Should not throw error to avoid breaking main operations
      const auditId = await auditLogger.logAdministrativeAction(
        'user',
        'user-123',
        'user_updated',
        'admin-456',
        'admin'
      );

      expect(auditId).toBe('test-audit-uuid');
    });
  });

  describe('logAcademicAction', () => {
    it('should log academic action with correct category', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await auditLogger.logAcademicAction(
        'enrollment',
        'enrollment-123',
        'student_enrolled',
        'teacher-456',
        'teacher',
        {
          before: { status: 'pending' },
          after: { status: 'enrolled' },
          fields: ['status']
        },
        { classId: 'class-789', semester: 'Fall 2024' },
        'medium'
      );

      expect(auditId).toBe('test-audit-uuid');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'academic',
          severity: 'medium'
        })
      );
    });
  });

  describe('logSecurityAction', () => {
    it('should log security action with high severity', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await auditLogger.logSecurityAction(
        'user',
        'user-123',
        'failed_login_attempt',
        'user-123',
        'student',
        undefined,
        { attemptCount: 3, lastAttempt: '2024-01-01T10:00:00Z' },
        'high',
        '192.168.1.100'
      );

      expect(auditId).toBe('test-audit-uuid');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'security',
          severity: 'high'
        })
      );
    });

    it('should create security alert for critical events', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      await auditLogger.logSecurityAction(
        'system',
        'system-123',
        'data_breach_detected',
        'system',
        'system',
        undefined,
        { affectedRecords: 1000, breachType: 'unauthorized_access' },
        'critical'
      );

      // Should call insert twice: once for audit log, once for security alert
      expect(mockSupabase.insert).toHaveBeenCalledTimes(2);
      expect(mockSupabase.insert).toHaveBeenNthCalledWith(2, {
        alert_type: 'audit_critical',
        severity: 'critical',
        description: 'Critical security event: data_breach_detected',
        entity_type: 'system',
        entity_id: 'system-123',
        performed_by: 'system',
        metadata: { affectedRecords: 1000, breachType: 'unauthorized_access' },
        created_at: expect.any(String)
      });
    });
  });

  describe('logComplianceAction', () => {
    it('should log compliance action with correct category', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await auditLogger.logComplianceAction(
        'institution',
        'inst-123',
        'gdpr_assessment_completed',
        'compliance-officer',
        'compliance_officer',
        undefined,
        { assessmentScore: 85, riskLevel: 'medium' },
        'medium'
      );

      expect(auditId).toBe('test-audit-uuid');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'compliance',
          severity: 'medium'
        })
      );
    });
  });

  describe('logSystemAction', () => {
    it('should log system action with system performer', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditId = await auditLogger.logSystemAction(
        'enrollment',
        'enrollment-123',
        'automated_cleanup',
        'system',
        {
          before: { status: 'expired' },
          after: { status: 'archived' },
          fields: ['status']
        },
        { cleanupReason: 'retention_policy', recordsProcessed: 50 },
        'low'
      );

      expect(auditId).toBe('test-audit-uuid');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          performed_by: 'system',
          performed_by_role: 'system',
          category: 'system',
          severity: 'low'
        })
      );
    });
  });

  describe('queryAuditLogs', () => {
    beforeEach(() => {
      mockSupabase.select.mockResolvedValue({
        data: [
          {
            id: 'audit-1',
            entity_type: 'user',
            entity_id: 'user-123',
            action: 'user_created',
            performed_by: 'admin-456',
            performed_by_role: 'admin',
            timestamp: '2024-01-01T10:00:00Z',
            ip_address: '192.168.1.1',
            user_agent: 'Mozilla/5.0...',
            session_id: 'session-123',
            changes: { before: {}, after: { name: 'John Doe' }, fields: ['name'] },
            metadata: { source: 'admin_panel' },
            severity: 'medium',
            category: 'administrative'
          }
        ],
        count: 1,
        error: null
      });
    });

    it('should query audit logs with filters', async () => {
      const result = await auditLogger.queryAuditLogs({
        entityType: 'user',
        entityId: 'user-123',
        action: 'user_created',
        performedBy: 'admin-456',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        severity: ['medium', 'high'],
        category: ['administrative'],
        limit: 50,
        offset: 0
      });

      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.entries[0].id).toBe('audit-1');
      expect(result.entries[0].entityType).toBe('user');
      expect(result.entries[0].action).toBe('user_created');

      // Verify all filters were applied
      expect(mockSupabase.eq).toHaveBeenCalledWith('entity_type', 'user');
      expect(mockSupabase.eq).toHaveBeenCalledWith('entity_id', 'user-123');
      expect(mockSupabase.eq).toHaveBeenCalledWith('action', 'user_created');
      expect(mockSupabase.eq).toHaveBeenCalledWith('performed_by', 'admin-456');
      expect(mockSupabase.gte).toHaveBeenCalledWith('timestamp', '2024-01-01T00:00:00.000Z');
      expect(mockSupabase.lte).toHaveBeenCalledWith('timestamp', '2024-01-31T00:00:00.000Z');
      expect(mockSupabase.in).toHaveBeenCalledWith('severity', ['medium', 'high']);
      expect(mockSupabase.in).toHaveBeenCalledWith('category', ['administrative']);
      expect(mockSupabase.range).toHaveBeenCalledWith(0, 49);
    });

    it('should handle pagination correctly', async () => {
      mockSupabase.select.mockResolvedValue({
        data: new Array(50).fill(null).map((_, i) => ({
          id: `audit-${i}`,
          entity_type: 'user',
          entity_id: 'user-123',
          action: 'user_action',
          performed_by: 'admin',
          performed_by_role: 'admin',
          timestamp: '2024-01-01T10:00:00Z',
          severity: 'low',
          category: 'administrative'
        })),
        count: 150,
        error: null
      });

      const result = await auditLogger.queryAuditLogs({
        limit: 50,
        offset: 50
      });

      expect(result.entries).toHaveLength(50);
      expect(result.totalCount).toBe(150);
      expect(result.hasMore).toBe(true);
      expect(mockSupabase.range).toHaveBeenCalledWith(50, 99);
    });

    it('should handle database errors', async () => {
      mockSupabase.select.mockResolvedValue({
        error: { message: 'Database error' }
      });

      await expect(
        auditLogger.queryAuditLogs({})
      ).rejects.toThrow('Failed to query audit logs: Database error');
    });
  });

  describe('generateAuditReport', () => {
    beforeEach(() => {
      const mockEntries = [
        {
          id: 'audit-1',
          entity_type: 'user',
          entity_id: 'user-1',
          action: 'user_created',
          performed_by: 'admin-1',
          performed_by_role: 'admin',
          timestamp: '2024-01-01T10:00:00Z',
          severity: 'medium',
          category: 'administrative'
        },
        {
          id: 'audit-2',
          entity_type: 'enrollment',
          entity_id: 'enrollment-1',
          action: 'student_enrolled',
          performed_by: 'teacher-1',
          performed_by_role: 'teacher',
          timestamp: '2024-01-02T10:00:00Z',
          severity: 'low',
          category: 'academic'
        },
        {
          id: 'audit-3',
          entity_type: 'user',
          entity_id: 'user-2',
          action: 'failed_login',
          performed_by: 'user-2',
          performed_by_role: 'student',
          timestamp: '2024-01-03T10:00:00Z',
          severity: 'high',
          category: 'security'
        }
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockEntries,
        count: 3,
        error: null
      });

      // Mock user enrichment
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          { id: 'admin-1', full_name: 'Admin User', email: 'admin@example.com' },
          { id: 'teacher-1', full_name: 'Teacher User', email: 'teacher@example.com' },
          { id: 'user-2', full_name: 'Student User', email: 'student@example.com' }
        ],
        error: null
      });
    });

    it('should generate comprehensive audit report', async () => {
      const report = await auditLogger.generateAuditReport(
        'Security Audit Report',
        'Monthly security audit for January 2024',
        'audit-manager',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        { category: ['security', 'administrative'] },
        'json'
      );

      expect(report).toBeDefined();
      expect(report.id).toBe('test-audit-uuid');
      expect(report.title).toBe('Security Audit Report');
      expect(report.description).toBe('Monthly security audit for January 2024');
      expect(report.generatedBy).toBe('audit-manager');
      expect(report.format).toBe('json');
      expect(report.entries).toHaveLength(3);

      // Check summary statistics
      expect(report.summary.totalEntries).toBe(3);
      expect(report.summary.entriesByCategory).toEqual({
        administrative: 1,
        academic: 1,
        security: 1
      });
      expect(report.summary.entriesBySeverity).toEqual({
        medium: 1,
        low: 1,
        high: 1
      });
      expect(report.summary.topActions).toHaveLength(3);
      expect(report.summary.topUsers).toHaveLength(3);
    });

    it('should handle empty results', async () => {
      mockSupabase.select.mockResolvedValue({
        data: [],
        count: 0,
        error: null
      });

      const report = await auditLogger.generateAuditReport(
        'Empty Report',
        'Report with no data',
        'audit-manager',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(report.summary.totalEntries).toBe(0);
      expect(report.entries).toHaveLength(0);
      expect(report.summary.entriesByCategory).toEqual({});
      expect(report.summary.entriesBySeverity).toEqual({});
    });
  });

  describe('verifyAuditTrailIntegrity', () => {
    it('should verify audit trail integrity with no issues', async () => {
      const mockEntries = [
        {
          id: 'audit-1',
          timestamp: '2024-01-01T10:00:00Z',
          action: 'created',
          metadata: { key: 'value' },
          ip_address: '192.168.1.1'
        },
        {
          id: 'audit-2',
          timestamp: '2024-01-01T11:00:00Z',
          action: 'updated',
          metadata: { key: 'value' },
          ip_address: '192.168.1.1'
        }
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockEntries,
        count: 2,
        error: null
      });

      const result = await auditLogger.verifyAuditTrailIntegrity('user', 'user-123');

      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.totalEntries).toBe(2);
      expect(result.issues).toHaveLength(0);
      expect(result.recommendations).toContain('Consider logging created actions for complete audit trail');
    });

    it('should detect large time gaps', async () => {
      const mockEntries = [
        {
          id: 'audit-1',
          timestamp: '2024-01-01T10:00:00Z',
          action: 'created',
          metadata: { key: 'value' },
          ip_address: '192.168.1.1'
        },
        {
          id: 'audit-2',
          timestamp: '2024-01-03T10:00:00Z', // 2 days later
          action: 'updated',
          metadata: { key: 'value' },
          ip_address: '192.168.1.1'
        }
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockEntries,
        count: 2,
        error: null
      });

      const result = await auditLogger.verifyAuditTrailIntegrity('user', 'user-123');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain(
        expect.stringContaining('Large time gap detected between entries')
      );
    });

    it('should detect entries without metadata', async () => {
      const mockEntries = [
        {
          id: 'audit-1',
          timestamp: '2024-01-01T10:00:00Z',
          action: 'created',
          metadata: null,
          ip_address: '192.168.1.1'
        }
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockEntries,
        count: 1,
        error: null
      });

      const result = await auditLogger.verifyAuditTrailIntegrity('user', 'user-123');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('1 entries found without metadata');
    });

    it('should detect user actions without IP addresses', async () => {
      const mockEntries = [
        {
          id: 'audit-1',
          timestamp: '2024-01-01T10:00:00Z',
          action: 'created',
          performed_by: 'user-123',
          metadata: { key: 'value' },
          ip_address: null
        }
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockEntries,
        count: 1,
        error: null
      });

      const result = await auditLogger.verifyAuditTrailIntegrity('user', 'user-123');

      expect(result.recommendations).toContain(
        '1 user actions found without IP address tracking'
      );
    });
  });

  describe('getAuditStatistics', () => {
    it('should get comprehensive audit statistics', async () => {
      // Mock total entries count
      mockSupabase.select
        .mockResolvedValueOnce({ totalCount: 1000, error: null })
        .mockResolvedValueOnce({ totalCount: 150, error: null })
        .mockResolvedValueOnce({ totalCount: 5, error: null });

      // Mock entries for category breakdown
      const mockEntries = [
        { category: 'administrative' },
        { category: 'administrative' },
        { category: 'academic' },
        { category: 'security' },
        { category: 'compliance' }
      ];
      mockSupabase.select.mockResolvedValueOnce({
        data: mockEntries,
        error: null
      });

      // Mock recent activity
      const mockRecentActivity = [
        {
          id: 'audit-1',
          entity_type: 'user',
          action: 'user_created',
          timestamp: '2024-01-01T10:00:00Z',
          severity: 'medium',
          category: 'administrative'
        }
      ];
      mockSupabase.select.mockResolvedValueOnce({
        data: mockRecentActivity,
        error: null
      });

      const stats = await auditLogger.getAuditStatistics(
        'institution-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(stats).toBeDefined();
      expect(stats.totalEntries).toBe(1000);
      expect(stats.entriesThisPeriod).toBe(150);
      expect(stats.criticalEvents).toBe(5);
      expect(stats.topCategories).toEqual([
        { category: 'administrative', count: 2 },
        { category: 'academic', count: 1 },
        { category: 'security', count: 1 },
        { category: 'compliance', count: 1 }
      ]);
      expect(stats.recentActivity).toHaveLength(1);
    });
  });

  describe('specific audit entry storage', () => {
    it('should store enrollment audit entry', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const auditEntry = {
        id: 'test-audit-uuid',
        entityType: 'enrollment' as const,
        entityId: 'enrollment-123',
        action: 'student_enrolled',
        performedBy: 'teacher-456',
        performedByRole: 'teacher',
        timestamp: new Date(),
        metadata: { studentId: 'student-789', classId: 'class-101', reason: 'Regular enrollment' },
        severity: 'low' as const,
        category: 'academic' as const
      };

      await (auditLogger as any).storeSpecificAuditEntry(auditEntry);

      expect(mockSupabase.insert).toHaveBeenCalledWith({
        student_id: 'student-789',
        class_id: 'class-101',
        action: 'student_enrolled',
        performed_by: 'teacher-456',
        reason: 'Regular enrollment',
        timestamp: expect.any(String),
        metadata: auditEntry.metadata,
        ip_address: undefined,
        user_agent: undefined,
        session_id: undefined
      });
    });

    it('should handle errors in specific audit entry storage gracefully', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      const auditEntry = {
        id: 'test-audit-uuid',
        entityType: 'enrollment' as const,
        entityId: 'enrollment-123',
        action: 'student_enrolled',
        performedBy: 'teacher-456',
        performedByRole: 'teacher',
        timestamp: new Date(),
        metadata: { studentId: 'student-789', classId: 'class-101' },
        severity: 'low' as const,
        category: 'academic' as const
      };

      // Should not throw error
      await expect(
        (auditLogger as any).storeSpecificAuditEntry(auditEntry)
      ).resolves.toBeUndefined();
    });
  });

  describe('user enrichment', () => {
    it('should enrich user counts with user information', async () => {
      const userCounts = {
        'user-1': 5,
        'user-2': 3,
        'user-3': 1
      };

      mockSupabase.select.mockResolvedValue({
        data: [
          { id: 'user-1', full_name: 'John Doe', email: 'john@example.com' },
          { id: 'user-2', full_name: 'Jane Smith', email: 'jane@example.com' }
          // user-3 not found in database
        ],
        error: null
      });

      const enriched = await (auditLogger as any).enrichUserCounts(userCounts);

      expect(enriched).toHaveLength(3);
      expect(enriched[0]).toEqual({
        userId: 'user-1',
        userName: 'John Doe (john@example.com)',
        count: 5
      });
      expect(enriched[1]).toEqual({
        userId: 'user-2',
        userName: 'Jane Smith (jane@example.com)',
        count: 3
      });
      expect(enriched[2]).toEqual({
        userId: 'user-3',
        userName: 'user-3', // Falls back to user ID
        count: 1
      });
    });

    it('should handle empty user counts', async () => {
      const enriched = await (auditLogger as any).enrichUserCounts({});
      expect(enriched).toHaveLength(0);
    });
  });
});