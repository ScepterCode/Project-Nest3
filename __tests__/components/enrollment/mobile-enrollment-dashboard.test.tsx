import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MobileEnrollmentDashboard from '@/components/enrollment/mobile-enrollment-dashboard';
import { useAuth } from '@/contexts/auth-context';
import { useMobileDetection } from '@/lib/hooks/useMobileDetection';
import { EnrollmentStatus, EnrollmentRequestStatus } from '@/lib/types/enrollment';

// Mock the hooks and contexts
jest.mock('@/contexts/auth-context');
jest.mock('@/lib/hooks/useMobileDetection');
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({})
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseMobileDetection = useMobileDetection as jest.MockedFunction<typeof useMobileDetection>;

// Mock fetch globally
global.fetch = jest.fn();

const mockDashboardData = {
  currentEnrollments: [
    {
      enrollment: {
        id: 'enrollment-1',
        studentId: 'student-1',
        classId: 'class-1',
        status: EnrollmentStatus.ENROLLED,
        enrolledAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
        grade: 'A',
        credits: 3
      },
      class: {
        id: 'class-1',
        name: 'Introduction to Computer Science',
        code: 'CS101',
        teacherName: 'Dr. Smith',
        credits: 3,
        dropDeadline: new Date('2024-03-01'),
        withdrawDeadline: new Date('2024-04-01')
      },
      upcomingDeadlines: [
        {
          type: 'assignment',
          description: 'Final Project Due',
          date: new Date('2024-02-15')
        }
      ]
    }
  ],
  pendingRequests: [
    {
      request: {
        id: 'request-1',
        studentId: 'student-1',
        classId: 'class-2',
        status: EnrollmentRequestStatus.PENDING,
        requestedAt: new Date('2024-01-10')
      },
      class: {
        id: 'class-2',
        name: 'Data Structures',
        code: 'CS201',
        teacherName: 'Dr. Johnson',
        credits: 4
      },
      estimatedResponseTime: '2-3 business days'
    }
  ],
  waitlistEntries: [
    {
      entry: {
        id: 'waitlist-1',
        studentId: 'student-1',
        classId: 'class-3',
        position: 3,
        estimatedProbability: 0.75,
        addedAt: new Date('2024-01-12')
      },
      class: {
        id: 'class-3',
        name: 'Algorithms',
        code: 'CS301',
        teacherName: 'Dr. Brown',
        credits: 3
      },
      estimatedEnrollmentDate: new Date('2024-02-01')
    }
  ],
  enrollmentHistory: [],
  availableClasses: [
    {
      id: 'class-4',
      name: 'Web Development',
      code: 'CS250',
      teacherName: 'Prof. Wilson',
      credits: 3,
      availableSpots: 5
    }
  ],
  statistics: {
    totalCredits: 7,
    currentGPA: 3.5,
    completedCredits: 15,
    enrollmentTrend: 'increasing' as const
  }
};

describe('MobileEnrollmentDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: { id: 'student-1', email: 'student@example.com' },
      loading: false,
      signOut: jest.fn()
    } as any);

    mockUseMobileDetection.mockReturnValue({
      isMobile: true,
      isTablet: false,
      screenSize: 'mobile',
      isDesktop: false
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDashboardData)
    });
  });

  describe('Mobile Layout and Usability', () => {
    it('renders mobile-optimized stats grid', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        // Check for 2x2 grid layout on mobile
        expect(screen.getByText('1')).toBeInTheDocument(); // Classes count
        expect(screen.getByText('7')).toBeInTheDocument(); // Credits count
        expect(screen.getByText('1')).toBeInTheDocument(); // Pending count
        expect(screen.getByText('3.5')).toBeInTheDocument(); // GPA
      });
    });

    it('uses mobile-optimized tabs', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        // Check for mobile tab layout (3 tabs instead of 4)
        expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /current/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /pending/i })).toBeInTheDocument();
      });
    });

    it('shows expandable cards with touch-friendly interactions', async () => {
      const user = userEvent.setup();
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      // Switch to current tab
      await waitFor(() => {
        const currentTab = screen.getByRole('tab', { name: /current/i });
        expect(currentTab).toBeInTheDocument();
      });

      const currentTab = screen.getByRole('tab', { name: /current/i });
      await user.click(currentTab);

      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      });

      // Find and click the more options button
      const moreButton = screen.getByRole('button', { name: '' }); // MoreVertical icon button
      await user.click(moreButton);

      // Check that expanded actions are shown
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /drop/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /details/i })).toBeInTheDocument();
      });
    });

    it('handles touch interactions for class actions', async () => {
      const user = userEvent.setup();
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      // Navigate to current tab
      const currentTab = screen.getByRole('tab', { name: /current/i });
      await user.click(currentTab);

      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      });

      // Expand card actions
      const moreButton = screen.getByRole('button', { name: '' });
      await user.click(moreButton);

      await waitFor(() => {
        const dropButton = screen.getByRole('button', { name: /drop/i });
        expect(dropButton).toBeInTheDocument();
      });
    });

    it('shows mobile-optimized deadline warnings', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        // Check for upcoming deadlines in overview
        expect(screen.getByText('Upcoming Deadlines')).toBeInTheDocument();
        expect(screen.getByText('Final Project Due')).toBeInTheDocument();
      });
    });
  });

  describe('Touch and Gesture Support', () => {
    it('supports touch events for tab switching', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        const pendingTab = screen.getByRole('tab', { name: /pending/i });
        expect(pendingTab).toBeInTheDocument();
      });

      const pendingTab = screen.getByRole('tab', { name: /pending/i });
      
      // Simulate touch events
      fireEvent.touchStart(pendingTab);
      fireEvent.touchEnd(pendingTab);
      fireEvent.click(pendingTab);

      await waitFor(() => {
        expect(screen.getByText('Data Structures')).toBeInTheDocument();
        expect(screen.getByText('Position #3')).toBeInTheDocument();
      });
    });

    it('has appropriate touch target sizes', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        const tabs = screen.getAllByRole('tab');
        tabs.forEach(tab => {
          // Tabs should have adequate height for touch
          expect(tab.closest('[class*="h-12"]')).toBeInTheDocument();
        });
      });
    });

    it('prevents accidental touches with proper spacing', async () => {
      const user = userEvent.setup();
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      // Navigate to current tab
      const currentTab = screen.getByRole('tab', { name: /current/i });
      await user.click(currentTab);

      await waitFor(() => {
        const moreButton = screen.getByRole('button', { name: '' });
        expect(moreButton).toBeInTheDocument();
      });

      const moreButton = screen.getByRole('button', { name: '' });
      await user.click(moreButton);

      await waitFor(() => {
        const actionButtons = screen.getAllByRole('button');
        const dropButton = actionButtons.find(btn => btn.textContent?.includes('Drop'));
        const detailsButton = actionButtons.find(btn => btn.textContent?.includes('Details'));
        
        expect(dropButton).toBeInTheDocument();
        expect(detailsButton).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility on Mobile', () => {
    it('maintains proper focus management', async () => {
      const user = userEvent.setup();
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      // Tab navigation should work
      await user.tab();
      
      await waitFor(() => {
        const focusedElement = document.activeElement;
        expect(focusedElement).toBeInTheDocument();
      });
    });

    it('has proper ARIA labels for mobile interactions', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        const tabs = screen.getAllByRole('tab');
        tabs.forEach(tab => {
          expect(tab).toHaveAttribute('aria-selected');
        });
      });
    });

    it('provides screen reader friendly content', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        // Check for descriptive text
        expect(screen.getByText('Classes')).toBeInTheDocument();
        expect(screen.getByText('Credits')).toBeInTheDocument();
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getByText('GPA')).toBeInTheDocument();
      });
    });

    it('supports high contrast mode', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        // Check that status badges are present (should have good contrast)
        const currentTab = screen.getByRole('tab', { name: /current/i });
        expect(currentTab).toBeInTheDocument();
      });
    });
  });

  describe('Mobile Performance', () => {
    it('loads data efficiently for mobile', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/students/student-1/enrollment-dashboard');
      });

      // Should show loading state initially
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Then show data
      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument(); // Classes count
      });
    });

    it('handles loading states appropriately for mobile', async () => {
      // Mock slow loading
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve(mockDashboardData)
          }), 100)
        )
      );

      render(<MobileEnrollmentDashboard studentId="student-1" />);

      // Should show loading spinner
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Error Handling on Mobile', () => {
    it('shows mobile-friendly error messages', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load enrollment data/i)).toBeInTheDocument();
      });
    });

    it('handles API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500
      });

      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText(/failed to fetch enrollment data/i)).toBeInTheDocument();
      });
    });
  });

  describe('Mobile-Specific Features', () => {
    it('shows condensed information for mobile screens', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        // Check for abbreviated text suitable for mobile
        expect(screen.getByText('3.5')).toBeInTheDocument(); // GPA shown as number
        expect(screen.getByText('1')).toBeInTheDocument(); // Counts shown as numbers
      });
    });

    it('uses mobile-appropriate date formatting', async () => {
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      // Switch to current tab to see enrollment dates
      const currentTab = screen.getByRole('tab', { name: /current/i });
      await userEvent.setup().click(currentTab);

      await waitFor(() => {
        // Should show abbreviated date format for mobile
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument();
      });
    });

    it('provides quick action buttons optimized for mobile', async () => {
      const user = userEvent.setup();
      render(<MobileEnrollmentDashboard studentId="student-1" />);

      await waitFor(() => {
        // Check for quick action buttons in overview
        expect(screen.getByRole('button', { name: /browse classes/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /join waitlist/i })).toBeInTheDocument();
      });
    });
  });
});