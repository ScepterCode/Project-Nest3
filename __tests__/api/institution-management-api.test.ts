import { NextRequest } from 'next/server';

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
jest.mock('@/lib/services/institution-user-manager');
jest.mock('@/lib/services/institution-invitation-manager');

describe('Institution Management API Integration Tests', () => {
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
        expect(mockListInstitutions).toHaveBeenCalledWith({
          type: null,
          status: null,
          domain: undefined,
          search: undefined,
          limit: 10,
          offset: 0
        });
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
          data: { role: 'teacher' },
          error: null
        });

        const response = await institutionsGET(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Access denied. System admin role required.');
      });
    });

    describe('POST /api/institutions', () => {
      it('should create institution for system admin', async () => {
        const institutionData = {
          name: 'New University',
          domain: 'new.edu',
          type: 'university',
          contactInfo: { email: 'contact@new.edu' }
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
          name: '', // Invalid empty name
          domain: 'invalid-domain'
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
            { field: 'name', message: 'Name is required', code: 'REQUIRED' },
            { field: 'domain', message: 'Invalid domain format', code: 'INVALID_FORMAT' }
          ]
        });
        InstitutionManager.prototype.createInstitution = mockCreateInstitution;

        const response = await institutionsPOST(req as NextRequest);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.errors).toHaveLength(2);
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

      it('should filter sensitive data for non-admin users', async () => {
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
          data: { role: 'teacher', institution_id: 'inst-123' },
          error: null
        });

        const { InstitutionManager } = require('@/lib/services/institution-manager');
        const mockGetInstitution = jest.fn().mockResolvedValue({
          ...mockInstitution,
          subscription: { plan: 'premium' },
          settings: { integrations: [{ type: 'sso' }] }
        });
        InstitutionManager.prototype.getInstitutionById = mockGetInstitution;

        const response = await institutionGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.institution.subscription).toBeUndefined();
        expect(data.data.institution.settings.integrations).toEqual([]);
      });
    });

    describe('PUT /api/institutions/[id]', () => {
      it('should update institution for institution admin', async () => {
        const updates = {
          name: 'Updated University Name',
          contactInfo: { email: 'updated@test.edu' }
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
        expect(data.data.institution.name).toBe('Updated University Name');
      });
    });

    describe('DELETE /api/institutions/[id]', () => {
      it('should delete institution for system admin only', async () => {
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

      it('should deny deletion for institution admin', async () => {
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
        expect(data.error).toBe('Access denied. System admin role required.');
      });
    });
  });

  describe('Department Management with Hierarchical Support', () => {
    describe('GET /api/institutions/[id]/departments', () => {
      it('should list departments for institution', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123/departments?limit=20'
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

        const response = await departmentsGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.departments).toHaveLength(1);
        expect(mockListDepartments).toHaveBeenCalledWith({
          institutionId: 'inst-123',
          status: null,
          adminId: undefined,
          parentDepartmentId: undefined,
          search: undefined,
          limit: 20,
          offset: 0
        });
      });

      it('should return department hierarchy when requested', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123/departments?hierarchy=true'
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

        const mockHierarchy = {
          department: mockDepartment,
          children: [],
          userCount: 5,
          classCount: 3
        };

        const { DepartmentManager } = require('@/lib/services/department-manager');
        const mockGetHierarchy = jest.fn().mockResolvedValue([mockHierarchy]);
        DepartmentManager.prototype.getDepartmentHierarchy = mockGetHierarchy;

        const response = await departmentsGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.hierarchy).toHaveLength(1);
        expect(mockGetHierarchy).toHaveBeenCalledWith('inst-123');
      });
    });

    describe('POST /api/institutions/[id]/departments', () => {
      it('should create department with hierarchical support', async () => {
        const departmentData = {
          name: 'Software Engineering',
          description: 'SE Department',
          code: 'SE',
          adminId: 'admin-456',
          parentDepartmentId: 'dept-123',
          settings: { defaultClassSettings: {} }
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions/inst-123/departments',
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
          department: { ...mockDepartment, ...departmentData, id: 'dept-456' }
        });
        DepartmentManager.prototype.createDepartment = mockCreateDepartment;

        const response = await departmentsPOST(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.data.department.name).toBe('Software Engineering');
        expect(data.data.department.parentDepartmentId).toBe('dept-123');
        expect(mockCreateDepartment).toHaveBeenCalledWith(
          'inst-123',
          departmentData,
          expect.objectContaining({
            institutionId: 'inst-123',
            userId: mockUser.id,
            role: 'institution_admin'
          })
        );
      });
    });

    describe('PUT /api/departments/[id]', () => {
      it('should update department with proper access control', async () => {
        const updates = {
          name: 'Updated CS Department',
          description: 'Updated description'
        };

        const { req } = createMocks({
          method: 'PUT',
          url: '/api/departments/dept-123',
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

        const { DepartmentManager } = require('@/lib/services/department-manager');
        const mockGetDepartment = jest.fn().mockResolvedValue(mockDepartment);
        const mockUpdateDepartment = jest.fn().mockResolvedValue({
          success: true,
          department: { ...mockDepartment, ...updates }
        });
        DepartmentManager.prototype.getDepartmentById = mockGetDepartment;
        DepartmentManager.prototype.updateDepartment = mockUpdateDepartment;

        const response = await departmentPUT(req as NextRequest, { params: { id: 'dept-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.department.name).toBe('Updated CS Department');
      });
    });

    describe('DELETE /api/departments/[id]', () => {
      it('should delete department with data preservation options', async () => {
        const deletionOptions = {
          preserveData: true,
          transferUsersTo: 'dept-456',
          archiveAnalytics: true
        };

        const { req } = createMocks({
          method: 'DELETE',
          url: '/api/departments/dept-123',
          body: deletionOptions
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
        const mockGetDepartment = jest.fn().mockResolvedValue(mockDepartment);
        const mockDeleteDepartment = jest.fn().mockResolvedValue({
          success: true
        });
        DepartmentManager.prototype.getDepartmentById = mockGetDepartment;
        DepartmentManager.prototype.deleteDepartment = mockDeleteDepartment;

        const response = await departmentDELETE(req as NextRequest, { params: { id: 'dept-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(mockDeleteDepartment).toHaveBeenCalledWith(
          'dept-123',
          deletionOptions,
          expect.objectContaining({
            institutionId: 'inst-123',
            userId: mockUser.id
          })
        );
      });
    });
  });

  describe('User Invitation and Management', () => {
    describe('GET /api/institutions/[id]/users', () => {
      it('should list institution users with filtering', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123/users?role=teacher&departmentId=dept-123'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });

        const { InstitutionUserManager } = require('@/lib/services/institution-user-manager');
        const mockGetUserRole = jest.fn().mockResolvedValue({
          role: 'institution_admin'
        });
        const mockGetUsers = jest.fn().mockResolvedValue({
          users: [
            { id: 'user-1', email: 'teacher1@test.edu', role: 'teacher' },
            { id: 'user-2', email: 'teacher2@test.edu', role: 'teacher' }
          ],
          total: 2
        });
        InstitutionUserManager.prototype.getUserInstitutionRole = mockGetUserRole;
        InstitutionUserManager.prototype.getInstitutionUsers = mockGetUsers;

        const response = await usersGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.users).toHaveLength(2);
        expect(mockGetUsers).toHaveBeenCalledWith('inst-123', {
          role: 'teacher',
          status: undefined,
          departmentId: 'dept-123',
          search: undefined,
          joinedAfter: undefined,
          joinedBefore: undefined,
          limit: undefined,
          offset: undefined
        });
      });
    });

    describe('POST /api/institutions/[id]/users', () => {
      it('should assign user role', async () => {
        const roleAssignment = {
          action: 'assign_role',
          userId: 'user-456',
          role: 'teacher',
          departmentId: 'dept-123'
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions/inst-123/users',
          body: roleAssignment
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });

        const { InstitutionUserManager } = require('@/lib/services/institution-user-manager');
        const mockGetUserRole = jest.fn().mockResolvedValue({
          role: 'institution_admin'
        });
        const mockAssignRole = jest.fn().mockResolvedValue({
          success: true
        });
        InstitutionUserManager.prototype.getUserInstitutionRole = mockGetUserRole;
        InstitutionUserManager.prototype.assignUserRole = mockAssignRole;

        const response = await usersPOST(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(mockAssignRole).toHaveBeenCalledWith(
          'user-456',
          'inst-123',
          'teacher',
          mockUser.id,
          'dept-123'
        );
      });

      it('should handle bulk role assignments', async () => {
        const bulkAssignment = {
          action: 'bulk_assign_roles',
          userIds: ['user-1', 'user-2', 'user-3'],
          role: 'student',
          departmentId: 'dept-123',
          notifyUsers: true
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions/inst-123/users',
          body: bulkAssignment
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });

        const { InstitutionUserManager } = require('@/lib/services/institution-user-manager');
        const mockGetUserRole = jest.fn().mockResolvedValue({
          role: 'institution_admin'
        });
        const mockBulkAssign = jest.fn().mockResolvedValue({
          successful: 3,
          failed: 0,
          results: []
        });
        InstitutionUserManager.prototype.getUserInstitutionRole = mockGetUserRole;
        InstitutionUserManager.prototype.bulkAssignRoles = mockBulkAssign;

        const response = await usersPOST(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(mockBulkAssign).toHaveBeenCalledWith({
          userIds: ['user-1', 'user-2', 'user-3'],
          role: 'student',
          departmentId: 'dept-123',
          assignedBy: mockUser.id,
          notifyUsers: true
        });
      });
    });

    describe('GET /api/institutions/[id]/invitations', () => {
      it('should list invitations with filtering', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123/invitations?status=pending&role=teacher'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin' },
          error: null
        });

        const { InstitutionInvitationManager } = require('@/lib/services/institution-invitation-manager');
        const mockGetInvitations = jest.fn().mockResolvedValue({
          invitations: [
            { id: 'inv-1', email: 'new1@test.edu', status: 'pending', role: 'teacher' },
            { id: 'inv-2', email: 'new2@test.edu', status: 'pending', role: 'teacher' }
          ],
          total: 2
        });
        InstitutionInvitationManager.prototype.getInstitutionInvitations = mockGetInvitations;

        const response = await invitationsGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.invitations).toHaveLength(2);
      });
    });

    describe('POST /api/institutions/[id]/invitations', () => {
      it('should create single invitation', async () => {
        const invitationData = {
          action: 'create_single',
          email: 'newteacher@test.edu',
          role: 'teacher',
          departmentId: 'dept-123',
          firstName: 'John',
          lastName: 'Doe',
          message: 'Welcome to our institution!'
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions/inst-123/invitations',
          body: invitationData
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin' },
          error: null
        });

        const { InstitutionInvitationManager } = require('@/lib/services/institution-invitation-manager');
        const mockCreateInvitation = jest.fn().mockResolvedValue({
          success: true,
          invitation: { id: 'inv-123', email: 'newteacher@test.edu', status: 'pending' }
        });
        InstitutionInvitationManager.prototype.createInvitation = mockCreateInvitation;

        const response = await invitationsPOST(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.invitation.email).toBe('newteacher@test.edu');
      });

      it('should create bulk invitations', async () => {
        const bulkInvitationData = {
          action: 'create_bulk',
          invitations: [
            { email: 'teacher1@test.edu', role: 'teacher', departmentId: 'dept-123' },
            { email: 'teacher2@test.edu', role: 'teacher', departmentId: 'dept-123' }
          ],
          defaultMessage: 'Welcome to our institution!',
          sendImmediately: true
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions/inst-123/invitations',
          body: bulkInvitationData
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin' },
          error: null
        });

        const { InstitutionInvitationManager } = require('@/lib/services/institution-invitation-manager');
        const mockCreateBulk = jest.fn().mockResolvedValue({
          successful: 2,
          failed: 0,
          invitations: [
            { id: 'inv-1', email: 'teacher1@test.edu' },
            { id: 'inv-2', email: 'teacher2@test.edu' }
          ]
        });
        InstitutionInvitationManager.prototype.createBulkInvitations = mockCreateBulk;

        const response = await invitationsPOST(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.successful).toBe(2);
      });
    });
  });

  describe('Analytics and Reporting with Access Controls', () => {
    describe('GET /api/institutions/[id]/analytics', () => {
      it('should return overview analytics for institution admin', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123/analytics?type=overview'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single
          .mockResolvedValueOnce({ data: mockInstitutionAdmin, error: null })
          .mockResolvedValueOnce({ data: mockInstitution, error: null });
        
        // Mock count queries
        mockSupabase.from().select.mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          count: 'exact'
        });

        const response = await analyticsGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.overview).toBeDefined();
        expect(data.data.overview.institution.id).toBe('inst-123');
      });

      it('should deny access for non-admin users', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/institutions/inst-123/analytics'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'teacher', institution_id: 'inst-123' },
          error: null
        });

        const response = await analyticsGET(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Access denied. Institution admin role required.');
      });
    });

    describe('POST /api/institutions/[id]/analytics', () => {
      it('should generate analytics report', async () => {
        const reportRequest = {
          action: 'generate_report',
          reportType: 'comprehensive',
          timeframe: 'last_30_days',
          format: 'json',
          includeDetails: true
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions/inst-123/analytics',
          body: reportRequest
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

        // Mock analytics data queries
        mockSupabase.from().select.mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          data: []
        });

        const response = await analyticsPOST(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.report).toBeDefined();
        expect(data.data.report.reportType).toBe('comprehensive');
      });

      it('should handle data export with privacy compliance', async () => {
        const exportRequest = {
          action: 'export_data',
          exportType: 'user_data',
          includePersonalData: true
        };

        const { req } = createMocks({
          method: 'POST',
          url: '/api/institutions/inst-123/analytics',
          body: exportRequest
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-123' },
          error: null
        });

        const response = await analyticsPOST(req as NextRequest, { params: { id: 'inst-123' } });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Personal data export requires system admin privileges');
      });
    });

    describe('GET /api/departments/[id]/analytics', () => {
      it('should return department analytics for authorized users', async () => {
        const { req } = createMocks({
          method: 'GET',
          url: '/api/departments/dept-123/analytics?type=student_performance'
        });

        const mockSupabase = require('@/lib/supabase/server').createClient();
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null
        });
        mockSupabase.from().single
          .mockResolvedValueOnce({ data: mockInstitutionAdmin, error: null })
          .mockResolvedValueOnce({ data: mockDepartment, error: null });

        // Mock analytics query
        mockSupabase.from().select.mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          data: [
            { metric_name: 'average_grade', metric_value: 85.5, recorded_at: new Date() }
          ]
        });

        const response = await deptAnalyticsGET(req as NextRequest, { params: { id: 'dept-123' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.studentPerformance).toBeDefined();
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle authentication errors', async () => {
      const { req } = createMocks({
        method: 'GET',
        url: '/api/institutions'
      });

      const mockSupabase = require('@/lib/supabase/server').createClient();
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      const response = await institutionsGET(req as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle service errors gracefully', async () => {
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
        data: mockSystemAdmin,
        error: null
      });

      const { InstitutionManager } = require('@/lib/services/institution-manager');
      InstitutionManager.prototype.listInstitutions = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await institutionsGET(req as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle invalid request data', async () => {
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
      expect(data.error).toBe('Internal server error');
    });
  });
});