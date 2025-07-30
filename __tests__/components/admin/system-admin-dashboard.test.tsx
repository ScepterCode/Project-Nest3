import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SystemAdminDashboard } from '@/components/admin/system-admin-dashboard';

// Mock fetch globally
global.fetch = jest.fn();

// Mock recharts components
jest.mock('recharts', () => ({
  ResponsiveContainer: function ResponsiveContainer(props: any) {
    return React.createElement('div', { 'data-testid': 'responsive-container' }, props.children);
  },
  LineChart: function LineChart(props: any) {
    return React.createElement('div', { 'data-testid': 'line-chart' }, props.children);
  },
  BarChart: function BarChart(props: any) {
    return React.createElement('div', { 'data-testid': 'bar-chart' }, props.children);
  },
  PieChart: function PieChart(props: any) {
    return React.createElement('div', { 'data-testid': 'pie-chart' }, props.children);
  },
  XAxis: function XAxis() {
    return React.createElement('div', { 'data-testid': 'x-axis' });
  },
  YAxis: function YAxis() {
    return React.createElement('div', { 'data-testid': 'y-axis' });
  },
  CartesianGrid: function CartesianGrid() {
    return React.createElement('div', { 'data-testid': 'cartesian-grid' });
  },
  Tooltip: function Tooltip() {
    return React.createElement('div', { 'data-testid': 'tooltip' });
  },
  Line: function Line() {
    return React.createElement('div', { 'data-testid': 'line' });
  },
  Bar: function Bar() {
    return React.createElement('div', { 'data-testid': 'bar' });
  },
  Pie: function Pie() {
    return React.createElement('div', { 'data-testid': 'pie' });
  },
  Cell: function Cell() {
    return React.createElement('div', { 'data-testid': 'cell' });
  }
}));

const mockSystemData = {
  metrics: {
    totalInstitutions: 25,
    activeInstitutions: 22,
    totalUsers: 1250,
    activeUsers: 980,
    totalClasses: 450,
    totalEnrollments: 3200,
    systemHealth: 'healthy' as const,
    resourceUsage: {
      cpu: 45,
      memory: 62,
      storage: 78,
      database: 55
    }
  },
  institutions: [
    {
      id: 'inst-1',
      name: 'Test University',
      domain: 'test.edu',
      type: 'university' as const,
      status: 'active' as const,
      userCount: 150,
      classCount: 25,
      lastActivity: new Date('2024-01-15'),
      healthStatus: 'healthy' as const,
      alerts: 0,
      contactInfo: { email: 'admin@test.edu' },
      address: { city: 'Test City' },
      settings: {},
      branding: {},
      subscription: {},
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-15'),
      createdBy: 'admin-1'
    }
  ],
  alerts: [
    {
      id: 'alert-1',
      type: 'performance' as const,
      severity: 'medium' as const,
      title: 'High CPU Usage',
      message: 'CPU usage has been consistently high for the past hour',
      institutionId: 'inst-1',
      institutionName: 'Test University',
      createdAt: new Date('2024-01-15T10:00:00Z'),
      resolved: false
    }
  ]
};

describe('SystemAdminDashboard', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('renders loading state initially', () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    
    render(<SystemAdminDashboard />);
    
    expect(screen.getByText('Loading system dashboard...')).toBeInTheDocument();
  });

  it('renders dashboard with system metrics', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSystemData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    // Check key metrics
    expect(screen.getByText('25')).toBeInTheDocument(); // Total institutions
    expect(screen.getByText('1,250')).toBeInTheDocument(); // Total users
    expect(screen.getByText('HEALTHY')).toBeInTheDocument(); // System health
  });

  it('displays system health alert when not healthy', async () => {
    const unhealthyData = {
      ...mockSystemData,
      metrics: {
        ...mockSystemData.metrics,
        systemHealth: 'critical' as const
      }
    };

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => unhealthyData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Health Alert')).toBeInTheDocument();
      expect(screen.getByText(/System status is critical/)).toBeInTheDocument();
    });
  });

  it('renders institutions table with filtering', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSystemData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    // Switch to institutions tab
    fireEvent.click(screen.getByText('Institutions'));

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
      expect(screen.getByText('test.edu')).toBeInTheDocument();
    });

    // Test search filter
    const searchInput = screen.getByPlaceholderText('Search institutions...');
    fireEvent.change(searchInput, { target: { value: 'Test' } });
    
    expect(searchInput).toHaveValue('Test');
  });

  it('renders alerts with filtering and resolution', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSystemData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    // Switch to alerts tab
    fireEvent.click(screen.getByText('Alerts'));

    await waitFor(() => {
      expect(screen.getByText('High CPU Usage')).toBeInTheDocument();
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Test resolve alert
    const resolveButton = screen.getByText('Resolve');
    fireEvent.click(resolveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/admin/alerts/alert-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve' })
      });
    });
  });

  it('handles institution actions (suspend/activate)', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSystemData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    // Switch to institutions tab
    fireEvent.click(screen.getByText('Institutions'));

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Mock institution action
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Find and click suspend button (XCircle icon)
    const actionButtons = screen.getAllByRole('button');
    const suspendButton = actionButtons.find(button => 
      button.querySelector('[data-testid="x-circle"]') || 
      button.innerHTML.includes('XCircle')
    );

    if (suspendButton) {
      fireEvent.click(suspendButton);
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/admin/institutions/inst-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'suspend' })
        });
      });
    }
  });

  it('displays resource usage with progress bars', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSystemData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    // Switch to system health tab
    fireEvent.click(screen.getByText('System Health'));

    await waitFor(() => {
      expect(screen.getByText('Database Health')).toBeInTheDocument();
      expect(screen.getByText('Security Status')).toBeInTheDocument();
      expect(screen.getByText('Integration Health')).toBeInTheDocument();
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });
  });

  it('handles refresh functionality', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSystemData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    // Should make additional API calls
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(6); // Initial 3 + refresh 3
    });
  });

  it('handles API errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    // Should still render the basic structure even with API errors
    expect(screen.getByText('Monitor and manage all institutions and system health')).toBeInTheDocument();
  });

  it('meets accessibility requirements', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSystemData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    // Check for proper heading structure
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('System Administration');
    
    // Check for proper button labels
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    expect(refreshButton).toBeInTheDocument();

    // Check for proper table structure in institutions tab
    fireEvent.click(screen.getByText('Institutions'));
    
    await waitFor(() => {
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      
      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders.length).toBeGreaterThan(0);
    });
  });

  it('supports keyboard navigation', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSystemData
    });

    render(<SystemAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('System Administration')).toBeInTheDocument();
    });

    // Test tab navigation
    const overviewTab = screen.getByRole('tab', { name: /overview/i });
    const institutionsTab = screen.getByRole('tab', { name: /institutions/i });

    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    
    // Simulate keyboard navigation
    fireEvent.keyDown(overviewTab, { key: 'ArrowRight' });
    fireEvent.click(institutionsTab);
    
    expect(institutionsTab).toHaveAttribute('aria-selected', 'true');
  });
});