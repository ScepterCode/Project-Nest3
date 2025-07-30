// Tests for tenant middleware
import { NextRequest, NextResponse } from 'next/server';
import { 
  withTenantContext,
  validateInstitutionResourceAccess,
  validateDepartmentResourceAccess,
  extractInstitutionIdFromUrl,
  extractDepartmentIdFromUrl,
  createTenantAwareHandler
} from '@/lib/middleware/tenant-middleware';
import { TenantContext } from '@/lib/types/institution';

// Mock the tenant context utilities
jest.mock('@/lib/utils/tenant-context', () => ({
  extractTenantContext: jest.fn(),
  validateInstitutionAccess: jest.fn(),
  validateDepartmentAccess: jest.fn()
}));

describe('Tenant Middleware', () => {
  let mockRequest: NextRequest;
  let mockContext: TenantContext;

  beforeEach(() => {
    mockRequest = {
      nextUrl: {
        pathname: '/api/institutions/inst-123',
        searchParams: new URLSearchParams()
      },
      method: 'GET',
      headers: new Map()
    } as any;

    mockContext = {
      institutionId: 'inst-123',
      departmentId: 'dept-456',
      userId: 'user-789',
      role: 'institution_admin',
      permissions: ['read', 'write']
    };
  });

  describe('withTenantContext', () => {
    it('should return context for valid authenticated user', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      extractTenantContext.mockResolvedValue({ context: mockContext, error: null });

      const result = await withTenantContext(mockRequest);

      expect(result.context).toEqual(mockContext);
      expect(result.response).toBeUndefined();
    });

    it('should return error response for unauthenticated user', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      extractTenantContext.mockResolvedValue({ context: null, error: 'Not authenticated' });

      const result = await withTenantContext(mockRequest);

      expect(result.context).toBeNull();
      expect(result.response).toBeInstanceOf(NextResponse);
    });

    it('should enforce institution requirement', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      const contextWithoutInstitution = { ...mockContext, institutionId: '', role: 'student' };
      extractTenantContext.mockResolvedValue({ context: contextWithoutInstitution, error: null });

      const result = await withTenantContext(mockRequest, { requireInstitution: true });

      expect(result.context).toBeNull();
      expect(result.response).toBeInstanceOf(NextResponse);
    });

    it('should enforce department requirement', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      const contextWithoutDepartment = { ...mockContext, departmentId: '', role: 'student' };
      extractTenantContext.mockResolvedValue({ context: contextWithoutDepartment, error: null });

      const result = await withTenantContext(mockRequest, { requireDepartment: true });

      expect(result.context).toBeNull();
      expect(result.response).toBeInstanceOf(NextResponse);
    });

    it('should enforce allowed roles', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      extractTenantContext.mockResolvedValue({ context: mockContext, error: null });

      const result = await withTenantContext(mockRequest, { allowedRoles: ['system_admin'] });

      expect(result.context).toBeNull();
      expect(result.response).toBeInstanceOf(NextResponse);
    });

    it('should enforce required permissions', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      extractTenantContext.mockResolvedValue({ context: mockContext, error: null });

      const result = await withTenantContext(mockRequest, { requiredPermissions: ['admin'] });

      expect(result.context).toBeNull();
      expect(result.response).toBeInstanceOf(NextResponse);
    });

    it('should allow system admin to bypass requirements', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      const systemAdminContext = { ...mockContext, role: 'system_admin', institutionId: '' };
      extractTenantContext.mockResolvedValue({ context: systemAdminContext, error: null });

      const result = await withTenantContext(mockRequest, { 
        requireInstitution: true,
        requiredPermissions: ['admin']
      });

      expect(result.context).toEqual(systemAdminContext);
      expect(result.response).toBeUndefined();
    });
  });

  describe('validateInstitutionResourceAccess', () => {
    it('should return null for valid access', () => {
      const { validateInstitutionAccess } = require('@/lib/utils/tenant-context');
      validateInstitutionAccess.mockReturnValue(true);

      const result = validateInstitutionResourceAccess(mockContext, 'inst-123');

      expect(result).toBeNull();
    });

    it('should return error response for invalid access', () => {
      const { validateInstitutionAccess } = require('@/lib/utils/tenant-context');
      validateInstitutionAccess.mockReturnValue(false);

      const result = validateInstitutionResourceAccess(mockContext, 'other-inst');

      expect(result).toBeInstanceOf(NextResponse);
    });
  });

  describe('validateDepartmentResourceAccess', () => {
    it('should return null for valid access', () => {
      const { validateDepartmentAccess } = require('@/lib/utils/tenant-context');
      validateDepartmentAccess.mockReturnValue(true);

      const result = validateDepartmentResourceAccess(mockContext, 'dept-456', 'inst-123');

      expect(result).toBeNull();
    });

    it('should return error response for invalid access', () => {
      const { validateDepartmentAccess } = require('@/lib/utils/tenant-context');
      validateDepartmentAccess.mockReturnValue(false);

      const result = validateDepartmentResourceAccess(mockContext, 'other-dept', 'inst-123');

      expect(result).toBeInstanceOf(NextResponse);
    });
  });

  describe('extractInstitutionIdFromUrl', () => {
    it('should extract institution ID from URL path', () => {
      const request = {
        url: 'https://example.com/api/institutions/inst-123/departments',
        nextUrl: {
          pathname: '/api/institutions/inst-123/departments'
        }
      } as any;

      const result = extractInstitutionIdFromUrl(request);

      expect(result).toBe('inst-123');
    });

    it('should extract institution ID from query parameters', () => {
      const request = {
        url: 'https://example.com/api/data?institutionId=inst-456',
        nextUrl: {
          pathname: '/api/data',
          searchParams: new URLSearchParams('institutionId=inst-456')
        }
      } as any;

      const result = extractInstitutionIdFromUrl(request);

      expect(result).toBe('inst-456');
    });

    it('should return null when no institution ID found', () => {
      const request = {
        url: 'https://example.com/api/data',
        nextUrl: {
          pathname: '/api/data',
          searchParams: new URLSearchParams()
        }
      } as any;

      const result = extractInstitutionIdFromUrl(request);

      expect(result).toBeNull();
    });
  });

  describe('extractDepartmentIdFromUrl', () => {
    it('should extract department ID from URL path', () => {
      const request = {
        url: 'https://example.com/api/departments/dept-123/users',
        nextUrl: {
          pathname: '/api/departments/dept-123/users'
        }
      } as any;

      const result = extractDepartmentIdFromUrl(request);

      expect(result).toBe('dept-123');
    });

    it('should extract department ID from query parameters', () => {
      const request = {
        url: 'https://example.com/api/data?departmentId=dept-456',
        nextUrl: {
          pathname: '/api/data',
          searchParams: new URLSearchParams('departmentId=dept-456')
        }
      } as any;

      const result = extractDepartmentIdFromUrl(request);

      expect(result).toBe('dept-456');
    });

    it('should return null when no department ID found', () => {
      const request = {
        url: 'https://example.com/api/data',
        nextUrl: {
          pathname: '/api/data',
          searchParams: new URLSearchParams()
        }
      } as any;

      const result = extractDepartmentIdFromUrl(request);

      expect(result).toBeNull();
    });
  });

  describe('createTenantAwareHandler', () => {
    it('should call handler with validated context', async () => {
      const { extractTenantContext, validateInstitutionAccess } = require('@/lib/utils/tenant-context');
      extractTenantContext.mockResolvedValue({ context: mockContext, error: null });
      validateInstitutionAccess.mockReturnValue(true);

      const mockHandler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = createTenantAwareHandler(mockHandler);

      const result = await wrappedHandler(mockRequest);

      expect(mockHandler).toHaveBeenCalledWith(mockRequest, mockContext, undefined);
      expect(result).toBeInstanceOf(NextResponse);
    });

    it('should return error response for invalid tenant context', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      extractTenantContext.mockResolvedValue({ context: null, error: 'Not authenticated' });

      const mockHandler = jest.fn();
      const wrappedHandler = createTenantAwareHandler(mockHandler);

      const result = await wrappedHandler(mockRequest);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(NextResponse);
    });

    it('should validate resource access from URL', async () => {
      const { extractTenantContext, validateInstitutionAccess } = require('@/lib/utils/tenant-context');
      extractTenantContext.mockResolvedValue({ context: mockContext, error: null });
      validateInstitutionAccess.mockReturnValue(false);

      const mockHandler = jest.fn();
      const wrappedHandler = createTenantAwareHandler(mockHandler);

      const result = await wrappedHandler(mockRequest);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(NextResponse);
    });

    it('should pass through handler options', async () => {
      const { extractTenantContext } = require('@/lib/utils/tenant-context');
      const contextWithoutInstitution = { ...mockContext, institutionId: '', role: 'student' };
      extractTenantContext.mockResolvedValue({ context: contextWithoutInstitution, error: null });

      const mockHandler = jest.fn();
      const wrappedHandler = createTenantAwareHandler(mockHandler, { requireInstitution: true });

      const result = await wrappedHandler(mockRequest);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(NextResponse);
    });
  });
});