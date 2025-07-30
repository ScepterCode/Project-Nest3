// Unit tests for EnrollmentConfigService
// Tests configuration validation, enforcement logic, and CRUD operations

import { EnrollmentConfigService } from '@/lib/services/enrollment-config';
import { 
  EnrollmentType, 
  PrerequisiteType, 
  RestrictionType,
  ClassEnrollmentConfig 
} from '@/lib/types/enrollment';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('EnrollmentConfigService', () => {
  let service: EnrollmentConfigService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      order: jest.fn().mockReturnThis()
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new EnrollmentConfigService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getClassConfig', () => {
    it('should fetch and parse class configuration correctly', async () => {
      const mockClassData = {
        enrollment_config: {
          autoApprove: false,
          requiresJustification: true,
          allowWaitlist: true,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: false
          }
        },
        capacity: 25,
        waitlist_capacity: 15,
        enrollment_type: 'restricted',
        enrollment_start: '2024-01-15T09:00:00Z',
        enrollment_end: '2024-02-15T23:59:59Z',
        drop_deadline: '2024-03-01',
        withdraw_deadline: '2024-04-01'
      };

      mockSupabase.single.mockResolvedValue({ data: mockClassData, error: null });

      const result = await service.getClassConfig('class-123');

      expect(result).toEqual({
        enrollmentType: EnrollmentType.RESTRICTED,
        capacity: 25,
        waitlistCapacity: 15,
        enrollmentStart: new Date('2024-01-15T09:00:00Z'),
        enrollmentEnd: new Date('2024-02-15T23:59:59Z'),
        dropDeadline: new Date('2024-03-01'),
        withdrawDeadline: new Date('2024-04-01'),
        autoApprove: false,
        requiresJustification: true,
        allowWaitlist: true,
        maxWaitlistPosition: null,
        notificationSettings: {
          enrollmentConfirmation: true,
          waitlistUpdates: true,
          deadlineReminders: true,
          capacityAlerts: false
        }
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('classes');
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'class-123');
    });

    it('should handle missing enrollment_config gracefully', async () => {
      const mockClassData = {
        enrollment_config: null,
        capacity: 30,
        waitlist_capacity: 10,
        enrollment_type: 'open',
        enrollment_start: null,
        enrollment_end: null,
        drop_deadline: null,
        withdraw_deadline: null
      };

      mockSupabase.single.mockResolvedValue({ data: mockClassData, error: null });

      const result = await service.getClassConfig('class-123');

      expect(result?.enrollmentType).toBe(EnrollmentType.OPEN);
      expect(result?.autoApprove).toBe(true);
      expect(result?.requiresJustification).toBe(false);
      expect(result?.notificationSettings.enrollmentConfirmation).toBe(true);
    });

    it('should throw error when class not found', async () => {
      mockSupabase.single.mockResolvedValue({ 
        data: null, 
        error: { message: 'Class not found' } 
      });

      await expect(service.getClassConfig('invalid-class'))
        .rejects.toThrow('Failed to fetch class configuration: Class not found');
    });
  });

  describe('updateClassConfig', () => {
    beforeEach(() => {
      // Mock getClassConfig for validation
      jest.spyOn(service, 'getClassConfig').mockResolvedValue({
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        waitlistCapacity: 10,
        autoApprove: true,
        requiresJustification: false,
        allowWaitlist: true,
        maxWaitlistPosition: null,
        notificationSettings: {
          enrollmentConfirmation: true,
          waitlistUpdates: true,
          deadlineReminders: true,
          capacityAlerts: true
        }
      });
    });

    it('should update configuration successfully', async () => {
      const updates = {
        enrollmentType: EnrollmentType.RESTRICTED,
        capacity: 25,
        requiresJustification: true
      };

      mockSupabase.update.mockResolvedValue({ error: null });
      
      // Mock the return call to getClassConfig
      (service.getClassConfig as jest.Mock)
        .mockResolvedValueOnce({
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          autoApprove: true,
          requiresJustification: false,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        })
        .mockResolvedValueOnce({
          enrollmentType: EnrollmentType.RESTRICTED,
          capacity: 25,
          waitlistCapacity: 10,
          autoApprove: false,
          requiresJustification: true,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        });

      const result = await service.updateClassConfig('class-123', updates, 'user-123');

      expect(result.enrollmentType).toBe(EnrollmentType.RESTRICTED);
      expect(result.capacity).toBe(25);
      expect(result.autoApprove).toBe(false);
      expect(result.requiresJustification).toBe(true);

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollment_type: EnrollmentType.RESTRICTED,
          capacity: 25,
          enrollment_config: expect.objectContaining({
            autoApprove: false,
            requiresJustification: true
          })
        })
      );
    });

    it('should auto-adjust settings based on enrollment type', async () => {
      const updates = {
        enrollmentType: EnrollmentType.OPEN
      };

      mockSupabase.update.mockResolvedValue({ error: null });
      (service.getClassConfig as jest.Mock)
        .mockResolvedValueOnce({
          enrollmentType: EnrollmentType.RESTRICTED,
          capacity: 30,
          waitlistCapacity: 10,
          autoApprove: false,
          requiresJustification: true,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        })
        .mockResolvedValueOnce({
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          autoApprove: true,
          requiresJustification: false,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        });

      await service.updateClassConfig('class-123', updates, 'user-123');

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollment_config: expect.objectContaining({
            autoApprove: true,
            requiresJustification: false
          })
        })
      );
    });

    it('should throw error for invalid configuration', async () => {
      const updates = {
        capacity: -5 // Invalid capacity
      };

      await expect(service.updateClassConfig('class-123', updates, 'user-123'))
        .rejects.toThrow('Configuration validation failed');
    });
  });

  describe('validateConfig', () => {
    beforeEach(() => {
      mockSupabase.select.mockResolvedValue({ data: [], error: null });
    });

    it('should validate capacity correctly', async () => {
      const result = await service.validateConfig('class-123', { capacity: 0 });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'capacity',
        message: 'Class capacity must be at least 1',
        code: 'INVALID_CAPACITY'
      });
    });

    it('should validate waitlist capacity', async () => {
      const result = await service.validateConfig('class-123', { waitlistCapacity: -1 });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'waitlistCapacity',
        message: 'Waitlist capacity cannot be negative',
        code: 'INVALID_WAITLIST_CAPACITY'
      });
    });

    it('should validate date ranges', async () => {
      const result = await service.validateConfig('class-123', {
        enrollmentStart: new Date('2024-02-01'),
        enrollmentEnd: new Date('2024-01-01') // End before start
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'enrollmentEnd',
        message: 'Enrollment end date must be after start date',
        code: 'INVALID_DATE_RANGE'
      });
    });

    it('should validate deadline order', async () => {
      const result = await service.validateConfig('class-123', {
        dropDeadline: new Date('2024-03-01'),
        withdrawDeadline: new Date('2024-02-01') // Withdraw before drop
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'withdrawDeadline',
        message: 'Withdraw deadline must be after drop deadline',
        code: 'INVALID_DEADLINE_ORDER'
      });
    });

    it('should validate max waitlist position', async () => {
      const result = await service.validateConfig('class-123', {
        waitlistCapacity: 10,
        maxWaitlistPosition: 15 // Greater than capacity
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'maxWaitlistPosition',
        message: 'Max waitlist position cannot exceed waitlist capacity',
        code: 'INVALID_WAITLIST_POSITION'
      });
    });

    it('should warn about incompatible settings', async () => {
      const result = await service.validateConfig('class-123', {
        enrollmentType: EnrollmentType.INVITATION_ONLY,
        autoApprove: true
      });
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        field: 'autoApprove',
        message: 'Auto-approve is not applicable for invitation-only classes',
        code: 'INCOMPATIBLE_SETTING'
      });
    });

    it('should warn when reducing capacity below current enrollment', async () => {
      // Mock current enrollment of 20 students
      mockSupabase.select.mockResolvedValue({ 
        data: new Array(20).fill({ id: 'student-id' }), 
        error: null 
      });

      const result = await service.validateConfig('class-123', { capacity: 15 });
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        field: 'capacity',
        message: 'Reducing capacity below current enrollment (20 students)',
        code: 'CAPACITY_BELOW_ENROLLMENT'
      });
    });

    it('should pass validation for valid configuration', async () => {
      const result = await service.validateConfig('class-123', {
        enrollmentType: EnrollmentType.RESTRICTED,
        capacity: 25,
        waitlistCapacity: 10,
        enrollmentStart: new Date('2024-01-01'),
        enrollmentEnd: new Date('2024-02-01'),
        dropDeadline: new Date('2024-02-15'),
        withdrawDeadline: new Date('2024-03-15'),
        maxWaitlistPosition: 5
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Prerequisites Management', () => {
    describe('addPrerequisite', () => {
      it('should add prerequisite successfully', async () => {
        const prerequisiteData = {
          type: PrerequisiteType.COURSE,
          requirement: 'MATH101',
          description: 'Introduction to Mathematics',
          strict: true
        };

        const mockPrerequisite = {
          id: 'prereq-123',
          class_id: 'class-123',
          ...prerequisiteData,
          created_at: new Date(),
          updated_at: new Date()
        };

        mockSupabase.single.mockResolvedValue({ data: mockPrerequisite, error: null });

        const result = await service.addPrerequisite('class-123', prerequisiteData, 'user-123');

        expect(result).toEqual(mockPrerequisite);
        expect(mockSupabase.insert).toHaveBeenCalledWith({
          class_id: 'class-123',
          type: PrerequisiteType.COURSE,
          requirement: 'MATH101',
          description: 'Introduction to Mathematics',
          strict: true
        });
      });

      it('should validate prerequisite data before adding', async () => {
        const invalidPrerequisite = {
          type: PrerequisiteType.COURSE,
          requirement: '', // Empty requirement
          description: 'Test',
          strict: true
        };

        await expect(service.addPrerequisite('class-123', invalidPrerequisite, 'user-123'))
          .rejects.toThrow('Prerequisite validation failed');
      });

      it('should validate GPA prerequisite format', async () => {
        const gpaPrerequisite = {
          type: PrerequisiteType.GPA,
          requirement: '5.0', // Invalid GPA > 4.0
          description: 'Minimum GPA',
          strict: true
        };

        await expect(service.addPrerequisite('class-123', gpaPrerequisite, 'user-123'))
          .rejects.toThrow('GPA requirement must be a number between 0 and 4.0');
      });

      it('should validate year prerequisite format', async () => {
        const yearPrerequisite = {
          type: PrerequisiteType.YEAR,
          requirement: '10', // Invalid year > 8
          description: 'Year level',
          strict: true
        };

        await expect(service.addPrerequisite('class-123', yearPrerequisite, 'user-123'))
          .rejects.toThrow('Year requirement must be a number between 1 and 8');
      });
    });

    describe('getPrerequisites', () => {
      it('should fetch prerequisites for a class', async () => {
        const mockPrerequisites = [
          {
            id: 'prereq-1',
            class_id: 'class-123',
            type: PrerequisiteType.COURSE,
            requirement: 'MATH101',
            description: 'Math prerequisite',
            strict: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            id: 'prereq-2',
            class_id: 'class-123',
            type: PrerequisiteType.GPA,
            requirement: '3.0',
            description: 'Minimum GPA',
            strict: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        ];

        mockSupabase.order.mockResolvedValue({ data: mockPrerequisites, error: null });

        const result = await service.getPrerequisites('class-123');

        expect(result).toEqual(mockPrerequisites);
        expect(mockSupabase.from).toHaveBeenCalledWith('class_prerequisites');
        expect(mockSupabase.eq).toHaveBeenCalledWith('class_id', 'class-123');
        expect(mockSupabase.order).toHaveBeenCalledWith('created_at');
      });
    });

    describe('updatePrerequisite', () => {
      it('should update prerequisite successfully', async () => {
        const updates = {
          requirement: 'MATH102',
          description: 'Updated math prerequisite'
        };

        const mockUpdatedPrerequisite = {
          id: 'prereq-123',
          class_id: 'class-123',
          type: PrerequisiteType.COURSE,
          requirement: 'MATH102',
          description: 'Updated math prerequisite',
          strict: true,
          created_at: new Date(),
          updated_at: new Date()
        };

        mockSupabase.single.mockResolvedValue({ data: mockUpdatedPrerequisite, error: null });

        const result = await service.updatePrerequisite('prereq-123', updates, 'user-123');

        expect(result).toEqual(mockUpdatedPrerequisite);
        expect(mockSupabase.update).toHaveBeenCalledWith({
          ...updates,
          updated_at: expect.any(String)
        });
        expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'prereq-123');
      });
    });

    describe('removePrerequisite', () => {
      it('should remove prerequisite successfully', async () => {
        mockSupabase.single.mockResolvedValue({ 
          data: { class_id: 'class-123' }, 
          error: null 
        });
        mockSupabase.delete.mockResolvedValue({ error: null });

        await service.removePrerequisite('prereq-123', 'user-123');

        expect(mockSupabase.delete).toHaveBeenCalled();
        expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'prereq-123');
      });
    });
  });

  describe('Restrictions Management', () => {
    describe('addRestriction', () => {
      it('should add restriction successfully', async () => {
        const restrictionData = {
          type: RestrictionType.YEAR_LEVEL,
          condition: 'Senior',
          description: 'Only seniors allowed',
          overridable: true
        };

        const mockRestriction = {
          id: 'restriction-123',
          class_id: 'class-123',
          ...restrictionData,
          created_at: new Date(),
          updated_at: new Date()
        };

        mockSupabase.single.mockResolvedValue({ data: mockRestriction, error: null });

        const result = await service.addRestriction('class-123', restrictionData, 'user-123');

        expect(result).toEqual(mockRestriction);
        expect(mockSupabase.insert).toHaveBeenCalledWith({
          class_id: 'class-123',
          type: RestrictionType.YEAR_LEVEL,
          condition: 'Senior',
          description: 'Only seniors allowed',
          overridable: true
        });
      });

      it('should validate restriction data before adding', async () => {
        const invalidRestriction = {
          type: RestrictionType.GPA,
          condition: '', // Empty condition
          description: 'Test',
          overridable: false
        };

        await expect(service.addRestriction('class-123', invalidRestriction, 'user-123'))
          .rejects.toThrow('Restriction validation failed');
      });

      it('should validate GPA restriction format', async () => {
        const gpaRestriction = {
          type: RestrictionType.GPA,
          condition: '5.0', // Invalid GPA > 4.0
          description: 'Minimum GPA',
          overridable: false
        };

        await expect(service.addRestriction('class-123', gpaRestriction, 'user-123'))
          .rejects.toThrow('GPA condition must be a number between 0 and 4.0');
      });
    });

    describe('getRestrictions', () => {
      it('should fetch restrictions for a class', async () => {
        const mockRestrictions = [
          {
            id: 'restriction-1',
            class_id: 'class-123',
            type: RestrictionType.YEAR_LEVEL,
            condition: 'Senior',
            description: 'Senior only',
            overridable: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        ];

        mockSupabase.order.mockResolvedValue({ data: mockRestrictions, error: null });

        const result = await service.getRestrictions('class-123');

        expect(result).toEqual(mockRestrictions);
        expect(mockSupabase.from).toHaveBeenCalledWith('enrollment_restrictions');
        expect(mockSupabase.eq).toHaveBeenCalledWith('class_id', 'class-123');
      });
    });
  });

  describe('Enrollment Status Checks', () => {
    describe('isEnrollmentOpen', () => {
      it('should return true when enrollment is open', async () => {
        const mockConfig = {
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          enrollmentStart: new Date(Date.now() - 86400000), // Yesterday
          enrollmentEnd: new Date(Date.now() + 86400000), // Tomorrow
          autoApprove: true,
          requiresJustification: false,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        };

        jest.spyOn(service, 'getClassConfig').mockResolvedValue(mockConfig);

        const result = await service.isEnrollmentOpen('class-123');
        expect(result).toBe(true);
      });

      it('should return false when enrollment has not started', async () => {
        const mockConfig = {
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          enrollmentStart: new Date(Date.now() + 86400000), // Tomorrow
          enrollmentEnd: new Date(Date.now() + 172800000), // Day after tomorrow
          autoApprove: true,
          requiresJustification: false,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        };

        jest.spyOn(service, 'getClassConfig').mockResolvedValue(mockConfig);

        const result = await service.isEnrollmentOpen('class-123');
        expect(result).toBe(false);
      });

      it('should return false when enrollment has ended', async () => {
        const mockConfig = {
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          enrollmentStart: new Date(Date.now() - 172800000), // Day before yesterday
          enrollmentEnd: new Date(Date.now() - 86400000), // Yesterday
          autoApprove: true,
          requiresJustification: false,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        };

        jest.spyOn(service, 'getClassConfig').mockResolvedValue(mockConfig);

        const result = await service.isEnrollmentOpen('class-123');
        expect(result).toBe(false);
      });
    });

    describe('hasCapacity', () => {
      it('should return true when class has available spots', async () => {
        const mockConfig = {
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          autoApprove: true,
          requiresJustification: false,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        };

        jest.spyOn(service, 'getClassConfig').mockResolvedValue(mockConfig);
        mockSupabase.select.mockResolvedValue({ 
          data: new Array(25).fill({ id: 'enrollment-id' }), // 25 enrollments
          error: null 
        });

        const result = await service.hasCapacity('class-123');
        expect(result).toBe(true);
      });

      it('should return false when class is at capacity', async () => {
        const mockConfig = {
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          autoApprove: true,
          requiresJustification: false,
          allowWaitlist: true,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        };

        jest.spyOn(service, 'getClassConfig').mockResolvedValue(mockConfig);
        mockSupabase.select.mockResolvedValue({ 
          data: new Array(30).fill({ id: 'enrollment-id' }), // 30 enrollments (at capacity)
          error: null 
        });

        const result = await service.hasCapacity('class-123');
        expect(result).toBe(false);
      });
    });

    describe('hasWaitlistCapacity', () => {
      it('should return true when waitlist has available spots', async () => {
        const mockConfig = {
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          allowWaitlist: true,
          autoApprove: true,
          requiresJustification: false,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        };

        jest.spyOn(service, 'getClassConfig').mockResolvedValue(mockConfig);
        mockSupabase.select.mockResolvedValue({ 
          data: new Array(5).fill({ id: 'waitlist-id' }), // 5 waitlist entries
          error: null 
        });

        const result = await service.hasWaitlistCapacity('class-123');
        expect(result).toBe(true);
      });

      it('should return false when waitlist is disabled', async () => {
        const mockConfig = {
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          allowWaitlist: false, // Waitlist disabled
          autoApprove: true,
          requiresJustification: false,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        };

        jest.spyOn(service, 'getClassConfig').mockResolvedValue(mockConfig);

        const result = await service.hasWaitlistCapacity('class-123');
        expect(result).toBe(false);
      });

      it('should return false when waitlist is at capacity', async () => {
        const mockConfig = {
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 10,
          allowWaitlist: true,
          autoApprove: true,
          requiresJustification: false,
          maxWaitlistPosition: null,
          notificationSettings: {
            enrollmentConfirmation: true,
            waitlistUpdates: true,
            deadlineReminders: true,
            capacityAlerts: true
          }
        };

        jest.spyOn(service, 'getClassConfig').mockResolvedValue(mockConfig);
        mockSupabase.select.mockResolvedValue({ 
          data: new Array(10).fill({ id: 'waitlist-id' }), // 10 waitlist entries (at capacity)
          error: null 
        });

        const result = await service.hasWaitlistCapacity('class-123');
        expect(result).toBe(false);
      });
    });
  });
});