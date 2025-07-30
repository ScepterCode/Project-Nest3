import { EnrollmentPatternAnalysisService } from '@/lib/services/enrollment-pattern-analysis';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  select: jest.fn(),
  eq: jest.fn(),
  gte: jest.fn(),
  not: jest.fn(),
  in: jest.fn(),
  order: jest.fn(),
  limit: jest.fn()
};

// Mock the Supabase client creation
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('EnrollmentPatternAnalysisService', () => {
  let service: EnrollmentPatternAnalysisService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.not.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    
    service = new EnrollmentPatternAnalysisService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeUserPatterns', () => {
    it('should analyze normal user patterns with low risk', async () => {
      // Mock normal enrollment history
      const normalEnrollments = [
        {
          id: 'enrollment-1',
          student_id: 'user-1',
          class_id: 'class-1',
          enrolled_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'enrolled',
          classes: {
            id: 'class-1',
            name: 'Math 101',
            department_id: 'dept-1',
            schedule: '10:00 AM - 11:00 AM MWF',
            capacity: 30,
            created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
          }
        },
        {
          id: 'enrollment-2',
          student_id: 'user-1',
          class_id: 'class-2',
          enrolled_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'enrolled',
          classes: {
            id: 'class-2',
            name: 'English 101',
            department_id: 'dept-2',
            schedule: '2:00 PM - 3:00 PM TTh',
            capacity: 25,
            created_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
      ];

      // Mock normal waitlist behavior
      const normalWaitlistEntries = [
        {
          id: 'waitlist-1',
          student_id: 'user-1',
          class_id: 'class-3',
          added_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];

      // Mock normal enrollment attempts
      const normalAttempts = [
        {
          ip_address: '192.168.1.1',
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        }
      ];

      mockSupabase.limit
        .mockResolvedValueOnce({ data: normalEnrollments, error: null }) // getUserEnrollmentHistory
        .mockResolvedValueOnce({ data: normalWaitlistEntries, error: null }) // waitlist entries
        .mockResolvedValueOnce({ data: normalEnrollments, error: null }) // completed courses
        .mockResolvedValueOnce({ data: normalAttempts, error: null }); // enrollment attempts

      const result = await service.analyzeUserPatterns('user-1');

      expect(result.overallRiskScore).toBeLessThan(30);
      expect(result.requiresReview).toBe(false);
      expect(result.patterns.length).toBeGreaterThanOrEqual(0);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect temporal patterns - bulk enrollments', async () => {
      // Mock rapid enrollments within short time window
      const rapidEnrollments = Array.from({ length: 8 }, (_, i) => ({
        id: `enrollment-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 5 * 60 * 1000).toISOString(), // 5 minutes apart
        status: 'enrolled',
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM',
          capacity: 30,
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        }
      }));

      mockSupabase.limit
        .mockResolvedValueOnce({ data: rapidEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: rapidEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const temporalPatterns = result.patterns.filter(p => p.patternType === 'temporal');
      expect(temporalPatterns.length).toBeGreaterThan(0);
      expect(temporalPatterns.some(p => p.description.includes('short time periods'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(20);
    });

    it('should detect temporal patterns - off-hours activity', async () => {
      // Mock off-hours enrollments (2 AM)
      const offHoursEnrollments = Array.from({ length: 5 }, (_, i) => ({
        id: `enrollment-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(2023, 5, 15, 2, i * 10).toISOString(), // 2 AM
        status: 'enrolled',
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM',
          capacity: 30,
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        }
      }));

      mockSupabase.limit
        .mockResolvedValueOnce({ data: offHoursEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: offHoursEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const temporalPatterns = result.patterns.filter(p => p.patternType === 'temporal');
      expect(temporalPatterns.some(p => p.description.includes('off-hours'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(15);
    });

    it('should detect behavioral patterns - excessive enrollment frequency', async () => {
      // Mock excessive enrollments (25 in recent period)
      const excessiveEnrollments = Array.from({ length: 25 }, (_, i) => ({
        id: `enrollment-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        status: 'enrolled',
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM',
          capacity: 30,
          created_at: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString()
        }
      }));

      mockSupabase.limit
        .mockResolvedValueOnce({ data: excessiveEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: excessiveEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const behavioralPatterns = result.patterns.filter(p => p.patternType === 'behavioral');
      expect(behavioralPatterns.some(p => p.description.includes('high enrollment frequency'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(40);
    });

    it('should detect behavioral patterns - fast enrollment behavior', async () => {
      // Mock very fast enrollments (within seconds of class creation)
      const fastEnrollments = Array.from({ length: 5 }, (_, i) => {
        const classCreated = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const enrolled = new Date(classCreated.getTime() + 30000); // 30 seconds later
        
        return {
          id: `enrollment-${i}`,
          student_id: 'user-1',
          class_id: `class-${i}`,
          enrolled_at: enrolled.toISOString(),
          status: 'enrolled',
          classes: {
            id: `class-${i}`,
            name: `Course ${i}`,
            department_id: 'dept-1',
            schedule: '10:00 AM - 11:00 AM',
            capacity: 30,
            created_at: classCreated.toISOString()
          }
        };
      });

      mockSupabase.limit
        .mockResolvedValueOnce({ data: fastEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: fastEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const behavioralPatterns = result.patterns.filter(p => p.patternType === 'behavioral');
      expect(behavioralPatterns.some(p => p.description.includes('fast enrollment'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(30);
    });

    it('should detect behavioral patterns - high drop rate', async () => {
      // Mock enrollments with high drop rate
      const enrollmentsWithDrops = Array.from({ length: 10 }, (_, i) => ({
        id: `enrollment-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        status: i < 6 ? 'dropped' : 'enrolled', // 60% drop rate
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM',
          capacity: 30,
          created_at: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString()
        }
      }));

      mockSupabase.limit
        .mockResolvedValueOnce({ data: enrollmentsWithDrops, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: enrollmentsWithDrops, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const behavioralPatterns = result.patterns.filter(p => p.patternType === 'behavioral');
      expect(behavioralPatterns.some(p => p.description.includes('drop rate'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(20);
    });

    it('should detect waitlist gaming behavior', async () => {
      // Mock high waitlist join rate with low acceptance
      const waitlistEntries = Array.from({ length: 10 }, (_, i) => ({
        id: `waitlist-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        added_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString()
      }));

      // Mock few actual enrollments from waitlist
      const enrollments = Array.from({ length: 2 }, (_, i) => ({
        id: `enrollment-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        status: 'enrolled',
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM',
          capacity: 30,
          created_at: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString()
        }
      }));

      mockSupabase.limit
        .mockResolvedValueOnce({ data: enrollments, error: null })
        .mockResolvedValueOnce({ data: waitlistEntries, error: null })
        .mockResolvedValueOnce({ data: enrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const behavioralPatterns = result.patterns.filter(p => p.patternType === 'behavioral');
      expect(behavioralPatterns.some(p => p.description.includes('waitlist gaming'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(25);
    });

    it('should detect academic patterns - prerequisite conflicts', async () => {
      // Mock enrollments in advanced courses
      const advancedEnrollments = [
        {
          id: 'enrollment-1',
          student_id: 'user-1',
          class_id: 'class-1',
          enrolled_at: new Date().toISOString(),
          status: 'enrolled',
          classes: {
            id: 'class-1',
            name: 'Advanced Math 401',
            department_id: 'dept-1',
            schedule: '10:00 AM - 11:00 AM',
            capacity: 30,
            created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          }
        },
        {
          id: 'enrollment-2',
          student_id: 'user-1',
          class_id: 'class-2',
          enrolled_at: new Date().toISOString(),
          status: 'enrolled',
          classes: {
            id: 'class-2',
            name: 'Physics 450',
            department_id: 'dept-2',
            schedule: '2:00 PM - 3:00 PM',
            capacity: 25,
            created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          }
        }
      ];

      mockSupabase.limit
        .mockResolvedValueOnce({ data: advancedEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null }) // No completed prerequisites
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const academicPatterns = result.patterns.filter(p => p.patternType === 'academic');
      expect(academicPatterns.some(p => p.description.includes('advanced courses'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(35);
    });

    it('should detect geographic patterns - multiple IP addresses', async () => {
      // Mock enrollment attempts from multiple IPs
      const multipleIPAttempts = [
        { ip_address: '192.168.1.1', created_at: new Date().toISOString() },
        { ip_address: '10.0.0.1', created_at: new Date(Date.now() - 60000).toISOString() },
        { ip_address: '172.16.0.1', created_at: new Date(Date.now() - 120000).toISOString() },
        { ip_address: '203.0.113.1', created_at: new Date(Date.now() - 180000).toISOString() },
        { ip_address: '198.51.100.1', created_at: new Date(Date.now() - 240000).toISOString() },
        { ip_address: '192.0.2.1', created_at: new Date(Date.now() - 300000).toISOString() }
      ];

      mockSupabase.limit
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: multipleIPAttempts, error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const geographicPatterns = result.patterns.filter(p => p.patternType === 'geographic');
      expect(geographicPatterns.some(p => p.description.includes('multiple IP addresses'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(15);
    });

    it('should detect rapid IP changes', async () => {
      // Mock rapid IP changes within short time windows
      const rapidIPChanges = [
        { ip_address: '192.168.1.1', created_at: new Date().toISOString() },
        { ip_address: '10.0.0.1', created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() }, // 30 min ago
        { ip_address: '172.16.0.1', created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString() } // 45 min ago
      ];

      mockSupabase.limit
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: rapidIPChanges, error: null });

      const result = await service.analyzeUserPatterns('user-1');

      const geographicPatterns = result.patterns.filter(p => p.patternType === 'geographic');
      expect(geographicPatterns.some(p => p.description.includes('rapid changes'))).toBe(true);
      expect(result.overallRiskScore).toBeGreaterThan(10);
    });

    it('should require review for high-risk patterns', async () => {
      // Mock multiple high-risk patterns
      const highRiskEnrollments = Array.from({ length: 30 }, (_, i) => ({
        id: `enrollment-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 60 * 1000).toISOString(), // 1 minute apart
        status: i < 15 ? 'dropped' : 'enrolled', // 50% drop rate
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '2:00 AM - 3:00 AM', // Off hours
          capacity: 30,
          created_at: new Date(Date.now() - (i + 1) * 60 * 1000).toISOString()
        }
      }));

      const multipleIPs = Array.from({ length: 10 }, (_, i) => ({
        ip_address: `192.168.1.${i}`,
        created_at: new Date(Date.now() - i * 60 * 1000).toISOString()
      }));

      mockSupabase.limit
        .mockResolvedValueOnce({ data: highRiskEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: highRiskEnrollments, error: null })
        .mockResolvedValueOnce({ data: multipleIPs, error: null });

      const result = await service.analyzeUserPatterns('user-1');

      expect(result.overallRiskScore).toBeGreaterThan(60);
      expect(result.requiresReview).toBe(true);
      expect(result.recommendations.some(r => r.includes('manual review'))).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.limit.mockRejectedValue(new Error('Database error'));

      const result = await service.analyzeUserPatterns('user-1');

      expect(result.patterns).toEqual([]);
      expect(result.overallRiskScore).toBe(0);
      expect(result.requiresReview).toBe(true);
      expect(result.recommendations).toContain('Pattern analysis failed - manual review recommended');
    });

    it('should handle empty enrollment history', async () => {
      mockSupabase.limit
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      expect(result.patterns.length).toBe(0);
      expect(result.overallRiskScore).toBe(0);
      expect(result.requiresReview).toBe(false);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle null/undefined user IDs', async () => {
      const result = await service.analyzeUserPatterns('');

      expect(result).toBeDefined();
      expect(result.patterns).toEqual([]);
      expect(result.overallRiskScore).toBe(0);
    });

    it('should handle malformed enrollment data', async () => {
      const malformedData = [
        {
          id: null,
          student_id: 'user-1',
          class_id: null,
          enrolled_at: 'invalid-date',
          status: 'enrolled',
          classes: null
        }
      ];

      mockSupabase.limit
        .mockResolvedValueOnce({ data: malformedData, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      expect(result).toBeDefined();
      expect(typeof result.overallRiskScore).toBe('number');
    });

    it('should handle concurrent analysis requests', async () => {
      mockSupabase.limit.mockResolvedValue({ data: [], error: null });

      const promises = Array.from({ length: 5 }, () =>
        service.analyzeUserPatterns('user-1')
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.overallRiskScore).toBe('number');
      });
    });

    it('should validate risk score bounds', async () => {
      // Mock extreme data that might cause score overflow
      const extremeEnrollments = Array.from({ length: 1000 }, (_, i) => ({
        id: `enrollment-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 1000).toISOString(),
        status: 'enrolled',
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM',
          capacity: 30,
          created_at: new Date(Date.now() - (i + 1) * 1000).toISOString()
        }
      }));

      mockSupabase.limit
        .mockResolvedValueOnce({ data: extremeEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: extremeEnrollments, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.analyzeUserPatterns('user-1');

      expect(result.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Performance Tests', () => {
    it('should complete analysis within reasonable time', async () => {
      const normalData = Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        status: 'enrolled',
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM',
          capacity: 30,
          created_at: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString()
        }
      }));

      mockSupabase.limit.mockResolvedValue({ data: normalData, error: null });

      const startTime = Date.now();
      await service.analyzeUserPatterns('user-1');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 500 }, (_, i) => ({
        id: `item-${i}`,
        student_id: 'user-1',
        class_id: `class-${i}`,
        enrolled_at: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
        status: 'enrolled',
        classes: {
          id: `class-${i}`,
          name: `Course ${i}`,
          department_id: 'dept-1',
          schedule: '10:00 AM - 11:00 AM',
          capacity: 30,
          created_at: new Date(Date.now() - (i + 1) * 60 * 60 * 1000).toISOString()
        }
      }));

      mockSupabase.limit.mockResolvedValue({ data: largeDataset, error: null });

      const startTime = Date.now();
      await service.analyzeUserPatterns('user-1');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should handle large datasets within 5 seconds
    });
  });
});