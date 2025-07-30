import { NextRequest } from 'next/server';
import { POST as joinWaitlist, GET as getWaitlists } from '@/app/api/waitlists/route';
import { POST as joinClassWaitlist } from '@/app/api/waitlists/[classId]/join/route';
import { GET as getWaitlistPosition } from '@/app/api/waitlists/[classId]/position/route';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase
jest.mock('@/lib/supabase/server');
const mockSupabase = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => ({ data: [], error: null })),
        single: jest.fn(() => ({ data: null, error: null }))
      }))
    }))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

// Mock services
const mockWaitlistManager = {
  addToWaitlist: jest.fn(),
  getWaitlistPosition: jest.fn(),
  estimateEnrollmentProbability: jest.fn()
};

jest.mock('@/lib/services/waitlist-manager', () => ({
  WaitlistManager: jest.fn().mockImplementation(() => mockWaitlistManager)
}));

describe('Waitlist API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });
  });

  describe('POST /api/waitlists', () => {
    it('should successfully add student to waitlist', async () => {
      const mockWaitlistEntry = {
        id: 'waitlist-123',
        student_id: 'user-123',
        class_id: 'class-123',
        position: 3,
        priority: 0,
        estimated_probability: 0.7,
        added_at: new Date().toISOString()
      };

      mockWaitlistManager.addToWaitlist.mockResolvedValue(mockWaitlistEntry);

      const request = new NextRequest('http://localhost/api/waitlists', {
        method: 'POST',
        body: JSON.stringify({
          classId: 'class-123',
          priority: 0
        })
      });

      const response = await joinWaitlist(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.waitlistEntry).toEqual(mockWaitlistEntry);
      expect(data.message).toBe('Successfully added to waitlist');
      expect(mockWaitlistManager.addToWaitlist).toHaveBeenCalledWith('user-123', 'class-123', 0);
    });

    it('should return error for missing class ID', async () => {
      const request = new NextRequest('http://localhost/api/waitlists', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await joinWaitlist(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Class ID is required');
    });

    it('should handle duplicate waitlist entry', async () => {
      mockWaitlistManager.addToWaitlist.mockRejectedValue(
        new Error('Student is already on the waitlist for this class')
      );

      const request = new NextRequest('http://localhost/api/waitlists', {
        method: 'POST',
        body: JSON.stringify({ classId: 'class-123' })
      });

      const response = await joinWaitlist(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('Student is already on the waitlist for this class');
    });
  });

  describe('GET /api/waitlists', () => {
    it('should fetch user waitlist entries', async () => {
      const mockWaitlistEntries = [
        {
          id: 'waitlist-123',
          student_id: 'user-123',
          class_id: 'class-123',
          position: 2,
          classes: {
            name: 'Advanced Physics',
            code: 'PHYS301',
            users: { first_name: 'Dr.', last_name: 'Einstein' },
            departments: { name: 'Physics' }
          }
        }
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              data: mockWaitlistEntries,
              error: null
            }))
          }))
        }))
      });

      const request = new NextRequest('http://localhost/api/waitlists');
      const response = await getWaitlists(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.waitlistEntries).toEqual(mockWaitlistEntries);
    });

    it('should filter by class ID when provided', async () => {
      const mockWaitlistEntries = [];

      const mockQuery = {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => ({
                data: mockWaitlistEntries,
                error: null
              }))
            }))
          }))
        }))
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const request = new NextRequest('http://localhost/api/waitlists?classId=class-123');
      const response = await getWaitlists(request);

      expect(response.status).toBe(200);
      expect(mockQuery.select().eq().eq).toHaveBeenCalledWith('class_id', 'class-123');
    });

    it('should allow admin to view other student waitlists', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: { role: 'institution_admin', institution_id: 'inst-123' },
              error: null
            }))
          }))
        }))
      });

      const request = new NextRequest('http://localhost/api/waitlists?studentId=student-456');
      const response = await getWaitlists(request);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/waitlists/[classId]/join', () => {
    it('should add student to specific class waitlist', async () => {
      const mockWaitlistEntry = {
        id: 'waitlist-456',
        student_id: 'user-123',
        class_id: 'class-456',
        position: 1,
        priority: 5
      };

      mockWaitlistManager.addToWaitlist.mockResolvedValue(mockWaitlistEntry);

      const request = new NextRequest('http://localhost/api/waitlists/class-456/join', {
        method: 'POST',
        body: JSON.stringify({ priority: 5 })
      });

      const response = await joinClassWaitlist(request, { params: { classId: 'class-456' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.waitlistEntry).toEqual(mockWaitlistEntry);
      expect(mockWaitlistManager.addToWaitlist).toHaveBeenCalledWith('user-123', 'class-456', 5);
    });
  });

  describe('GET /api/waitlists/[classId]/position', () => {
    it('should get waitlist position and probability', async () => {
      mockWaitlistManager.getWaitlistPosition.mockResolvedValue(3);
      mockWaitlistManager.estimateEnrollmentProbability.mockResolvedValue(0.65);

      const request = new NextRequest('http://localhost/api/waitlists/class-123/position');
      const response = await getWaitlistPosition(request, { params: { classId: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.position).toBe(3);
      expect(data.estimatedProbability).toBe(0.65);
      expect(data.classId).toBe('class-123');
      expect(data.studentId).toBe('user-123');
      expect(mockWaitlistManager.getWaitlistPosition).toHaveBeenCalledWith('user-123', 'class-123');
      expect(mockWaitlistManager.estimateEnrollmentProbability).toHaveBeenCalledWith('user-123', 'class-123');
    });

    it('should allow checking position for different student with proper permissions', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: { role: 'teacher', institution_id: 'inst-123' },
              error: null
            }))
          }))
        }))
      });

      mockWaitlistManager.getWaitlistPosition.mockResolvedValue(1);
      mockWaitlistManager.estimateEnrollmentProbability.mockResolvedValue(0.9);

      const request = new NextRequest('http://localhost/api/waitlists/class-123/position?studentId=student-456');
      const response = await getWaitlistPosition(request, { params: { classId: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.studentId).toBe('student-456');
      expect(mockWaitlistManager.getWaitlistPosition).toHaveBeenCalledWith('student-456', 'class-123');
    });

    it('should deny access to other student position for regular users', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: { role: 'student', institution_id: 'inst-123' },
              error: null
            }))
          }))
        }))
      });

      const request = new NextRequest('http://localhost/api/waitlists/class-123/position?studentId=student-456');
      const response = await getWaitlistPosition(request, { params: { classId: 'class-123' } });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });
});