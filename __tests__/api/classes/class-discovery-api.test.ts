import { NextRequest } from 'next/server';
import { GET as searchClasses } from '@/app/api/classes/search/route';
import { GET as availableClasses } from '@/app/api/classes/available/route';
import { GET as classDetails } from '@/app/api/classes/[id]/details/route';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase
jest.mock('@/lib/supabase/server');
const mockSupabase = {
  auth: {
    getUser: jest.fn()
  }
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

// Mock services
const mockClassDiscoveryService = {
  searchClasses: jest.fn(),
  getAvailableClasses: jest.fn(),
  getClassDetails: jest.fn(),
  checkEnrollmentEligibility: jest.fn(),
  getEnrollmentStatistics: jest.fn()
};

jest.mock('@/lib/services/class-discovery', () => ({
  ClassDiscoveryService: jest.fn().mockImplementation(() => mockClassDiscoveryService)
}));

describe('Class Discovery API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });
  });

  describe('GET /api/classes/search', () => {
    it('should search classes with criteria', async () => {
      const mockSearchResult = {
        classes: [
          {
            id: 'class-123',
            name: 'Introduction to Computer Science',
            code: 'CS101',
            description: 'Basic programming concepts',
            teacher: { first_name: 'John', last_name: 'Doe' },
            department: { name: 'Computer Science' },
            enrollmentStats: { enrolled: 25, capacity: 30 }
          }
        ],
        total: 1,
        hasMore: false
      };

      mockClassDiscoveryService.searchClasses.mockResolvedValue(mockSearchResult);

      const request = new NextRequest(
        'http://localhost/api/classes/search?query=computer&departmentId=dept-123&hasCapacity=true'
      );

      const response = await searchClasses(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.classes).toHaveLength(1);
      expect(data.classes[0].name).toBe('Introduction to Computer Science');
      expect(mockClassDiscoveryService.searchClasses).toHaveBeenCalledWith({
        query: 'computer',
        departmentId: 'dept-123',
        hasCapacity: true,
        limit: 50,
        offset: 0,
        sortBy: 'name',
        sortOrder: 'asc',
        institutionId: undefined,
        teacherId: undefined,
        enrollmentType: undefined,
        startDate: undefined,
        endDate: undefined,
        dayOfWeek: undefined,
        timeSlot: undefined,
        level: undefined,
        credits: undefined,
        tags: undefined
      });
    });

    it('should handle search with multiple filters', async () => {
      const mockSearchResult = {
        classes: [],
        total: 0,
        hasMore: false
      };

      mockClassDiscoveryService.searchClasses.mockResolvedValue(mockSearchResult);

      const request = new NextRequest(
        'http://localhost/api/classes/search?query=math&level=undergraduate&credits=3&tags=algebra,calculus&limit=20&offset=10'
      );

      const response = await searchClasses(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockClassDiscoveryService.searchClasses).toHaveBeenCalledWith({
        query: 'math',
        level: 'undergraduate',
        credits: 3,
        tags: ['algebra', 'calculus'],
        limit: 20,
        offset: 10,
        sortBy: 'name',
        sortOrder: 'asc',
        departmentId: undefined,
        institutionId: undefined,
        teacherId: undefined,
        enrollmentType: undefined,
        hasCapacity: undefined,
        startDate: undefined,
        endDate: undefined,
        dayOfWeek: undefined,
        timeSlot: undefined
      });
    });

    it('should handle unauthorized access', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Unauthorized')
      });

      const request = new NextRequest('http://localhost/api/classes/search');
      const response = await searchClasses(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/classes/available', () => {
    it('should fetch available classes for student', async () => {
      const mockAvailableClasses = [
        {
          id: 'class-123',
          name: 'Biology 101',
          code: 'BIO101',
          enrollmentType: 'open',
          hasCapacity: true,
          meetsPrerequisites: true
        },
        {
          id: 'class-456',
          name: 'Chemistry 101',
          code: 'CHEM101',
          enrollmentType: 'restricted',
          hasCapacity: false,
          meetsPrerequisites: true
        }
      ];

      mockClassDiscoveryService.getAvailableClasses.mockResolvedValue(mockAvailableClasses);

      const request = new NextRequest('http://localhost/api/classes/available');
      const response = await availableClasses(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.classes).toEqual(mockAvailableClasses);
      expect(mockClassDiscoveryService.getAvailableClasses).toHaveBeenCalledWith('user-123');
    });

    it('should allow admin to fetch for different student', async () => {
      mockSupabase.from = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: { role: 'institution_admin', institution_id: 'inst-123' },
              error: null
            }))
          }))
        }))
      }));

      const mockAvailableClasses = [];
      mockClassDiscoveryService.getAvailableClasses.mockResolvedValue(mockAvailableClasses);

      const request = new NextRequest('http://localhost/api/classes/available?studentId=student-456');
      const response = await availableClasses(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockClassDiscoveryService.getAvailableClasses).toHaveBeenCalledWith('student-456');
    });

    it('should deny access to other student data for regular users', async () => {
      mockSupabase.from = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: { role: 'student', institution_id: 'inst-123' },
              error: null
            }))
          }))
        }))
      }));

      const request = new NextRequest('http://localhost/api/classes/available?studentId=student-456');
      const response = await availableClasses(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('GET /api/classes/[id]/details', () => {
    it('should fetch class details with eligibility and statistics', async () => {
      const mockClassDetails = {
        id: 'class-123',
        name: 'Advanced Mathematics',
        code: 'MATH301',
        description: 'Advanced mathematical concepts',
        teacher: { first_name: 'Jane', last_name: 'Smith' },
        prerequisites: [
          { type: 'course', requirement: 'MATH201', description: 'Calculus II' }
        ],
        restrictions: []
      };

      const mockEligibility = {
        eligible: true,
        reasons: [],
        warnings: ['This is a challenging course']
      };

      const mockStatistics = {
        enrolled: 28,
        capacity: 30,
        waitlisted: 5,
        dropRate: 0.1
      };

      mockClassDiscoveryService.getClassDetails.mockResolvedValue(mockClassDetails);
      mockClassDiscoveryService.checkEnrollmentEligibility.mockResolvedValue(mockEligibility);
      mockClassDiscoveryService.getEnrollmentStatistics.mockResolvedValue(mockStatistics);

      const request = new NextRequest('http://localhost/api/classes/class-123/details');
      const response = await classDetails(request, { params: { id: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.class).toEqual(mockClassDetails);
      expect(data.eligibility).toEqual(mockEligibility);
      expect(data.statistics).toEqual(mockStatistics);
      expect(mockClassDiscoveryService.getClassDetails).toHaveBeenCalledWith('class-123', 'user-123');
      expect(mockClassDiscoveryService.checkEnrollmentEligibility).toHaveBeenCalledWith('user-123', 'class-123');
      expect(mockClassDiscoveryService.getEnrollmentStatistics).toHaveBeenCalledWith('class-123');
    });

    it('should return 404 for non-existent class', async () => {
      mockClassDiscoveryService.getClassDetails.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/classes/invalid-id/details');
      const response = await classDetails(request, { params: { id: 'invalid-id' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Class not found');
    });

    it('should handle service errors', async () => {
      mockClassDiscoveryService.getClassDetails.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/classes/class-123/details');
      const response = await classDetails(request, { params: { id: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch class details');
    });
  });
});