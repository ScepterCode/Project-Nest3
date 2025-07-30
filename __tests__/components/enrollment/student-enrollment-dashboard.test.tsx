import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import StudentEnrollmentDashboard from '@/components/enrollment/student-enrollment-dashboard';
import { useAuth } from '@/contexts/auth-context';

// Mock the auth context
jest.mock('@/contexts/auth-context');
const mockUseAuth = jest.mocked(useAuth);

// Mock fetch
global.fetch = jest.fn();
const mockFetch = jest.mocked(fetch);

// Mock date-fns functions
jest.mock('date-fns', () => ({
  format: jest.fn(() => 'Jan 15, 2024'),
  isAfter: jest.fn(() => false),
  isBefore: jest.fn(() => true),
  addDays: jest.fn(() => new Date())
}));

const mockDashboardData = {
  currentEnrollments: [
    {
      enrollment: {
        id: 'enroll-1',
        studentId: 'student-1',
        classId: 'class-1',
        status: 'enrolled',
        enrolledAt: new Date('2024-01-01'),
        credits: 3,
        priority: 0,
        metadata: {},
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      class: {
        id: 'class-1',
        name: 'Introduction to Computer Science',
        teacherName: 'Dr. Smith',
        credits: 3,
        dropDeadline: new Date('2024-03-01'),
        withdrawDeadline: new Date('2024-04-01')
      },
      upcomingDeadlines: [
        {
          type: 'drop',
          date: new Date('2024-03-01'),
          description: 'Last day to drop without penalty'
        }
      ]
    }
  ],
  pendingRequests: [
    {
      request: {
        id: 'req-1',
        studentId: 'student-1',
        classId: 'class-2',
        requestedAt: new Date('2024-01-10'),
        status: 'pending',
        priority: 0,
        expiresAt: new Date('2024-01-17'),
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-10')
      },
      class: {
        id: 'class-2',
        name: 'Advanced Mathematics',
        teacherName: 'Prof. Johnson',
        credits: 4
      },
      estimatedResponseTime: '2 days remaining'
    }
  ],
  waitlistEntries: [
    {
      entry: {
        id: 'wait-1',
        studentId: 'student-1',
        classId: 'class-3',
        position: 3,
        addedAt: new Date('2024-01-05'),
        priority: 0,
        estimatedProbability: 0.7,
        metadata: {},
        createdAt: new Date('2024-01-05'),
        updatedAt: new Date('2024-01-05')
      },
      class: {
        id: 'class-3',
        name: 'Physics Laboratory',
        teacherName: 'Dr. Wilson',
        credits: 2
      },
      estimatedEnrollmentDate: new Date('2024-02-01')
    }
  ],
  availableClasses: [
    {
      id: 'class-4',
      name: 'English Literature',
      teacherName: 'Prof. Brown',
      credits: 3,
      availableSpots: 5,
      isEnrollmentOpen: true
    }
  ],
  enrollmentHistory: [
    {
      enrollment: {
        id: 'enroll-2',
        studentId: 'student-1',
        classId: 'class-5',
        status: 'completed',
        enrolledAt: new Date('2023-09-01'),
        credits: 3,
        grade: 'A',
        priority: 0,
        metadata: {},
        createdAt: new Date('2023-09-01'),
        updatedAt: new Date('2023-12-15')
      },
      class: {
        id: 'class-5',
        name: 'History 101',
        teacherName: 'Dr. Davis',
        credits: 3
      },
      auditLog: [
        {
          id: 'audit-1',
          studentId: 'student-1',
          classId: 'class-5',
          action: 'enrolled',
          timestamp: new Date('2023-09-01'),
          metadata: {}
        }
      ]
    }
  ],
  statistics: {
    totalCredits: 12,
    completedCredits: 9,
    currentGPA: 3.5,
    enrollmentTrend: 'stable'
  }
};

describe('StudentEnrollmentDashboard', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'student-1', email: 'student@test.com' },
      loading: false
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDashboardData
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);
    expect(screen.getByText('Loading enrollment data...')).toBeInTheDocument();
  });

  it('displays enrollment statistics correctly', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument(); // Current enrollments
      expect(screen.getByText('3.50')).toBeInTheDocument(); // GPA
    });
  });

  it('displays current enrollments with correct information', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    await waitFor(() => {
      expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      expect(screen.getByText('Dr. Smith • 3 credits')).toBeInTheDocument();
      expect(screen.getByText('enrolled')).toBeInTheDocument();
    });
  });

  it('shows drop and withdraw buttons for eligible enrollments', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    // Navigate to current classes tab
    await waitFor(() => {
      const currentTab = screen.getByText('Current Classes');
      fireEvent.click(currentTab);
    });

    await waitFor(() => {
      expect(screen.getByText('Drop')).toBeInTheDocument();
      expect(screen.getByText('Withdraw')).toBeInTheDocument();
    });
  });

  it('handles class dropping with confirmation', async () => {
    // Mock window.confirm
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);

    // Mock successful drop response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Successfully dropped from class' })
    });

    render(<StudentEnrollmentDashboard studentId="student-1" />);

    // Navigate to current classes tab
    await waitFor(() => {
      const currentTab = screen.getByText('Current Classes');
      fireEvent.click(currentTab);
    });

    await waitFor(() => {
      const dropButton = screen.getByText('Drop');
      fireEvent.click(dropButton);
    });

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to drop "Introduction to Computer Science"? This action cannot be undone.'
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/students/student-1/enrollments/class-1/drop',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Student initiated drop' })
        })
      );
    });

    // Restore original confirm
    window.confirm = originalConfirm;
  });

  it('displays pending requests correctly', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    // Switch to pending tab
    await waitFor(() => {
      const pendingTab = screen.getByText('Pending & Waitlist');
      fireEvent.click(pendingTab);
    });

    await waitFor(() => {
      expect(screen.getByText('Advanced Mathematics')).toBeInTheDocument();
      expect(screen.getByText('Prof. Johnson • Requested Jan 15, 2024')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
      expect(screen.getByText('2 days remaining')).toBeInTheDocument();
    });
  });

  it('displays waitlist entries with position and probability', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    // Switch to pending tab
    await waitFor(() => {
      const pendingTab = screen.getByText('Pending & Waitlist');
      fireEvent.click(pendingTab);
    });

    await waitFor(() => {
      expect(screen.getByText('Physics Laboratory')).toBeInTheDocument();
      expect(screen.getByText('Dr. Wilson • Position #3')).toBeInTheDocument();
      expect(screen.getByText('70% chance')).toBeInTheDocument();
    });
  });

  it('displays enrollment history', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    // Switch to history tab
    await waitFor(() => {
      const historyTab = screen.getByText('History');
      fireEvent.click(historyTab);
    });

    await waitFor(() => {
      expect(screen.getByText('History 101')).toBeInTheDocument();
      expect(screen.getByText('Dr. Davis • 3 credits')).toBeInTheDocument();
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('A')).toBeInTheDocument();
    });
  });

  it('shows upcoming deadlines in overview', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    await waitFor(() => {
      expect(screen.getByText('Upcoming Deadlines')).toBeInTheDocument();
      expect(screen.getByText('Last day to drop without penalty')).toBeInTheDocument();
      expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
    });
  });

  it('displays available classes for enrollment', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    await waitFor(() => {
      expect(screen.getByText('Available Classes')).toBeInTheDocument();
      expect(screen.getByText('English Literature')).toBeInTheDocument();
      expect(screen.getByText('Prof. Brown')).toBeInTheDocument();
      expect(screen.getByText('5 spots available')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<StudentEnrollmentDashboard studentId="student-1" />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles empty enrollment data', async () => {
    const emptyData = {
      currentEnrollments: [],
      pendingRequests: [],
      waitlistEntries: [],
      availableClasses: [],
      enrollmentHistory: [],
      statistics: {
        totalCredits: 0,
        completedCredits: 0,
        currentGPA: undefined,
        enrollmentTrend: 'stable'
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => emptyData
    });

    render(<StudentEnrollmentDashboard studentId="student-1" />);

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument(); // Current enrollments
      expect(screen.getByText('N/A')).toBeInTheDocument(); // GPA
    });

    // Switch to current tab
    const currentTab = screen.getByText('Current Classes');
    fireEvent.click(currentTab);

    await waitFor(() => {
      expect(screen.getByText('No current enrollments')).toBeInTheDocument();
    });
  });

  it('handles tab navigation correctly', async () => {
    render(<StudentEnrollmentDashboard studentId="student-1" />);

    await waitFor(() => {
      expect(screen.getByText('Upcoming Deadlines')).toBeInTheDocument();
    });

    // Navigate to current classes tab
    const currentTab = screen.getByText('Current Classes');
    fireEvent.click(currentTab);

    await waitFor(() => {
      expect(screen.getByText('Drop')).toBeInTheDocument();
      expect(screen.getByText('Withdraw')).toBeInTheDocument();
    });

    // Navigate to pending tab
    const pendingTab = screen.getByText('Pending & Waitlist');
    fireEvent.click(pendingTab);

    await waitFor(() => {
      expect(screen.getByText('Pending Enrollment Requests')).toBeInTheDocument();
    });

    // Navigate to history tab
    const historyTab = screen.getByText('History');
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('View enrollment history')).toBeInTheDocument();
    });
  });
});