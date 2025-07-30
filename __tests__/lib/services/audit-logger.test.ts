import { AuditLogger } from '@/lib/services/audit-logger';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@supabase/supabase-js');
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  insert: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  in: jest.fn(() => mockSupabase),
  gte: jest.fn(() => mockSupabase),
  lte: jest.fn(() => mockSupabase),
  order: jest.fn(() => mockSupabase),
  range: jest.fn(() => mockSupabase),
  data: null,
  error: null,
  count: 0
};

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    auditLogger = new AuditLogger();
  });

  describe('logAdministrativeAction', () => {
    it('should log administrative action with all details', async () => {
      const entityType = 'institution';
      const entityId = 'institution-123';
      const action = 'settings_updated';
      const performedBy = 'admin-456';
      const performedByRole = 'institution_admin';
      const changes = {
        before: { name: 'Old Name' },
        after: { name: 'New Name' },
        fields: ['name']
      };
      const metadata = { reason: 'Rebranding' };
      const severity = 'medium';
      const ipAddress = '192.168.1.1';
      const userAgent = 'Mozilla/5.0...';
      const sessionId = 'session-789';

      mockSupabase.error = null;

      const auditId = await auditLogger.logAdministrativeAction(
        entityType,
        entityId,
        action,
        performedBy,
        performedByRole,
        changes,
        metadata,
        severity,
        ipAddress,
        userAgent,
        sessionId
      );

      expect(auditId).toBeDefined();
      expect(typeof auditId).toBe('string');

      expect(mockSupabase.from).toHaveBeenCalledWith('comprehensive_audit_log');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: entityType,
          entity_id: entityId,
          action,
          performed_by: performedBy,
          performed_by_role: performedByRole,
          changes,
          metadata,
          severity,
          category: 'administrative',
          ip_address: ipAddress,
          user_agent: userAgent,
          session_id: sessionId
        })
      );
    });

    it('should handle minimal required parameters', async () => {
      mockSupabase.error = null;

      const auditId = await auditLogger.logAdministrativeAction(
        'user',
        'user-123',
        'created',
        'admin-456',
        'system_admin'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'user',
          entity_id: 'user-123',
          action: 'created',
          performed_by: 'admin-456',
          performed_by_role: 'system_admin',
          severity: 'medium',
          category: 'administrative'
        })
      );
    });

    it('should not throw error when database insert fails', async () => {
      mockSupabase.error = new Error('Database insert failed');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const auditId = await auditLogger.logAdministrativeAction(
        'institution',
        'institution-123',
        'created',
        'admin-456',
        'system_admin'
      );

      expect(auditId).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to store audit entry:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('logAcademicAction', () => {
    it('should log academic action with academic category', async () => {
      mockSupabase.error = null;

      const auditId = await auditLogger.logAcademicAction(
        'enrollment',
        'enrollment-123',
        'enrolled',
        'student-456',
        'student',
        undefined,
        { classId: 'class-789' },
        'low'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'enrollment',
          action: 'enrolled',
          category: 'academic',
          severity: 'low'
        })
      );
    });
  });

  describe('logSecurityAction', () => {
    it('should log security action with high severity by default', async () => {
      mockSupabase.error = null;

      const auditId = await auditLogger.logSecurityAction(
        'user',
        'user-123',
        'login_failed',
        'user-123',
        'student',
        undefined,
        { attempts: 3 }
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'login_failed',
          category: 'security',
          severity: 'high'
        })
      );
    });

    it('should create security alert for critical events', async () => {
      mockSupabase.error = null;

      const auditId = await auditLogger.logSecurityAction(
        'system',
        'system-1',
        'data_breach_detected',
        'system',
        'system',
        undefined,
        { affectedRecords: 1000 },
        'critical'
      );

      expect(auditId).toBeDefined();
      
      // Should call insert twice: once for audit log, once for security alert
      expect(mockSupabase.insert).toHaveBeenCalledTimes(2);
      
      // Check security alert creation
      expect(mockSupabase.from).toHaveBeenCalledWith('security_alerts');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_type: 'audit_critical',
          severity: 'critical',
          description: 'Critical security event: data_breach_detected'
        })
      );
    });
  });

  describe('logComplianceAction', () => {
    it('should log compliance action with compliance category', async () => {
      mockSupabase.error = null;

      const auditId = await auditLogger.logComplianceAction(
        'user',
        'user-123',
        'gdpr_data_exported',
        'admin-456',
        'compliance_officer',
        undefined,
        { exportId: 'export-789' }
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'gdpr_data_exported',
          category: 'compliance',
          severity: 'medium'
        })
      );
    });
  });

  describe('logSystemAction', () => {
    it('should log system action with system performer', async () => {
      mockSupabase.error = null;

      const auditId = await auditLogger.logSystemAction(
        'enrollment',
        'enrollment-123',
        'auto_enrolled',
        'system',
        undefined,
        { trigger: 'waitlist_processing' }
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auto_enrolled',
          performed_by: 'system',
          performed_by_role: 'system',
          category: 'system',
          severity: 'low'
        })
      );
    });

    it('should use default system performer when not specified', async () => {
      mockSupabase.error = null;

      const auditId = await auditLogger.logSystemAction(
        'class',
        'class-123',
        'capacity_updated'
      );

      expect(auditId).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          performed_by: 'system',
          performed_by_role: 'system'
        })
      );
    });
  });

  describe('queryAuditLogs', () => {
    it('should query audit logs with all filters', async () => {
      const query = {
        entityType: 'institution',
        entityId: 'institution-123',
        action: 'updated',
        performedBy: 'admin-456',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        severity: ['high', 'critical'],
        category: ['administrative', 'security'],
        limit: 50,
        offset: 10
      };

      mockSupabase.data = [
        {
          id: 'audit-1',
          entity_type: 'institution',
          entity_id: 'institution-123',
          action: 'updated',
          performed_by: 'admin-456',
          performed_by_role: 'institution_admin',
          timestamp: '2024-06-01T12:00:00Z',
          severity: 'high',
          category: 'administrative',
          metadata: {}
        }
      ];
      mockSupabase.count = 100;
      mockSupabase.error = null;

      const result = await auditLogger.queryAuditLogs(query);

      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(1);
      expect(result.totalCount).toBe(100);
      expect(result.hasMore).toBe(true);

      // Verify all filters were applied
      expect(mockSupabase.eq).toHaveBeenCalledWith('entity_type', 'institution');
      expect(mockSupabase.eq).toHaveBeenCalledWith('entity_id', 'institution-123');
      expect(mockSupabase.eq).toHaveBeenCalledWith('action', 'updated');
      expect(mockSupabase.eq).toHaveBeenCalledWith('performed_by', 'admin-456');
      expect(mockSupabase.gte).toHaveBeenCalledWith('timestamp', '2024-01-01T00:00:00.000Z');
      expect(mockSupabase.lte).toHaveBeenCalledWith('timestamp', '2024-12-31T00:00:00.000Z');
      expect(mockSupabase.in).toHaveBeenCalledWith('severity', ['high', 'critical']);
      expect(mockSupabase.in).toHaveBeenCalledWith('category', ['administrative', 'security']);
      expect(mockSupabase.range).toHaveBeenCalledWith(10, 59);
    });

    it('should use default pagination when not specified', async () => {
      mockSupabase.data = [];
      mockSupabase.count = 0;
      mockSupabase.error = null;

      const result = await auditLogger.queryAuditLogs({});

      expect(result.entries).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(mockSupabase.range).toHaveBeenCalledWith(0, 99); // Default limit 100, offset 0
    });

    it('should handle database errors', async () => {
      mockSupabase.error = new Error('Query failed');

      await expect(auditLogger.queryAuditLogs({})).rejects.toThrow('Failed to query audit logs');
    });

    it('should correctly map database rows to audit entries', async () => {
      mockSupabase.data = [
        {
          id: 'audit-1',
          entity_type: 'user',
          entity_id: 'user-123',
          action: 'created',
          performed_by: 'admin-456',
          performed_by_role: 'system_admin',
          timestamp: '2024-06-01T12:00:00Z',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0...',
          session_id: 'session-789',
          changes: { before: {}, after: { name: 'John' }, fields: ['name'] },
          metadata: { reason: 'User registration' },
          severity: 'medium',
          category: 'administrative'
        }
      ];
      mockSupabase.count = 1;
      mockSupabase.error = null;

      const result = await auditLogger.queryAuditLogs({});

      expect(result.entries).toHaveLength(1);
      const entry = result.entries[0];
      expect(entry.id).toBe('audit-1');
      expect(entry.entityType).toBe('user');
      expect(entry.entityId).toBe('user-123');
      expect(entry.action).toBe('created');
      expect(entry.performedBy).toBe('admin-456');
      expect(entry.performedByRole).toBe('system_admin');
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.ipAddress).toBe('192.168.1.1');
      expect(entry.userAgent).toBe('Mozilla/5.0...');
      expect(entry.sessionId).toBe('session-789');
      expect(entry.changes).toEqual({ before: {}, after: { name: 'John' }, fields: ['name'] });
      expect(entry.metadata).toEqual({ reason: 'User registration' });
      expect(entry.severity).toBe('medium');
      expect(entry.category).toBe('administrative');
    });
  });

  describe('generateAuditReport', () => {
    it('should generate comprehensive audit report', async () => {
      const title = 'Monthly Audit Report';
      const description = 'Comprehensive audit report for June 2024';
      const generatedBy = 'admin-123';
      const periodStart = new Date('2024-06-01');
      const periodEnd = new Date('2024-06-30');

      // Mock audit entries
      mockSupabase.data = [
        {
          id: 'audit-1',
          entity_type: 'user',
          entity_id: 'user-1',
          action: 'created',
          performed_by: 'admin-1',
          performed_by_role: 'system_admin',
          timestamp: '2024-06-15T12:00:00Z',
          severity: 'medium',
          category: 'administrative',
          metadata: {}
        },
        {
          id: 'audit-2',
          entity_type: 'institution',
          entity_id: 'inst-1',
          action: 'updated',
          performed_by: 'admin-1',
          performed_by_role: 'system_admin',
          timestamp: '2024-06-16T12:00:00Z',
          severity: 'high',
          category: 'administrative',
          metadata: {}
        },
        {
          id: 'audit-3',
          entity_type: 'enrollment',
          entity_id: 'enroll-1',
          action: 'enrolled',
          performed_by: 'student-1',
          performed_by_role: 'student',
          timestamp: '2024-06-17T12:00:00Z',
          severity: 'low',
          category: 'academic',
          metadata: {}
        }
      ];
      mockSupabase.count = 3;
      mockSupabase.error = null;

      // Mock user enrichment
      mockSupabase.data = [
        { id: 'admin-1', full_name: 'Admin User', email: 'admin@example.com' },
        { id: 'student-1', full_name: 'Student User', email: 'student@example.com' }
      ];

      const report = await auditLogger.generateAuditReport(
        title,
        description,
        generatedBy,
        periodStart,
        periodEnd
      );

      expect(report).toBeDefined();
      expect(report.id).toBeDefined();
      expect(report.title).toBe(title);
      expect(report.description).toBe(description);
      expect(report.generatedBy).toBe(generatedBy);
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.periodStart).toEqual(periodStart);
      expect(report.periodEnd).toEqual(periodEnd);
      expect(report.format).toBe('json');

      // Check summary statistics
      expect(report.summary.totalEntries).toBe(3);
      expect(report.summary.entriesByCategory).toEqual({
        administrative: 2,
        academic: 1
      });
      expect(report.summary.entriesBySeverity).toEqual({
        medium: 1,
        high: 1,
        low: 1
      });
      expect(report.summary.topActions).toEqual([
        { action: 'created', count: 1 },
        { action: 'updated', count: 1 },
        { action: 'enrolled', count: 1 }
      ]);
      expect(report.summary.topUsers).toHaveLength(2);

      expect(report.entries).toHaveLength(3);
    });

    it('should handle empty audit logs', async () => {
      mockSupabase.data = [];
      mockSupabase.count = 0;
      mockSupabase.error = null;

      const report = await auditLogger.generateAuditReport(
        'Empty Report',
        'No audit entries',
        'admin-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(report.summary.totalEntries).toBe(0);
      expect(report.summary.entriesByCategory).toEqual({});
      expect(report.summary.entriesBySeverity).toEqual({});
      expect(report.summary.topActions).toEqual([]);
      expect(report.summary.topUsers).toEqual([]);
      expect(report.entries).toEqual([]);
    });
  });

  describe('verifyAuditTrailIntegrity', () => {
    it('should verify audit trail integrity and find no issues', async () => {
      const entityType = 'user';
      const entityId = 'user-123';

      // Mock audit entries with proper sequence
      mockSupabase.data = [
        {
          id: 'audit-1',
          entity_type: entityType,
          entity_id: entityId,
          action: 'created',
          timestamp: '2024-06-01T12:00:00Z',
          metadata: { reason: 'User registration' },
          ip_address: '192.168.1.1'
        },
        {
          id: 'audit-2',
          entity_type: entityType,
          entity_id: entityId,
          action: 'updated',
          timestamp: '2024-06-01T13:00:00Z',
          metadata: { reason: 'Profile update' },
          ip_address: '192.168.1.1'
        }
      ];
      mockSupabase.count = 2;
      mockSupabase.error = null;

      const result = await auditLogger.verifyAuditTrailIntegrity(entityType, entityId);

      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.totalEntries).toBe(2);
      expect(result.issues).toEqual([]);
      expect(result.recommendations).toHaveLength(0);
    });

    it('should detect large time gaps between entries', async () => {
      const entityType = 'user';
      const entityId = 'user-123';

      // Mock audit entries with large time gap
      mockSupabase.data = [
        {
          id: 'audit-1',
          entity_type: entityType,
          entity_id: entityId,
          action: 'created',
          timestamp: '2024-06-01T12:00:00Z',
          metadata: {},
          ip_address: '192.168.1.1'
        },
        {
          id: 'audit-2',
          entity_type: entityType,
          entity_id: entityId,
          action: 'updated',
          timestamp: '2024-06-03T12:00:00Z', // 2 days later
          metadata: {},
          ip_address: '192.168.1.1'
        }
      ];
      mockSupabase.count = 2;
      mockSupabase.error = null;

      const result = await auditLogger.verifyAuditTrailIntegrity(entityType, entityId);

      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain('Large time gap detected');
    });

    it('should detect entries without metadata', async () => {
      const entityType = 'user';
      const entityId = 'user-123';

      // Mock audit entries with missing metadata
      mockSupabase.data = [
        {
          id: 'audit-1',
          entity_type: entityType,
          entity_id: entityId,
          action: 'created',
          timestamp: '2024-06-01T12:00:00Z',
          metadata: null, // Missing metadata
          ip_address: '192.168.1.1'
        }
      ];
      mockSupabase.count = 1;
      mockSupabase.error = null;

      const result = await auditLogger.verifyAuditTrailIntegrity(entityType, entityId);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('1 entries found without metadata');
    });

    it('should recommend IP address tracking for user actions', async () => {
      const entityType = 'user';
      const entityId = 'user-123';

      // Mock user action without IP address
      mockSupabase.data = [
        {
          id: 'audit-1',
          entity_type: entityType,
          entity_id: entityId,
          action: 'updated',
          performed_by: 'user-456', // Not system
          timestamp: '2024-06-01T12:00:00Z',
          metadata: {},
          ip_address: null // Missing IP
        }
      ];
      mockSupabase.count = 1;
      mockSupabase.error = null;

      const result = await auditLogger.verifyAuditTrailIntegrity(entityType, entityId);

      expect(result.recommendations).toContain('1 user actions found without IP address tracking');
    });
  });

  describe('getAuditStatistics', () => {
    it('should return comprehensive audit statistics', async () => {
      // Mock total entries count
      mockSupabase.count = 1000;
      mockSupabase.data = [];
      mockSupabase.error = null;

      const stats = await auditLogger.getAuditStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalEntries).toBe(1000);
      expect(stats.entriesThisPeriod).toBeGreaterThanOrEqual(0);
      expect(stats.criticalEvents).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(stats.topCategories)).toBe(true);
      expect(Array.isArray(stats.recentActivity)).toBe(true);
    });

    it('should handle custom date range', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      mockSupabase.count = 50;
      mockSupabase.data = [];
      mockSupabase.error = null;

      const stats = await auditLogger.getAuditStatistics(
        'institution-123',
        periodStart,
        periodEnd
      );

      expect(stats.totalEntries).toBe(50);
    });
  });

  describe('specific audit entry storage', () => {
    it('should store enrollment audit entry', async () => {
      const auditEntry = {
        id: 'audit-1',
        entityType: 'enrollment' as const,
        entityId: 'enrollment-123',
        action: 'enrolled',
        performedBy: 'student-456',
        performedByRole: 'student',
        timestamp: new Date(),
        changes: undefined,
        metadata: { studentId: 'student-456', classId: 'class-789' },
        severity: 'low' as const,
        category: 'academic' as const,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
        sessionId: 'session-123'
      };

      mockSupabase.error = null;

      await (auditLogger as any).storeSpecificAuditEntry(auditEntry);

      expect(mockSupabase.from).toHaveBeenCalledWith('enrollment_audit_log');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: 'student-456',
          class_id: 'class-789',
          action: 'enrolled',
          performed_by: 'student-456',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0...',
          session_id: 'session-123'
        })
      );
    });

    it('should handle enrollment audit entry storage errors gracefully', async () => {
      const auditEntry = {
        id: 'audit-1',
        entityType: 'enrollment' as const,
        entityId: 'enrollment-123',
        action: 'enrolled',
        performedBy: 'student-456',
        performedByRole: 'student',
        timestamp: new Date(),
        changes: undefined,
        metadata: { studentId: 'student-456', classId: 'class-789' },
        severity: 'low' as const,
        category: 'academic' as const
      };

      mockSupabase.error = new Error('Insert failed');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await (auditLogger as any).storeSpecificAuditEntry(auditEntry);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to store enrollment audit entry:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });
});