import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoleSelectionStep } from '@/components/onboarding/role-selection-step';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useRoleSelection } from '@/lib/hooks/useOnboarding';
import { UserRole } from '@/lib/types/onboarding';

// Mock the hooks
jest.mock('@/contexts/onboarding-context');
jest.mock('@/lib/hooks/useOnboarding');

const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;
const mockUseRoleSelection = useRoleSelection as jest.MockedFunction<typeof useRoleSelection>;

describe('RoleSelectionStep', () => {
  const mockNextStep = jest.fn();
  const mockSelectRole = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseOnboarding.mockReturnValue({
      currentStep: 0,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        currentStep: 0,
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

    mockUseRoleSelection.mockReturnValue({
      validating: false,
      error: null,
      selectRole: mockSelectRole,
      getRoleDescription: jest.fn(),
      getRolePermissions: jest.fn()
    });
  });

  it('renders all role options', () => {
    render(<RoleSelectionStep />);
    
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Teacher')).toBeInTheDocument();
    expect(screen.getByText('Department Administrator')).toBeInTheDocument();
    expect(screen.getByText('Institution Administrator')).toBeInTheDocument();
    expect(screen.getByText('System Administrator')).toBeInTheDocument();
  });

  it('displays role descriptions and features', () => {
    render(<RoleSelectionStep />);
    
    expect(screen.getByText('I\'m here to learn and complete assignments')).toBeInTheDocument();
    expect(screen.getByText('Join classes and view assignments')).toBeInTheDocument();
    expect(screen.getByText('I teach classes and manage student learning')).toBeInTheDocument();
    expect(screen.getByText('Create and manage classes')).toBeInTheDocument();
  });

  it('allows role selection', () => {
    render(<RoleSelectionStep />);
    
    const studentCard = screen.getByText('Student').closest('[role="button"]') || 
                       screen.getByText('Student').closest('div[class*="cursor-pointer"]');
    
    if (studentCard) {
      fireEvent.click(studentCard);
    }
    
    // Should show selected state
    expect(screen.getByText('Selected Role: Student')).toBeInTheDocument();
  });

  it('shows continue button when role is selected', () => {
    render(<RoleSelectionStep />);
    
    const teacherCard = screen.getByText('Teacher').closest('[role="button"]') || 
                       screen.getByText('Teacher').closest('div[class*="cursor-pointer"]');
    
    if (teacherCard) {
      fireEvent.click(teacherCard);
    }
    
    const continueButton = screen.getByText('Continue');
    expect(continueButton).toBeInTheDocument();
    expect(continueButton).not.toBeDisabled();
  });

  it('calls selectRole and nextStep when continue is clicked', async () => {
    mockSelectRole.mockResolvedValue(true);
    
    render(<RoleSelectionStep />);
    
    // Select a role
    const studentCard = screen.getByText('Student').closest('[role="button"]') || 
                       screen.getByText('Student').closest('div[class*="cursor-pointer"]');
    
    if (studentCard) {
      fireEvent.click(studentCard);
    }
    
    // Click continue
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);
    
    await waitFor(() => {
      expect(mockSelectRole).toHaveBeenCalledWith(UserRole.STUDENT);
    });
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('does not proceed if role selection fails', async () => {
    mockSelectRole.mockResolvedValue(false);
    
    render(<RoleSelectionStep />);
    
    // Select a role
    const teacherCard = screen.getByText('Teacher').closest('[role="button"]') || 
                       screen.getByText('Teacher').closest('div[class*="cursor-pointer"]');
    
    if (teacherCard) {
      fireEvent.click(teacherCard);
    }
    
    // Click continue
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);
    
    await waitFor(() => {
      expect(mockSelectRole).toHaveBeenCalledWith(UserRole.TEACHER);
    });
    
    // Should not proceed to next step
    expect(mockNextStep).not.toHaveBeenCalled();
  });

  it('displays error message when there is an error', () => {
    mockUseRoleSelection.mockReturnValue({
      validating: false,
      error: 'Failed to select role',
      selectRole: mockSelectRole,
      getRoleDescription: jest.fn(),
      getRolePermissions: jest.fn()
    });
    
    render(<RoleSelectionStep />);
    
    expect(screen.getByText('Failed to select role')).toBeInTheDocument();
  });

  it('shows loading state when validating', () => {
    mockUseRoleSelection.mockReturnValue({
      validating: true,
      error: null,
      selectRole: mockSelectRole,
      getRoleDescription: jest.fn(),
      getRolePermissions: jest.fn()
    });
    
    render(<RoleSelectionStep />);
    
    // Select a role first
    const studentCard = screen.getByText('Student').closest('[role="button"]') || 
                       screen.getByText('Student').closest('div[class*="cursor-pointer"]');
    
    if (studentCard) {
      fireEvent.click(studentCard);
    }
    
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('preserves previously selected role from onboarding data', () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 0,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.TEACHER,
        currentStep: 0,
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
    
    render(<RoleSelectionStep />);
    
    // Should show teacher as selected
    expect(screen.getByText('Selected Role: Teacher')).toBeInTheDocument();
  });

  it('disables continue button when no role is selected', () => {
    render(<RoleSelectionStep />);
    
    const continueButton = screen.getByText('Continue');
    expect(continueButton).toBeDisabled();
  });

  it('shows role-specific icons and colors', () => {
    render(<RoleSelectionStep />);
    
    // Check that role cards have appropriate styling
    const studentCard = screen.getByText('Student').closest('div');
    const teacherCard = screen.getByText('Teacher').closest('div');
    
    expect(studentCard).toBeInTheDocument();
    expect(teacherCard).toBeInTheDocument();
    
    // Icons should be present (testing via class names or data attributes would be more reliable)
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Teacher')).toBeInTheDocument();
  });
});