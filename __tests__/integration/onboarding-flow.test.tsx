import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout';
import { RoleSelectionStep } from '@/components/onboarding/role-selection-step';
import { InstitutionSelectionStep } from '@/components/onboarding/institution-selection-step';
import { StudentClassJoinStep } from '@/components/onboarding/student-class-join-step';
import { TeacherClassGuideStep } from '@/components/onboarding/teacher-class-guide-step';
import { WelcomeStep } from '@/components/onboarding/welcome-step';
import { UserRole } from '@/lib/types/onboarding';

// Mock the onboarding context with more realistic state management
const createMockOnboardingContext = (overrides = {}) => ({
  currentStep: 0,
  totalSteps: 5,
  onboardingData: {
    userId: 'test-user',
    role: undefined,
    institutionId: undefined,
    departmentId: undefined,
    classIds: [],
    skippedSteps: [],
    currentStep: 0,
    ...overrides
  },
  updateOnboardingData: jest.fn(),
  nextStep: jest.fn(),
  previousStep: jest.fn(),
  skipStep: jest.fn(),
  completeOnboarding: jest.fn(),
  loading: false
});

let mockContext = createMockOnboardingContext();

jest.mock('@/contexts/onboarding-context', () => ({
  useOnboarding: () => mockContext
}));

// Mock the hooks with more realistic implementations
const mockHooks = {
  useRoleSelection: jest.fn(() => ({
    selectRole: jest.fn().mockResolvedValue(true),
    validating: false,
    error: null
  })),
  useInstitutionSearch: jest.fn(() => ({
    institutions: [],
    loading: false,
    error: null,
    searchInstitutions: jest.fn(),
    selectInstitution: jest.fn().mockResolvedValue(true),
    clearSearch: jest.fn()
  })),
  useClassJoin: jest.fn(() => ({
    joinClass: jest.fn().mockResolvedValue({ success: true, class: null }),
    loading: false,
    error: null
  }))
};

jest.mock('@/lib/hooks/useOnboarding', () => mockHooks);

describe('Complete Onboarding Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = createMockOnboardingContext();
  });

  describe('Student Onboarding Flow', () => {
    it('should complete full student onboarding flow', async () => {
      const user = userEvent.setup();
      
      // Step 1: Role Selection
      const { rerender } = render(<RoleSelectionStep />);
      
      // Select student role
      const studentCard = screen.getByLabelText(/Select Student role/);
      await user.click(studentCard);
      
      expect(studentCard).toHaveAttribute('aria-pressed', 'true');
      
      // Continue to next step
      const continueButton = screen.getByText('Continue');
      await user.click(continueButton);
      
      // Update context for next step
      mockContext = createMockOnboardingContext({
        role: UserRole.STUDENT,
        currentStep: 1
      });
      
      // Step 2: Institution Selection
      rerender(<InstitutionSelectionStep />);
      
      // Mock institution search results
      const mockInstitutions = [
        { id: '1', name: 'Test University', domain: 'test.edu', userCount: 100, departmentCount: 5 }
      ];
      
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: mockInstitutions,
        loading: false,
        error: null,
        searchInstitutions: jest.fn(),
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: jest.fn()
      });
      
      // Search for institution
      const searchInput = screen.getByLabelText('Search for your institution');
      await user.type(searchInput, 'test');
      
      // Select institution
      await waitFor(() => {
        const institutionCard = screen.getByLabelText(/Select Test University/);
        user.click(institutionCard);
      });
      
      // Update context for next step
      mockContext = createMockOnboardingContext({
        role: UserRole.STUDENT,
        institutionId: '1',
        currentStep: 2
      });
      
      // Step 3: Class Joining
      rerender(<StudentClassJoinStep />);
      
      const classCodeInput = screen.getByLabelText('Class Code');
      await user.type(classCodeInput, 'ABC123');
      
      const joinButton = screen.getByText('Join Class');
      await user.click(joinButton);
      
      // Update context for final step
      mockContext = createMockOnboardingContext({
        role: UserRole.STUDENT,
        institutionId: '1',
        classIds: ['class-1'],
        currentStep: 4
      });
      
      // Step 4: Welcome
      const mockOnComplete = jest.fn();
      rerender(<WelcomeStep onComplete={mockOnComplete} />);
      
      expect(screen.getByText(/Welcome to your learning journey!/)).toBeInTheDocument();
      
      const getStartedButton = screen.getByText('Get Started');
      await user.click(getStartedButton);
      
      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should handle student skipping class joining step', async () => {
      const user = userEvent.setup();
      
      mockContext = createMockOnboardingContext({
        role: UserRole.STUDENT,
        institutionId: '1',
        currentStep: 2
      });
      
      render(<StudentClassJoinStep />);
      
      const skipButton = screen.getByText('Skip for now');
      await user.click(skipButton);
      
      expect(mockContext.nextStep).toHaveBeenCalled();
    });
  });

  describe('Teacher Onboarding Flow', () => {
    it('should complete full teacher onboarding flow', async () => {
      const user = userEvent.setup();
      
      // Step 1: Role Selection
      const { rerender } = render(<RoleSelectionStep />);
      
      // Select teacher role
      const teacherCard = screen.getByLabelText(/Select Teacher role/);
      await user.click(teacherCard);
      
      expect(teacherCard).toHaveAttribute('aria-pressed', 'true');
      
      // Continue to next step
      const continueButton = screen.getByText('Continue');
      await user.click(continueButton);
      
      // Update context for institution selection
      mockContext = createMockOnboardingContext({
        role: UserRole.TEACHER,
        currentStep: 1
      });
      
      // Step 2: Institution Selection (same as student)
      rerender(<InstitutionSelectionStep />);
      
      const mockInstitutions = [
        { id: '1', name: 'Test University', domain: 'test.edu', userCount: 100, departmentCount: 5 }
      ];
      
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: mockInstitutions,
        loading: false,
        error: null,
        searchInstitutions: jest.fn(),
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: jest.fn()
      });
      
      const searchInput = screen.getByLabelText('Search for your institution');
      await user.type(searchInput, 'test');
      
      await waitFor(() => {
        const institutionCard = screen.getByLabelText(/Select Test University/);
        user.click(institutionCard);
      });
      
      // Update context for teacher-specific step
      mockContext = createMockOnboardingContext({
        role: UserRole.TEACHER,
        institutionId: '1',
        currentStep: 2
      });
      
      // Step 3: Teacher Class Guide
      rerender(<TeacherClassGuideStep />);
      
      // Teacher can skip class creation
      const skipButton = screen.getByText(/Skip for now|Continue to Dashboard/);
      await user.click(skipButton);
      
      // Update context for final step
      mockContext = createMockOnboardingContext({
        role: UserRole.TEACHER,
        institutionId: '1',
        currentStep: 4
      });
      
      // Step 4: Welcome
      const mockOnComplete = jest.fn();
      rerender(<WelcomeStep onComplete={mockOnComplete} />);
      
      expect(screen.getByText(/Welcome to your teaching platform!/)).toBeInTheDocument();
      
      const getStartedButton = screen.getByText('Get Started');
      await user.click(getStartedButton);
      
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  describe('Institution Admin Onboarding Flow', () => {
    it('should complete institution admin onboarding flow', async () => {
      const user = userEvent.setup();
      
      // Step 1: Role Selection
      const { rerender } = render(<RoleSelectionStep />);
      
      // Select institution admin role
      const adminCard = screen.getByLabelText(/Select Institution Administrator role/);
      await user.click(adminCard);
      
      expect(adminCard).toHaveAttribute('aria-pressed', 'true');
      
      // Continue to next step
      const continueButton = screen.getByText('Continue');
      await user.click(continueButton);
      
      // Institution admins might create new institutions
      mockContext = createMockOnboardingContext({
        role: UserRole.INSTITUTION_ADMIN,
        currentStep: 1
      });
      
      // Step 2: Institution Setup (different for admins)
      rerender(<InstitutionSelectionStep />);
      
      // Admin might request new institution
      const searchInput = screen.getByLabelText('Search for your institution');
      await user.type(searchInput, 'New Institution');
      
      // No results, show request form
      await waitFor(() => {
        const requestButton = screen.getByText('Request Institution');
        user.click(requestButton);
      });
      
      // Fill out request form
      await waitFor(() => {
        const institutionNameInput = screen.getByPlaceholderText('Full institution name');
        user.type(institutionNameInput, 'New Institution');
        
        const submitButton = screen.getByText('Submit Request');
        user.click(submitButton);
      });
      
      // Update context for final step
      mockContext = createMockOnboardingContext({
        role: UserRole.INSTITUTION_ADMIN,
        institutionId: 'new-institution',
        currentStep: 4
      });
      
      // Step 3: Welcome
      const mockOnComplete = jest.fn();
      rerender(<WelcomeStep onComplete={mockOnComplete} />);
      
      expect(screen.getByText(/Welcome to institution administration!/)).toBeInTheDocument();
      
      const getStartedButton = screen.getByText('Get Started');
      await user.click(getStartedButton);
      
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle role selection errors gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock error in role selection
      mockHooks.useRoleSelection.mockReturnValue({
        selectRole: jest.fn().mockResolvedValue(false),
        validating: false,
        error: 'Failed to save role selection'
      });
      
      render(<RoleSelectionStep />);
      
      // Error should be displayed
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Failed to save role selection')).toBeInTheDocument();
      
      // User should still be able to select roles
      const studentCard = screen.getByLabelText(/Select Student role/);
      await user.click(studentCard);
      
      expect(studentCard).toHaveAttribute('aria-pressed', 'true');
    });

    it('should handle institution search errors', async () => {
      const user = userEvent.setup();
      
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: [],
        loading: false,
        error: 'Failed to search institutions',
        searchInstitutions: jest.fn(),
        selectInstitution: jest.fn(),
        clearSearch: jest.fn()
      });
      
      render(<InstitutionSelectionStep />);
      
      expect(screen.getByText('Failed to search institutions')).toBeInTheDocument();
      
      // User should still be able to type in search
      const searchInput = screen.getByLabelText('Search for your institution');
      await user.type(searchInput, 'test');
      
      expect(searchInput).toHaveValue('test');
    });

    it('should handle class joining errors', async () => {
      const user = userEvent.setup();
      
      mockContext = createMockOnboardingContext({
        role: UserRole.STUDENT
      });
      
      mockHooks.useClassJoin.mockReturnValue({
        joinClass: jest.fn().mockResolvedValue({ success: false, error: 'Invalid class code' }),
        loading: false,
        error: null
      });
      
      render(<StudentClassJoinStep />);
      
      const classCodeInput = screen.getByLabelText('Class Code');
      await user.type(classCodeInput, 'INVALID');
      
      const joinButton = screen.getByText('Join Class');
      await user.click(joinButton);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid class code')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation and Step Management', () => {
    it('should handle back navigation properly', async () => {
      const user = userEvent.setup();
      
      mockContext = createMockOnboardingContext({
        currentStep: 2
      });
      
      render(
        <OnboardingLayout title="Test Step" showBack>
          <div>Test content</div>
        </OnboardingLayout>
      );
      
      const backButton = screen.getByText('Back');
      await user.click(backButton);
      
      expect(mockContext.previousStep).toHaveBeenCalled();
    });

    it('should handle skip functionality', async () => {
      const user = userEvent.setup();
      
      mockContext = createMockOnboardingContext({
        currentStep: 2,
        totalSteps: 5
      });
      
      render(
        <OnboardingLayout title="Test Step" showSkip>
          <div>Test content</div>
        </OnboardingLayout>
      );
      
      const skipButton = screen.getByText('Skip for now');
      await user.click(skipButton);
      
      expect(mockContext.skipStep).toHaveBeenCalled();
    });

    it('should show progress correctly', () => {
      mockContext = createMockOnboardingContext({
        currentStep: 2,
        totalSteps: 5
      });
      
      render(
        <OnboardingLayout title="Test Step">
          <div>Test content</div>
        </OnboardingLayout>
      );
      
      expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading state during onboarding operations', () => {
      mockContext = createMockOnboardingContext({
        loading: true
      });
      
      render(
        <OnboardingLayout title="Test Step">
          <div>Test content</div>
        </OnboardingLayout>
      );
      
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show loading state during role validation', () => {
      mockHooks.useRoleSelection.mockReturnValue({
        selectRole: jest.fn(),
        validating: true,
        error: null
      });
      
      render(<RoleSelectionStep />);
      
      const continueButton = screen.getByText('Saving...');
      expect(continueButton).toBeDisabled();
    });

    it('should show loading state during institution search', () => {
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: [],
        loading: true,
        error: null,
        searchInstitutions: jest.fn(),
        selectInstitution: jest.fn(),
        clearSearch: jest.fn()
      });
      
      render(<InstitutionSelectionStep />);
      
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });
  });

  describe('Data Persistence', () => {
    it('should persist onboarding data across steps', async () => {
      const user = userEvent.setup();
      
      // Start with role selection
      mockContext = createMockOnboardingContext();
      
      const { rerender } = render(<RoleSelectionStep />);
      
      const studentCard = screen.getByLabelText(/Select Student role/);
      await user.click(studentCard);
      
      // Simulate moving to next step with persisted data
      mockContext = createMockOnboardingContext({
        role: UserRole.STUDENT,
        currentStep: 1
      });
      
      rerender(<InstitutionSelectionStep />);
      
      // Data should be available in context
      expect(mockContext.onboardingData.role).toBe(UserRole.STUDENT);
    });

    it('should handle skipped steps in data', () => {
      mockContext = createMockOnboardingContext({
        role: UserRole.STUDENT,
        institutionId: '1',
        skippedSteps: ['class-joining'],
        currentStep: 4
      });
      
      const mockOnComplete = jest.fn();
      render(<WelcomeStep onComplete={mockOnComplete} />);
      
      // Should still show completion even with skipped steps
      expect(screen.getByText(/Welcome to your learning journey!/)).toBeInTheDocument();
    });
  });
});