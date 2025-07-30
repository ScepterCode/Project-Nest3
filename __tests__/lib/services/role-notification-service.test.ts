import { RoleNotificationService, RoleNotificationType } from '@/lib/services/role-notification-service';
import { NotificationService } from '@/lib/services/notification-service';
import { UserRole, RoleRequestStatus, RoleRequest, UserRoleAssignment, RoleStatus } from '@/lib/types/role-management';

// Mock the notification service
jest.mock('@/lib/services/notification-service');
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: null }))
        }))
      })),
      upsert: jest.fn(() => ({ error: null })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({ error: null }))
      })),
      delete: jest.fn(() => ({
        lt: jest.fn(() => ({
          not: jest.fn(() => ({ error: null }))
        }))
      }))
    }))
  }))
}));

describe('RoleNotificationService', () => {
  let roleNotificationService: RoleNotificationService;
  let mockNotificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    roleNotificationService = new RoleNotificationService();
    mockNotificationService = new NotificationService() as jest.Mocked<NotificationService>;
    (roleNotificationService as any).notificationService = mockNotificationService;
  });

  describe('sendRoleRequestSubmittedNotification', () => {
    it('should send notification when role request is submitted', async () => {
      const roleRequest: RoleRequest = {
        id: 'request-1',
        userId: 'user-1',
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'I want to teach',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: 'inst-1',
        expiresAt: new Date(),
        metadata: {}
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendRoleRequestSubmittedNotification(
        roleRequest,
        'user@example.com',
        'John Doe'
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: RoleNotificationType.ROLE_REQUEST_SUBMITTED,
          title: 'Role Request Submitted',
          message: 'Your request for Teacher role has been submitted and is pending review.',
          channels: ['email', 'in_app'],
          priority: 'medium'
        })
      );
    });

    it('should notify administrators about the role request', async () => {
      const roleRequest: RoleRequest = {
        id: 'request-1',
        userId: 'user-1',
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'I want to teach',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: 'inst-1',
        expiresAt: new Date(),
        metadata: {}
      };

      // Mock the getRelevantAdministrators method
      (roleNotificationService as any).getRelevantAdministrators = jest.fn().mockResolvedValue(['admin-1', 'admin-2']);
      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendRoleRequestSubmittedNotification(
        roleRequest,
        'user@example.com',
        'John Doe'
      );

      // Should send notification to user + 2 admins = 3 total calls
      expect(mockNotificationService.sendNotification).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendRoleRequestApprovedNotification', () => {
    it('should send approval notification to user', async () => {
      const roleRequest: RoleRequest = {
        id: 'request-1',
        userId: 'user-1',
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'I want to teach',
        status: RoleRequestStatus.APPROVED,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: 'inst-1',
        expiresAt: new Date(),
        metadata: {}
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendRoleRequestApprovedNotification(
        roleRequest,
        'admin-1',
        'Admin User',
        'Approved based on qualifications'
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: RoleNotificationType.ROLE_REQUEST_APPROVED,
          title: 'Role Request Approved',
          message: 'Your request for Teacher role has been approved by Admin User. Note: Approved based on qualifications',
          channels: ['email', 'in_app'],
          priority: 'high'
        })
      );
    });
  });

  describe('sendRoleRequestDeniedNotification', () => {
    it('should send denial notification to user', async () => {
      const roleRequest: RoleRequest = {
        id: 'request-1',
        userId: 'user-1',
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'I want to teach',
        status: RoleRequestStatus.DENIED,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as any,
        institutionId: 'inst-1',
        expiresAt: new Date(),
        metadata: {}
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendRoleRequestDeniedNotification(
        roleRequest,
        'admin-1',
        'Admin User',
        'Insufficient qualifications'
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: RoleNotificationType.ROLE_REQUEST_DENIED,
          title: 'Role Request Denied',
          message: 'Your request for Teacher role has been denied by Admin User. Reason: Insufficient qualifications',
          channels: ['email', 'in_app'],
          priority: 'high'
        })
      );
    });
  });

  describe('sendRoleAssignedNotification', () => {
    it('should send role assignment notification', async () => {
      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        institutionId: 'inst-1',
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendRoleAssignedNotification(
        assignment,
        'Admin User',
        UserRole.STUDENT
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: RoleNotificationType.ROLE_CHANGED,
          title: 'Role Changed',
          message: 'Your role has been changed from Student to Teacher by Admin User.',
          channels: ['email', 'in_app'],
          priority: 'high'
        })
      );
    });

    it('should handle temporary role assignment', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        expiresAt,
        institutionId: 'inst-1',
        isTemporary: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendRoleAssignedNotification(
        assignment,
        'Admin User'
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('This is a temporary assignment expiring on')
        })
      );
    });
  });

  describe('sendTemporaryRoleExpiringNotification', () => {
    it('should send expiration warning notification', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);

      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        expiresAt,
        institutionId: 'inst-1',
        isTemporary: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendTemporaryRoleExpiringNotification(assignment, 3);

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: RoleNotificationType.TEMPORARY_ROLE_EXPIRING,
          title: 'Temporary Role Expiring Soon',
          message: expect.stringContaining('will expire in 3 days'),
          priority: 'high'
        })
      );
    });

    it('should set urgent priority for roles expiring in 1 day', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        expiresAt,
        institutionId: 'inst-1',
        isTemporary: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendTemporaryRoleExpiringNotification(assignment, 1);

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'urgent'
        })
      );
    });

    it('should not send notification for non-temporary roles', async () => {
      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        institutionId: 'inst-1',
        isTemporary: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendTemporaryRoleExpiringNotification(assignment, 3);

      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('sendTemporaryRoleExpiredNotification', () => {
    it('should send expiration notification', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const assignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.EXPIRED,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        expiresAt,
        institutionId: 'inst-1',
        isTemporary: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendTemporaryRoleExpiredNotification(
        assignment,
        UserRole.STUDENT
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: RoleNotificationType.TEMPORARY_ROLE_EXPIRED,
          title: 'Temporary Role Expired',
          message: 'Your temporary Teacher role has expired and you have been reverted to Student.',
          priority: 'medium'
        })
      );
    });
  });

  describe('sendRoleRevokedNotification', () => {
    it('should send role revocation notification', async () => {
      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendRoleRevokedNotification(
        'user-1',
        UserRole.TEACHER,
        'admin-1',
        'Admin User',
        'Policy violation',
        UserRole.STUDENT
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: RoleNotificationType.ROLE_REVOKED,
          title: 'Role Revoked',
          message: 'Your Teacher role has been revoked by Admin User and you have been assigned Student. Reason: Policy violation',
          priority: 'high'
        })
      );
    });
  });

  describe('sendBulkAssignmentCompletedNotification', () => {
    it('should send bulk assignment completion notification', async () => {
      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendBulkAssignmentCompletedNotification(
        'admin-1',
        50,
        5,
        'inst-1'
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          type: RoleNotificationType.BULK_ASSIGNMENT_COMPLETED,
          title: 'Bulk Role Assignment Completed',
          message: 'Bulk role assignment completed. 50 successful, 5 failed assignments.',
          priority: 'high' // High priority because there were failures
        })
      );
    });

    it('should set medium priority when no failures', async () => {
      mockNotificationService.sendNotification = jest.fn().mockResolvedValue('notification-1');

      await roleNotificationService.sendBulkAssignmentCompletedNotification(
        'admin-1',
        50,
        0,
        'inst-1'
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'medium'
        })
      );
    });
  });

  describe('getRoleNotificationPreferences', () => {
    it('should return default preferences when none exist', async () => {
      const preferences = await roleNotificationService.getRoleNotificationPreferences('user-1');

      expect(preferences).toEqual({
        userId: 'user-1',
        roleRequests: {
          email: true,
          inApp: true,
          sms: false
        },
        roleAssignments: {
          email: true,
          inApp: true,
          sms: false
        },
        temporaryRoles: {
          email: true,
          inApp: true,
          sms: false,
          reminderDays: [7, 3, 1]
        },
        adminNotifications: {
          email: true,
          inApp: true,
          sms: false,
          digestFrequency: 'daily'
        }
      });
    });
  });

  describe('formatRoleName', () => {
    it('should format role names correctly', () => {
      const service = roleNotificationService as any;
      
      expect(service.formatRoleName(UserRole.STUDENT)).toBe('Student');
      expect(service.formatRoleName(UserRole.TEACHER)).toBe('Teacher');
      expect(service.formatRoleName(UserRole.DEPARTMENT_ADMIN)).toBe('Department Administrator');
      expect(service.formatRoleName(UserRole.INSTITUTION_ADMIN)).toBe('Institution Administrator');
      expect(service.formatRoleName(UserRole.SYSTEM_ADMIN)).toBe('System Administrator');
    });
  });
});