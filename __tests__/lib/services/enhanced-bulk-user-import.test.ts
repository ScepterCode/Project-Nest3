import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EnhancedBulkUserImportService } from '@/lib/services/enhanced-bulk-user-import';
import { BulkImportOptions, FileFormat, UserImportData } from '@/lib/types/bulk-import';

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

describe('EnhancedBulkUserImportService', () => {
  let service: EnhancedBulkUserImportService;
  
  beforeEach(() => {
    service = new EnhancedBulkUserImportService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
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
      const result = await service.parseFile('content', 'test.txt', 'txt' as FileFormat);
      
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
              eq: jest.fn(() => ({
                data: [
                  { email: 'existing@example.com', student_id: 'EXISTING001' }
                ]
              }))
            }))
          };
        } else if (table === 'departments') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
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
      const testData: UserImportData[] = [
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
      const testData: UserImportData[] = [
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
      const testData: UserImportData[] = [
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

    it('should warn about existing emails', async () => {
      const testData: UserImportData[] = [
        {
          email: 'existing@example.com',
          firstName: 'John',
          lastName: 'Doe'
        }
      ];

      const result = await service.validateImportData(mockInstitutionId, testData);
      
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('DUPLICATE_RECORD');
    });

    it('should validate roles', async () => {
      const testData: UserImportData[] = [
        {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'invalid_role'
        }
      ];

      const result = await service.validateImportData(mockInstitutionId, testData);
      
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('UNKNOWN_ROLE');
    });

    it('should validate departments', async () => {
      const testData: UserImportData[] = [
        {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          department: 'Unknown Department'
        }
      ];

      const result = await service.validateImportData(mockInstitutionId, testData);
      
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('DEPARTMENT_MISMATCH');
    });

    it('should provide suggestions for common issues', async () => {
      const testData: UserImportData[] = [
        {
          email: '',
          firstName: '',
          lastName: '',
          role: 'invalid_role'
        }
      ];

      const result = await service.validateImportData(mockInstitutionId, testData);
      
      expect(result.suggestions).toContain('Ensure all required fields (email, firstName, lastName) are filled for each user');
      expect(result.suggestions).toContain('Valid roles are: student, teacher, department_admin, institution_admin');
    });
  });

  describe('processImport', () => {
    const mockOptions: BulkImportOptions = {
      institutionId: 'test-institution',
      sendWelcomeEmails: false,
      dryRun: false,
      batchSize: 2,
      validateOnly: false
    };

    beforeEach(() => {
      // Mock successful import record creation
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'bulk_imports') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: { id: 'test-import-id' },
                  error: null
                }))
              }))
            })),
            update: vi.fn(() => ({
              eq: vi.fn()
            }))
          };
        }
        return mockSupabase.from();
      });
    });

    it('should handle dry run imports', async () => {
      const csvContent = `email,firstName,lastName
john.doe@example.com,John,Doe
jane.smith@example.com,Jane,Smith`;

      const dryRunOptions = { ...mockOptions, dryRun: true };
      
      const result = await service.processImport(
        'test-institution',
        'test-user',
        csvContent,
        'test.csv',
        'csv',
        dryRunOptions
      );

      expect(result.successfulImports).toBe(0);
      expect(result.totalRecords).toBe(2);
    });

    it('should handle validation-only imports', async () => {
      const csvContent = `email,firstName,lastName
john.doe@example.com,John,Doe`;

      const validateOnlyOptions = { ...mockOptions, validateOnly: true };
      
      const result = await service.processImport(
        'test-institution',
        'test-user',
        csvContent,
        'test.csv',
        'csv',
        validateOnlyOptions
      );

      expect(result.successfulImports).toBe(0);
      expect(result.totalRecords).toBe(1);
    });
  });

  describe('getImportStatus', () => {
    it('should return import status', async () => {
      const mockImportData = {
        id: 'test-import-id',
        status: 'processing',
        started_at: new Date().toISOString(),
        completed_at: null
      };

      const mockProgressData = {
        current_step: 50,
        total_steps: 100,
        progress_percentage: 50,
        status_message: 'Processing...',
        stage: 'import'
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'bulk_imports') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: mockImportData
                }))
              }))
            }))
          };
        } else if (table === 'import_progress') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    single: vi.fn(() => ({
                      data: mockProgressData
                    }))
                  }))
                }))
              }))
            }))
          };
        }
        return mockSupabase.from();
      });

      const status = await service.getImportStatus('test-import-id');
      
      expect(status).toBeDefined();
      expect(status?.importId).toBe('test-import-id');
      expect(status?.status).toBe('processing');
      expect(status?.progress.progressPercentage).toBe(50);
    });

    it('should return null for non-existent import', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: null
            }))
          }))
        }))
      }));

      const status = await service.getImportStatus('non-existent-id');
      
      expect(status).toBeNull();
    });
  });

  describe('rollbackImport', () => {
    it('should successfully rollback an import', async () => {
      const mockSnapshot = {
        id: 'test-snapshot-id',
        institution_id: 'test-institution',
        import_id: 'test-import-id',
        imported_records: ['user1', 'user2'],
        is_rolled_back: false
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'migration_snapshots') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: mockSnapshot,
                  error: null
                }))
              }))
            })),
            update: vi.fn(() => ({
              eq: vi.fn()
            }))
          };
        } else if (table === 'user_profiles') {
          return {
            delete: vi.fn(() => ({
              in: vi.fn(() => ({
                error: null
              }))
            }))
          };
        }
        return mockSupabase.from();
      });

      const result = await service.rollbackImport('test-snapshot-id', 'test-user');
      
      expect(result.success).toBe(true);
      expect(result.recordsRolledBack).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle already rolled back snapshots', async () => {
      const mockSnapshot = {
        id: 'test-snapshot-id',
        is_rolled_back: true
      };

      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: mockSnapshot,
              error: null
            }))
          }))
        }))
      }));

      const result = await service.rollbackImport('test-snapshot-id', 'test-user');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('ALREADY_ROLLED_BACK');
    });

    it('should handle non-existent snapshots', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: null,
              error: { message: 'Not found' }
            }))
          }))
        }))
      }));

      const result = await service.rollbackImport('non-existent-id', 'test-user');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('SNAPSHOT_NOT_FOUND');
    });
  });

  describe('performance tests', () => {
    it('should handle large datasets efficiently', async () => {
      const largeDataset: UserImportData[] = Array.from({ length: 1000 }, (_, i) => ({
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: 'Test'
      }));

      const startTime = Date.now();
      const result = await service.validateImportData('test-institution', largeDataset);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.summary.totalRecords).toBe(1000);
    });

    it('should process batches correctly', async () => {
      const testData: UserImportData[] = Array.from({ length: 10 }, (_, i) => ({
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: 'Test'
      }));

      // Test that batch processing works with different batch sizes
      const batchSizes = [1, 3, 5, 10];
      
      for (const batchSize of batchSizes) {
        const chunks = service['chunkArray'](testData, batchSize);
        const expectedChunks = Math.ceil(testData.length / batchSize);
        
        expect(chunks).toHaveLength(expectedChunks);
        
        // Verify all data is included
        const flattenedData = chunks.flat();
        expect(flattenedData).toHaveLength(testData.length);
      }
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(
        service.validateImportData('test-institution', [])
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle malformed CSV data', async () => {
      const malformedCsv = `email,firstName,lastName
"unclosed quote,John,Doe
normal@example.com,Jane,Smith`;

      const result = await service.parseFile(malformedCsv, 'test.csv', 'csv');
      
      // Should handle gracefully and provide meaningful errors
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle malformed JSON data', async () => {
      const malformedJson = '{"email": "test@example.com", "firstName": "John"'; // Missing closing brace

      const result = await service.parseFile(malformedJson, 'test.json', 'json');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PARSE_ERROR');
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

    it('should handle very long field values', async () => {
      const longValue = 'a'.repeat(1000);
      const testData: UserImportData[] = [
        {
          email: 'test@example.com',
          firstName: longValue,
          lastName: 'Doe'
        }
      ];

      const result = await service.validateImportData('test-institution', testData);
      
      expect(result.warnings.some(w => w.code === 'DATA_TRUNCATED')).toBe(true);
    });
  });
});