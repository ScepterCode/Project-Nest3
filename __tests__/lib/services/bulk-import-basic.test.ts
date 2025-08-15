import { EnhancedBulkUserImportService } from '@/lib/services/enhanced-bulk-user-import';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        limit: jest.fn()
      })),
      in: jest.fn(),
      order: jest.fn()
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn()
    })),
    delete: jest.fn(() => ({
      in: jest.fn()
    }))
  }))
};

// Mock the createClient function
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

// Mock notification service
jest.mock('@/lib/services/notification-service', () => ({
  NotificationService: jest.fn(() => ({
    sendImportNotification: jest.fn(),
    sendWelcomeEmail: jest.fn()
  }))
}));

// Mock audit logger
jest.mock('@/lib/services/audit-logger', () => ({
  AuditLogger: jest.fn(() => ({
    log: jest.fn()
  }))
}));

describe('EnhancedBulkUserImportService - Basic Tests', () => {
  let service: EnhancedBulkUserImportService;
  
  beforeEach(() => {
    service = new EnhancedBulkUserImportService();
    jest.clearAllMocks();
  });

  describe('getImportTemplate', () => {
    it('should return a valid import template', () => {
      const template = service.getImportTemplate();
      
      expect(template).toHaveProperty('requiredFields');
      expect(template).toHaveProperty('optionalFields');
      expect(template).toHaveProperty('fieldDescriptions');
      expect(template).toHaveProperty('fieldValidation');
      expect(template).toHaveProperty('sampleData');
      
      expect(template.requiredFields).toContain('email');
      expect(template.requiredFields).toContain('firstName');
      expect(template.requiredFields).toContain('lastName');
      
      expect(template.sampleData).toHaveLength(2);
      expect(template.sampleData[0]).toHaveProperty('email');
      expect(template.sampleData[0]).toHaveProperty('firstName');
      expect(template.sampleData[0]).toHaveProperty('lastName');
    });
  });

  describe('generateCSVTemplate', () => {
    it('should generate a valid CSV template', () => {
      const csvTemplate = service.generateCSVTemplate();
      
      expect(csvTemplate).toContain('email,firstName,lastName');
      expect(csvTemplate).toContain('john.doe@example.com');
      expect(csvTemplate).toContain('jane.smith@example.com');
      
      const lines = csvTemplate.split('\n');
      expect(lines.length).toBeGreaterThan(2); // Header + sample data
    });
  });

  describe('parseFile', () => {
    it('should parse CSV content correctly', async () => {
      const csvContent = `email,firstName,lastName,role
john.doe@example.com,John,Doe,student
jane.smith@example.com,Jane,Smith,teacher`;

      const result = await service.parseFile(csvContent, 'test.csv', 'csv');
      
      expect(result.errors).toHaveLength(0);
      expect(result.headers).toEqual(['email', 'firstName', 'lastName', 'role']);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'student'
      });
    });

    it('should handle CSV parsing errors', async () => {
      const invalidCsvContent = '';

      const result = await service.parseFile(invalidCsvContent, 'test.csv', 'csv');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EMPTY_FILE');
    });

    it('should parse JSON content correctly', async () => {
      const jsonContent = JSON.stringify([
        {
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'student'
        }
      ]);

      const result = await service.parseFile(jsonContent, 'test.json', 'json');
      
      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'student'
      });
    });

    it('should handle unsupported file formats', async () => {
      const result = await service.parseFile('content', 'test.txt', 'txt' as any);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('UNSUPPORTED_FORMAT');
    });
  });

  describe('validateImportData', () => {
    const mockInstitutionId = 'test-institution-id';
    
    beforeEach(() => {
      // Mock existing users and departments
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({
                data: [
                  { email: 'existing@example.com', student_id: 'EXISTING001' }
                ]
              }))
            }))
          };
        } else if (table === 'departments') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({
                data: [
                  { name: 'Computer Science' },
                  { name: 'Mathematics' }
                ]
              }))
            }))
          };
        }
        return mockSupabase.from();
      });
    });

    it('should validate required fields', async () => {
      const testData = [
        {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe'
        },
        {
          email: 'incomplete@example.com',
          firstName: '',
          lastName: 'Smith'
        }
      ];

      const result = await service.validateImportData(mockInstitutionId, testData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD_MISSING');
      expect(result.errors[0].fieldName).toBe('firstName');
    });

    it('should validate email formats', async () => {
      const testData = [
        {
          email: 'invalid-email',
          firstName: 'John',
          lastName: 'Doe'
        }
      ];

      const result = await service.validateImportData(mockInstitutionId, testData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_EMAIL_FORMAT');
    });

    it('should detect duplicate emails in import data', async () => {
      const testData = [
        {
          email: 'duplicate@example.com',
          firstName: 'John',
          lastName: 'Doe'
        },
        {
          email: 'duplicate@example.com',
          firstName: 'Jane',
          lastName: 'Smith'
        }
      ];

      const result = await service.validateImportData(mockInstitutionId, testData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('DUPLICATE_EMAIL');
    });
  });

  describe('getImportStatus', () => {
    it('should return null for non-existent import', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({
              data: null
            }))
          }))
        }))
      }));

      const status = await service.getImportStatus('non-existent-id');
      
      expect(status).toBeNull();
    });
  });

  describe('performance tests', () => {
    it('should handle large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: 'Test'
      }));

      const startTime = Date.now();
      const result = await service.validateImportData('test-institution', largeDataset);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.summary.totalRecords).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('should handle empty files', async () => {
      const result = await service.parseFile('', 'empty.csv', 'csv');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EMPTY_FILE');
    });

    it('should handle files with only headers', async () => {
      const csvWithOnlyHeaders = 'email,firstName,lastName';
      
      const result = await service.parseFile(csvWithOnlyHeaders, 'headers-only.csv', 'csv');
      
      expect(result.data).toHaveLength(0);
      expect(result.headers).toEqual(['email', 'firstName', 'lastName']);
    });

    it('should handle special characters in data', async () => {
      const csvWithSpecialChars = `email,firstName,lastName
"test@example.com","José María","O'Connor"
"unicode@example.com","测试","用户"`;

      const result = await service.parseFile(csvWithSpecialChars, 'special.csv', 'csv');
      
      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].firstName).toBe('José María');
      expect(result.data[0].lastName).toBe("O'Connor");
      expect(result.data[1].firstName).toBe('测试');
    });
  });
});