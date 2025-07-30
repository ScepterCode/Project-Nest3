// API tests for enrollment configuration endpoints
// Tests CRUD operations, validation, and authorization

import { NextRequest } from 'next/server';
import { GET, PUT } from '@/app/api/classes/[id]/enrollment-config/route';
import { GET as getPrerequisites, POST as addPrerequisite } from '@/app/api/classes/[id]/prerequisites/route';
import { GET as getRestrictions, POST as addRestriction } from '@/app/api/classes/[id]/restrictions/route';
import { createClient } from '@/lib/supabase/server';
import { enrollmentConfigService } from '@/lib/services/enrollment-config';
import { EnrollmentType, PrerequisiteType, RestrictionType } from '@/lib/types/enrollment';

// Mock dependencies
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/services/enrollment-config');

const mockSupabase = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn()
};

const mockEnrollmentConfigService = enrollmentConfigService as jest.Mocked<typeof enrollmentConfigService>;

beforeEach(() => {
  (createClient as jest.Mock).mockReturnValue(mockSupabase);
  jest.clearAllMocks();
});

describe('/api/classes/[id]/enrollment-config', () => {
  const mockUser = { id: 'user-123', email: 'teacher@example.com' };
  const mockClass = {
    id: 'class-123',
    teacher_id: 'user-123',
    institution_id: 'inst-123'
  };

  describe('GET', () => {
    it('should return enrollment configuration for authorized teacher', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single.mockResolvedValue({ data: mockClass, error: null });

      const mockConfig = {
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
      };

      const mockPrerequisites = [
        {
          id: 'prereq-1',
          classId: 'class-123',
          type: PrerequisiteType.COURSE,
          requirement: 'MATH101',
          description: 'Math prerequisite',
          strict: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const mockRestrictions = [
        {
          id: 'restriction-1',
          classId: 'class-123',
          type: RestrictionType.YEAR_LEVEL,
          condition: 'Senior',
          description: 'Senior only',
          overridable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockEnrollmentConfigService.getClassConfig.mockResolvedValue(mockConfig);
      mockEnrollmentConfigService.getPrerequisites.mockResolvedValue(mockPrerequisites);
      mockEnrollmentConfigService.getRestrictions.mockResolvedValue(mockRestrictions);

      const request = new NextRequest('http://localhost/api/classes/class-123/enrollment-config');
      const response = await GET(request, { params: { id: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.config).toEqual(mockConfig);
      expect(data.prerequisites).toEqual(mockPrerequisites);
      expect(data.restrictions).toEqual(mockRestrictions);
    });

    it('should return 401 for unauthenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

      const request = new NextRequest('http://localhost/api/classes/class-123/enrollment-config');
      const response = await GET(request, { params: { id: 'class-123' } });

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent class', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest('http://localhost/api/classes/invalid-class/enrollment-config');
      const response = await GET(request, { params: { id: 'invalid-class' } });

      expect(response.status).toBe(404);
    });

    it('should return 403 for unauthorized user', async () => {
      const unauthorizedUser = { id: 'other-user', email: 'other@example.com' };
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: unauthorizedUser }, error: null });
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClass, error: null }) // Class data
        .mockResolvedValueOnce({ data: { role: 'student', institution_id: 'other-inst' }, error: null }); // User profile

      const request = new NextRequest('http://localhost/api/classes/class-123/enrollment-config');
      const response = await GET(request, { params: { id: 'class-123' } });

      expect(response.status).toBe(403);
    });
  });

  describe('PUT', () => {
    it('should update enrollment configuration successfully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single.mockResolvedValue({ data: mockClass, error: null });

      const updateData = {
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        waitlistCapacity: 15,
        autoApprove: true,
        requiresJustification: false
      };

      const updatedConfig = {
        ...updateData,
        allowWaitlist: true,
        maxWaitlistPosition: null,
        notificationSettings: {
          enrollmentConfirmation: true,
          waitlistUpdates: true,
          deadlineReminders: true,
          capacityAlerts: true
        }
      };

      mockEnrollmentConfigService.updateClassConfig.mockResolvedValue(updatedConfig);

      const request = new NextRequest('http://localhost/api/classes/class-123/enrollment-config', {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });

      const response = await PUT(request, { params: { id: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.config).toEqual(updatedConfig);
      expect(mockEnrollmentConfigService.updateClassConfig).toHaveBeenCalledWith(
        'class-123',
        expect.objectContaining({
          enrollmentType: EnrollmentType.OPEN,
          capacity: 30,
          waitlistCapacity: 15,
          autoApprove: true,
          requiresJustification: false
        }),
        'user-123'
      );
    });

    it('should return 400 for validation errors', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single.mockResolvedValue({ data: mockClass, error: null });

      const invalidData = {
        capacity: -5 // Invalid capacity
      };

      mockEnrollmentConfigService.updateClassConfig.mockRejectedValue(
        new Error('Configuration validation failed: Class capacity must be at least 1')
      );

      const request = new NextRequest('http://localhost/api/classes/class-123/enrollment-config', {
        method: 'PUT',
        body: JSON.stringify(invalidData)
      });

      const response = await PUT(request, { params: { id: 'class-123' } });

      expect(response.status).toBe(400);
    });

    it('should handle date conversion correctly', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single.mockResolvedValue({ data: mockClass, error: null });

      const updateData = {
        enrollmentStart: '2024-01-15T09:00:00Z',
        enrollmentEnd: '2024-02-15T23:59:59Z',
        dropDeadline: '2024-03-01',
        withdrawDeadline: '2024-04-01'
      };

      mockEnrollmentConfigService.updateClassConfig.mockResolvedValue({
        enrollmentType: EnrollmentType.OPEN,
        capacity: 30,
        waitlistCapacity: 10,
        enrollmentStart: new Date('2024-01-15T09:00:00Z'),
        enrollmentEnd: new Date('2024-02-15T23:59:59Z'),
        dropDeadline: new Date('2024-03-01'),
        withdrawDeadline: new Date('2024-04-01'),
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

      const request = new NextRequest('http://localhost/api/classes/class-123/enrollment-config', {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });

      const response = await PUT(request, { params: { id: 'class-123' } });

      expect(response.status).toBe(200);
      expect(mockEnrollmentConfigService.updateClassConfig).toHaveBeenCalledWith(
        'class-123',
        expect.objectContaining({
          enrollmentStart: new Date('2024-01-15T09:00:00Z'),
          enrollmentEnd: new Date('2024-02-15T23:59:59Z'),
          dropDeadline: new Date('2024-03-01'),
          withdrawDeadline: new Date('2024-04-01')
        }),
        'user-123'
      );
    });
  });
});

describe('/api/classes/[id]/prerequisites', () => {
  const mockUser = { id: 'user-123', email: 'teacher@example.com' };
  const mockClass = {
    id: 'class-123',
    teacher_id: 'user-123',
    institution_id: 'inst-123'
  };

  describe('GET', () => {
    it('should return prerequisites for a class', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single.mockResolvedValue({ data: mockClass, error: null });

      const mockPrerequisites = [
        {
          id: 'prereq-1',
          classId: 'class-123',
          type: PrerequisiteType.COURSE,
          requirement: 'MATH101',
          description: 'Math prerequisite',
          strict: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockEnrollmentConfigService.getPrerequisites.mockResolvedValue(mockPrerequisites);

      const request = new NextRequest('http://localhost/api/classes/class-123/prerequisites');
      const response = await getPrerequisites(request, { params: { id: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.prerequisites).toEqual(mockPrerequisites);
    });
  });

  describe('POST', () => {
    it('should add prerequisite successfully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClass, error: null }) // Class data
        .mockResolvedValueOnce({ data: { role: 'teacher', institution_id: 'inst-123' }, error: null }); // User profile

      const prerequisiteData = {
        type: PrerequisiteType.COURSE,
        requirement: 'MATH101',
        description: 'Introduction to Mathematics',
        strict: true
      };

      const mockPrerequisite = {
        id: 'prereq-123',
        classId: 'class-123',
        ...prerequisiteData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockEnrollmentConfigService.addPrerequisite.mockResolvedValue(mockPrerequisite);

      const request = new NextRequest('http://localhost/api/classes/class-123/prerequisites', {
        method: 'POST',
        body: JSON.stringify(prerequisiteData)
      });

      const response = await addPrerequisite(request, { params: { id: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.prerequisite).toEqual(mockPrerequisite);
      expect(mockEnrollmentConfigService.addPrerequisite).toHaveBeenCalledWith(
        'class-123',
        prerequisiteData,
        'user-123'
      );
    });

    it('should return 400 for validation errors', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClass, error: null })
        .mockResolvedValueOnce({ data: { role: 'teacher', institution_id: 'inst-123' }, error: null });

      const invalidPrerequisite = {
        type: PrerequisiteType.COURSE,
        requirement: '', // Empty requirement
        description: 'Test',
        strict: true
      };

      mockEnrollmentConfigService.addPrerequisite.mockRejectedValue(
        new Error('Prerequisite validation failed: Prerequisite requirement is required')
      );

      const request = new NextRequest('http://localhost/api/classes/class-123/prerequisites', {
        method: 'POST',
        body: JSON.stringify(invalidPrerequisite)
      });

      const response = await addPrerequisite(request, { params: { id: 'class-123' } });

      expect(response.status).toBe(400);
    });
  });
});

describe('/api/classes/[id]/restrictions', () => {
  const mockUser = { id: 'user-123', email: 'teacher@example.com' };
  const mockClass = {
    id: 'class-123',
    teacher_id: 'user-123',
    institution_id: 'inst-123'
  };

  describe('GET', () => {
    it('should return restrictions for a class', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single.mockResolvedValue({ data: mockClass, error: null });

      const mockRestrictions = [
        {
          id: 'restriction-1',
          classId: 'class-123',
          type: RestrictionType.YEAR_LEVEL,
          condition: 'Senior',
          description: 'Senior only',
          overridable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockEnrollmentConfigService.getRestrictions.mockResolvedValue(mockRestrictions);

      const request = new NextRequest('http://localhost/api/classes/class-123/restrictions');
      const response = await getRestrictions(request, { params: { id: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.restrictions).toEqual(mockRestrictions);
    });
  });

  describe('POST', () => {
    it('should add restriction successfully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClass, error: null })
        .mockResolvedValueOnce({ data: { role: 'teacher', institution_id: 'inst-123' }, error: null });

      const restrictionData = {
        type: RestrictionType.YEAR_LEVEL,
        condition: 'Senior',
        description: 'Only seniors allowed',
        overridable: true
      };

      const mockRestriction = {
        id: 'restriction-123',
        classId: 'class-123',
        ...restrictionData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockEnrollmentConfigService.addRestriction.mockResolvedValue(mockRestriction);

      const request = new NextRequest('http://localhost/api/classes/class-123/restrictions', {
        method: 'POST',
        body: JSON.stringify(restrictionData)
      });

      const response = await addRestriction(request, { params: { id: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.restriction).toEqual(mockRestriction);
      expect(mockEnrollmentConfigService.addRestriction).toHaveBeenCalledWith(
        'class-123',
        restrictionData,
        'user-123'
      );
    });

    it('should return 400 for validation errors', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockClass, error: null })
        .mockResolvedValueOnce({ data: { role: 'teacher', institution_id: 'inst-123' }, error: null });

      const invalidRestriction = {
        type: RestrictionType.GPA,
        condition: '', // Empty condition
        description: 'Test',
        overridable: false
      };

      mockEnrollmentConfigService.addRestriction.mockRejectedValue(
        new Error('Restriction validation failed: Restriction condition is required')
      );

      const request = new NextRequest('http://localhost/api/classes/class-123/restrictions', {
        method: 'POST',
        body: JSON.stringify(invalidRestriction)
      });

      const response = await addRestriction(request, { params: { id: 'class-123' } });

      expect(response.status).toBe(400);
    });
  });
});