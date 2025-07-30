// Department Lifecycle Integration Tests
// Using JavaScript to avoid TypeScript compilation issues

// Mock Supabase client
jest.mock('@/lib/supabase/server');

describe('Department Lifecycle Integration Tests', () => {
  let departmentManager;
  let institutionManager;
  let mockSupabase;
  let testInstitution;
  let testContext;

  beforeEach(() => {
    // Setup mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
      count: 'exact'
    };

    const { createClient } = require('@/lib/supabase/server');
    const { DepartmentManager } = require('@/lib/services/department-manager');
    const { InstitutionManager } = require('@/lib/services/institution-manager');

    createClient.mockReturnValue(mockSupabase);

    departmentManager = new DepartmentManager();
    institutionManager = new InstitutionManager();

    // Setup test institution
    testInstitution = {
      id: 'inst-123',
      name: 'Test University',
      domain: 'test.edu',
      type: 'university',
      status: 'active',
      contactInfo: { email: 'admin@test.edu' },
      address: {},
      settings: {},
      branding: {},
      subscription: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user-123'
    };

    testContext = {
      institutionId: 'inst-123',
      userId: 'user-123',
      role: 'institution_admin',
      permissions: ['manage_departments']
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Department Creation', () => {
    it('should create a department successfully', async () => {
      const departmentData = {
        name: 'Computer Science',
        description: 'Department of Computer Science',
        code: 'CS',
        adminId: 'admin-123'
      };

      const mockDepartment = {
        id: 'dept-123',
        institution_id: 'inst-123',
        name: 'Computer Science',
        description: 'Department of Computer Science',
        code: 'CS',
        admin_id: 'admin-123',
        parent_department_id: null,
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock validation queries
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null }); // Code uniqueness check
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'admin-123', role: 'department_admin' }, error: null }); // Admin validation

      // Mock insert
      mockSupabase.single.mockResolvedValueOnce({ data: mockDepartment, error: null });

      const result = await departmentManager.createDepartment('inst-123', departmentData, testContext);

      expect(result.success).toBe(true);
      expect(result.department).toBeDefined();
      expect(result.department.name).toBe('Computer Science');
      expect(result.department.code).toBe('CS');
      expect(mockSupabase.from).toHaveBeenCalledWith('departments');
      expect(mockSupabase.insert).toHaveBeenCalled();
    });

    it('should fail to create department with duplicate code', async () => {
      const departmentData = {
        name: 'Computer Science',
        description: 'Department of Computer Science',
        code: 'CS',
        adminId: 'admin-123'
      };

      // Mock code uniqueness check - return existing department
      mockSupabase.single.mockResolvedValueOnce({ data: [{ id: 'existing-dept' }], error: null });

      const result = await departmentManager.createDepartment('inst-123', departmentData, testContext);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].code).toBe('CODE_CONFLICT');
    });

    it('should create department with hierarchical parent', async () => {
      const parentDepartment = {
        id: 'parent-dept',
        institution_id: 'inst-123',
        name: 'Engineering',
        code: 'ENG',
        admin_id: 'admin-123',
        parent_department_id: null,
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const departmentData = {
        name: 'Computer Engineering',
        description: 'Department of Computer Engineering',
        code: 'CE',
        adminId: 'admin-123',
        parentDepartmentId: 'parent-dept'
      };

      const mockDepartment = {
        id: 'dept-123',
        institution_id: 'inst-123',
        name: 'Computer Engineering',
        description: 'Department of Computer Engineering',
        code: 'CE',
        admin_id: 'admin-123',
        parent_department_id: 'parent-dept',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock validation queries
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null }); // Code uniqueness
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'admin-123', role: 'department_admin' }, error: null }); // Admin validation
      mockSupabase.single.mockResolvedValueOnce({ data: parentDepartment, error: null }); // Parent department validation

      // Mock insert
      mockSupabase.single.mockResolvedValueOnce({ data: mockDepartment, error: null });

      const result = await departmentManager.createDepartment('inst-123', departmentData, testContext);

      expect(result.success).toBe(true);
      expect(result.department.parentDepartmentId).toBe('parent-dept');
    });

    it('should prevent circular hierarchy references', async () => {
      const departmentData = {
        name: 'Test Department',
        description: 'Test Department',
        code: 'TEST',
        adminId: 'admin-123',
        parentDepartmentId: 'dept-123' // This would be the same as the department being created
      };

      // Mock parent department that would create circular reference
      const mockParent = {
        id: 'dept-123',
        institution_id: 'inst-123',
        name: 'Parent Dept',
        code: 'PARENT',
        admin_id: 'admin-123',
        parent_department_id: 'dept-456', // This department has a parent
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock validation queries
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null }); // Code uniqueness
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'admin-123', role: 'department_admin' }, error: null }); // Admin validation
      mockSupabase.single.mockResolvedValueOnce({ data: mockParent, error: null }); // Parent department

      const result = await departmentManager.createDepartment('inst-123', departmentData, testContext);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.some(e => e.code === 'CIRCULAR_REFERENCE')).toBe(true);
    });
  });

  describe('Department Updates', () => {
    it('should update department successfully', async () => {
      const existingDepartment = {
        id: 'dept-123',
        institution_id: 'inst-123',
        name: 'Computer Science',
        description: 'Department of Computer Science',
        code: 'CS',
        admin_id: 'admin-123',
        parent_department_id: null,
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const updates = {
        name: 'Computer Science & Engineering',
        description: 'Updated description'
      };

      // Mock get department
      mockSupabase.single.mockResolvedValueOnce({ data: existingDepartment, error: null });

      // Mock update
      const updatedDepartment = { ...existingDepartment, ...updates };
      mockSupabase.single.mockResolvedValueOnce({ data: updatedDepartment, error: null });

      const result = await departmentManager.updateDepartment('dept-123', updates, testContext);

      expect(result.success).toBe(true);
      expect(result.department.name).toBe('Computer Science & Engineering');
      expect(mockSupabase.update).toHaveBeenCalled();
    });

    it('should prevent updating to duplicate code', async () => {
      const existingDepartment = {
        id: 'dept-123',
        institution_id: 'inst-123',
        name: 'Computer Science',
        code: 'CS',
        admin_id: 'admin-123',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const updates = {
        code: 'MATH' // Assume this code already exists
      };

      // Mock get department
      mockSupabase.single.mockResolvedValueOnce({ data: existingDepartment, error: null });

      // Mock code uniqueness check - return existing department with same code
      mockSupabase.single.mockResolvedValueOnce({ data: [{ id: 'other-dept' }], error: null });

      const result = await departmentManager.updateDepartment('dept-123', updates, testContext);

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('CODE_CONFLICT');
    });
  });

  describe('Department Deletion', () => {
    it('should delete department with data preservation', async () => {
      const department = {
        id: 'dept-123',
        institution_id: 'inst-123',
        name: 'Computer Science',
        code: 'CS',
        admin_id: 'admin-123',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const deletionOptions = {
        preserveData: true,
        archiveAnalytics: true
      };

      // Mock get department
      mockSupabase.single.mockResolvedValueOnce({ data: department, error: null });

      // Mock checks for deletion eligibility
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No child departments
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No users
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No classes

      // Mock update (soft delete)
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      const result = await departmentManager.deleteDepartment('dept-123', deletionOptions, testContext);

      expect(result.success).toBe(true);
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'archived',
        updated_at: expect.any(String)
      });
    });

    it('should prevent deletion of department with active users without transfer', async () => {
      const department = {
        id: 'dept-123',
        institution_id: 'inst-123',
        name: 'Computer Science',
        code: 'CS',
        admin_id: 'admin-123',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const deletionOptions = {
        preserveData: false
      };

      // Mock get department
      mockSupabase.single.mockResolvedValueOnce({ data: department, error: null });

      // Mock checks - return active users
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No child departments
      mockSupabase.single.mockResolvedValueOnce({ data: [{ user_id: 'user-1' }], error: null }); // Has users

      const result = await departmentManager.deleteDepartment('dept-123', deletionOptions, testContext);

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('DELETE_RESTRICTED');
    });
  });

  describe('User Transfer Between Departments', () => {
    it('should transfer users between departments successfully', async () => {
      const fromDept = {
        id: 'dept-from',
        institution_id: 'inst-123',
        name: 'Old Department',
        code: 'OLD',
        admin_id: 'admin-123',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const toDept = {
        id: 'dept-to',
        institution_id: 'inst-123',
        name: 'New Department',
        code: 'NEW',
        admin_id: 'admin-456',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const mockUsers = [
        {
          user_id: 'user-1',
          users: { id: 'user-1', email: 'user1@test.edu', full_name: 'User One' }
        },
        {
          user_id: 'user-2',
          users: { id: 'user-2', email: 'user2@test.edu', full_name: 'User Two' }
        }
      ];

      const transferOptions = {
        preserveUserData: true,
        preserveClassData: true,
        preserveAnalytics: true,
        notifyUsers: true
      };

      // Mock get departments
      mockSupabase.single
        .mockResolvedValueOnce({ data: fromDept, error: null })
        .mockResolvedValueOnce({ data: toDept, error: null });

      // Mock get users to transfer
      mockSupabase.single.mockResolvedValueOnce({ data: mockUsers, error: null });

      // Mock user updates
      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const result = await departmentManager.transferDepartmentUsers('dept-from', 'dept-to', transferOptions);

      expect(result.success).toBe(true);
      expect(result.transferredUsers).toBe(2);
      expect(result.failedTransfers).toHaveLength(0);
    });

    it('should handle partial transfer failures gracefully', async () => {
      const fromDept = {
        id: 'dept-from',
        institution_id: 'inst-123',
        name: 'Old Department',
        code: 'OLD',
        admin_id: 'admin-123',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const toDept = {
        id: 'dept-to',
        institution_id: 'inst-123',
        name: 'New Department',
        code: 'NEW',
        admin_id: 'admin-456',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const mockUsers = [
        {
          user_id: 'user-1',
          users: { id: 'user-1', email: 'user1@test.edu', full_name: 'User One' }
        },
        {
          user_id: 'user-2',
          users: { id: 'user-2', email: 'user2@test.edu', full_name: 'User Two' }
        }
      ];

      const transferOptions = {
        preserveUserData: true,
        preserveClassData: true,
        preserveAnalytics: true,
        notifyUsers: false
      };

      // Mock get departments
      mockSupabase.single
        .mockResolvedValueOnce({ data: fromDept, error: null })
        .mockResolvedValueOnce({ data: toDept, error: null });

      // Mock get users to transfer
      mockSupabase.single.mockResolvedValueOnce({ data: mockUsers, error: null });

      // Mock user updates - first succeeds, second fails
      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: new Error('Update failed') });

      const result = await departmentManager.transferDepartmentUsers('dept-from', 'dept-to', transferOptions);

      expect(result.success).toBe(false);
      expect(result.transferredUsers).toBe(1);
      expect(result.failedTransfers).toContain('user2@test.edu');
    });

    it('should prevent transfer between departments in different institutions', async () => {
      const fromDept = {
        id: 'dept-from',
        institution_id: 'inst-123',
        name: 'Old Department',
        code: 'OLD',
        admin_id: 'admin-123',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const toDept = {
        id: 'dept-to',
        institution_id: 'inst-456', // Different institution
        name: 'New Department',
        code: 'NEW',
        admin_id: 'admin-456',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const transferOptions = {
        preserveUserData: true,
        preserveClassData: true,
        preserveAnalytics: true,
        notifyUsers: false
      };

      // Mock get departments
      mockSupabase.single
        .mockResolvedValueOnce({ data: fromDept, error: null })
        .mockResolvedValueOnce({ data: toDept, error: null });

      const result = await departmentManager.transferDepartmentUsers('dept-from', 'dept-to', transferOptions);

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TRANSFER');
    });
  });

  describe('Department Hierarchy', () => {
    it('should build department hierarchy correctly', async () => {
      const mockDepartments = [
        {
          id: 'dept-1',
          institution_id: 'inst-123',
          name: 'Engineering',
          code: 'ENG',
          admin_id: 'admin-1',
          parent_department_id: null,
          settings: {},
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'dept-2',
          institution_id: 'inst-123',
          name: 'Computer Science',
          code: 'CS',
          admin_id: 'admin-2',
          parent_department_id: 'dept-1',
          settings: {},
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'dept-3',
          institution_id: 'inst-123',
          name: 'Mathematics',
          code: 'MATH',
          admin_id: 'admin-3',
          parent_department_id: null,
          settings: {},
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      // Mock list departments
      mockSupabase.single.mockResolvedValueOnce({ data: mockDepartments, count: 3, error: null });

      // Mock department stats
      mockSupabase.single
        .mockResolvedValueOnce({ data: [{ department_id: 'dept-1' }, { department_id: 'dept-2' }], error: null }) // User counts
        .mockResolvedValueOnce({ data: [{ department_id: 'dept-1' }], error: null }); // Class counts

      const hierarchy = await departmentManager.getDepartmentHierarchy('inst-123');

      expect(hierarchy).toHaveLength(2); // Two root departments
      expect(hierarchy[0].department.name).toBe('Engineering');
      expect(hierarchy[0].children).toHaveLength(1);
      expect(hierarchy[0].children[0].department.name).toBe('Computer Science');
      expect(hierarchy[1].department.name).toBe('Mathematics');
      expect(hierarchy[1].children).toHaveLength(0);
    });
  });

  describe('Department Listing and Filtering', () => {
    it('should list departments with filters', async () => {
      const mockDepartments = [
        {
          id: 'dept-1',
          institution_id: 'inst-123',
          name: 'Computer Science',
          code: 'CS',
          admin_id: 'admin-1',
          parent_department_id: null,
          settings: {},
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      // Mock list query
      mockSupabase.single.mockResolvedValueOnce({ data: mockDepartments, count: 1, error: null });

      const result = await departmentManager.listDepartments({
        institutionId: 'inst-123',
        status: 'active',
        search: 'Computer'
      });

      expect(result.departments).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.departments[0].name).toBe('Computer Science');
    });

    it('should handle empty results gracefully', async () => {
      // Mock empty results
      mockSupabase.single.mockResolvedValueOnce({ data: [], count: 0, error: null });

      const result = await departmentManager.listDepartments({
        institutionId: 'inst-123',
        status: 'active'
      });

      expect(result.departments).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const departmentData = {
        name: 'Test Department',
        description: 'Test Description',
        code: 'TEST',
        adminId: 'admin-123'
      };

      // Mock database error
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: new Error('Database connection failed') });

      const result = await departmentManager.createDepartment('inst-123', departmentData, testContext);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].code).toBe('DATABASE_ERROR');
    });

    it('should handle validation errors properly', async () => {
      const invalidDepartmentData = {
        name: '', // Invalid: empty name
        description: 'Test Description',
        code: 'invalid-code', // Invalid: lowercase and hyphen
        adminId: '' // Invalid: empty admin ID
      };

      const result = await departmentManager.createDepartment('inst-123', invalidDepartmentData, testContext);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'name')).toBe(true);
      expect(result.errors.some(e => e.field === 'code')).toBe(true);
      expect(result.errors.some(e => e.field === 'adminId')).toBe(true);
    });
  });

  describe('Access Control', () => {
    it('should prevent cross-tenant access', async () => {
      const department = {
        id: 'dept-123',
        institution_id: 'other-inst', // Different institution
        name: 'Computer Science',
        code: 'CS',
        admin_id: 'admin-123',
        settings: {},
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const updates = {
        name: 'Updated Name'
      };

      // Mock get department from different institution
      mockSupabase.single.mockResolvedValueOnce({ data: department, error: null });

      const result = await departmentManager.updateDepartment('dept-123', updates, testContext);

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('ACCESS_DENIED');
    });
  });
});