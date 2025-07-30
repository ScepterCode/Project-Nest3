import { EnrollmentReportingService } from '@/lib/services/enrollment-reporting';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase)
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('EnrollmentReportingService', () => {
  let service: EnrollmentReportingService;
  const mockInstitutionId = 'test-institution-id';
  const mockParameters = {
    institutionId: mockInstitutionId,
    timeframe: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31')
    },
    includeWaitlist: true,
    includeDropouts: true,
    format: 'json' as const
  };

  beforeEach(() => {
    service = new EnrollmentReportingService();
    jest.clearAllMocks();
  });

  describe('generateEnrollmentSummary', () => {
    it('should generate comprehensive enrollment summary', async () => {
      // Mock institution data
      mockSupabase.select.mockResolvedValueOnce({
        data: { name: 'Test University' },
        error: null
      });

      // Mock enrollment data
      const mockEnrollmentData = [
        {
          id: '1',
          status: 'enrolled',
          enrolled_at: new Date(),
          class: {
            id: 'class1',
            name: 'CS101',
            capacity: 30,
            current_enrollment: 25,
            instructor: { email: 'prof@test.com' },
            department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
          }
        },
        {
          id: '2',
          status: 'dropped',
          enrolled_at: new Date(),
          class: {
            id: 'class1',
            name: 'CS101',
            capacity: 30,
            current_enrollment: 25,
            instructor: { email: 'prof@test.com' },
            department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
          }
        }
      ];

      mockSupabase.select.mockResolvedValueOnce({
        data: mockEnrollmentData,
        error: null
      });

      // Mock waitlist data
      const mockWaitlistData = [
        {
          id: '1',
          class: {
            id: 'class1',
            department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
          }
        }
      ];

      mockSupabase.select.mockResolvedValueOnce({
        data: mockWaitlistData,
        error: null
      });

      const report = await service.generateEnrollmentSummary(mockParameters);

      expect(report.institutionName).toBe('Test University');
      expect(report.summary.totalEnrollments).toBe(1); // Only enrolled status
      expect(report.summary.totalCapacity).toBe(60); // 30 + 30 from both enrollment records
      expect(report.summary.totalWaitlisted).toBe(1);
      expect(report.summary.totalDropouts).toBe(1);
      expect(report.departmentBreakdown).toHaveLength(1);
      expect(report.departmentBreakdown[0].departmentName).toBe('Computer Science');
      expect(report.classBreakdown).toHaveLength(1);
      expect(report.classBreakdown[0].className).toBe('CS101');
    });

    it('should handle empty enrollment data', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: { name: 'Test University' }, error: null })
        .mockResolvedValueOnce({ data: [], error: null }) // enrollments
        .mockResolvedValueOnce({ data: [], error: null }); // waitlist

      const report = await service.generateEnrollmentSummary(mockParameters);

      expect(report.summary.totalEnrollments).toBe(0);
      expect(report.summary.totalCapacity).toBe(0);
      expect(report.summary.utilizationRate).toBe(0);
      expect(report.departmentBreakdown).toEqual([]);
      expect(report.classBreakdown).toEqual([]);
    });

    it('should calculate utilization rates correctly', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: { name: 'Test University' }, error: null })
        .mockResolvedValueOnce({
          data: [
            {
              id: '1',
              status: 'enrolled',
              class: {
                id: 'class1',
                name: 'CS101',
                capacity: 40,
                current_enrollment: 30,
                instructor: { email: 'prof@test.com' },
                department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
              }
            }
          ],
          error: null
        })
        .mockResolvedValueOnce({ data: [], error: null }); // waitlist

      const report = await service.generateEnrollmentSummary(mockParameters);

      expect(report.summary.utilizationRate).toBe(2.5); // 1 enrollment / 40 capacity * 100
      expect(report.classBreakdown[0].utilization).toBe(2.5);
    });
  });

  describe('generateCapacityAnalysis', () => {
    it('should identify underutilized and overcapacity classes', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: { name: 'Test University' }, error: null })
        .mockResolvedValueOnce({
          data: [
            {
              id: 'class1',
              name: 'Underutilized Class',
              capacity: 50,
              current_enrollment: 20, // 40% utilization
              department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
            },
            {
              id: 'class2',
              name: 'Overcapacity Class',
              capacity: 30,
              current_enrollment: 35, // Over capacity
              department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
            },
            {
              id: 'class3',
              name: 'Normal Class',
              capacity: 25,
              current_enrollment: 20, // 80% utilization
              department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
            }
          ],
          error: null
        });

      const report = await service.generateCapacityAnalysis(mockParameters);

      expect(report.overallUtilization).toBe(71.43); // 75/105 * 100
      expect(report.underutilizedClasses).toHaveLength(1);
      expect(report.underutilizedClasses[0].className).toBe('Underutilized Class');
      expect(report.overcapacityClasses).toHaveLength(1);
      expect(report.overcapacityClasses[0].className).toBe('Overcapacity Class');
      expect(report.overcapacityClasses[0].overCapacityBy).toBe(5);
    });

    it('should generate capacity recommendations', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: { name: 'Test University' }, error: null })
        .mockResolvedValueOnce({
          data: [
            {
              id: 'class1',
              name: 'High Utilization Class',
              capacity: 30,
              current_enrollment: 28, // 93% utilization
              department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
            },
            {
              id: 'class2',
              name: 'Low Utilization Class',
              capacity: 40,
              current_enrollment: 15, // 37.5% utilization
              department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
            }
          ],
          error: null
        });

      const report = await service.generateCapacityAnalysis(mockParameters);

      expect(report.capacityRecommendations).toHaveLength(1);
      const recommendation = report.capacityRecommendations[0];
      expect(recommendation.department).toBe('Computer Science');
      expect(recommendation.currentCapacity).toBe(70); // 30 + 40
      
      // Should recommend increase due to high overall utilization (61.4%)
      expect(recommendation.recommendedCapacity).toBeGreaterThan(70);
      expect(recommendation.reasoning).toContain('Low utilization suggests capacity reduction');
    });
  });

  describe('generateWaitlistReport', () => {
    it('should analyze waitlist statistics by department and class', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: { name: 'Test University' }, error: null })
        .mockResolvedValueOnce({
          data: [
            {
              id: '1',
              position: 1,
              added_at: new Date(),
              class: {
                id: 'class1',
                name: 'Popular Class',
                capacity: 30,
                current_enrollment: 30,
                department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
              }
            },
            {
              id: '2',
              position: 3,
              added_at: new Date(),
              class: {
                id: 'class1',
                name: 'Popular Class',
                capacity: 30,
                current_enrollment: 30,
                department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
              }
            },
            {
              id: '3',
              position: 2,
              added_at: new Date(),
              class: {
                id: 'class2',
                name: 'Another Class',
                capacity: 25,
                current_enrollment: 25,
                department: { id: 'dept2', name: 'Mathematics', institution_id: mockInstitutionId }
              }
            }
          ],
          error: null
        });

      const report = await service.generateWaitlistReport(mockParameters);

      expect(report.totalWaitlisted).toBe(3);
      expect(report.waitlistByDepartment).toHaveLength(2);
      
      const csDept = report.waitlistByDepartment.find(d => d.departmentName === 'Computer Science');
      expect(csDept?.totalWaitlisted).toBe(2);
      expect(csDept?.averagePosition).toBe(2); // (1 + 3) / 2

      const mathDept = report.waitlistByDepartment.find(d => d.departmentName === 'Mathematics');
      expect(mathDept?.totalWaitlisted).toBe(1);
      expect(mathDept?.averagePosition).toBe(2);

      expect(report.waitlistByClass).toHaveLength(2);
      const popularClass = report.waitlistByClass.find(c => c.className === 'Popular Class');
      expect(popularClass?.waitlisted).toBe(2);
      expect(popularClass?.averageWaitPosition).toBe(2);
    });

    it('should calculate promotion chances correctly', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: { name: 'Test University' }, error: null })
        .mockResolvedValueOnce({
          data: [
            {
              id: '1',
              position: 1,
              added_at: new Date(),
              class: {
                id: 'class1',
                name: 'Full Class',
                capacity: 30,
                current_enrollment: 30, // No available spots
                department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
              }
            },
            {
              id: '2',
              position: 1,
              added_at: new Date(),
              class: {
                id: 'class2',
                name: 'Class with Space',
                capacity: 30,
                current_enrollment: 25, // 5 available spots
                department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
              }
            }
          ],
          error: null
        });

      const report = await service.generateWaitlistReport(mockParameters);

      const fullClass = report.waitlistByClass.find(c => c.className === 'Full Class');
      const classWithSpace = report.waitlistByClass.find(c => c.className === 'Class with Space');

      expect(fullClass?.estimatedPromotionChance).toBe(0); // No available spots
      expect(classWithSpace?.estimatedPromotionChance).toBe(500); // 5 spots / 1 waitlisted * 100, capped at 100
    });
  });

  describe('generateTrendAnalysis', () => {
    it('should provide trend analysis with predictions', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: { name: 'Test University' },
        error: null
      });

      const report = await service.generateTrendAnalysis(mockParameters);

      expect(report.institutionName).toBe('Test University');
      expect(report.enrollmentTrends).toHaveLength(3);
      expect(report.departmentTrends).toHaveLength(1);
      expect(report.seasonalPatterns).toHaveLength(2);
      expect(report.predictions.nextTerm.predictedEnrollments).toBe(15800);
      expect(report.predictions.nextTerm.confidenceLevel).toBe(85);
      expect(report.predictions.departmentPredictions).toHaveLength(1);
    });

    it('should format report period correctly', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: { name: 'Test University' },
        error: null
      });

      const report = await service.generateTrendAnalysis(mockParameters);

      expect(report.reportPeriod).toBe('1/1/2024 - 12/31/2024');
    });
  });

  describe('exportReport', () => {
    it('should export report as JSON by default', async () => {
      const mockReport = { test: 'data', number: 123 };
      
      const result = await service.exportReport(mockReport);
      
      expect(result).toBe(JSON.stringify(mockReport, null, 2));
    });

    it('should handle different export formats', async () => {
      const mockReport = { test: 'data' };
      
      const jsonResult = await service.exportReport(mockReport, 'json');
      const csvResult = await service.exportReport(mockReport, 'csv');
      const pdfResult = await service.exportReport(mockReport, 'pdf');
      
      expect(jsonResult).toBe(JSON.stringify(mockReport, null, 2));
      expect(csvResult).toBe('CSV export not implemented yet');
      expect(pdfResult).toBe('PDF export not implemented yet');
    });
  });

  describe('scheduleReport', () => {
    it('should create scheduled report', async () => {
      const schedule = {
        frequency: 'weekly' as const,
        recipients: ['admin@test.com', 'manager@test.com'],
        format: 'pdf' as const
      };

      const scheduleId = await service.scheduleReport('enrollment_summary', mockParameters, schedule);

      expect(scheduleId).toMatch(/^schedule-\d+$/);
    });
  });

  describe('error handling', () => {
    it('should handle database errors in enrollment summary', async () => {
      mockSupabase.select.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(service.generateEnrollmentSummary(mockParameters))
        .rejects.toThrow();
    });

    it('should handle missing institution data', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: null, error: null }) // institution not found
        .mockResolvedValueOnce({ data: [], error: null }) // enrollments
        .mockResolvedValueOnce({ data: [], error: null }); // waitlist

      const report = await service.generateEnrollmentSummary(mockParameters);

      expect(report.institutionName).toBe('Unknown Institution');
    });
  });

  describe('data aggregation accuracy', () => {
    it('should correctly aggregate complex enrollment data', async () => {
      const mockComplexEnrollmentData = [
        // Multiple enrollments in same class
        {
          id: '1',
          status: 'enrolled',
          class: {
            id: 'class1',
            name: 'CS101',
            capacity: 30,
            current_enrollment: 25,
            instructor: { email: 'prof1@test.com' },
            department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
          }
        },
        {
          id: '2',
          status: 'enrolled',
          class: {
            id: 'class1',
            name: 'CS101',
            capacity: 30,
            current_enrollment: 25,
            instructor: { email: 'prof1@test.com' },
            department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
          }
        },
        // Different class, same department
        {
          id: '3',
          status: 'enrolled',
          class: {
            id: 'class2',
            name: 'CS102',
            capacity: 25,
            current_enrollment: 20,
            instructor: { email: 'prof2@test.com' },
            department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
          }
        },
        // Different department
        {
          id: '4',
          status: 'dropped',
          class: {
            id: 'class3',
            name: 'MATH101',
            capacity: 35,
            current_enrollment: 30,
            instructor: { email: 'prof3@test.com' },
            department: { id: 'dept2', name: 'Mathematics', institution_id: mockInstitutionId }
          }
        }
      ];

      mockSupabase.select
        .mockResolvedValueOnce({ data: { name: 'Test University' }, error: null })
        .mockResolvedValueOnce({ data: mockComplexEnrollmentData, error: null })
        .mockResolvedValueOnce({ data: [], error: null }); // waitlist

      const report = await service.generateEnrollmentSummary(mockParameters);

      expect(report.summary.totalEnrollments).toBe(3); // Only enrolled status
      expect(report.summary.totalDropouts).toBe(1);
      expect(report.summary.totalCapacity).toBe(120); // 30+30+25+35

      expect(report.departmentBreakdown).toHaveLength(2);
      
      const csDept = report.departmentBreakdown.find(d => d.departmentName === 'Computer Science');
      expect(csDept?.enrollments).toBe(2);
      expect(csDept?.capacity).toBe(55); // 30+25
      expect(csDept?.dropouts).toBe(0);

      const mathDept = report.departmentBreakdown.find(d => d.departmentName === 'Mathematics');
      expect(mathDept?.enrollments).toBe(0);
      expect(mathDept?.capacity).toBe(35);
      expect(mathDept?.dropouts).toBe(1);

      expect(report.classBreakdown).toHaveLength(3);
    });
  });
});