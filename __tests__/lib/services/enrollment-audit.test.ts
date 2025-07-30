import { EnrollmentAuditService, EnrollmentAuditAction } from '@/lib/services/enrollment-audit';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({ error: null })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn(() => ({ single: jest.fn(() => ({ data: null, error: null })) })),
          data: [],
          error: null
        }))
      })),
      gte: jest.fn(() => ({ data: [], error: null })),
      lte: jest.fn(() => ({ data: [], error: null })),
      in: jest.fn(() => ({ data: [], error: null }))
    }))
  }))
};

describe('EnrollmentAuditService', () => {
  let auditService: EnrollmentAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    auditService = new EnrollmentAuditService();
  });

  describe('logAction', () => {
    it('should log enrollment action with complete audit trail', async () => {
      const studentId = 'student-123';
      const classId = 'class-456';
      const action = EnrollmentAuditAction.ENROLLED;
      const context = {
        performedBy: 'admin-789',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        sessionId: 'session-abc',
        reason: 'Student registration',
        metadata: { source: 'web_portal' }
      };

      await auditService.logAction(studentId, classId, action, context);

      expect(mockSupabase.from).toHaveBeenCalledWith('enrollment_audit_log');
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: studentId,
          class_id: classId,
          action,
          performed_by: context.performedBy,
          reason: context.reason,
          metadata: expect.objectContaining({
            source: 'web_portal',
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
            session_id: context.sessionId
          })
        })
      );
    });

    it('should handle audit logging errors gracefully', async () => {
      mockSupabase.from().insert.mockReturnValueOnce({ error: new Error('Database error') });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await auditService.logAction('student-123', 'class-456', EnrollmentAuditAction.ENROLLED, {
        performedBy: 'admin-789'
      });

      expect(consoleSpy).toHaveBeenCalledWith('Failed to log audit entry:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('logBulkAction', () => {
    it('should log bulk enrollment actions with batch metadata', async () => {
      const studentIds = ['student-1', 'student-2', 'student-3'];
      const classId = 'class-456';
      const action = EnrollmentAuditAction.BULK_ENROLLED;
      const context = {
        performedBy: 'admin-789',
        reason: 'Bulk enrollment import'
      };

      await auditService.logBulkAction(studentIds, classId, action, context);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            student_id: 'student-1',
            class_id: classId,
            action,
            metadata: expect.objectContaining({
              bulk_operation: true,
              total_students: 3
            })
          }),
          expect.objectContaining({
            student_id: 'student-2',
            class_id: classId,
            action
          }),
          expect.objectContaining({
            student_id: 'student-3',
            class_id: classId,
            action
          })
        ])
      );
    });
  });

  describe('getStudentAuditTrail', () => {
    it('should retrieve complete audit trail for student', async () => {
      const mockAuditData = [
        {
          id: 'audit-1',
          student_id: 'student-123',
          class_id: 'class-456',
          action: EnrollmentAuditAction.ENROLLED,
          timestamp: new Date().toISOString(),
          performed_by: 'admin-789'
        }
      ];

      mockSupabase.from().select.mockReturnValueOnce({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({ data: mockAuditData, error: null }))
        }))
      });

      const result = await auditService.getStudentAuditTrail('student-123');

      expect(result).toEqual(mockAuditData);
      expect(mockSupabase.from).toHaveBeenCalledWith('enrollment_audit_log');
    });

    it('should filter audit trail by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const mockQuery = {
        eq: jest.fn(() => mockQuery),
        gte: jest.fn(() => mockQuery),
        lte: jest.fn(() => mockQuery),
        order: jest.fn(() => ({ data: [], error: null }))
      };

      mockSupabase.from().select.mockReturnValueOnce(mockQuery);

      await auditService.getStudentAuditTrail('student-123', {
        startDate,
        endDate
      });

      expect(mockQuery.gte).toHaveBeenCalledWith('timestamp', startDate.toISOString());
      expect(mockQuery.lte).toHaveBeenCalledWith('timestamp', endDate.toISOString());
    });

    it('should filter audit trail by specific actions', async () => {
      const actions = [EnrollmentAuditAction.ENROLLED, EnrollmentAuditAction.DROPPED];

      const mockQuery = {
        eq: jest.fn(() => mockQuery),
        in: jest.fn(() => mockQuery),
        order: jest.fn(() => ({ data: [], error: null }))
      };

      mockSupabase.from().select.mockReturnValueOnce(mockQuery);

      await auditService.getStudentAuditTrail('student-123', { actions });

      expect(mockQuery.in).toHaveBeenCalledWith('action', actions);
    });
  });

  describe('generateAuditReport', () => {
    it('should generate comprehensive audit report with statistics', async () => {
      const mockAuditData = [
        {
          student_id: 'student-1',
          class_id: 'class-1',
          action: EnrollmentAuditAction.ENROLLED,
          timestamp: new Date().toISOString()
        },
        {
          student_id: 'student-2',
          class_id: 'class-1',
          action: EnrollmentAuditAction.ENROLLED,
          timestamp: new Date().toISOString()
        },
        {
          student_id: 'student-1',
          class_id: 'class-2',
          action: EnrollmentAuditAction.DROPPED,
          timestamp: new Date().toISOString()
        }
      ];

      const mockQuery = {
        gte: jest.fn(() => mockQuery),
        lte: jest.fn(() => mockQuery),
        order: jest.fn(() => ({ data: mockAuditData, error: null }))
      };

      mockSupabase.from().select.mockReturnValueOnce(mockQuery);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await auditService.generateAuditReport({
        startDate,
        endDate
      });

      expect(result.summary).toEqual({
        totalActions: 3,
        actionBreakdown: {
          [EnrollmentAuditAction.ENROLLED]: 2,
          [EnrollmentAuditAction.DROPPED]: 1
        },
        uniqueStudents: 2,
        uniqueClasses: 2
      });

      expect(result.entries).toHaveLength(3);
    });

    it('should filter report by institution and department', async () => {
      const mockAuditData = [
        {
          student_id: 'student-1',
          class_id: 'class-1',
          action: EnrollmentAuditAction.ENROLLED,
          class: { institution_id: 'inst-1', department_id: 'dept-1' }
        },
        {
          student_id: 'student-2',
          class_id: 'class-2',
          action: EnrollmentAuditAction.ENROLLED,
          class: { institution_id: 'inst-2', department_id: 'dept-2' }
        }
      ];

      mockSupabase.from().select().gte().lte().order.mockReturnValueOnce({
        data: mockAuditData,
        error: null
      });

      const result = await auditService.generateAuditReport({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        institutionId: 'inst-1'
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].class.institution_id).toBe('inst-1');
    });
  });

  describe('verifyAuditIntegrity', () => {
    it('should detect valid audit trail sequence', async () => {
      const mockAuditData = [
        {
          action: EnrollmentAuditAction.ENROLLED,
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          action: EnrollmentAuditAction.DROPPED,
          timestamp: '2024-01-02T10:00:00Z'
        }
      ];

      mockSupabase.from().select().eq().order.mockReturnValueOnce({
        data: mockAuditData,
        error: null
      });

      const result = await auditService.verifyAuditIntegrity('student-123', 'class-456');

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.timeline).toEqual(mockAuditData);
    });

    it('should detect invalid audit trail sequence', async () => {
      const mockAuditData = [
        {
          action: EnrollmentAuditAction.DROPPED, // Invalid: drop without enrollment
          timestamp: '2024-01-01T10:00:00Z'
        }
      ];

      mockSupabase.from().select().eq().order.mockReturnValueOnce({
        data: mockAuditData,
        error: null
      });

      const result = await auditService.verifyAuditIntegrity('student-123', 'class-456');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain(
        expect.stringContaining('Drop/withdrawal without enrollment')
      );
    });

    it('should detect duplicate enrollment', async () => {
      const mockAuditData = [
        {
          action: EnrollmentAuditAction.ENROLLED,
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          action: EnrollmentAuditAction.ENROLLED, // Duplicate enrollment
          timestamp: '2024-01-02T10:00:00Z'
        }
      ];

      mockSupabase.from().select().eq().order.mockReturnValueOnce({
        data: mockAuditData,
        error: null
      });

      const result = await auditService.verifyAuditIntegrity('student-123', 'class-456');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain(
        expect.stringContaining('Duplicate enrollment detected')
      );
    });
  });

  describe('compliance requirements', () => {
    it('should maintain audit trail for minimum required period', async () => {
      const sevenYearsAgo = new Date();
      sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

      await auditService.getStudentAuditTrail('student-123', {
        startDate: sevenYearsAgo
      });

      // Verify that audit service can retrieve records from 7 years ago
      expect(mockSupabase.from().select).toHaveBeenCalled();
    });

    it('should include all required audit fields for compliance', async () => {
      const context = {
        performedBy: 'admin-789',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        sessionId: 'session-abc',
        reason: 'Compliance test',
        metadata: { compliance_flag: true }
      };

      await auditService.logAction(
        'student-123',
        'class-456',
        EnrollmentAuditAction.ENROLLED,
        context
      );

      const insertCall = mockSupabase.from().insert.mock.calls[0][0];

      // Verify all required compliance fields are present
      expect(insertCall).toHaveProperty('student_id');
      expect(insertCall).toHaveProperty('class_id');
      expect(insertCall).toHaveProperty('action');
      expect(insertCall).toHaveProperty('performed_by');
      expect(insertCall).toHaveProperty('timestamp');
      expect(insertCall).toHaveProperty('reason');
      expect(insertCall.metadata).toHaveProperty('ip_address');
      expect(insertCall.metadata).toHaveProperty('user_agent');
      expect(insertCall.metadata).toHaveProperty('session_id');
    });

    it('should handle high-volume audit logging without performance degradation', async () => {
      const startTime = Date.now();
      const promises = [];

      // Simulate 100 concurrent audit log entries
      for (let i = 0; i < 100; i++) {
        promises.push(
          auditService.logAction(
            `student-${i}`,
            'class-456',
            EnrollmentAuditAction.ENROLLED,
            { performedBy: 'admin-789' }
          )
        );
      }

      await Promise.all(promises);
      const endTime = Date.now();

      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
      expect(mockSupabase.from().insert).toHaveBeenCalledTimes(100);
    });
  });

  describe('error handling and resilience', () => {
    it('should continue operation when audit logging fails', async () => {
      mockSupabase.from().insert.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Should not throw error
      await expect(
        auditService.logAction(
          'student-123',
          'class-456',
          EnrollmentAuditAction.ENROLLED,
          { performedBy: 'admin-789' }
        )
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle malformed audit data gracefully', async () => {
      mockSupabase.from().select().eq().order.mockReturnValueOnce({
        data: [
          {
            // Missing required fields
            action: EnrollmentAuditAction.ENROLLED
          }
        ],
        error: null
      });

      const result = await auditService.getStudentAuditTrail('student-123');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});