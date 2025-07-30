// Tests for tenant context utilities
import { NextRequest } from 'next/server';
import { 
  extractTenantContext, 
  validateInstitutionAccess, 
  validateDepartmentAccess,
  getAllowedInstitutionIds,
  getAllowedDepartmentIds,
  hasPermission,
  createTenantFilter
} from '@/lib/utils/tenant-context';
import { TenantContext } from '@/lib/types/institution';

// Mock Supabase SSR
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    }
  }))
}));

describe('Tenant Context Utilities', () => {
  let mockRequest: NextRequest;
  let mockContext: TenantContext;

  beforeEach(() => {
    mockRequest = {
      cookies: {
        getAll: jest.fn(() => [])
      }
    } as any;

    mockContext = {
      institutionId: 'inst-123',
      departmentId: 'dept-456',
      userId: 'user-789',
      role: 'institution_admin',
      permissions: ['read', 'write', 'cross_department_access']
    };
  });

  describe('extractTenantContext', () => {
    it('should extract tenant context from authenticated user', async () => {
      const mockUser = {
        id: 'user-789',
        user_metadata: {
          institution_id: 'inst-123',
          department_id: 'dept-456',
          role: 'institution_admin',
          permissions: ['read', 'write']
        }
      };

      const { createServerClient } = require('@supabase/ssr');
      createServerClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      });

      const result = await extractTenantContext(mockRequest);

      expect(result.context).toEqual({
        institutionId: 'inst-123',
        departmentId: 'dept-456',
        userId: 'user-789',
        role: 'institution_admin',
        permissions: ['read', 'write']
      });
      expect(result.error).toBeUndefined();
    });

    it('should return error when user is not authenticated', async () => {
      const { createServerClient } = require('@supabase/ssr');
      createServerClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: 'Not authenticated' })
        }
      });

      const result = await extractTenantContext(mockRequest);

      expect(result.context).toBeNull();
      expect(result.error).toBe('User not authenticated');
    });

    it('should return error when user has no institution', async () => {
      const mockUser = {
        id: 'user-789',
        user_metadata: {
          role: 'student'
        }
      };

      const { createServerClient } = require('@supabase/ssr');
      createServerClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      });

      const result = await extractTenantContext(mockRequest);

      expect(result.context).toBeNull();
      expect(result.error).toBe('User not associated with any institution');
    });

    it('should allow system admin without institution', async () => {
      const mockUser = {
        id: 'user-789',
        user_metadata: {
          role: 'system_admin'
        }
      };

      const { createServerClient } = require('@supabase/ssr');
      createServerClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      });

      const result = await extractTenantContext(mockRequest);

      expect(result.context).toEqual({
        institutionId: undefined,
        departmentId: undefined,
        userId: 'user-789',
        role: 'system_admin',
        permissions: []
      });
      expect(result.error).toBeUndefined();
    });
  });

  describe('validateInstitutionAccess', () => {
    it('should allow access to own institution', () => {
      const result = validateInstitutionAccess(mockContext, 'inst-123');
      expect(result).toBe(true);
    });

    it('should deny access to other institution', () => {
      const result = validateInstitutionAccess(mockContext, 'other-inst');
      expect(result).toBe(false);
    });

    it('should allow system admin to access any institution', () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const result = validateInstitutionAccess(systemAdminContext, 'any-inst');
      expect(result).toBe(true);
    });
  });

  describe('validateDepartmentAccess', () => {
    it('should allow access to own department', () => {
      const result = validateDepartmentAccess(mockContext, 'dept-456');
      expect(result).toBe(true);
    });

    it('should allow institution admin to access any department in their institution', () => {
      const result = validateDepartmentAccess(mockContext, 'other-dept', 'inst-123');
      expect(result).toBe(true);
    });

    it('should allow user with cross-department permissions', () => {
      const userContext = { ...mockContext, role: 'teacher' };
      const result = validateDepartmentAccess(userContext, 'other-dept');
      expect(result).toBe(true);
    });

    it('should deny access without proper permissions', () => {
      const userContext = { 
        ...mockContext, 
        role: 'teacher', 
        permissions: ['read'] 
      };
      const result = validateDepartmentAccess(userContext, 'other-dept');
      expect(result).toBe(false);
    });

    it('should allow system admin to access any department', () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const result = validateDepartmentAccess(systemAdminContext, 'any-dept');
      expect(result).toBe(true);
    });
  });

  describe('getAllowedInstitutionIds', () => {
    it('should return wildcard for system admin', () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const result = getAllowedInstitutionIds(systemAdminContext);
      expect(result).toEqual(['*']);
    });

    it('should return user institution for regular users', () => {
      const result = getAllowedInstitutionIds(mockContext);
      expect(result).toEqual(['inst-123']);
    });

    it('should return empty array for users without institution', () => {
      const userContext = { ...mockContext, institutionId: '' };
      const result = getAllowedInstitutionIds(userContext);
      expect(result).toEqual([]);
    });
  });

  describe('getAllowedDepartmentIds', () => {
    it('should return wildcard for system admin', () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const result = getAllowedDepartmentIds(systemAdminContext);
      expect(result).toEqual(['*']);
    });

    it('should return wildcard for institution admin', () => {
      const result = getAllowedDepartmentIds(mockContext);
      expect(result).toEqual(['*']);
    });

    it('should return user department for regular users', () => {
      const userContext = { ...mockContext, role: 'teacher' };
      const result = getAllowedDepartmentIds(userContext);
      expect(result).toEqual(['dept-456']);
    });
  });

  describe('hasPermission', () => {
    it('should return true for system admin', () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const result = hasPermission(systemAdminContext, 'any_permission');
      expect(result).toBe(true);
    });

    it('should return true for users with permission', () => {
      const result = hasPermission(mockContext, 'read');
      expect(result).toBe(true);
    });

    it('should return false for users without permission', () => {
      const result = hasPermission(mockContext, 'admin');
      expect(result).toBe(false);
    });
  });

  describe('createTenantFilter', () => {
    it('should return empty filter for system admin', () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const result = createTenantFilter(systemAdminContext, 'institutions');
      expect(result).toBe('');
    });

    it('should return institution filter for institutions table', () => {
      const result = createTenantFilter(mockContext, 'institutions');
      expect(result).toBe("id = 'inst-123'");
    });

    it('should return institution filter for departments table (institution admin)', () => {
      const result = createTenantFilter(mockContext, 'departments');
      expect(result).toBe("institution_id = 'inst-123'");
    });

    it('should return department filter for departments table (regular user)', () => {
      const userContext = { ...mockContext, role: 'teacher' };
      const result = createTenantFilter(userContext, 'departments');
      expect(result).toBe("id = 'dept-456' OR institution_id = 'inst-123'");
    });

    it('should return institution filter for analytics tables', () => {
      const result = createTenantFilter(mockContext, 'institution_analytics');
      expect(result).toBe("institution_id = 'inst-123'");
    });

    it('should return department filter for department analytics (institution admin)', () => {
      const result = createTenantFilter(mockContext, 'department_analytics');
      expect(result).toBe("department_id IN (SELECT id FROM departments WHERE institution_id = 'inst-123')");
    });

    it('should return department filter for department analytics (regular user)', () => {
      const userContext = { ...mockContext, role: 'teacher' };
      const result = createTenantFilter(userContext, 'department_analytics');
      expect(result).toBe("department_id = 'dept-456'");
    });

    it('should return default institution filter for unknown tables', () => {
      const result = createTenantFilter(mockContext, 'unknown_table');
      expect(result).toBe("institution_id = 'inst-123'");
    });
  });
});