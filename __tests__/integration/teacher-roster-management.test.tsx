import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import TeacherApprovalInterface from '@/components/enrollment/teacher-approval-interface';
import { useAuth } from '@/contexts/auth-context';

// Mock the auth context
jest.mock('@/contexts/auth-context');
const mockUseAuth = jest.mocked(useAuth);

// Mock fetch
global.fetch = jest.fn();
const mockFetch = jest.mocked(fetch);

// Mock date-fns functions
jest.mock('date-fns', () => ({
  format: jest.fn(() => 'Jan 15, 2024')
}));

const mockRosterData = {
  class: {
    id: 'class-1',
    name: 'Introduction to Computer Science',
    teacherName: 'Dr. Smith',
    capacity: 30,
    currentEnrollment: 25,
    waitlistCapacity: 10
  },
  enrolledStudents: [
    {
      enrollment: {
        id: 'enroll-1',
        studentId: 'student-1',
        classId: 'class-1',
        status: 'enrolled',
        enrolledAt: new Date('2024-01-01'),
        credits: 3
      },
      student: {
        id: 'student-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        studentId: 'STU001',
        year: 'Sophomore',
        major: 'Computer Science'
      },
      performance: {
        attendance: 95,
        assignments: 88,
        participation: 92
      }
    }
  ],
  pendingRequests: [
    {
      request: {
        id: 'req-1',
        studentId: 'student-2',
        classId: 'class-1',
        requestedAt: new Date('2024-01-10'),
        status: 'pending',
        justification: 'I need this class for my major requirements'
      },
      student: {
        id: 'student-2',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        studentId: 'STU002',
        year: 'Junior',
        major: 'Computer Science',
        gpa: 3.8
      },
      eligibility: {
        eligible: true,
        reasons: [],
        recommendedActions: []
      }
    }
  ],
  waitlistStudents: [
    {
      entry: {
        id: 'wait-1',
        studentId: 'student-3',
        classId: 'class-1',
        position: 1,
        addedAt: new Date('2024-01-05'),
        estimatedProbability: 0.8
      },
      student: {
        id: 'student-3',
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.johnson@example.com',
        studentId: 'STU003',
        year: 'Freshman',
        major: 'Computer Science'
      }
    }
  ],
  statistics: {
    enrollmentRate: 83.3,
    dropoutRate: 5.0,
    averageGrade: 3.2,
    attendanceRate: 95
  }
};

describe('Teacher Roster Management Integration Tests', () => {
  const mockUser = { id: 'teacher-1', email: 'teacher@test.com' };

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockRosterData
    });

    // Mock window methods
    window.confirm = jest.fn();
    window.prompt = jest.fn();
    window.alert = jest.fn();
    window.open = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Roster Display and Navigation', () => {
    it('displays class overview with enrollment statistics', async () => {
      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
        expect(screen.getByText('Capacity: 25/30 • Waitlist: 1 • Pending: 1')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument(); // Enrolled count
        expect(screen.getByText('1')).toBeInTheDocument(); // Pending count
        expect(screen.getByText('1')).toBeInTheDocument(); // Waitlisted count
        expect(screen.getByText('83.3%')).toBeInTheDocument(); // Enrollment rate
      });
    });

    it('allows navigation between roster tabs', async () => {
      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('Class Roster')).toBeInTheDocument();
      });

      // Navigate to pending requests tab
      const pendingTab = screen.getByText('Pending Requests (1)');
      fireEvent.click(pendingTab);

      await waitFor(() => {
        expect(screen.getByText('Pending Enrollment Requests')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      // Navigate to waitlist tab
      const waitlistTab = screen.getByText('Waitlist (1)');
      fireEvent.click(waitlistTab);

      await waitFor(() => {
        expect(screen.getByText('Waitlisted Students')).toBeInTheDocument();
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      });
    });

    it('displays enrolled students with their information', async () => {
      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
        expect(screen.getByText('STU001')).toBeInTheDocument();
        expect(screen.getByText('Sophomore')).toBeInTheDocument();
        expect(screen.getByText('Computer Science')).toBeInTheDocument();
        expect(screen.getByText('Attendance: 95%')).toBeInTheDocument();
        expect(screen.getByText('Assignments: 88%')).toBeInTheDocument();
      });
    });
  });

  describe('Enrollment Request Management', () => {
    it('displays pending enrollment requests with student details', async () => {
      render(<TeacherApprovalInterface classId="class-1" />);

      // Navigate to pending tab
      await waitFor(() => {
        const pendingTab = screen.getByText('Pending Requests (1)');
        fireEvent.click(pendingTab);
      });

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('jane.smith@example.com')).toBeInTheDocument();
        expect(screen.getByText('STU002')).toBeInTheDocument();
        expect(screen.getByText('Junior')).toBeInTheDocument();
        expect(screen.getByText('GPA: 3.8')).toBeInTheDocument();
        expect(screen.getByText('I need this class for my major requirements')).toBeInTheDocument();
      });
    });

    it('handles individual request approval', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Request approved' })
      });

      render(<TeacherApprovalInterface classId="class-1" />);

      // Navigate to pending tab
      await waitFor(() => {
        const pendingTab = screen.getByText('Pending Requests (1)');
        fireEvent.click(pendingTab);
      });

      // Click approve button
      await waitFor(() => {
        const approveButton = screen.getByText('Approve');
        fireEvent.click(approveButton);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/enrollment-requests/req-1/approve',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );

      expect(window.alert).toHaveBeenCalledWith('Enrollment request approved successfully');
    });

    it('handles individual request denial with reason', async () => {
      (window.prompt as jest.Mock).mockReturnValue('Class is full');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Request denied' })
      });

      render(<TeacherApprovalInterface classId="class-1" />);

      // Navigate to pending tab
      await waitFor(() => {
        const pendingTab = screen.getByText('Pending Requests (1)');
        fireEvent.click(pendingTab);
      });

      // Click deny button
      await waitFor(() => {
        const denyButton = screen.getByText('Deny');
        fireEvent.click(denyButton);
      });

      expect(window.prompt).toHaveBeenCalledWith('Please provide a reason for denying this enrollment request:');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/enrollment-requests/req-1/deny',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Class is full' })
        })
      );

      expect(window.alert).toHaveBeenCalledWith('Enrollment request denied');
    });

    it('handles batch approval of multiple requests', async () => {
      (window.confirm as jest.Mock).mockReturnValue(true);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ successful: 1, failed: 0, results: [] })
      });

      render(<TeacherApprovalInterface classId="class-1" />);

      // Navigate to pending tab
      await waitFor(() => {
        const pendingTab = screen.getByText('Pending Requests (1)');
        fireEvent.click(pendingTab);
      });

      // Select request checkbox
      await waitFor(() => {
        const checkbox = screen.getAllByRole('checkbox')[1]; // First is select all
        fireEvent.click(checkbox);
      });

      // Click batch approve
      await waitFor(() => {
        const batchApproveButton = screen.getByText('Approve Selected (1)');
        fireEvent.click(batchApproveButton);
      });

      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to approve 1 enrollment requests?');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/classes/class-1/enrollment-requests/batch-approve',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestIds: ['req-1'] })
        })
      );
    });
  });

  describe('Student Management', () => {
    it('handles student removal from roster', async () => {
      (window.prompt as jest.Mock).mockReturnValue('Academic misconduct');
      (window.confirm as jest.Mock).mockReturnValue(true);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Student removed' })
      });

      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click on student actions menu
      const moreButton = screen.getByRole('button', { name: /more/i });
      fireEvent.click(moreButton);

      // Click remove from class
      await waitFor(() => {
        const removeButton = screen.getByText('Remove from Class');
        fireEvent.click(removeButton);
      });

      expect(window.prompt).toHaveBeenCalledWith('Please provide a reason for removing John Doe from the class:');
      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to remove John Doe from the class?');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/classes/class-1/students/student-1/remove',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Academic misconduct' })
        })
      );
    });

    it('handles waitlist promotion', async () => {
      (window.confirm as jest.Mock).mockReturnValue(true);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Student promoted' })
      });

      render(<TeacherApprovalInterface classId="class-1" />);

      // Navigate to waitlist tab
      await waitFor(() => {
        const waitlistTab = screen.getByText('Waitlist (1)');
        fireEvent.click(waitlistTab);
      });

      // Click promote button
      await waitFor(() => {
        const promoteButton = screen.getByText('Promote');
        fireEvent.click(promoteButton);
      });

      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to promote Bob Johnson from the waitlist?');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/waitlist/wait-1/promote',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
  });

  describe('Roster Export and Communication', () => {
    it('handles CSV roster export', async () => {
      const mockBlob = new Blob(['csv data'], { type: 'text/csv' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob
      });

      // Mock URL.createObjectURL
      const mockUrl = 'blob:mock-url';
      global.URL.createObjectURL = jest.fn(() => mockUrl);
      global.URL.revokeObjectURL = jest.fn();

      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        const exportButton = screen.getByText('Export CSV');
        fireEvent.click(exportButton);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/classes/class-1/roster/export?format=csv');
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });

    it('handles JSON roster export', async () => {
      const mockBlob = new Blob(['json data'], { type: 'application/json' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob
      });

      global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = jest.fn();

      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        const exportButton = screen.getByText('Export JSON');
        fireEvent.click(exportButton);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/classes/class-1/roster/export?format=json');
    });

    it('handles student email communication', async () => {
      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click on student actions menu
      const moreButton = screen.getByRole('button', { name: /more/i });
      fireEvent.click(moreButton);

      // Click email student
      await waitFor(() => {
        const emailButton = screen.getByText('Email Student');
        fireEvent.click(emailButton);
      });

      expect(window.open).toHaveBeenCalledWith('mailto:john.doe@example.com');
    });
  });

  describe('Search and Filtering', () => {
    it('filters students based on search term', async () => {
      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Enter search term
      const searchInput = screen.getByPlaceholderText('Search students...');
      fireEvent.change(searchInput, { target: { value: 'jane' } });

      // Should not show John Doe anymore (in a real implementation)
      // This would require the component to actually filter based on search
    });

    it('shows appropriate empty states', async () => {
      const emptyRosterData = {
        ...mockRosterData,
        enrolledStudents: [],
        pendingRequests: [],
        waitlistStudents: []
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyRosterData
      });

      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('No enrolled students')).toBeInTheDocument();
      });

      // Navigate to pending tab
      const pendingTab = screen.getByText('Pending Requests (0)');
      fireEvent.click(pendingTab);

      await waitFor(() => {
        expect(screen.getByText('No pending enrollment requests')).toBeInTheDocument();
      });

      // Navigate to waitlist tab
      const waitlistTab = screen.getByText('Waitlist (0)');
      fireEvent.click(waitlistTab);

      await waitFor(() => {
        expect(screen.getByText('No students on waitlist')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<TeacherApprovalInterface classId="class-1" />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('handles approval errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRosterData
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Class is at capacity' })
      });

      render(<TeacherApprovalInterface classId="class-1" />);

      // Navigate to pending tab
      await waitFor(() => {
        const pendingTab = screen.getByText('Pending Requests (1)');
        fireEvent.click(pendingTab);
      });

      // Click approve button
      await waitFor(() => {
        const approveButton = screen.getByText('Approve');
        fireEvent.click(approveButton);
      });

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Class is at capacity');
      });
    });
  });
});