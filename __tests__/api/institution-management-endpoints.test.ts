import { NextRequest } from 'next/server';
import { createMocks } from 'node-mocks-http';

// Mock Supabase
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn(() => ({
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
      single: jest.fn(),
      count: 'exact'
    }))
  }))
}));

// Mock services
jest.mock('@/lib/services/institution-manager');
jest.mock('@/lib/services/department-manager');

// Import API handlers after mocking
import { GET as institutionsGET, POST as institutionsPOST } from '@/app/api/institutions/route';
import { GET as institutionGET, PUT as institutionPUT, DELETE as institutionDELETE } from '@/app/api/institutions/[id]/route';
import { GET as departmentsGET, POST as departmentsPOST } from '@/app/api/departments/route';
import { GET as departmentGET, PUT as departmentPUT, DELETE as departmentDELETE } from '@/app/api/departments/[id]/route';
import { GET as hierarchyGET } from '@/app/api/institutions/[id]/departments/hierarchy/route';
import { POST as transferPOST } from '@/app/api/departments/[id]/users/transfer/route';

describe('Institution Management API Endpoints', () => {
  const mockUser = {
    id: 'user-123',
    email: 'admin@test.edu'
  };

  const mockSystemAdmin = {
    id: 'admin-123',
    role: 'system_admin'
  };

  const mockInstitutionAdmin = {
    id: 'inst-admin-123',
    role: 'institution_admin',
    institution_id: 'inst-123'
  };

  const mockInstitution = {
    id: 'inst-123',
    name: 'Test University',
    domain: 'test.edu',
    type: 'university',
    status: 'active',
    contactInfo: { email: 'contact@test.edu' },
    address: {},
    settings: {},
    branding: {},
    subscription: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'admin-123'
  };

  const mockDepartment = {
    id: 'dept-123',
    institutionId: 'inst-123',
    name: 'Computer Science',
    description: 'CS Department',
    code: 'CS',
    adminId: 'dept-admin-123',
    settings: {},
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Institution CRUD Operations', () => {
    describe('GET /api/institutions', () => {
      it('should list institutions for system admin', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions?limit=10&offset=0'
        });

        // Mock authentication
        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockSystemAdmin,
          error: null
        });

        // Mock InstitutionManager
        const { InstitutionManager } = require('@/lib/services/institution-manager');
        const mockListInstitutions = jest.fn().mockResolvedValue({
          institutions: [mockInstitution],
          total: 1
        });
        InstitutionManager.prototype.listInstitutions = mockListInstitutions;

        const response = await institutionsGET(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.institutions).toHaveLength(1);
        expect(mockListInstitutions).toHaveBeenCalled();
      });

      it('should deny access for non-system admin', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'student' },
          error: null
        });

        const response = await institutionsGET(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('System admin role required');
      });

      it('should handle unauthenticated requests', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: new Error('Not authenticated')
        });

        const response = await institutionsGET(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Unauthorized');
      });
    });

    describe('POST /api/institutions', () => {
      it('should create institution for system admin', async () => {
        const institutionData = {
          name: 'New University',
          domain: 'new.edu',
          type: 'university',
          contactInfo: { email: 'admin@new.edu' },
          address: {}
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions',
          body: institutionData
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockSystemAdmin,
          error: null
        });

        const { InstitutionManager } = require('@/lib/services/institution-manager');
        const mockCreateInstitution = jest.fn().mockResolvedValue({
          success: true,
          institution: { ...mockInstitution, ...institutionData }
        });
        InstitutionManager.prototype.createInstitution = mockCreateInstitution;

        const response = await institutionsPOST(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.data.institution.name).toBe('New University');
        expect(mockCreateInstitution).toHaveBeenCalledWith(
          expect.objectContaining(institutionData),
          mockUser.id
        );
      });

      it('should handle validation errors', async () => {
        const invalidData = {
          name: 'Duplicate University',
          domain: 'existing.edu',
          type: 'university'
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions',
          body: invalidData
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockSystemAdmin,
          error: null
        });

        const { InstitutionManager } = require('@/lib/services/institution-manager');
        const mockCreateInstitution = jest.fn().mockResolvedValue({
          success: false,
          errors: [
            { field: 'domain', message: 'Domain is already in use', code: 'DOMAIN_CONFLICT' }
          ]
        });
        InstitutionManager.prototype.createInstitution = mockCreateInstitution;

        const response = await institutionsPOST(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.errors).toHaveLength(1);
        expect(data.errors[0].field).toBe('domain');
      });
    });

    describe('GET /api/institutions/[id]', () => {
      it('should get institution for authorized user', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockInstitutionAdmin,
          error: null
        });

        const { InstitutionManager } = require('@/lib/services/institution-manager');
        const mockGetInstitution = jest.fn().mockResolvedValue(mockInstitution);
        InstitutionManager.prototype.getInstitutionById = mockGetInstitution;

        const response = await institutionGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.institution.id).toBe('inst-123');
      });

      it('should deny access for unauthorized user', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'student', institution_id: 'inst-456' },
          error: null
        });

        const response = await institutionGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Access denied');
      });
    });

    describe('PUT /api/institutions/[id]', () => {
      it('should update institution for authorized admin', async () => {
        const updates = {
          name: 'Updated University'
        };

        const { req } = createMocks({
          method: 'PUT',
          url: '/api/institutions/inst-123',
          body: updates
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockInstitutionAdmin,
          error: null
        });

        const { InstitutionManager } = require('@/lib/services/institution-manager');
        const mockUpdateInstitution = jest.fn().mockResolvedValue({
          success: true,
          institution: { ...mockInstitution, ...updates }
        });
        InstitutionManager.prototype.updateInstitution = mockUpdateInstitution;

        const response = await institutionPUT(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.institution.name).toBe('Updated University');
        expect(mockUpdateInstitution).toHaveBeenCalledWith(
          'inst-123',
          expect.objectContaining({ name: 'Updated University' })
        );
      });
    });

    describe('DELETE /api/institutions/[id]', () => {
      it('should delete institution for system admin', async () => {
        const { req } = createMocks({
          method: 'DELETE',
          url: '/api/institutions/inst-123'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockSystemAdmin,
          error: null
        });

        const { InstitutionManager } = require('@/lib/services/institution-manager');
        const mockDeleteInstitution = jest.fn().mockResolvedValue({
          success: true
        });
        InstitutionManager.prototype.deleteInstitution = mockDeleteInstitution;

        const response = await institutionDELETE(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(mockDeleteInstitution).toHaveBeenCalledWith('inst-123');
      });

      it('should deny deletion for non-system admin', async () => {
        const { req } = createMocks({
          method: 'DELETE',
          url: '/api/institutions/inst-123'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockInstitutionAdmin,
          error: null
        });

        const response = await institutionDELETE(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('System admin role required');
      });
    });
  });

  describe('Department Management Operations', () => {
    describe('GET /api/departments', () => {
      it('should list departments for institution member', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/departments?limit=20'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockInstitutionAdmin,
          error: null
        });

        const { DepartmentManager } = require('@/lib/services/department-manager');
        const mockListDepartments = jest.fn().mockResolvedValue({
          departments: [mockDepartment],
          total: 1
        });
        DepartmentManager.prototype.listDepartments = mockListDepartments;

        const response = await departmentsGET(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.departments).toHaveLength(1);
        expect(mockListDepartments).toHaveBeenCalledWith(
          expect.objectContaining({
            institutionId: 'inst-123'
          })
        );
      });
    });

    describe('POST /api/departments', () => {
      it('should create department for institution admin', async () => {
        const departmentData = {
          name: 'Mathematics',
          code: 'MATH',
          adminId: 'user-2',
          description: 'Mathematics Department'
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/departments',
          body: departmentData
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockInstitutionAdmin,
          error: null
        });

        const { DepartmentManager } = require('@/lib/services/department-manager');
        const mockCreateDepartment = jest.fn().mockResolvedValue({
          success: true,
          department: { ...mockDepartment, ...departmentData }
        });
        DepartmentManager.prototype.createDepartment = mockCreateDepartment;

        const response = await departmentsPOST(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.data.department.name).toBe('Mathematics');
        expect(mockCreateDepartment).toHaveBeenCalledWith(
          'inst-123',
          expect.objectContaining({
            name: 'Mathematics',
            code: 'MATH'
          }),
          expect.any(Object)
        );
      });

      it('should deny department creation for non-admin', async () => {
        const departmentData = {
          name: 'Mathematics',
          code: 'MATH',
          adminId: 'user-2'
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/departments',
          body: departmentData
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'student', institution_id: 'inst-123' },
          error: null
        });

        const response = await departmentsPOST(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Institution admin role required');
      });
    });

    describe('GET /api/institutions/[id]/departments/hierarchy', () => {
      it('should get department hierarchy for institution member', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123/departments/hierarchy'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single
          .mockResolvedValueOnce({
            data: mockInstitutionAdmin,
            error: null
          })
          .mockResolvedValueOnce({
            data: { id: 'inst-123', name: 'Test University' },
            error: null
          });

        const hierarchy = [
          {
            department: {
              id: 'dept-1',
              name: 'Engineering',
              code: 'ENG',
              parentDepartmentId: null
            },
            children: [
              {
                department: {
                  id: 'dept-2',
                  name: 'Computer Science',
                  code: 'CS',
                  parentDepartmentId: 'dept-1'
                },
                children: [],
                userCount: 50,
                classCount: 10
              }
            ],
            userCount: 100,
            classCount: 25
          }
        ];

        const { DepartmentManager } = require('@/lib/services/department-manager');
        const mockGetHierarchy = jest.fn().mockResolvedValue(hierarchy);
        DepartmentManager.prototype.getDepartmentHierarchy = mockGetHierarchy;

        const response = await hierarchyGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.hierarchy).toHaveLength(1);
        expect(data.data.hierarchy[0].children).toHaveLength(1);
        expect(mockGetHierarchy).toHaveBeenCalledWith('inst-123');
      });
    });

    describe('POST /api/departments/[id]/users/transfer', () => {
      it('should transfer users between departments', async () => {
        const transferData = {
          toDepartmentId: 'dept-2',
          options: {
            preserveUserData: true,
            notifyUsers: true
          }
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/departments/dept-1/users/transfer',
          body: transferData
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockInstitutionAdmin,
          error: null
        });

        const fromDept = {
          id: 'dept-1',
          name: 'Old Department',
          institutionId: 'inst-123'
        };

        const toDept = {
          id: 'dept-2',
          name: 'New Department',
          institutionId: 'inst-123'
        };

        const { DepartmentManager } = require('@/lib/services/department-manager');
        const mockGetDepartmentById = jest.fn()
          .mockResolvedValueOnce(fromDept)
          .mockResolvedValueOnce(toDept);
        const mockTransferUsers = jest.fn().mockResolvedValue({
          success: true,
          transferredUsers: 5,
          failedTransfers: []
        });
        DepartmentManager.prototype.getDepartmentById = mockGetDepartmentById;
        DepartmentManager.prototype.transferDepartmentUsers = mockTransferUsers;

        const response = await transferPOST(req as NextRequest, { params: { id: 'dept-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.transferredUsers).toBe(5);
        expect(data.data.failedTransfers).toHaveLength(0);
        expect(mockTransferUsers).toHaveBeenCalledWith(
          'dept-1',
          'dept-2',
          expect.objectContaining({
            preserveUserData: true,
            notifyUsers: true
          })
        );
      });

      it('should reject transfer between different institutions', async () => {
        const transferData = {
          toDepartmentId: 'dept-2'
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/departments/dept-1/users/transfer',
          body: transferData
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: mockInstitutionAdmin,
          error: null
        });

        const fromDept = {
          id: 'dept-1',
          name: 'Department A',
          institutionId: 'inst-123'
        };

        const toDept = {
          id: 'dept-2',
          name: 'Department B',
          institutionId: 'inst-456' // Different institution
        };

        const { DepartmentManager } = require('@/lib/services/department-manager');
        const mockGetDepartmentById = jest.fn()
          .mockResolvedValueOnce(fromDept)
          .mockResolvedValueOnce(toDept);
        DepartmentManager.prototype.getDepartmentById = mockGetDepartmentById;

        const response = await transferPOST(req as NextRequest, { params: { id: 'dept-1' } });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toContain('same institution');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const { req } = createMocks({
        method: 'GET',
        url: '/api/institutions'
      });

      const mockSupabase = require('@/lib/supabase/server').createClient();
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Database connection failed'));

      const response = await institutionsGET(req as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle malformed request bodies', async () => {
      const { req } = createMocks({
        method: 'POST',
        url: '/api/institutions',
        body: 'invalid json'
      });

      const mockSupabase = require('@/lib/supabase/server').createClient();
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });
      mockSupabase.from().single.mockResolvedValue({
        data: mockSystemAdmin,
        error: null
      });

      const response = await institutionsPOST(req as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });
});