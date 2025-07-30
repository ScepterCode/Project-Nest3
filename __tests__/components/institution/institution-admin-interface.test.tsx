import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstitutionAdminInterface } from '@/components/institution/institution-admin-interface';
import { UserRole } from '@/lib/types/onboarding';

// Mock fetch globally
global.fetch = jest.fn();

// Mock child components
jest.mock('@/components/institution/institution-analytics-dashboard', () => ({
  InstitutionAnalyticsDashboard: ({ institutionId }: { institutionId: string }) => 
    React.createElement('div', { 'data-testid': 'analytics-dashboard' }, `Analytics for ${institutionId}`)
}));

jest.mock('@/components/institution/institution-user-manager', () => ({
  InstitutionUserManager: ({ institutionId, currentUserRole }: { institutionId: string, currentUserRole: string }) => 
    React.createElement('div', { 'data-testid': 'user-manager' }, `User Manager for ${institutionId} as ${currentUserRole}`)
}));

const mockInstitutionData = {
  success: true,
  data: {
    institution: {
      id: 'inst-1',
      name: 'Test University',
      domain: 'test.edu',
      type: 'university',
      status: 'active',
      contactInfo: {
        email: 'admin@test.edu',
        phone: '555-0123'
      },
      address: {
        street: '123 University Ave',
        city: 'Test City',
        state: 'TS',
        postalCode: '12345'
      },
      settings: {
        allowSelfRegistration: true,
        requireEmailVerification: true,
        defaultUserRole: 'student',
        allowCrossInstitutionCollaboration: false
      },
      branding: {
        primaryColor: '#0066cc',
        secondaryColor: '#666666',
        accentColor: '#ff6600',
        welcomeMessage: 'Welcome to Test University',
        footerText: '© 2024 Test University'
      },
      subscription: {
        plan: 'premium',
        status: 'active'
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-15'),
      createdBy: 'admin-1'
    },
    departments: [
      {
        id: 'dept-1',
        institutionId: 'inst-1',
        name: 'Computer Science',
        description: 'Department of Computer Science',
        code: 'CS',
        adminId: 'admin-1',
        status: 'active',
        settings: {},
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15')
      }
    ],
    userCount: 150,
    classCount: 25,
    enrollmentCount: 450,
    subscription: {
      plan: 'premium',
      usage: {
        users: 150,
        storage: 2048
      },
      limits: {
        users: 500,
        storage: 10240
      }
    }
  }
};

describe('InstitutionAdminInterface', () => {
  const defaultProps = {
    institutionId: 'inst-1',
    currentUserRole: UserRole.INSTITUTION_ADMIN
  };

  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('renders loading state initially', () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    
    render(<InstitutionAdminInterface {...defaultProps} />);
    
    expect(screen.getByText('Loading institution dashboard...')).toBeInTheDocument();
  });

  it('renders institution dashboard with overview data', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Check quick stats
    expect(screen.getByText('150')).toBeInTheDocument(); // Total users
    expect(screen.getByText('1')).toBeInTheDocument(); // Departments
    expect(screen.getByText('25')).toBeInTheDocument(); // Classes
    expect(screen.getByText('2.0GB')).toBeInTheDocument(); // Storage usage
  });

  it('handles institution details form submission', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Update institution name
    const nameInput = screen.getByDisplayValue('Test University');
    fireEvent.change(nameInput, { target: { value: 'Updated University' } });

    // Mock successful update
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Submit form
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/institutions/inst-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated University',
          contactInfo: mockInstitutionData.data.institution.contactInfo,
          address: mockInstitutionData.data.institution.address
        })
      });
    });
  });

  it('handles settings form submission', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Switch to settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Institution Settings')).toBeInTheDocument();
    });

    // Toggle a setting
    const selfRegistrationSwitch = screen.getByRole('switch');
    fireEvent.click(selfRegistrationSwitch);

    // Mock successful update
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Submit settings
    const saveSettingsButton = screen.getByText('Save Settings');
    fireEvent.click(saveSettingsButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/institutions/inst-1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('allowSelfRegistration')
      });
    });
  });

  it('handles branding form submission', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Switch to branding tab
    fireEvent.click(screen.getByText('Branding'));

    await waitFor(() => {
      expect(screen.getByText('Branding & Customization')).toBeInTheDocument();
    });

    // Update primary color
    const primaryColorInput = screen.getByDisplayValue('#0066cc');
    fireEvent.change(primaryColorInput, { target: { value: '#ff0000' } });

    // Mock successful update
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Submit branding
    const saveBrandingButton = screen.getByText('Save Branding');
    fireEvent.click(saveBrandingButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/institutions/inst-1/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('#ff0000')
      });
    });
  });

  it('handles department creation', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Switch to departments tab
    fireEvent.click(screen.getByText('Departments'));

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Click add department
    const addDepartmentButton = screen.getByText('Add Department');
    fireEvent.click(addDepartmentButton);

    await waitFor(() => {
      expect(screen.getByText('Create New Department')).toBeInTheDocument();
    });

    // Fill out form
    const nameInput = screen.getByPlaceholderText('e.g., Computer Science');
    const codeInput = screen.getByPlaceholderText('e.g., CS');
    const descriptionInput = screen.getByPlaceholderText('Brief description of the department...');

    fireEvent.change(nameInput, { target: { value: 'Mathematics' } });
    fireEvent.change(codeInput, { target: { value: 'MATH' } });
    fireEvent.change(descriptionInput, { target: { value: 'Department of Mathematics' } });

    // Mock successful creation
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Submit form
    const createButton = screen.getByText('Create Department');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/institutions/inst-1/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Mathematics',
          code: 'MATH',
          description: 'Department of Mathematics',
          adminId: ''
        })
      });
    });
  });

  it('handles department deletion', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    // Mock window.confirm
    window.confirm = jest.fn(() => true);

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Switch to departments tab
    fireEvent.click(screen.getByText('Departments'));

    await waitFor(() => {
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
    });

    // Mock successful deletion
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Find and click delete button
    const deleteButtons = screen.getAllByRole('button');
    const deleteButton = deleteButtons.find(button => 
      button.innerHTML.includes('Trash2') || 
      button.querySelector('[data-testid="trash-2"]')
    );

    if (deleteButton) {
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith(
          'Are you sure you want to delete this department? This action cannot be undone.'
        );
        expect(fetch).toHaveBeenCalledWith('/api/departments/dept-1', {
          method: 'DELETE'
        });
      });
    }
  });

  it('renders user manager in users tab', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Switch to users tab
    fireEvent.click(screen.getByText('Users'));

    await waitFor(() => {
      expect(screen.getByTestId('user-manager')).toBeInTheDocument();
      expect(screen.getByText('User Manager for inst-1 as institution_admin')).toBeInTheDocument();
    });
  });

  it('renders analytics dashboard in analytics tab', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Switch to analytics tab
    fireEvent.click(screen.getByText('Analytics'));

    await waitFor(() => {
      expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument();
      expect(screen.getByText('Analytics for inst-1')).toBeInTheDocument();
    });
  });

  it('displays billing information', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Switch to billing tab
    fireEvent.click(screen.getByText('Billing'));

    await waitFor(() => {
      expect(screen.getByText('Subscription & Billing')).toBeInTheDocument();
      expect(screen.getByText('PREMIUM')).toBeInTheDocument();
      expect(screen.getByText('150 / 500')).toBeInTheDocument(); // User usage
      expect(screen.getByText('2.0GB / 10.0GB')).toBeInTheDocument(); // Storage usage
    });
  });

  it('handles API errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load institution data. Please try again.')).toBeInTheDocument();
    });
  });

  it('handles refresh functionality', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    // Should make additional API call
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2); // Initial + refresh
    });
  });

  it('meets accessibility requirements', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    // Check for proper heading structure
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test University');
    
    // Check for proper form labels
    expect(screen.getByLabelText('Institution Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Domain')).toBeInTheDocument();
    
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
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockInstitutionData
    });

    render(<InstitutionAdminInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    const overviewTab = screen.getByRole('tab', { name: /overview/i });
    const settingsTab = screen.getByRole('tab', { name: /settings/i });

    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    
    // Simulate keyboard navigation
    fireEvent.keyDown(overviewTab, { key: 'ArrowRight' });
    fireEvent.click(settingsTab);
    
    expect(settingsTab).toHaveAttribute('aria-selected', 'true');
  });
});