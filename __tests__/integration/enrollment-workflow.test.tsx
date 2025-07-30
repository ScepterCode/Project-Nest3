import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnrollmentRequestForm } from '@/components/enrollment/enrollment-request-form';
import { TeacherApprovalInterface } from '@/components/enrollment/teacher-approval-interface';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';
import { 
  EnrollmentType, 
  EnrollmentStatus, 
  EnrollmentRequestStatus,
  ClassWithEnrollment 
} from '@/lib/types/enrollment';

// Mock the services
jest.mock('@/lib/services/enrollment-manager');
jest.mock('@/lib/services/class-discovery');

const MockedEnrollmentManager = EnrollmentManager as jest.MockedClass<typeof EnrollmentManager>;
const MockedClassDiscoveryService = ClassDiscoveryService as jest.MockedClass<typeof ClassDiscoveryService>;

describe('Enrollment Request Workflow Integration', () => {
  let mockEnrollmentManager: jest.Mocked<EnrollmentManager>;
  let mockClassDiscoveryService: jest.Mocked<ClassDiscoveryService>;

  const mockClassData: ClassWithEnrollment = {
    id: 'class-1',
    name: 'Advanced Computer Science',
    code: 'CS301',
    description: 'Advanced topics in computer science',
    teacherId: 'teacher-1',
    teacherName: 'Dr. Smith',
    departmentId: 'dept-1',
    institutionId: 'inst-1',
    semester: 'Fall 2024',
    credits: 3,
    capacity: 25,
    currentEnrollment: 20,
    waitlistCapacity: 5,
    enrollmentType: EnrollmentType.RESTRICTED,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    enrollmentConfig: {
      enrollmentType: EnrollmentType.RESTRICTED,
      capacity: 25,
      waitlistCapacity: 5,
      autoApprove: false,
      requiresJustification: true,
      allowWaitlist: true,
      notificationSettings: {
        enrollmentConfirmation: true,
        waitlistUpdates: true,
        deadlineReminders: true,
        capacityAlerts: true
      }
    },
    availableSpots: 5,
    waitlistCount: 2,
    isEnrollmentOpen: true,
    isWaitlistAvailable: true,
    class_prerequisites: [
      {
        id: 'prereq-1',
        classId: 'class-1',
        type: 'course',
        requirement: JSON.stringify({ courseCode: 'CS201' }),
        description: 'Must complete CS201 with grade C or better',
        strict: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ],
    enrollment_restrictions: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockEnrollmentManager = {
      requestEnrollment: jest.fn(),
      approveEnrollment: jest.fn(),
      denyEnrollment: jest.fn(),
      dropStudent: jest.fn(),
      bulkEnroll: jest.fn()
    } as any;

    mockClassDiscoveryService = {
      checkEnrollmentEligibility: jest.fn(),
      searchClasses: jest.fn(),
      getAvailableClasses: jest.fn(),
      getClassDetails: jest.fn(),
      getEnrollmentStatistics: jest.fn()
    } as any;

    MockedEnrollmentManager.mockImplementation(() => mockEnrollmentManager);
    MockedClassDiscoveryService.mockImplementation(() => mockClassDiscoveryService);
  });

  describe('Student Enrollment Request Flow', () => {
    it('should complete full enrollment request submission', async () => {
      const user = userEvent.setup();
      const mockOnSuccess = jest.fn();

      // Mock eligibility check
      mockClassDiscoveryService.checkEnrollmentEligibility.mockResolvedValue({
        eligible: true,
        reasons: [],
        recommendedActions: []
      });

      // Mock successful enrollment request
      mockEnrollmentManager.requestEnrollment.mockResolvedValue({
        success: true,
        status: EnrollmentStatus.PENDING,
        message: 'Enrollment request submitted for approval',
        nextSteps: ['Wait for instructor approval', 'Check your email for updates']
      });

      render(
        <EnrollmentRequestForm
          classData={mockClassData}
          studentId="student-1"
          onSuccess={mockOnSuccess}
        />
      );

      // Wait for eligibility check to complete
      await waitFor(() => {
        expect(screen.getByText('Enrollment Eligibility')).toBeInTheDocument();
      });

      // Fill out justification
      const justificationInput = screen.getByLabelText('Justification for Enrollment');
      await user.type(justificationInput, 'This course is required for my major and I have completed all prerequisites.');

      // Submit the request
      const submitButton = screen.getByRole('button', { name: /submit request/i });
      await user.click(submitButton);

      // Verify the request was submitted
      await waitFor(() => {
        expect(mockEnrollmentManager.requestEnrollment).toHaveBeenCalledWith(
          'student-1',
          'class-1',
          'This course is required for my major and I have completed all prerequisites.'
        );
        expect(mockOnSuccess).toHaveBeenCalledWith({
          success: true,
          status: EnrollmentStatus.PENDING,
          message: 'Enrollment request submitted for approval',
          nextSteps: ['Wait for instructor approval', 'Check your email for updates']
        });
      });
    });

    it('should handle eligibility issues gracefully', async () => {
      const user = userEvent.setup();

      // Mock eligibility check with issues
      mockClassDiscoveryService.checkEnrollmentEligibility.mockResolvedValue({
        eligible: false,
        reasons: [
          {
            type: 'prerequisite',
            message: 'Missing required course: CS201',
            severity: 'error',
            overridable: false
          },
          {
            type: 'capacity',
            message: 'Class is at capacity',
            severity: 'warning',
            overridable: true
          }
        ],
        recommendedActions: [
          'Complete CS201 before enrolling',
          'Join the waitlist'
        ]
      });

      render(
        <EnrollmentRequestForm
          classData={mockClassData}
          studentId="student-1"
        />
      );

      // Wait for eligibility check
      await waitFor(() => {
        expect(screen.getByText('Missing required course: CS201')).toBeInTheDocument();
        expect(screen.getByText('Class is at capacity')).toBeInTheDocument();
      });

      // Verify submit button is disabled due to non-overridable error
      const submitButton = screen.getByRole('button', { name: /submit request/i });
      expect(submitButton).toBeDisabled();

      // Verify recommended actions are shown
      expect(screen.getByText('Complete CS201 before enrolling')).toBeInTheDocument();
      expect(screen.getByText('Join the waitlist')).toBeInTheDocument();
    });

    it('should handle enrollment request errors', async () => {
      const user = userEvent.setup();

      // Mock eligibility check as eligible
      mockClassDiscoveryService.checkEnrollmentEligibility.mockResolvedValue({
        eligible: true,
        reasons: [],
        recommendedActions: []
      });

      // Mock failed enrollment request
      mockEnrollmentManager.requestEnrollment.mockResolvedValue({
        success: false,
        status: EnrollmentStatus.DROPPED,
        message: 'Enrollment period has ended',
        nextSteps: ['Contact instructor for late enrollment'],
        errors: [{ field: 'deadline', message: 'Enrollment closed', code: 'ENROLLMENT_CLOSED' }]
      });

      render(
        <EnrollmentRequestForm
          classData={mockClassData}
          studentId="student-1"
        />
      );

      // Wait for eligibility check
      await waitFor(() => {
        expect(screen.getByText('✓ You meet all requirements for this class')).toBeInTheDocument();
      });

      // Fill out and submit form
      const justificationInput = screen.getByLabelText('Justification for Enrollment');
      await user.type(justificationInput, 'Need this course for graduation');

      const submitButton = screen.getByRole('button', { name: /submit request/i });
      await user.click(submitButton);

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText('Enrollment period has ended')).toBeInTheDocument();
      });
    });
  });

  describe('Teacher Approval Interface Flow', () => {
    it('should load and display pending requests', async () => {
      render(<TeacherApprovalInterface teacherId="teacher-1" classId="class-1" />);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Enrollment Requests')).toBeInTheDocument();
      });

      // Should show mock requests (these would come from API in real implementation)
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    });

    it('should approve individual enrollment request', async () => {
      const user = userEvent.setup();

      mockEnrollmentManager.approveEnrollment.mockResolvedValue(undefined);

      render(<TeacherApprovalInterface teacherId="teacher-1" classId="class-1" />);

      // Wait for requests to load
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Click approve button for first request
      const approveButtons = screen.getAllByText('Approve');
      await user.click(approveButtons[0]);

      // Verify approval was called
      await waitFor(() => {
        expect(mockEnrollmentManager.approveEnrollment).toHaveBeenCalledWith('req-1', 'teacher-1');
      });
    });

    it('should deny enrollment request with reason', async () => {
      const user = userEvent.setup();

      mockEnrollmentManager.denyEnrollment.mockResolvedValue(undefined);

      render(<TeacherApprovalInterface teacherId="teacher-1" classId="class-1" />);

      // Wait for requests to load
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Click deny button for first request
      const denyButtons = screen.getAllByText('Deny');
      await user.click(denyButtons[0]);

      // Fill in denial reason
      const reasonInput = screen.getByPlaceholderText('Reason for denial...');
      await user.type(reasonInput, 'Prerequisites not met');

      // Submit denial
      const submitDenyButton = screen.getByRole('button', { name: 'Deny' });
      await user.click(submitDenyButton);

      // Verify denial was called
      await waitFor(() => {
        expect(mockEnrollmentManager.denyEnrollment).toHaveBeenCalledWith(
          'req-1', 
          'teacher-1', 
          'Prerequisites not met'
        );
      });
    });

    it('should handle bulk approval of selected requests', async () => {
      const user = userEvent.setup();

      mockEnrollmentManager.approveEnrollment.mockResolvedValue(undefined);

      render(<TeacherApprovalInterface teacherId="teacher-1" classId="class-1" />);

      // Wait for requests to load
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Select multiple requests
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]); // First request checkbox (index 0 is "select all")
      await user.click(checkboxes[2]); // Second request checkbox

      // Click bulk approve
      const bulkApproveButton = screen.getByText('Approve All');
      await user.click(bulkApproveButton);

      // Verify both approvals were called
      await waitFor(() => {
        expect(mockEnrollmentManager.approveEnrollment).toHaveBeenCalledTimes(2);
        expect(mockEnrollmentManager.approveEnrollment).toHaveBeenCalledWith('req-1', 'teacher-1');
        expect(mockEnrollmentManager.approveEnrollment).toHaveBeenCalledWith('req-2', 'teacher-1');
      });
    });

    it('should handle bulk denial with reason', async () => {
      const user = userEvent.setup();

      mockEnrollmentManager.denyEnrollment.mockResolvedValue(undefined);

      render(<TeacherApprovalInterface teacherId="teacher-1" classId="class-1" />);

      // Wait for requests to load
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Select requests
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);
      await user.click(checkboxes[2]);

      // Click bulk deny
      const bulkDenyButton = screen.getByText('Deny All');
      await user.click(bulkDenyButton);

      // Fill in bulk denial reason
      const bulkReasonInput = screen.getByPlaceholderText('Reason for bulk denial...');
      await user.type(bulkReasonInput, 'Class capacity reached');

      // Submit bulk denial
      const submitBulkDenyButton = screen.getByRole('button', { name: 'Deny' });
      await user.click(submitBulkDenyButton);

      // Verify both denials were called
      await waitFor(() => {
        expect(mockEnrollmentManager.denyEnrollment).toHaveBeenCalledTimes(2);
        expect(mockEnrollmentManager.denyEnrollment).toHaveBeenCalledWith('req-1', 'teacher-1', 'Class capacity reached');
        expect(mockEnrollmentManager.denyEnrollment).toHaveBeenCalledWith('req-2', 'teacher-1', 'Class capacity reached');
      });
    });

    it('should show urgency indicators for expiring requests', async () => {
      render(<TeacherApprovalInterface teacherId="teacher-1" classId="class-1" />);

      // Wait for requests to load
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Should show expiry information
      expect(screen.getByText(/Expires in \d+ day/)).toBeInTheDocument();
    });

    it('should handle approval/denial errors gracefully', async () => {
      const user = userEvent.setup();

      mockEnrollmentManager.approveEnrollment.mockRejectedValue(new Error('Database connection failed'));

      render(<TeacherApprovalInterface teacherId="teacher-1" classId="class-1" />);

      // Wait for requests to load
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Try to approve
      const approveButtons = screen.getAllByText('Approve');
      await user.click(approveButtons[0]);

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText('Database connection failed')).toBeInTheDocument();
      });
    });
  });

  describe('End-to-End Enrollment Workflow', () => {
    it('should complete full workflow from request to approval', async () => {
      const user = userEvent.setup();

      // Step 1: Student submits request
      mockClassDiscoveryService.checkEnrollmentEligibility.mockResolvedValue({
        eligible: true,
        reasons: [],
        recommendedActions: []
      });

      mockEnrollmentManager.requestEnrollment.mockResolvedValue({
        success: true,
        status: EnrollmentStatus.PENDING,
        message: 'Enrollment request submitted for approval',
        nextSteps: ['Wait for instructor approval']
      });

      const { rerender } = render(
        <EnrollmentRequestForm
          classData={mockClassData}
          studentId="student-1"
          onSuccess={jest.fn()}
        />
      );

      // Submit student request
      await waitFor(() => {
        expect(screen.getByText('✓ You meet all requirements for this class')).toBeInTheDocument();
      });

      const justificationInput = screen.getByLabelText('Justification for Enrollment');
      await user.type(justificationInput, 'Required for major');

      const submitButton = screen.getByRole('button', { name: /submit request/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockEnrollmentManager.requestEnrollment).toHaveBeenCalled();
      });

      // Step 2: Teacher approves request
      mockEnrollmentManager.approveEnrollment.mockResolvedValue(undefined);

      rerender(<TeacherApprovalInterface teacherId="teacher-1" classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByText('Approve');
      await user.click(approveButtons[0]);

      await waitFor(() => {
        expect(mockEnrollmentManager.approveEnrollment).toHaveBeenCalledWith('req-1', 'teacher-1');
      });
    });

    it('should handle workflow with capacity constraints', async () => {
      const user = userEvent.setup();

      // Mock class at capacity
      const fullClassData = {
        ...mockClassData,
        currentEnrollment: 25,
        availableSpots: 0
      };

      mockClassDiscoveryService.checkEnrollmentEligibility.mockResolvedValue({
        eligible: false,
        reasons: [
          {
            type: 'capacity',
            message: 'Class is full, but waitlist is available',
            severity: 'warning',
            overridable: false
          }
        ],
        recommendedActions: ['Join the waitlist']
      });

      render(
        <EnrollmentRequestForm
          classData={fullClassData}
          studentId="student-1"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Class is full, but waitlist is available')).toBeInTheDocument();
        expect(screen.getByText('Join the waitlist')).toBeInTheDocument();
      });

      // Should still allow submission for waitlist
      const submitButton = screen.getByRole('button', { name: /submit request/i });
      expect(submitButton).not.toBeDisabled();
    });
  });
});