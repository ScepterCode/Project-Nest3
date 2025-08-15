import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryPreferencesManager } from '@/components/notifications/delivery-preferences';
import { DeliveryPreferences } from '@/lib/types/enhanced-notifications';

// Mock the auth context
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' }
  })
}));

const mockPreferences = {
  id: 'test-prefs',
  user_id: 'test-user',
  email_enabled: true,
  push_enabled: true,
  sms_enabled: false,
  preferred_time_start: '09:00',
  preferred_time_end: '17:00',
  time_zone: 'UTC',
  frequency_limit: 10,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  digest_enabled: false,
  digest_frequency: 'daily',
  digest_time: '09:00',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z'
};

describe('DeliveryPreferencesManager', () => {
  const mockOnSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders delivery preferences with default values', () => {
    render(
      <DeliveryPreferencesManager
        onSave={mockOnSave}
      />
    );

    expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    expect(screen.getByText('Email Notifications')).toBeInTheDocument();
    expect(screen.getByText('Push Notifications')).toBeInTheDocument();
    expect(screen.getByText('SMS Notifications')).toBeInTheDocument();
  });

  it('renders delivery preferences with existing data', () => {
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    // Check that switches reflect the preference values
    const emailSwitch = screen.getByRole('switch', { name: /email notifications/i });
    const pushSwitch = screen.getByRole('switch', { name: /push notifications/i });
    const smsSwitch = screen.getByRole('switch', { name: /sms notifications/i });

    expect(emailSwitch).toBeChecked();
    expect(pushSwitch).toBeChecked();
    expect(smsSwitch).not.toBeChecked();
  });

  it('allows toggling notification channels', async () => {
    const user = userEvent.setup();
    
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    const emailSwitch = screen.getByRole('switch', { name: /email notifications/i });
    
    await user.click(emailSwitch);
    expect(emailSwitch).not.toBeChecked();
  });

  it('allows setting preferred hours', async () => {
    const user = userEvent.setup();
    
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    // Switch to timing tab
    await user.click(screen.getByText('Timing'));

    // Check that time zone is displayed
    expect(screen.getByText('UTC (Coordinated Universal Time)')).toBeInTheDocument();
  });

  it('allows enabling and configuring quiet hours', async () => {
    const user = userEvent.setup();
    
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    // Switch to timing tab
    await user.click(screen.getByText('Timing'));

    const quietHoursSwitch = screen.getByRole('switch', { name: /enable quiet hours/i });
    expect(quietHoursSwitch).not.toBeChecked();

    await user.click(quietHoursSwitch);
    expect(quietHoursSwitch).toBeChecked();

    // Quiet hours time selectors should now be visible
    expect(screen.getByText('Quiet Hours Start')).toBeInTheDocument();
    expect(screen.getByText('Quiet Hours End')).toBeInTheDocument();
  });

  it('allows setting frequency limits', async () => {
    const user = userEvent.setup();
    
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    // Switch to frequency tab
    await user.click(screen.getByText('Frequency'));

    const frequencySlider = screen.getByRole('slider');
    expect(frequencySlider).toHaveValue('10');

    // Change frequency limit
    fireEvent.change(frequencySlider, { target: { value: '20' } });
    expect(frequencySlider).toHaveValue('20');
  });

  it('allows enabling and configuring digest', async () => {
    const user = userEvent.setup();
    
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    // Switch to digest tab
    await user.click(screen.getByText('Digest'));

    const digestSwitch = screen.getByRole('switch', { name: /enable notification digest/i });
    expect(digestSwitch).not.toBeChecked();

    await user.click(digestSwitch);
    expect(digestSwitch).toBeChecked();

    // Digest configuration should now be visible
    expect(screen.getByText('Digest Frequency')).toBeInTheDocument();
  });

  it('shows weekly digest day selector when weekly frequency is selected', async () => {
    const user = userEvent.setup();
    
    const weeklyPreferences = {
      ...mockPreferences,
      digest_enabled: true,
      digest_frequency: 'weekly' as const,
      digest_day: 1
    };

    render(
      <DeliveryPreferencesManager
        preferences={weeklyPreferences}
        onSave={mockOnSave}
      />
    );

    // Switch to digest tab
    await user.click(screen.getByText('Digest'));

    expect(screen.getByText('Day of Week')).toBeInTheDocument();
  });

  it('shows monthly digest day selector when monthly frequency is selected', async () => {
    const user = userEvent.setup();
    
    const monthlyPreferences = {
      ...mockPreferences,
      digest_enabled: true,
      digest_frequency: 'monthly' as const,
      digest_day: 15
    };

    render(
      <DeliveryPreferencesManager
        preferences={monthlyPreferences}
        onSave={mockOnSave}
      />
    );

    // Switch to digest tab
    await user.click(screen.getByText('Digest'));

    expect(screen.getByText('Day of Month')).toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    // Make a change
    const emailSwitch = screen.getByRole('switch', { name: /email notifications/i });
    await user.click(emailSwitch);

    // Click save
    await user.click(screen.getByText('Save Preferences'));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          email_enabled: false
        })
      );
    });
  });

  it('displays helpful information about features', () => {
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    expect(screen.getByText('Choose how you want to receive notifications')).toBeInTheDocument();
  });

  it('shows digest benefits information', async () => {
    const user = userEvent.setup();
    
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    // Switch to digest tab
    await user.click(screen.getByText('Digest'));

    expect(screen.getByText('Digest Benefits')).toBeInTheDocument();
    expect(screen.getByText('• Reduces notification fatigue')).toBeInTheDocument();
  });

  it('shows frequency limit explanation', async () => {
    const user = userEvent.setup();
    
    render(
      <DeliveryPreferencesManager
        preferences={mockPreferences}
        onSave={mockOnSave}
      />
    );

    // Switch to frequency tab
    await user.click(screen.getByText('Frequency'));

    expect(screen.getByText('How it works')).toBeInTheDocument();
    expect(screen.getByText(/When you reach your daily limit/)).toBeInTheDocument();
  });
});