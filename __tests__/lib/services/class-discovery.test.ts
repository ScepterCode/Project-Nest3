import { ClassDiscoveryService } from '@/lib/services/class-discovery';
import { 
  ClassSearchCriteria, 
  EnrollmentType, 
  PrerequisiteType,
  RestrictionType 
} from '@/lib/types/enrollment';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  select: jest.fn(),
  eq: jest.fn(),
  or: jest.fn(),
  ilike: jest.fn(),
  lt: jest.fn(),
  gt: jest.fn(),
  neq: jest.fn(),
  not: jest.fn(),
  in: jest.fn(),
  order: jest.fn(),
  range: jest.fn(),
  limit: jest.fn(),
  single: jest.fn()
};

// Mock the Supabase client creation
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('ClassDiscoveryService', () => {
  let classDiscoveryService: ClassDiscoveryService;

  beforeEach(() => {
    classDiscoveryService = new ClassDiscoveryService();
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.or.mockReturnValue(mockSupabase);
    mockSupabase.ilike.mockReturnValue(mockSupabase);
    mockSupabase.lt.mockReturnValue(mockSupabase);
    mockSupabase.gt.mockReturnValue(mockSupabase);
    mockSupabase.neq.mockReturnValue(mockSupabase);
    mockSupabase.not.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.range.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
    mockSupabase.single.mockReturnValue(mockSupabase);
  });

  describe('searchClasses', () => {
    const mockClassData = [
      {
        id: 'class-1',
        name: 'Introduction to Computer Science',
        code: 'CS101',
        description: 'Basic programming concepts',
        teacher_id: 'teacher-1',
        department_id: 'dept-1',
        institution_id: 'inst-1',
        semester: 'Fall 2024',
        credits: 3,
        capacity: 30,
        current_enrollment: 20,
        waitlist_capacity: 10,
        enrollment_type: EnrollmentType.OPEN,
        status: 'active',
        users: {
          id: 'teacher-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com'
        },
        departments: {
          id: 'dept-1',
          name: 'Computer Science'
        },
        institutions: {
          id: 'inst-1',
          name: 'Test University'
        },
        enrollment_statistics: [{
          total_enrolled: 20,
          total_waitlisted: 5,
          total_pending: 2,
          capacity_utilization: 66.67
        }],
        class_prerequisites: [],
        enrollment_restrictions: []
      }
    ];

    it('should search classes with basic criteria', async () => {
      const criteria: ClassSearchCriteria = {
        query: 'computer science',
        limit: 20,
        offset: 0
      };

      mockSupabase.range.mockResolvedValue({
        data: mockClassData,
        error: null,
        count: 1
      });

      // Mock filter aggregations
      mockSupabase.select.mockResolvedValueOnce({ data: [], error: null }); // departments
      mockSupabase.eq.mockReturnValueOnce(mockSupabase);
      mockSupabase.order.mockResolvedValueOnce({ data: [], error: null }); // instructors

      const result = await classDiscoveryService.searchClasses(criteria);

      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('Introduction to Computer Science');
      expect(result.classes[0].teacherName).toBe('John Doe');
      expect(result.classes[0].availableSpots).toBe(10);
      expect(result.total).toBe(1);
    });

    it('should apply department filter', async () => {
      const criteria: ClassSearchCriteria = {
        departmentId: 'dept-1',
        limit: 20,
        offset: 0
      };

      mockSupabase.range.mockResolvedValue({
        data: mockClassData,
        error: null,
        count: 1
      });

      mockSupabase.select.mockResolvedValue({ data: [], error: null });
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.order.mockResolvedValue({ data: [], error: null });

      await classDiscoveryService.searchClasses(criteria);

      expect(mockSupabase.eq).toHaveBeenCalledWith('department_id', 'dept-1');
    });

    it('should apply enrollment type filter', async () => {
      const criteria: ClassSearchCriteria = {
        enrollmentType: EnrollmentType.RESTRICTED,
        limit: 20,
        offset: 0
      };

      mockSupabase.range.mockResolvedValue({
        data: mockClassData,
        error: null,
        count: 1
      });

      mockSupabase.select.mockResolvedValue({ data: [], error: null });
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.order.mockResolvedValue({ data: [], error: null });

      await classDiscoveryService.searchClasses(criteria);

      expect(mockSupabase.eq).toHaveBeenCalledWith('enrollment_type', EnrollmentType.RESTRICTED);
    });

    it('should apply availability filters', async () => {
      const criteria: ClassSearchCriteria = {
        hasAvailableSpots: true,
        hasWaitlistSpots: true,
        limit: 20,
        offset: 0
      };

      mockSupabase.range.mockResolvedValue({
        data: mockClassData,
        error: null,
        count: 1
      });

      mockSupabase.select.mockResolvedValue({ data: [], error: null });
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.order.mockResolvedValue({ data: [], error: null });

      await classDiscoveryService.searchClasses(criteria);

      expect(mockSupabase.lt).toHaveBeenCalledWith('current_enrollment', 'capacity');
      expect(mockSupabase.gt).toHaveBeenCalledWith('waitlist_capacity', 0);
    });

    it('should handle sorting options', async () => {
      const criteria: ClassSearchCriteria = {
        sortBy: 'enrollment',
        sortOrder: 'desc',
        limit: 20,
        offset: 0
      };

      mockSupabase.range.mockResolvedValue({
        data: mockClassData,
        error: null,
        count: 1
      });

      mockSupabase.select.mockResolvedValue({ data: [], error: null });
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.order.mockResolvedValue({ data: [], error: null });

      await classDiscoveryService.searchClasses(criteria);

      expect(mockSupabase.order).toHaveBeenCalledWith('current_enrollment', { ascending: false });
    });

    it('should handle pagination', async () => {
      const criteria: ClassSearchCriteria = {
        limit: 10,
        offset: 20
      };

      mockSupabase.range.mockResolvedValue({
        data: mockClassData,
        error: null,
        count: 50
      });

      mockSupabase.select.mockResolvedValue({ data: [], error: null });
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.order.mockResolvedValue({ data: [], error: null });

      const result = await classDiscoveryService.searchClasses(criteria);

      expect(mockSupabase.range).toHaveBeenCalledWith(20, 29);
      expect(result.hasMore).toBe(true);
    });

    it('should handle search errors gracefully', async () => {
      const criteria: ClassSearchCriteria = {
        query: 'test',
        limit: 20,
        offset: 0
      };

      mockSupabase.range.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
        count: 0
      });

      await expect(classDiscoveryService.searchClasses(criteria))
        .rejects.toThrow('Failed to search classes');
    });
  });

  describe('getAvailableClasses', () => {
    const studentId = 'student-1';
    const mockStudent = {
      id: studentId,
      institution_id: 'inst-1',
      department_id: 'dept-1'
    };

    it('should get available classes for student', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockStudent, error: null }) // student data
        .mockResolvedValueOnce({ data: [], error: null }); // enrollments

      mockSupabase.order.mockResolvedValue({
        data: [
          {
            id: 'class-1',
            name: 'Available Class',
            status: 'active',
            institution_id: 'inst-1',
            department_id: 'dept-1',
            enrollment_start: null,
            enrollment_end: null,
            users: { first_name: 'John', last_name: 'Doe' },
            departments: { name: 'Computer Science' },
            institutions: { name: 'Test University' },
            enrollment_statistics: [],
            class_prerequisites: [],
            enrollment_restrictions: []
          }
        ],
        error: null
      });

      const result = await classDiscoveryService.getAvailableClasses(studentId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Available Class');
      expect(mockSupabase.eq).toHaveBeenCalledWith('institution_id', 'inst-1');
      expect(mockSupabase.eq).toHaveBeenCalledWith('department_id', 'dept-1');
    });

    it('should exclude classes student is already enrolled in', async () => {
      const mockEnrollments = [
        { class_id: 'class-1' },
        { class_id: 'class-2' }
      ];

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockStudent, error: null })
        .mockResolvedValueOnce({ data: mockEnrollments, error: null });

      mockSupabase.order.mockResolvedValue({ data: [], error: null });

      await classDiscoveryService.getAvailableClasses(studentId);

      expect(mockSupabase.not).toHaveBeenCalledWith('id', 'in', '(class-1,class-2)');
    });

    it('should handle student not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      await expect(classDiscoveryService.getAvailableClasses(studentId))
        .rejects.toThrow('Student not found');
    });
  });

  describe('checkEnrollmentEligibility', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    const mockClassData = {
      id: classId,
      name: 'Test Class',
      capacity: 30,
      current_enrollment: 20,
      waitlist_capacity: 10,
      enrollment_start: null,
      enrollment_end: null,
      class_prerequisites: [],
      enrollment_restrictions: [],
      enrollment_statistics: [{ total_waitlisted: 5 }]
    };

    const mockStudent = {
      id: studentId,
      year: 'sophomore',
      major: 'Computer Science',
      department_id: 'dept-1',
      enrollments: []
    };

    it('should return eligible for basic case', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null })
        .mockResolvedValueOnce({ data: mockStudent, error: null });

      const result = await classDiscoveryService.checkEnrollmentEligibility(studentId, classId);

      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should check enrollment period deadlines', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const classWithFutureStart = {
        ...mockClassData,
        enrollment_start: futureDate
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: classWithFutureStart, error: null })
        .mockResolvedValueOnce({ data: mockStudent, error: null });

      const result = await classDiscoveryService.checkEnrollmentEligibility(studentId, classId);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('deadline');
      expect(result.reasons[0].severity).toBe('error');
    });

    it('should check capacity constraints', async () => {
      const fullClass = {
        ...mockClassData,
        current_enrollment: 30, // At capacity
        enrollment_statistics: [{ total_waitlisted: 10 }] // Waitlist also full
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: fullClass, error: null })
        .mockResolvedValueOnce({ data: mockStudent, error: null });

      const result = await classDiscoveryService.checkEnrollmentEligibility(studentId, classId);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.type === 'capacity')).toBe(true);
      expect(result.recommendedActions).toContain('Look for alternative sections');
    });

    it('should check prerequisites', async () => {
      const classWithPrereqs = {
        ...mockClassData,
        class_prerequisites: [{
          type: PrerequisiteType.COURSE,
          requirement: JSON.stringify({ courseCode: 'CS100' }),
          strict: true
        }]
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: classWithPrereqs, error: null })
        .mockResolvedValueOnce({ data: mockStudent, error: null });

      const result = await classDiscoveryService.checkEnrollmentEligibility(studentId, classId);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.type === 'prerequisite')).toBe(true);
    });

    it('should check restrictions', async () => {
      const classWithRestrictions = {
        ...mockClassData,
        enrollment_restrictions: [{
          type: RestrictionType.YEAR_LEVEL,
          condition: JSON.stringify({ excludeYears: ['sophomore'] }),
          overridable: false
        }]
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: classWithRestrictions, error: null })
        .mockResolvedValueOnce({ data: mockStudent, error: null });

      const result = await classDiscoveryService.checkEnrollmentEligibility(studentId, classId);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.type === 'restriction')).toBe(true);
    });

    it('should handle class not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      const result = await classDiscoveryService.checkEnrollmentEligibility(studentId, classId);

      expect(result.eligible).toBe(false);
      expect(result.reasons[0].message).toBe('Class not found');
    });

    it('should handle student not found', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      const result = await classDiscoveryService.checkEnrollmentEligibility(studentId, classId);

      expect(result.eligible).toBe(false);
      expect(result.reasons[0].message).toBe('Student not found');
    });
  });

  describe('getClassDetails', () => {
    const classId = 'class-1';
    const studentId = 'student-1';

    const mockClassData = {
      id: classId,
      name: 'Test Class',
      code: 'TEST101',
      description: 'A test class',
      teacher_id: 'teacher-1',
      capacity: 30,
      current_enrollment: 20,
      users: {
        id: 'teacher-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com'
      },
      departments: {
        id: 'dept-1',
        name: 'Test Department'
      },
      institutions: {
        id: 'inst-1',
        name: 'Test University'
      },
      enrollment_statistics: [],
      class_prerequisites: [],
      enrollment_restrictions: []
    };

    it('should get class details without student context', async () => {
      mockSupabase.single.mockResolvedValue({ data: mockClassData, error: null });

      const result = await classDiscoveryService.getClassDetails(classId);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test Class');
      expect(result!.teacherName).toBe('John Doe');
      expect(result!.availableSpots).toBe(10);
    });

    it('should get class details with student context', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // class data
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // for eligibility check
        .mockResolvedValueOnce({ data: { id: studentId }, error: null }) // student data for eligibility
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // no enrollment
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // no waitlist entry

      const result = await classDiscoveryService.getClassDetails(classId, studentId);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test Class');
      expect((result as any).eligibility).toBeDefined();
    });

    it('should return null for non-existent class', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      const result = await classDiscoveryService.getClassDetails('nonexistent-class');

      expect(result).toBeNull();
    });
  });

  describe('getEnrollmentStatistics', () => {
    const classId = 'class-1';

    it('should get enrollment statistics', async () => {
      const mockStats = {
        id: 'stats-1',
        class_id: classId,
        total_enrolled: 25,
        total_waitlisted: 5,
        total_pending: 2,
        capacity_utilization: 83.33,
        enrollment_trend: 'increasing'
      };

      mockSupabase.single.mockResolvedValue({ data: mockStats, error: null });

      const result = await classDiscoveryService.getEnrollmentStatistics(classId);

      expect(result).not.toBeNull();
      expect(result!.totalEnrolled).toBe(25);
      expect(result!.capacityUtilization).toBe(83.33);
    });

    it('should return null for non-existent statistics', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      const result = await classDiscoveryService.getEnrollmentStatistics(classId);

      expect(result).toBeNull();
    });
  });
});