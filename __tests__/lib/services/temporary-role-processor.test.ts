/**
 * Unit tests for Temporary Role Processor Service
 * 
 * Tests the automatic expiration processing, role reversion logic,
 * and temporary role lifecycle management.
 */

import { 
  TemporaryRoleProcessor,
  TemporaryRoleExpiration,
  ExpirationProcessingResult,
  RoleReversionConfig
} from '@/lib/services/temporary-role-processor';
import { 
  UserRole, 
  RoleStatus,
  UserRoleAssignment,
  AuditAction
} from '@/lib/types/role-management';

// Mock the notification service
jest.mock('@/lib/services/role-notification-service', () => ({
  roleNotificationService: {
    notifyRoleExpired: jest.fn(),
    notifyRoleExpiringSoon: jest.fn(),
    sendBulkExpirationWarnings: jest.fn()
  }
}));

describe('TemporaryRoleProcessor', () => {
  let processor: TemporaryRoleProcessor;
  let mockConfig: RoleReversionConfig;

  beforeEach(() => {
    mockConfig = {
      defaultRole: UserRole.STUDENT,
      preserveOriginalRole: true,
      notifyOnExpiration: true,
      gracePeriodHours: 24
    };
    processor = new TemporaryRoleProcessor(mockConfig);
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    processor.stopProcessor();
    jest.restoreAllMocks();
  });

  describe('Processor Lifecycle', () => {
    test('should start and stop processor correctly', () => {
      expect(processor['processingInterval']).toBeNull();
      
      processor.startProcessor(1); // 1 minute interval for testing
      expect(processor['processingInterval']).not.toBeNull();
      
      processor.stopProcessor();
      expect(processor['processingInterval']).toBeNull();
    });

    test('should not start multiple processors', () => {
      processor.startProcessor(1);
      const firstInterval = processor['processingInterval'];
      
      processor.startProcessor(1);
      const secondInterval = processor['processingInterval'];
      
      expect(firstInterval).not.toBe(secondInterval);
      expect(processor['processingInterval']).not.toBeNull();
    });

    test('should handle stopping when not started', () => {
      expect(() => processor.stopProcessor()).not.toThrow();
    });
  });

  describe('Role Expiration Processing', () => {
    test('should process expired roles successfully', async () => {
      const mockExpiredRoles: TemporaryRoleExpiration[] = [
        {
          assignmentId: 'assignment-1',
          userId: 'user-1',
          currentRole: UserRole.TEACHER,
          previousRole: UserRole.STUDENT,
          expiresAt: new Date('2024-01-01'),
          institutionId: 'institution-1',
          departmentId: 'department-1'
        },
        {
          assignmentId: 'assignment-2',
          userId: 'user-2',
          currentRole: UserRole.DEPARTMENT_ADMIN,
          previousRole: UserRole.TEACHER,
          expiresAt: new Date('2024-01-01'),
          institutionId: 'institution-1'
        }
      ];

      // Mock the private methods
      jest.spyOn(processor as any, 'getExpiredTemporaryRoles')
        .mockResolvedValue(mockExpiredRoles);
      jest.spyOn(processor as any, 'processRoleExpiration')
        .mockResolvedValue(undefined);

      const result = await processor.processExpiredRoles();

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle processing failures gracefully', async () => {
      const mockExpiredRoles: TemporaryRoleExpiration[] = [
        {
          assignmentId: 'assignment-1',
          userId: 'user-1',
          currentRole: UserRole.TEACHER,
          previousRole: UserRole.STUDENT,
          expiresAt: new Date('2024-01-01'),
          institutionId: 'institution-1'
        },
        {
          assignmentId: 'assignment-2',
          userId: 'user-2',
          currentRole: UserRole.DEPARTMENT_ADMIN,
          previousRole: UserRole.TEACHER,
          expiresAt: new Date('2024-01-01'),
          institutionId: 'institution-1'
        }
      ];

      jest.spyOn(processor as any, 'getExpiredTemporaryRoles')
        .mockResolvedValue(mockExpiredRoles);
      jest.spyOn(processor as any, 'processRoleExpiration')
        .mockImplementation(async (role: TemporaryRoleExpiration) => {
          if (role.userId === 'user-2') {
            throw new Error('Processing failed');
          }
        });

      const result = await processor.processExpiredRoles();

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        assignmentId: 'assignment-2',
        userId: 'user-2',
        error: 'Processing failed'
      });
    });

    test('should skip processing if already in progress', async () => {
      processor['isProcessing'] = true;

      const result = await processor.processExpiredRoles();

      expect(result.processed).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('Individual Role Expiration', () => {
    let mockExpiredRole: TemporaryRoleExpiration;
    let mockCurrentAssignment: UserRoleAssignment;

    beforeEach(() => {
      mockExpiredRole = {
        assignmentId: 'assignment-1',
        userId: 'user-1',
        currentRole: UserRole.TEACHER,
        previousRole: UserRole.STUDENT,
        expiresAt: new Date('2024-01-01'),
        institutionId: 'institution-1',
        departmentId: 'department-1'
      };

      mockCurrentAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date('2023-12-01'),
        expiresAt: new Date('2024-01-01'),
        institutionId: 'institution-1',
        departmentId: 'department-1',
        isTemporary: true,
        metadata: { originalRole: UserRole.STUDENT },
        createdAt: new Date('2023-12-01'),
        updatedAt: new Date('2023-12-01')
      };
    });

    test('should process role expiration correctly', async () => {
      jest.spyOn(processor as any, 'getCurrentRoleAssignment')
        .mockResolvedValue(mockCurrentAssignment);
      jest.spyOn(processor as any, 'determineReversionRole')
        .mockReturnValue(UserRole.STUDENT);
      jest.spyOn(processor as any, 'updateAssignmentStatus')
        .mockResolvedValue(undefined);
      jest.spyOn(processor as any, 'createRoleAssignment')
        .mockResolvedValue(mockCurrentAssignment);
      jest.spyOn(processor as any, 'logRoleExpiration')
        .mockResolvedValue(undefined);
      jest.spyOn(processor as any, 'sendExpirationNotifications')
        .mockResolvedValue(undefined);

      await processor.processRoleExpiration(mockExpiredRole);

      expect(processor['updateAssignmentStatus']).toHaveBeenCalledWith(
        'assignment-1',
        RoleStatus.EXPIRED
      );
      expect(processor['createRoleAssignment']).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          role: UserRole.STUDENT,
          assignedBy: 'system',
          isTemporary: false
        })
      );
    });

    test('should throw error for non-expired role', async () => {
      const futureExpiredRole = {
        ...mockExpiredRole,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
      };

      await expect(processor.processRoleExpiration(futureExpiredRole))
        .rejects.toThrow('Role assignment assignment-1 is not yet expired');
    });

    test('should throw error when no current assignment found', async () => {
      jest.spyOn(processor as any, 'getCurrentRoleAssignment')
        .mockResolvedValue(null);

      await expect(processor.processRoleExpiration(mockExpiredRole))
        .rejects.toThrow('No current role assignment found for user user-1');
    });

    test('should skip processing if assignment is no longer current', async () => {
      const differentAssignment = {
        ...mockCurrentAssignment,
        id: 'different-assignment'
      };

      jest.spyOn(processor as any, 'getCurrentRoleAssignment')
        .mockResolvedValue(differentAssignment);

      // Should not throw, just return silently
      await expect(processor.processRoleExpiration(mockExpiredRole))
        .resolves.toBeUndefined();
    });
  });

  describe('Role Reversion Logic', () => {
    test('should preserve original role when configured', () => {
      const expiredRole: TemporaryRoleExpiration = {
        assignmentId: 'assignment-1',
        userId: 'user-1',
        currentRole: UserRole.TEACHER,
        previousRole: UserRole.STUDENT,
        expiresAt: new Date('2024-01-01'),
        institutionId: 'institution-1'
      };

      const currentAssignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        institutionId: 'institution-1',
        isTemporary: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = processor['determineReversionRole'](expiredRole, currentAssignment);
      expect(result).toBe(UserRole.STUDENT);
    });

    test('should use metadata original role when available', () => {
      const expiredRole: TemporaryRoleExpiration = {
        assignmentId: 'assignment-1',
        userId: 'user-1',
        currentRole: UserRole.TEACHER,
        previousRole: UserRole.STUDENT,
        expiresAt: new Date('2024-01-01'),
        institutionId: 'institution-1'
      };

      const currentAssignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        institutionId: 'institution-1',
        isTemporary: true,
        metadata: { originalRole: UserRole.DEPARTMENT_ADMIN },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = processor['determineReversionRole'](expiredRole, currentAssignment);
      expect(result).toBe(UserRole.DEPARTMENT_ADMIN);
    });

    test('should fall back to default role when preservation disabled', () => {
      const processorWithoutPreservation = new TemporaryRoleProcessor({
        ...mockConfig,
        preserveOriginalRole: false
      });

      const expiredRole: TemporaryRoleExpiration = {
        assignmentId: 'assignment-1',
        userId: 'user-1',
        currentRole: UserRole.TEACHER,
        previousRole: UserRole.DEPARTMENT_ADMIN,
        expiresAt: new Date('2024-01-01'),
        institutionId: 'institution-1'
      };

      const currentAssignment: UserRoleAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date(),
        institutionId: 'institution-1',
        isTemporary: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = processorWithoutPreservation['determineReversionRole'](expiredRole, currentAssignment);
      expect(result).toBe(UserRole.STUDENT); // Default role
    });
  });

  describe('Role Extension', () => {
    let mockAssignment: UserRoleAssignment;

    beforeEach(() => {
      mockAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: UserRole.TEACHER,
        status: RoleStatus.ACTIVE,
        assignedBy: 'admin-1',
        assignedAt: new Date('2023-12-01'),
        expiresAt: new Date('2024-01-01'),
        institutionId: 'institution-1',
        isTemporary: true,
        metadata: {},
        createdAt: new Date('2023-12-01'),
        updatedAt: new Date('2023-12-01')
      };
    });

    test('should extend temporary role successfully', async () => {
      const newExpirationDate = new Date('2024-02-01');
      const extendedBy = 'admin-1';
      const reason = 'Project extension needed';

      jest.spyOn(processor as any, 'getRoleAssignment')
        .mockResolvedValue(mockAssignment);
      jest.spyOn(processor as any, 'updateRoleAssignment')
        .mockResolvedValue({
          ...mockAssignment,
          expiresAt: newExpirationDate,
          metadata: {
            extended: true,
            extensionHistory: [{
              extendedBy,
              extendedAt: expect.any(String),
              previousExpiration: mockAssignment.expiresAt?.toISOString(),
              newExpiration: newExpirationDate.toISOString(),
              reason
            }]
          }
        });
      jest.spyOn(processor as any, 'logRoleExpiration')
        .mockResolvedValue(undefined);

      const result = await processor.extendTemporaryRole(
        'assignment-1',
        newExpirationDate,
        extendedBy,
        reason
      );

      expect(result.expiresAt).toEqual(newExpirationDate);
      expect(result.metadata.extended).toBe(true);
      expect(result.metadata.extensionHistory).toHaveLength(1);
    });

    test('should throw error for non-existent assignment', async () => {
      jest.spyOn(processor as any, 'getRoleAssignment')
        .mockResolvedValue(null);

      await expect(processor.extendTemporaryRole(
        'non-existent',
        new Date(),
        'admin-1',
        'reason'
      )).rejects.toThrow('Role assignment non-existent not found');
    });

    test('should throw error for non-temporary assignment', async () => {
      const nonTemporaryAssignment = {
        ...mockAssignment,
        isTemporary: false
      };

      jest.spyOn(processor as any, 'getRoleAssignment')
        .mockResolvedValue(nonTemporaryAssignment);

      await expect(processor.extendTemporaryRole(
        'assignment-1',
        new Date(),
        'admin-1',
        'reason'
      )).rejects.toThrow('Cannot extend non-temporary role assignment');
    });

    test('should throw error for inactive assignment', async () => {
      const inactiveAssignment = {
        ...mockAssignment,
        status: RoleStatus.EXPIRED
      };

      jest.spyOn(processor as any, 'getRoleAssignment')
        .mockResolvedValue(inactiveAssignment);

      await expect(processor.extendTemporaryRole(
        'assignment-1',
        new Date(),
        'admin-1',
        'reason'
      )).rejects.toThrow('Cannot extend role assignment with status expired');
    });

    test('should throw error for past expiration date', async () => {
      jest.spyOn(processor as any, 'getRoleAssignment')
        .mockResolvedValue(mockAssignment);

      const pastDate = new Date('2023-01-01');

      await expect(processor.extendTemporaryRole(
        'assignment-1',
        pastDate,
        'admin-1',
        'reason'
      )).rejects.toThrow('New expiration date must be in the future');
    });
  });

  describe('Expiration Warnings', () => {
    test('should send expiration warnings for roles expiring soon', async () => {
      const expiringRoles: TemporaryRoleExpiration[] = [
        {
          assignmentId: 'assignment-1',
          userId: 'user-1',
          currentRole: UserRole.TEACHER,
          previousRole: UserRole.STUDENT,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
          institutionId: 'institution-1'
        }
      ];

      jest.spyOn(processor as any, 'getRolesExpiringWithin')
        .mockResolvedValue(expiringRoles);
      jest.spyOn(processor as any, 'sendExpirationWarning')
        .mockResolvedValue(undefined);

      await processor.sendExpirationWarnings(24);

      expect(processor['getRolesExpiringWithin']).toHaveBeenCalledWith(24);
      expect(processor['sendExpirationWarning']).toHaveBeenCalledWith(
        expiringRoles[0],
        24
      );
    });

    test('should handle warning failures gracefully', async () => {
      const expiringRoles: TemporaryRoleExpiration[] = [
        {
          assignmentId: 'assignment-1',
          userId: 'user-1',
          currentRole: UserRole.TEACHER,
          previousRole: UserRole.STUDENT,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          institutionId: 'institution-1'
        }
      ];

      jest.spyOn(processor as any, 'getRolesExpiringWithin')
        .mockResolvedValue(expiringRoles);
      jest.spyOn(processor as any, 'sendExpirationWarning')
        .mockRejectedValue(new Error('Notification failed'));

      // Should not throw
      await expect(processor.sendExpirationWarnings(24))
        .resolves.toBeUndefined();
    });
  });

  describe('Statistics', () => {
    test('should return temporary role statistics', async () => {
      const stats = await processor.getTemporaryRoleStats();

      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('expiringSoon');
      expect(stats).toHaveProperty('expiredToday');
      expect(stats).toHaveProperty('totalProcessed');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.expiringSoon).toBe('number');
      expect(typeof stats.expiredToday).toBe('number');
      expect(typeof stats.totalProcessed).toBe('number');
    });
  });
});