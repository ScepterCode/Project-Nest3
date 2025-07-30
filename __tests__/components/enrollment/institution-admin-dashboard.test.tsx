import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstitutionAdminDashboard } from '@/components/enrollment/institution-admin-dashboard';
import { EnrollmentAnalyticsService } from '@/lib/services/enrollment-analytics';
import { EnrollmentConflictResolver } from '@/lib/services/enrollment-conflict-resolver';
import { EnrollmentReportingService } from '@/lib/services/enrollment-reporting';

// Mock the services
jest.mock('@/lib/services/enrollment-analytics');
jest.mock('@/lib/services/enrollment-conflict-resolver');
jest.mock('@/lib/services/enrollment-reporting');

const mockAnalyticsService = EnrollmentAnalyticsService as jest.MockedClass<typeof EnrollmentAnalyticsService>;
const mockConflictResolver = EnrollmentConflictResolver as jest.MockedClass<typeof EnrollmentConflictResolver>;
const mockReportingService = EnrollmentReportingService as jest.MockedClass<typeof EnrollmentReportingService>;

describe('InstitutionAdminDashboard', () => {
  const mockProps = {
    institutionId: 'test-institution-id',
    institutionName: 'Test University'
  };

  const mockAnalyticsData = {
    totalEnrollments: 15420,
    totalCapacity: 18500,
    utilizationRate: 83.4,
    totalWaitlisted: 892,
    enrollmentTrends: [
      { period: 'Fall 2024', enrollments: 15420, capacity: 18500, utilization: 83.4, waitlisted: 892, dropouts: 234 }
    ],
    departmentStats: [
      { 
        departmentId: '1', 
        departmentName: 'Computer Science', 
        enrollments: 3240, 
        capacity: 3600, 
        utilization: 90.0, 
        waitlisted: 245,
        averageClassSize: 32,
        totalClasses: 101
      }
    ],
    conflictAlerts: [],
    capacityUtilization: [
      {
        classId: 'class1',
        className: 'CS101',
        departmentName: 'Computer Science',
        capacity: 30,
        enrolled: 28,
        waitlisted: 5,
        utilizationRate: 93.3,
        isOvercapacity: false
      }
    ],
    waitlistStatistics: {
      totalWaitlisted: 892,
      averageWaitTime: 7,
      promotionRate: 65,
      departmentBreakdown: [
        {
          departmentId: '1',
          departmentName: 'Computer Science',
          waitlisted: 245,
          averagePosition: 3.2
        }
      ]
    }
  };

  const mockConflicts = [
    {
      id: 'conflict1',
      type: 'capacity_exceeded' as const,
      severity: 'high' as const,
      description: 'CS101 section has exceeded maximum capacity by 5 students',
      affectedStudents: 5,
      classId: 'cs101-01',
      className: 'CS101-01',
      detectedAt: new Date(),
      status: 'open' as const
    }
  ];

  const mockPolicies = [
    {
      id: 'policy1',
      institutionId: 'test-institution-id',
      name: 'Enrollment Deadline Policy',
      type: 'enrollment_deadline' as const,
      description: 'Students must complete enrollment by the specified deadline',
      value: '2 weeks before term start',
      scope: 'institution' as const,
      isActive: true,
      lastModified: new Date(),
      modifiedBy: 'admin@university.edu'
    }
  ];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockAnalyticsService.prototype.getInstitutionAnalytics.mockResolvedValue(mockAnalyticsData);
    mockConflictResolver.prototype.detectConflicts.mockResolvedValue(mockConflicts);
    mockAnalyticsService.prototype.getInstitutionPolicies.mockResolvedValue(mockPolicies);
    mockConflictResolver.prototype.resolveConflict.mockResolvedValue();
    mockAnalyticsService.prototype.updateInstitutionPolicy.mockResolvedValue();
  });

  describe('Dashboard Loading and Display', () => {
    it('should display loading state initially', () => {
      render(<InstitutionAdminDashboard {...mockProps} />);
      
      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    });

    it('should display analytics data after loading', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('15,420')).toBeInTheDocument(); // Total enrollments
        expect(screen.getByText('83.4%')).toBeInTheDocument(); // Utilization rate
        expect(screen.getByText('892')).toBeInTheDocument(); // Total waitlisted
      });
    });

    it('should display institution name in header', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test University Enrollment Administration')).toBeInTheDocument();
      });
    });

    it('should display department statistics', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Computer Science')).toBeInTheDocument();
        expect(screen.getByText('3240 enrolled • 245 waitlisted')).toBeInTheDocument();
        expect(screen.getByText('90.0%')).toBeInTheDocument();
      });
    });
  });

  describe('Timeframe Selection', () => {
    it('should allow changing timeframe', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Current Term')).toBeInTheDocument();
      });

      // Change timeframe
      const select = screen.getByDisplayValue('Current Term');
      fireEvent.click(select);
      
      const lastTermOption = screen.getByText('Last Term');
      fireEvent.click(lastTermOption);

      // Should call analytics service with new timeframe
      await waitFor(() => {
        expect(mockAnalyticsService.prototype.getInstitutionAnalytics)
          .toHaveBeenCalledWith('test-institution-id', 'last_term');
      });
    });

    it('should refresh data when refresh button is clicked', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Refresh Data')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh Data');
      fireEvent.click(refreshButton);

      // Should call analytics service again
      expect(mockAnalyticsService.prototype.getInstitutionAnalytics)
        .toHaveBeenCalledTimes(2);
    });
  });

  describe('Conflicts Tab', () => {
    it('should display conflicts in conflicts tab', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const conflictsTab = screen.getByText('Conflicts');
        fireEvent.click(conflictsTab);
      });

      expect(screen.getByText('CS101 section has exceeded maximum capacity by 5 students')).toBeInTheDocument();
      expect(screen.getByText('HIGH')).toBeInTheDocument();
      expect(screen.getByText('OPEN')).toBeInTheDocument();
    });

    it('should show conflict resolution modal when resolve is clicked', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const conflictsTab = screen.getByText('Conflicts');
        fireEvent.click(conflictsTab);
      });

      const resolveButton = screen.getByText('Resolve');
      fireEvent.click(resolveButton);

      expect(screen.getByText('Resolve Conflict')).toBeInTheDocument();
      expect(screen.getByLabelText('Resolution Type')).toBeInTheDocument();
    });

    it('should handle conflict resolution submission', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const conflictsTab = screen.getByText('Conflicts');
        fireEvent.click(conflictsTab);
      });

      const resolveButton = screen.getByText('Resolve');
      fireEvent.click(resolveButton);

      // Fill out resolution form
      const descriptionField = screen.getByLabelText('Description');
      const actionField = screen.getByLabelText('Action Taken');
      
      fireEvent.change(descriptionField, { target: { value: 'Increased class capacity' } });
      fireEvent.change(actionField, { target: { value: 'Added 5 more seats to the class' } });

      const submitButton = screen.getByText('Resolve Conflict');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockConflictResolver.prototype.resolveConflict).toHaveBeenCalledWith(
          'conflict1',
          expect.objectContaining({
            conflictId: 'conflict1',
            resolutionType: 'manual_override',
            description: 'Increased class capacity',
            actionTaken: 'Added 5 more seats to the class'
          })
        );
      });
    });

    it('should handle investigate and dismiss actions', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const conflictsTab = screen.getByText('Conflicts');
        fireEvent.click(conflictsTab);
      });

      const investigateButton = screen.getByText('Investigate');
      fireEvent.click(investigateButton);

      // Should update conflict status locally
      await waitFor(() => {
        expect(screen.getByText('INVESTIGATING')).toBeInTheDocument();
      });
    });
  });

  describe('Policies Tab', () => {
    it('should display policies in policies tab', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const policiesTab = screen.getByText('Policies');
        fireEvent.click(policiesTab);
      });

      expect(screen.getByText('Enrollment Deadline Policy')).toBeInTheDocument();
      expect(screen.getByText('Students must complete enrollment by the specified deadline')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should allow toggling policy status', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const policiesTab = screen.getByText('Policies');
        fireEvent.click(policiesTab);
      });

      const toggleSwitch = screen.getByRole('switch');
      fireEvent.click(toggleSwitch);

      await waitFor(() => {
        expect(mockAnalyticsService.prototype.updateInstitutionPolicy)
          .toHaveBeenCalledWith('policy1', { isActive: false }, 'current-admin');
      });
    });
  });

  describe('Reports Tab', () => {
    it('should display reports tab with generation buttons', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const reportsTab = screen.getByText('Reports');
        fireEvent.click(reportsTab);
      });

      expect(screen.getByText('Generate Enrollment Summary')).toBeInTheDocument();
      expect(screen.getByText('Capacity Analysis')).toBeInTheDocument();
      expect(screen.getByText('Waitlist Report')).toBeInTheDocument();
      expect(screen.getByText('Trend Analysis')).toBeInTheDocument();
    });

    it('should generate enrollment summary report', async () => {
      const mockReport = {
        institutionName: 'Test University',
        reportPeriod: 'Current Term',
        generatedAt: new Date(),
        summary: {
          totalEnrollments: 15420,
          totalCapacity: 18500,
          utilizationRate: 83.4,
          totalWaitlisted: 892,
          totalDropouts: 234
        },
        departmentBreakdown: [],
        classBreakdown: []
      };

      mockReportingService.prototype.generateEnrollmentSummary.mockResolvedValue(mockReport);

      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const reportsTab = screen.getByText('Reports');
        fireEvent.click(reportsTab);
      });

      const generateButton = screen.getByText('Generate Enrollment Summary');
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(mockReportingService.prototype.generateEnrollmentSummary)
          .toHaveBeenCalledWith(expect.objectContaining({
            institutionId: 'test-institution-id',
            includeWaitlist: true,
            includeDropouts: true,
            format: 'json'
          }));
      });

      // Should add new report to the list
      expect(screen.getByText('Enrollment Summary Report')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle analytics loading errors gracefully', async () => {
      mockAnalyticsService.prototype.getInstitutionAnalytics.mockRejectedValue(
        new Error('Failed to load analytics')
      );

      render(<InstitutionAdminDashboard {...mockProps} />);

      // Should still render with fallback data
      await waitFor(() => {
        expect(screen.getByText('15,420')).toBeInTheDocument();
      });
    });

    it('should handle conflict resolution errors', async () => {
      mockConflictResolver.prototype.resolveConflict.mockRejectedValue(
        new Error('Failed to resolve conflict')
      );

      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const conflictsTab = screen.getByText('Conflicts');
        fireEvent.click(conflictsTab);
      });

      const resolveButton = screen.getByText('Resolve');
      fireEvent.click(resolveButton);

      const descriptionField = screen.getByLabelText('Description');
      const actionField = screen.getByLabelText('Action Taken');
      
      fireEvent.change(descriptionField, { target: { value: 'Test description' } });
      fireEvent.change(actionField, { target: { value: 'Test action' } });

      const submitButton = screen.getByText('Resolve Conflict');
      fireEvent.click(submitButton);

      // Should handle error gracefully (no crash)
      await waitFor(() => {
        expect(mockConflictResolver.prototype.resolveConflict).toHaveBeenCalled();
      });
    });

    it('should handle policy update errors', async () => {
      mockAnalyticsService.prototype.updateInstitutionPolicy.mockRejectedValue(
        new Error('Failed to update policy')
      );

      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const policiesTab = screen.getByText('Policies');
        fireEvent.click(policiesTab);
      });

      const toggleSwitch = screen.getByRole('switch');
      fireEvent.click(toggleSwitch);

      // Should handle error gracefully
      await waitFor(() => {
        expect(mockAnalyticsService.prototype.updateInstitutionPolicy).toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Analytics' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Conflicts' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Policies' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Reports' })).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      render(<InstitutionAdminDashboard {...mockProps} />);

      await waitFor(() => {
        const conflictsTab = screen.getByRole('tab', { name: 'Conflicts' });
        conflictsTab.focus();
        fireEvent.keyDown(conflictsTab, { key: 'Enter' });
      });

      expect(screen.getByText('CS101 section has exceeded maximum capacity by 5 students')).toBeInTheDocument();
    });
  });
});