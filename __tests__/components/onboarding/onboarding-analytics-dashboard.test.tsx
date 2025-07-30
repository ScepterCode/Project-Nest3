import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingAnalyticsDashboard } from '@/components/onboarding/onboarding-analytics-dashboard';

// Mock fetch
global.fetch = jest.fn();

const mockMetrics = {
  totalSessions: 100,
  completedSessions: 75,
  completionRate: 75.0,
  averageCompletionTime: 45,
  dropOffByStep: {
    step_2: 15.5,
    step_3: 9.5
  },
  completionByRole: {
    student: { started: 60, completed: 50, rate: 83.33 },
    teacher: { started: 30, completed: 20, rate: 66.67 },
    department_admin: { started: 10, completed: 5, rate: 50.0 }
  },
  dailyTrends: []
};

const mockStepAnalytics = [
  {
    stepName: 'role-selection',
    stepNumber: 1,
    totalStarted: 100,
    totalCompleted: 95,
    totalSkipped: 0,
    totalAbandoned: 5,
    completionRate: 95.0,
    averageTimeSpent: 120
  },
  {
    stepName: 'institution-setup',
    stepNumber: 2,
    totalStarted: 95,
    totalCompleted: 80,
    totalSkipped: 10,
    totalAbandoned: 5,
    completionRate: 84.21,
    averageTimeSpent: 180
  }
];

describe('OnboardingAnalyticsDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockMetrics })
        });
      } else if (url.includes('/steps')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockStepAnalytics })
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  it('should render loading state initially', () => {
    render(<OnboardingAnalyticsDashboard />);
    
    expect(screen.getByText('Onboarding Analytics')).toBeInTheDocument();
    // Check for loading animation
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('should display metrics after loading', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument(); // Total sessions
      expect(screen.getByText('75')).toBeInTheDocument(); // Completed sessions
      expect(screen.getByText('75.0%')).toBeInTheDocument(); // Completion rate
      expect(screen.getByText('45m')).toBeInTheDocument(); // Average time
    });
  });

  it('should display completion by role', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('student')).toBeInTheDocument();
      expect(screen.getByText('teacher')).toBeInTheDocument();
      expect(screen.getByText('department admin')).toBeInTheDocument();
      expect(screen.getByText('83.3%')).toBeInTheDocument(); // Student completion rate
      expect(screen.getByText('66.7%')).toBeInTheDocument(); // Teacher completion rate
      expect(screen.getByText('50.0%')).toBeInTheDocument(); // Admin completion rate
    });
  });

  it('should display step analytics', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Step 1: Role Selection')).toBeInTheDocument();
      expect(screen.getByText('Step 2: Institution Setup')).toBeInTheDocument();
      expect(screen.getByText('95.0%')).toBeInTheDocument(); // Role selection completion rate
      expect(screen.getByText('84.2%')).toBeInTheDocument(); // Institution setup completion rate
    });
  });

  it('should display drop-off points', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Drop-off Points')).toBeInTheDocument();
      expect(screen.getByText('step 2')).toBeInTheDocument();
      expect(screen.getByText('step 3')).toBeInTheDocument();
      expect(screen.getByText('15.5%')).toBeInTheDocument();
      expect(screen.getByText('9.5%')).toBeInTheDocument();
    });
  });

  it('should handle filter changes', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    });

    const fromDateInput = screen.getByLabelText('From Date') as HTMLInputElement;
    const roleSelect = screen.getByRole('combobox');

    fireEvent.change(fromDateInput, { target: { value: '2024-01-01' } });
    expect(fromDateInput.value).toBe('2024-01-01');

    fireEvent.click(roleSelect);
    await waitFor(() => {
      expect(screen.getByText('Student')).toBeInTheDocument();
    });
  });

  it('should apply filters when Apply button is clicked', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Apply')).toBeInTheDocument();
    });

    const applyButton = screen.getByText('Apply');
    fireEvent.click(applyButton);

    // Should trigger new fetch calls
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4); // Initial load (2) + Apply (2)
    });
  });

  it('should reset filters when Reset button is clicked', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Reset')).toBeInTheDocument();
    });

    // Change a filter first
    const fromDateInput = screen.getByLabelText('From Date') as HTMLInputElement;
    fireEvent.change(fromDateInput, { target: { value: '2024-01-01' } });

    // Reset filters
    const resetButton = screen.getByText('Reset');
    fireEvent.click(resetButton);

    // Should reset to default date range (last 30 days)
    const expectedDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    expect(fromDateInput.value).toBe(expectedDate);
  });

  it('should handle API errors gracefully', async () => {
    (fetch as jest.Mock).mockImplementation(() => 
      Promise.resolve({
        ok: false,
        status: 500
      })
    );

    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading analytics/)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('should refresh data when Refresh button is clicked', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    // Should trigger new fetch calls
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4); // Initial load (2) + Refresh (2)
    });
  });

  it('should format time correctly', async () => {
    const longTimeMetrics = {
      ...mockMetrics,
      averageCompletionTime: 125 // 2h 5m
    };

    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: longTimeMetrics })
        });
      } else if (url.includes('/steps')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockStepAnalytics })
        });
      }
    });

    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('2h 5m')).toBeInTheDocument();
    });
  });

  it('should show appropriate badges for step completion rates', async () => {
    render(<OnboardingAnalyticsDashboard />);

    await waitFor(() => {
      const badges = document.querySelectorAll('[data-testid="badge"], .bg-primary, .bg-secondary, .bg-destructive');
      expect(badges.length).toBeGreaterThan(0);
    });
  });
});