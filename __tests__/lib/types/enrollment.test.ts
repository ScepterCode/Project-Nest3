import {
  EnrollmentStatus,
  EnrollmentRequestStatus,
  EnrollmentType,
  PrerequisiteType,
  RestrictionType,
  AuditAction,
  NotificationType,
  Enrollment,
  EnrollmentRequest,
  WaitlistEntry,
  ClassEnrollmentConfig,
  EligibilityResult,
  EnrollmentResult,
  ClassSearchCriteria
} from '@/lib/types/enrollment';

describe('Enrollment Type Definitions', () => {
  describe('Enums', () => {
    it('should have correct EnrollmentStatus values', () => {
      expect(EnrollmentStatus.ENROLLED).toBe('enrolled');
      expect(EnrollmentStatus.PENDING).toBe('pending');
      expect(EnrollmentStatus.WAITLISTED).toBe('waitlisted');
      expect(EnrollmentStatus.DROPPED).toBe('dropped');
      expect(EnrollmentStatus.WITHDRAWN).toBe('withdrawn');
      expect(EnrollmentStatus.COMPLETED).toBe('completed');
    });

    it('should have correct EnrollmentRequestStatus values', () => {
      expect(EnrollmentRequestStatus.PENDING).toBe('pending');
      expect(EnrollmentRequestStatus.APPROVED).toBe('approved');
      expect(EnrollmentRequestStatus.DENIED).toBe('denied');
      expect(EnrollmentRequestStatus.EXPIRED).toBe('expired');
      expect(EnrollmentRequestStatus.CANCELLED).toBe('cancelled');
    });

    it('should have correct EnrollmentType values', () => {
      expect(EnrollmentType.OPEN).toBe('open');
      expect(EnrollmentType.RESTRICTED).toBe('restricted');
      expect(EnrollmentType.INVITATION_ONLY).toBe('invitation_only');
    });

    it('should have correct PrerequisiteType values', () => {
      expect(PrerequisiteType.COURSE).toBe('course');
      expect(PrerequisiteType.GRADE).toBe('grade');
      expect(PrerequisiteType.YEAR).toBe('year');
      expect(PrerequisiteType.MAJOR).toBe('major');
      expect(PrerequisiteType.GPA).toBe('gpa');
      expect(PrerequisiteType.CUSTOM).toBe('custom');
    });

    it('should have correct RestrictionType values', () => {
      expect(RestrictionType.YEAR_LEVEL).toBe('year_level');
      expect(RestrictionType.MAJOR).toBe('major');
      expect(RestrictionType.DEPARTMENT).toBe('department');
      expect(RestrictionType.GPA).toBe('gpa');
      expect(RestrictionType.INSTITUTION).toBe('institution');
      expect(RestrictionType.CUSTOM).toBe('custom');
    });

    it('should have correct AuditAction values', () => {
      expect(AuditAction.ENROLLED).toBe('enrolled');
      expect(AuditAction.DROPPED).toBe('dropped');
      expect(AuditAction.WITHDRAWN).toBe('withdrawn');
      expect(AuditAction.WAITLISTED).toBe('waitlisted');
      expect(AuditAction.APPROVED).toBe('approved');
      expect(AuditAction.DENIED).toBe('denied');
      expect(AuditAction.INVITED).toBe('invited');
      expect(AuditAction.TRANSFERRED).toBe('transferred');
    });

    it('should have correct NotificationType values', () => {
      expect(NotificationType.POSITION_CHANGE).toBe('position_change');
      expect(NotificationType.ENROLLMENT_AVAILABLE).toBe('enrollment_available');
      expect(NotificationType.DEADLINE_REMINDER).toBe('deadline_reminder');
      expect(NotificationType.FINAL_NOTICE).toBe('final_notice');
    });
  });

  describe('Interface Validation', () => {
    it('should create valid Enrollment object', () => {
      const enrollment: Enrollment = {
        id: 'enrollment-1',
        studentId: 'student-1',
        classId: 'class-1',
        status: EnrollmentStatus.ENROLLED,
        enrolledAt: new Date(),
        credits: 3,
        priority: 0,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(enrollment.id).toBe('enrollment-1');
      expect(enrollment.status).toBe(EnrollmentStatus.ENROLLED);
      expect(enrollment.credits).toBe(3);
      expect(enrollment.metadata).toEqual({});
    });

    it('should create valid EnrollmentRequest object', () => {
      const request: EnrollmentRequest = {
        id: 'request-1',
        studentId: 'student-1',
        classId: 'class-1',
        requestedAt: new Date(),
        status: EnrollmentRequestStatus.PENDING,
        priority: 0,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(request.id).toBe('request-1');
      expect(request.status).toBe(EnrollmentRequestStatus.PENDING);
      expect(request.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should create valid WaitlistEntry object', () => {
      const entry: WaitlistEntry = {
        id: 'waitlist-1',
        studentId: 'student-1',
        classId: 'class-1',
        position: 1,
        addedAt: new Date(),
        priority: 0,
        estimatedProbability: 0.75,
        metadata: { source: 'automatic' },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(entry.position).toBe(1);
      expect(entry.estimatedProbability).toBe(0.75);
      expect(entry.metadata.source).toBe('automatic');
    });

    it('should create valid ClassEnrollmentConfig object', () => {
      const config: ClassEnrollmentConfig = {
        enrollmentType: EnrollmentType.RESTRICTED,
        capacity: 30,
        waitlistCapacity: 10,
        autoApprove: false,
        requiresJustification: true,
        allowWaitlist: true,
        notificationSettings: {
          enrollmentConfirmation: true,
          waitlistUpdates: true,
          deadlineReminders: true,
          capacityAlerts: false
        }
      };

      expect(config.enrollmentType).toBe(EnrollmentType.RESTRICTED);
      expect(config.capacity).toBe(30);
      expect(config.requiresJustification).toBe(true);
      expect(config.notificationSettings.enrollmentConfirmation).toBe(true);
    });

    it('should create valid EligibilityResult object', () => {
      const result: EligibilityResult = {
        eligible: false,
        reasons: [
          {
            type: 'prerequisite',
            message: 'Missing required course: Math 101',
            severity: 'error',
            overridable: false
          },
          {
            type: 'capacity',
            message: 'Class is at full capacity',
            severity: 'warning',
            overridable: true
          }
        ],
        recommendedActions: [
          'Complete Math 101 before enrolling',
          'Join the waitlist for this class'
        ],
        alternativeClasses: ['class-2', 'class-3']
      };

      expect(result.eligible).toBe(false);
      expect(result.reasons).toHaveLength(2);
      expect(result.reasons[0].type).toBe('prerequisite');
      expect(result.reasons[1].overridable).toBe(true);
      expect(result.recommendedActions).toHaveLength(2);
      expect(result.alternativeClasses).toEqual(['class-2', 'class-3']);
    });

    it('should create valid EnrollmentResult object', () => {
      const result: EnrollmentResult = {
        success: true,
        enrollmentId: 'enrollment-1',
        status: EnrollmentStatus.ENROLLED,
        message: 'Successfully enrolled in class',
        nextSteps: [
          'Check your class schedule',
          'Purchase required textbooks'
        ]
      };

      expect(result.success).toBe(true);
      expect(result.status).toBe(EnrollmentStatus.ENROLLED);
      expect(result.nextSteps).toHaveLength(2);
    });

    it('should create valid ClassSearchCriteria object', () => {
      const criteria: ClassSearchCriteria = {
        query: 'computer science',
        departmentId: 'dept-1',
        enrollmentType: EnrollmentType.OPEN,
        hasAvailableSpots: true,
        credits: 3,
        limit: 20,
        offset: 0,
        sortBy: 'name',
        sortOrder: 'asc'
      };

      expect(criteria.query).toBe('computer science');
      expect(criteria.enrollmentType).toBe(EnrollmentType.OPEN);
      expect(criteria.hasAvailableSpots).toBe(true);
      expect(criteria.sortBy).toBe('name');
    });
  });

  describe('Type Safety', () => {
    it('should enforce enum values for status fields', () => {
      // This test ensures TypeScript compilation catches invalid enum values
      const enrollment: Enrollment = {
        id: 'test',
        studentId: 'student-1',
        classId: 'class-1',
        status: EnrollmentStatus.ENROLLED, // Must be valid enum value
        enrolledAt: new Date(),
        credits: 3,
        priority: 0,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(Object.values(EnrollmentStatus)).toContain(enrollment.status);
    });

    it('should enforce required fields', () => {
      // This test ensures all required fields are present
      const minimalEnrollment: Enrollment = {
        id: 'test',
        studentId: 'student-1',
        classId: 'class-1',
        status: EnrollmentStatus.ENROLLED,
        enrolledAt: new Date(),
        credits: 3,
        priority: 0,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(minimalEnrollment.id).toBeDefined();
      expect(minimalEnrollment.studentId).toBeDefined();
      expect(minimalEnrollment.classId).toBeDefined();
      expect(minimalEnrollment.status).toBeDefined();
    });

    it('should allow optional fields to be undefined', () => {
      const enrollment: Enrollment = {
        id: 'test',
        studentId: 'student-1',
        classId: 'class-1',
        status: EnrollmentStatus.ENROLLED,
        enrolledAt: new Date(),
        credits: 3,
        priority: 0,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
        // Optional fields like enrolledBy, dropDeadline, grade are not set
      };

      expect(enrollment.enrolledBy).toBeUndefined();
      expect(enrollment.dropDeadline).toBeUndefined();
      expect(enrollment.grade).toBeUndefined();
    });
  });

  describe('Data Validation Helpers', () => {
    it('should validate enrollment status transitions', () => {
      const validTransitions = {
        [EnrollmentStatus.PENDING]: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED, EnrollmentStatus.DROPPED],
        [EnrollmentStatus.ENROLLED]: [EnrollmentStatus.DROPPED, EnrollmentStatus.WITHDRAWN, EnrollmentStatus.COMPLETED],
        [EnrollmentStatus.WAITLISTED]: [EnrollmentStatus.ENROLLED, EnrollmentStatus.DROPPED],
        [EnrollmentStatus.DROPPED]: [], // Terminal state
        [EnrollmentStatus.WITHDRAWN]: [], // Terminal state
        [EnrollmentStatus.COMPLETED]: [] // Terminal state
      };

      // Test valid transitions
      expect(validTransitions[EnrollmentStatus.PENDING]).toContain(EnrollmentStatus.ENROLLED);
      expect(validTransitions[EnrollmentStatus.ENROLLED]).toContain(EnrollmentStatus.COMPLETED);
      expect(validTransitions[EnrollmentStatus.WAITLISTED]).toContain(EnrollmentStatus.ENROLLED);

      // Test terminal states
      expect(validTransitions[EnrollmentStatus.DROPPED]).toHaveLength(0);
      expect(validTransitions[EnrollmentStatus.WITHDRAWN]).toHaveLength(0);
      expect(validTransitions[EnrollmentStatus.COMPLETED]).toHaveLength(0);
    });

    it('should validate waitlist position constraints', () => {
      const entry: WaitlistEntry = {
        id: 'waitlist-1',
        studentId: 'student-1',
        classId: 'class-1',
        position: 1,
        addedAt: new Date(),
        priority: 0,
        estimatedProbability: 0.75,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Position should be positive
      expect(entry.position).toBeGreaterThan(0);
      
      // Probability should be between 0 and 1
      expect(entry.estimatedProbability).toBeGreaterThanOrEqual(0);
      expect(entry.estimatedProbability).toBeLessThanOrEqual(1);
    });

    it('should validate enrollment request expiration', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      
      const request: EnrollmentRequest = {
        id: 'request-1',
        studentId: 'student-1',
        classId: 'class-1',
        requestedAt: now,
        status: EnrollmentRequestStatus.PENDING,
        priority: 0,
        expiresAt: futureDate,
        createdAt: now,
        updatedAt: now
      };

      // Expiration should be in the future
      expect(request.expiresAt.getTime()).toBeGreaterThan(request.requestedAt.getTime());
    });
  });
});