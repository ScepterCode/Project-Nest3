import { FERPAComplianceService } from '@/lib/services/ferpa-compliance';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

// Mock ComplianceManager
jest.mock('@/lib/services/compliance-manager', () => ({
  ComplianceManager: class {
    logDataAccess = jest.fn().mockResolvedValue(undefined);
  }
}));

// Mock crypto for Node.js environment
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid'
  }
});

describe('FERPAComplianceService - Enhanced Features', () => {
  let service: FERPAComplianceService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new FERPAComplianceService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('classifyEducationalRecord', () => {
    it('should classify directory information correctly', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const record = await service.classifyEducationalRecord(
        'student-id',
        'educational',
        ['name', 'email', 'major_field'],
        5
      );

      expect(record).toBeDefined();
      expect(record.id).toBe('test-uuid');
      expect(record.studentId).toBe('student-id');
      expect(record.recordType).toBe('educational');
      expect(record.classification).toBe('directory');
      expect(record.dataElements).toEqual(['name', 'email', 'major_field']);
      expect(record.retentionPeriod).toBe(5);
      expect(record.disposalDate).toBeInstanceOf(Date);
    });

    it('should classify public information correctly', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const record = await service.classifyEducationalRecord(
        'student-id',
        'educational',
        ['graduation_status', 'degree_awarded'],
        7
      );

      expect(record.classification).toBe('public');
    });

    it('should classify restricted information correctly', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const record = await service.classifyEducationalRecord(
        'student-id',
        'disciplinary',
        ['social_security_number', 'disciplinary_records'],
        10
      );

      expect(record.classification).toBe('restricted');
    });

    it('should classify confidential information by default', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const record = await service.classifyEducationalRecord(
        'student-id',
        'educational',
        ['grades', 'attendance'],
        5
      );

      expect(record.classification).toBe('confidential');
    });

    it('should handle database errors when storing record', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.classifyEducationalRecord(
          'student-id',
          'educational',
          ['name'],
          5
        )
      ).rejects.toThrow('Failed to store educational record: Database error');
    });
  });

  describe('manageDirectoryInformationOptOut', () => {
    beforeEach(() => {
      // Mock existing directory information
      mockSupabase.select.mockResolvedValue({
        data: {
          settings: {
            directoryInformation: {
              studentId: 'student-id',
              name: true,
              email: true,
              majorField: true
            }
          }
        },
        error: null
      });
    });

    it('should handle directory information opt-out', async () => {
      mockSupabase.upsert.mockResolvedValue({ error: null });

      const directoryInfo = await service.manageDirectoryInformationOptOut(
        'student-id',
        { name: false, email: false },
        true,
        'Privacy concerns'
      );

      expect(directoryInfo).toBeDefined();
      expect(directoryInfo.studentId).toBe('student-id');
      expect(directoryInfo.name).toBe(false);
      expect(directoryInfo.email).toBe(false);
      expect(directoryInfo.optOutDate).toBeInstanceOf(Date);
      expect(directoryInfo.optOutReason).toBe('Privacy concerns');

      expect(mockSupabase.upsert).toHaveBeenCalledWith({
        student_id: 'student-id',
        directory_opt_out: true,
        settings: {
          directoryInformation: expect.objectContaining({
            name: false,
            email: false,
            optOutReason: 'Privacy concerns'
          })
        },
        updated_at: expect.any(String)
      });
    });

    it('should handle directory information opt-in', async () => {
      mockSupabase.upsert.mockResolvedValue({ error: null });

      const directoryInfo = await service.manageDirectoryInformationOptOut(
        'student-id',
        { name: true, email: true },
        false
      );

      expect(directoryInfo.optOutDate).toBeUndefined();
      expect(directoryInfo.optOutReason).toBeUndefined();

      expect(mockSupabase.upsert).toHaveBeenCalledWith({
        student_id: 'student-id',
        directory_opt_out: false,
        settings: {
          directoryInformation: expect.objectContaining({
            name: true,
            email: true
          })
        },
        updated_at: expect.any(String)
      });
    });

    it('should handle database errors when updating settings', async () => {
      mockSupabase.upsert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.manageDirectoryInformationOptOut(
          'student-id',
          { name: false },
          true
        )
      ).rejects.toThrow('Failed to update directory information settings: Database error');
    });
  });

  describe('establishLegitimateEducationalInterest', () => {
    it('should establish legitimate educational interest', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const interest = await service.establishLegitimateEducationalInterest(
        'advisor-id',
        'student-id',
        'academic_advisor',
        'Mathematics Department',
        'Academic advising and support',
        ['grades', 'enrollment_status'],
        'Student academic progress monitoring',
        'department-head-id',
        new Date('2024-12-31')
      );

      expect(interest).toBeDefined();
      expect(interest.userId).toBe('advisor-id');
      expect(interest.role).toBe('academic_advisor');
      expect(interest.department).toBe('Mathematics Department');
      expect(interest.justification).toBe('Academic advising and support');
      expect(interest.dataTypes).toEqual(['grades', 'enrollment_status']);
      expect(interest.purpose).toBe('Student academic progress monitoring');
      expect(interest.approvedBy).toBe('department-head-id');
      expect(interest.active).toBe(true);
      expect(interest.expiresAt).toEqual(new Date('2024-12-31'));

      expect(mockSupabase.insert).toHaveBeenCalledWith({
        student_id: 'student-id',
        advisor_id: 'advisor-id',
        advisor_type: 'educational_interest',
        assigned_at: expect.any(String),
        active: true
      });
    });

    it('should handle database errors when establishing interest', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.establishLegitimateEducationalInterest(
          'advisor-id',
          'student-id',
          'advisor',
          'dept',
          'justification',
          ['data'],
          'purpose',
          'approver'
        )
      ).rejects.toThrow('Failed to establish legitimate educational interest: Database error');
    });
  });

  describe('recordDisclosure', () => {
    it('should record FERPA disclosure', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const disclosure = await service.recordDisclosure(
        'student-id',
        'external-party@example.com',
        'registrar-id',
        ['transcript', 'enrollment_verification'],
        'Employment verification',
        'consent',
        true,
        { requestId: 'req-123', verificationMethod: 'email' }
      );

      expect(disclosure).toBeDefined();
      expect(disclosure.id).toBe('test-uuid');
      expect(disclosure.studentId).toBe('student-id');
      expect(disclosure.disclosedTo).toBe('external-party@example.com');
      expect(disclosure.disclosedBy).toBe('registrar-id');
      expect(disclosure.dataTypes).toEqual(['transcript', 'enrollment_verification']);
      expect(disclosure.purpose).toBe('Employment verification');
      expect(disclosure.legalBasis).toBe('consent');
      expect(disclosure.consentObtained).toBe(true);
      expect(disclosure.metadata).toEqual({ requestId: 'req-123', verificationMethod: 'email' });

      expect(mockSupabase.insert).toHaveBeenCalledWith({
        student_id: 'student-id',
        accessed_by: 'registrar-id',
        access_type: 'disclosure',
        data_accessed: ['transcript', 'enrollment_verification'],
        purpose: 'Employment verification',
        legitimate_interest: false,
        consent_obtained: true,
        timestamp: expect.any(String),
        metadata: expect.objectContaining({
          disclosedTo: 'external-party@example.com',
          legalBasis: 'consent',
          disclosureId: 'test-uuid'
        })
      });
    });

    it('should record disclosure based on legitimate interest', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const disclosure = await service.recordDisclosure(
        'student-id',
        'advisor@university.edu',
        'advisor-id',
        ['grades', 'attendance'],
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

    it('should handle database errors when recording disclosure', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.recordDisclosure(
          'student-id',
          'party',
          'user-id',
          ['data'],
          'purpose',
          'consent'
        )
      ).rejects.toThrow('Failed to record disclosure: Database error');
    });
  });

  describe('verifyLegitimateEducationalInterest', () => {
    it('should authorize based on advisor relationship', async () => {
      mockSupabase.select.mockResolvedValue({
        data: {
          student_id: 'student-id',
          advisor_id: 'advisor-id',
          active: true
        },
        error: null
      });

      const result = await service.verifyLegitimateEducationalInterest(
        'advisor-id',
        'student-id',
        ['grades'],
        'Academic advising'
      );

      expect(result.authorized).toBe(true);
      expect(result.reason).toBe('Authorized based on established advisor relationship');
    });

    it('should authorize based on institutional role', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // No advisor relation
        .mockResolvedValueOnce({
          data: { role: 'registrar', department_id: 'dept-1' },
          error: null
        });

      const result = await service.verifyLegitimateEducationalInterest(
        'registrar-id',
        'student-id',
        ['transcript'],
        'Transcript request'
      );

      expect(result.authorized).toBe(true);
      expect(result.reason).toBe('Authorized based on institutional role: registrar');
      expect(result.restrictions).toBeDefined();
    });

    it('should deny access for unauthorized roles', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { role: 'student', department_id: 'dept-1' },
          error: null
        });

      const result = await service.verifyLegitimateEducationalInterest(
        'student-id',
        'other-student-id',
        ['grades'],
        'Curiosity'
      );

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('User role does not have legitimate educational interest');
    });

    it('should deny access for non-existent users', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: null, error: null });

      const result = await service.verifyLegitimateEducationalInterest(
        'non-existent-id',
        'student-id',
        ['grades'],
        'Purpose'
      );

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('User not found');
    });

    it('should handle database errors', async () => {
      mockSupabase.select.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.verifyLegitimateEducationalInterest(
          'user-id',
          'student-id',
          ['data'],
          'purpose'
        )
      ).rejects.toThrow('Failed to verify legitimate interest: Database error');
    });
  });

  describe('generateFERPAComplianceReport', () => {
    beforeEach(() => {
      // Mock students data
      mockSupabase.select
        .mockResolvedValueOnce({
          data: [
            { id: 'student-1' },
            { id: 'student-2' },
            { id: 'student-3' }
          ],
          error: null
        });
    });

    it('should generate comprehensive FERPA compliance report', async () => {
      // Mock disclosures data
      mockSupabase.select
        .mockResolvedValueOnce({
          data: [
            { student_id: 'student-1', legitimate_interest: true, consent_obtained: false },
            { student_id: 'student-2', legitimate_interest: false, consent_obtained: true },
            { student_id: 'student-3', legitimate_interest: false, consent_obtained: false }
          ],
          error: null
        })
        // Mock opt-outs data
        .mockResolvedValueOnce({
          data: [
            { student_id: 'student-1' }
          ],
          error: null
        })
        // Mock consent requests data
        .mockResolvedValueOnce({
          data: [
            { student_id: 'student-2' },
            { student_id: 'student-3' }
          ],
          error: null
        });

      const report = await service.generateFERPAComplianceReport(
        'institution-id',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report).toBeDefined();
      expect(report.summary.totalStudents).toBe(3);
      expect(report.summary.totalDisclosures).toBe(3);
      expect(report.summary.unauthorizedAccess).toBe(1); // One without legitimate interest or consent
      expect(report.summary.directoryOptOuts).toBe(1);
      expect(report.summary.consentRequests).toBe(2);
      expect(report.summary.complianceScore).toBe(67); // (3-1)/3 * 100 = 66.67, rounded to 67
      expect(report.details).toBeDefined();
    });

    it('should handle perfect compliance score', async () => {
      // Mock all authorized disclosures
      mockSupabase.select
        .mockResolvedValueOnce({
          data: [
            { student_id: 'student-1', legitimate_interest: true, consent_obtained: false },
            { student_id: 'student-2', legitimate_interest: false, consent_obtained: true }
          ],
          error: null
        })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const report = await service.generateFERPAComplianceReport(
        'institution-id',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report.summary.complianceScore).toBe(100);
      expect(report.summary.unauthorizedAccess).toBe(0);
    });

    it('should handle no disclosures scenario', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const report = await service.generateFERPAComplianceReport(
        'institution-id',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report.summary.complianceScore).toBe(100);
      expect(report.summary.totalDisclosures).toBe(0);
      expect(report.summary.unauthorizedAccess).toBe(0);
    });
  });

  describe('data classification helpers', () => {
    it('should identify directory information correctly', () => {
      const service = new FERPAComplianceService();
      
      expect((service as any).isDirectoryInformation(['name', 'email', 'major_field'])).toBe(true);
      expect((service as any).isDirectoryInformation(['name', 'grades'])).toBe(false);
      expect((service as any).isDirectoryInformation(['social_security_number'])).toBe(false);
    });

    it('should identify public information correctly', () => {
      const service = new FERPAComplianceService();
      
      expect((service as any).isPublicInformation(['graduation_status', 'degree_awarded'])).toBe(true);
      expect((service as any).isPublicInformation(['graduation_status', 'grades'])).toBe(false);
    });

    it('should identify restricted information correctly', () => {
      const service = new FERPAComplianceService();
      
      expect((service as any).isRestrictedInformation(['social_security_number'])).toBe(true);
      expect((service as any).isRestrictedInformation(['disciplinary_records'])).toBe(true);
      expect((service as any).isRestrictedInformation(['name', 'email'])).toBe(false);
    });
  });

  describe('access restrictions', () => {
    it('should determine appropriate access restrictions', () => {
      const service = new FERPAComplianceService();
      
      const restrictions1 = (service as any).determineAccessRestrictions(
        'department_admin',
        ['financial_aid_records'],
        'review'
      );
      expect(restrictions1).toContain('Financial aid records require registrar approval');

      const restrictions2 = (service as any).determineAccessRestrictions(
        'teacher',
        ['disciplinary_records'],
        'grading'
      );
      expect(restrictions2).toContain('Disciplinary records access limited to disciplinary purposes');

      const restrictions3 = (service as any).determineAccessRestrictions(
        'registrar',
        ['transcript'],
        'official_request'
      );
      expect(restrictions3).toHaveLength(0);
    });
  });

  describe('directory information management', () => {
    it('should get default directory information settings', async () => {
      mockSupabase.select.mockResolvedValue({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      const service = new FERPAComplianceService();
      const directoryInfo = await (service as any).getDirectoryInformation('student-id');

      expect(directoryInfo).toBeDefined();
      expect(directoryInfo.studentId).toBe('student-id');
      expect(directoryInfo.name).toBe(true);
      expect(directoryInfo.email).toBe(true);
      expect(directoryInfo.address).toBe(false);
      expect(directoryInfo.majorField).toBe(true);
    });

    it('should get existing directory information settings', async () => {
      mockSupabase.select.mockResolvedValue({
        data: {
          settings: {
            directoryInformation: {
              name: false,
              email: false,
              optOutDate: '2024-01-01T00:00:00Z',
              optOutReason: 'Privacy'
            }
          }
        },
        error: null
      });

      const service = new FERPAComplianceService();
      const directoryInfo = await (service as any).getDirectoryInformation('student-id');

      expect(directoryInfo.name).toBe(false);
      expect(directoryInfo.email).toBe(false);
      expect(directoryInfo.optOutDate).toEqual(new Date('2024-01-01T00:00:00Z'));
      expect(directoryInfo.optOutReason).toBe('Privacy');
    });

    it('should handle database errors when getting directory information', async () => {
      mockSupabase.select.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      const service = new FERPAComplianceService();
      
      await expect(
        (service as any).getDirectoryInformation('student-id')
      ).rejects.toThrow('Failed to get directory information: Database error');
    });
  });
});