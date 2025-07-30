import { createClient } from '@/lib/supabase/server';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';
import { WaitlistManager } from '@/lib/services/waitlist-manager';
import { enrollmentConfigService } from '@/lib/services/enrollment-config';
import { EnrollmentType, EnrollmentStatus } from '@/lib/types/enrollment';

// Mock the Supabase client
jest.mock('@/lib/supabase/server');

describe('Enrollment API Integration Tests', () => {
  let mockSupabase;
  let enrollmentManager;
  let waitlistManager;

  const mockUser = {
    id: 'user-123',
    email: 'student@test.com'
  };

  const mockClass = {
    id: 'class-123',
    name: 'Test Class',
    teacher_id: 'teacher-123',
    institution_id: 'institution-123',
    capacity: 30,
    current_enrollment: 25,
    enrollment_type: EnrollmentType.OPEN,
    waitlist_capacity: 10
  };

  beforeEach(() => {
    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null
        })
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: mockClass,
        error: null
      }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    createClient.mockResolvedValue(mockSupabase);
    enrollmentManager = new EnrollmentManager();
    waitlistManager = new WaitlistManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Enrollment Request Flow', () => {
    it('should successfully enroll student in open class with available capacity', async () => {
      // Mock class with available capacity
      mockSupabase.single.mockResolvedValueOnce({
        data: { ...mockClass, current_enrollment: 20 },
        error: null
      });

      // Mock successful enrollment creation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'enrollment-123',
          student_id: mockUser.id,
          class_id: mockClass.id,
          status: EnrollmentStatus.ENROLLED
        },
        error: null
      });

      const result = await enrollmentManager.requestEnrollment(mockUser.id, mockClass.id);

      expect(result.success).toBe(true);
      expect(result.status).toBe(EnrollmentStatus.ENROLLED);
      expect(result.enrollmentId).toBe('enrollment-123');
    });

    it('should add student to waitlist when class is at capacity', async () => {
      // Mock class at full capacity
      mockSupabase.single.mockResolvedValueOnce({
        data: { ...mockClass, current_enrollment: 30 },
        error: null
      });

      // Mock waitlist entry creation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'waitlist-123',
          student_id: mockUser.id,
          class_id: mockClass.id,
          position: 1
        },
        error: null
      });

      const result = await enrollmentManager.requestEnrollment(mockUser.id, mockClass.id);

      expect(result.success).toBe(true);
      expect(result.status).toBe(EnrollmentStatus.WAITLISTED);
      expect(result.waitlistPosition).toBe(1);
    });

    it('should create enrollment request for restricted class', async () => {
      // Mock restricted class
      mockSupabase.single.mockResolvedValueOnce({
        data: { ...mockClass, enrollment_type: EnrollmentType.RESTRICTED },
        error: null
      });

      // Mock enrollment request creation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'request-123',
          student_id: mockUser.id,
          class_id: mockClass.id,
          status: 'pending'
        },
        error: null
      });

      const result = await enrollmentManager.requestEnrollment(
        mockUser.id, 
        mockClass.id, 
        'I need this class for my major'
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(EnrollmentStatus.PENDING);
    });

    it('should reject duplicate enrollment request', async () => {
      // Mock existing enrollment
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'enrollment-123',
          student_id: mockUser.id,
          class_id: mockClass.id,
          status: EnrollmentStatus.ENROLLED
        },
        error: null
      });

      const result = await enrollmentManager.requestEnrollment(mockUser.id, mockClass.id);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('ALREADY_ENROLLED');
    });
  });

  describe('Enrollment Request Approval Flow', () => {
    it('should successfully approve enrollment request', async () => {
      const requestId = 'request-123';
      const approverId = 'teacher-123';

      // Mock enrollment request
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: requestId,
          student_id: mockUser.id,
          class_id: mockClass.id,
          status: 'pending'
        },
        error: null
      });

      // Mock class data
      mockSupabase.single.mockResolvedValueOnce({
        data: { ...mockClass, current_enrollment: 20 },
        error: null
      });

      // Mock enrollment creation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'enrollment-123',
          student_id: mockUser.id,
          class_id: mockClass.id,
          status: EnrollmentStatus.ENROLLED
        },
        error: null
      });

      await expect(
        enrollmentManager.approveEnrollment(requestId, approverId)
      ).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          reviewed_by: approverId
        })
      );
    });

    it('should add to waitlist when approving but class is full', async () => {
      const requestId = 'request-123';
      const approverId = 'teacher-123';

      // Mock enrollment request
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: requestId,
          student_id: mockUser.id,
          class_id: mockClass.id,
          status: 'pending'
        },
        error: null
      });

      // Mock class at capacity
      mockSupabase.single.mockResolvedValueOnce({
        data: { ...mockClass, current_enrollment: 30 },
        error: null
      });

      await expect(
        enrollmentManager.approveEnrollment(requestId, approverId)
      ).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          review_notes: expect.stringContaining('waitlist')
        })
      );
    });
  });

  describe('Waitlist Management', () => {
    it('should add student to waitlist with correct position', async () => {
      // Mock existing waitlist entries
      mockSupabase.select.mockResolvedValueOnce({
        data: [{ position: 3 }],
        error: null
      });

      // Mock waitlist entry creation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'waitlist-123',
          student_id: mockUser.id,
          class_id: mockClass.id,
          position: 4
        },
        error: null
      });

      const entry = await waitlistManager.addToWaitlist(mockUser.id, mockClass.id);

      expect(entry.position).toBe(4);
      expect(entry.student_id).toBe(mockUser.id);
    });

    it('should process waitlist when spot becomes available', async () => {
      // Mock class with available capacity
      mockSupabase.single.mockResolvedValueOnce({
        data: { ...mockClass, current_enrollment: 29 },
        error: null
      });

      // Mock next waitlist entries
      mockSupabase.select.mockResolvedValueOnce({
        data: [{
          id: 'waitlist-123',
          student_id: 'student-456',
          class_id: mockClass.id,
          position: 1
        }],
        error: null
      });

      await expect(
        waitlistManager.processWaitlist(mockClass.id)
      ).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          notified_at: expect.any(String)
        })
      );
    });

    it('should get correct waitlist position for student', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { position: 5 },
        error: null
      });

      const position = await waitlistManager.getWaitlistPosition(mockUser.id, mockClass.id);

      expect(position).toBe(5);
    });
  });

  describe('Enrollment Configuration', () => {
    it('should update class enrollment configuration', async () => {
      const updates = {
        enrollmentType: EnrollmentType.RESTRICTED,
        capacity: 35,
        autoApprove: false,
        requiresJustification: true
      };

      // Mock current config
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          enrollment_type: EnrollmentType.OPEN,
          capacity: 30,
          enrollment_config: {}
        },
        error: null
      });

      // Mock successful update
      mockSupabase.update.mockResolvedValueOnce({
        data: null,
        error: null
      });

      const result = await enrollmentConfigService.updateClassConfig(
        mockClass.id,
        updates,
        'teacher-123'
      );

      expect(result).toBeDefined();
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollment_type: EnrollmentType.RESTRICTED,
          capacity: 35
        })
      );
    });

    it('should validate enrollment configuration', async () => {
      // Mock current enrollment count
      mockSupabase.select.mockResolvedValueOnce({
        data: Array(25).fill({}), // 25 current enrollments
        error: null
      });

      const validation = await enrollmentConfigService.validateConfig(mockClass.id, {
        capacity: 20 // Trying to reduce below current enrollment
      });

      expect(validation.valid).toBe(true); // Should be valid but with warnings
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0].code).toBe('CAPACITY_BELOW_ENROLLMENT');
    });
  });

  describe('Bulk Operations', () => {
    it('should process bulk enrollment correctly', async () => {
      const studentIds = ['student-1', 'student-2', 'student-3'];

      // Mock successful enrollments for all students
      for (let i = 0; i < studentIds.length; i++) {
        mockSupabase.single.mockResolvedValueOnce({
          data: { ...mockClass, current_enrollment: 20 + i },
          error: null
        });
      }

      const result = await enrollmentManager.bulkEnroll(studentIds, mockClass.id, 'admin-123');

      expect(result.totalProcessed).toBe(3);
      expect(result.successful).toBeGreaterThan(0);
      expect(result.summary.enrolled).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const result = await enrollmentManager.requestEnrollment(mockUser.id, mockClass.id);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('CLASS_NOT_FOUND');
    });

    it('should handle invalid class ID', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      const result = await enrollmentManager.requestEnrollment(mockUser.id, 'invalid-class-id');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('CLASS_NOT_FOUND');
    });
  });
});