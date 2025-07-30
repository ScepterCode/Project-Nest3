import { ContentSharingMiddleware } from '@/lib/utils/content-sharing-middleware';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/services/content-sharing-enforcement');
jest.mock('@/lib/supabase/server');

const mockSupabase = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn()
    }))
  }))
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

const mockEnforcement = {
  enforceSharing: jest.fn(),
  enforceAttribution: jest.fn()
};

jest.mock('@/lib/services/content-sharing-enforcement', () => ({
  ContentSharingEnforcement: jest.fn(() => mockEnforcement)
}));

describe('ContentSharingMiddleware', () => {
  let middleware: ContentSharingMiddleware;
  let mockRequest: NextRequest;

  beforeEach(() => {
    middleware = new ContentSharingMiddleware();
    mockRequest = new NextRequest('http://localhost/test');
    jest.clearAllMocks();
  });

  describe('enforceSharing', () => {
    it('should deny access when user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      const result = await middleware.enforceSharing(mockRequest, {
        contentId: 'content-1',
        contentType: 'assignment'
      });

      expect(result?.status).toBe(401);
      const body = await result?.json();
      expect(body.error).toBe('Authentication required');
    });

    it('should allow sharing when policies permit', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } }
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { institution_id: 'inst-1', department_id: 'dept-1' },
        error: null
      });

      mockEnforcement.enforceSharing.mockResolvedValue({
        allowed: true,
        requiresApproval: false,
        requiresAttribution: false
      });

      const result = await middleware.enforceSharing(mockRequest, {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'owner-1',
        ownerInstitutionId: 'inst-1'
      });

      expect(result).toBeNull(); // Null means allow request to continue
    });

    it('should deny sharing when policies forbid it', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } }
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { institution_id: 'inst-1', department_id: 'dept-1' },
        error: null
      });

      mockEnforcement.enforceSharing.mockResolvedValue({
        allowed: false,
        reason: 'Cross-institution sharing not permitted',
        requiresApproval: false,
        requiresAttribution: false
      });

      const result = await middleware.enforceSharing(mockRequest, {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'owner-1',
        ownerInstitutionId: 'inst-2'
      });

      expect(result?.status).toBe(403);
      const body = await result?.json();
      expect(body.error).toBe('Content sharing not permitted');
      expect(body.reason).toBe('Cross-institution sharing not permitted');
    });

    it('should require approval when policy specifies it', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } }
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { institution_id: 'inst-1', department_id: 'dept-1' },
        error: null
      });

      mockEnforcement.enforceSharing.mockResolvedValue({
        allowed: true,
        requiresApproval: true,
        requiresAttribution: false,
        approvalWorkflowId: 'workflow-1'
      });

      const result = await middleware.enforceSharing(mockRequest, {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'owner-1',
        ownerInstitutionId: 'inst-2'
      });

      expect(result?.status).toBe(202);
      const body = await result?.json();
      expect(body.message).toBe('Approval required for content sharing');
      expect(body.approvalWorkflowId).toBe('workflow-1');
      expect(body.requiresApproval).toBe(true);
    });

    it('should enforce attribution when required', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } }
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { institution_id: 'inst-1', department_id: 'dept-1' },
        error: null
      });

      mockEnforcement.enforceSharing.mockResolvedValue({
        allowed: true,
        requiresApproval: false,
        requiresAttribution: true
      });

      mockEnforcement.enforceAttribution.mockResolvedValue({
        id: 'attr-1',
        contentId: 'content-1',
        attributionText: 'Test attribution'
      });

      const result = await middleware.enforceSharing(mockRequest, {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'owner-1',
        ownerInstitutionId: 'inst-1'
      }, { requireAttribution: true });

      expect(result).toBeNull();
      expect(mockEnforcement.enforceAttribution).toHaveBeenCalledWith(
        'content-1',
        'owner-1',
        'inst-1'
      );
    });

    it('should handle violations with logging', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } }
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { institution_id: 'inst-1', department_id: 'dept-1' },
        error: null
      });

      mockEnforcement.enforceSharing.mockResolvedValue({
        allowed: true,
        requiresApproval: false,
        requiresAttribution: false,
        violations: ['Suspicious activity detected']
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await middleware.enforceSharing(mockRequest, {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'owner-1',
        ownerInstitutionId: 'inst-1'
      }, { logViolations: true });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Content access attempt:',
        expect.objectContaining({
          contentId: 'content-1',
          result: 'Allowed with violations',
          violations: ['Suspicious activity detected']
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('checkAccess', () => {
    it('should allow access for content owner', async () => {
      // Mock content info to show user is owner
      jest.spyOn(middleware as any, 'getContentInfo').mockResolvedValue({
        ownerId: 'user-1',
        ownerInstitutionId: 'inst-1',
        ownerDepartmentId: 'dept-1'
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { institution_id: 'inst-1', department_id: 'dept-1' },
        error: null
      });

      const result = await middleware.checkAccess('user-1', 'content-1', 'assignment');

      expect(result.allowed).toBe(true);
      expect(result.permissions).toEqual(['view', 'edit', 'share', 'admin']);
    });

    it('should check sharing policies for non-owners', async () => {
      jest.spyOn(middleware as any, 'getContentInfo').mockResolvedValue({
        ownerId: 'owner-1',
        ownerInstitutionId: 'inst-1',
        ownerDepartmentId: 'dept-1'
      });

      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({
          data: { institution_id: 'inst-2', department_id: 'dept-2' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { permissions: ['view'] },
          error: null
        });

      mockEnforcement.enforceSharing.mockResolvedValue({
        allowed: true,
        requiresApproval: false,
        requiresAttribution: false
      });

      const result = await middleware.checkAccess('user-2', 'content-1', 'assignment');

      expect(result.allowed).toBe(true);
      expect(result.permissions).toEqual(['view']);
    });

    it('should deny access when content not found', async () => {
      jest.spyOn(middleware as any, 'getContentInfo').mockResolvedValue(null);

      const result = await middleware.checkAccess('user-1', 'content-1', 'assignment');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Content not found');
    });

    it('should deny access when user institution not found', async () => {
      jest.spyOn(middleware as any, 'getContentInfo').mockResolvedValue({
        ownerId: 'owner-1',
        ownerInstitutionId: 'inst-1',
        ownerDepartmentId: 'dept-1'
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: new Error('Not found')
      });

      const result = await middleware.checkAccess('user-1', 'content-1', 'assignment');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('User institution not found');
    });
  });

  describe('grantPermissions', () => {
    it('should grant permissions successfully', async () => {
      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: { id: 'permission-1' },
        error: null
      });

      const result = await middleware.grantPermissions(
        'content-1',
        'assignment',
        'owner-1',
        'user-2',
        undefined,
        undefined,
        ['view', 'comment']
      );

      expect(result.success).toBe(true);
      expect(result.permissionId).toBe('permission-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('content_sharing_permissions');
    });

    it('should handle grant permissions error', async () => {
      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: null,
        error: new Error('Database error')
      });

      const result = await middleware.grantPermissions(
        'content-1',
        'assignment',
        'owner-1',
        'user-2'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to grant permissions');
    });
  });

  describe('revokePermissions', () => {
    it('should revoke permissions successfully', async () => {
      mockSupabase.from().delete().eq.mockResolvedValue({
        error: null
      });

      const result = await middleware.revokePermissions('content-1', 'user-2');

      expect(result.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('content_sharing_permissions');
    });

    it('should handle revoke permissions error', async () => {
      mockSupabase.from().delete().eq.mockResolvedValue({
        error: new Error('Database error')
      });

      const result = await middleware.revokePermissions('content-1', 'user-2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to revoke permissions');
    });
  });

  describe('helper methods', () => {
    it('should determine sharing level correctly', () => {
      const determineSharingLevel = (middleware as any).determineSharingLevel;

      // Cross-institution
      expect(determineSharingLevel('inst-1', 'inst-2', 'dept-1', 'dept-2')).toBe('cross_institution');

      // Same institution, different department
      expect(determineSharingLevel('inst-1', 'inst-1', 'dept-1', 'dept-2')).toBe('institution');

      // Same institution and department
      expect(determineSharingLevel('inst-1', 'inst-1', 'dept-1', 'dept-1')).toBe('department');
    });

    it('should get user institution info', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { institution_id: 'inst-1', department_id: 'dept-1' },
        error: null
      });

      const getUserInstitutionInfo = (middleware as any).getUserInstitutionInfo;
      const result = await getUserInstitutionInfo('user-1');

      expect(result).toEqual({
        institutionId: 'inst-1',
        departmentId: 'dept-1'
      });
    });

    it('should handle user institution info error', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: new Error('Not found')
      });

      const getUserInstitutionInfo = (middleware as any).getUserInstitutionInfo;
      const result = await getUserInstitutionInfo('user-1');

      expect(result).toBeNull();
    });

    it('should get existing permissions', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { permissions: ['view', 'comment'] },
        error: null
      });

      const getExistingPermissions = (middleware as any).getExistingPermissions;
      const result = await getExistingPermissions('content-1', 'user-1');

      expect(result).toEqual(['view', 'comment']);
    });

    it('should handle existing permissions error', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: new Error('Not found')
      });

      const getExistingPermissions = (middleware as any).getExistingPermissions;
      const result = await getExistingPermissions('content-1', 'user-1');

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle enforcement errors gracefully', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Auth error'));

      const result = await middleware.enforceSharing(mockRequest, {
        contentId: 'content-1',
        contentType: 'assignment'
      });

      expect(result?.status).toBe(500);
      const body = await result?.json();
      expect(body.error).toBe('Content sharing enforcement failed');
    });

    it('should handle access check errors gracefully', async () => {
      jest.spyOn(middleware as any, 'getContentInfo').mockRejectedValue(new Error('Database error'));

      const result = await middleware.checkAccess('user-1', 'content-1', 'assignment');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Access check failed');
    });
  });
});