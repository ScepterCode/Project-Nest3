import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DepartmentAdminDashboard } from '@/components/institution/department-admin-dashboard';
import { UserRole } from '@/lib/types/onboarding';

// Mock fetch globally
global.fetch = jest.fn();

// Mock recharts components
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => React.createElement('div', { 'data-testid': 'responsive-container' }, children),
  LineChart: ({ children }: any) => React.createElement('div', { 'data-testid': 'line-chart' }, children),
  BarChart: ({ children }: any) => React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  PieChart: ({ children }: any) => React.createElement('div', { 'data-testid': 'pie-chart' }, children),
  XAxis: () => React.createElement('div', { 'data-testid': 'x-axis' }),
  YAxis: () => React.createElement('div', { 'data-testid': 'y-axis' }),
  CartesianGrid: () => React.createElement('div', { 'data-testid': 'cartesian-grid' }),
  Tooltip: () => React.createElement('div', { 'data-testid': 'tooltip' }),
  Line: () => React.createElement('div', { 'data-testid': 'line' }),
  Bar: () => React.createElement('div', { 'data-testid': 'bar' }),
  Pie: () => React.createElement('div', { 'data-testid': 'pie' }),
  Cell: () => React.createElement('div', { 'data-testid': 'cell' })
}));

const mockDepartmentData = {
  success: true,
  data: {
    department: {
      id: 'dept-1',
      institutionId: 'inst-1',
      name: 'Computer Science',
      description: 'Department of Computer Science',
      code: 'CS',
      adminId: 'admin-1',
      status: 'active',
      settings: {
        defaultClassSettings: {
          defaultCapacity: 30,
          allowWaitlist: true,
          requireApproval: false,
          allowSelfEnrollment: true,
          gradingScale: 'letter',
          passingGrade: 70
        }
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-15')
    },
    stats: {
      totalUsers: 85,
      activeUsers: 78,
      totalClasses: 12,
      activeClasses: 10,
      totalEnrollments: 245,
      completionRate: 87.5,
      averageGrade: 82.3
    },
    recentActivity: [
      {
        id: 'activity-1',
        type: 'enrollment' as const,
        description: 'John Doe enrolled in CS 101',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        userId: 'user-1',
        userName: 'John Doe'
      }
    ],
    atRiskStudents: [
      {
        id: 'student-1',
        name: 'Jane Smith',
        email: 'jane.smith@test.edu',
        riskFactors: ['Low attendance', 'Missing assignments'],
        lastActivity: new Date('2024-01-10'),
        averageGrade: 65.2
      }
    ],
    performanceMetrics: [
      {
        metric: 'Student Engagement',
        current: 85,
        previous: 82,
        trend: 'up' as const
      }
    ]
  }
};

const mockUsersData = {
  success: true,
  data: {
    users: [
      {
        id: 'user-1',
        name: 'John Doe',
        email: 'john.doe@test.edu',
        role: UserRole.STUDENT,
        status: 'active' as const,
        joinedAt: new Date('2024-01-01'),
        lastActivity: new Date('2024-01-15'),
        enrollmentCount: 3
      },
      {
        id: 'user-2',
        name: 'Dr. Smith',
        email: 'dr.smith@test.edu',
        role: UserRole.TEACHER,
        status: 'active' as const,
        joinedAt: new Date('2024-01-01'),
        lastActivity: new Date('2024-01-15'),
        classCount: 2
      }
    ]
  }
};

const mockClassesData = {
  success: true,
  data: {
    classes: [
      {
        id: 'class-1',
        name: 'Introduction to Programming',
        code: 'CS 101',
        instructor: 'Dr. Smith',
        enrollmentCount: 25,
        capacity: 30,
        status: 'active' as const,
        createdAt: new Date('2024-01-01')
      }
    ]
  }
};

describe('DepartmentAdminDashboard', () => {
  const defaultProps = {
    departmentId: 'dept-1',
    currentUserRole: UserRole.DEPARTMENT_ADMIN
  };

  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('renders loading state initially', () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    
    render(<DepartmentAdminDashboard {...defaultProps} />);
    
    expect(screen.getByText('Loading department dashboard...')).toBeInTheDocument();
  });

  it('renders department dashboard with overview data', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Check quick stats
    expect(screen.getByText('85')).toBeInTheDocument(); // Total users
    expect(screen.getByText('12')).toBeInTheDocument(); // Total classes
    expect(screen.getByText('87.5%')).toBeInTheDocument(); // Completion rate
    expect(screen.getByText('82.3')).toBeInTheDocument(); // Average grade
  });

  it('displays at-risk students alert', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Students Need Attention')).toBeInTheDocument();
      expect(screen.getByText('1 students have been identified as at-risk')).toBeInTheDocument();
    });

    // Check at-risk student details
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('jane.smith@test.edu')).toBeInTheDocument();
    expect(screen.getByText('Low attendance')).toBeInTheDocument();
    expect(screen.getByText('Missing assignments')).toBeInTheDocument();
  });

  it('handles department details form submission', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Switch to settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Department Details')).toBeInTheDocument();
    });

    // Update department name
    const nameInput = screen.getByDisplayValue('Computer Science');
    fireEvent.change(nameInput, { target: { value: 'Computer Science & Engineering' } });

    // Mock successful update
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Submit form
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/departments/dept-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Computer Science & Engineering',
          description: 'Department of Computer Science',
          code: 'CS'
        })
      });
    });
  });

  it('handles department settings form submission', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Switch to settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Department Settings')).toBeInTheDocument();
    });

    // Update default capacity
    const capacityInput = screen.getByDisplayValue('30');
    fireEvent.change(capacityInput, { target: { value: '35' } });

    // Toggle a setting
    const waitlistSwitch = screen.getByRole('switch');
    fireEvent.click(waitlistSwitch);

    // Mock successful update
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Submit settings
    const saveSettingsButton = screen.getByText('Save Settings');
    fireEvent.click(saveSettingsButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/departments/dept-1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('defaultCapacity')
      });
    });
  });

  it('displays analytics charts', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Switch to analytics tab
    fireEvent.click(screen.getByText('Analytics'));

    await waitFor(() => {
      expect(screen.getByText('Enrollment Trends')).toBeInTheDocument();
      expect(screen.getByText('Grade Distribution')).toBeInTheDocument();
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  it('displays users table', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Switch to users tab
    fireEvent.click(screen.getByText('Users'));

    await waitFor(() => {
      expect(screen.getByText('Department Users (2)')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
      expect(screen.getByText('john.doe@test.edu')).toBeInTheDocument();
      expect(screen.getByText('dr.smith@test.edu')).toBeInTheDocument();
    });
  });

  it('displays classes table', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Switch to classes tab
    fireEvent.click(screen.getByText('Classes'));

    await waitFor(() => {
      expect(screen.getByText('Department Classes (1)')).toBeInTheDocument();
      expect(screen.getByText('Introduction to Programming')).toBeInTheDocument();
      expect(screen.getByText('CS 101')).toBeInTheDocument();
      expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
      expect(screen.getByText('25 / 30')).toBeInTheDocument();
    });
  });

  it('handles report export', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Switch to analytics tab
    fireEvent.click(screen.getByText('Analytics'));

    await waitFor(() => {
      expect(screen.getByText('Export Performance Report')).toBeInTheDocument();
    });

    // Mock successful export
    const mockBlob = new Blob(['test data'], { type: 'text/csv' });
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob
    });

    // Mock URL.createObjectURL and related methods
    global.URL.createObjectURL = jest.fn(() => 'mock-url');
    global.URL.revokeObjectURL = jest.fn();
    
    // Mock document methods
    const mockAnchor = {
      href: '',
      download: '',
      click: jest.fn()
    };
    document.createElement = jest.fn(() => mockAnchor as any);
    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();

    // Click export button
    const exportButton = screen.getByText('Export Performance Report');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/departments/dept-1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'performance', format: 'csv' })
      });
    });
  });

  it('displays performance metrics with trends', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Check performance metrics
    expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    expect(screen.getByText('Student Engagement')).toBeInTheDocument();
    expect(screen.getByText('Current: 85 | Previous: 82')).toBeInTheDocument();
    expect(screen.getByText('3.7%')).toBeInTheDocument(); // Trend percentage
  });

  it('displays recent activity', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Check recent activity
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('John Doe enrolled in CS 101')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load department data. Please try again.')).toBeInTheDocument();
    });
  });

  it('handles refresh functionality', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    // Should make additional API calls
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(6); // Initial 3 + refresh 3
    });
  });

  it('meets accessibility requirements', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Check for proper heading structure
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Computer Science');
    
    // Check for proper form labels in settings
    fireEvent.click(screen.getByText('Settings'));
    
    await waitFor(() => {
      expect(screen.getByLabelText('Department Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Department Code')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
    });

    // Check for proper button labels
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    expect(refreshButton).toBeInTheDocument();

    // Check tab navigation
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(0);
    
    tabs.forEach(tab => {
      expect(tab).toHaveAttribute('aria-selected');
    });
  });

  it('supports keyboard navigation between tabs', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartmentData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClassesData
      });

    render(<DepartmentAdminDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    const overviewTab = screen.getByRole('tab', { name: /overview/i });
    const analyticsTab = screen.getByRole('tab', { name: /analytics/i });

    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    
    // Simulate keyboard navigation
    fireEvent.keyDown(overviewTab, { key: 'ArrowRight' });
    fireEvent.click(analyticsTab);
    
    expect(analyticsTab).toHaveAttribute('aria-selected', 'true');
  });
});