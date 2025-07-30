import { AccommodationService } from '@/lib/services/accommodation-service';
import { createClient } from '@/lib/supabase/server';
import {
  StudentAccommodation,
  ClassAccessibility,
  AccommodationType,
  AccessibilityFeature,
  PriorityEnrollmentRequest
} from '@/lib/types/accommodation';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('AccommodationService', () => {
  let accommodationService: AccommodationService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis()
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    accommodationService = new AccommodationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAccommodationEligibility', () => {
    const mockStudentAccommodations: StudentAccommodation[] = [
      {
        id: 'acc-1',
        studentId: 'student-1',
        accommodationType: 'mobility',
        description: 'Wheelchair accessibility required',
        documentationVerified: true,
        priorityLevel: 3,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      },
      {
        id: 'acc-2',
        studentId: 'student-1',
        accommodationType: 'visual',
        description: 'Large print materials needed',
        documentationVerified: true,
        priorityLevel: 2,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }
    ];

    const mockClassFeatures: ClassAccessibility[] = [
      {
        id: 'feat-1',
        classId: 'class-1',
        accessibilityType: 'wheelchair_accessible',
        available: true,
        description: 'Fully wheelchair accessible classroom',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const mockReservations = [
      {
        id: 'res-1',
        class_id: 'class-1',
        accommodation_type: 'mobility',
        reserved_spots: 2,
        used_spots: 1
      }
    ];

    it('should return eligibility result for student with accommodations', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'student_accommodations') {
          return {
            ...mockSupabase,
            data: mockStudentAccommodations,
            error: null
          };
        }
        if (table === 'accommodation_reservations') {
          return {
            ...mockSupabase,
            data: mockReservations,
            error: null
          };
        }
        if (table === 'class_accessibility') {
          return {
            ...mockSupabase,
            data: mockClassFeatures,
            error: null
          };
        }
        return mockSupabase;
      });

      const result = await accommodationService.checkAccommodationEligibility('student-1', 'class-1');

      expect(result.eligible).toBe(true);
      expect(result.accommodations).toHaveLength(2);
      expect(result.priorityLevel).toBe(3);
      expect(result.reservedCapacityAvailable).toBe(true);
      expect(result.supportContactInfo).toBeDefined();
    });

    it('should return not eligible for student without accommodations', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'student_accommodations') {
          return {
            ...mockSupabase,
            data: [],
            error: null
          };
        }
        return mockSupabase;
      });

      const result = await accommodationService.checkAccommodationEligibility('student-2', 'class-1');

      expect(result.eligible).toBe(false);
      expect(result.accommodations).toHaveLength(0);
      expect(result.priorityLevel).toBe(0);
      expect(result.reservedCapacityAvailable).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.from.mockImplementation(() => ({
        ...mockSupabase,
        data: null,
        error: new Error('Database connection failed')
      }));

      await expect(
        accommodationService.checkAccommodationEligibility('student-1', 'class-1')
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('processPriorityEnrollment', () => {
    const mockPriorityRequest: PriorityEnrollmentRequest = {
      studentId: 'student-1',
      classId: 'class-1',
      accommodationIds: ['acc-1', 'acc-2'],
      justification: 'Need wheelchair accessible seating',
      priorityLevel: 3,
      supportingDocumentation: [],
      urgency: 'high'
    };

    it('should successfully process priority enrollment with reserved capacity', async () => {
      // Mock eligibility check
      jest.spyOn(accommodationService, 'checkAccommodationEligibility').mockResolvedValue({
        eligible: true,
        accommodations: [],
        priorityLevel: 3,
        reservedCapacityAvailable: true,
        requiredArrangements: [],
        alternativeOptions: []
      });

      // Mock enrollment with reserved capacity
      jest.spyOn(accommodationService as any, 'enrollWithReservedCapacity').mockResolvedValue({
        success: true,
        enrollmentId: 'enrollment-1'
      });

      // Mock accommodation arrangements creation
      jest.spyOn(accommodationService as any, 'createAccommodationArrangements').mockResolvedValue(undefined);

      const result = await accommodationService.processPriorityEnrollment(mockPriorityRequest);

      expect(result.success).toBe(true);
      expect(result.enrollmentId).toBe('enrollment-1');
      expect(result.message).toContain('reserved accommodation capacity');
    });

    it('should process regular enrollment when no reserved capacity', async () => {
      // Mock eligibility check
      jest.spyOn(accommodationService, 'checkAccommodationEligibility').mockResolvedValue({
        eligible: true,
        accommodations: [],
        priorityLevel: 2,
        reservedCapacityAvailable: false,
        requiredArrangements: [],
        alternativeOptions: []
      });

      // Mock class capacity check
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'classes') {
          return {
            ...mockSupabase,
            data: { capacity: 30, current_enrollment: 25 },
            error: null
          };
        }
        if (table === 'enrollments') {
          return {
            ...mockSupabase,
            data: { id: 'enrollment-2', student_id: 'student-1', class_id: 'class-1' },
            error: null
          };
        }
        return mockSupabase;
      });

      jest.spyOn(accommodationService as any, 'createAccommodationArrangements').mockResolvedValue(undefined);

      const result = await accommodationService.processPriorityEnrollment(mockPriorityRequest);

      expect(result.success).toBe(true);
      expect(result.enrollmentId).toBe('enrollment-2');
      expect(result.message).toContain('priority accommodation processing');
    });

    it('should reject enrollment for ineligible student', async () => {
      jest.spyOn(accommodationService, 'checkAccommodationEligibility').mockResolvedValue({
        eligible: false,
        accommodations: [],
        priorityLevel: 0,
        reservedCapacityAvailable: false,
        requiredArrangements: [],
        alternativeOptions: []
      });

      const result = await accommodationService.processPriorityEnrollment(mockPriorityRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('does not have valid accommodations');
    });

    it('should reject enrollment when class is at capacity', async () => {
      jest.spyOn(accommodationService, 'checkAccommodationEligibility').mockResolvedValue({
        eligible: true,
        accommodations: [],
        priorityLevel: 2,
        reservedCapacityAvailable: false,
        requiredArrangements: [],
        alternativeOptions: []
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'classes') {
          return {
            ...mockSupabase,
            data: { capacity: 30, current_enrollment: 30 },
            error: null
          };
        }
        return mockSupabase;
      });

      const result = await accommodationService.processPriorityEnrollment(mockPriorityRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('at capacity');
    });
  });

  describe('assessAccessibilityCompatibility', () => {
    const mockAccommodations: StudentAccommodation[] = [
      {
        id: 'acc-1',
        studentId: 'student-1',
        accommodationType: 'mobility',
        description: 'Wheelchair accessibility',
        documentationVerified: true,
        priorityLevel: 3,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      },
      {
        id: 'acc-2',
        studentId: 'student-1',
        accommodationType: 'hearing',
        description: 'Hearing impairment',
        documentationVerified: true,
        priorityLevel: 2,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }
    ];

    const mockClassFeatures: ClassAccessibility[] = [
      {
        id: 'feat-1',
        classId: 'class-1',
        accessibilityType: 'wheelchair_accessible',
        available: true,
        description: 'Wheelchair accessible',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'feat-2',
        classId: 'class-1',
        accessibilityType: 'visual_aids',
        available: true,
        description: 'Visual aids available',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    it('should assess compatibility between accommodations and class features', async () => {
      const assessment = await accommodationService.assessAccessibilityCompatibility(
        mockAccommodations,
        mockClassFeatures
      );

      expect(assessment.classId).toBe('class-1');
      expect(assessment.studentAccommodations).toHaveLength(2);
      expect(assessment.classFeatures).toHaveLength(2);
      expect(assessment.compatibility).toHaveLength(2);
      
      // Mobility accommodation should be compatible with wheelchair_accessible feature
      const mobilityCompatibility = assessment.compatibility.find(c => c.accommodationType === 'mobility');
      expect(mobilityCompatibility?.compatible).toBe(true);
      
      // Hearing accommodation should require arrangement (no hearing loop available)
      const hearingCompatibility = assessment.compatibility.find(c => c.accommodationType === 'hearing');
      expect(hearingCompatibility?.requiresArrangement).toBe(true);
    });

    it('should generate recommended arrangements for incompatible features', async () => {
      const incompatibleFeatures: ClassAccessibility[] = [
        {
          id: 'feat-1',
          classId: 'class-1',
          accessibilityType: 'good_lighting',
          available: true,
          description: 'Good lighting',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const assessment = await accommodationService.assessAccessibilityCompatibility(
        mockAccommodations,
        incompatibleFeatures
      );

      expect(assessment.recommendedArrangements.length).toBeGreaterThan(0);
      expect(assessment.supportRequired).toBe(true);
    });
  });

  describe('getStudentAccommodations', () => {
    it('should retrieve active accommodations for student', async () => {
      const mockAccommodations = [
        {
          id: 'acc-1',
          student_id: 'student-1',
          accommodation_type: 'mobility',
          description: 'Wheelchair accessibility',
          documentation_verified: true,
          priority_level: 3,
          active: true
        }
      ];

      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: mockAccommodations,
        error: null
      });

      const result = await accommodationService.getStudentAccommodations('student-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('student_accommodations');
      expect(mockSupabase.eq).toHaveBeenCalledWith('student_id', 'student-1');
      expect(mockSupabase.eq).toHaveBeenCalledWith('active', true);
      expect(result).toEqual(mockAccommodations);
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: null,
        error: new Error('Database error')
      });

      await expect(
        accommodationService.getStudentAccommodations('student-1')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getClassAccessibilityFeatures', () => {
    it('should retrieve accessibility features for class', async () => {
      const mockFeatures = [
        {
          id: 'feat-1',
          class_id: 'class-1',
          accessibility_type: 'wheelchair_accessible',
          available: true,
          description: 'Wheelchair accessible'
        }
      ];

      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: mockFeatures,
        error: null
      });

      const result = await accommodationService.getClassAccessibilityFeatures('class-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('class_accessibility');
      expect(mockSupabase.eq).toHaveBeenCalledWith('class_id', 'class-1');
      expect(result).toEqual(mockFeatures);
    });
  });

  describe('manageAccommodationReservation', () => {
    it('should create or update accommodation reservation', async () => {
      const mockReservation = {
        id: 'res-1',
        class_id: 'class-1',
        accommodation_type: 'mobility',
        reserved_spots: 3,
        used_spots: 0,
        created_by: 'admin-1'
      };

      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: mockReservation,
        error: null
      });

      const result = await accommodationService.manageAccommodationReservation(
        'class-1',
        'mobility',
        3,
        new Date('2024-12-31')
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('accommodation_reservations');
      expect(mockSupabase.upsert).toHaveBeenCalled();
      expect(result).toEqual(mockReservation);
    });
  });

  describe('private methods', () => {
    describe('isCompatible', () => {
      it('should correctly identify compatible accommodation and accessibility pairs', () => {
        const service = accommodationService as any;
        
        // Test mobility compatibility
        expect(service.isCompatible('mobility', 'wheelchair_accessible')).toBe(true);
        expect(service.isCompatible('mobility', 'elevator_access')).toBe(true);
        expect(service.isCompatible('mobility', 'hearing_loop')).toBe(false);
        
        // Test visual compatibility
        expect(service.isCompatible('visual', 'visual_aids')).toBe(true);
        expect(service.isCompatible('visual', 'good_lighting')).toBe(true);
        expect(service.isCompatible('visual', 'wheelchair_accessible')).toBe(false);
        
        // Test hearing compatibility
        expect(service.isCompatible('hearing', 'hearing_loop')).toBe(true);
        expect(service.isCompatible('hearing', 'sign_language_interpreter')).toBe(true);
        expect(service.isCompatible('hearing', 'visual_aids')).toBe(false);
      });
    });

    describe('getRecommendedArrangement', () => {
      it('should return appropriate arrangements for accommodation types', () => {
        const service = accommodationService as any;
        
        expect(service.getRecommendedArrangement('mobility')).toContain('wheelchair accessible');
        expect(service.getRecommendedArrangement('visual')).toContain('large print');
        expect(service.getRecommendedArrangement('hearing')).toContain('interpreter');
        expect(service.getRecommendedArrangement('cognitive')).toContain('quiet');
        expect(service.getRecommendedArrangement('other')).toContain('Custom');
      });
    });

    describe('getSupportContactInfo', () => {
      it('should return support contact information', () => {
        const service = accommodationService as any;
        const contactInfo = service.getSupportContactInfo();
        
        expect(contactInfo).toContain('Disability Services');
        expect(contactInfo).toContain('email');
        expect(contactInfo).toContain('phone');
      });
    });
  });
});