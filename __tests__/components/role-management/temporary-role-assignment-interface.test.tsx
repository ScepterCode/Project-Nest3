/**
 * Unit tests for Temporary Role Assignment Interface Component
 * 
 * Tests the UI component for assigning temporary roles with expiration dates.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemporaryRoleAssignmentInterface } from '@/components/role-management/temporary-role-assignment-interface';
import { UserRole } from '@/lib/types/role-management';

// Mock fetch globally
global.fetch = jest.fn();

// Mock the UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type, ...props }: any) => (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      type={type}
      data-testid={props['data-testid'] || 'button'}
      {...props}
    >
      {children}
    </button>
  )
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h2>{children}</h2>
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select 
      value={value} 
      onChange={(e) => onValueChange(e.target.value)}
      data-testid="role-select"
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => <span className={`badge ${variant}`}>{children}</span>
}));

jest.mock('@/components/ui/alert', () => ({
  Alert: ({ children, variant }: any) => <div className={`alert ${variant || ''}`}>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>
}));

describe('TemporaryRoleAssignmentInterface', () => {
  const mockProps = {
    institutionId: 'institution-1',
    departmentId: 'department-1',
    onAssignmentComplete: jest.fn(),
    onCancel: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    test('should render the form with all required fields', () => {
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      expect(screen.getByText('Assign Temporary Role')).toBeInTheDocument();
      expect(screen.getByLabelText('User ID or Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Temporary Role')).toBeInTheDocument();
      expect(screen.getByLabelText('Expiration Date')).toBeInTheDocument();
      expect(screen.getByLabelText('Justification for Extension')).toBeInTheDocument();
      expect(screen.getByText('Assign Temporary Role')).toBeInTheDocument();
    });

    test('should render with pre-filled user ID when provided', () => {
      render(
        <TemporaryRoleAssignmentInterface 
          {...mockProps} 
          userId="user-123"
          currentRole={UserRole.STUDENT}
        />
      );

      const userIdInput = screen.getByLabelText('User ID or Email') as HTMLInputElement;
      expect(userIdInput.value).toBe('user-123');
      expect(userIdInput.disabled).toBe(true);
      expect(screen.getByText('Current Role')).toBeInTheDocument();
      expect(screen.getByText('Student')).toBeInTheDocument();
    });

    test('should show warning for administrative roles', async () => {
      const user = userEvent.setup();
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const roleSelect = screen.getByTestId('role-select');
      await user.selectOptions(roleSelect, UserRole.DEPARTMENT_ADMIN);

      expect(screen.getByText(/You are assigning an administrative role/)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    test('should show error for empty user ID', async () => {
      const user = userEvent.setup();
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const submitButton = screen.getByText('Assign Temporary Role');
      await user.click(submitButton);

      expect(screen.getByText('User ID is required')).toBeInTheDocument();
    });

    test('should show error for missing expiration date', async () => {
      const user = userEvent.setup();
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const userIdInput = screen.getByLabelText('User ID or Email');
      await user.type(userIdInput, 'user@example.com');

      const submitButton = screen.getByText('Assign Temporary Role');
      await user.click(submitButton);

      expect(screen.getByText('Expiration date is required')).toBeInTheDocument();
    });

    test('should show error for past expiration date', async () => {
      const user = userEvent.setup();
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const userIdInput = screen.getByLabelText('User ID or Email');
      const expirationInput = screen.getByLabelText('Expiration Date');

      await user.type(userIdInput, 'user@example.com');
      
      // Set date to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];
      
      await user.type(expirationInput, yesterdayString);

      const submitButton = screen.getByText('Assign Temporary Role');
      await user.click(submitButton);

      expect(screen.getByText('Expiration date must be in the future')).toBeInTheDocument();
    });

    test('should show error for short justification', async () => {
      const user = userEvent.setup();
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const userIdInput = screen.getByLabelText('User ID or Email');
      const expirationInput = screen.getByLabelText('Expiration Date');
      const justificationInput = screen.getByLabelText('Justification for Extension');

      await user.type(userIdInput, 'user@example.com');
      
      // Set date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];
      
      await user.type(expirationInput, tomorrowString);
      await user.type(justificationInput, 'Short');

      const submitButton = screen.getByText('Assign Temporary Role');
      await user.click(submitButton);

      expect(screen.getByText('Justification must be at least 10 characters long')).toBeInTheDocument();
    });
  });

  describe('User Information Fetching', () => {
    test('should fetch user info when user ID is entered', async () => {
      const user = userEvent.setup();
      const mockUserResponse = {
        name: 'John Doe',
        email: 'john@example.com'
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserResponse
      });

      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const userIdInput = screen.getByLabelText('User ID or Email');
      await user.type(userIdInput, 'user-123');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/users/user-123');
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe (john@example.com)')).toBeInTheDocument();
      });
    });

    test('should handle user fetch failure gracefully', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('User not found'));

      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const userIdInput = screen.getByLabelText('User ID or Email');
      await user.type(userIdInput, 'invalid-user');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/users/invalid-user');
      });

      // Should not show user info, but also not crash
      expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
    });
  });

  describe('Duration Calculation', () => {
    test('should display calculated duration', async () => {
      const user = userEvent.setup();
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const expirationInput = screen.getByLabelText('Expiration Date');
      
      // Set date to 30 days from now
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const futureDateString = futureDate.toISOString().split('T')[0];
      
      await user.type(expirationInput, futureDateString);

      await waitFor(() => {
        expect(screen.getByText(/Duration: 1 months/)).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    test('should submit form with valid data', async () => {
      const user = userEvent.setup();
      const mockResponse = {
        success: true,
        assignment: {
          id: 'assignment-1',
          userId: 'user-123',
          role: UserRole.TEACHER,
          expiresAt: '2024-02-01T00:00:00.000Z',
          isTemporary: true,
          assignedAt: '2024-01-01T00:00:00.000Z'
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      // Fill out the form
      const userIdInput = screen.getByLabelText('User ID or Email');
      const roleSelect = screen.getByTestId('role-select');
      const expirationInput = screen.getByLabelText('Expiration Date');
      const justificationInput = screen.getByLabelText('Justification for Extension');

      await user.type(userIdInput, 'user@example.com');
      await user.selectOptions(roleSelect, UserRole.TEACHER);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];
      
      await user.type(expirationInput, tomorrowString);
      await user.type(justificationInput, 'Need temporary teacher access for substitute teaching');

      const submitButton = screen.getByText('Assign Temporary Role');
      await user.click(submitButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/roles/assign-temporary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"userId":"user@example.com"')
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Temporary role assigned successfully')).toBeInTheDocument();
      });

      expect(mockProps.onAssignmentComplete).toHaveBeenCalledWith(mockResponse.assignment);
    });

    test('should handle submission error', async () => {
      const user = userEvent.setup();
      const mockErrorResponse = {
        error: 'Insufficient permissions'
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => mockErrorResponse
      });

      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      // Fill out the form with valid data
      const userIdInput = screen.getByLabelText('User ID or Email');
      const expirationInput = screen.getByLabelText('Expiration Date');
      const justificationInput = screen.getByLabelText('Justification for Extension');

      await user.type(userIdInput, 'user@example.com');
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];
      
      await user.type(expirationInput, tomorrowString);
      await user.type(justificationInput, 'Valid justification text');

      const submitButton = screen.getByText('Assign Temporary Role');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Insufficient permissions')).toBeInTheDocument();
      });

      expect(mockProps.onAssignmentComplete).not.toHaveBeenCalled();
    });

    test('should handle network error', async () => {
      const user = userEvent.setup();

      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      // Fill out the form with valid data
      const userIdInput = screen.getByLabelText('User ID or Email');
      const expirationInput = screen.getByLabelText('Expiration Date');
      const justificationInput = screen.getByLabelText('Justification for Extension');

      await user.type(userIdInput, 'user@example.com');
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];
      
      await user.type(expirationInput, tomorrowString);
      await user.type(justificationInput, 'Valid justification text');

      const submitButton = screen.getByText('Assign Temporary Role');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    test('should show loading state during submission', async () => {
      const user = userEvent.setup();

      // Mock a delayed response
      (fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true, assignment: {} })
        }), 100))
      );

      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      // Fill out the form
      const userIdInput = screen.getByLabelText('User ID or Email');
      const expirationInput = screen.getByLabelText('Expiration Date');
      const justificationInput = screen.getByLabelText('Justification for Extension');

      await user.type(userIdInput, 'user@example.com');
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];
      
      await user.type(expirationInput, tomorrowString);
      await user.type(justificationInput, 'Valid justification text');

      const submitButton = screen.getByText('Assign Temporary Role');
      await user.click(submitButton);

      // Should show loading state
      expect(screen.getByText('Assigning...')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText('Temporary role assigned successfully')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Functionality', () => {
    test('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockProps.onCancel).toHaveBeenCalled();
    });

    test('should not render cancel button when onCancel is not provided', () => {
      const propsWithoutCancel = { ...mockProps };
      delete propsWithoutCancel.onCancel;

      render(<TemporaryRoleAssignmentInterface {...propsWithoutCancel} />);

      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });
  });

  describe('Notification Settings', () => {
    test('should have notification checkboxes checked by default', () => {
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const notifyUserCheckbox = screen.getByLabelText('Notify user about role assignment') as HTMLInputElement;
      const notifyAdminsCheckbox = screen.getByLabelText('Notify administrators') as HTMLInputElement;

      expect(notifyUserCheckbox.checked).toBe(true);
      expect(notifyAdminsCheckbox.checked).toBe(true);
    });

    test('should allow toggling notification settings', async () => {
      const user = userEvent.setup();
      render(<TemporaryRoleAssignmentInterface {...mockProps} />);

      const notifyUserCheckbox = screen.getByLabelText('Notify user about role assignment') as HTMLInputElement;
      
      await user.click(notifyUserCheckbox);
      expect(notifyUserCheckbox.checked).toBe(false);

      await user.click(notifyUserCheckbox);
      expect(notifyUserCheckbox.checked).toBe(true);
    });
  });
});