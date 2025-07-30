import { DepartmentAnalyticsService } from '@/lib/services/department-analytics';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('DepartmentAnalyticsService', () => {
  let service: DepartmentAnalyticsService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis()
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new DepartmentAnalyticsService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('collectDepartmentMetrics', () => {
    it('should collect and store department metrics', async () => {
      const departmentId = 'test-department-id';
      
      // Mock the metric calculation methods
      jest.spyOn(service as any, 'calculateDepartmentMetrics').mockResolvedValue({
        studentCount: 50,
        teacherCount: 5,
        classCount: 10,
        assignmentCount: 25,
        completionRate: 78.5,
        performanceAverage: 82.3,
        atRiskStudents: 7
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
          })
        ])
      );
    });

    it('should handle errors during metric collection', async () => {
      const departmentId = 'test-department-id';
      
      jest.spyOn(service as any, 'calculateDepartmentMetrics').mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.collectDepartmentMetrics(departmentId)).rejects.toThrow(
        'Failed to collect department metrics'
      );
    });
  });

  describe('getDepartmentMetrics', () => {
    it('should retrieve department metrics for a timeframe', async () => {
      const departmentId = 'test-department-id';
      const timeframe = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const mockAnalyticsData = [
        { metric_name: 'student_count', metric_value: 50, recorded_at: '2024-01-15' },
        { metric_name: 'teacher_count', metric_value: 5, recorded_at: '2024-01-15' },
        { metric_name: 'completion_rate', metric_value: 78.5, recorded_at: '2024-01-15' }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockAnalyticsData, error: null });

      const result = await service.getDepartmentMetrics(departmentId, timeframe);

      expect(result).toEqual({
        studentCount: 50,
        teacherCount: 5,
        classCount: 0,
        assignmentCount: 0,
        completionRate: 78.5,
        performanceAverage: 0,
        atRiskStudents: 0
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('department_analytics');
      expect(mockSupabase.eq).toHaveBeenCalledWith('department_id', departmentId);
      expect(mockSupabase.gte).toHaveBeenCalledWith('recorded_at', timeframe.start.toISOString());
      expect(mockSupabase.lte).toHaveBeenCalledWith('recorded_at', timeframe.end.toISOString());
    });
  });

  describe('trackStudentPerformance', () => {
    it('should track student performance and identify risk levels', async () => {
      const departmentId = 'test-department-id';
      
      const mockEnrollmentData = [
        {
          student_id: 'student1',
          student: { name: 'John Doe' },
          class: {
            id: 'class1',
            name: 'Math 101',
            assignments: [
              {
                id: 'assign1',
                submissions: [
                  { grade: 85, submitted_at: '2024-01-15T10:00:00Z' }
                ]
              },
              {
                id: 'assign2',
                submissions: [
                  { grade: 78, submitted_at: '2024-01-20T10:00:00Z' }
                ]
              }
            ]
          }
        },
        {
          student_id: 'student2',
          student: { name: 'Jane Smith' },
          class: {
            id: 'class1',
            name: 'Math 101',
            assignments: [
              {
                id: 'assign1',
                submissions: [
                  { grade: 45, submitted_at: '2024-01-15T10:00:00Z' }
                ]
              },
              {
                id: 'assign2',
                submissions: [] // No submission
              }
            ]
          }
        }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockEnrollmentData, error: null });

      const result = await service.trackStudentPerformance(departmentId);

      expect(result).toHaveLength(2);
      
      // Check first student (good performance)
      const student1 = result.find(s => s.studentId === 'student1');
      expect(student1?.overallGrade).toBe(81.5); // Average of 85 and 78
      expect(student1?.completionRate).toBe(100); // Completed both assignments
      expect(student1?.riskLevel).toBe('low');

      // Check second student (poor performance)
      const student2 = result.find(s => s.studentId === 'student2');
      expect(student2?.overallGrade).toBe(45);
      expect(student2?.completionRate).toBe(50); // Completed 1 of 2 assignments
      expect(student2?.riskLevel).toBe('high');
      expect(student2?.concerningPatterns).toContain('Low academic performance');
      expect(student2?.concerningPatterns).toContain('Poor assignment completion');
    });

    it('should handle students with no submissions', async () => {
      const departmentId = 'test-department-id';
      
      const mockEnrollmentData = [
        {
          student_id: 'student1',
          student: { name: 'John Doe' },
          class: {
            id: 'class1',
            name: 'Math 101',
            assignments: [
              {
                id: 'assign1',
                submissions: [] // No submissions
              }
            ]
          }
        }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockEnrollmentData, error: null });

      const result = await service.trackStudentPerformance(departmentId);

      expect(result).toHaveLength(1);
      expect(result[0].overallGrade).toBe(0);
      expect(result[0].completionRate).toBe(0);
      expect(result[0].riskLevel).toBe('high');
    });
  });

  describe('generateAtRiskAlerts', () => {
    it('should generate alerts for at-risk students', async () => {
      const departmentId = 'test-department-id';
      
      const mockStudentPerformance = [
        {
          studentId: 'student1',
          studentName: 'John Doe',
          overallGrade: 45,
          completionRate: 30,
          engagementScore: 25,
          riskLevel: 'high' as const,
          lastActivity: new Date(),
          concerningPatterns: ['Low academic performance', 'Poor assignment completion', 'Low engagement']
        },
        {
          studentId: 'student2',
          studentName: 'Jane Smith',
          overallGrade: 68,
          completionRate: 65,
          engagementScore: 55,
          riskLevel: 'medium' as const,
          lastActivity: new Date(),
          concerningPatterns: ['Declining grade trend']
        }
      ];

      jest.spyOn(service, 'trackStudentPerformance').mockResolvedValue(mockStudentPerformance);

      const result = await service.generateAtRiskAlerts(departmentId);

      expect(result).toHaveLength(2);
      
      const highRiskAlert = result.find(alert => alert.severity === 'high');
      expect(highRiskAlert?.studentId).toBe('student1');
      expect(highRiskAlert?.riskFactors).toContain('Low academic performance');
      expect(highRiskAlert?.interventionSuggestions.length).toBeGreaterThan(0);

      const mediumRiskAlert = result.find(alert => alert.severity === 'medium');
      expect(mediumRiskAlert?.studentId).toBe('student2');
      expect(mediumRiskAlert?.riskFactors).toContain('Declining grade trend');
    });

    it('should generate appropriate intervention suggestions', async () => {
      const studentData = {
        studentId: 'student1',
        studentName: 'John Doe',
        overallGrade: 45,
        completionRate: 30,
        engagementScore: 25,
        riskLevel: 'high' as const,
        lastActivity: new Date(),
        concerningPatterns: ['Low academic performance', 'Poor assignment completion', 'Low engagement']
      };

      const suggestions = (service as any).generateInterventionSuggestions(studentData);

      expect(suggestions).toContain('Schedule one-on-one meeting to discuss assignment completion strategies');
      expect(suggestions).toContain('Offer tutoring or additional academic support');
      expect(suggestions).toContain('Increase engagement through interactive activities');
    });
  });

  describe('getDepartmentTrends', () => {
    it('should return historical trends for department performance', async () => {
      const departmentId = 'test-department-id';
      const periods = 3;

      // Mock getDepartmentMetrics for different time periods
      jest.spyOn(service, 'getDepartmentMetrics')
          .mockResolvedValueOnce({
            studentCount: 45, teacherCount: 5, classCount: 9, assignmentCount: 20,
            completionRate: 75, performanceAverage: 80, atRiskStudents: 6
          })
          .mockResolvedValueOnce({
            studentCount: 48, teacherCount: 5, classCount: 10, assignmentCount: 22,
            completionRate: 78, performanceAverage: 82, atRiskStudents: 5
          })
          .mockResolvedValueOnce({
            studentCount: 50, teacherCount: 5, classCount: 10, assignmentCount: 25,
            completionRate: 80, performanceAverage: 85, atRiskStudents: 4
          });

      const result = await service.getDepartmentTrends(departmentId, periods);

      expect(result).toHaveLength(periods);
      expect(result[0].metrics.studentCount).toBe(45);
      expect(result[1].metrics.studentCount).toBe(48);
      expect(result[2].metrics.studentCount).toBe(50);
      expect(result[0].period).toMatch(/\w+ \d{4}/); // Should match "Month Year" format
    });
  });

  describe('compareDepartments', () => {
    it('should compare department performance within an institution', async () => {
      const institutionId = 'test-institution-id';
      
      const mockDepartments = [
        { id: 'dept1', name: 'Mathematics' },
        { id: 'dept2', name: 'Science' },
        { id: 'dept3', name: 'English' }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockDepartments, error: null });

      // Mock metrics for each department
      jest.spyOn(service, 'getDepartmentMetrics')
          .mockResolvedValueOnce({
            studentCount: 50, teacherCount: 5, classCount: 10, assignmentCount: 25,
            completionRate: 85, performanceAverage: 88, atRiskStudents: 3
          })
          .mockResolvedValueOnce({
            studentCount: 45, teacherCount: 4, classCount: 9, assignmentCount: 20,
            completionRate: 78, performanceAverage: 82, atRiskStudents: 5
          })
          .mockResolvedValueOnce({
            studentCount: 40, teacherCount: 4, classCount: 8, assignmentCount: 18,
            completionRate: 80, performanceAverage: 85, atRiskStudents: 4
          });

      const result = await service.compareDepartments(institutionId);

      expect(result).toHaveLength(3);
      
      // Results should be sorted by performance index (highest first)
      expect(result[0].institutionRanking).toBe(1);
      expect(result[1].institutionRanking).toBe(2);
      expect(result[2].institutionRanking).toBe(3);
      
      // Check that performance index is calculated
      expect(result[0].performanceIndex).toBeGreaterThan(0);
      expect(result[0].performanceIndex).toBeGreaterThan(result[1].performanceIndex);
    });
  });

  describe('generateDepartmentReport', () => {
    it('should generate a comprehensive department report', async () => {
      const departmentId = 'test-department-id';
      
      const mockMetrics = {
        studentCount: 50, teacherCount: 5, classCount: 10, assignmentCount: 25,
        completionRate: 78.5, performanceAverage: 82.3, atRiskStudents: 7
      };

      const mockTrends = [
        { period: 'Jan 2024', metrics: mockMetrics, growthRate: 5, performanceChange: 2 }
      ];

      const mockAlerts = [
        {
          id: 'alert1',
          studentId: 'student1',
          studentName: 'John Doe',
          departmentId,
          riskFactors: ['Low academic performance'],
          severity: 'high' as const,
          detectedAt: new Date(),
          lastUpdated: new Date(),
          interventionSuggestions: ['Offer tutoring'],
          resolved: false
        }
      ];

      jest.spyOn(service, 'getDepartmentMetrics').mockResolvedValue(mockMetrics);
      jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue(mockTrends);
      jest.spyOn(service, 'generateAtRiskAlerts').mockResolvedValue(mockAlerts);

      const result = await service.generateDepartmentReport(departmentId, false);

      expect(result.departmentId).toBe(departmentId);
      expect(result.metrics).toEqual(mockMetrics);
      expect(result.trends).toEqual(mockTrends);
      expect(result.alertSummary.totalAlerts).toBe(1);
      expect(result.alertSummary.highRiskStudents).toBe(1);
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.studentPerformance).toBeUndefined(); // Not included when includeStudentData is false
    });

    it('should include anonymized student data when requested', async () => {
      const departmentId = 'test-department-id';
      
      const mockStudentPerformance = [
        {
          studentId: 'student1',
          studentName: 'John Doe',
          overallGrade: 75,
          completionRate: 80,
          engagementScore: 70,
          riskLevel: 'medium' as const,
          lastActivity: new Date(),
          concerningPatterns: []
        }
      ];

      // Mock all required methods
      jest.spyOn(service, 'getDepartmentMetrics').mockResolvedValue({
        studentCount: 50, teacherCount: 5, classCount: 10, assignmentCount: 25,
        completionRate: 78.5, performanceAverage: 82.3, atRiskStudents: 7
      });
      jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue([]);
      jest.spyOn(service, 'generateAtRiskAlerts').mockResolvedValue([]);
      jest.spyOn(service, 'trackStudentPerformance').mockResolvedValue(mockStudentPerformance);

      const result = await service.generateDepartmentReport(departmentId, true);

      expect(result.studentPerformance).toBeDefined();
      expect(result.studentPerformance).toHaveLength(1);
      
      // Check that student data is anonymized
      const anonymizedStudent = result.studentPerformance[0];
      expect(anonymizedStudent.studentId).not.toBe('student1'); // Should be anonymized
      expect(anonymizedStudent.studentName).toBeUndefined(); // Should be removed
      expect(anonymizedStudent.overallGrade).toBe(75); // Metrics should remain
    });

    it('should generate appropriate recommendations based on metrics', async () => {
      const mockMetrics = {
        studentCount: 50, teacherCount: 5, classCount: 10, assignmentCount: 25,
        completionRate: 65, // Low completion rate
        performanceAverage: 70, // Low performance
        atRiskStudents: 15 // High number of at-risk students (30% of total)
      };

      const mockAlerts: any[] = [];
      for (let i = 0; i < 15; i++) {
        mockAlerts.push({
          id: `alert${i}`,
          studentId: `student${i}`,
          studentName: `Student ${i}`,
          departmentId: 'test-dept',
          riskFactors: [],
          severity: 'medium',
          detectedAt: new Date(),
          lastUpdated: new Date(),
          interventionSuggestions: [],
          resolved: false
        });
      }

      const recommendations = (service as any).generateDepartmentRecommendations(mockMetrics, mockAlerts);

      expect(recommendations).toContain('Consider implementing assignment completion tracking and reminders');
      expect(recommendations).toContain('Review curriculum difficulty and provide additional learning resources');
      expect(recommendations).toContain('Implement early intervention programs for at-risk students');
    });
  });

  describe('Enhanced Analytics Features', () => {
    describe('getAdvancedTrendAnalysis', () => {
      it('should provide advanced trend analysis with insights', async () => {
        const departmentId = 'test-department-id';
        
        const mockTrends = [
          { period: 'Jan 2024', metrics: { performanceAverage: 80 } as any, growthRate: 5, performanceChange: 2 },
          { period: 'Feb 2024', metrics: { performanceAverage: 82 } as any, growthRate: 3, performanceChange: 2 },
          { period: 'Mar 2024', metrics: { performanceAverage: 85 } as any, growthRate: 4, performanceChange: 3 },
          { period: 'Apr 2024', metrics: { performanceAverage: 83 } as any, growthRate: 2, performanceChange: -2 }
        ];

        jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue(mockTrends);

        const result = await service.getAdvancedTrendAnalysis(departmentId, 4);

        expect(result.trends).toEqual(mockTrends);
        expect(result.insights.overallTrend).toBe('improving'); // Average change > 1
        expect(result.insights.volatility).toBeGreaterThan(0);
        expect(result.insights.seasonalPatterns).toBeInstanceOf(Array);
        expect(result.insights.predictions.nextPeriodPerformance).toBeGreaterThan(0);
        expect(result.insights.predictions.confidence).toBeGreaterThanOrEqual(0);
        expect(result.insights.predictions.confidence).toBeLessThanOrEqual(100);
      });

      it('should identify declining trends correctly', async () => {
        const departmentId = 'test-department-id';
        
        const mockTrends = [
          { period: 'Jan 2024', metrics: { performanceAverage: 85 } as any, growthRate: 0, performanceChange: 0 },
          { period: 'Feb 2024', metrics: { performanceAverage: 82 } as any, growthRate: -2, performanceChange: -3 },
          { period: 'Mar 2024', metrics: { performanceAverage: 78 } as any, growthRate: -3, performanceChange: -4 },
          { period: 'Apr 2024', metrics: { performanceAverage: 75 } as any, growthRate: -4, performanceChange: -3 }
        ];

        jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue(mockTrends);

        const result = await service.getAdvancedTrendAnalysis(departmentId, 4);

        expect(result.insights.overallTrend).toBe('declining');
      });

      it('should identify stable trends correctly', async () => {
        const departmentId = 'test-department-id';
        
        const mockTrends = [
          { period: 'Jan 2024', metrics: { performanceAverage: 80 } as any, growthRate: 0, performanceChange: 0 },
          { period: 'Feb 2024', metrics: { performanceAverage: 80.5 } as any, growthRate: 1, performanceChange: 0.5 },
          { period: 'Mar 2024', metrics: { performanceAverage: 79.8 } as any, growthRate: -1, performanceChange: -0.7 },
          { period: 'Apr 2024', metrics: { performanceAverage: 80.2 } as any, growthRate: 0.5, performanceChange: 0.4 }
        ];

        jest.spyOn(service, 'getDepartmentTrends').mockResolvedValue(mockTrends);

        const result = await service.getAdvancedTrendAnalysis(departmentId, 4);

        expect(result.insights.overallTrend).toBe('stable');
      });
    });

    describe('Enhanced Metrics Calculation', () => {
      it('should calculate engagement score correctly', async () => {
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

        const engagementScore = await (service as any).getEngagementScore(departmentId);

        expect(typeof engagementScore).toBe('number');
        expect(engagementScore).toBeGreaterThanOrEqual(0);
        expect(engagementScore).toBeLessThanOrEqual(100);
      });

      it('should calculate retention rate correctly', async () => {
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

        const retentionRate = await (service as any).getRetentionRate(departmentId);

        expect(retentionRate).toBe(66.67); // 2 out of 3 students retained
      });

      it('should calculate grade improvement correctly', async () => {
        const departmentId = 'test-department-id';
        
        const mockEnrollmentData = [
          {
            student_id: 'student1',
            class: {
              assignments: [
                {
                  submissions: [
                    { grade: 70, submitted_at: '2024-01-10T10:00:00Z' },
                    { grade: 75, submitted_at: '2024-01-15T10:00:00Z' },
                    { grade: 80, submitted_at: '2024-01-20T10:00:00Z' },
                    { grade: 85, submitted_at: '2024-01-25T10:00:00Z' }
                  ]
                }
              ]
            }
          }
        ];

        mockSupabase.select.mockResolvedValue({ data: mockEnrollmentData, error: null });

        const improvement = await (service as any).getAverageGradeImprovement(departmentId);

        expect(improvement).toBeGreaterThan(0); // Should show improvement
      });

      it('should calculate assignment submission rate correctly', async () => {
        const departmentId = 'test-department-id';
        
        const mockAssignments = [
          { id: 'assign1', submissions: [{ id: 'sub1' }, { id: 'sub2' }] },
          { id: 'assign2', submissions: [{ id: 'sub3' }] },
          { id: 'assign3', submissions: [] }
        ];

        mockSupabase.select.mockResolvedValue({ data: mockAssignments, error: null });
        jest.spyOn(service as any, 'getStudentCount').mockResolvedValue(10);

        const submissionRate = await (service as any).getAssignmentSubmissionRate(departmentId);

        // 3 submissions out of 30 expected (3 assignments * 10 students) = 10%
        expect(submissionRate).toBe(10);
      });

      it('should calculate active students in last 30 days correctly', async () => {
        const departmentId = 'test-department-id';
        
        const mockActiveSubmissions = [
          { student_id: 'student1' },
          { student_id: 'student2' },
          { student_id: 'student1' }, // Duplicate should be counted once
          { student_id: 'student3' }
        ];

        mockSupabase.select.mockResolvedValue({ data: mockActiveSubmissions, error: null });

        const activeStudents = await (service as any).getActiveStudentsLast30Days(departmentId);

        expect(activeStudents).toBe(3); // Unique students
      });
    });

    describe('Privacy-Compliant Reporting', () => {
      it('should apply strict privacy protection', async () => {
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
            overallTrend: 'stable' as const,
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

      it('should apply enhanced privacy protection', async () => {
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
            overallTrend: 'stable' as const,
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

      it('should anonymize student data correctly', async () => {
        const studentData = [
          {
            studentId: 'real-student-id-123',
            studentName: 'John Doe',
            overallGrade: 78.5,
            completionRate: 85.2,
            engagementScore: 72.8,
            riskLevel: 'medium' as const,
            lastActivity: new Date('2024-01-15'),
            concerningPatterns: ['Declining grade trend']
          }
        ];

        const anonymizedBasic = (service as any).anonymizeStudentData(studentData, 'basic');
        const anonymizedStrict = (service as any).anonymizeStudentData(studentData, 'strict');

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

    describe('Batch Processing', () => {
      it('should process multiple departments in batches', async () => {
        const departmentIds = ['dept1', 'dept2', 'dept3', 'dept4', 'dept5', 'dept6'];
        
        jest.spyOn(service, 'collectDepartmentMetrics').mockResolvedValue();

        await service.batchProcessDepartmentAnalytics(departmentIds);

        expect(service.collectDepartmentMetrics).toHaveBeenCalledTimes(6);
        departmentIds.forEach(id => {
          expect(service.collectDepartmentMetrics).toHaveBeenCalledWith(id);
        });
      });

      it('should handle batch processing errors gracefully', async () => {
        const departmentIds = ['dept1', 'dept2'];
        
        jest.spyOn(service, 'collectDepartmentMetrics')
          .mockResolvedValueOnce()
          .mockRejectedValueOnce(new Error('Database error'));

        await expect(service.batchProcessDepartmentAnalytics(departmentIds))
          .rejects.toThrow('Failed to batch process department analytics');
      });
    });

    describe('Risk Assessment Enhancement', () => {
      it('should identify concerning patterns accurately', async () => {
        const submissions = [
          { grade: 85, submitted_at: '2024-01-01T10:00:00Z' },
          { grade: 80, submitted_at: '2024-01-05T10:00:00Z' },
          { grade: 75, submitted_at: '2024-01-10T10:00:00Z' },
          { grade: 70, submitted_at: '2024-01-15T10:00:00Z' },
          { grade: 65, submitted_at: '2024-01-20T10:00:00Z' }
        ];

        const patterns = (service as any).identifyConcerningPatterns(68, 60, 40, submissions);

        expect(patterns).toContain('Low academic performance');
        expect(patterns).toContain('Poor assignment completion');
        expect(patterns).toContain('Low engagement');
        expect(patterns).toContain('Declining grade trend');
      });

      it('should calculate trend correctly', async () => {
        const decreasingGrades = [85, 80, 75, 70, 65];
        const increasingGrades = [65, 70, 75, 80, 85];
        const stableGrades = [75, 76, 74, 75, 76];

        const decreasingTrend = (service as any).calculateTrend(decreasingGrades);
        const increasingTrend = (service as any).calculateTrend(increasingGrades);
        const stableTrend = (service as any).calculateTrend(stableGrades);

        expect(decreasingTrend).toBeLessThan(0);
        expect(increasingTrend).toBeGreaterThan(0);
        expect(Math.abs(stableTrend)).toBeLessThan(2);
      });
    });

    describe('Performance Index Calculation', () => {
      it('should calculate performance index with proper weighting', async () => {
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

        const highIndex = (service as any).calculatePerformanceIndex(highPerformanceMetrics);
        const lowIndex = (service as any).calculatePerformanceIndex(lowPerformanceMetrics);

        expect(highIndex).toBeGreaterThan(lowIndex);
        expect(highIndex).toBeGreaterThan(80);
        expect(lowIndex).toBeLessThan(70);
      });
    });

    describe('Error Handling and Edge Cases', () => {
      it('should handle empty enrollment data gracefully', async () => {
        const departmentId = 'test-department-id';
        
        mockSupabase.select.mockResolvedValue({ data: [], error: null });

        const result = await service.trackStudentPerformance(departmentId);

        expect(result).toEqual([]);
      });

      it('should handle database errors in metric calculation', async () => {
        const departmentId = 'test-department-id';
        
        mockSupabase.select.mockResolvedValue({ data: null, error: new Error('Database error') });

        const engagementScore = await (service as any).getEngagementScore(departmentId);
        
        expect(engagementScore).toBe(65); // Should return default value
      });

      it('should handle missing data in trend analysis', async () => {
        const departmentId = 'test-department-id';
        
        jest.spyOn(service, 'getDepartmentMetrics').mockResolvedValue({
          studentCount: 0,
          teacherCount: 0,
          classCount: 0,
          assignmentCount: 0,
          completionRate: 0,
          performanceAverage: 0,
          atRiskStudents: 0,
          engagementScore: 0,
          retentionRate: 0,
          averageGradeImprovement: 0,
          assignmentSubmissionRate: 0,
          activeStudentsLast30Days: 0
        });

        const result = await service.getAdvancedTrendAnalysis(departmentId, 3);

        expect(result.trends).toHaveLength(3);
        expect(result.insights.overallTrend).toBe('stable');
      });
    });

    describe('Data Validation and Integrity', () => {
      it('should validate metric ranges', async () => {
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
        const privacyApplied = (service as any).applyPrivacyToMetrics(metrics, 'basic');
        
        expect(privacyApplied.completionRate).toBe(150); // Should pass through for basic privacy
        expect(privacyApplied.performanceAverage).toBe(-10);
      });

      it('should ensure consistent data types in reports', async () => {
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
            overallTrend: 'stable' as const,
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
});