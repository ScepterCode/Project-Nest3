import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WelcomeStep } from '@/components/onboarding/welcome-step';
import { UserRole } from '@/lib/types/onboarding';

// Mock the onboarding context
const mockOnboardingContext = {
  currentStep: 5,
  totalSteps: 6,
  onboardingData: {
    userId: 'test-user-id',
    role: UserRole.STUDENT,
    institutionId: 'inst-123',
    departmentId: 'dept-123',
    skippedSteps: [],
    currentStep: 5
  },
  session: undefined,
  loading: false,
  error: undefined,
  updateOnboardingData: jest.fn(),
  nextStep: jest.fn(),
  previousStep: jest.fn(),
  skipStep: jest.fn(),
  completeOnboarding: jest.fn(),
  restartOnboarding: jest.fn()
};

const mockUseOnboarding = jest.fn(() => mockOnboardingContext);

jest.mock('@/contexts/onboarding-context', () => ({
  useOnboarding: jest.fn()
}));

describe('WelcomeStep', () => {
  const mockOnComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up the mock to return the default context
    require('@/contexts/onboarding-context').useOnboarding.mockReturnValue(mockOnboardingContext);
  });

  it('renders welcome message for student role', () => {
    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.getByText('Welcome to your learning journey!')).toBeInTheDocument();
    expect(screen.getByText("You're all set to start learning and growing with us.")).toBeInTheDocument();
    expect(screen.getByText("You're set up as a Student")).toBeInTheDocument();
  });

  it('renders role-specific next steps for student', () => {
    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.getByText('Join classes using class codes from your teachers')).toBeInTheDocument();
    expect(screen.getByText('View and complete assignments')).toBeInTheDocument();
    expect(screen.getByText('Track your progress and grades')).toBeInTheDocument();
    expect(screen.getByText('Participate in peer reviews and discussions')).toBeInTheDocument();
  });

  it('renders dashboard features for student', () => {
    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.getByText('Assignment Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Grade Tracker')).toBeInTheDocument();
    expect(screen.getByText('Class Materials')).toBeInTheDocument();
    expect(screen.getByText('Peer Reviews')).toBeInTheDocument();
  });

  it('renders different content for teacher role', () => {
    const teacherContext = {
      ...mockOnboardingContext,
      onboardingData: {
        ...mockOnboardingContext.onboardingData,
        role: UserRole.TEACHER
      }
    };

    require('@/contexts/onboarding-context').useOnboarding.mockReturnValue(teacherContext);

    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.getByText('Welcome to your teaching platform!')).toBeInTheDocument();
    expect(screen.getByText("You're set up as a Teacher")).toBeInTheDocument();
    expect(screen.getByText('Create and manage your classes')).toBeInTheDocument();
    expect(screen.getByText('Class Management')).toBeInTheDocument();
  });

  it('renders different content for institution admin role', () => {
    const adminContext = {
      ...mockOnboardingContext,
      onboardingData: {
        ...mockOnboardingContext.onboardingData,
        role: UserRole.INSTITUTION_ADMIN
      }
    };

    require('@/contexts/onboarding-context').useOnboarding.mockReturnValue(adminContext);

    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.getByText('Welcome to institution administration!')).toBeInTheDocument();
    expect(screen.getByText("You're set up as a Institution Administrator")).toBeInTheDocument();
    expect(screen.getByText('Oversee all institution users')).toBeInTheDocument();
    expect(screen.getByText('Institution Dashboard')).toBeInTheDocument();
  });

  it('shows completion summary when institution is connected', () => {
    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.getByText('Setup Complete')).toBeInTheDocument();
    expect(screen.getByText('✓ Role: Student')).toBeInTheDocument();
    expect(screen.getByText('✓ Institution: Connected')).toBeInTheDocument();
    expect(screen.getByText('✓ Department: Selected')).toBeInTheDocument();
  });

  it('calls onComplete when Get Started button is clicked', async () => {
    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    const getStartedButton = screen.getByRole('button', { name: /get started/i });
    fireEvent.click(getStartedButton);
    
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state when completing onboarding', async () => {
    const slowOnComplete = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(<WelcomeStep onComplete={slowOnComplete} />);
    
    const getStartedButton = screen.getByRole('button', { name: /get started/i });
    fireEvent.click(getStartedButton);
    
    // Should show loading state
    expect(screen.getByText('Completing Setup...')).toBeInTheDocument();
    expect(getStartedButton).toBeDisabled();
    
    // Wait for completion
    await waitFor(() => {
      expect(slowOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('handles completion errors gracefully', async () => {
    const errorOnComplete = jest.fn(() => Promise.reject(new Error('Completion failed')));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<WelcomeStep onComplete={errorOnComplete} />);
    
    const getStartedButton = screen.getByRole('button', { name: /get started/i });
    fireEvent.click(getStartedButton);
    
    await waitFor(() => {
      expect(errorOnComplete).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to complete onboarding:', expect.any(Error));
    });
    
    // Button should be enabled again after error
    expect(getStartedButton).not.toBeDisabled();
    
    consoleSpy.mockRestore();
  });

  it('shows class information when classes are joined', () => {
    const contextWithClasses = {
      ...mockOnboardingContext,
      onboardingData: {
        ...mockOnboardingContext.onboardingData,
        classIds: ['class-1', 'class-2']
      }
    };

    require('@/contexts/onboarding-context').useOnboarding.mockReturnValue(contextWithClasses);

    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.getByText('✓ Classes: 2 joined')).toBeInTheDocument();
  });

  it('does not show completion summary when no institution is connected', () => {
    const contextWithoutInstitution = {
      ...mockOnboardingContext,
      onboardingData: {
        ...mockOnboardingContext.onboardingData,
        institutionId: undefined,
        departmentId: undefined
      }
    };

    require('@/contexts/onboarding-context').useOnboarding.mockReturnValue(contextWithoutInstitution);

    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.queryByText('Setup Complete')).not.toBeInTheDocument();
  });

  it('shows help text about updating profile', () => {
    render(<WelcomeStep onComplete={mockOnComplete} />);
    
    expect(screen.getByText('You can always update your profile and settings from your dashboard')).toBeInTheDocument();
  });
});