import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminInstitutionSetupStep } from '@/components/onboarding/admin-institution-setup-step';
import { OnboardingProvider } from '@/contexts/onboarding-context';
import { InstitutionType } from '@/lib/types/onboarding';

// Mock the onboarding context
const mockNextStep = jest.fn();
const mockOnboardingContext = {
  currentStep: 3,
  totalSteps: 6,
  onboardingData: {
    userId: 'test-user-id',
    role: 'institution_admin' as const,
    skippedSteps: [],
    currentStep: 3
  },
  session: undefined,
  loading: false,
  error: undefined,
  updateOnboardingData: jest.fn(),
  nextStep: mockNextStep,
  previousStep: jest.fn(),
  skipStep: jest.fn(),
  completeOnboarding: jest.fn(),
  restartOnboarding: jest.fn()
};

jest.mock('@/contexts/onboarding-context', () => ({
  useOnboarding: () => mockOnboardingContext,
  OnboardingProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe('AdminInstitutionSetupStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
  });

  it('renders the institution details step initially', () => {
    render(<AdminInstitutionSetupStep />);
    
    expect(screen.getByText('Institution Details')).toBeInTheDocument();
    expect(screen.getByText('Institution Information')).toBeInTheDocument();
    expect(screen.getByLabelText(/Institution Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Domain/)).toBeInTheDocument();
    expect(screen.getByText('Institution Type')).toBeInTheDocument();
    expect(screen.getByLabelText(/Contact Email/)).toBeInTheDocument();
  });

  it('shows validation errors for empty required fields', async () => {
    render(<AdminInstitutionSetupStep />);
    
    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Institution name is required')).toBeInTheDocument();
    });
  });

  it('validates email format', async () => {
    render(<AdminInstitutionSetupStep />);
    
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    const nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });
  });

  it('validates domain format', async () => {
    render(<AdminInstitutionSetupStep />);
    
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    const domainInput = screen.getByLabelText(/Domain/);
    const nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.change(domainInput, { target: { value: 'invalid-domain' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid domain (e.g., university.edu)')).toBeInTheDocument();
    });
  });

  it('progresses to department setup step with valid institution data', async () => {
    render(<AdminInstitutionSetupStep />);
    
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    const nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create the initial departments for your institution')).toBeInTheDocument();
    });
  });

  it('allows adding and removing departments', async () => {
    render(<AdminInstitutionSetupStep />);
    
    // Navigate to department step
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    let nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      // Should have one department initially
      expect(screen.getByText('Department 1')).toBeInTheDocument();
      expect(screen.getByText('Create the initial departments for your institution')).toBeInTheDocument();
      expect(screen.queryByText('Remove')).not.toBeInTheDocument(); // Can't remove the only department
    });
    
    // Add another department
    const addButton = screen.getByRole('button', { name: /Add Another Department/i });
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(screen.getByText('Department 2')).toBeInTheDocument();
      expect(screen.getAllByText('Remove')).toHaveLength(2);
    });
    
    // Remove a department
    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[0]);
    
    await waitFor(() => {
      expect(screen.queryByText('Department 2')).not.toBeInTheDocument();
    });
  });

  it('validates department names are required', async () => {
    render(<AdminInstitutionSetupStep />);
    
    // Navigate to department step
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    let nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create the initial departments for your institution')).toBeInTheDocument();
    });
    
    // Try to proceed without department names
    nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('At least one department is required')).toBeInTheDocument();
    });
  });

  it('validates department names are unique', async () => {
    render(<AdminInstitutionSetupStep />);
    
    // Navigate to department step
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    let nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create the initial departments for your institution')).toBeInTheDocument();
    });
    
    // Add another department
    const addButton = screen.getByRole('button', { name: /Add Another Department/i });
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(screen.getByText('Department 2')).toBeInTheDocument();
    });
    
    // Set same name for both departments
    const deptNameInputs = screen.getAllByLabelText(/Department Name/);
    fireEvent.change(deptNameInputs[0], { target: { value: 'Computer Science' } });
    fireEvent.change(deptNameInputs[1], { target: { value: 'Computer Science' } });
    
    nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Department names must be unique')).toBeInTheDocument();
    });
  });

  it('shows review step with correct data', async () => {
    render(<AdminInstitutionSetupStep />);
    
    // Fill institution details
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    const domainInput = screen.getByLabelText(/Domain/);
    let nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.change(domainInput, { target: { value: 'test.edu' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create the initial departments for your institution')).toBeInTheDocument();
    });
    
    // Fill department details
    const deptNameInput = screen.getByLabelText(/Department Name/);
    const deptCodeInput = screen.getByLabelText(/Department Code/);
    
    fireEvent.change(deptNameInput, { target: { value: 'Computer Science' } });
    fireEvent.change(deptCodeInput, { target: { value: 'CS' } });
    
    nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      // Should show review step
      expect(screen.getByText('Review your institution details before creating')).toBeInTheDocument();
      expect(screen.getByText('Test University')).toBeInTheDocument();
      expect(screen.getByText('test.edu')).toBeInTheDocument();
      expect(screen.getByText('admin@test.edu')).toBeInTheDocument();
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
      expect(screen.getByText('(CS)')).toBeInTheDocument();
    });
  });

  it('successfully creates institution and calls nextStep', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          institution: {
            id: 'inst-123',
            name: 'Test University',
            domain: 'test.edu',
            type: InstitutionType.UNIVERSITY,
            status: 'active'
          },
          departments: [
            {
              id: 'dept-123',
              name: 'Computer Science',
              code: 'CS',
              description: null
            }
          ],
          message: 'Institution and departments created successfully'
        }
      })
    });

    render(<AdminInstitutionSetupStep />);
    
    // Fill all required data and navigate to review step
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    let nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create the initial departments for your institution')).toBeInTheDocument();
    });
    
    const deptNameInput = screen.getByLabelText(/Department Name/);
    fireEvent.change(deptNameInput, { target: { value: 'Computer Science' } });
    
    nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Review your institution details before creating')).toBeInTheDocument();
    });
    
    // Submit the form
    const createButton = screen.getByRole('button', { name: /Create Institution/i });
    fireEvent.click(createButton);
    
    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
    
    // Wait for success
    await waitFor(() => {
      expect(screen.getByText('Institution created successfully!')).toBeInTheDocument();
    });
    
    // Should call the API with correct data
    expect(fetch).toHaveBeenCalledWith('/api/institutions/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test University',
        domain: '',
        type: InstitutionType.UNIVERSITY,
        contactEmail: 'admin@test.edu',
        description: '',
        departments: [
          {
            name: 'Computer Science',
            code: '',
            description: ''
          }
        ]
      })
    });
    
    // Should call nextStep after success
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('handles API errors gracefully', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: 'Institution name already exists'
      })
    });

    render(<AdminInstitutionSetupStep />);
    
    // Navigate to review and submit
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    let nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create the initial departments for your institution')).toBeInTheDocument();
    });
    
    const deptNameInput = screen.getByLabelText(/Department Name/);
    fireEvent.change(deptNameInput, { target: { value: 'Computer Science' } });
    
    nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Review your institution details before creating')).toBeInTheDocument();
    });
    
    const createButton = screen.getByRole('button', { name: /Create Institution/i });
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Institution name already exists')).toBeInTheDocument();
    });
    
    expect(mockNextStep).not.toHaveBeenCalled();
  });

  it('allows navigation between sub-steps', async () => {
    render(<AdminInstitutionSetupStep />);
    
    // Fill institution details and go to department step
    const nameInput = screen.getByLabelText(/Institution Name/);
    const emailInput = screen.getByLabelText(/Contact Email/);
    let nextButton = screen.getByRole('button', { name: /next/i });
    
    fireEvent.change(nameInput, { target: { value: 'Test University' } });
    fireEvent.change(emailInput, { target: { value: 'admin@test.edu' } });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create the initial departments for your institution')).toBeInTheDocument();
    });
    
    // Go back to institution details
    const previousButton = screen.getByRole('button', { name: /previous/i });
    fireEvent.click(previousButton);
    
    await waitFor(() => {
      expect(screen.getByText('Institution Details')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test University')).toBeInTheDocument();
      expect(screen.getByDisplayValue('admin@test.edu')).toBeInTheDocument();
    });
  });

  it('shows step indicators correctly', () => {
    render(<AdminInstitutionSetupStep />);
    
    // Should show 3 sub-steps
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    
    // First step should be active
    const step1 = screen.getByText('1').closest('div');
    expect(step1).toHaveClass('bg-blue-600');
  });
});