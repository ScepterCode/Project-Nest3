import { DataImportExportService } from '@/lib/services/data-import-export';
import { IntegrationHealthMonitor } from '@/lib/services/integration-health-monitor';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server');
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        order: jest.fn(() => ({
          single: jest.fn(),
          limit: jest.fn(() => ({
            order: jest.fn(() => ({
              single: jest.fn(),
            })),
          })),
        })),
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({
            order: jest.fn(),
          })),
        })),
      })),
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
    })),
    upsert: jest.fn(),
    delete: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('Data Synchronization Integration Tests', () => {
  let dataService: DataImportExportService;
  let healthMonitor: IntegrationHealthMonitor;

  beforeEach(() => {
    dataService = new DataImportExportService();
    healthMonitor = new IntegrationHealthMonitor();
    jest.clearAllMocks();
  });

  describe('User Data Import', () => {
    const mockUserData = [
      {
        email: 'student1@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'student',
        department: 'Computer Science',
      },
      {
        email: 'teacher1@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'teacher',
        department: 'Mathematics',
      },
    ];

    it('should import users successfully', async () => {
      const institutionId = 'inst-1';

      // Mock user lookup (not found for both users)
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      // Mock user creation
      mockSupabase.from().insert()
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: null });

      // Mock import log
      mockSupabase.from().insert().mockResolvedValueOnce({ error: null });

      const result = await dataService.importUsers(institutionId, mockUserData);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2);
      expect(result.recordsImported).toBe(2);
      expect(result.recordsFailed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle duplicate users with skip option', async () => {
      const institutionId = 'inst-1';

      // Mock user lookup (found for first user)
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ 
          data: { id: 'existing-user-1' }, 
          error: null 
        })
        .mockResolvedValueOnce({ 
          data: null, 
          error: { code: 'PGRST116' } 
        });

      // Mock user creation for second user
      mockSupabase.from().insert().mockResolvedValueOnce({ error: null });

      // Mock import log
      mockSupabase.from().insert().mockResolvedValueOnce({ error: null });

      const result = await dataService.importUsers(
        institutionId, 
        mockUserData, 
        { skipDuplicates: true }
      );

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2);
      expect(result.recordsImported).toBe(1);
      expect(result.recordsSkipped).toBe(1);
      expect(result.recordsFailed).toBe(0);
    });

    it('should update existing users when updateExisting is true', async () => {
      const institutionId = 'inst-1';

      // Mock user lookup (found for both users)
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ 
          data: { id: 'existing-user-1' }, 
          error: null 
        })
        .mockResolvedValueOnce({ 
          data: { id: 'existing-user-2' }, 
          error: null 
        });

      // Mock user updates
      mockSupabase.from().update().eq()
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: null });

      // Mock import log
      mockSupabase.from().insert().mockResolvedValueOnce({ error: null });

      const result = await dataService.importUsers(
        institutionId, 
        mockUserData, 
        { updateExisting: true }
      );

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2);
      expect(result.recordsImported).toBe(2);
      expect(result.recordsSkipped).toBe(0);
      expect(result.recordsFailed).toBe(0);
    });

    it('should validate user data and report errors', async () => {
      const invalidUserData = [
        {
          email: 'invalid-email',
          firstName: '',
          lastName: 'Doe',
        },
        {
          email: 'valid@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          role: 'invalid-role',
        },
      ];

      const result = await dataService.importUsers(
        'inst-1', 
        invalidUserData, 
        { validateOnly: true }
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      
      // Check for specific validation errors
      const emailError = result.errors.find(e => e.field === 'email');
      const firstNameError = result.errors.find(e => e.field === 'firstName');
      const roleWarning = result.warnings.find(w => w.field === 'role');

      expect(emailError).toBeDefined();
      expect(firstNameError).toBeDefined();
      expect(roleWarning).toBeDefined();
    });
  });

  describe('Course Data Import', () => {
    const mockCourseData = [
      {
        name: 'Introduction to Computer Science',
        code: 'CS101',
        description: 'Basic computer science concepts',
        startDate: '2024-01-15',
        endDate: '2024-05-15',
      },
      {
        name: 'Advanced Mathematics',
        code: 'MATH301',
        description: 'Advanced mathematical concepts',
        startDate: '2024-01-15',
        endDate: '2024-05-15',
      },
    ];

    it('should import courses successfully', async () => {
      const institutionId = 'inst-1';

      // Mock course lookup (not found for both courses)
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      // Mock course creation
      mockSupabase.from().insert()
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: null });

      // Mock import log
      mockSupabase.from().insert().mockResolvedValueOnce({ error: null });

      const result = await dataService.importCourses(institutionId, mockCourseData);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2);
      expect(result.recordsImported).toBe(2);
      expect(result.recordsFailed).toBe(0);
    });

    it('should validate course data', async () => {
      const invalidCourseData = [
        {
          name: '',
          code: '',
          startDate: 'invalid-date',
        },
      ];

      const result = await dataService.importCourses(
        'inst-1', 
        invalidCourseData, 
        { validateOnly: true }
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      const nameError = result.errors.find(e => e.field === 'name');
      const codeError = result.errors.find(e => e.field === 'code');
      const dateWarning = result.warnings.find(w => w.field === 'startDate');

      expect(nameError).toBeDefined();
      expect(codeError).toBeDefined();
      expect(dateWarning).toBeDefined();
    });
  });

  describe('SIS Data Synchronization', () => {
    const mockSISIntegration = {
      id: 'integration-1',
      institutionId: 'inst-1',
      type: 'sis' as const,
      provider: 'powerschool' as const,
      config: {
        apiUrl: 'https://sis.example.com/api',
        apiKey: 'test-api-key',
        syncSettings: {
          syncUsers: true,
          syncCourses: true,
          syncEnrollments: false,
          syncGrades: false,
        },
        fieldMapping: {
          studentId: 'student_id',
          email: 'email_address',
          firstName: 'first_name',
          lastName: 'last_name',
          courseId: 'course_id',
          courseName: 'course_name',
        },
      },
      enabled: true,
      status: 'active' as const,
    };

    it('should sync users from SIS successfully', async () => {
      // Mock integration retrieval
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: mockSISIntegration.id,
          institution_id: mockSISIntegration.institutionId,
          type: mockSISIntegration.type,
          config: mockSISIntegration.config,
        },
        error: null,
      });

      // Mock SIS API responses
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              student_id: 'S001',
              email_address: 'student1@example.com',
              first_name: 'John',
              last_name: 'Doe',
            },
            {
              student_id: 'S002',
              email_address: 'student2@example.com',
              first_name: 'Jane',
              last_name: 'Smith',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              course_id: 'CS101',
              course_name: 'Introduction to Computer Science',
              description: 'Basic CS concepts',
            },
          ]),
        });

      // Mock user and course lookups (not found)
      mockSupabase.from().select().eq().single
        .mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      // Mock user and course creation
      mockSupabase.from().insert()
        .mockResolvedValue({ error: null });

      // Mock import logs
      mockSupabase.from().insert()
        .mockResolvedValue({ error: null });

      // Mock integration sync status update
      mockSupabase.from().update().eq()
        .mockResolvedValueOnce({ error: null });

      const result = await dataService.syncFromSIS(mockSISIntegration.id);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.recordsImported).toBeGreaterThan(0);
      expect(fetch).toHaveBeenCalledWith(
        'https://sis.example.com/api/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should handle SIS API errors gracefully', async () => {
      // Mock integration retrieval
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: mockSISIntegration.id,
          institution_id: mockSISIntegration.institutionId,
          type: mockSISIntegration.type,
          config: mockSISIntegration.config,
        },
        error: null,
      });

      // Mock SIS API error
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Mock integration sync status update
      mockSupabase.from().update().eq()
        .mockResolvedValueOnce({ error: null });

      const result = await dataService.syncFromSIS(mockSISIntegration.id);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('SIS_SYNC_FAILED');
    });
  });

  describe('Data Export', () => {
    it('should export users to CSV format', async () => {
      const institutionId = 'inst-1';
      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          first_name: 'John',
          last_name: 'Doe',
          role: 'student',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          first_name: 'Jane',
          last_name: 'Smith',
          role: 'teacher',
          created_at: '2024-01-02T00:00:00Z',
        },
      ];

      // Mock user query
      mockSupabase.from().select().eq().mockResolvedValueOnce({
        data: mockUsers,
        error: null,
      });

      const result = await dataService.exportUsers(institutionId, {
        format: 'csv',
        includeHeaders: true,
      });

      expect(result.filename).toMatch(/users_export_\d{4}-\d{2}-\d{2}\.csv/);
      expect(result.data).toContain('id,email,first_name,last_name,role,created_at');
      expect(result.data).toContain('user-1,user1@example.com,John,Doe,student');
    });

    it('should export users to JSON format', async () => {
      const institutionId = 'inst-1';
      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          first_name: 'John',
          last_name: 'Doe',
          role: 'student',
        },
      ];

      // Mock user query
      mockSupabase.from().select().eq().mockResolvedValueOnce({
        data: mockUsers,
        error: null,
      });

      const result = await dataService.exportUsers(institutionId, {
        format: 'json',
      });

      expect(result.filename).toMatch(/users_export_\d{4}-\d{2}-\d{2}\.json/);
      const exportedData = JSON.parse(result.data);
      expect(exportedData).toEqual(mockUsers);
    });

    it('should apply date range filters to export', async () => {
      const institutionId = 'inst-1';
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      };

      // Mock user query with date range
      const mockQuer