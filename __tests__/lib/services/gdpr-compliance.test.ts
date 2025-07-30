import { GDPRComplianceService } from '@/lib/services/gdpr-compliance';
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
  upsert: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  in: jest.fn(() => mockSupabase),
  is: jest.fn(() => mockSupabase),
  gte: jest.fn(() => mockSupabase),
  lte: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  data: null,
  error: null
};

describe('GDPRComplianceService', () => {
  let gdprService: GDPRComplianceService;

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    gdprService = new GDPRComplianceService();
  });

  describe('conductGDPRAssessment', () => {
    it('should conduct comprehensive GDPR assessment', async () => {
      const institutionId = 'institution-123';

      const assessment = await gdprService.conductGDPRAssessment(institutionId);

      expect(assessment).toBeDefined();
      expect(assessment.institutionId).toBe(institutionId);
      expect(assessment.assessmentDate).toBeInstanceOf(Date);
      expect(assessment.overallCompliance).toBeGreaterThanOrEqual(0);
      expect(assessment.overallCompliance).toBeLessThanOrEqual(100);
      expect(assessment.riskLevel).toMatch(/^(low|medium|high|critical)$/);
      expect(Array.isArray(assessment.findings)).toBe(true);
      expect(assessment.nextReviewDate).toBeInstanceOf(Date);

      // Check that all required assessment categories are present
      const categories = assessment.findings.map(f => f.category);
      expect(categories).toContain('Data Processing Activities');
      expect(categories).toContain('Consent Management');
      expect(categories).toContain('Data Subject Rights');
      expect(categories).toContain('Data Security');
      expect(categories).toContain('Data Retention');
      expect(categories).toContain('Data Transfers');
    });

    it('should calculate risk level correctly based on compliance score', async () => {
      const institutionId = 'institution-123';

      // Mock assessment methods to return specific compliance scores
      jest.spyOn(gdprService as any, 'assessDataProcessingActivities').mockResolvedValue({
        category: 'Data Processing Activities',
        compliant: true,
        totalChecks: 5,
        passedChecks: 5,
        issues: [],
        recommendations: []
      });

      jest.spyOn(gdprService as any, 'assessConsentManagement').mockResolvedValue({
        category: 'Consent Management',
        compliant: true,
        totalChecks: 4,
        passedChecks: 4,
        issues: [],
        recommendations: []
      });

      // Mock other assessment methods similarly...

      const assessment = await gdprService.conductGDPRAssessment(institutionId);

      expect(assessment.overallCompliance).toBeGreaterThan(90);
      expect(assessment.riskLevel).toBe('low');
    });
  });

  describe('processDataSubjectAccessRequest', () => {
    it('should process data subject access request', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const format = 'json';

      // Mock data collection methods
      mockSupabase.data = {
        id: studentId,
        email: 'student@example.com',
        full_name: 'John Doe'
      };

      const result = await gdprService.processDataSubjectAccessRequest(
        studentId,
        requestedBy,
        format
      );

      expect(result).toBeDefined();
      expect(result.requestId).toBeDefined();
      expect(typeof result.requestId).toBe('string');
      expect(result.data).toBeDefined();
      expect(result.data.dataSubject).toBeDefined();
      expect(result.data.dataSubject.id).toBe(studentId);
      expect(result.data.personalData).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle different response formats', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';

      mockSupabase.data = {};

      const jsonResult = await gdprService.processDataSubjectAccessRequest(
        studentId,
        requestedBy,
        'json'
      );
      expect(jsonResult.data).toBeDefined();

      const csvResult = await gdprService.processDataSubjectAccessRequest(
        studentId,
        requestedBy,
        'csv'
      );
      expect(csvResult.data).toBeDefined();

      const pdfResult = await gdprService.processDataSubjectAccessRequest(
        studentId,
        requestedBy,
        'pdf'
      );
      expect(pdfResult.data).toBeDefined();
    });

    it('should measure processing time accurately', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';

      mockSupabase.data = {};

      const startTime = Date.now();
      const result = await gdprService.processDataSubjectAccessRequest(
        studentId,
        requestedBy,
        'json'
      );
      const endTime = Date.now();

      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(endTime - startTime + 100); // Allow some margin
    });
  });

  describe('processDataPortabilityRequest', () => {
    it('should process data portability request', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const format = 'json';

      const result = await gdprService.processDataPortabilityRequest(
        studentId,
        requestedBy,
        format
      );

      expect(result).toBeDefined();
      expect(result.requestId).toBeDefined();
      expect(typeof result.requestId).toBe('string');
      expect(result.portableData).toBeDefined();
      expect(result.downloadUrl).toBeDefined();
      expect(result.downloadUrl).toContain(result.requestId);
    });

    it('should support different export formats', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';

      const jsonResult = await gdprService.processDataPortabilityRequest(
        studentId,
        requestedBy,
        'json'
      );
      expect(jsonResult.portableData).toBeDefined();

      const csvResult = await gdprService.processDataPortabilityRequest(
        studentId,
        requestedBy,
        'csv'
      );
      expect(csvResult.portableData).toBeDefined();

      const xmlResult = await gdprService.processDataPortabilityRequest(
        studentId,
        requestedBy,
        'xml'
      );
      expect(xmlResult.portableData).toBeDefined();
    });
  });

  describe('processRightToErasureRequest', () => {
    it('should process right to erasure request when eligible', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const reason = 'User requested account deletion';

      // Mock no legal obligations
      jest.spyOn(gdprService as any, 'checkLegalObligationsForRetention').mockResolvedValue([]);

      const result = await gdprService.processRightToErasureRequest(
        studentId,
        requestedBy,
        reason
      );

      expect(result).toBeDefined();
      expect(result.requestId).toBeDefined();
      expect(result.eligibleForErasure).toBe(true);
      expect(result.legalObligations).toEqual([]);
      expect(result.erasureSchedule).toBeInstanceOf(Date);
      
      // Should be scheduled within 30 days
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
      expect(result.erasureSchedule!.getTime()).toBeLessThanOrEqual(thirtyDaysFromNow.getTime());
    });

    it('should handle cases where erasure is not eligible due to legal obligations', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const reason = 'User requested account deletion';

      // Mock legal obligations
      const legalObligations = [
        'Active enrollment records must be retained for educational purposes',
        'Financial records must be retained for tax purposes'
      ];
      jest.spyOn(gdprService as any, 'checkLegalObligationsForRetention').mockResolvedValue(legalObligations);

      const result = await gdprService.processRightToErasureRequest(
        studentId,
        requestedBy,
        reason
      );

      expect(result.eligibleForErasure).toBe(false);
      expect(result.legalObligations).toEqual(legalObligations);
      expect(result.erasureSchedule).toBeUndefined();
    });

    it('should handle specific data types for erasure', async () => {
      const studentId = 'student-123';
      const requestedBy = 'admin-456';
      const reason = 'Remove marketing data only';
      const dataTypes = ['marketing_preferences', 'communication_history'];

      jest.spyOn(gdprService as any, 'checkLegalObligationsForRetention').mockResolvedValue([]);

      const result = await gdprService.processRightToErasureRequest(
        studentId,
        requestedBy,
        reason,
        dataTypes
      );

      expect(result.eligibleForErasure).toBe(true);
      expect(result.erasureSchedule).toBeInstanceOf(Date);
    });
  });

  describe('manageConsent', () => {
    it('should grant consent for data processing', async () => {
      const studentId = 'student-123';
      const consentType = 'data_processing';
      const purpose = 'Educational services';
      const granted = true;

      mockSupabase.error = null;

      const consentRecord = await gdprService.manageConsent(
        studentId,
        consentType,
        purpose,
        granted
      );

      expect(consentRecord).toBeDefined();
      expect(consentRecord.studentId).toBe(studentId);
      expect(consentRecord.consentType).toBe(consentType);
      expect(consentRecord.purpose).toBe(purpose);
      expect(consentRecord.granted).toBe(granted);
      expect(consentRecord.grantedAt).toBeInstanceOf(Date);
      expect(consentRecord.withdrawnAt).toBeUndefined();
      expect(consentRecord.version).toBe('1.0');

      expect(mockSupabase.from).toHaveBeenCalledWith('student_consents');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: studentId,
          consent_type: consentType,
          purpose,
          granted_at: expect.any(String)
        })
      );
    });

    it('should withdraw consent for data processing', async () => {
      const studentId = 'student-123';
      const consentType = 'marketing';
      const purpose = 'Marketing communications';
      const granted = false;

      mockSupabase.error = null;

      const consentRecord = await gdprService.manageConsent(
        studentId,
        consentType,
        purpose,
        granted
      );

      expect(consentRecord.granted).toBe(false);
      expect(consentRecord.grantedAt).toBeUndefined();
      expect(consentRecord.withdrawnAt).toBeInstanceOf(Date);

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          revoked_at: expect.any(String)
        })
      );
    });

    it('should handle consent with expiration date', async () => {
      const studentId = 'student-123';
      const consentType = 'analytics';
      const purpose = 'Usage analytics';
      const granted = true;
      const expiresAt = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)); // 1 year

      mockSupabase.error = null;

      const consentRecord = await gdprService.manageConsent(
        studentId,
        consentType,
        purpose,
        granted,
        'consent',
        expiresAt
      );

      expect(consentRecord.expiresAt).toEqual(expiresAt);

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: expiresAt.toISOString()
        })
      );
    });

    it('should handle database errors', async () => {
      mockSupabase.error = new Error('Database insert failed');

      await expect(
        gdprService.manageConsent(
          'student-123',
          'data_processing',
          'Educational services',
          true
        )
      ).rejects.toThrow('Failed to store consent record');
    });
  });

  describe('generateGDPRComplianceReport', () => {
    it('should generate comprehensive GDPR compliance report', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      // Mock students data
      mockSupabase.data = Array.from({ length: 50 }, (_, i) => ({ id: `student-${i}` }));

      const report = await gdprService.generateGDPRComplianceReport(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.summary.totalDataSubjects).toBe(50);
      expect(report.summary.complianceScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.complianceScore).toBeLessThanOrEqual(100);
      expect(report.details).toBeDefined();
      expect(report.details.consentManagement).toBeDefined();
      expect(report.details.dataSubjectRights).toBeDefined();
      expect(report.details.dataBreaches).toBeDefined();
      expect(report.details.processingActivities).toBeDefined();
    });

    it('should calculate compliance score based on consent ratio', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      // Mock 100 students
      mockSupabase.data = Array.from({ length: 100 }, (_, i) => ({ id: `student-${i}` }));

      // Mock 80 active consents (should give 80% compliance score)
      mockSupabase.data = Array.from({ length: 80 }, (_, i) => ({ 
        id: `consent-${i}`,
        student_id: `student-${i}`,
        consent_type: 'data_processing'
      }));

      const report = await gdprService.generateGDPRComplianceReport(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(report.summary.complianceScore).toBe(80);
    });

    it('should handle institutions with no students', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      // Mock no students
      mockSupabase.data = [];

      const report = await gdprService.generateGDPRComplianceReport(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(report.summary.totalDataSubjects).toBe(0);
      expect(report.summary.activeConsents).toBe(0);
      expect(report.summary.complianceScore).toBe(100); // No students = 100% compliant
    });
  });

  describe('GDPR activity logging', () => {
    it('should log GDPR activities', async () => {
      const studentId = 'student-123';
      const activity = 'consent_granted';
      const metadata = { consentType: 'data_processing' };

      // Mock the logDataAccess method
      const logDataAccessSpy = jest.spyOn(gdprService as any, 'logDataAccess').mockResolvedValue(undefined);

      await (gdprService as any).logGDPRActivity(studentId, activity, metadata);

      expect(logDataAccessSpy).toHaveBeenCalledWith(
        studentId,
        'system',
        `gdpr_${activity}`,
        ['gdpr_activity'],
        `GDPR ${activity}`,
        false,
        false
      );
    });
  });

  describe('data collection methods', () => {
    it('should collect all personal data for GDPR request', async () => {
      const studentId = 'student-123';

      // Mock various data sources
      mockSupabase.data = {
        id: studentId,
        email: 'student@example.com',
        full_name: 'John Doe'
      };

      const personalData = await (gdprService as any).collectAllPersonalData(studentId);

      expect(personalData).toBeDefined();
      expect(personalData.profile).toBeDefined();
      expect(personalData.enrollments).toBeDefined();
      expect(personalData.grades).toBeDefined();
      expect(personalData.communications).toBeDefined();
      expect(personalData.preferences).toBeDefined();
    });

    it('should collect portable data separately from all personal data', async () => {
      const studentId = 'student-123';

      const portableData = await (gdprService as any).collectPortableData(studentId);

      expect(portableData).toBeDefined();
      expect(portableData.userProvidedData).toBeDefined();
      expect(portableData.generatedData).toBeDefined();
    });

    it('should check legal obligations for data retention', async () => {
      const studentId = 'student-123';

      // Mock active enrollments
      mockSupabase.data = [
        { id: 'enrollment-1', student_id: studentId, status: 'enrolled' }
      ];

      const obligations = await (gdprService as any).checkLegalObligationsForRetention(studentId);

      expect(Array.isArray(obligations)).toBe(true);
      expect(obligations.length).toBeGreaterThan(0);
      expect(obligations[0]).toContain('Active enrollment records');
    });

    it('should return no obligations when student has no active enrollments', async () => {
      const studentId = 'student-123';

      // Mock no active enrollments
      mockSupabase.data = [];

      const obligations = await (gdprService as any).checkLegalObligationsForRetention(studentId);

      expect(Array.isArray(obligations)).toBe(true);
      expect(obligations.length).toBe(0);
    });
  });
});