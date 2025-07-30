import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET as institutionsGET, POST as institutionsPOST } from '@/app/api/institutions/route';
import { GET as institutionGET, PUT as institutionPUT, DELETE as institutionDELETE } from '@/app/api/institutions/[id]/route';
import { GET as departmentsGET, POST as departmentsPOST } from '@/app/api/institutions/[id]/departments/route';
import { GET as departmentGET, PUT as departmentPUT, DELETE as departmentDELETE } from '@/app/api/departments/[id]/route';
import { GET as analyticsGET, POST as analyticsPOST } from '@/app/api/institutions/[id]/analytics/route';

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
      ilike: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
      count: 'exact'
    }))
  }))
}));

// Mock services
jest.mock('@/lib/services/institution-manager', () => ({
  InstitutionManager: jest.fn().mockImplementation(() => ({
    listInstitutions: jest.fn(),
    createInstitution: jest.fn(),
    getInstitutionById: jest.fn(),
    updateInstitution: jest.fn(),
    deleteInstitution: jest.fn()
  }))
}));

jest.mock('@/lib/services/department-manager', () => ({
  DepartmentManager: jest.fn().mockImplementation(() => ({
    listDepartments: jest.fn(),
    createDepartment: jest.fn(),
    getDepartmentById: jest.fn(),
    updateDepartment: jest.fn(),
    deleteDepartment: jest.fn(),
    getDepartmentHierarchy: jest.fn()
  }))
}));

describe('Institution Management API', () => {
  let mockSupabase: any;
  let mockInstitutionManager: any;
  let mockDepartmentManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    const { createClient } = require('@/lib/supabase/server');
    mockSupabase = createClient();
    
    const { InstitutionManager } = require('@/lib/services/institution-manager');
    const { DepartmentManager } = require('@/lib/services/department-manager');
    
    mockInstitutionManager = new InstitutionManager();
    mockDepartmentManager = new DepartmentManager();
  });

  describe('Institutions API', () => {
    describe('GET /api/institutions', () => {
      it('should return institutions list for system admin', async () => {
        // Mock authenticated system admin
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'system_admin' },
          error: null
        });

        mockInstitutionManager.listInstitutions.mockResolvedValue({
          institutions: [
            {
              id: 'inst-1',
              name: 'Test University',
              domain: 'test.edu',
              type: 'university',
              status: 'active'
            }
          ],
          total: 1
        });

        const request = new NextRequest('http://localhost/api/institutions');
        const response = await institutionsGET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.institutions).toHaveLength(1);
        expect(data.data.institutions[0].name).toBe('Test University');
      });

      it('should deny access for non-system admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'student' },
          error: null
        });

        const request = new NextRequest('http://localhost/api/institutions');
        const response = await institutionsGET(request);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('System admin role required');
      });

      it('should handle filtering parameters', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'system_admin' },
          error: null
        });

        mockInstitutionManager.listInstitutions.mockResolvedValue({
          institutions: [],
          total: 0
        });

        const request = new NextRequest('http://localhost/api/institutions?type=university&status=active&limit=10');
        const response = await institutionsGET(request);

        expect(mockInstitutionManager.listInstitutions).toHaveBeenCalledWith({
          type: 'university',
          status: 'active',
          domain: undefined,
          search: undefined,
          limit: 10,
          offset: 0
        });
      });
    });

    describe('POST /api/institutions', () => {
      it('should create institution for system admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'system_admin' },
          error: null
        });

        const newInstitution = {
          id: 'new-inst-id',
          name: 'New University',
          domain: 'new.edu',
          type: 'university',
          status: 'pending'
        };

        mockInstitutionManager.createInstitution.mockResolvedValue({
          success: true,
          institution: newInstitution
        });

        const requestBody = {
          name: 'New University',
          domain: 'new.edu',
          type: 'university',
          contactInfo: { email: 'admin@new.edu' },
          address: {}
        };

        const request = new NextRequest('http://localhost/api/institutions', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await institutionsPOST(request);
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.data.institution.name).toBe('New University');
        expect(mockInstitutionManager.createInstitution).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New University',
            domain: 'new.edu',
            type: 'university'
          }),
          'admin-id'
        );
      });

      it('should handle validation errors', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'system_admin' },
          error: null
        });

        mockInstitutionManager.createInstitution.mockResolvedValue({
          success: false,
          errors: [
            { field: 'domain', message: 'Domain is already in use', code: 'DOMAIN_CONFLICT' }
          ]
        });

        const requestBody = {
          name: 'Test University',
          domain: 'existing.edu',
          type: 'university'
        };

        const request = new NextRequest('http://localhost/api/institutions', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await institutionsPOST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.errors).toHaveLength(1);
        expect(data.errors[0].field).toBe('domain');
      });
    });

    describe('GET /api/institutions/[id]', () => {
      it('should return institution for authorized user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        const institution = {
          id: 'inst-1',
          name: 'Test University',
          domain: 'test.edu',
          type: 'university',
          status: 'active'
        };

        mockInstitutionManager.getInstitutionById.mockResolvedValue(institution);

        const response = await institutionGET(
          new NextRequest('http://localhost/api/institutions/inst-1'),
          { params: { id: 'inst-1' } }
        );

        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.institution.id).toBe('inst-1');
      });

      it('should deny access for unauthorized user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'student', institution_id: 'other-inst' },
          error: null
        });

        const response = await institutionGET(
          new NextRequest('http://localhost/api/institutions/inst-1'),
          { params: { id: 'inst-1' } }
        );

        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Access denied');
      });
    });

    describe('PUT /api/institutions/[id]', () => {
      it('should update institution for authorized admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        const updatedInstitution = {
          id: 'inst-1',
          name: 'Updated University',
          domain: 'test.edu',
          type: 'university',
          status: 'active'
        };

        mockInstitutionManager.updateInstitution.mockResolvedValue({
          success: true,
          institution: updatedInstitution
        });

        const requestBody = {
          name: 'Updated University'
        };

        const request = new NextRequest('http://localhost/api/institutions/inst-1', {
          method: 'PUT',
          body: JSON.stringify(requestBody)
        });

        const response = await institutionPUT(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.institution.name).toBe('Updated University');
      });
    });

    describe('DELETE /api/institutions/[id]', () => {
      it('should delete institution for system admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'system_admin' },
          error: null
        });

        mockInstitutionManager.deleteInstitution.mockResolvedValue({
          success: true
        });

        const response = await institutionDELETE(
          new NextRequest('http://localhost/api/institutions/inst-1', { method: 'DELETE' }),
          { params: { id: 'inst-1' } }
        );

        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toContain('deleted successfully');
      });

      it('should deny deletion for non-system admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin' },
          error: null
        });

        const response = await institutionDELETE(
          new NextRequest('http://localhost/api/institutions/inst-1', { method: 'DELETE' }),
          { params: { id: 'inst-1' } }
        );

        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('System admin role required');
      });
    });
  });

  describe('Departments API', () => {
    describe('GET /api/institutions/[id]/departments', () => {
      it('should return departments for institution member', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        mockDepartmentManager.listDepartments.mockResolvedValue({
          departments: [
            {
              id: 'dept-1',
              name: 'Computer Science',
              code: 'CS',
              institutionId: 'inst-1'
            }
          ],
          total: 1
        });

        const request = new NextRequest('http://localhost/api/institutions/inst-1/departments');
        const response = await departmentsGET(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.departments).toHaveLength(1);
        expect(data.data.departments[0].name).toBe('Computer Science');
      });

      it('should return hierarchy when requested', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        mockDepartmentManager.getDepartmentHierarchy.mockResolvedValue([
          {
            department: { id: 'dept-1', name: 'Engineering' },
            children: [
              {
                department: { id: 'dept-2', name: 'Computer Science' },
                children: [],
                userCount: 50,
                classCount: 10
              }
            ],
            userCount: 100,
            classCount: 20
          }
        ]);

        const request = new NextRequest('http://localhost/api/institutions/inst-1/departments?hierarchy=true');
        const response = await departmentsGET(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.hierarchy).toBeDefined();
        expect(data.data.hierarchy[0].department.name).toBe('Engineering');
      });
    });

    describe('POST /api/institutions/[id]/departments', () => {
      it('should create department for institution admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        const newDepartment = {
          id: 'dept-new',
          name: 'Mathematics',
          code: 'MATH',
          institutionId: 'inst-1'
        };

        mockDepartmentManager.createDepartment.mockResolvedValue({
          success: true,
          department: newDepartment
        });

        const requestBody = {
          name: 'Mathematics',
          code: 'MATH',
          adminId: 'admin-id',
          description: 'Mathematics Department'
        };

        const request = new NextRequest('http://localhost/api/institutions/inst-1/departments', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await departmentsPOST(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.data.department.name).toBe('Mathematics');
      });
    });

    describe('GET /api/departments/[id]', () => {
      it('should return department for authorized user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'student', institution_id: 'inst-1' },
          error: null
        });

        const department = {
          id: 'dept-1',
          name: 'Computer Science',
          code: 'CS',
          institutionId: 'inst-1'
        };

        mockDepartmentManager.getDepartmentById.mockResolvedValue(department);

        const response = await departmentGET(
          new NextRequest('http://localhost/api/departments/dept-1'),
          { params: { id: 'dept-1' } }
        );

        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.department.name).toBe('Computer Science');
      });
    });
  });

  describe('Analytics API', () => {
    describe('GET /api/institutions/[id]/analytics', () => {
      it('should return analytics for institution admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single
          .mockResolvedValueOnce({
            data: { role: 'institution_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: { id: 'inst-1', name: 'Test University', status: 'active' },
            error: null
          });

        // Mock count queries
        mockSupabase.from().select.mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          count: 100
        });

        const request = new NextRequest('http://localhost/api/institutions/inst-1/analytics?type=overview');
        const response = await analyticsGET(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.overview).toBeDefined();
      });

      it('should handle different analytics types', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single
          .mockResolvedValueOnce({
            data: { role: 'institution_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: { id: 'inst-1', name: 'Test University', status: 'active' },
            error: null
          });

        mockSupabase.from().select.mockResolvedValue({
          data: [
            {
              metric_name: 'daily_active_users',
              metric_value: 150,
              recorded_at: new Date().toISOString()
            }
          ],
          error: null
        });

        const request = new NextRequest('http://localhost/api/institutions/inst-1/analytics?type=user_activity');
        const response = await analyticsGET(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.userActivity).toBeDefined();
      });
    });

    describe('POST /api/institutions/[id]/analytics', () => {
      it('should generate report for institution admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'admin-id' } },
          error: null
        });

        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        mockSupabase.from().select.mockResolvedValue({
          data: [],
          error: null
        });

        const requestBody = {
          action: 'generate_report',
          reportType: 'user_activity',
          timeframe: 'last_30_days',
          format: 'json'
        };

        const request = new NextRequest('http://localhost/api/institutions/inst-1/analytics', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await analyticsPOST(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.report).toBeDefined();
        expect(data.data.report.reportType).toBe('user_activity');
      });
    });
  });
});