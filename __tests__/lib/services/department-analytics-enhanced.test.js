const { DepartmentAnalyticsService } = require('@/lib/services/department-analytics');

// Mock Supabase client
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis()
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

describe('DepartmentAnalyticsService - Enhanced Features', () => {
  let service;

  beforeEach(() => {
    service = new DepartmentAnalyticsService();
    jest.clearAllMocks();
  });

  describe('Enhanced Metrics Collection', () => {
    test('should collect comprehensive department metrics', async () => {
      const departmentId = 'test-department-id';
      
      // Mock the metric calculation methods
      jest.spyOn(service, 'calculateDepartmentMetrics').mockResolvedValue({
        studentCount: 50,
        teacherCount: 5,
        classCount: 10,
        assignmentCount: 25,
        completionRate: 78.5,
        performanceAverage: 82.3,
        atRiskStudents: 7,
        engagementScore: 65.2,
        retentionRate: 88.7,
        averageGradeImprovement: 3.2,
        assignmentSubmissionRate: 76.8,
        activeStudentsLast30Days: 42
      });

      mockSupabase.insert.mockResolvedValue({ error: null });

      await service.collectDepartmentMetrics(departmentId);

      expect(mockSupabase.from).toHaveBeenCalledWith('department_analytics');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            department_id: departmentId,
            metric_name: 'studentCount',
            metric_value: 50
          }),
          expect.objectContaining({
            department_id: departmentId,
            metric_name: 'engagementScore',
            metric_value: 65.2
          }),
          expect.objectContaining({
            department_id: departmentId,
            metric_name: 'retentionRate',
            metric_value: 88.7
          })
        ])
      );
    });

    test('should calculate engagement score correctly', async () => {
      const departmentId = 'test-department-id';
      
      const mockEnrollmentData = [
        {
          student_id: 'student1',
          class: {
            assignments: [
              {
                submissions: [
                  { submitted_at: '2024-01-15T10:00:00Z', created_at: '2024-01-10T10:00:00Z' },
                  { submitted_at: '2024-01-20T10:00:00Z', created_at: '2024-01-15T10:00:00Z' }
                ]
              }
            ]
          }
        }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockEnrollmentData, error: null });

      const engagementScore = await service.getEngagementScore(departmentId);

      expect(typeof engagementScore).toBe('number');
      expect(engagementScore).toBeGreaterThanOrEqual(0);
      expect(engagementScore).toBeLessThanOrEqual(100);
    });

    test('should calculate retention rate correctly', async () => {
      const departmentId = 'test-department-id';
      
      // Mock past enrollments (6 months ago)
      const pastEnrollments = [
        { student_id: 'student1' },
        { student_id: 'student2' },
        { student_id: 'student3' }
      ];

      // Mock current enrollments (2 students retained, 1 new)
      const currentEnrollments = [
        { student_id: 'student1' },
        { student_id: 'student2' },
        { student_id: 'student4' }
      ];

      mockSupabase.select
        .mockResolvedValueOnce({ data: pastEnrollments, error: null })
        .mockResolvedValueOnce({ data: currentEnrollments, error: null });

      const retentionRate = await service.getRetentionRate(departmentId);

      expect(retentionRate).toBeCloseTo(66.67, 1); // 2 out of 3 students retained
    });

    test('should calculate active students in last 30 days', async () => {
      const departmentId = 'test-department-id';
      
      const mockActiveSubmissions = [
        { student_id: 'student1' },
        { student_id: 'student2' },
        { student_id: 'student1' }, // Duplicate should be counted once
        { student_id: 'student3' }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockActiveSubmissions, error: null });

      const activeStudents = await service.getActiveStudentsLast30Days(departmentId);

      expect(activeStudents).toBe(3); // Unique students
    });
  });

  describe('Advanced Trend Analysis', () => {
    test('should provide advanced trend analysis with insights', async () => {
      const departmentId = 'test-department-id';
      
      const mockTrends = [
        { period: 'Jan 2024', metrics: { performanceAverage: 80 }, growthRate: 5, performanceChange: 2 },
        { period: 'Feb 2024', metrics: { performanceAverage: 82 }, growthRate: 3, performanceChange: 2 },
        { period: 'Mar 2024', metrics: { performanceAverage: 85 }, growthRate: 4, performanceChange: 3 },
        { period: 'Apr 2024', metrics: { performanceAverage: 83 }, growthRate: 2, performanceChange: -2 }
      ];

      jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue(mockTrends);

      const result = await service.getAdvancedTrendAnalysis(departmentId, 4);

      expect(result.trends).toEqual(mockTrends);
      expect(result.insights.overallTrend).toBe('improving'); // Average change > 1
      expect(result.insights.volatility).toBeGreaterThan(0);
      expect(Array.isArray(result.insights.seasonalPatterns)).toBe(true);
      expect(result.insights.predictions.nextPeriodPerformance).toBeGreaterThan(0);
      expect(result.insights.predictions.confidence).toBeGreaterThanOrEqual(0);
      expect(result.insights.predictions.confidence).toBeLessThanOrEqual(100);
    });

    test('should identify declining trends correctly', async () => {
      const departmentId = 'test-department-id';
      
      const mockTrends = [
        { period: 'Jan 2024', metrics: { performanceAverage: 85 }, growthRate: 0, performanceChange: 0 },
        { period: 'Feb 2024', metrics: { performanceAverage: 82 }, growthRate: -2, performanceChange: -3 },
        { period: 'Mar 2024', metrics: { performanceAverage: 78 }, growthRate: -3, performanceChange: -4 },
        { period: 'Apr 2024', metrics: { performanceAverage: 75 }, growthRate: -4, performanceChange: -3 }
      ];

      jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue(mockTrends);

      const result = await service.getAdvancedTrendAnalysis(departmentId, 4);

      expect(result.insights.overallTrend).toBe('declining');
    });

    test('should identify stable trends correctly', async () => {
      const departmentId = 'test-department-id';
      
      const mockTrends = [
        { period: 'Jan 2024', metrics: { performanceAverage: 80 }, growthRate: 0, performanceChange: 0 },
        { period: 'Feb 2024', metrics: { performanceAverage: 80.5 }, growthRate: 1, performanceChange: 0.5 },
        { period: 'Mar 2024', metrics: { performanceAverage: 79.8 }, growthRate: -1, performanceChange: -0.7 },
        { period: 'Apr 2024', metrics: { performanceAverage: 80.2 }, growthRate: 0.5, performanceChange: 0.4 }
      ];

      jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue(mockTrends);

      const result = await service.getAdvancedTrendAnalysis(departmentId, 4);

      expect(result.insights.overallTrend).toBe('stable');
    });
  });

  describe('Privacy-Compliant Reporting', () => {
    test('should apply strict privacy protection', async () => {
      const departmentId = 'test-department-id';
      
      const mockMetrics = {
        studentCount: 47,
        teacherCount: 6,
        classCount: 12,
        assignmentCount: 28,
        completionRate: 78.5,
        performanceAverage: 82.3,
        atRiskStudents: 7,
        engagementScore: 65.2,
        retentionRate: 88.7,
        averageGradeImprovement: 3.2,
        assignmentSubmissionRate: 76.8,
        activeStudentsLast30Days: 42
      };

      // Mock all required methods
      jest.spyOn(service, 'getDepartmentMetrics').mockResolvedValue(mockMetrics);
      jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue([]);
      jest.spyOn(service, 'generateAtRiskAlerts').mockResolvedValue([]);
      jest.spyOn(service, 'getAdvancedTrendAnalysis').mockResolvedValue({
        trends: [],
        insights: {
          overallTrend: 'stable',
          volatility: 2.5,
          seasonalPatterns: [],
          predictions: { nextPeriodPerformance: 82, confidence: 75 }
        }
      });

      const result = await service.generateDepartmentReport(departmentId, false, 'strict');

      // Check that strict privacy is applied
      expect(result.departmentId).not.toBe(departmentId); // Should be hashed
      expect(result.metrics.studentCountRange).toBeDefined();
      expect(result.metrics.performanceCategory).toBeDefined();
      expect(result.metrics.engagementLevel).toBeDefined();
      expect(result.privacyNotice).toContain('strict privacy protection');
    });

    test('should apply enhanced privacy protection', async () => {
      const departmentId = 'test-department-id';
      
      const mockMetrics = {
        studentCount: 47,
        teacherCount: 6,
        classCount: 12,
        assignmentCount: 28,
        completionRate: 78.5,
        performanceAverage: 82.3,
        atRiskStudents: 7,
        engagementScore: 65.2,
        retentionRate: 88.7,
        averageGradeImprovement: 3.2,
        assignmentSubmissionRate: 76.8,
        activeStudentsLast30Days: 42
      };

      // Mock all required methods
      jest.spyOn(service, 'getDepartmentMetrics').mockResolvedValue(mockMetrics);
      jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue([]);
      jest.spyOn(service, 'generateAtRiskAlerts').mockResolvedValue([]);
      jest.spyOn(service, 'getAdvancedTrendAnalysis').mockResolvedValue({
        trends: [],
        insights: {
          overallTrend: 'stable',
          volatility: 2.5,
          seasonalPatterns: [],
          predictions: { nextPeriodPerformance: 82, confidence: 75 }
        }
      });

      const result = await service.generateDepartmentReport(departmentId, false, 'enhanced');

      // Check that enhanced privacy is applied (rounded values)
      expect(result.metrics.studentCount).toBe(45); // Rounded to nearest 5
      expect(result.metrics.teacherCount).toBe(6); // Rounded to nearest 2
      expect(result.metrics.completionRate).toBe(79); // Rounded
      expect(result.privacyNotice).toContain('enhanced privacy measures');
    });

    test('should anonymize student data correctly', async () => {
      const studentData = [
        {
          studentId: 'real-student-id-123',
          studentName: 'John Doe',
          overallGrade: 78.5,
          completionRate: 85.2,
          engagementScore: 72.8,
          riskLevel: 'medium',
          lastActivity: new Date('2024-01-15'),
          concerningPatterns: ['Declining grade trend']
        }
      ];

      const anonymizedBasic = service.anonymizeStudentData(studentData, 'basic');
      const anonymizedStrict = service.anonymizeStudentData(studentData, 'strict');

      // Basic anonymization
      expect(anonymizedBasic[0].studentId).not.toBe('real-student-id-123');
      expect(anonymizedBasic[0].studentName).toBeUndefined();
      expect(anonymizedBasic[0].overallGrade).toBe(79); // Rounded
      expect(anonymizedBasic[0].lastActivityCategory).toBeDefined();

      // Strict anonymization
      expect(anonymizedStrict[0].studentId).toBe('student_1');
      expect(anonymizedStrict[0].studentName).toBeUndefined();
      expect(anonymizedStrict[0].lastActivityCategory).toBeUndefined();
    });
  });

  describe('Enhanced Risk Assessment', () => {
    test('should identify concerning patterns accurately', async () => {
      const submissions = [
        { grade: 85, submitted_at: '2024-01-01T10:00:00Z' },
        { grade: 80, submitted_at: '2024-01-05T10:00:00Z' },
        { grade: 75, submitted_at: '2024-01-10T10:00:00Z' },
        { grade: 70, submitted_at: '2024-01-15T10:00:00Z' },
        { grade: 65, submitted_at: '2024-01-20T10:00:00Z' }
      ];

      const patterns = service.identifyConcerningPatterns(68, 60, 40, submissions);

      expect(patterns).toContain('Low academic performance');
      expect(patterns).toContain('Poor assignment completion');
      expect(patterns).toContain('Low engagement');
      expect(patterns).toContain('Declining grade trend');
    });

    test('should calculate trend correctly', async () => {
      const decreasingGrades = [85, 80, 75, 70, 65];
      const increasingGrades = [65, 70, 75, 80, 85];
      const stableGrades = [75, 76, 74, 75, 76];

      const decreasingTrend = service.calculateTrend(decreasingGrades);
      const increasingTrend = service.calculateTrend(increasingGrades);
      const stableTrend = service.calculateTrend(stableGrades);

      expect(decreasingTrend).toBeLessThan(0);
      expect(increasingTrend).toBeGreaterThan(0);
      expect(Math.abs(stableTrend)).toBeLessThan(2);
    });

    test('should generate appropriate intervention suggestions', async () => {
      const studentData = {
        studentId: 'student1',
        studentName: 'John Doe',
        overallGrade: 45,
        completionRate: 30,
        engagementScore: 25,
        riskLevel: 'high',
        lastActivity: new Date(),
        concerningPatterns: ['Low academic performance', 'Poor assignment completion', 'Low engagement']
      };

      const suggestions = service.generateInterventionSuggestions(studentData);

      expect(suggestions).toContain('Schedule one-on-one meeting to discuss assignment completion strategies');
      expect(suggestions).toContain('Offer tutoring or additional academic support');
      expect(suggestions).toContain('Increase engagement through interactive activities');
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple departments in batches', async () => {
      const departmentIds = ['dept1', 'dept2', 'dept3', 'dept4', 'dept5', 'dept6'];
      
      jest.spyOn(service, 'collectDepartmentMetrics').mockResolvedValue();

      await service.batchProcessDepartmentAnalytics(departmentIds);

      expect(service.collectDepartmentMetrics).toHaveBeenCalledTimes(6);
      departmentIds.forEach(id => {
        expect(service.collectDepartmentMetrics).toHaveBeenCalledWith(id);
      });
    });

    test('should handle batch processing errors gracefully', async () => {
      const departmentIds = ['dept1', 'dept2'];
      
      jest.spyOn(service, 'collectDepartmentMetrics')
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(service.batchProcessDepartmentAnalytics(departmentIds))
        .rejects.toThrow('Failed to batch process department analytics');
    });
  });

  describe('Performance Index Calculation', () => {
    test('should calculate performance index with proper weighting', async () => {
      const highPerformanceMetrics = {
        studentCount: 50,
        teacherCount: 5,
        classCount: 10,
        assignmentCount: 25,
        completionRate: 95,
        performanceAverage: 90,
        atRiskStudents: 2,
        engagementScore: 85,
        retentionRate: 95,
        averageGradeImprovement: 5,
        assignmentSubmissionRate: 90,
        activeStudentsLast30Days: 48
      };

      const lowPerformanceMetrics = {
        studentCount: 50,
        teacherCount: 5,
        classCount: 10,
        assignmentCount: 25,
        completionRate: 60,
        performanceAverage: 65,
        atRiskStudents: 15,
        engagementScore: 45,
        retentionRate: 70,
        averageGradeImprovement: -2,
        assignmentSubmissionRate: 55,
        activeStudentsLast30Days: 30
      };

      const highIndex = service.calculatePerformanceIndex(highPerformanceMetrics);
      const lowIndex = service.calculatePerformanceIndex(lowPerformanceMetrics);

      expect(highIndex).toBeGreaterThan(lowIndex);
      expect(highIndex).toBeGreaterThan(80);
      expect(lowIndex).toBeLessThan(70);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty enrollment data gracefully', async () => {
      const departmentId = 'test-department-id';
      
      mockSupabase.select.mockResolvedValue({ data: [], error: null });

      const result = await service.trackStudentPerformance(departmentId);

      expect(result).toEqual([]);
    });

    test('should handle database errors in metric calculation', async () => {
      const departmentId = 'test-department-id';
      
      mockSupabase.select.mockResolvedValue({ data: null, error: new Error('Database error') });

      const engagementScore = await service.getEngagementScore(departmentId);
      
      expect(engagementScore).toBe(65); // Should return default value
    });

    test('should validate metric ranges', async () => {
      const metrics = {
        studentCount: 50,
        teacherCount: 5,
        classCount: 10,
        assignmentCount: 25,
        completionRate: 150, // Invalid - over 100%
        performanceAverage: -10, // Invalid - negative
        atRiskStudents: 7,
        engagementScore: 85,
        retentionRate: 95,
        averageGradeImprovement: 5,
        assignmentSubmissionRate: 90,
        activeStudentsLast30Days: 48
      };

      // The service should handle invalid values gracefully
      const privacyApplied = service.applyPrivacyToMetrics(metrics, 'basic');
      
      expect(privacyApplied.completionRate).toBe(150); // Should pass through for basic privacy
      expect(privacyApplied.performanceAverage).toBe(-10);
    });
  });

  describe('Data Validation and Integrity', () => {
    test('should ensure consistent data types in reports', async () => {
      const departmentId = 'test-department-id';
      
      // Mock all required methods with valid data
      jest.spyOn(service, 'getDepartmentMetrics').mockResolvedValue({
        studentCount: 50,
        teacherCount: 5,
        classCount: 10,
        assignmentCount: 25,
        completionRate: 78.5,
        performanceAverage: 82.3,
        atRiskStudents: 7,
        engagementScore: 65.2,
        retentionRate: 88.7,
        averageGradeImprovement: 3.2,
        assignmentSubmissionRate: 76.8,
        activeStudentsLast30Days: 42
      });
      jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue([]);
      jest.spyOn(service, 'generateAtRiskAlerts').mockResolvedValue([]);
      jest.spyOn(service, 'getAdvancedTrendAnalysis').mockResolvedValue({
        trends: [],
        insights: {
          overallTrend: 'stable',
          volatility: 2.5,
          seasonalPatterns: [],
          predictions: { nextPeriodPerformance: 82, confidence: 75 }
        }
      });

      const result = await service.generateDepartmentReport(departmentId);

      // Verify data types
      expect(typeof result.departmentId).toBe('string');
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(typeof result.metrics.studentCount).toBe('number');
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(typeof result.alertSummary.totalAlerts).toBe('number');
    });
  });
});