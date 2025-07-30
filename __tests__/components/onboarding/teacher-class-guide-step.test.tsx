import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeacherClassGuideStep } from '@/components/onboarding/teacher-class-guide-step';
import { useOnboarding } from '@/contexts/onboarding-context';
import { UserRole } from '@/lib/types/onboarding';

// Mock the hooks
jest.mock('@/contexts/onboarding-context');

const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;

describe('TeacherClassGuideStep', () => {
  const mockNextStep = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseOnboarding.mockReturnValue({
      currentStep: 3,
      totalSteps: 6,
      onboardingData: {
        userId: 'test-teacher',
        role: UserRole.TEACHER,
        institutionId: 'institution-1',
        departmentId: 'department-1',
        currentStep: 3,
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
  });

  it('renders for teacher users', () => {
    render(<TeacherClassGuideStep />);
    
    expect(screen.getByText('Ready to create your first class? We\'ll guide you through the process step by step.')).toBeInTheDocument();
    expect(screen.getByText('Guided Class Creation')).toBeInTheDocument();
    expect(screen.getByText('Skip for Now')).toBeInTheDocument();
  });

  it('does not render for non-teacher users', () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 3,
      totalSteps: 6,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        institutionId: 'institution-1',
        departmentId: 'department-1',
        currentStep: 3,
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

    const { container } = render(<TeacherClassGuideStep />);
    expect(container.firstChild).toBeNull();
  });

  it('shows initial choice between guided creation and skip', () => {
    render(<TeacherClassGuideStep />);
    
    expect(screen.getByText('Guided Class Creation')).toBeInTheDocument();
    expect(screen.getByText('Step-by-step walkthrough to create your first class')).toBeInTheDocument();
    expect(screen.getByText('Skip for Now')).toBeInTheDocument();
    expect(screen.getByText('Continue to Profile Setup')).toBeInTheDocument();
  });

  it('displays benefits of creating a class', () => {
    render(<TeacherClassGuideStep />);
    
    expect(screen.getByText('Why create a class now?')).toBeInTheDocument();
    expect(screen.getByText('• Get familiar with the platform\'s core features')).toBeInTheDocument();
    expect(screen.getByText('• Start inviting students immediately')).toBeInTheDocument();
    expect(screen.getByText('• Set up your teaching environment')).toBeInTheDocument();
  });

  it('allows skipping class creation', async () => {
    render(<TeacherClassGuideStep />);
    
    const skipButton = screen.getByText('Continue to Profile Setup');
    fireEvent.click(skipButton);
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('starts guided creation when selected', () => {
    render(<TeacherClassGuideStep />);
    
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    expect(screen.getByText('Class Basics')).toBeInTheDocument();
    expect(screen.getByText('Let\'s start with the essential information about your class')).toBeInTheDocument();
  });

  it('shows progress indicator in guided mode', () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    // Should show step indicators
    expect(screen.getByText('1')).toBeInTheDocument(); // Current step
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays class basics form in step 1', () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    expect(screen.getByLabelText('Class Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
    expect(screen.getByLabelText('Class Code')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., Introduction to Biology')).toBeInTheDocument();
  });

  it('auto-generates class code based on class name', () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Biology 101' } });
    
    const classCodeInput = screen.getByLabelText('Class Code');
    expect(classCodeInput).toHaveValue(expect.stringMatching(/^BIOL\d{2}$/));
  });

  it('requires class name to proceed to step 2', () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();
    
    // Enter class name
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Test Class' } });
    
    expect(nextButton).not.toBeDisabled();
  });

  it('proceeds to step 2 when next is clicked', () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    // Fill required field
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Test Class' } });
    
    // Click next
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    expect(screen.getByText('Class Details')).toBeInTheDocument();
    expect(screen.getByLabelText('Class Description')).toBeInTheDocument();
  });

  it('shows description tips in step 2', () => {
    render(<TeacherClassGuideStep />);
    
    // Navigate to step 2
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Test Class' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    expect(screen.getByText('💡 Description Tips')).toBeInTheDocument();
    expect(screen.getByText('• Mention key topics you\'ll cover')).toBeInTheDocument();
    expect(screen.getByText('• Include any prerequisites')).toBeInTheDocument();
  });

  it('creates class when create button is clicked', async () => {
    render(<TeacherClassGuideStep />);
    
    // Navigate to step 2
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Test Class' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    const createButton = screen.getByText('Create Class');
    fireEvent.click(createButton);
    
    expect(screen.getByText('Creating...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Class Created Successfully!')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('shows class invitation information after creation', async () => {
    render(<TeacherClassGuideStep />);
    
    // Navigate through steps and create class
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Test Class' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    const createButton = screen.getByText('Create Class');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('How to invite students:')).toBeInTheDocument();
      expect(screen.getByText('Share the Class Code')).toBeInTheDocument();
      expect(screen.getByText('Announce in Class')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('shows what\'s next information after class creation', async () => {
    render(<TeacherClassGuideStep />);
    
    // Navigate through steps and create class
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Test Class' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    const createButton = screen.getByText('Create Class');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('What\'s next?')).toBeInTheDocument();
      expect(screen.getByText('• Create your first assignment')).toBeInTheDocument();
      expect(screen.getByText('• Set up grading rubrics')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('allows going back through steps', () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    // Go to step 2
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Test Class' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    // Go back
    const backButton = screen.getByText('Back');
    fireEvent.click(backButton);
    
    expect(screen.getByText('Class Basics')).toBeInTheDocument();
    expect(screen.getByLabelText('Class Name *')).toBeInTheDocument();
  });

  it('allows skipping the guide from any step', async () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const skipButton = screen.getByText('Skip Guide');
    fireEvent.click(skipButton);
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('continues to next onboarding step after class creation', async () => {
    render(<TeacherClassGuideStep />);
    
    // Navigate through steps and create class
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const classNameInput = screen.getByLabelText('Class Name *');
    fireEvent.change(classNameInput, { target: { value: 'Test Class' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    const createButton = screen.getByText('Create Class');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      const continueButton = screen.getByText('Continue');
      fireEvent.click(continueButton);
    }, { timeout: 2000 });
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('converts class code input to uppercase', () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    const classCodeInput = screen.getByLabelText('Class Code');
    fireEvent.change(classCodeInput, { target: { value: 'abc123' } });
    
    expect(classCodeInput).toHaveValue('ABC123');
  });

  it('shows feature badges for guided creation', () => {
    render(<TeacherClassGuideStep />);
    
    expect(screen.getByText('Interactive Guide')).toBeInTheDocument();
    expect(screen.getByText('Tips & Examples')).toBeInTheDocument();
    expect(screen.getByText('Student Invitations')).toBeInTheDocument();
  });

  it('returns to initial view when back is clicked from step 1', () => {
    render(<TeacherClassGuideStep />);
    
    // Start guided creation
    const guidedCreationCard = screen.getByText('Guided Class Creation').closest('div[class*="cursor-pointer"]');
    if (guidedCreationCard) {
      fireEvent.click(guidedCreationCard);
    }
    
    // Click back from step 1
    const backButton = screen.getByText('Back');
    fireEvent.click(backButton);
    
    expect(screen.getByText('Ready to create your first class? We\'ll guide you through the process step by step.')).toBeInTheDocument();
    expect(screen.getByText('Guided Class Creation')).toBeInTheDocument();
  });
});