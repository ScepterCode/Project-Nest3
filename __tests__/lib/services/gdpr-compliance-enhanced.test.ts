import { GDPRComplianceService } from '@/lib/services/gdpr-compliance';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

// Mock ComplianceManager
jest.mock('@/lib/services/compliance-manager', () => ({
  ComplianceManager: class {
    logDataAccess = jest.fn().mockResolvedValue(undefined);
    getStudentPersonalInfo = jest.fn().mockResolvedValue({
      id: 'student-id',
      email: 'student@example.com',
      full_name: 'Test Student'
    });
    getStudentEnrollmentHistory = jest.fn().mockResolvedValue([]);
    getStudentGrades = jest.fn().mockResolvedValue([]);
    getStudentAuditTrail = jest.fn().mockResolvedValue([]);
    getStudentConsents = jest.fn().mockResolvedValue([]);
    getStudentPrivacySettings = jest.fn().mockResolvedValue({});
  }
}));

// Mock crypto for Node.js environment
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid',
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
      importKey: jest.fn().mockResolvedValue({}),
      encrypt: jest.fn().mockResolvedValue(new ArrayBuffer(16))
    }
  }
});

// Mock btoa for Node.js environment
global.btoa = jest.fn().mockImplementation((str) => Buffer.from(str, 'binary').toString('base64'));

describe('GDPRComplianceService - Enhanced Features', () => {
  let service: GDPRComplianceService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new GDPRComplianceService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeDataErasure', () => {
    beforeEach(() => {
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: 'transaction-id', error: null }) // begin_transaction
        .mockResolvedValueOnce({ data: null, error: null }); // commit_transaction
    });

    it('should execute personal information erasure', async () => {
      mockSupabase.update.mockResolvedValue({ data: [{}], error: null });

      const result = await service.executeDataErasure(
        'student-id',
        ['personal_info'],
        'admin-id',
        true
      );

      expect(result).toBeDefined();
      expect(result.erasureId).toBe('test-uuid');
      expect(result.deletedRecords.personal_info).toBe(1);
      expect(result.verificationHash).toBeDefined();
      expect(mockSupabase.update).toHaveBeenCalledWith({
        email: 'deleted_student-id@example.com',
        full_name: 'DELETED USER',
        phone: null,
        address: null,
        date_of_birth: null,
        emergency_contact: null,
        updated_at: expect.any(String)
      });
    });

    it('should execute enrollment data erasure with retention', async () => {
      // Mock active enrollments that should be retained
      mockSupabase.select
        .mockResolvedValueOnce({
          data: [{ id: 'enrollment-1', status: 'enrolled' }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [{ id: 'enrollment-2' }],
          error: null
        });

      mockSupabase.delete.mockResolvedValue({ 
        data: [{ id: 'enrollment-2' }], 
        error: null 
      });

      const result = await service.executeDataErasure(
        'student-id',
        ['enrollment_data'],
        'admin-id',
        false
      );

      expect(result.deletedRecords.enrollment_data).toBe(1);
      expect(result.retainedRecords.enrollment_data).toContain(
        '1 active enrollment records retained for educational purposes'
      );
    });

    it('should execute grade data erasure with transcript retention', async () => {
      // Mock final grades that should be retained
      mockSupabase.select
        .mockResolvedValueOnce({
          data: [{ id: 'grade-1', final_grade: true }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [{ id: 'grade-2' }],
          error: null
        });

      mockSupabase.delete.mockResolvedValue({ 
        data: [{ id: 'grade-2' }], 
        error: null 
      });

      const result = await service.executeDataErasure(
        'student-id',
        ['grades'],
        'admin-id',
        false
      );

      expect(result.deletedRecords.grades).toBe(1);
      expect(result.retainedRecords.grades).toContain(
        '1 final grades retained for transcript purposes'
      );
    });

    it('should execute communication data erasure', async () => {
      mockSupabase.delete.mockResolvedValue({ 
        data: [{ id: 'comm-1' }, { id: 'comm-2' }], 
        error: null 
      });

      const result = await service.executeDataErasure(
        'student-id',
        ['communications'],
        'admin-id',
        false
      );

      expect(result.deletedRecords.communications).toBe(2);
    });

    it('should execute all data erasure', async () => {
      // Mock all the database calls for complete erasure
      mockSupabase.update.mockResolvedValue({ data: [{}], error: null });
      mockSupabase.select
        .mockResolvedValueOnce({ data: [{ id: 'enrollment-1' }], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [{ id: 'grade-1' }], error: null })
        .mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.delete
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [{ id: 'comm-1' }], error: null });

      const result = await service.executeDataErasure(
        'student-id',
        ['all'],
        'admin-id',
        true
      );

      expect(result.deletedRecords.personal_info).toBe(1);
      expect(result.deletedRecords.enrollment_data).toBe(0);
      expect(result.deletedRecords.grades).toBe(0);
      expect(result.deletedRecords.communications).toBe(1);
      expect(result.retainedRecords.audit_logs).toContain(
        'Retained for legal compliance and regulatory requirements'
      );
    });

    it('should handle transaction rollback on error', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: 'transaction-id', error: null }) // begin_transaction
        .mockResolvedValueOnce({ data: null, error: null }); // rollback_transaction

      mockSupabase.update.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.executeDataErasure('student-id', ['personal_info'], 'admin-id')
      ).rejects.toThrow('Data erasure failed: Failed to erase personal information: Database error');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('rollback_transaction');
    });

    it('should generate verification hash when required', async () => {
      mockSupabase.update.mockResolvedValue({ data: [{}], error: null });

      const result = await service.executeDataErasure(
        'student-id',
        ['personal_info'],
        'admin-id',
        true
      );

      expect(result.verificationHash).toBeDefined();
      expect(result.verificationHash).toHaveLength(64); // SHA-256 hex string
    });
  });

  describe('generateEncryptedDataExport', () => {
    it('should generate encrypted data export', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const result = await service.generateEncryptedDataExport(
        'student-id',
        'admin-id',
        'json'
      );

      expect(result).toBeDefined();
      expect(result.exportId).toBe('test-uuid');
      expect(result.encryptedData).toBeDefined();
      expect(result.encryptionKey).toBeDefined();
      expect(result.encryptionKey).toHaveLength(64); // 256-bit key as hex
      expect(result.downloadUrl).toContain(result.exportId);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should use provided encryption key', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });
      const customKey = 'a'.repeat(64);

      const result = await service.generateEncryptedDataExport(
        'student-id',
        'admin-id',
        'json',
        customKey
      );

      expect(result.encryptionKey).toBe(customKey);
    });

    it('should support different export formats', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const jsonResult = await service.generateEncryptedDataExport(
        'student-id',
        'admin-id',
        'json'
      );

      const csvResult = await service.generateEncryptedDataExport(
        'student-id',
        'admin-id',
        'csv'
      );

      const pdfResult = await service.generateEncryptedDataExport(
        'student-id',
        'admin-id',
        'pdf'
      );

      expect(jsonResult.encryptedData).toBeDefined();
      expect(csvResult.encryptedData).toBeDefined();
      expect(pdfResult.encryptedData).toBeDefined();
    });

    it('should handle database errors when storing export', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.generateEncryptedDataExport('student-id', 'admin-id')
      ).rejects.toThrow('Failed to store encrypted export: Database error');
    });
  });

  describe('data format conversion', () => {
    it('should convert data to CSV format', async () => {
      const service = new GDPRComplianceService();
      const testData = { name: 'John Doe', email: 'john@example.com' };
      
      const csvData = await (service as any).convertToCSV(testData);
      
      expect(csvData).toContain('name,email');
      expect(csvData).toContain('"John Doe","john@example.com"');
    });

    it('should convert data to PDF format', async () => {
      const service = new GDPRComplianceService();
      const testData = { name: 'John Doe', email: 'john@example.com' };
      
      const pdfData = await (service as any).convertToPDF(testData);
      
      expect(pdfData).toContain('John Doe');
      expect(pdfData).toContain('john@example.com');
    });
  });

  describe('encryption and security', () => {
    it('should generate secure encryption key', () => {
      const service = new GDPRComplianceService();
      const key = (service as any).generateEncryptionKey();
      
      expect(key).toHaveLength(64); // 256-bit key as hex string
      expect(key).toMatch(/^[0-9a-f]+$/); // Only hex characters
    });

    it('should encrypt data with AES-GCM', async () => {
      const service = new GDPRComplianceService();
      const testData = 'sensitive data';
      const key = 'a'.repeat(64);
      
      const encrypted = await (service as any).encryptData(testData, key);
      
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(testData);
      expect(typeof encrypted).toBe('string');
    });

    it('should hash encryption keys for storage', async () => {
      const service = new GDPRComplianceService();
      const key = 'test-key';
      
      const hash = await (service as any).hashKey(key);
      
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 hex string
      expect(hash).not.toBe(key);
    });
  });

  describe('verification and integrity', () => {
    it('should generate erasure verification hash', async () => {
      const service = new GDPRComplianceService();
      const deletedRecords = { personal_info: 1, grades: 2 };
      const retainedRecords = { audit_logs: ['Retained for compliance'] };
      
      const hash = await (service as any).generateErasureVerificationHash(
        'student-id',
        deletedRecords,
        retainedRecords
      );
      
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 hex string
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate different hashes for different data', async () => {
      const service = new GDPRComplianceService();
      
      const hash1 = await (service as any).generateErasureVerificationHash(
        'student-1',
        { personal_info: 1 },
        {}
      );
      
      const hash2 = await (service as any).generateErasureVerificationHash(
        'student-2',
        { personal_info: 1 },
        {}
      );
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('error handling', () => {
    it('should handle database errors in personal info erasure', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: 'transaction-id', error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockSupabase.update.mockResolvedValue({ 
        error: { message: 'Update failed' } 
      });

      await expect(
        service.executeDataErasure('student-id', ['personal_info'], 'admin-id')
      ).rejects.toThrow('Data erasure failed: Failed to erase personal information: Update failed');
    });

    it('should handle database errors in enrollment erasure', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: 'transaction-id', error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockSupabase.select.mockResolvedValue({ data: [], error: null });
      mockSupabase.delete.mockResolvedValue({ 
        error: { message: 'Delete failed' } 
      });

      await expect(
        service.executeDataErasure('student-id', ['enrollment_data'], 'admin-id')
      ).rejects.toThrow('Data erasure failed: Failed to erase enrollment data: Delete failed');
    });

    it('should handle database errors in grade erasure', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: 'transaction-id', error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockSupabase.select.mockResolvedValue({ data: [], error: null });
      mockSupabase.delete.mockResolvedValue({ 
        error: { message: 'Grade delete failed' } 
      });

      await expect(
        service.executeDataErasure('student-id', ['grades'], 'admin-id')
      ).rejects.toThrow('Data erasure failed: Failed to erase grade data: Grade delete failed');
    });

    it('should handle database errors in communication erasure', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: 'transaction-id', error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockSupabase.delete.mockResolvedValue({ 
        error: { message: 'Communication delete failed' } 
      });

      await expect(
        service.executeDataErasure('student-id', ['communications'], 'admin-id')
      ).rejects.toThrow('Data erasure failed: Failed to erase communication data: Communication delete failed');
    });
  });

  describe('data collection and processing', () => {
    it('should collect all personal data for export', async () => {
      const service = new GDPRComplianceService();
      
      const data = await (service as any).collectAllPersonalData('student-id');
      
      expect(data).toBeDefined();
      expect(data.profile).toBeDefined();
      expect(data.enrollments).toBeDefined();
      expect(data.grades).toBeDefined();
      expect(data.communications).toBeDefined();
      expect(data.preferences).toBeDefined();
    });

    it('should collect portable data separately', async () => {
      const service = new GDPRComplianceService();
      
      const data = await (service as any).collectPortableData('student-id');
      
      expect(data).toBeDefined();
      expect(data.userProvidedData).toBeDefined();
      expect(data.generatedData).toBeDefined();
    });
  });
});