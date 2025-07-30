import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DepartmentSelectionStep } from '@/components/onboarding/department-selection-step';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useDepartmentSearch } from '@/lib/hooks/useOnboarding';
import { DepartmentSearchResult, UserRole } from '@/lib/types/onboarding';

// Mock the hooks
jest.mock('@/contexts/onboarding-context');
jest.mock('@/lib/hooks/useOnboarding');

const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;
const mockUseDepartmentSearch = useDepartmentSearch as jest.MockedFunction<typeof useDepartmentSearch>;

const mockDepartments: DepartmentSearchResult[] = [
  {
    id: '1',
    name: 'Computer Science',
    code: 'CS',
    description: 'Department of Computer Science and Engineering',
    userCount: 150,
    adminName: 'Dr. John Smith'
  },
  {
    id: '2',
    name: 'Mathematics',
    code: 'MATH',
    description: 'Department of Mathematics',
    userCount: 80,
    adminName: 'Dr. Jane Doe'
  }
];

describe('DepartmentSelectionStep', () => {
  const mockNextStep = jest.fn();
  const mockLoadDepartments = jest.fn();
  const mockSelectDepartment = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseOnboarding.mockReturnValue({
      currentStep: 2,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        institutionId: 'institution-1',
        currentStep: 2,
        skippedSteps: []
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
    });

    mockUseDepartmentSearch.mockReturnValue({
      departments: [],
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });
  });

  it('loads departments on mount when institution is selected', () => {
    render(<DepartmentSelectionStep />);
    
    expect(mockLoadDepartments).toHaveBeenCalledWith('institution-1');
  });

  it('skips department selection for system admins', async () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 2,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.SYSTEM_ADMIN,
        institutionId: 'institution-1',
        currentStep: 2,
        skippedSteps: []
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
    });

    render(<DepartmentSelectionStep />);
    
    expect(screen.getByText('Setting up your account...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('displays loading state while fetching departments', () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: [],
      loading: true,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    render(<DepartmentSelectionStep />);
    
    expect(screen.getByText('Loading departments...')).toBeInTheDocument();
  });

  it('displays error message when department loading fails', () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: [],
      loading: false,
      error: 'Failed to load departments',
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    render(<DepartmentSelectionStep />);
    
    expect(screen.getByText('Failed to load departments')).toBeInTheDocument();
  });

  it('displays available departments', () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: mockDepartments,
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    render(<DepartmentSelectionStep />);
    
    expect(screen.getByText('Available Departments')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('CS')).toBeInTheDocument();
    expect(screen.getByText('Department of Computer Science and Engineering')).toBeInTheDocument();
    expect(screen.getByText('150 members')).toBeInTheDocument();
    expect(screen.getByText('Admin: Dr. John Smith')).toBeInTheDocument();
  });

  it('allows department selection', async () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: mockDepartments,
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    mockSelectDepartment.mockResolvedValue(true);

    render(<DepartmentSelectionStep />);
    
    const departmentCard = screen.getByText('Computer Science').closest('div[class*="cursor-pointer"]');
    
    if (departmentCard) {
      fireEvent.click(departmentCard);
    }
    
    await waitFor(() => {
      expect(mockSelectDepartment).toHaveBeenCalledWith(mockDepartments[0]);
    });
  });

  it('shows selected department confirmation', async () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: mockDepartments,
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    mockSelectDepartment.mockResolvedValue(true);

    render(<DepartmentSelectionStep />);
    
    const departmentCard = screen.getByText('Computer Science').closest('div[class*="cursor-pointer"]');
    
    if (departmentCard) {
      fireEvent.click(departmentCard);
    }
    
    await waitFor(() => {
      expect(screen.getByText('Selected: Computer Science')).toBeInTheDocument();
      expect(screen.getByText('You\'ll be connected with this department.')).toBeInTheDocument();
    });
  });

  it('enables continue button when department is selected', async () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: mockDepartments,
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    mockSelectDepartment.mockResolvedValue(true);

    render(<DepartmentSelectionStep />);
    
    // Initially disabled
    const continueButton = screen.getByText('Continue');
    expect(continueButton).toBeDisabled();
    
    // Select department
    const departmentCard = screen.getByText('Computer Science').closest('div[class*="cursor-pointer"]');
    
    if (departmentCard) {
      fireEvent.click(departmentCard);
    }
    
    await waitFor(() => {
      expect(continueButton).not.toBeDisabled();
    });
  });

  it('proceeds to next step when continue is clicked', async () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: mockDepartments,
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    mockSelectDepartment.mockResolvedValue(true);

    render(<DepartmentSelectionStep />);
    
    // Select department
    const departmentCard = screen.getByText('Computer Science').closest('div[class*="cursor-pointer"]');
    
    if (departmentCard) {
      fireEvent.click(departmentCard);
    }
    
    await waitFor(() => {
      const continueButton = screen.getByText('Continue');
      expect(continueButton).not.toBeDisabled();
      fireEvent.click(continueButton);
    });
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('allows skipping department selection', async () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: mockDepartments,
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    render(<DepartmentSelectionStep />);
    
    const skipButton = screen.getByText('Skip for now');
    fireEvent.click(skipButton);
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('shows message when no departments are available', () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: [],
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    render(<DepartmentSelectionStep />);
    
    expect(screen.getByText('No departments available')).toBeInTheDocument();
    expect(screen.getByText('This institution doesn\'t have any departments set up yet, or you may not have access to view them.')).toBeInTheDocument();
    expect(screen.getByText('You can continue without selecting a department and choose one later.')).toBeInTheDocument();
  });

  it('handles department selection failure gracefully', async () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: mockDepartments,
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    mockSelectDepartment.mockResolvedValue(false);

    render(<DepartmentSelectionStep />);
    
    const departmentCard = screen.getByText('Computer Science').closest('div[class*="cursor-pointer"]');
    
    if (departmentCard) {
      fireEvent.click(departmentCard);
    }
    
    await waitFor(() => {
      expect(mockSelectDepartment).toHaveBeenCalledWith(mockDepartments[0]);
    });
    
    // Should not show selected state if selection failed
    expect(screen.queryByText('Selected: Computer Science')).not.toBeInTheDocument();
  });

  it('shows help text for missing departments', () => {
    mockUseDepartmentSearch.mockReturnValue({
      departments: mockDepartments,
      loading: false,
      error: null,
      loadDepartments: mockLoadDepartments,
      selectDepartment: mockSelectDepartment
    });

    render(<DepartmentSelectionStep />);
    
    expect(screen.getByText('Don\'t see your department? You can contact your institution administrator to have it added.')).toBeInTheDocument();
  });

  it('does not load departments when no institution is selected', () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 2,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        currentStep: 2,
        skippedSteps: []
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
    });

    render(<DepartmentSelectionStep />);
    
    expect(mockLoadDepartments).not.toHaveBeenCalled();
  });
});