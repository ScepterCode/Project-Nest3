import { EnrollmentFraudPreventionService } from '@/lib/services/enrollment-fraud-prevention';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  eq: jest.fn(),
  gte: jest.fn(),
  not: jest.fn(),
  in: jest.fn(),
  order: jest.fn(),
  limit: jest.fn(),
  single: jest.fn()
};

// Mock the Supabase client creation
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('EnrollmentFraudPreventionService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.not.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
    
    service = new EnrollmentFraudPreventionService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateEnrollmentRequest', () => {
    it('should return valid result for normal enrollment request', async () => {
      // Mock database responses for normal user behavior
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No rapid attempts
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No duplicates
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal enrollments
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No prerequisites issues
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal sessions

      const result = await service.validateEnrollmentRequest('user-1', 'class-1');

      expect(result.isValid).toBe(true);
      expect(result.riskScore).toBeLessThan(50);
      expect(result.flags).toHaveLength(0);
    });

    it('should detect rapid enrollment attempts', async () => {
      // Mock rapid enrollment attempts
      const rapidAttempts = Array.from({ length: 15 }, (_, i) => ({
        id: `attempt-${i}`,
        user_id: 'user-1',
        created_at: new Date(Date.now() - i * 60000).toISOString() // 1 minute apart
      }));

      mockSupabase.single.mockResolvedValueOnce({ data: rapidAttempts, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No duplicates
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal enrollments
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No prerequisites issues
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal sessions

      const result = await service.validateEnrollmentRequest('user-1', 'class-1');

      expect(result.flags).toContain('rapid_enrollment_attempts');
      expect(result.riskScore).toBeGreaterThan(25);
      expect(result.recommendations).toContain('Implement cooling-off period');
    });

    it('should detect duplicate enrollment requests', async () => {
      // Mock duplicate requests
      const duplicateRequests = [
        {
          id: 'req-1',
          student_id: 'user-1',
          class_id: 'class-1',
          requested_at: new Date().toISOString()
        },
        {
          id: 'req-2',
          student_id: 'user-1',
          class_id: 'class-1',
          requested_at: new Date(Date.now() - 60000).toISOString()
        }
      ];

      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No rapid attempts
      mockSupabase.single.mockResolvedValueOnce({ data: duplicateRequests, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal enrollments
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No prerequisites issues
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal sessions

      const result = await service.validateEnrollmentRequest('user-1', 'class-1');

      expect(result.flags).toContain('duplicate_enrollment_requests');
      expect(result.riskScore).toBeGreaterThan(20);
      expect(result.recommendations).toContain('Block duplicate submissions');
    });

    it('should detect unusual enrollment patterns', async () => {
      // Mock excessive enrollments
      const excessiveEnrollments = Array.from({ length: 20 }, (_, i) => ({
        id: `enrollment-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM'
        }
      }));

      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No rapid attempts
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No duplicates
      mockSupabase.single.mockResolvedValueOnce({ data: excessiveEnrollments, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No prerequisites issues
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal sessions

      const result = await service.validateEnrollmentRequest('user-1', 'class-1');

      expect(result.flags).toContain('unusual_enrollment_pattern');
      expect(result.riskScore).toBeGreaterThan(20);
      expect(result.recommendations).toContain('Manual review required');
    });

    it('should detect prerequisite manipulation', async () => {
      // Mock class with prerequisites
      const prerequisites = [
        {
          id: 'prereq-1',
          class_id: 'class-1',
          type: 'course',
          requirement: 'prereq-class-1',
          strict: true
        }
      ];

      // Mock user without completed prerequisites
      const completedCourses = [];

      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No rapid attempts
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No duplicates
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal enrollments
      mockSupabase.single.mockResolvedValueOnce({ data: prerequisites, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: completedCourses, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal sessions

      const result = await service.validateEnrollmentRequest('user-1', 'class-1');

      expect(result.flags).toContain('prerequisite_manipulation');
      expect(result.riskScore).toBeGreaterThan(35);
      expect(result.recommendations).toContain('Verify academic records');
    });

    it('should detect session anomalies', async () => {
      // Mock multiple IP addresses in recent sessions
      const recentSessions = [
        {
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          created_at: new Date().toISOString()
        },
        {
          ip_address: '10.0.0.1',
          user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        },
        {
          ip_address: '172.16.0.1',
          user_agent: 'Mozilla/5.0 (X11; Linux x86_64)',
          created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
        },
        {
          ip_address: '203.0.113.1',
          user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1)',
          created_at: new Date(Date.now() - 50 * 60 * 1000).toISOString()
        }
      ];

      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No rapid attempts
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No duplicates
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // Normal enrollments
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null }); // No prerequisites issues
      mockSupabase.single.mockResolvedValueOnce({ data: recentSessions, error: null });

      const result = await service.validateEnrollmentRequest(
        'user-1',
        'class-1',
        { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0' }
      );

      expect(result.flags).toContain('session_anomalies');
      expect(result.riskScore).toBeGreaterThan(15);
      expect(result.recommendations).toContain('Require additional authentication');
    });

    it('should handle validation errors gracefully', async () => {
      // Mock database error
      mockSupabase.single.mockRejectedValue(new Error('Database error'));

      const result = await service.validateEnrollmentRequest('user-1', 'class-1');

      expect(result.isValid).toBe(false);
      expect(result.riskScore).toBe(100);
      expect(result.flags).toContain('validation_error');
      expect(result.recommendations).toContain('Manual review required due to system error');
    });

    it('should block high-risk enrollment requests', async () => {
      // Mock multiple risk factors
      const rapidAttempts = Array.from({ length: 15 }, (_, i) => ({
        id: `attempt-${i}`,
        user_id: 'user-1',
        created_at: new Date(Date.now() - i * 60000).toISOString()
      }));

      const duplicateRequests = [
        { id: 'req-1', student_id: 'user-1', class_id: 'class-1' },
        { id: 'req-2', student_id: 'user-1', class_id: 'class-1' }
      ];

      mockSupabase.single.mockResolvedValueOnce({ data: rapidAttempts, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: duplicateRequests, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: [], error: null });

      const result = await service.validateEnrollmentRequest('user-1', 'class-1');

      expect(result.isValid).toBe(false);
      expect(result.riskScore).toBeGreaterThanOrEqual(50);
      expect(result.flags.length).toBeGreaterThan(1);
    });
  });

  describe('reportSuspiciousActivity', () => {
    it('should successfully report suspicious activity', async () => {
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      const activity = {
        userId: 'user-1',
        activityType: 'rapid_enrollment',
        description: 'User attempted 15 enrollments in 5 minutes',
        riskLevel: 'high',
        metadata: { attemptCount: 15, timeWindow: 300000 }
      };

      await expect(service.reportSuspiciousActivity(activity)).resolves.not.toThrow();

      expect(mockSupabase.from).toHaveBeenCalledWith('suspicious_activities');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          activity_type: 'rapid_enrollment',
          description: 'User attempted 15 enrollments in 5 minutes',
          risk_level: 'high',
          metadata: { attemptCount: 15, timeWindow: 300000 }
        })
      );
    });

    it('should handle reporting errors gracefully', async () => {
      mockSupabase.insert.mockRejectedValue(new Error('Database error'));

      const activity = {
        userId: 'user-1',
        activityType: 'rapid_enrollment',
        description: 'Test activity',
        riskLevel: 'medium',
        metadata: {}
      };

      await expect(service.reportSuspiciousActivity(activity)).resolves.not.toThrow();
    });
  });

  describe('getSuspiciousActivities', () => {
    it('should retrieve suspicious activities for a user', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          user_id: 'user-1',
          activity_type: 'rapid_enrollment',
          description: 'Multiple rapid enrollments',
          risk_level: 'high',
          detected_at: new Date().toISOString(),
          metadata: {}
        }
      ];

      mockSupabase.single.mockResolvedValue({ data: mockActivities, error: null });

      const activities = await service.getSuspiciousActivities('user-1');

      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        id: 'activity-1',
        userId: 'user-1',
        activityType: 'rapid_enrollment',
        description: 'Multiple rapid enrollments',
        riskLevel: 'high'
      });
    });

    it('should return empty array on database error', async () => {
      mockSupabase.single.mockRejectedValue(new Error('Database error'));

      const activities = await service.getSuspiciousActivities('user-1');

      expect(activities).toEqual([]);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle null/undefined user IDs', async () => {
      const result = await service.validateEnrollmentRequest('', 'class-1');

      expect(result.isValid).toBe(false);
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should handle malformed metadata', async () => {
      mockSupabase.single.mockResolvedValue({ data: [], error: null });

      const result = await service.validateEnrollmentRequest(
        'user-1',
        'class-1',
        { malformedData: { circular: {} } }
      );

      expect(result).toBeDefined();
      expect(typeof result.isValid).toBe('boolean');
    });

    it('should validate input parameters', async () => {
      // Test with invalid class ID
      const result = await service.validateEnrollmentRequest('user-1', '');

      expect(result.isValid).toBe(false);
    });

    it('should handle concurrent validation requests', async () => {
      mockSupabase.single.mockResolvedValue({ data: [], error: null });

      const promises = Array.from({ length: 5 }, () =>
        service.validateEnrollmentRequest('user-1', 'class-1')
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.isValid).toBe('boolean');
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should complete validation within reasonable time', async () => {
      mockSupabase.single.mockResolvedValue({ data: [], error: null });

      const startTime = Date.now();
      await service.validateEnrollmentRequest('user-1', 'class-1');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle large datasets efficiently', async () => {
      // Mock large dataset
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        created_at: new Date(Date.now() - i * 1000).toISOString()
      }));

      mockSupabase.single.mockResolvedValue({ data: largeDataset, error: null });

      const startTime = Date.now();
      await service.validateEnrollmentRequest('user-1', 'class-1');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should handle large datasets efficiently
    });
  });
});