// Tests for enrollment configuration enforcement logic
// Tests capacity enforcement, deadline validation, and prerequisite checking

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

describe('EnrollmentConfigService - Enforcement Logic', () => {
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

  describe('Capacity Enforcement', () => {
    it('should correctly identify when class has capacity', async () => {
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
      
      // Mock 25 current enrollments (below capacity of 30)
      mockSupabase.select.mockResolvedValue({ 
        data: new Array(25).fill({ id: 'enrollment-id' }), 
        error: null 
      });

      const hasCapacity = await service.hasCapacity('class-123');
      expect(hasCapacity).toBe(true);
    });

    it('should correctly identify when class is at capacity', async () => {
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
      
      // Mock 30 current enrollments (at capacity)
      mockSupabase.select.mockResolvedValue({ 
        data: new Array(30).fill({ id: 'enrollment-id' }), 
        error: null 
      });

      const hasCapacity = await service.hasCapacity('class-123');
      expect(hasCapacity).toBe(false);
    });

    it('should correctly identify when class is over capacity', async () => {
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
      
      // Mock 35 current enrollments (over capacity)
      mockSupabase.select.mockResolvedValue({ 
        data: new Array(35).fill({ id: 'enrollment-id' }), 
        error: null 
      });

      const hasCapacity = await service.hasCapacity('class-123');
      expect(hasCapacity).toBe(false);
    });
  });

  describe('Waitlist Capacity Enforcement', () => {
    it('should correctly identify when waitlist has capacity', async () => {
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
      
      // Mock 5 waitlist entries (below capacity of 10)
      mockSupabase.select.mockResolvedValue({ 
        data: new Array(5).fill({ id: 'waitlist-id' }), 
        error: null 
      });

      const hasWaitlistCapacity = await service.hasWaitlistCapacity('class-123');
      expect(hasWaitlistCapacity).toBe(true);
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

      const hasWaitlistCapacity = await service.hasWaitlistCapacity('class-123');
      expect(hasWaitlistCapacity).toBe(false);
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
      
      // Mock 10 waitlist entries (at capacity)
      mockSupabase.select.mockResolvedValue({ 
        data: new Array(10).fill({ id: 'waitlist-id' }), 
        error: null 
      });

      const hasWaitlistCapacity = await service.hasWaitlistCapacity('class-123');
      expect(hasWaitlistCapacity).toBe(false);
    });
  });

  describe('Enrollment Period Enforcement', () => {
    it('should return true when enrollment is within the allowed period', async () => {
      const now = new Date();
      const mockConfig = {
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        waitlistCapacity: 10,
        enrollmentStart: new Date(now.getTime() - 86400000), // Yesterday
        enrollmentEnd: new Date(now.getTime() + 86400000), // Tomorrow
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

      const isOpen = await service.isEnrollmentOpen('class-123');
      expect(isOpen).toBe(true);
    });

    it('should return false when enrollment has not started', async () => {
      const now = new Date();
      const mockConfig = {
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        waitlistCapacity: 10,
        enrollmentStart: new Date(now.getTime() + 86400000), // Tomorrow
        enrollmentEnd: new Date(now.getTime() + 172800000), // Day after tomorrow
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

      const isOpen = await service.isEnrollmentOpen('class-123');
      expect(isOpen).toBe(false);
    });

    it('should return false when enrollment has ended', async () => {
      const now = new Date();
      const mockConfig = {
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        waitlistCapacity: 10,
        enrollmentStart: new Date(now.getTime() - 172800000), // Day before yesterday
        enrollmentEnd: new Date(now.getTime() - 86400000), // Yesterday
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

      const isOpen = await service.isEnrollmentOpen('class-123');
      expect(isOpen).toBe(false);
    });

    it('should return true when no enrollment period is set', async () => {
      const mockConfig = {
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        waitlistCapacity: 10,
        enrollmentStart: undefined,
        enrollmentEnd: undefined,
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

      const isOpen = await service.isEnrollmentOpen('class-123');
      expect(isOpen).toBe(true);
    });
  });

  describe('Configuration Validation Edge Cases', () => {
    it('should handle null/undefined values in configuration', async () => {
      const result = await service.validateConfig('class-123', {
        capacity: undefined,
        waitlistCapacity: undefined,
        enrollmentStart: undefined,
        enrollmentEnd: undefined
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate complex date scenarios', async () => {
      // Same date for start and end
      const result1 = await service.validateConfig('class-123', {
        enrollmentStart: new Date('2024-01-01T00:00:00Z'),
        enrollmentEnd: new Date('2024-01-01T00:00:00Z')
      });

      expect(result1.valid).toBe(false);
      expect(result1.errors).toContainEqual({
        field: 'enrollmentEnd',
        message: 'Enrollment end date must be after start date',
        code: 'INVALID_DATE_RANGE'
      });

      // Very close dates (1 minute apart)
      const result2 = await service.validateConfig('class-123', {
        enrollmentStart: new Date('2024-01-01T00:00:00Z'),
        enrollmentEnd: new Date('2024-01-01T00:01:00Z')
      });

      expect(result2.valid).toBe(true);
    });

    it('should validate extreme capacity values', async () => {
      mockSupabase.select.mockResolvedValue({ data: [], error: null });

      // Very large capacity
      const result1 = await service.validateConfig('class-123', {
        capacity: 10000
      });
      expect(result1.valid).toBe(true);

      // Capacity of 1
      const result2 = await service.validateConfig('class-123', {
        capacity: 1
      });
      expect(result2.valid).toBe(true);

      // Zero capacity
      const result3 = await service.validateConfig('class-123', {
        capacity: 0
      });
      expect(result3.valid).toBe(false);
    });

    it('should validate waitlist position limits correctly', async () => {
      // Max position equal to capacity
      const result1 = await service.validateConfig('class-123', {
        waitlistCapacity: 10,
        maxWaitlistPosition: 10
      });
      expect(result1.valid).toBe(true);

      // Max position greater than capacity
      const result2 = await service.validateConfig('class-123', {
        waitlistCapacity: 10,
        maxWaitlistPosition: 15
      });
      expect(result2.valid).toBe(false);

      // Max position of 1
      const result3 = await service.validateConfig('class-123', {
        waitlistCapacity: 10,
        maxWaitlistPosition: 1
      });
      expect(result3.valid).toBe(true);
    });
  });

  describe('Prerequisite Validation Edge Cases', () => {
    it('should validate different GPA formats', () => {
      // Valid GPA values
      const validGPAs = ['0.0', '2.5', '3.75', '4.0'];
      validGPAs.forEach(gpa => {
        const result = (service as any).validatePrerequisite({
          type: PrerequisiteType.GPA,
          requirement: gpa,
          description: 'GPA requirement',
          strict: true
        });
        expect(result.valid).toBe(true);
      });

      // Invalid GPA values
      const invalidGPAs = ['-1.0', '4.1', '5.0', 'abc', ''];
      invalidGPAs.forEach(gpa => {
        const result = (service as any).validatePrerequisite({
          type: PrerequisiteType.GPA,
          requirement: gpa,
          description: 'GPA requirement',
          strict: true
        });
        expect(result.valid).toBe(false);
      });
    });

    it('should validate different year level formats', () => {
      // Valid year levels
      const validYears = ['1', '2', '3', '4', '5', '6', '7', '8'];
      validYears.forEach(year => {
        const result = (service as any).validatePrerequisite({
          type: PrerequisiteType.YEAR,
          requirement: year,
          description: 'Year requirement',
          strict: true
        });
        expect(result.valid).toBe(true);
      });

      // Invalid year levels
      const invalidYears = ['0', '9', '10', '-1', 'abc', ''];
      invalidYears.forEach(year => {
        const result = (service as any).validatePrerequisite({
          type: PrerequisiteType.YEAR,
          requirement: year,
          description: 'Year requirement',
          strict: true
        });
        expect(result.valid).toBe(false);
      });
    });

    it('should validate course code formats', () => {
      // Valid course codes
      const validCodes = ['MATH101', 'CS-201', 'PHYS_301', 'BIO1001'];
      validCodes.forEach(code => {
        const result = (service as any).validatePrerequisite({
          type: PrerequisiteType.COURSE,
          requirement: code,
          description: 'Course requirement',
          strict: true
        });
        expect(result.valid).toBe(true);
      });

      // Invalid course codes (too short)
      const invalidCodes = ['', 'A', 'AB'];
      invalidCodes.forEach(code => {
        const result = (service as any).validatePrerequisite({
          type: PrerequisiteType.COURSE,
          requirement: code,
          description: 'Course requirement',
          strict: true
        });
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Restriction Validation Edge Cases', () => {
    it('should validate different restriction condition formats', () => {
      // Valid GPA restrictions
      const validGPARestrictions = ['2.0', '3.5', '4.0'];
      validGPARestrictions.forEach(gpa => {
        const result = (service as any).validateRestriction({
          type: RestrictionType.GPA,
          condition: gpa,
          description: 'GPA restriction',
          overridable: false
        });
        expect(result.valid).toBe(true);
      });

      // Valid year level restrictions
      const validYearRestrictions = ['1', '4', '8'];
      validYearRestrictions.forEach(year => {
        const result = (service as any).validateRestriction({
          type: RestrictionType.YEAR_LEVEL,
          condition: year,
          description: 'Year restriction',
          overridable: false
        });
        expect(result.valid).toBe(true);
      });

      // Valid custom restrictions (no format validation)
      const result = (service as any).validateRestriction({
        type: RestrictionType.CUSTOM,
        condition: 'Any custom condition text',
        description: 'Custom restriction',
        overridable: true
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Configuration Update Scenarios', () => {
    it('should handle partial configuration updates', async () => {
      const currentConfig = {
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

      jest.spyOn(service, 'getClassConfig').mockResolvedValue(currentConfig);
      mockSupabase.update.mockResolvedValue({ error: null });

      // Only update capacity
      const updates = { capacity: 25 };
      
      await service.updateClassConfig('class-123', updates, 'user-123');

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          capacity: 25,
          enrollment_config: expect.objectContaining({
            autoApprove: true,
            requiresJustification: false,
            allowWaitlist: true
          })
        })
      );
    });

    it('should handle enrollment type changes with cascading effects', async () => {
      const currentConfig = {
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

      jest.spyOn(service, 'getClassConfig').mockResolvedValue(currentConfig);
      mockSupabase.update.mockResolvedValue({ error: null });

      // Change from OPEN to RESTRICTED
      const updates = { enrollmentType: EnrollmentType.RESTRICTED };
      
      await service.updateClassConfig('class-123', updates, 'user-123');

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollment_type: EnrollmentType.RESTRICTED,
          enrollment_config: expect.objectContaining({
            autoApprove: false,
            requiresJustification: true
          })
        })
      );
    });
  });
});