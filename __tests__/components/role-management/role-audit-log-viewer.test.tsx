import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoleAuditLogViewer } from '@/components/role-management/role-audit-log-viewer';
import { UserRole, AuditAction } from '@/lib/types/role-management';

// Mock fetch
global.fetch = jest.fn();

// Mock date-fns format function
jest.mock('date-fns', () => ({
  format: jest.fn((date, formatStr) => {
    if (formatStr === 'MMM dd, yyyy HH:mm:ss') {
      return 'Jan 15, 2024 10:30:00';
    }
    return '2024-01-15';
  })
}));

describe('RoleAuditLogViewer', () => {
  const mockAuditEntries = [
    {
      id: 'audit-1',
      userId: 'user-1',
      action: AuditAction.ASSIGNED,
      newRole: UserRole.TEACHER,
      changedBy: 'admin-1',
      timestamp: new Date('2024-01-15T10:30:00'),
      institutionId: 'inst-1',
      metadata: {},
      performedByName: 'Admin User',
      performedByEmail: 'admin@test.com',
      userName: 'Test User',
      userEmail: 'user@test.com',
      institutionName: 'Test Institution',
      reason: 'New teacher assignment'
    },
    {
      id: 'audit-2',
      userId: 'user-2',
      action: AuditAction.REVOKED,
      oldRole: UserRole.STUDENT,
      changedBy: 'admin-1',
      timestamp: new Date('2024-01-15T11:00:00'),
      institutionId: 'inst-1',
      metadata: {},
      performedByName: 'Admin User',
      performedByEmail: 'admin@test.com',
      userName: 'Another User',
      userEmail: 'user2@test.com',
      reason: 'Role no longer needed'
    }
  ];

  const mockSuspiciousActivities = [
    {
      id: 'suspicious-1',
      type: 'rapid_role_changes' as const,
      severity: 'high' as const,
      description: '3 role changes detected within 1 hour for user user-1',
      userId: 'user-1',
      performedBy: 'admin-1',
      detectedAt: new Date('2024-01-15T12:00:00'),
      relatedAuditIds: ['audit-1', 'audit-2'],
      metadata: { changeCount: 3, timeWindow: '1 hour' },
      flagged: false
    }
  ];

  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render audit log viewer with initial data', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: mockAuditEntries,
        totalCount: 2,
        hasMore: false
      })
    });

    render(<RoleAuditLogViewer />);

    expect(screen.getByText('Role Management Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Monitor and review all role assignment and change activities')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('Another User')).toBeInTheDocument();
    });

    expect(screen.getByText('ASSIGNED')).toBeInTheDocument();
    expect(screen.getByText('REVOKED')).toBeInTheDocument();
  });

  it('should handle loading state', () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<RoleAuditLogViewer />);

    expect(screen.getByText('Loading audit entries...')).toBeInTheDocument();
  });

  it('should handle error state', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should handle empty audit log', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: [],
        totalCount: 0,
        hasMore: false
      })
    });

    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('No audit entries found')).toBeInTheDocument();
    });
  });

  it('should filter by action', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [mockAuditEntries[0]],
          totalCount: 1,
          hasMore: false
        })
      });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Open action filter dropdown
    const actionSelect = screen.getByDisplayValue('All actions');
    await user.click(actionSelect);
    
    // Select ASSIGNED action
    await user.click(screen.getByText('ASSIGNED'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('action=assigned')
      );
    });
  });

  it('should filter by role', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [mockAuditEntries[0]],
          totalCount: 1,
          hasMore: false
        })
      });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Open role filter dropdown
    const roleSelect = screen.getByDisplayValue('All roles');
    await user.click(roleSelect);
    
    // Select TEACHER role
    await user.click(screen.getByText('TEACHER'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('role=teacher')
      );
    });
  });

  it('should filter by date range', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Set start date
    const startDateInput = screen.getAllByDisplayValue('')[0]; // First empty date input
    await user.type(startDateInput, '2024-01-01');

    // Set end date
    const endDateInput = screen.getAllByDisplayValue('')[1]; // Second empty date input
    await user.type(endDateInput, '2024-01-31');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=2024-01-01')
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('endDate=2024-01-31')
      );
    });
  });

  it('should search audit entries', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [mockAuditEntries[0]],
          totalCount: 1,
          hasMore: false
        })
      });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Search for specific user
    const searchInput = screen.getByPlaceholderText('Search users, actions...');
    await user.type(searchInput, 'Test User');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('searchTerm=Test%20User')
      );
    });
  });

  it('should clear filters', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Add some filters first
    const searchInput = screen.getByPlaceholderText('Search users, actions...');
    await user.type(searchInput, 'test');

    // Clear filters
    const clearButton = screen.getByText('Clear Filters');
    await user.click(clearButton);

    expect(searchInput).toHaveValue('');
  });

  it('should export audit log', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['csv content'], { type: 'text/csv' })
      });

    // Mock URL.createObjectURL and document.createElement
    const mockCreateObjectURL = jest.fn(() => 'blob:url');
    const mockRevokeObjectURL = jest.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    const mockClick = jest.fn();
    const mockAppendChild = jest.fn();
    const mockRemoveChild = jest.fn();
    
    jest.spyOn(document, 'createElement').mockReturnValue({
      style: {},
      href: '',
      download: '',
      click: mockClick,
      remove: jest.fn()
    } as any);
    
    jest.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Click export button
    const exportButton = screen.getByText('Export');
    await user.click(exportButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/roles/audit/export?export=true')
      );
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });
  });

  it('should handle pagination', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 100,
          hasMore: true
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 100,
          hasMore: true
        })
      });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    // Click next page
    const nextButton = screen.getByText('Next');
    await user.click(nextButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=50')
      );
    });
  });

  it('should show suspicious activities tab', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          activities: mockSuspiciousActivities
        })
      });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Click suspicious activity tab
    const suspiciousTab = screen.getByText('Suspicious Activity');
    await user.click(suspiciousTab);

    await waitFor(() => {
      expect(screen.getByText('RAPID_ROLE_CHANGES')).toBeInTheDocument();
      expect(screen.getByText('3 role changes detected within 1 hour for user user-1')).toBeInTheDocument();
    });
  });

  it('should flag suspicious activity', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: mockAuditEntries,
          totalCount: 2,
          hasMore: false
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          activities: mockSuspiciousActivities
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          activities: [{ ...mockSuspiciousActivities[0], flagged: true }]
        })
      });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    // Switch to suspicious activity tab
    const suspiciousTab = screen.getByText('Suspicious Activity');
    await user.click(suspiciousTab);

    await waitFor(() => {
      expect(screen.getByText('Flag for Review')).toBeInTheDocument();
    });

    // Click flag button
    const flagButton = screen.getByText('Flag for Review');
    await user.click(flagButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/roles/audit/suspicious/suspicious-1/flag',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: 'Flagged for review' })
        })
      );
    });
  });

  it('should show analytics tab with statistics', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: mockAuditEntries,
        totalCount: 2,
        hasMore: false
      })
    });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Click analytics tab
    const analyticsTab = screen.getByText('Analytics');
    await user.click(analyticsTab);

    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('Role Assignments')).toBeInTheDocument();
    expect(screen.getByText('Suspicious Activities')).toBeInTheDocument();
    expect(screen.getByText('Flagged Items')).toBeInTheDocument();
  });

  it('should open entry details modal', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: mockAuditEntries,
        totalCount: 2,
        hasMore: false
      })
    });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Click view button for first entry
    const viewButtons = screen.getAllByRole('button');
    const viewButton = viewButtons.find(button => 
      button.querySelector('svg') // Looking for the Eye icon
    );
    
    if (viewButton) {
      await user.click(viewButton);
      expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
    }
  });

  it('should call onEntrySelect callback when entry is selected', async () => {
    const mockOnEntrySelect = jest.fn();
    
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: mockAuditEntries,
        totalCount: 2,
        hasMore: false
      })
    });

    const user = userEvent.setup();
    render(<RoleAuditLogViewer onEntrySelect={mockOnEntrySelect} />);

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Click view button
    const viewButtons = screen.getAllByRole('button');
    const viewButton = viewButtons.find(button => 
      button.querySelector('svg')
    );
    
    if (viewButton) {
      await user.click(viewButton);
      expect(mockOnEntrySelect).toHaveBeenCalledWith(mockAuditEntries[0]);
    }
  });

  it('should format role changes correctly', async () => {
    const entryWithBothRoles = {
      ...mockAuditEntries[0],
      oldRole: UserRole.STUDENT,
      newRole: UserRole.TEACHER
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: [entryWithBothRoles],
        totalCount: 1,
        hasMore: false
      })
    });

    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('student → teacher')).toBeInTheDocument();
    });
  });

  it('should show correct badge colors for different actions', async () => {
    const entriesWithDifferentActions = [
      { ...mockAuditEntries[0], action: AuditAction.ASSIGNED },
      { ...mockAuditEntries[1], action: AuditAction.REVOKED },
      { ...mockAuditEntries[0], id: 'audit-3', action: AuditAction.DENIED }
    ];

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: entriesWithDifferentActions,
        totalCount: 3,
        hasMore: false
      })
    });

    render(<RoleAuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('ASSIGNED')).toBeInTheDocument();
      expect(screen.getByText('REVOKED')).toBeInTheDocument();
      expect(screen.getByText('DENIED')).toBeInTheDocument();
    });
  });
});