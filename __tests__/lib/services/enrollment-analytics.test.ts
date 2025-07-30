import { EnrollmentAnalyticsService } from '@/lib/services/enrollment-analytics';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  gt: jest.fn(() => mockSupabase),
  gte: jest.fn(() => mockSupabase),
  order: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  insert: jest.fn(() => mockSupabase),
  update: jest.fn(() => mockSupabase)
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('EnrollmentAnalyticsService', () => {
  let service: EnrollmentAnalyticsService;
  const mockInstitutionId = 'test-institution-id';

  beforeEach(() => {
    service = new EnrollmentAnalyticsService();
    jest.clearAllMocks();
  });

  describe('getInstitutionAnalytics', () => {
    it('should return comprehensive analytics data', async () => {
      // Mock enrollment data
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          { id: '1', class: { department: { institution_id: mockInstitutionId } } },
          { id: '2', class: { department: { institution_id: mockInstitutionId } } }
        ],
        error: null
      });

      // Mock capacity data
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          {
            id: 'class1',
            name: 'Test Class 1',
            capacity: 30,
            current_enrollment: 25,
            department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId },
            waitlist_entries: [{ id: '1' }, { id: '2' }]
          }
        ],
        error: null
      });

      // Mock waitlist data
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          {
            id: '1',
            position: 1,
            added_at: new Date(),
            class: {
              department: { id: 'dept1', name: 'Computer Science', institution_id: mockInstitutionId }
            }
          }
        ],
        error: null
      });

      // Mock department data
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          {
            id: 'dept1',
            name: 'Computer Science',
            classes: [
              {
                id: 'class1',
                capacity: 30,
                current_enrollment: 25,
                waitlist_entries: [{ id: '1' }]
              }
            ]
          }
        ],
        error: null
      });

      // Mock overcapacity classes for conflicts
      mockSupabase.select.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const result = await service.getInstitutionAnalytics(mockInstitutionId);

      expect(result).toBeDefined();
      expect(result.totalEnrollments).toBe(2);
      expect(result.totalCapacity).toBe(30);
      expect(result.utilizationRate).toBeCloseTo(6.67, 1); // 2/30 * 100
      expect(result.departmentStats).toHaveLength(1);
      expect(result.departmentStats[0].departmentName).toBe('Computer Science');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.select.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.getInstitutionAnalytics(mockInstitutionId))
        .rejects.toThrow('Failed to fetch enrollment analytics');
    });

    it('should calculate utilization rate correctly', async () => {
      // Mock data with specific enrollment and capacity numbers
      mockSupabase.select
        .mockResolvedValueOnce({ data: Array(150).fill({ id: '1' }), error: null }) // 150 enrollments
        .mockResolvedValueOnce({
          data: [
            { id: 'class1', capacity: 200, current_enrollment: 150, department: { name: 'Test' }, waitlist_entries: [] }
          ],
          error: null
        })
        .mockResolvedValueOnce({ data: [], error: null }) // waitlist
        .mockResolvedValueOnce({ data: [], error: null }) // departments
        .mockResolvedValueOnce({ data: [], error: null }); // conflicts

      const result = await service.getInstitutionAnalytics(mockInstitutionId);

      expect(result.utilizationRate).toBe(75); // 150/200 * 100
    });
  });

  describe('getInstitutionPolicies', () => {
    it('should return formatted policies', async () => {
      const mockPolicyData = [
        {
          id: 'policy1',
          institution_id: mockInstitutionId,
          name: 'Test Policy',
          type: 'enrollment_deadline',
          description: 'Test description',
          value: '2 weeks',
          scope: 'institution',
          is_active: true,
          updated_at: new Date().toISOString(),
          modified_by: 'admin@test.com'
        }
      ];

      mockSupabase.select.mockResolvedValueOnce({
        data: mockPolicyData,
        error: null
      });

      const result = await service.getInstitutionPolicies(mockInstitutionId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Policy');
      expect(result[0].type).toBe('enrollment_deadline');
      expect(result[0].isActive).toBe(true);
    });

    it('should handle empty policy results', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const result = await service.getInstitutionPolicies(mockInstitutionId);

      expect(result).toEqual([]);
    });
  });

  describe('updateInstitutionPolicy', () => {
    it('should update policy successfully', async () => {
      mockSupabase.update.mockResolvedValueOnce({
        error: null
      });

      const updates = { isActive: false, value: 'new value' };
      
      await expect(service.updateInstitutionPolicy('policy1', updates, 'admin@test.com'))
        .resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          value: 'new value',
          modified_by: 'admin@test.com'
        })
      );
    });

    it('should handle update errors', async () => {
      mockSupabase.update.mockResolvedValueOnce({
        error: new Error('Update failed')
      });

      await expect(service.updateInstitutionPolicy('policy1', {}, 'admin@test.com'))
        .rejects.toThrow();
    });
  });

  describe('waitlist statistics calculation', () => {
    it('should calculate department breakdown correctly', async () => {
      const mockWaitlistData = [
        {
          id: '1',
          position: 1,
          class: { department: { id: 'dept1', name: 'Computer Science' } }
        },
        {
          id: '2',
          position: 3,
          class: { department: { id: 'dept1', name: 'Computer Science' } }
        },
        {
          id: '3',
          position: 2,
          class: { department: { id: 'dept2', name: 'Mathematics' } }
        }
      ];

      // Mock the private method by testing through getInstitutionAnalytics
      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null }) // enrollments
        .mockResolvedValueOnce({ data: [], error: null }) // capacity
        .mockResolvedValueOnce({ data: mockWaitlistData, error: null }) // waitlist
        .mockResolvedValueOnce({ data: [], error: null }) // departments
        .mockResolvedValueOnce({ data: [], error: null }); // conflicts

      const result = await service.getInstitutionAnalytics(mockInstitutionId);

      expect(result.waitlistStatistics.departmentBreakdown).toHaveLength(2);
      
      const csDept = result.waitlistStatistics.departmentBreakdown.find(d => d.departmentName === 'Computer Science');
      expect(csDept?.waitlisted).toBe(2);
      expect(csDept?.averagePosition).toBe(2); // (1 + 3) / 2

      const mathDept = result.waitlistStatistics.departmentBreakdown.find(d => d.departmentName === 'Mathematics');
      expect(mathDept?.waitlisted).toBe(1);
      expect(mathDept?.averagePosition).toBe(2);
    });
  });

  describe('capacity utilization analysis', () => {
    it('should identify overcapacity classes', async () => {
      const mockClassData = [
        {
          id: 'class1',
          name: 'Overcapacity Class',
          capacity: 20,
          current_enrollment: 25,
          department: { name: 'Test Dept' },
          waitlist_entries: []
        },
        {
          id: 'class2',
          name: 'Normal Class',
          capacity: 30,
          current_enrollment: 20,
          department: { name: 'Test Dept' },
          waitlist_entries: []
        }
      ];

      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null }) // enrollments
        .mockResolvedValueOnce({ data: mockClassData, error: null }) // capacity
        .mockResolvedValueOnce({ data: [], error: null }) // waitlist
        .mockResolvedValueOnce({ data: [], error: null }) // departments
        .mockResolvedValueOnce({ data: [], error: null }); // conflicts

      const result = await service.getInstitutionAnalytics(mockInstitutionId);

      const overcapacityClass = result.capacityUtilization.find(c => c.isOvercapacity);
      expect(overcapacityClass).toBeDefined();
      expect(overcapacityClass?.className).toBe('Overcapacity Class');
      expect(overcapacityClass?.utilizationRate).toBe(125); // 25/20 * 100
    });
  });

  describe('error handling', () => {
    it('should handle null data gracefully', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const result = await service.getInstitutionAnalytics(mockInstitutionId);

      expect(result.totalEnrollments).toBe(0);
      expect(result.totalCapacity).toBe(0);
      expect(result.utilizationRate).toBe(0);
      expect(result.departmentStats).toEqual([]);
    });

    it('should handle partial data errors', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({ data: [{ id: '1' }], error: null }) // enrollments succeed
        .mockRejectedValueOnce(new Error('Capacity query failed')); // capacity fails

      await expect(service.getInstitutionAnalytics(mockInstitutionId))
        .rejects.toThrow('Failed to fetch enrollment analytics');
    });
  });

  describe('data aggregation accuracy', () => {
    it('should aggregate department statistics correctly', async () => {
      const mockDepartmentData = [
        {
          id: 'dept1',
          name: 'Computer Science',
          classes: [
            { id: 'class1', capacity: 30, current_enrollment: 25, waitlist_entries: [{ id: '1' }] },
            { id: 'class2', capacity: 25, current_enrollment: 20, waitlist_entries: [] }
          ]
        }
      ];

      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null }) // enrollments
        .mockResolvedValueOnce({ data: [], error: null }) // capacity
        .mockResolvedValueOnce({ data: [], error: null }) // waitlist
        .mockResolvedValueOnce({ data: mockDepartmentData, error: null }) // departments
        .mockResolvedValueOnce({ data: [], error: null }); // conflicts

      const result = await service.getInstitutionAnalytics(mockInstitutionId);

      expect(result.departmentStats).toHaveLength(1);
      const dept = result.departmentStats[0];
      
      expect(dept.departmentName).toBe('Computer Science');
      expect(dept.capacity).toBe(55); // 30 + 25
      expect(dept.enrollments).toBe(45); // 25 + 20
      expect(dept.waitlisted).toBe(1);
      expect(dept.totalClasses).toBe(2);
      expect(dept.averageClassSize).toBe(22.5); // 45 / 2
      expect(dept.utilization).toBeCloseTo(81.82, 1); // 45/55 * 100
    });
  });
});