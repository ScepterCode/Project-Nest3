import { ComplianceManager } from '@/lib/services/compliance-manager';
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
  update: jest.fn(() => mockSupabase),
  delete: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  in: jest.fn(() => mockSupabase),
  gte: jest.fn(() => mockSupabase),
  lte: jest.fn(() => mockSupabase),
  order: jest.fn(() => mockSupabase),
  limit: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  rpc: jest.fn(() => mockSupabase),
  data: null,
  error: null
};

describe('ComplianceManager', () => {
  let complianceManager: ComplianceManager;

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    complianceManager = new ComplianceManager();
  });

  describe('generateComplianceReport', () => {
    it('should generate GDPR compliance report', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');
      const generatedBy = 'admin-456';

      // Mock students data
      mockSupabase.data = [
        { id: 'student-1' },
        { id: 'student-2' },
        { id: 'student-3' }
      ];
      mockSupabase.error = null;

      const report = await complianceManager.generateComplianceReport(
        institutionId,
        'gdpr',
        periodStart,
        periodEnd,
        generatedBy
      );

      expect(report).toBeDefined();
      expect(report.reportType).toBe('gdpr');
      expect(report.institutionId).toBe(institutionId);
      expect(report.generatedBy).toBe(generatedBy);
      expect(report.periodStart).toEqual(periodStart);
      expect(report.periodEnd).toEqual(periodEnd);
      expect(report.status).toBe('draft');
      expect(report.summary).toBeDefined();
      expect(report.findings).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should generate FERPA compliance report', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');
      const generatedBy = 'admin-456';

      // Mock access logs data
      mockSupabase.data = [
        {
          id: 'log-1',
          student_id: 'student-1',
          accessed_by: 'admin-1',
          legitimate_interest: true,
          consent_obtained: false
        },
        {
          id: 'log-2',
          student_id: 'student-2',
          accessed_by: 'admin-2',
          legitimate_interest: false,
          consent_obtained: true
        }
      ];

      const report = await complianceManager.generateComplianceReport(
        institutionId,
        'ferpa',
        periodStart,
        periodEnd,
        generatedBy
      );

      expect(report).toBeDefined();
      expect(report.reportType).toBe('ferpa');
      expect(report.summary.totalRecords).toBeGreaterThanOrEqual(0);
      expect(report.summary.riskLevel).toMatch(/^(low|medium|high|critical)$/);
    });

    it('should handle errors gracefully', async () => {
      mockSupabase.error = new Error('Database connection failed');

      await expect(
        complianceManager.generateComplianceReport(
          'institution-123',
          'gdpr',
          new Date('2024-01-01'),
          new Date('2024-12-31'),
          'admin-456'
        )
      ).rejects.toThrow('Failed to fetch students');
    });
  });

  describe('processGDPRDataExport', () => {
    it('should process GDPR data export request', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const format = 'json';

      // Mock data for various queries
      mockSupabase.data = [
        { id: studentId, email: 'student@example.com', full_name: 'John Doe' }
      ];

      const exportData = await complianceManager.processGDPRDataExport(
        studentId,
        requestedBy,
        format
      );

      expect(exportData).toBeDefined();
      expect(exportData.studentId).toBe(studentId);
      expect(exportData.format).toBe(format);
      expect(exportData.requestedAt).toBeInstanceOf(Date);
      expect(exportData.completedAt).toBeInstanceOf(Date);
      expect(exportData.data).toBeDefined();
      expect(exportData.data.personalInfo).toBeDefined();
      expect(exportData.data.enrollmentHistory).toBeDefined();
      expect(exportData.data.auditTrail).toBeDefined();
    });

    it('should handle different export formats', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';

      mockSupabase.data = [{}];

      const jsonExport = await complianceManager.processGDPRDataExport(
        studentId,
        requestedBy,
        'json'
      );
      expect(jsonExport.format).toBe('json');

      const csvExport = await complianceManager.processGDPRDataExport(
        studentId,
        requestedBy,
        'csv'
      );
      expect(csvExport.format).toBe('csv');

      const pdfExport = await complianceManager.processGDPRDataExport(
        studentId,
        requestedBy,
        'pdf'
      );
      expect(pdfExport.format).toBe('pdf');
    });
  });

  describe('processDataDeletionRequest', () => {
    it('should create data deletion request', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const dataTypes = ['personal_info', 'enrollment_data'];
      const reason = 'Student requested account deletion';

      mockSupabase.error = null;

      const requestId = await complianceManager.processDataDeletionRequest(
        studentId,
        requestedBy,
        dataTypes,
        reason
      );

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect(mockSupabase.from).toHaveBeenCalledWith('data_deletion_requests');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: studentId,
          requested_by: requestedBy,
          data_types: dataTypes,
          reason,
          status: 'pending'
        })
      );
    });

    it('should handle database errors', async () => {
      mockSupabase.error = new Error('Insert failed');

      await expect(
        complianceManager.processDataDeletionRequest(
          'student-123',
          'admin-456',
          ['personal_info'],
          'Test reason'
        )
      ).rejects.toThrow('Failed to create deletion request');
    });
  });

  describe('processFERPAAccessRequest', () => {
    it('should create FERPA access request', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const dataTypes = ['grades', 'enrollment_info'];
      const purpose = 'Academic advising';
      const legitimateInterest = true;

      mockSupabase.error = null;

      const accessRequest = await complianceManager.processFERPAAccessRequest(
        studentId,
        requestedBy,
        dataTypes,
        purpose,
        legitimateInterest
      );

      expect(accessRequest).toBeDefined();
      expect(accessRequest.studentId).toBe(studentId);
      expect(accessRequest.requestedBy).toBe(requestedBy);
      expect(accessRequest.dataTypes).toEqual(dataTypes);
      expect(accessRequest.purpose).toBe(purpose);
      expect(accessRequest.legitimateInterest).toBe(legitimateInterest);
      expect(accessRequest.status).toBe('approved'); // Auto-approved for legitimate interest
      expect(accessRequest.requestedAt).toBeInstanceOf(Date);
      expect(accessRequest.expiresAt).toBeInstanceOf(Date);
    });

    it('should require approval for non-legitimate interest requests', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const dataTypes = ['grades'];
      const purpose = 'Research';
      const legitimateInterest = false;

      mockSupabase.error = null;

      const accessRequest = await complianceManager.processFERPAAccessRequest(
        studentId,
        requestedBy,
        dataTypes,
        purpose,
        legitimateInterest
      );

      expect(accessRequest.status).toBe('pending'); // Requires approval
      expect(accessRequest.legitimateInterest).toBe(false);
    });
  });

  describe('verifyAuditIntegrity', () => {
    it('should verify audit trail integrity', async () => {
      const studentId = 'student-123';
      const classId = 'class-456';

      // Mock RPC response
      mockSupabase.data = [{
        is_valid: true,
        broken_chain_count: 0,
        invalid_hash_count: 0
      }];
      mockSupabase.error = null;

      const result = await complianceManager.verifyAuditIntegrity(studentId, classId);

      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.brokenChainCount).toBe(0);
      expect(result.invalidHashCount).toBe(0);
      expect(result.issues).toEqual([]);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('verify_audit_integrity', {
        p_student_id: studentId,
        p_class_id: classId
      });
    });

    it('should detect integrity issues', async () => {
      const studentId = 'student-123';
      const classId = 'class-456';

      // Mock RPC response with issues
      mockSupabase.data = [{
        is_valid: false,
        broken_chain_count: 2,
        invalid_hash_count: 1
      }];

      const result = await complianceManager.verifyAuditIntegrity(studentId, classId);

      expect(result.isValid).toBe(false);
      expect(result.brokenChainCount).toBe(2);
      expect(result.invalidHashCount).toBe(1);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toContain('broken hash chains');
      expect(result.issues[1]).toContain('invalid hashes');
    });

    it('should handle RPC errors', async () => {
      mockSupabase.error = new Error('RPC failed');

      await expect(
        complianceManager.verifyAuditIntegrity('student-123', 'class-456')
      ).rejects.toThrow('Failed to verify audit integrity');
    });
  });

  describe('data collection methods', () => {
    it('should collect student personal info', async () => {
      const studentId = 'student-123';
      
      mockSupabase.data = {
        id: studentId,
        email: 'student@example.com',
        full_name: 'John Doe',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };
      mockSupabase.error = null;

      // Access private method through any cast for testing
      const personalInfo = await (complianceManager as any).getStudentPersonalInfo(studentId);

      expect(personalInfo).toBeDefined();
      expect(personalInfo.id).toBe(studentId);
      expect(personalInfo.email).toBe('student@example.com');
      expect(personalInfo.full_name).toBe('John Doe');
    });

    it('should collect student enrollment history', async () => {
      const studentId = 'student-123';
      
      mockSupabase.data = [
        {
          id: 'history-1',
          student_id: studentId,
          class_id: 'class-1',
          action: 'enrolled',
          timestamp: '2024-01-01T00:00:00Z'
        },
        {
          id: 'history-2',
          student_id: studentId,
          class_id: 'class-2',
          action: 'dropped',
          timestamp: '2024-02-01T00:00:00Z'
        }
      ];

      const enrollmentHistory = await (complianceManager as any).getStudentEnrollmentHistory(studentId);

      expect(enrollmentHistory).toBeDefined();
      expect(Array.isArray(enrollmentHistory)).toBe(true);
      expect(enrollmentHistory).toHaveLength(2);
      expect(enrollmentHistory[0].student_id).toBe(studentId);
    });

    it('should collect student audit trail', async () => {
      const studentId = 'student-123';
      
      mockSupabase.data = [
        {
          id: 'audit-1',
          student_id: studentId,
          action: 'enrolled',
          timestamp: '2024-01-01T00:00:00Z',
          performed_by: 'admin-1'
        }
      ];

      const auditTrail = await (complianceManager as any).getStudentAuditTrail(studentId);

      expect(auditTrail).toBeDefined();
      expect(Array.isArray(auditTrail)).toBe(true);
      expect(auditTrail[0].student_id).toBe(studentId);
    });

    it('should collect student consents', async () => {
      const studentId = 'student-123';
      
      mockSupabase.data = [
        {
          id: 'consent-1',
          student_id: studentId,
          consent_type: 'data_processing',
          granted_at: '2024-01-01T00:00:00Z'
        }
      ];

      const consents = await (complianceManager as any).getStudentConsents(studentId);

      expect(consents).toBeDefined();
      expect(Array.isArray(consents)).toBe(true);
      expect(consents[0].student_id).toBe(studentId);
    });

    it('should collect student privacy settings', async () => {
      const studentId = 'student-123';
      
      mockSupabase.data = {
        id: 'settings-1',
        student_id: studentId,
        directory_opt_out: false,
        restrict_grade_access: true
      };

      const privacySettings = await (complianceManager as any).getStudentPrivacySettings(studentId);

      expect(privacySettings).toBeDefined();
      expect(privacySettings.student_id).toBe(studentId);
    });

    it('should handle missing privacy settings gracefully', async () => {
      const studentId = 'student-123';
      
      mockSupabase.data = null;
      mockSupabase.error = { code: 'PGRST116' }; // Not found error

      const privacySettings = await (complianceManager as any).getStudentPrivacySettings(studentId);

      expect(privacySettings).toBeNull();
    });
  });

  describe('compliance summary generation', () => {
    it('should generate GDPR summary with correct risk assessment', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      // Mock students data
      mockSupabase.data = Array.from({ length: 100 }, (_, i) => ({ id: `student-${i}` }));

      const summary = await (complianceManager as any).generateGDPRSummary(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(summary).toBeDefined();
      expect(summary.totalRecords).toBe(100);
      expect(summary.riskLevel).toMatch(/^(low|medium|high|critical)$/);
      expect(summary.dataTypes).toContain('personal_info');
      expect(summary.dataTypes).toContain('enrollment_data');
    });

    it('should generate FERPA summary with access log analysis', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      // Mock access logs with some unauthorized access
      mockSupabase.data = [
        { id: 'log-1', student_id: 'student-1', legitimate_interest: true, consent_obtained: false },
        { id: 'log-2', student_id: 'student-2', legitimate_interest: false, consent_obtained: false }, // Unauthorized
        { id: 'log-3', student_id: 'student-3', legitimate_interest: false, consent_obtained: true }
      ];

      const summary = await (complianceManager as any).generateFERPASummary(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(summary).toBeDefined();
      expect(summary.totalRecords).toBe(3);
      expect(summary.violationCount).toBe(1); // One unauthorized access
      expect(summary.compliantRecords).toBe(2);
      expect(summary.riskLevel).toBe('medium'); // Based on violation rate
    });
  });
});