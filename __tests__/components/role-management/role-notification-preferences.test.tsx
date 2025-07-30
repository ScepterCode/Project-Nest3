import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoleNotificationPreferencesComponent } from '@/components/role-management/role-notification-preferences';
import { RoleNotificationPreferences } from '@/lib/services/role-notification-service';

// Mock fetch
global.fetch = jest.fn();

const mockPreferences: RoleNotificationPreferences = {
  userId: 'user-1',
  roleRequests: {
    email: true,
    inApp: true,
    sms: false
  },
  roleAssignments: {
    email: true,
    inApp: true,
    sms: false
  },
  temporaryRoles: {
    email: true,
    inApp: true,
    sms: false,
    reminderDays: [7, 3, 1]
  },
  adminNotifications: {
    email: true,
    inApp: true,
    sms: false,
    digestFrequency: 'daily'
  }
};

describe('RoleNotificationPreferencesComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    expect(screen.getByText('Role Notification Preferences')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
  });

  it('should fetch and display preferences', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Role Requests')).toBeInTheDocument();
      expect(screen.getByText('Role Assignments')).toBeInTheDocument();
      expect(screen.getByText('Temporary Roles')).toBeInTheDocument();
      expect(screen.getByText('Admin Notifications')).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith('/api/roles/notifications/preferences');
  });

  it('should display error message when fetch fails', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load notification preferences')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch preferences')).toBeInTheDocument();
    });
  });

  it('should toggle notification channel preferences', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Role Requests')).toBeInTheDocument();
    });

    // Find and toggle the SMS switch for role requests
    const smsSwitch = screen.getByLabelText('SMS', { selector: 'input[type="checkbox"]' });
    fireEvent.click(smsSwitch);

    // The switch should now be checked
    expect(smsSwitch).toBeChecked();
  });

  it('should update reminder days for temporary roles', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Reminder Schedule')).toBeInTheDocument();
    });

    // Find and click the 14 days badge to add it
    const fourteenDaysBadge = screen.getByText('14 days before');
    fireEvent.click(fourteenDaysBadge);

    // The badge should now have the default variant (selected)
    expect(fourteenDaysBadge).toHaveClass('bg-primary');
  });

  it('should update digest frequency', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Digest Frequency')).toBeInTheDocument();
    });

    // Find the select trigger and click it
    const selectTrigger = screen.getByRole('combobox');
    fireEvent.click(selectTrigger);

    // Wait for options to appear and click weekly
    await waitFor(() => {
      const weeklyOption = screen.getByText('Weekly Digest');
      fireEvent.click(weeklyOption);
    });

    // The select should now show weekly
    expect(screen.getByDisplayValue('weekly')).toBeInTheDocument();
  });

  it('should save preferences when save button is clicked', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

    const onPreferencesChange = jest.fn();

    render(
      <RoleNotificationPreferencesComponent 
        userId="user-1" 
        onPreferencesChange={onPreferencesChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Save Preferences')).toBeInTheDocument();
    });

    // Click save button
    const saveButton = screen.getByText('Save Preferences');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/roles/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferences: mockPreferences }),
      });
    });

    expect(onPreferencesChange).toHaveBeenCalledWith(mockPreferences);
  });

  it('should show error message when save fails', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500
      });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Save Preferences')).toBeInTheDocument();
    });

    // Click save button
    const saveButton = screen.getByText('Save Preferences');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to save preferences')).toBeInTheDocument();
    });
  });

  it('should show saving state when save is in progress', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Save Preferences')).toBeInTheDocument();
    });

    // Click save button
    const saveButton = screen.getByText('Save Preferences');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
      expect(saveButton).toBeDisabled();
    });
  });

  it('should retry fetching preferences when try again is clicked', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 500
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    // Click try again button
    const tryAgainButton = screen.getByText('Try Again');
    fireEvent.click(tryAgainButton);

    await waitFor(() => {
      expect(screen.getByText('Role Requests')).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should display correct channel icons', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      // Check for email icons (Mail)
      expect(screen.getAllByTestId('mail-icon')).toHaveLength(4); // One for each section
      
      // Check for in-app icons (Monitor)
      expect(screen.getAllByTestId('monitor-icon')).toHaveLength(4);
      
      // Check for SMS icons (Smartphone)
      expect(screen.getAllByTestId('smartphone-icon')).toHaveLength(4);
    });
  });

  it('should handle reminder days selection correctly', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<RoleNotificationPreferencesComponent userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Reminder Schedule')).toBeInTheDocument();
    });

    // Initially, 7, 3, and 1 days should be selected
    expect(screen.getByText('7 days before')).toHaveClass('bg-primary');
    expect(screen.getByText('3 days before')).toHaveClass('bg-primary');
    expect(screen.getByText('1 day before')).toHaveClass('bg-primary');
    expect(screen.getByText('14 days before')).not.toHaveClass('bg-primary');

    // Click to deselect 7 days
    fireEvent.click(screen.getByText('7 days before'));
    expect(screen.getByText('7 days before')).not.toHaveClass('bg-primary');

    // Click to select 14 days
    fireEvent.click(screen.getByText('14 days before'));
    expect(screen.getByText('14 days before')).toHaveClass('bg-primary');
  });
});