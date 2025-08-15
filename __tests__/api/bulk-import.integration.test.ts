import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as bulkImportPOST, GET as bulkImportGET } from '@/app/api/bulk-import/route';
import { POST as validatePOST } from '@/app/api/bulk-import/validate/route';
import { GET as templateGET } from '@/app/api/bulk-import/template/route';
import { GET as statusGET } from '@/app/api/bulk-import/status/[importId]/route';
import { POST as rollbackPOST } from '@/app/api/bulk-import/rollback/route';

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: vi.fn()
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(),
        limit: vi.fn()
      })),
      in: vi.fn(),
      order: vi.fn()
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn()
      }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn()
    })),
    delete: vi.fn(() => ({
      in: vi.fn()
    }))
  }))
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

// Mock the bulk import service
vi.mock('@/lib/services/enhanced-bulk-user-import', () => ({
  EnhancedBulkUserImportService: vi.fn(() => ({
    processImport: vi.fn(),
    parseFile: vi.fn(),
    validateImportData: vi.fn(),
    getImportTemplate: vi.fn(),
    generateCSVTemplate: vi.fn(),
    getImportStatus: vi.fn(),
    rollbackImport: vi.fn(),
    getImportHistory: vi.fn()
  }))
}));

describe('Bulk Import API Integration Tests', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com'
  };

  const mockUserProfile = {
    user_id: 'test-user-id',
    institution_id: 'test-institution-id',
    role: 'institution_admin',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default auth mock
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Default user profile mock
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockUserProfile,
                error: null
              }))
            }))
          }))
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: null })),
            limit: vi.fn(() => ({ data: [], error: null }))
          })),
          order: vi.fn(() => ({
            limit: vi.fn(() => ({ data: [], error: null }))
          }))
        }))
      };
    });
  });

  describe('POST /api/bulk-import', () => {
    it('should process a bulk import successfully', async () => {
      const mockFile = new File(['email,firstName,lastName\ntest@example.com,Test,User'], 'test.csv', {
        type: 'text/csv'
      });

      const formData = new FormData();
      formData.append('file', mockFile);
      formData.append('options', JSON.stringify({
        institutionId: 'test-institution-id',
        sendWelcomeEmails: true,
        dryRun: false,
        batchSize: 100
      }));

      const request = new NextRequest('http://localhost/api/bulk-import', {
        method: 'POST',
        body: formData
      });

      // Mock successful import
      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.processImport as any).mockResolvedValue({
        importId: 'test-import-id',
        totalRecords: 1,
        successfulImports: 1,
        failedImports: 0,
        skippedImports: 0,
        errors: [],
        warnings: [],
        summary: { totalRecords: 1, validRecords: 1 },
        duration: 1000
      });

      const response = await bulkImportPOST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.importId).toBe('test-import-id');
      expect(result.successfulImports).toBe(1);
    });

    it('should reject unauthorized requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Unauthorized')
      });

      const formData = new FormData();
      const request = new NextRequest('http://localhost/api/bulk-import', {
        method: 'POST',
        body: formData
      });

      const response = await bulkImportPOST(request);
      
      expect(response.status).toBe(401);
    });

    it('should reject users without proper permissions', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: { ...mockUserProfile, role: 'student' },
                  error: null
                }))
              }))
            }))
          };
        }
        return mockSupabase.from();
      });

      const formData = new FormData();
      formData.append('file', new File(['test'], 'test.csv'));
      formData.append('options', '{}');

      const request = new NextRequest('http://localhost/api/bulk-import', {
        method: 'POST',
        body: formData
      });

      const response = await bulkImportPOST(request);
      
      expect(response.status).toBe(403);
    });

    it('should handle missing file', async () => {
      const formData = new FormData();
      formData.append('options', '{}');

      const request = new NextRequest('http://localhost/api/bulk-import', {
        method: 'POST',
        body: formData
      });

      const response = await bulkImportPOST(request);
      
      expect(response.status).toBe(400);
    });

    it('should handle invalid options format', async () => {
      const formData = new FormData();
      formData.append('file', new File(['test'], 'test.csv'));
      formData.append('options', 'invalid-json');

      const request = new NextRequest('http://localhost/api/bulk-import', {
        method: 'POST',
        body: formData
      });

      const response = await bulkImportPOST(request);
      
      expect(response.status).toBe(400);
    });

    it('should handle unsupported file formats', async () => {
      const formData = new FormData();
      formData.append('file', new File(['test'], 'test.txt'));
      formData.append('options', '{}');

      const request = new NextRequest('http://localhost/api/bulk-import', {
        method: 'POST',
        body: formData
      });

      const response = await bulkImportPOST(request);
      
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/bulk-import', () => {
    it('should return import history', async () => {
      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.getImportHistory as any).mockResolvedValue([
        {
          id: 'import-1',
          fileName: 'test.csv',
          status: 'completed',
          totalRecords: 10,
          successfulRecords: 9,
          failedRecords: 1
        }
      ]);

      const request = new NextRequest('http://localhost/api/bulk-import');
      const response = await bulkImportGET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].id).toBe('import-1');
    });
  });

  describe('POST /api/bulk-import/validate', () => {
    it('should validate file successfully', async () => {
      const mockFile = new File(['email,firstName,lastName\ntest@example.com,Test,User'], 'test.csv', {
        type: 'text/csv'
      });

      const formData = new FormData();
      formData.append('file', mockFile);

      const request = new NextRequest('http://localhost/api/bulk-import/validate', {
        method: 'POST',
        body: formData
      });

      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.parseFile as any).mockResolvedValue({
        headers: ['email', 'firstName', 'lastName'],
        data: [{ email: 'test@example.com', firstName: 'Test', lastName: 'User' }],
        errors: [],
        warnings: []
      });
      (mockService.validateImportData as any).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        summary: { totalRecords: 1, validRecords: 1 }
      });

      const response = await validatePOST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.validationResult.isValid).toBe(true);
    });

    it('should handle validation errors', async () => {
      const mockFile = new File(['invalid content'], 'test.csv', {
        type: 'text/csv'
      });

      const formData = new FormData();
      formData.append('file', mockFile);

      const request = new NextRequest('http://localhost/api/bulk-import/validate', {
        method: 'POST',
        body: formData
      });

      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.parseFile as any).mockResolvedValue({
        headers: [],
        data: [],
        errors: [{ code: 'PARSE_ERROR', errorMessage: 'Failed to parse file' }],
        warnings: []
      });

      const response = await validatePOST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(false);
      expect(result.parseResult.errors).toHaveLength(1);
    });
  });

  describe('GET /api/bulk-import/template', () => {
    it('should generate CSV template', async () => {
      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.generateCSVTemplate as any).mockReturnValue('email,firstName,lastName\ntest@example.com,Test,User');

      const request = new NextRequest('http://localhost/api/bulk-import/template?format=csv');
      const response = await templateGET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/csv');
      expect(response.headers.get('Content-Disposition')).toContain('user-import-template.csv');
    });

    it('should generate JSON template', async () => {
      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.getImportTemplate as any).mockReturnValue({
        requiredFields: ['email', 'firstName', 'lastName'],
        optionalFields: ['role'],
        fieldDescriptions: {},
        sampleData: []
      });

      const request = new NextRequest('http://localhost/api/bulk-import/template?format=json');
      const response = await templateGET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Content-Disposition')).toContain('user-import-template.json');
    });

    it('should handle invalid format', async () => {
      const request = new NextRequest('http://localhost/api/bulk-import/template?format=invalid');
      const response = await templateGET(request);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/bulk-import/status/[importId]', () => {
    it('should return import status', async () => {
      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.getImportStatus as any).mockResolvedValue({
        importId: 'test-import-id',
        status: 'processing',
        progress: {
          currentStep: 50,
          totalSteps: 100,
          progressPercentage: 50,
          statusMessage: 'Processing...',
          stage: 'import'
        },
        startedAt: new Date(),
        currentStage: 'import'
      });

      // Mock import record access check
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'bulk_imports') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: {
                    id: 'test-import-id',
                    institution_id: 'test-institution-id'
                  },
                  error: null
                }))
              }))
            }))
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest('http://localhost/api/bulk-import/status/test-import-id');
      const response = await statusGET(request, { params: { importId: 'test-import-id' } });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.importId).toBe('test-import-id');
      expect(result.status).toBe('processing');
    });

    it('should handle non-existent import', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: null,
              error: new Error('Not found')
            }))
          }))
        }))
      }));

      const request = new NextRequest('http://localhost/api/bulk-import/status/non-existent');
      const response = await statusGET(request, { params: { importId: 'non-existent' } });

      expect(response.status).toBe(404);
    });

    it('should handle access denied', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'bulk_imports') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: {
                    id: 'test-import-id',
                    institution_id: 'different-institution-id'
                  },
                  error: null
                }))
              }))
            }))
          };
        } else if (table === 'user_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: {
                    ...mockUserProfile,
                    institution_id: 'test-institution-id'
                  },
                  error: null
                }))
              }))
            }))
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest('http://localhost/api/bulk-import/status/test-import-id');
      const response = await statusGET(request, { params: { importId: 'test-import-id' } });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/bulk-import/rollback', () => {
    it('should rollback import successfully', async () => {
      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.rollbackImport as any).mockResolvedValue({
        success: true,
        recordsRolledBack: 5,
        errors: [],
        warnings: [],
        duration: 1000,
        snapshotId: 'test-snapshot-id'
      });

      // Mock snapshot access check
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'migration_snapshots') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: {
                    id: 'test-snapshot-id',
                    institution_id: 'test-institution-id'
                  },
                  error: null
                }))
              }))
            }))
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest('http://localhost/api/bulk-import/rollback', {
        method: 'POST',
        body: JSON.stringify({ snapshotId: 'test-snapshot-id' }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await rollbackPOST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.recordsRolledBack).toBe(5);
    });

    it('should handle missing snapshot ID', async () => {
      const request = new NextRequest('http://localhost/api/bulk-import/rollback', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await rollbackPOST(request);

      expect(response.status).toBe(400);
    });

    it('should handle non-existent snapshot', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: null,
              error: new Error('Not found')
            }))
          }))
        }))
      }));

      const request = new NextRequest('http://localhost/api/bulk-import/rollback', {
        method: 'POST',
        body: JSON.stringify({ snapshotId: 'non-existent' }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await rollbackPOST(request);

      expect(response.status).toBe(404);
    });

    it('should reject users without proper permissions', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: { ...mockUserProfile, role: 'student' },
                  error: null
                }))
              }))
            }))
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest('http://localhost/api/bulk-import/rollback', {
        method: 'POST',
        body: JSON.stringify({ snapshotId: 'test-snapshot-id' }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await rollbackPOST(request);

      expect(response.status).toBe(403);
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.processImport as any).mockRejectedValue(new Error('Service error'));

      const formData = new FormData();
      formData.append('file', new File(['test'], 'test.csv'));
      formData.append('options', '{}');

      const request = new NextRequest('http://localhost/api/bulk-import', {
        method: 'POST',
        body: formData
      });

      const response = await bulkImportPOST(request);

      expect(response.status).toBe(500);
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Database error');
      });

      const request = new NextRequest('http://localhost/api/bulk-import');
      const response = await bulkImportGET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('Performance tests', () => {
    it('should handle large file uploads', async () => {
      // Create a large CSV content
      const largeContent = 'email,firstName,lastName\n' + 
        Array.from({ length: 1000 }, (_, i) => `user${i}@example.com,User${i},Test`).join('\n');
      
      const largeFile = new File([largeContent], 'large.csv', { type: 'text/csv' });
      
      const formData = new FormData();
      formData.append('file', largeFile);

      const request = new NextRequest('http://localhost/api/bulk-import/validate', {
        method: 'POST',
        body: formData
      });

      const { EnhancedBulkUserImportService } = await import('@/lib/services/enhanced-bulk-user-import');
      const mockService = new EnhancedBulkUserImportService();
      (mockService.parseFile as any).mockResolvedValue({
        headers: ['email', 'firstName', 'lastName'],
        data: Array.from({ length: 1000 }, (_, i) => ({
          email: `user${i}@example.com`,
          firstName: `User${i}`,
          lastName: 'Test'
        })),
        errors: [],
        warnings: []
      });
      (mockService.validateImportData as any).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        summary: { totalRecords: 1000, validRecords: 1000 }
      });

      const startTime = Date.now();
      const response = await validatePOST(request);
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});