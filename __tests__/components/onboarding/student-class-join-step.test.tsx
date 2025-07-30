import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentClassJoinStep } from '@/components/onboarding/student-class-join-step';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useClassJoin } from '@/lib/hooks/useOnboarding';
import { ClassInfo, UserRole } from '@/lib/types/onboarding';

// Mock the hooks
jest.mock('@/contexts/onboarding-context');
jest.mock('@/lib/hooks/useOnboarding');

const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;
const mockUseClassJoin = useClassJoin as jest.MockedFunction<typeof useClassJoin>;

const mockClass: ClassInfo = {
  id: 'class-1',
  name: 'Introduction to Computer Science',
  code: 'CS101',
  description: 'Learn the fundamentals of computer science',
  teacherName: 'Dr. Jane Smith',
  teacherId: 'teacher-1',
  institutionId: 'institution-1',
  departmentId: 'department-1',
  studentCount: 25,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01')
};

describe('StudentClassJoinStep', () => {
  const mockNextStep = jest.fn();
  const mockJoinClass = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
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

    mockUseClassJoin.mockReturnValue({
      joinClass: mockJoinClass,
      loading: false,
      error: null
    });
  });

  it('renders for student users', () => {
    render(<StudentClassJoinStep />);
    
    expect(screen.getByText('Join a Class')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter class code (e.g., ABC123)')).toBeInTheDocument();
    expect(screen.getByText('Join your first class to start accessing assignments and course materials.')).toBeInTheDocument();
  });

  it('does not render for non-student users', () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 3,
      totalSteps: 6,
      onboardingData: {
        userId: 'test-user',
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

    const { container } = render(<StudentClassJoinStep />);
    expect(container.firstChild).toBeNull();
  });

  it('displays help information for users without class codes', () => {
    render(<StudentClassJoinStep />);
    
    expect(screen.getByText('Don\'t have a class code?')).toBeInTheDocument();
    expect(screen.getByText('Ask your teacher for the class code. They can:')).toBeInTheDocument();
    expect(screen.getByText('Share it during class or via email')).toBeInTheDocument();
    expect(screen.getByText('You can also skip this step and join classes later from your dashboard.')).toBeInTheDocument();
  });

  it('validates class code input', async () => {
    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    // Test empty input
    fireEvent.click(joinButton);
    expect(screen.getByText('Please enter a class code')).toBeInTheDocument();
    
    // Test too short input
    fireEvent.change(input, { target: { value: 'AB' } });
    fireEvent.click(joinButton);
    expect(screen.getByText('Class codes are typically 4-10 characters long')).toBeInTheDocument();
    
    // Test too long input
    fireEvent.change(input, { target: { value: 'ABCDEFGHIJK' } });
    fireEvent.click(joinButton);
    expect(screen.getByText('Class codes are typically 4-10 characters long')).toBeInTheDocument();
    
    // Test invalid characters
    fireEvent.change(input, { target: { value: 'AB@#' } });
    fireEvent.click(joinButton);
    expect(screen.getByText('Class codes can only contain letters and numbers')).toBeInTheDocument();
  });

  it('converts class code to uppercase', () => {
    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    fireEvent.change(input, { target: { value: 'abc123' } });
    
    expect(input).toHaveValue('ABC123');
  });

  it('successfully joins a class', async () => {
    mockJoinClass.mockResolvedValue({
      success: true,
      class: mockClass,
      message: 'Successfully joined the class!'
    });

    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    fireEvent.change(input, { target: { value: 'CS101' } });
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      expect(mockJoinClass).toHaveBeenCalledWith('CS101');
    });
    
    await waitFor(() => {
      expect(screen.getByText('Successfully Joined!')).toBeInTheDocument();
      expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('25 students')).toBeInTheDocument();
    });
  });

  it('displays class preview after successful join', async () => {
    mockJoinClass.mockResolvedValue({
      success: true,
      class: mockClass,
      message: 'Successfully joined the class!'
    });

    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    fireEvent.change(input, { target: { value: 'CS101' } });
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      expect(screen.getByText('What\'s next?')).toBeInTheDocument();
      expect(screen.getByText('• View and complete assignments')).toBeInTheDocument();
      expect(screen.getByText('• Participate in class discussions')).toBeInTheDocument();
      expect(screen.getByText('• Track your progress and grades')).toBeInTheDocument();
      expect(screen.getByText('• Access course materials and resources')).toBeInTheDocument();
    });
  });

  it('shows continue button after successful class join', async () => {
    mockJoinClass.mockResolvedValue({
      success: true,
      class: mockClass,
      message: 'Successfully joined the class!'
    });

    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    fireEvent.change(input, { target: { value: 'CS101' } });
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });
  });

  it('handles class join errors', async () => {
    mockJoinClass.mockResolvedValue({
      success: false,
      error: 'Class not found'
    });

    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    fireEvent.change(input, { target: { value: 'INVALID' } });
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      expect(screen.getByText('Class not found')).toBeInTheDocument();
    });
  });

  it('displays loading state during class join', async () => {
    mockUseClassJoin.mockReturnValue({
      joinClass: mockJoinClass,
      loading: true,
      error: null
    });

    render(<StudentClassJoinStep />);
    
    expect(screen.getByText('Joining...')).toBeInTheDocument();
  });

  it('displays hook error messages', () => {
    mockUseClassJoin.mockReturnValue({
      joinClass: mockJoinClass,
      loading: false,
      error: 'Network error'
    });

    render(<StudentClassJoinStep />);
    
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('allows skipping class join', async () => {
    render(<StudentClassJoinStep />);
    
    const skipButton = screen.getByText('Skip for now');
    fireEvent.click(skipButton);
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('proceeds to next step after successful join and continue click', async () => {
    mockJoinClass.mockResolvedValue({
      success: true,
      class: mockClass,
      message: 'Successfully joined the class!'
    });

    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    fireEvent.change(input, { target: { value: 'CS101' } });
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      const continueButton = screen.getByText('Continue');
      fireEvent.click(continueButton);
    });
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('clears validation error when input changes', () => {
    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    // Trigger validation error
    fireEvent.click(joinButton);
    expect(screen.getByText('Please enter a class code')).toBeInTheDocument();
    
    // Change input should clear error
    fireEvent.change(input, { target: { value: 'ABC123' } });
    expect(screen.queryByText('Please enter a class code')).not.toBeInTheDocument();
  });

  it('shows different skip button text after joining class', async () => {
    mockJoinClass.mockResolvedValue({
      success: true,
      class: mockClass,
      message: 'Successfully joined the class!'
    });

    render(<StudentClassJoinStep />);
    
    // Initially shows "Skip for now"
    expect(screen.getByText('Skip for now')).toBeInTheDocument();
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    fireEvent.change(input, { target: { value: 'CS101' } });
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      expect(screen.getByText('Continue Setup')).toBeInTheDocument();
    });
  });

  it('shows helper text about joining classes later', () => {
    render(<StudentClassJoinStep />);
    
    expect(screen.getByText('You can join classes later from your student dashboard')).toBeInTheDocument();
  });

  it('limits class code input to 10 characters', () => {
    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    expect(input).toHaveAttribute('maxLength', '10');
  });

  it('handles join class exceptions', async () => {
    mockJoinClass.mockRejectedValue(new Error('Network error'));

    render(<StudentClassJoinStep />);
    
    const input = screen.getByPlaceholderText('Enter class code (e.g., ABC123)');
    const joinButton = screen.getByText('Join Class');
    
    fireEvent.change(input, { target: { value: 'CS101' } });
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});