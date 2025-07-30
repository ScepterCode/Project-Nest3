import { FERPAComplianceService } from '@/lib/services/ferpa-compliance';
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
  upsert: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  in: jest.fn(() => mockSupabase),
  gte: jest.fn(() => mockSupabase),
  lte: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  data: null,
  error: null
};

describe('FERPAComplianceService', () => {
  let ferpaService: FERPAComplianceService;

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    ferpaService = new FERPAComplianceService();
  });

  describe('conductFERPAAssessment', () => {
    it('should conduct comprehensive FERPA assessment', async () => {
      const institutionId = 'institution-123';

      const assessment = await ferpaService.conductFERPAAssessment(institutionId);

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
      expect(categories).toContain('Educational Record Classification');
      expect(categories).toContain('Directory Information Management');
      expect(categories).toContain('Legitimate Educational Interest');
      expect(categories).toContain('Disclosure Tracking');
      expect(categories).toContain('Consent Management');
      expect(categories).toContain('Access Controls');
      expect(categories).toContain('Record Retention');
    });

    it('should calculate risk level based on compliance score', async () => {
      const institutionId = 'institution-123';

      // Mock all assessment methods to return perfect compliance
      const mockAssessmentResult = {
        category: 'Test Category',
        compliant: true,
        totalChecks: 5,
        passedChecks: 5,
        issues: [],
        recommendations: []
      };

      jest.spyOn(ferpaService as any, 'assessRecordClassification').mockResolvedValue(mockAssessmentResult);
      jest.spyOn(ferpaService as any, 'assessDirectoryInformation').mockResolvedValue(mockAssessmentResult);
      jest.spyOn(ferpaService as any, 'assessLegitimateEducationalInterest').mockResolvedValue(mockAssessmentResult);
      jest.spyOn(ferpaService as any, 'assessDisclosureTracking').mockResolvedValue(mockAssessmentResult);
      jest.spyOn(ferpaService as any, 'assessConsentManagement').mockResolvedValue(mockAssessmentResult);
      jest.spyOn(ferpaService as any, 'assessAccessControls').mockResolvedValue(mockAssessmentResult);
      jest.spyOn(ferpaService as any, 'assessRecordRetention').mockResolvedValue(mockAssessmentResult);

      const assessment = await ferpaService.conductFERPAAssessment(institutionId);

      expect(assessment.overallCompliance).toBe(100);
      expect(assessment.riskLevel).toBe('low');
    });
  });

  describe('classifyEducationalRecord', () => {
    it('should classify directory information correctly', async () => {
      const studentId = 'student-123';
      const recordType = 'directory';
      const dataElements = ['name', 'email', 'major_field'];
      const retentionPeriod = 7;

      const record = await ferpaService.classifyEducationalRecord(
        studentId,
        recordType,
        dataElements,
        retentionPeriod
      );

      expect(record).toBeDefined();
      expect(record.studentId).toBe(studentId);
      expect(record.recordType).toBe(recordType);
      expect(record.classification).toBe('directory');
      expect(record.dataElements).toEqual(dataElements);
      expect(record.retentionPeriod).toBe(retentionPeriod);
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.disposalDate).toBeInstanceOf(Date);
    });

    it('should classify restricted information correctly', async () => {
      const studentId = 'student-123';
      const recordType = 'disciplinary';
      const dataElements = ['disciplinary_records', 'social_security_number'];
      const retentionPeriod = 7;

      const record = await ferpaService.classifyEducationalRecord(
        studentId,
        recordType,
        dataElements,
        retentionPeriod
      );

      expect(record.classification).toBe('restricted');
    });

    it('should classify public information correctly', async () => {
      const studentId = 'student-123';
      const recordType = 'educational';
      const dataElements = ['graduation_status', 'degree_awarded'];
      const retentionPeriod = 10;

      const record = await ferpaService.classifyEducationalRecord(
        studentId,
        recordType,
        dataElements,
        retentionPeriod
      );

      expect(record.classification).toBe('public');
    });

    it('should default to confidential for other data types', async () => {
      const studentId = 'student-123';
      const recordType = 'educational';
      const dataElements = ['grades', 'attendance_records'];
      const retentionPeriod = 7;

      const record = await ferpaService.classifyEducationalRecord(
        studentId,
        recordType,
        dataElements,
        retentionPeriod
      );

      expect(record.classification).toBe('confidential');
    });
  });

  describe('manageDirectoryInformationOptOut', () => {
    it('should handle directory information opt-out', async () => {
      const studentId = 'student-123';
      const directorySettings = {
        name: false,
        email: false,
        majorField: true
      };
      const optOut = true;
      const reason = 'Privacy concerns';

      // Mock existing directory information
      mockSupabase.data = {
        student_id: studentId,
        settings: {
          directoryInformation: {
            name: true,
            email: true,
            majorField: true
          }
        }
      };
      mockSupabase.error = null;

      const result = await ferpaService.manageDirectoryInformationOptOut(
        studentId,
        directorySettings,
        optOut,
        reason
      );

      expect(result).toBeDefined();
      expect(result.studentId).toBe(studentId);
      expect(result.name).toBe(false);
      expect(result.email).toBe(false);
      expect(result.majorField).toBe(true);
      expect(result.optOutDate).toBeInstanceOf(Date);
      expect(result.optOutReason).toBe(reason);

      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: studentId,
          directory_opt_out: true
        })
      );
    });

    it('should handle directory information opt-in', async () => {
      const studentId = 'student-123';
      const directorySettings = {
        name: true,
        email: true
      };
      const optOut = false;

      mockSupabase.data = { settings: {} };
      mockSupabase.error = null;

      const result = await ferpaService.manageDirectoryInformationOptOut(
        studentId,
        directorySettings,
        optOut
      );

      expect(result.optOutDate).toBeUndefined();
      expect(result.optOutReason).toBeUndefined();

      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          directory_opt_out: false
        })
      );
    });

    it('should handle database errors', async () => {
      mockSupabase.error = new Error('Database update failed');

      await expect(
        ferpaService.manageDirectoryInformationOptOut(
          'student-123',
          { name: false },
          true,
          'Privacy'
        )
      ).rejects.toThrow('Failed to update directory information settings');
    });
  });

  describe('establishLegitimateEducationalInterest', () => {
    it('should establish legitimate educational interest', async () => {
      const userId = 'advisor-123';
      const studentId = 'student-456';
      const role = 'academic_advisor';
      const department = 'Computer Science';
      const justification = 'Academic advising for course selection';
      const dataTypes = ['grades', 'enrollment_info'];
      const purpose = 'Academic advising';
      const approvedBy = 'department-head-789';
      const expiresAt = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)); // 1 year

      mockSupabase.error = null;

      const interest = await ferpaService.establishLegitimateEducationalInterest(
        userId,
        studentId,
        role,
        department,
        justification,
        dataTypes,
        purpose,
        approvedBy,
        expiresAt
      );

      expect(interest).toBeDefined();
      expect(interest.userId).toBe(userId);
      expect(interest.role).toBe(role);
      expect(interest.department).toBe(department);
      expect(interest.justification).toBe(justification);
      expect(interest.dataTypes).toEqual(dataTypes);
      expect(interest.purpose).toBe(purpose);
      expect(interest.approvedBy).toBe(approvedBy);
      expect(interest.approvedAt).toBeInstanceOf(Date);
      expect(interest.expiresAt).toEqual(expiresAt);
      expect(interest.active).toBe(true);

      expect(mockSupabase.from).toHaveBeenCalledWith('student_advisors');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: studentId,
          advisor_id: userId,
          advisor_type: 'educational_interest',
          active: true
        })
      );
    });

    it('should handle database errors', async () => {
      mockSupabase.error = new Error('Insert failed');

      await expect(
        ferpaService.establishLegitimateEducationalInterest(
          'advisor-123',
          'student-456',
          'academic_advisor',
          'Computer Science',
          'Academic advising',
          ['grades'],
          'Advising',
          'department-head-789'
        )
      ).rejects.toThrow('Failed to establish legitimate educational interest');
    });
  });

  describe('recordDisclosure', () => {
    it('should record FERPA disclosure', async () => {
      const studentId = 'student-123';
      const disclosedTo = 'external-agency-456';
      const disclosedBy = 'registrar-789';
      const dataTypes = ['transcript', 'enrollment_verification'];
      const purpose = 'Employment verification';
      const legalBasis = 'consent';
      const consentObtained = true;
      const metadata = { requestId: 'req-123' };

      mockSupabase.error = null;

      const disclosure = await ferpaService.recordDisclosure(
        studentId,
        disclosedTo,
        disclosedBy,
        dataTypes,
        purpose,
        legalBasis,
        consentObtained,
        metadata
      );

      expect(disclosure).toBeDefined();
      expect(disclosure.studentId).toBe(studentId);
      expect(disclosure.disclosedTo).toBe(disclosedTo);
      expect(disclosure.disclosedBy).toBe(disclosedBy);
      expect(disclosure.dataTypes).toEqual(dataTypes);
      expect(disclosure.purpose).toBe(purpose);
      expect(disclosure.legalBasis).toBe(legalBasis);
      expect(disclosure.consentObtained).toBe(consentObtained);
      expect(disclosure.disclosedAt).toBeInstanceOf(Date);
      expect(disclosure.recordedAt).toBeInstanceOf(Date);
      expect(disclosure.metadata).toEqual(metadata);

      expect(mockSupabase.from).toHaveBeenCalledWith('ferpa_access_log');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: studentId,
          accessed_by: disclosedBy,
          access_type: 'disclosure',
          data_accessed: dataTypes,
          purpose,
          legitimate_interest: false,
          consent_obtained: consentObtained
        })
      );
    });

    it('should handle legitimate interest disclosures', async () => {
      const disclosure = await ferpaService.recordDisclosure(
        'student-123',
        'advisor-456',
        'registrar-789',
        ['grades'],
        'Academic advising',
        'legitimate_interest',
        false
      );

      expect(disclosure.legalBasis).toBe('legitimate_interest');
      expect(disclosure.consentObtained).toBe(false);

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          legitimate_interest: true,
          consent_obtained: false
        })
      );
    });
  });

  describe('verifyLegitimateEducationalInterest', () => {
    it('should authorize access based on advisor relationship', async () => {
      const userId = 'advisor-123';
      const studentId = 'student-456';
      const dataTypes = ['grades', 'attendance'];
      const purpose = 'Academic advising';

      // Mock advisor relationship exists
      mockSupabase.data = {
        id: 'relation-1',
        student_id: studentId,
        advisor_id: userId,
        advisor_type: 'educational_interest',
        active: true
      };
      mockSupabase.error = null;

      const result = await ferpaService.verifyLegitimateEducationalInterest(
        userId,
        studentId,
        dataTypes,
        purpose
      );

      expect(result).toBeDefined();
      expect(result.authorized).toBe(true);
      expect(result.reason).toContain('advisor relationship');
    });

    it('should authorize access based on institutional role', async () => {
      const userId = 'registrar-123';
      const studentId = 'student-456';
      const dataTypes = ['transcript'];
      const purpose = 'Degree verification';

      // Mock no advisor relationship
      mockSupabase.data = null;
      mockSupabase.error = { code: 'PGRST116' }; // Not found

      // Mock user with registrar role
      mockSupabase.data = {
        id: userId,
        role: 'registrar',
        department_id: 'dept-123'
      };

      const result = await ferpaService.verifyLegitimateEducationalInterest(
        userId,
        studentId,
        dataTypes,
        purpose
      );

      expect(result.authorized).toBe(true);
      expect(result.reason).toContain('institutional role: registrar');
      expect(result.restrictions).toBeDefined();
    });

    it('should deny access for unauthorized roles', async () => {
      const userId = 'student-123';
      const studentId = 'student-456';
      const dataTypes = ['grades'];
      const purpose = 'Curiosity';

      // Mock no advisor relationship
      mockSupabase.data = null;
      mockSupabase.error = { code: 'PGRST116' };

      // Mock user with student role (not authorized)
      mockSupabase.data = {
        id: userId,
        role: 'student',
        department_id: 'dept-123'
      };

      const result = await ferpaService.verifyLegitimateEducationalInterest(
        userId,
        studentId,
        dataTypes,
        purpose
      );

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('does not have legitimate educational interest');
    });

    it('should apply restrictions based on role and data types', async () => {
      const userId = 'dept-admin-123';
      const studentId = 'student-456';
      const dataTypes = ['financial_aid_records'];
      const purpose = 'Administrative review';

      mockSupabase.data = null;
      mockSupabase.error = { code: 'PGRST116' };

      mockSupabase.data = {
        id: userId,
        role: 'department_admin',
        department_id: 'dept-123'
      };

      const result = await ferpaService.verifyLegitimateEducationalInterest(
        userId,
        studentId,
        dataTypes,
        purpose
      );

      expect(result.authorized).toBe(true);
      expect(result.restrictions).toBeDefined();
      expect(result.restrictions!.length).toBeGreaterThan(0);
      expect(result.restrictions![0]).toContain('Financial aid records require registrar approval');
    });
  });

  describe('generateFERPAComplianceReport', () => {
    it('should generate comprehensive FERPA compliance report', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      // Mock students data
      mockSupabase.data = Array.from({ length: 100 }, (_, i) => ({ id: `student-${i}` }));

      const report = await ferpaService.generateFERPAComplianceReport(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.summary.totalStudents).toBe(100);
      expect(report.summary.complianceScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.complianceScore).toBeLessThanOrEqual(100);
      expect(report.details).toBeDefined();
      expect(report.details.disclosureTracking).toBeDefined();
      expect(report.details.accessControls).toBeDefined();
      expect(report.details.directoryInformation).toBeDefined();
      expect(report.details.recordRetention).toBeDefined();
    });

    it('should calculate compliance score based on unauthorized access', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      // Mock students
      mockSupabase.data = Array.from({ length: 10 }, (_, i) => ({ id: `student-${i}` }));

      // Mock disclosures with some unauthorized access
      mockSupabase.data = [
        { id: 'disc-1', legitimate_interest: true, consent_obtained: false },
        { id: 'disc-2', legitimate_interest: false, consent_obtained: true },
        { id: 'disc-3', legitimate_interest: false, consent_obtained: false }, // Unauthorized
        { id: 'disc-4', legitimate_interest: true, consent_obtained: false }
      ];

      const report = await ferpaService.generateFERPAComplianceReport(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(report.summary.totalDisclosures).toBe(4);
      expect(report.summary.unauthorizedAccess).toBe(1);
      expect(report.summary.complianceScore).toBe(75); // 3/4 = 75%
    });

    it('should handle perfect compliance score', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      mockSupabase.data = Array.from({ length: 5 }, (_, i) => ({ id: `student-${i}` }));

      // Mock all authorized disclosures
      mockSupabase.data = [
        { id: 'disc-1', legitimate_interest: true, consent_obtained: false },
        { id: 'disc-2', legitimate_interest: false, consent_obtained: true }
      ];

      const report = await ferpaService.generateFERPAComplianceReport(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(report.summary.unauthorizedAccess).toBe(0);
      expect(report.summary.complianceScore).toBe(100);
    });

    it('should handle no disclosures case', async () => {
      const institutionId = 'institution-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31');

      mockSupabase.data = Array.from({ length: 5 }, (_, i) => ({ id: `student-${i}` }));

      // Mock no disclosures
      mockSupabase.data = [];

      const report = await ferpaService.generateFERPAComplianceReport(
        institutionId,
        periodStart,
        periodEnd
      );

      expect(report.summary.totalDisclosures).toBe(0);
      expect(report.summary.unauthorizedAccess).toBe(0);
      expect(report.summary.complianceScore).toBe(100); // No disclosures = perfect compliance
    });
  });

  describe('directory information classification', () => {
    it('should correctly identify directory information', async () => {
      const directoryElements = ['name', 'email', 'major_field', 'dates_of_attendance'];
      
      const isDirectory = (ferpaService as any).isDirectoryInformation(directoryElements);
      
      expect(isDirectory).toBe(true);
    });

    it('should correctly identify non-directory information', async () => {
      const nonDirectoryElements = ['grades', 'social_security_number', 'disciplinary_records'];
      
      const isDirectory = (ferpaService as any).isDirectoryInformation(nonDirectoryElements);
      
      expect(isDirectory).toBe(false);
    });

    it('should correctly identify public information', async () => {
      const publicElements = ['graduation_status', 'degree_awarded', 'honors'];
      
      const isPublic = (ferpaService as any).isPublicInformation(publicElements);
      
      expect(isPublic).toBe(true);
    });

    it('should correctly identify restricted information', async () => {
      const restrictedElements = ['social_security_number', 'disciplinary_records'];
      
      const isRestricted = (ferpaService as any).isRestrictedInformation(restrictedElements);
      
      expect(isRestricted).toBe(true);
    });
  });

  describe('access restrictions', () => {
    it('should determine appropriate restrictions for department admin accessing financial records', async () => {
      const restrictions = (ferpaService as any).determineAccessRestrictions(
        'department_admin',
        ['financial_aid_records'],
        'Administrative review'
      );

      expect(restrictions).toContain('Financial aid records require registrar approval');
    });

    it('should restrict disciplinary records access to disciplinary purposes', async () => {
      const restrictions = (ferpaService as any).determineAccessRestrictions(
        'department_admin',
        ['disciplinary_records'],
        'General review'
      );

      expect(restrictions).toContain('Disciplinary records access limited to disciplinary purposes');
    });

    it('should return no restrictions for appropriate access', async () => {
      const restrictions = (ferpaService as any).determineAccessRestrictions(
        'registrar',
        ['grades'],
        'Transcript preparation'
      );

      expect(restrictions).toEqual([]);
    });
  });
});