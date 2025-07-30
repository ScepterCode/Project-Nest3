/**
 * Role Change Processor Tests
 * 
 * Tests for role change validation, processing, and permission updates.
 */

import { RoleChangeProcessor } from '@/lib/services/role-change-processor';
import { RoleManager } from '@/lib/services/role-manager';
import { PermissionChecker } from '@/lib/services/permission-checker';
import { RoleNotificationService } from '@/lib/services/role-notification-service';
import {
  UserRole,
  RoleStatus,
  RoleRequestStatus,
  RoleChangeRequest,
  UserRoleAssignment,
  RoleRequest
} from '@/lib/types/role-management';

// Mock the dependencies
jest.mock('@/lib/services/role-manager');
jest.mock('@/lib/services/permission-checker');
jest.mock('@/lib/services/role-notification-service');

describe('RoleChangeProcessor', () => {
  let processor: RoleChangeProcessor;
  let mockRoleManager: jest.Mocked<RoleManager>;
  let mockPermissionChecker: jest.Mocked<PermissionChecker>;
  let mockNotificationService: jest.Mocked<RoleNotificationService>;

  const mockUserId = 'user-123';
  const mockInstitutionId = 'inst-456';
  const mockDepartmentId = 'dept-789';
  const mockChangedBy = 'admin-123';

  beforeEach(() => {
    // Create mocked instances
    mockRoleManager = new RoleManager({
      defaultRoleRequestExpiration: 7,
      maxTemporaryRoleDuration: 90,
      requireApprovalForRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN],
      autoApproveRoles: [UserRole.STUDENT]
    }) as jest.Mocked<RoleManager>;

    mockPermissionChecker = new PermissionChecker({
      cacheEnabled: true,
      cacheTtl: 300,
      bulkCheckLimit: 50
    }) as jest.Mocked<PermissionChecker>;

    mockNotificationService = new RoleNotificationService() as jest.Mocked<RoleNotificationService>;

    processor = new RoleChangeProcessor(
      mockRoleManager,
      mockPermissionChecker,
      mockNotificationService
    );

    // Setup default mocks
    jest.clearAllMocks();
  });

  describe('validateRoleChange', () => {
    it('should validate a valid role change request', async () => {
      const request: RoleChangeRequest = {
        userId: mockUserId,
        currentRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: mockUserId,
        reason: 'I have been hired as a teacher',
        institutionId: mockInstitutionId,
        requiresApproval: true
      };

      // Mock user has current role
      const mockAssignments: UserRoleAssignment[] = [{
        id: 'assignment-1',
        userId: mockUserId,
        role: UserRole.STUDENT,
        status: RoleStatus.ACTIVE,
        assignedBy: 'system',
        assignedAt: new Date(),
        institutionId: mockInstitutionId,
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      // Mock the private method by spying on the processor
      jest.spyOn(processor as any, 'getUserRoleAssignments').mockResolvedValue(mockAssignments);
      jest.spyOn(processor as any, 'getPendingRoleRequests').mockResolvedValue([]);

      const result = await processor.validateRoleChange(request);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalReason).toContain('Teacher role requires verification');
    });

    it('should reject request with missing required fields', async () => {
      const request: RoleChangeRequest = {
        userId: '',
        currentRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: mockUserId,
        reason: '',
        institutionId: mockInstitutionId,
        requiresApproval: true
      };

      const result = await processor.validateRoleChange(request);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required fields for role change');
      expect(result.errors).toContain('Reason for role change is required');
    });

    it('should reject request when current and new roles are the same', async () => {
      const request: RoleChangeRequest = {
        userId: mockUserId,
        currentRole: UserRole.STUDENT,
        newRole: UserRole.STUDENT,
        changedBy: mockUserId,
        reason: 'Same role',
        institutionId: mockInstitutionId,
        requiresApproval: false
      };

      const result = await processor.validateRoleChange(request);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Current role and new role cannot be the same');
    });

    it('should reject request when user does not have current role', async () => {
      const request: RoleChangeRequest = {
        userId: mockUserId,
        currentRole: UserRole.TEACHER,
        newRole: UserRole.DEPARTMENT_ADMIN,
        changedBy: mockUserId,
        reason: 'Promotion to admin',
        institutionId: mockInstitutionId,
        requiresApproval: true
      };

      // Mock user does not have the claimed current role
      jest.spyOn(processor as any, 'getUserRoleAssignments').mockResolvedValue([]);
      jest.spyOn(processor as any, 'getPendingRoleRequests').mockResolvedValue([]);

      const result = await processor.validateRoleChange(request);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('User does not have the specified current role');
    });

    it('should validate permissions when changing roles for other users', async () => {
      const request: RoleChangeRequest = {
        userId: mockUserId,
        currentRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: mockChangedBy, // Different user
        reason: 'Admin assigning teacher role',
        institutionId: mockInstitutionId,
        requiresApproval: false
      };

      const mockAssignments: UserRoleAssignment[] = [{
        id: 'assignment-1',
        userId: mockUserId,
        role: UserRole.STUDENT,
        status: RoleStatus.ACTIVE,
        assignedBy: 'system',
        assignedAt: new Date(),
        institutionId: mockInstitutionId,
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      jest.spyOn(processor as any, 'getUserRoleAssignments').mockResolvedValue(mockAssignments);
      jest.spyOn(processor as any, 'getPendingRoleRequests').mockResolvedValue([]);
      mockPermissionChecker.hasPermission.mockResolvedValue(true);

      const result = await processor.validateRoleChange(request);

      expect(result.isValid).toBe(true);
      expect(mockPermissionChecker.hasPermission).toHaveBeenCalledWith(
        mockChangedBy,
        'role.assign',
        expect.objectContaining({
          resourceId: mockUserId,
          resourceType: 'user',
          institutionId: mockInstitutionId
        })
      );
    });

    it('should warn about existing pending requests', async () => {
      const request: RoleChangeRequest = {
        userId: mockUserId,
        currentRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: mockUserId,
        reason: 'Want to be a teacher',
        institutionId: mockInstitutionId,
        requiresApproval: true
      };

      const mockAssignments: UserRoleAssignment[] = [{
        id: 'assignment-1',
        userId: mockUserId,
        role: UserRole.STUDENT,
        status: RoleStatus.ACTIVE,
        assignedBy: 'system',
        assignedAt: new Date(),
        institutionId: mockInstitutionId,
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      const mockPendingRequests: RoleRequest[] = [{
        id: 'request-1',
        userId: mockUserId,
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'Previous request',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: mockInstitutionId,
        expiresAt: new Date(),
        metadata: {}
      }];

      jest.spyOn(processor as any, 'getUserRoleAssignments').mockResolvedValue(mockAssignments);
      jest.spyOn(processor as any, 'getPendingRoleRequests').mockResolvedValue(mockPendingRequests);

      const result = await processor.validateRoleChange(request);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('User has existing pending role requests');
    });
  });

  describe('processRoleChange', () => {
    it('should create role request when approval is required', async () => {
      const request: RoleChangeRequest = {
        userId: mockUserId,
        currentRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: mockUserId,
        reason: 'I have been hired as a teacher',
        institutionId: mockInstitutionId,
        requiresApproval: true
      };

      const mockRoleRequest: RoleRequest = {
        id: 'request-123',
        userId: mockUserId,
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: request.reason,
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: mockInstitutionId,
        expiresAt: new Date(),
        metadata: {}
      };

      // Mock validation success
      jest.spyOn(processor, 'validateRoleChange').mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        requiresApproval: true,
        approvalReason: 'Teacher role requires approval'
      });

      mockRoleManager.requestRole.mockResolvedValue(mockRoleRequest);
      mockNotificationService.notifyRoleChangeRequested.mockResolvedValue();

      const result = await processor.processRoleChange(request);

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockRoleRequest);
      expect(mockRoleManager.requestRole).toHaveBeenCalledWith(
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId,
        request.reason,
        undefined
      );
      expect(mockNotificationService.notifyRoleChangeRequested).toHaveBeenCalledWith(mockRoleRequest);
    });

    it('should execute immediate role change when no approval required', async () => {
      const request: RoleChangeRequest = {
        userId: mockUserId,
        currentRole: UserRole.TEACHER,
        newRole: UserRole.STUDENT,
        changedBy: mockUserId,
        reason: 'Stepping down from teaching',
        institutionId: mockInstitutionId,
        requiresApproval: false
      };

      const mockAssignment: UserRoleAssignment = {
        id: 'assignment-123',
        userId: mockUserId,
        role: UserRole.STUDENT,
        status: RoleStatus.ACTIVE,
        assignedBy: mockUserId,
        assignedAt: new Date(),
        institutionId: mockInstitutionId,
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock validation success
      jest.spyOn(processor, 'validateRoleChange').mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        requiresApproval: false
      });

      mockRoleManager.revokeRole.mockResolvedValue();
      mockRoleManager.assignRole.mockResolvedValue(mockAssignment);
      mockPermissionChecker.invalidateUserCache.mockReturnValue();
      mockNotificationService.notifyRoleChanged.mockResolvedValue();

      const result = await processor.processRoleChange(request);

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockAssignment);
      expect(mockRoleManager.revokeRole).toHaveBeenCalledWith(
        mockUserId,
        UserRole.TEACHER,
        mockUserId,
        'Role change: Stepping down from teaching'
      );
      expect(mockRoleManager.assignRole).toHaveBeenCalled();
      expect(mockPermissionChecker.invalidateUserCache).toHaveBeenCalledWith(mockUserId);
      expect(mockNotificationService.notifyRoleChanged).toHaveBeenCalledWith(
        mockUserId,
        UserRole.TEACHER,
        UserRole.STUDENT,
        request.reason
      );
    });

    it('should handle validation errors', async () => {
      const request: RoleChangeRequest = {
        userId: '',
        currentRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: mockUserId,
        reason: '',
        institutionId: mockInstitutionId,
        requiresApproval: true
      };

      jest.spyOn(processor, 'validateRoleChange').mockResolvedValue({
        isValid: false,
        errors: ['Missing required fields', 'Reason is required'],
        warnings: [],
        requiresApproval: true
      });

      const result = await processor.processRoleChange(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
      expect(result.error).toContain('Missing required fields');
    });

    it('should bypass approval when option is set', async () => {
      const request: RoleChangeRequest = {
        userId: mockUserId,
        currentRole: UserRole.STUDENT,
        newRole: UserRole.TEACHER,
        changedBy: mockChangedBy,
        reason: 'Admin override',
        institutionId: mockInstitutionId,
        requiresApproval: true
      };

      const mockAssignment: UserRoleAssignment = {
        id: 'assignment-123',
        userId: mockUserId,
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: mockChangedBy,
        assignedAt: new Date(),
        institutionId: mockInstitutionId,
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(processor, 'validateRoleChange').mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        requiresApproval: true
      });

      mockRoleManager.revokeRole.mockResolvedValue();
      mockRoleManager.assignRole.mockResolvedValue(mockAssignment);
      mockPermissionChecker.invalidateUserCache.mockReturnValue();
      mockNotificationService.notifyRoleChanged.mockResolvedValue();

      const result = await processor.processRoleChange(request, { bypassApproval: true });

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockAssignment);
      expect(mockRoleManager.assignRole).toHaveBeenCalled();
    });
  });

  describe('approveRoleChange', () => {
    it('should approve a pending role request', async () => {
      const requestId = 'request-123';
      const approverId = 'admin-456';
      const notes = 'Approved after verification';

      const mockRoleRequest: RoleRequest = {
        id: requestId,
        userId: mockUserId,
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'Want to teach',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: mockInstitutionId,
        expiresAt: new Date(),
        metadata: {}
      };

      const mockAssignment: UserRoleAssignment = {
        id: 'assignment-123',
        userId: mockUserId,
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: approverId,
        assignedAt: new Date(),
        institutionId: mockInstitutionId,
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(processor as any, 'getRoleRequest').mockResolvedValue(mockRoleRequest);
      jest.spyOn(processor as any, 'getUserRoleAssignments').mockResolvedValue([mockAssignment]);
      mockPermissionChecker.hasPermission.mockResolvedValue(true);
      mockRoleManager.approveRole.mockResolvedValue();
      mockPermissionChecker.invalidateUserCache.mockReturnValue();
      mockNotificationService.notifyRoleChangeApproved.mockResolvedValue();

      const result = await processor.approveRoleChange(requestId, approverId, notes);

      expect(result).toEqual(mockAssignment);
      expect(mockRoleManager.approveRole).toHaveBeenCalledWith(requestId, approverId, notes);
      expect(mockPermissionChecker.invalidateUserCache).toHaveBeenCalledWith(mockUserId);
      expect(mockNotificationService.notifyRoleChangeApproved).toHaveBeenCalledWith(
        mockUserId,
        UserRole.TEACHER,
        notes
      );
    });

    it('should reject approval without proper permissions', async () => {
      const requestId = 'request-123';
      const approverId = 'user-456';

      const mockRoleRequest: RoleRequest = {
        id: requestId,
        userId: mockUserId,
        requestedRole: UserRole.TEACHER,
        status: RoleRequestStatus.PENDING,
        institutionId: mockInstitutionId,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        expiresAt: new Date(),
        justification: 'Test',
        metadata: {}
      };

      jest.spyOn(processor as any, 'getRoleRequest').mockResolvedValue(mockRoleRequest);
      mockPermissionChecker.hasPermission.mockResolvedValue(false);

      await expect(processor.approveRoleChange(requestId, approverId)).rejects.toThrow(
        'Insufficient permissions to approve role requests'
      );
    });
  });

  describe('denyRoleChange', () => {
    it('should deny a pending role request', async () => {
      const requestId = 'request-123';
      const approverId = 'admin-456';
      const reason = 'Insufficient documentation';

      const mockRoleRequest: RoleRequest = {
        id: requestId,
        userId: mockUserId,
        requestedRole: UserRole.TEACHER,
        status: RoleRequestStatus.PENDING,
        institutionId: mockInstitutionId,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        expiresAt: new Date(),
        justification: 'Test',
        metadata: {}
      };

      jest.spyOn(processor as any, 'getRoleRequest').mockResolvedValue(mockRoleRequest);
      mockPermissionChecker.hasPermission.mockResolvedValue(true);
      mockRoleManager.denyRole.mockResolvedValue();
      mockNotificationService.notifyRoleChangeDenied.mockResolvedValue();

      await processor.denyRoleChange(requestId, approverId, reason);

      expect(mockRoleManager.denyRole).toHaveBeenCalledWith(requestId, approverId, reason);
      expect(mockNotificationService.notifyRoleChangeDenied).toHaveBeenCalledWith(
        mockUserId,
        UserRole.TEACHER,
        reason
      );
    });
  });

  describe('getChangeImpactPreview', () => {
    it('should return permission differences between roles', async () => {
      const result = await processor.getChangeImpactPreview(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      );

      expect(result).toHaveProperty('currentPermissions');
      expect(result).toHaveProperty('newPermissions');
      expect(result).toHaveProperty('addedPermissions');
      expect(result).toHaveProperty('removedPermissions');
      expect(Array.isArray(result.addedPermissions)).toBe(true);
      expect(Array.isArray(result.removedPermissions)).toBe(true);
    });
  });
});