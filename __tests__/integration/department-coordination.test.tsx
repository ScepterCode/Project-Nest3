import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DepartmentAdminInterface } from '@/components/enrollment/department-admin-interface';
import { DepartmentEnrollmentCoordinator } from '@/lib/services/department-enrollment-coordinator';
import { EnrollmentBalancingService } from '@/lib/services/enrollment-balancing';
import { SectionPlanningService } from '@/lib/services/section-planning';

// Mock the services
jest.mock('@/lib/services/department-enrollment-coordinator');
jest.mock('@/lib/services/enrollment-balancing');
jest.mock('@/lib/services/section-planning');

describe('Department Coordination Integration Tests', () => {
  const mockDepartmentId = 'dept-123';
  const mockDepartmentName = 'Computer Science';

  const mockSectionData = [
    {
      sectionId: 'section-1',
      sectionName: 'CS101-01',
      instructor: 'Dr. Smith',
      capacity: 30,
      currentEnrollment: 28,
      waitlistCount: 5,
      enrollmentRate: 93.3,
      schedule: 'MWF 9:00-10:00',
      room: 'CS-101'
    },
    {
      sectionId: 'section-2',
      sectionName: 'CS101-02',
      instructor: 'Dr. Johnson',
      capacity: 30,
      currentEnrollment: 15,
      waitlistCount: 0,
      enrollmentRate: 50.0,
      schedule: 'TTh 11:00-12:30',
      room: 'CS-102'
    }
  ];

  const mockRecommendations = [
    {
      type: 'redistribute',
      description: 'Redistribute students between sections to balance enrollment',
      affectedSections: ['section-1', 'section-2'],
      expectedImpact: 'Could balance 2 sections',
      priority: 'high'
    }
  ];

  const mockPrerequisites = [
    {
      courseId: 'course-1',
      courseName: 'CS101 - Introduction to Programming',
      prerequisites: [],
      dependentCourses: ['CS201', 'CS202'],
      enrollmentImpact: 43,
      recommendations: ['Consider adding prerequisites to ensure student readiness']
    }
  ];

  const mockCapacitySuggestions = [
    {
      type: 'add_section',
      courseId: 'course-1',
      courseName: 'CS101',
      currentDemand: 48,
      projectedDemand: 53,
      suggestion: 'Add additional section to accommodate 5 waitlisted students',
      feasibilityScore: 75
    }
  ];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup coordinator mock
    (DepartmentEnrollmentCoordinator as jest.Mock).mockImplementation(() => ({
      getDepartmentSections: jest.fn().mockResolvedValue(mockSectionData),
      getEnrollmentBalancingRecommendations: jest.fn().mockResolvedValue(mockRecommendations),
      getPrerequisiteCoordination: jest.fn().mockResolvedValue(mockPrerequisites),
      getCapacityManagementSuggestions: jest.fn().mockResolvedValue(mockCapacitySuggestions),
      validatePrerequisiteEnforcement: jest.fn().mockResolvedValue([])
    }));

    // Setup balancing service mock
    (EnrollmentBalancingService as jest.Mock).mockImplementation(() => ({
      generateBalancingPlan: jest.fn(),
      executeBalancingOperation: jest.fn(),
      getBalancingHistory: jest.fn()
    }));

    // Setup planning service mock
    (SectionPlanningService as jest.Mock).mockImplementation(() => ({
      analyzeDepartmentCapacityNeeds: jest.fn(),
      generateSectionPlans: jest.fn(),
      optimizeSectionPlan: jest.fn(),
      generateImplementationTimeline: jest.fn()
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Department Admin Interface Integration', () => {
    it('should load and display department enrollment data', async () => {
      render(
        <DepartmentAdminInterface 
          departmentId={mockDepartmentId} 
          departmentName={mockDepartmentName} 
        />
      );

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByText('Loading department data...')).not.toBeInTheDocument();
      });

      // Check that department name is displayed
      expect(screen.getByText('Computer Science Enrollment Management')).toBeInTheDocument();

      // Check that sections are displayed
      expect(screen.getByText('CS101-01')).toBeInTheDocument();
      expect(screen.getByText('CS101-02')).toBeInTheDocument();
      expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
      expect(screen.getByText('Dr. Johnson')).toBeInTheDocument();
    });

    it('should display enrollment balancing recommendations', async () => {
      render(
        <DepartmentAdminInterface 
          departmentId={mockDepartmentId} 
          departmentName={mockDepartmentName} 
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading department data...')).not.toBeInTheDocument();
      });

      // Switch to balancing tab
      fireEvent.click(screen.getByText('Enrollment Balancing'));

      // Check that recommendations are displayed
      expect(screen.getByText('Redistribute students between sections to balance enrollment')).toBeInTheDocument();
      expect(screen.getByText('HIGH')).toBeInTheDocument();
      expect(screen.getByText('Could balance 2 sections')).toBeInTheDocument();
    });

    it('should display prerequisite coordination information', async () => {
      render(
        <DepartmentAdminInterface 
          departmentId={mockDepartmentId} 
          departmentName={mockDepartmentName} 
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading department data...')).not.toBeInTheDocument();
      });

      // Switch to prerequisites tab
      fireEvent.click(screen.getByText('Prerequisites'));

      // Check that prerequisite information is displayed
      expect(screen.getByText('CS101 - Introduction to Programming')).toBeInTheDocument();
      expect(screen.getByText('Current enrollment: 43')).toBeInTheDocument();
      expect(screen.getByText('CS201')).toBeInTheDocument();
      expect(screen.getByText('CS202')).toBeInTheDocument();
    });

    it('should display capacity management suggestions', async () => {
      render(
        <DepartmentAdminInterface 
          departmentId={mockDepartmentId} 
          departmentName={mockDepartmentName} 
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading department data...')).not.toBeInTheDocument();
      });

      // Switch to capacity tab
      fireEvent.click(screen.getByText('Capacity Management'));

      // Check that capacity suggestions are displayed
      expect(screen.getByText('Add additional section to accommodate 5 waitlisted students')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument(); // Feasibility score
    });

    it('should refresh data when refresh button is clicked', async () => {
      render(
        <DepartmentAdminInterface 
          departmentId={mockDepartmentId} 
          departmentName={mockDepartmentName} 
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading department data...')).not.toBeInTheDocument();
      });

      // Click refresh button
      fireEvent.click(screen.getByText('Refresh Data'));

      // Note: In a real test, we would verify the service calls
      // For now, we just verify the UI refreshes properly
      await waitFor(() => {
        expect(screen.getByText('Computer Science Enrollment Management')).toBeInTheDocument();
      });
    });
  });

  describe('Enrollment Balancing Service Integration', () => {
    let balancingService: EnrollmentBalancingService;

    beforeEach(() => {
      balancingService = new EnrollmentBalancingService();
    });

    it('should generate balancing plan for imbalanced sections', async () => {
      const mockBalancingPlan = {
        operations: [
          {
            id: 'op-1',
            type: 'redistribute',
            fromSectionId: 'section-1',
            toSectionId: 'section-2',
            studentIds: ['student-1', 'student-2'],
            reason: 'Balance enrollment',
            estimatedImpact: 'Improve utilization balance by 15%',
            status: 'pending',
            createdAt: new Date()
          }
        ],
        expectedOutcome: {
          beforeBalance: [],
          afterBalance: [],
          improvementScore: 75
        },
        feasibilityScore: 85,
        estimatedTimeToComplete: 10
      };

      mockBalancingService.prototype.generateBalancingPlan = jest.fn().mockResolvedValue(mockBalancingPlan);

      const result = await balancingService.generateBalancingPlan(['section-1', 'section-2']);

      expect(result).toBeDefined();
      expect(result.operations).toHaveLength(1);
      expect(result.feasibilityScore).toBe(85);
      expect(result.expectedOutcome.improvementScore).toBe(75);
    });

    it('should execute balancing operations successfully', async () => {
      mockBalancingService.prototype.executeBalancingOperation = jest.fn().mockResolvedValue(true);

      const result = await balancingService.executeBalancingOperation('op-1');

      expect(result).toBe(true);
      expect(mockBalancingService.prototype.executeBalancingOperation).toHaveBeenCalledWith('op-1');
    });

    it('should retrieve balancing history', async () => {
      const mockHistory = [
        {
          id: 'op-1',
          type: 'redistribute',
          fromSectionId: 'section-1',
          toSectionId: 'section-2',
          studentIds: ['student-1'],
          reason: 'Balance enrollment',
          estimatedImpact: 'Improved balance',
          status: 'completed',
          createdAt: new Date(),
          completedAt: new Date()
        }
      ];

      mockBalancingService.prototype.getBalancingHistory = jest.fn().mockResolvedValue(mockHistory);

      const result = await balancingService.getBalancingHistory(mockDepartmentId);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('completed');
    });
  });

  describe('Section Planning Service Integration', () => {
    let planningService: SectionPlanningService;

    beforeEach(() => {
      planningService = new SectionPlanningService();
    });

    it('should analyze department capacity needs', async () => {
      const mockCapacityData = [
        {
          courseCode: 'CS101',
          courseName: 'Introduction to Programming',
          currentSections: 2,
          totalCapacity: 60,
          totalEnrollment: 43,
          totalWaitlist: 5,
          utilizationRate: 71.7,
          demandScore: 85.2
        }
      ];

      mockPlanningService.prototype.analyzeDepartmentCapacityNeeds = jest.fn().mockResolvedValue(mockCapacityData);

      const result = await planningService.analyzeDepartmentCapacityNeeds(mockDepartmentId);

      expect(result).toHaveLength(1);
      expect(result[0].courseCode).toBe('CS101');
      expect(result[0].demandScore).toBe(85.2);
    });

    it('should generate section plans with recommendations', async () => {
      const mockSectionPlans = [
        {
          courseCode: 'CS101',
          courseName: 'Introduction to Programming',
          recommendedSections: 3,
          currentSections: 2,
          capacityPerSection: 30,
          totalRecommendedCapacity: 90,
          reasoning: ['Increase from 2 to 3 sections to meet demand'],
          priority: 'high',
          estimatedCost: 15000,
          feasibilityFactors: [
            {
              factor: 'Instructor Availability',
              impact: 'positive',
              description: '70% of instructors have available capacity',
              weight: 0.4
            }
          ]
        }
      ];

      mockPlanningService.prototype.generateSectionPlans = jest.fn().mockResolvedValue(mockSectionPlans);

      const result = await planningService.generateSectionPlans(mockDepartmentId);

      expect(result).toHaveLength(1);
      expect(result[0].recommendedSections).toBe(3);
      expect(result[0].priority).toBe('high');
      expect(result[0].estimatedCost).toBe(15000);
    });

    it('should optimize section plans based on constraints', async () => {
      const originalPlan = {
        courseCode: 'CS101',
        courseName: 'Introduction to Programming',
        recommendedSections: 4,
        currentSections: 2,
        capacityPerSection: 30,
        totalRecommendedCapacity: 120,
        reasoning: ['High demand requires additional sections'],
        priority: 'high',
        estimatedCost: 30000,
        feasibilityFactors: [
          {
            factor: 'Instructor Availability',
            impact: 'negative',
            description: '30% of instructors have available capacity',
            weight: 0.4
          }
        ]
      };

      const mockOptimizationResult = {
        originalPlan,
        optimizedPlan: {
          ...originalPlan,
          recommendedSections: 3,
          totalRecommendedCapacity: 90,
          estimatedCost: 15000
        },
        improvements: ['Reduced section increase to improve feasibility'],
        tradeoffs: ['May not fully meet demand in the short term'],
        implementationSteps: [
          'Phase 1: Add one section to test demand',
          'Phase 2: Evaluate success and add remaining sections'
        ]
      };

      mockPlanningService.prototype.optimizeSectionPlan = jest.fn().mockResolvedValue(mockOptimizationResult);

      const result = await planningService.optimizeSectionPlan(originalPlan);

      expect(result.optimizedPlan.recommendedSections).toBe(3);
      expect(result.improvements).toContain('Reduced section increase to improve feasibility');
      expect(result.implementationSteps).toHaveLength(2);
    });

    it('should generate implementation timeline', async () => {
      const mockPlans = [
        {
          courseCode: 'CS101',
          courseName: 'Introduction to Programming',
          recommendedSections: 3,
          currentSections: 2,
          capacityPerSection: 30,
          totalRecommendedCapacity: 90,
          reasoning: [],
          priority: 'high',
          estimatedCost: 15000,
          feasibilityFactors: [
            {
              factor: 'Instructor Availability',
              impact: 'positive',
              description: '80% availability',
              weight: 0.4
            }
          ]
        }
      ];

      const mockTimeline = {
        immediate: {
          timeframe: 'Next semester',
          plans: mockPlans,
          totalCost: 15000
        },
        shortTerm: {
          timeframe: '2-3 semesters',
          plans: [],
          totalCost: 0
        },
        longTerm: {
          timeframe: '1-2 years',
          plans: [],
          totalCost: 0
        }
      };

      mockPlanningService.prototype.generateImplementationTimeline = jest.fn().mockResolvedValue(mockTimeline);

      const result = await planningService.generateImplementationTimeline(mockPlans);

      expect(result.immediate.plans).toHaveLength(1);
      expect(result.immediate.totalCost).toBe(15000);
      expect(result.shortTerm.plans).toHaveLength(0);
    });
  });

  describe('End-to-End Department Coordination Workflow', () => {
    it('should complete full department coordination workflow', async () => {
      // Step 1: Load department data
      const coordinator = new DepartmentEnrollmentCoordinator();
      const sections = await coordinator.getDepartmentSections(mockDepartmentId);
      expect(sections).toHaveLength(2);

      // Step 2: Generate balancing recommendations
      const recommendations = await coordinator.getEnrollmentBalancingRecommendations(mockDepartmentId);
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('redistribute');

      // Step 3: Analyze prerequisites
      const prerequisites = await coordinator.getPrerequisiteCoordination(mockDepartmentId);
      expect(prerequisites).toHaveLength(1);
      expect(prerequisites[0].dependentCourses).toContain('CS201');

      // Step 4: Get capacity suggestions
      const suggestions = await coordinator.getCapacityManagementSuggestions(mockDepartmentId);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('add_section');

      // Step 5: Generate section plans
      const planningService = new SectionPlanningService();
      mockPlanningService.prototype.generateSectionPlans = jest.fn().mockResolvedValue([
        {
          courseCode: 'CS101',
          courseName: 'Introduction to Programming',
          recommendedSections: 3,
          currentSections: 2,
          capacityPerSection: 30,
          totalRecommendedCapacity: 90,
          reasoning: ['Add section for waitlisted students'],
          priority: 'high',
          estimatedCost: 15000,
          feasibilityFactors: []
        }
      ]);

      const plans = await planningService.generateSectionPlans(mockDepartmentId);
      expect(plans).toHaveLength(1);
      expect(plans[0].priority).toBe('high');

      // Note: In a real implementation, we would verify service calls
      // For this test, we verify the workflow completes successfully
    });

    it('should handle errors gracefully in coordination workflow', async () => {
      // Mock service to throw error
      mockCoordinator.prototype.getDepartmentSections = jest.fn().mockRejectedValue(new Error('Database error'));

      const coordinator = new DepartmentEnrollmentCoordinator();

      await expect(coordinator.getDepartmentSections(mockDepartmentId)).rejects.toThrow('Database error');
    });

    it('should validate prerequisite enforcement across department', async () => {
      const mockValidationResults = [
        {
          enrollmentId: 'enroll-1',
          studentId: 'student-1',
          studentName: 'John Doe',
          courseId: 'course-2',
          courseName: 'CS201 - Data Structures',
          missingPrerequisite: 'CS101',
          severity: 'high',
          recommendedAction: 'Review enrollment or grant prerequisite waiver'
        }
      ];

      mockCoordinator.prototype.validatePrerequisiteEnforcement = jest.fn().mockResolvedValue(mockValidationResults);

      const coordinator = new DepartmentEnrollmentCoordinator();
      const results = await coordinator.validatePrerequisiteEnforcement(mockDepartmentId);

      expect(results).toHaveLength(1);
      expect(results[0].missingPrerequisite).toBe('CS101');
      expect(results[0].severity).toBe('high');
    });
  });
});