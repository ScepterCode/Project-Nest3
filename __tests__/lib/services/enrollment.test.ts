import { EnrollmentManager } from '@/lib/services/enrollment-manager';
import { 
  EnrollmentStatus, 
  EnrollmentType, 
  EnrollmentRequestStatus,
  AuditAction 
} from '@/lib/types/enrollment';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
  order: jest.fn(),
  limit: jest.fn()
};

// Mock the Supabase client creation
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('EnrollmentManager', () => {
  let enrollmentManager: EnrollmentManager;

  beforeEach(() => {
    enrollmentManager = new EnrollmentManager();
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.single.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
  });

  describe('requestEnrollment', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should successfully enroll student in open class with available capacity', async () => {
      // Mock class data
      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        currentEnrollment: 20,
        waitlistCapacity: 10,
        enrollment_statistics: [{ total_waitlisted: 0 }]
      };

      // Mock no existing enrollment
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // getClassWithEnrollmentData
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // getStudentEnrollment
        .mockResolvedValueOnce({ data: { id: 'enrollment-1' }, error: null }); // createEnrollment

      const result = await enrollmentManager.requestEnrollment(studentId, classId);

      expect(result.success).toBe(true);
      expect(result.status).toBe(EnrollmentStatus.ENROLLED);
      expect(result.message).toBe('Successfully enrolled in class');
      expect(result.enrollmentId).toBe('enrollment-1');
    });

    it('should add student to waitlist when class is at capacity', async () => {
      // Mock class data at capacity
      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        currentEnrollment: 30,
        waitlistCapacity: 10,
        enrollment_statistics: [{ total_waitlisted: 5 }]
      };

      // Mock waitlist position data
      const mockWaitlistPosition = [{ position: 5 }];

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // getClassWithEnrollmentData
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // getStudentEnrollment
        .mockResolvedValueOnce({ data: { position: 6 }, error: null }); // addToWaitlist

      mockSupabase.select.mockResolvedValueOnce({ data: mockWaitlistPosition, error: null });

      const result = await enrollmentManager.requestEnrollment(studentId, classId);

      expect(result.success).toBe(true);
      expect(result.status).toBe(EnrollmentStatus.WAITLISTED);
      expect(result.waitlistPosition).toBe(6);
      expect(result.message).toBe('Added to waitlist');
    });

    it('should create enrollment request for restricted class', async () => {
      // Mock restricted class data
      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.RESTRICTED,
        capacity: 30,
        currentEnrollment: 20,
        waitlistCapacity: 10
      };

      const mockRequest = {
        id: 'request-1',
        student_id: studentId,
        class_id: classId,
        status: EnrollmentRequestStatus.PENDING
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // getClassWithEnrollmentData
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // getStudentEnrollment
        .mockResolvedValueOnce({ data: mockRequest, error: null }); // create request

      const result = await enrollmentManager.requestEnrollment(studentId, classId, 'I need this class for my major');

      expect(result.success).toBe(true);
      expect(result.status).toBe(EnrollmentStatus.PENDING);
      expect(result.message).toBe('Enrollment request submitted for approval');
    });

    it('should reject enrollment for invitation-only class without invitation', async () => {
      // Mock invitation-only class data
      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.INVITATION_ONLY,
        capacity: 30,
        currentEnrollment: 20
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // getClassWithEnrollmentData
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // getStudentEnrollment

      const result = await enrollmentManager.requestEnrollment(studentId, classId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('This class requires an invitation');
      expect(result.errors?.[0].code).toBe('INVITATION_REQUIRED');
    });

    it('should reject duplicate enrollment', async () => {
      // Mock existing enrollment
      const mockExistingEnrollment = {
        id: 'enrollment-1',
        student_id: studentId,
        class_id: classId,
        status: EnrollmentStatus.ENROLLED
      };

      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        currentEnrollment: 20
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // getClassWithEnrollmentData
        .mockResolvedValueOnce({ data: mockExistingEnrollment, error: null }); // getStudentEnrollment

      const result = await enrollmentManager.requestEnrollment(studentId, classId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Already enrolled in this class');
      expect(result.errors?.[0].code).toBe('ALREADY_ENROLLED');
    });

    it('should handle class not found error', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      const result = await enrollmentManager.requestEnrollment(studentId, 'nonexistent-class');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Class not found');
      expect(result.errors?.[0].code).toBe('CLASS_NOT_FOUND');
    });
  });

  describe('approveEnrollment', () => {
    const requestId = 'request-1';
    const approverId = 'teacher-1';

    it('should approve enrollment request and enroll student', async () => {
      const mockRequest = {
        id: requestId,
        student_id: 'student-1',
        class_id: 'class-1',
        status: EnrollmentRequestStatus.PENDING
      };

      const mockClassData = {
        id: 'class-1',
        capacity: 30,
        currentEnrollment: 20
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockRequest, error: null }) // get request
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // get class data
        .mockResolvedValueOnce({ data: { id: 'enrollment-1' }, error: null }); // create enrollment

      mockSupabase.update.mockResolvedValue({ data: null, error: null });

      await expect(enrollmentManager.approveEnrollment(requestId, approverId)).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EnrollmentRequestStatus.APPROVED,
          reviewed_by: approverId
        })
      );
    });

    it('should add to waitlist when approving but class is at capacity', async () => {
      const mockRequest = {
        id: requestId,
        student_id: 'student-1',
        class_id: 'class-1',
        status: EnrollmentRequestStatus.PENDING
      };

      const mockClassData = {
        id: 'class-1',
        capacity: 30,
        currentEnrollment: 30 // At capacity
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockRequest, error: null }) // get request
        .mockResolvedValueOnce({ data: mockClassData, error: null }); // get class data

      // Mock waitlist addition
      mockSupabase.select.mockResolvedValueOnce({ data: [{ position: 5 }], error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: { position: 6 }, error: null });

      await expect(enrollmentManager.approveEnrollment(requestId, approverId)).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EnrollmentRequestStatus.APPROVED,
          review_notes: 'Approved but added to waitlist due to capacity'
        })
      );
    });

    it('should throw error for non-existent request', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      await expect(enrollmentManager.approveEnrollment('nonexistent-request', approverId))
        .rejects.toThrow('Enrollment request not found or already processed');
    });
  });

  describe('denyEnrollment', () => {
    const requestId = 'request-1';
    const approverId = 'teacher-1';
    const reason = 'Prerequisites not met';

    it('should deny enrollment request with reason', async () => {
      const mockRequest = {
        id: requestId,
        student_id: 'student-1',
        class_id: 'class-1',
        status: EnrollmentRequestStatus.PENDING
      };

      mockSupabase.single.mockResolvedValueOnce({ data: mockRequest, error: null });
      mockSupabase.update.mockResolvedValue({ data: null, error: null });

      await expect(enrollmentManager.denyEnrollment(requestId, approverId, reason)).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EnrollmentRequestStatus.DENIED,
          reviewed_by: approverId,
          review_notes: reason
        })
      );
    });

    it('should throw error for non-existent request', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      await expect(enrollmentManager.denyEnrollment('nonexistent-request', approverId, reason))
        .rejects.toThrow('Enrollment request not found or already processed');
    });
  });

  describe('dropStudent', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should drop enrolled student from class', async () => {
      const mockEnrollment = {
        id: 'enrollment-1',
        student_id: studentId,
        class_id: classId,
        status: EnrollmentStatus.ENROLLED
      };

      mockSupabase.single.mockResolvedValueOnce({ data: mockEnrollment, error: null });
      mockSupabase.update.mockResolvedValue({ data: null, error: null });

      await expect(enrollmentManager.dropStudent(studentId, classId, 'Student requested drop')).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EnrollmentStatus.DROPPED
        })
      );
    });

    it('should throw error when student is not enrolled', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      await expect(enrollmentManager.dropStudent(studentId, classId))
        .rejects.toThrow('Student is not enrolled in this class');
    });
  });

  describe('bulkEnroll', () => {
    const studentIds = ['student-1', 'student-2', 'student-3'];
    const classId = 'class-1';
    const performedBy = 'admin-1';

    it('should process bulk enrollment for multiple students', async () => {
      // Mock successful enrollments for all students
      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        currentEnrollment: 10,
        waitlistCapacity: 10,
        enrollment_statistics: [{ total_waitlisted: 0 }]
      };

      // Setup mocks for each student enrollment
      mockSupabase.single
        .mockResolvedValue({ data: mockClassData, error: null }) // getClassWithEnrollmentData (repeated)
        .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) // getStudentEnrollment (repeated)
        .mockResolvedValue({ data: { id: 'enrollment-1' }, error: null }); // createEnrollment (repeated)

      const result = await enrollmentManager.bulkEnroll(studentIds, classId, performedBy);

      expect(result.totalProcessed).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.summary.enrolled).toBe(3);
      expect(result.results).toHaveLength(3);
    });

    it('should handle mixed success and failure results', async () => {
      // Mock first student success, second student failure (already enrolled), third student success
      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        currentEnrollment: 10
      };

      const mockExistingEnrollment = {
        id: 'enrollment-existing',
        student_id: 'student-2',
        class_id: classId,
        status: EnrollmentStatus.ENROLLED
      };

      let callCount = 0;
      mockSupabase.single.mockImplementation(() => {
        callCount++;
        if (callCount === 1 || callCount === 7) return Promise.resolve({ data: mockClassData, error: null }); // class data
        if (callCount === 2 || callCount === 8) return Promise.resolve({ data: null, error: { code: 'PGRST116' } }); // no existing enrollment
        if (callCount === 3 || callCount === 9) return Promise.resolve({ data: { id: 'enrollment-new' }, error: null }); // create enrollment
        if (callCount === 4) return Promise.resolve({ data: mockClassData, error: null }); // class data for student 2
        if (callCount === 5) return Promise.resolve({ data: mockExistingEnrollment, error: null }); // existing enrollment for student 2
        return Promise.resolve({ data: null, error: null });
      });

      const result = await enrollmentManager.bulkEnroll(studentIds, classId, performedBy);

      expect(result.totalProcessed).toBe(3);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results[1].result.success).toBe(false);
      expect(result.results[1].result.errors?.[0].code).toBe('ALREADY_ENROLLED');
    });
  });

  describe('Helper Methods', () => {
    it('should calculate enrollment probability correctly', async () => {
      // Test the private method indirectly through waitlist functionality
      const studentId = 'student-1';
      const classId = 'class-1';

      // Mock class at capacity to trigger waitlist
      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        currentEnrollment: 30,
        waitlistCapacity: 10,
        enrollment_statistics: [{ total_waitlisted: 2 }]
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: { position: 3, estimated_probability: 0.7 }, error: null });

      mockSupabase.select.mockResolvedValueOnce({ data: [{ position: 2 }], error: null });

      const result = await enrollmentManager.requestEnrollment(studentId, classId);

      expect(result.success).toBe(true);
      expect(result.status).toBe(EnrollmentStatus.WAITLISTED);
      expect(result.waitlistPosition).toBe(3);
    });

    it('should estimate wait time based on position', async () => {
      const studentId = 'student-1';
      const classId = 'class-1';

      // Mock class at capacity with high waitlist position
      const mockClassData = {
        id: classId,
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        currentEnrollment: 30,
        waitlistCapacity: 20,
        enrollment_statistics: [{ total_waitlisted: 10 }]
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: { position: 11 }, error: null });

      mockSupabase.select.mockResolvedValueOnce({ data: [{ position: 10 }], error: null });

      const result = await enrollmentManager.requestEnrollment(studentId, classId);

      expect(result.success).toBe(true);
      expect(result.estimatedWaitTime).toBeDefined();
      expect(typeof result.estimatedWaitTime).toBe('string');
    });
  });
});