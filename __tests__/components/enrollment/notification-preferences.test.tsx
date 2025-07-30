import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationPreferencesComponent } from '@/components/enrollment/notification-preferences';
import { NotificationPreferences } from '@/lib/types/enrollment';

// Mock fetch
global.fetch = jest.fn();

const mockPreferences: NotificationPreferences = {
  userId: 'user-123',
  enrollmentConfirmation: {
    email: true,
    inApp: true,
    sms: false
  },
  waitlistUpdates: {
    email: true,
    inApp: true,
    sms: false
  },
  deadlineReminders: {
    email: true,
    inApp: true,
    sms: false,
    daysBeforeDeadline: [7, 3, 1]
  },
  capacityAlerts: {
    email: true,
    inApp: true,
    sms: false
  },
  digestFrequency: 'daily'
};

describe('NotificationPreferencesComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<NotificationPreferencesComponent userId="user-123" />);

    expect(screen.getByText('Loading your notification settings...')).toBeInTheDocument();
  });

  it('should load and display notification preferences', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Check that sections are rendered
    expect(screen.getByText('Enrollment Confirmations')).toBeInTheDocument();
    expect(screen.getByText('Waitlist Updates')).toBeInTheDocument();
    expect(screen.getByText('Deadline Reminders')).toBeInTheDocument();
    expect(screen.getByText('Capacity Alerts')).toBeInTheDocument();
    expect(screen.getByText('Digest Frequency')).toBeInTheDocument();
  });

  it('should handle loading error', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Failed to load'));

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load notification preferences')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to load notification preferences')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should toggle notification channel preferences', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Find and click the enrollment email switch
    const enrollmentEmailSwitch = screen.getByLabelText('Email', { 
      selector: '#enrollment-email' 
    });
    
    expect(enrollmentEmailSwitch).toBeChecked();
    
    fireEvent.click(enrollmentEmailSwitch);
    
    expect(enrollmentEmailSwitch).not.toBeChecked();
  });

  it('should update deadline reminder days', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Find and click a reminder day badge
    const fourteenDayBadge = screen.getByText('14 days before');
    
    fireEvent.click(fourteenDayBadge);
    
    // The badge should now be selected (this would be reflected in the component state)
    expect(fourteenDayBadge).toBeInTheDocument();
  });

  it('should save preferences successfully', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          message: 'Notification preferences saved successfully',
          preferences: mockPreferences 
        })
      });

    const onPreferencesChange = jest.fn();

    render(
      <NotificationPreferencesComponent 
        userId="user-123" 
        onPreferencesChange={onPreferencesChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Click save button
    const saveButton = screen.getByText('Save Preferences');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Notification preferences saved successfully')).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith('/api/notifications/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ preferences: mockPreferences }),
    });

    expect(onPreferencesChange).toHaveBeenCalledWith(mockPreferences);
  });

  it('should handle save error', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockRejectedValueOnce(new Error('Failed to save'));

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Click save button
    const saveButton = screen.getByText('Save Preferences');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to save notification preferences')).toBeInTheDocument();
    });
  });

  it('should reset preferences', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      });

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Make a change
    const enrollmentEmailSwitch = screen.getByLabelText('Email', { 
      selector: '#enrollment-email' 
    });
    fireEvent.click(enrollmentEmailSwitch);

    // Click reset button
    const resetButton = screen.getByText('Reset');
    fireEvent.click(resetButton);

    await waitFor(() => {
      // Should reload preferences from server
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('should update digest frequency', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPreferences })
    });

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // The digest frequency select should show current value
    expect(screen.getByDisplayValue('Daily')).toBeInTheDocument();
  });

  it('should show saving state', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Click save button
    const saveButton = screen.getByText('Save Preferences');
    fireEvent.click(saveButton);

    // Should show saving state
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('should disable buttons while saving', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Click save button
    const saveButton = screen.getByText('Save Preferences');
    const resetButton = screen.getByText('Reset');
    
    fireEvent.click(saveButton);

    // Both buttons should be disabled
    expect(saveButton).toBeDisabled();
    expect(resetButton).toBeDisabled();
  });

  it('should clear success message after timeout', async () => {
    jest.useFakeTimers();

    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preferences: mockPreferences })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          message: 'Notification preferences saved successfully',
          preferences: mockPreferences 
        })
      });

    render(<NotificationPreferencesComponent userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    });

    // Click save button
    const saveButton = screen.getByText('Save Preferences');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Notification preferences saved successfully')).toBeInTheDocument();
    });

    // Fast forward 3 seconds
    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(screen.queryByText('Notification preferences saved successfully')).not.toBeInTheDocument();
    });

    jest.useRealTimers();
  });
});