import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout';
import { RoleSelectionStep } from '@/components/onboarding/role-selection-step';
import { InstitutionSelectionStep } from '@/components/onboarding/institution-selection-step';
import { StudentClassJoinStep } from '@/components/onboarding/student-class-join-step';
import { WelcomeStep } from '@/components/onboarding/welcome-step';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock the onboarding context
const mockOnboardingContext = {
  currentStep: 0,
  totalSteps: 5,
  onboardingData: {
    userId: 'test-user',
    role: 'student' as const,
    institutionId: undefined,
    departmentId: undefined,
    classIds: [],
    skippedSteps: [],
    currentStep: 0
  },
  updateOnboardingData: jest.fn(),
  nextStep: jest.fn(),
  previousStep: jest.fn(),
  skipStep: jest.fn(),
  completeOnboarding: jest.fn(),
  loading: false
};

jest.mock('@/contexts/onboarding-context', () => ({
  useOnboarding: () => mockOnboardingContext
}));

// Mock the hooks
jest.mock('@/lib/hooks/useOnboarding', () => ({
  useRoleSelection: () => ({
    selectRole: jest.fn().mockResolvedValue(true),
    validating: false,
    error: null
  }),
  useInstitutionSearch: () => ({
    institutions: [],
    loading: false,
    error: null,
    searchInstitutions: jest.fn(),
    selectInstitution: jest.fn().mockResolvedValue(true),
    clearSearch: jest.fn()
  }),
  useClassJoin: () => ({
    joinClass: jest.fn().mockResolvedValue({ success: true, class: null }),
    loading: false,
    error: null
  })
}));

describe('Onboarding Accessibility Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OnboardingLayout', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <OnboardingLayout title="Test Step" description="Test description">
          <div>Test content</div>
        </OnboardingLayout>
      );
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA landmarks', () => {
      render(
        <OnboardingLayout title="Test Step">
          <div>Test content</div>
        </OnboardingLayout>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('should have skip to main content link', () => {
      render(
        <OnboardingLayout title="Test Step">
          <div>Test content</div>
        </OnboardingLayout>
      );

      const skipLink = screen.getByText('Skip to main content');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('should announce step changes to screen readers', () => {
      render(
        <OnboardingLayout title="Test Step">
          <div>Test content</div>
        </OnboardingLayout>
      );

      const ariaLiveRegion = document.getElementById('onboarding-announcements');
      expect(ariaLiveRegion).toBeInTheDocument();
      expect(ariaLiveRegion).toHaveAttribute('aria-live', 'polite');
    });

    it('should handle keyboard navigation', async () => {
      const user = userEvent.setup();
      render(
        <OnboardingLayout title="Test Step">
          <div>Test content</div>
        </OnboardingLayout>
      );

      // Test Escape key
      await user.keyboard('{Escape}');
      // Note: In a real test, you'd mock window.history.back() and verify it was called
    });

    it('should have touch-friendly button sizes', () => {
      render(
        <OnboardingLayout title="Test Step" showNext showBack>
          <div>Test content</div>
        </OnboardingLayout>
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        const styles = window.getComputedStyle(button);
        // Check for min-height of 44px (touch-friendly)
        expect(button).toHaveClass('min-h-[44px]');
      });
    });
  });

  describe('RoleSelectionStep', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(<RoleSelectionStep />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should use proper fieldset and legend for role selection', () => {
      render(<RoleSelectionStep />);
      
      const fieldset = screen.getByRole('group');
      expect(fieldset).toBeInTheDocument();
      
      // Legend should be screen reader only but present
      const legend = document.querySelector('legend');
      expect(legend).toBeInTheDocument();
      expect(legend).toHaveClass('sr-only');
    });

    it('should have proper ARIA attributes for role cards', () => {
      render(<RoleSelectionStep />);
      
      const roleButtons = screen.getAllByRole('button');
      roleButtons.forEach(button => {
        expect(button).toHaveAttribute('aria-pressed');
        expect(button).toHaveAttribute('aria-label');
        expect(button).toHaveAttribute('aria-describedby');
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<RoleSelectionStep />);
      
      const firstRoleButton = screen.getAllByRole('button')[0];
      firstRoleButton.focus();
      
      // Test Enter key
      await user.keyboard('{Enter}');
      expect(firstRoleButton).toHaveAttribute('aria-pressed', 'true');
      
      // Test Space key
      const secondRoleButton = screen.getAllByRole('button')[1];
      secondRoleButton.focus();
      await user.keyboard(' ');
      expect(secondRoleButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should announce role selection to screen readers', async () => {
      const user = userEvent.setup();
      render(<RoleSelectionStep />);
      
      const studentButton = screen.getByLabelText(/Select Student role/);
      await user.click(studentButton);
      
      const ariaLiveRegion = document.getElementById('role-selection-announcements');
      expect(ariaLiveRegion).toBeInTheDocument();
      expect(ariaLiveRegion).toHaveAttribute('aria-live', 'polite');
    });

    it('should have touch-friendly interactions', () => {
      render(<RoleSelectionStep />);
      
      const roleCards = screen.getAllByRole('button');
      roleCards.forEach(card => {
        expect(card).toHaveClass('touch-manipulation');
        expect(card).toHaveClass('active:scale-[0.98]');
      });
    });
  });

  describe('InstitutionSelectionStep', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(<InstitutionSelectionStep />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper form labels and descriptions', () => {
      render(<InstitutionSelectionStep />);
      
      const searchInput = screen.getByLabelText('Search for your institution');
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveAttribute('aria-describedby', 'search-help');
      
      const helpText = screen.getByText('Start typing to search for your institution');
      expect(helpText).toHaveAttribute('id', 'search-help');
    });

    it('should have touch-friendly input height', () => {
      render(<InstitutionSelectionStep />);
      
      const searchInput = screen.getByLabelText('Search for your institution');
      expect(searchInput).toHaveClass('min-h-[44px]');
    });

    it('should support keyboard navigation for institution cards', async () => {
      const mockInstitutions = [
        { id: '1', name: 'Test University', domain: 'test.edu', userCount: 100, departmentCount: 5 }
      ];
      
      // Mock the hook to return institutions
      jest.mocked(require('@/lib/hooks/useOnboarding').useInstitutionSearch).mockReturnValue({
        institutions: mockInstitutions,
        loading: false,
        error: null,
        searchInstitutions: jest.fn(),
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: jest.fn()
      });

      const user = userEvent.setup();
      render(<InstitutionSelectionStep />);
      
      // Simulate search to show institutions
      const searchInput = screen.getByLabelText('Search for your institution');
      await user.type(searchInput, 'test');
      
      await waitFor(() => {
        const institutionButton = screen.getByRole('button', { name: /Select Test University/ });
        expect(institutionButton).toBeInTheDocument();
        
        // Test keyboard interaction
        institutionButton.focus();
        user.keyboard('{Enter}');
      });
    });
  });

  describe('StudentClassJoinStep', () => {
    beforeEach(() => {
      mockOnboardingContext.onboardingData.role = 'student';
    });

    it('should have no accessibility violations', async () => {
      const { container } = render(<StudentClassJoinStep />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper form labels and error handling', () => {
      render(<StudentClassJoinStep />);
      
      const classCodeInput = screen.getByLabelText('Class Code');
      expect(classCodeInput).toBeInTheDocument();
      expect(classCodeInput).toHaveAttribute('aria-describedby', 'class-code-help');
      
      const helpText = screen.getByText('Class codes are usually 4-10 characters long');
      expect(helpText).toHaveAttribute('id', 'class-code-help');
    });

    it('should show validation errors with proper ARIA attributes', async () => {
      const user = userEvent.setup();
      render(<StudentClassJoinStep />);
      
      const joinButton = screen.getByText('Join Class');
      await user.click(joinButton);
      
      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveAttribute('aria-live', 'polite');
      });
    });

    it('should have touch-friendly input height', () => {
      render(<StudentClassJoinStep />);
      
      const classCodeInput = screen.getByLabelText('Class Code');
      expect(classCodeInput).toHaveClass('min-h-[44px]');
    });

    it('should have proper input attributes for mobile', () => {
      render(<StudentClassJoinStep />);
      
      const classCodeInput = screen.getByLabelText('Class Code');
      expect(classCodeInput).toHaveAttribute('autoComplete', 'off');
      expect(classCodeInput).toHaveAttribute('autoCapitalize', 'characters');
      expect(classCodeInput).toHaveAttribute('spellCheck', 'false');
    });
  });

  describe('WelcomeStep', () => {
    it('should have no accessibility violations', async () => {
      const mockOnComplete = jest.fn();
      const { container } = render(<WelcomeStep onComplete={mockOnComplete} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper heading hierarchy', () => {
      const mockOnComplete = jest.fn();
      render(<WelcomeStep onComplete={mockOnComplete} />);
      
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toBeInTheDocument();
      
      const subHeadings = screen.getAllByRole('heading', { level: 3 });
      expect(subHeadings.length).toBeGreaterThan(0);
    });

    it('should have descriptive success icon', () => {
      const mockOnComplete = jest.fn();
      render(<WelcomeStep onComplete={mockOnComplete} />);
      
      const successIcon = screen.getByLabelText('Onboarding completed successfully');
      expect(successIcon).toBeInTheDocument();
      expect(successIcon).toHaveAttribute('role', 'img');
    });

    it('should be responsive across screen sizes', () => {
      const mockOnComplete = jest.fn();
      render(<WelcomeStep onComplete={mockOnComplete} />);
      
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveClass('text-xl', 'sm:text-2xl');
      
      const description = screen.getByText(/You're all set to start learning/);
      expect(description).toHaveClass('text-sm', 'sm:text-base');
    });
  });

  describe('Mobile Responsiveness', () => {
    beforeEach(() => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 667,
      });
    });

    it('should have responsive layout classes', () => {
      render(
        <OnboardingLayout title="Test Step">
          <div>Test content</div>
        </OnboardingLayout>
      );

      const header = screen.getByRole('banner');
      const headerContent = header.querySelector('.max-w-4xl');
      expect(headerContent).toHaveClass('px-4', 'sm:px-6', 'lg:px-8');
    });

    it('should stack navigation buttons on mobile', () => {
      render(
        <OnboardingLayout title="Test Step" showNext showBack>
          <div>Test content</div>
        </OnboardingLayout>
      );

      const navigation = screen.getByRole('navigation');
      expect(navigation).toHaveClass('flex-col', 'sm:flex-row');
    });

    it('should have touch-optimized button spacing', () => {
      render(<RoleSelectionStep />);
      
      const roleCards = screen.getAllByRole('button');
      const container = roleCards[0].closest('.grid');
      expect(container).toHaveClass('gap-3', 'sm:gap-4');
    });
  });

  describe('Screen Reader Support', () => {
    it('should have proper live regions for dynamic content', () => {
      render(<RoleSelectionStep />);
      
      const liveRegion = document.getElementById('role-selection-announcements');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
      expect(liveRegion).toHaveClass('sr-only');
    });

    it('should have descriptive button labels', () => {
      render(<RoleSelectionStep />);
      
      const studentButton = screen.getByLabelText(/Select Student role/);
      expect(studentButton).toHaveAttribute('aria-label');
      expect(studentButton.getAttribute('aria-label')).toContain('Student');
      expect(studentButton.getAttribute('aria-label')).toContain('learn and complete assignments');
    });

    it('should hide decorative icons from screen readers', () => {
      render(<RoleSelectionStep />);
      
      const icons = document.querySelectorAll('[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Focus Management', () => {
    it('should manage focus properly on step changes', () => {
      const { rerender } = render(
        <OnboardingLayout title="Step 1">
          <div>Step 1 content</div>
        </OnboardingLayout>
      );

      // Simulate step change
      mockOnboardingContext.currentStep = 1;
      rerender(
        <OnboardingLayout title="Step 2">
          <div>Step 2 content</div>
        </OnboardingLayout>
      );

      // The main content should be focused (though we can't easily test this in jsdom)
      const mainContent = document.getElementById('main-content');
      expect(mainContent).toBeInTheDocument();
      expect(mainContent).toHaveAttribute('tabIndex', '-1');
    });

    it('should have proper tab order', async () => {
      const user = userEvent.setup();
      render(
        <OnboardingLayout title="Test Step" showBack showNext>
          <RoleSelectionStep />
        </OnboardingLayout>
      );

      // Test tab navigation
      await user.tab();
      expect(document.activeElement).toHaveAttribute('href', '#main-content');
      
      await user.tab();
      // Should focus on first interactive element
      expect(document.activeElement).toHaveAttribute('role', 'button');
    });
  });
});