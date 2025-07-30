import React from 'react';
import { render, screen } from '@testing-library/react';
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout';
import { RoleSelectionStep } from '@/components/onboarding/role-selection-step';
import { InstitutionSelectionStep } from '@/components/onboarding/institution-selection-step';
import { StudentClassJoinStep } from '@/components/onboarding/student-class-join-step';
import { WelcomeStep } from '@/components/onboarding/welcome-step';

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

// Utility function to simulate different viewport sizes
const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
  window.dispatchEvent(new Event('resize'));
};

describe('Mobile Responsiveness Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Viewport Breakpoints', () => {
    const breakpoints = {
      mobile: { width: 375, height: 667 },
      tablet: { width: 768, height: 1024 },
      desktop: { width: 1024, height: 768 },
      large: { width: 1440, height: 900 }
    };

    Object.entries(breakpoints).forEach(([device, { width, height }]) => {
      describe(`${device} (${width}x${height})`, () => {
        beforeEach(() => {
          setViewport(width, height);
        });

        it('should render OnboardingLayout properly', () => {
          render(
            <OnboardingLayout title="Test Step">
              <div>Test content</div>
            </OnboardingLayout>
          );

          const container = screen.getByRole('main').parentElement;
          expect(container).toHaveClass('min-h-screen');
          
          const mainContent = screen.getByRole('main');
          expect(mainContent).toHaveClass('max-w-4xl', 'mx-auto');
        });

        it('should have responsive padding and spacing', () => {
          render(
            <OnboardingLayout title="Test Step">
              <div>Test content</div>
            </OnboardingLayout>
          );

          const header = screen.getByRole('banner');
          const headerContent = header.querySelector('.max-w-4xl');
          expect(headerContent).toHaveClass('px-4', 'sm:px-6', 'lg:px-8');

          const mainContent = screen.getByRole('main');
          expect(mainContent).toHaveClass('px-4', 'sm:px-6', 'lg:px-8', 'py-6', 'sm:py-8');
        });
      });
    });
  });

  describe('Touch-Friendly Interactions', () => {
    beforeEach(() => {
      setViewport(375, 667); // Mobile viewport
    });

    it('should have minimum touch target sizes (44px)', () => {
      render(
        <OnboardingLayout title="Test Step" showNext showBack>
          <div>Test content</div>
        </OnboardingLayout>
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('min-h-[44px]');
      });
    });

    it('should have touch-optimized role selection cards', () => {
      render(<RoleSelectionStep />);

      const roleCards = screen.getAllByRole('button');
      roleCards.forEach(card => {
        expect(card).toHaveClass('touch-manipulation');
        expect(card).toHaveClass('active:scale-[0.98]');
      });
    });

    it('should have touch-friendly input fields', () => {
      render(<InstitutionSelectionStep />);

      const searchInput = screen.getByLabelText('Search for your institution');
      expect(searchInput).toHaveClass('min-h-[44px]');
    });

    it('should have touch-friendly class code input', () => {
      mockOnboardingContext.onboardingData.role = 'student';
      render(<StudentClassJoinStep />);

      const classCodeInput = screen.getByLabelText('Class Code');
      expect(classCodeInput).toHaveClass('min-h-[44px]');
    });
  });

  describe('Responsive Typography', () => {
    it('should have responsive heading sizes', () => {
      render(
        <OnboardingLayout title="Test Step" description="Test description">
          <div>Test content</div>
        </OnboardingLayout>
      );

      const title = screen.getByText('Test Step');
      expect(title).toHaveClass('text-xl', 'sm:text-2xl');

      const description = screen.getByText('Test description');
      expect(description).toHaveClass('text-sm', 'sm:text-base');
    });

    it('should have responsive welcome step typography', () => {
      const mockOnComplete = jest.fn();
      render(<WelcomeStep onComplete={mockOnComplete} />);

      const welcomeHeading = screen.getByRole('heading', { level: 1 });
      expect(welcomeHeading).toHaveClass('text-xl', 'sm:text-2xl');
    });

    it('should have responsive role card typography', () => {
      render(<RoleSelectionStep />);

      const roleTitles = screen.getAllByText(/Student|Teacher|Administrator/);
      roleTitles.forEach(title => {
        if (title.tagName === 'H3') {
          expect(title).toHaveClass('text-base', 'sm:text-lg');
        }
      });
    });
  });

  describe('Layout Adaptations', () => {
    it('should stack navigation buttons on mobile', () => {
      setViewport(375, 667);
      render(
        <OnboardingLayout title="Test Step" showNext showBack>
          <div>Test content</div>
        </OnboardingLayout>
      );

      const navigation = screen.getByRole('navigation');
      expect(navigation).toHaveClass('flex-col', 'sm:flex-row');
    });

    it('should adapt header layout for mobile', () => {
      setViewport(375, 667);
      render(
        <OnboardingLayout title="Test Step">
          <div>Test content</div>
        </OnboardingLayout>
      );

      const headerContent = screen.getByRole('banner').querySelector('.flex');
      expect(headerContent).toHaveClass('flex-col', 'sm:flex-row');
    });

    it('should have responsive role card layout', () => {
      setViewport(375, 667);
      render(<RoleSelectionStep />);

      const roleCardHeaders = document.querySelectorAll('.flex.flex-col.sm\\:flex-row');
      expect(roleCardHeaders.length).toBeGreaterThan(0);
    });

    it('should adapt continue button layout', () => {
      render(<RoleSelectionStep />);

      const buttonContainer = document.querySelector('.flex.flex-col.sm\\:flex-row.sm\\:justify-end');
      expect(buttonContainer).toBeInTheDocument();
    });
  });

  describe('Content Spacing and Gaps', () => {
    it('should have responsive gaps in role selection grid', () => {
      render(<RoleSelectionStep />);

      const grid = document.querySelector('.grid');
      expect(grid).toHaveClass('gap-3', 'sm:gap-4');
    });

    it('should have responsive padding in cards', () => {
      render(<RoleSelectionStep />);

      const cardHeaders = document.querySelectorAll('.px-4.sm\\:px-6');
      expect(cardHeaders.length).toBeGreaterThan(0);

      const cardContents = document.querySelectorAll('.px-4.sm\\:px-6');
      expect(cardContents.length).toBeGreaterThan(0);
    });

    it('should have responsive navigation spacing', () => {
      render(
        <OnboardingLayout title="Test Step" showNext showBack>
          <div>Test content</div>
        </OnboardingLayout>
      );

      const navigation = screen.getByRole('navigation');
      expect(navigation).toHaveClass('mt-6', 'sm:mt-8', 'gap-4');
    });
  });

  describe('Mobile-Specific Features', () => {
    beforeEach(() => {
      setViewport(375, 667);
    });

    it('should have proper mobile input attributes', () => {
      mockOnboardingContext.onboardingData.role = 'student';
      render(<StudentClassJoinStep />);

      const classCodeInput = screen.getByLabelText('Class Code');
      expect(classCodeInput).toHaveAttribute('autoComplete', 'off');
      expect(classCodeInput).toHaveAttribute('autoCapitalize', 'characters');
      expect(classCodeInput).toHaveAttribute('spellCheck', 'false');
    });

    it('should have organization autocomplete for institution search', () => {
      render(<InstitutionSelectionStep />);

      const searchInput = screen.getByLabelText('Search for your institution');
      expect(searchInput).toHaveAttribute('autoComplete', 'organization');
    });

    it('should have touch-optimized active states', () => {
      render(<RoleSelectionStep />);

      const roleCards = screen.getAllByRole('button');
      roleCards.forEach(card => {
        expect(card).toHaveClass('active:scale-[0.98]');
      });
    });

    it('should have touch-optimized institution cards', () => {
      // Mock institutions to test
      jest.mocked(require('@/lib/hooks/useOnboarding').useInstitutionSearch).mockReturnValue({
        institutions: [
          { id: '1', name: 'Test University', domain: 'test.edu', userCount: 100, departmentCount: 5 }
        ],
        loading: false,
        error: null,
        searchInstitutions: jest.fn(),
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: jest.fn()
      });

      render(<InstitutionSelectionStep />);

      const institutionCards = document.querySelectorAll('.touch-manipulation.active\\:scale-\\[0\\.98\\]');
      expect(institutionCards.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Images and Icons', () => {
    it('should have appropriately sized icons', () => {
      render(<RoleSelectionStep />);

      const roleIcons = document.querySelectorAll('.h-5.w-5');
      expect(roleIcons.length).toBeGreaterThan(0);
    });

    it('should have responsive success icon in welcome step', () => {
      const mockOnComplete = jest.fn();
      render(<WelcomeStep onComplete={mockOnComplete} />);

      const successIcon = document.querySelector('.h-8.w-8');
      expect(successIcon).toBeInTheDocument();
    });
  });

  describe('Overflow and Scrolling', () => {
    it('should handle content overflow properly', () => {
      render(
        <OnboardingLayout title="Very Long Title That Might Overflow On Small Screens">
          <div>Test content</div>
        </OnboardingLayout>
      );

      const container = screen.getByRole('main').parentElement;
      expect(container).toHaveClass('min-h-screen');
    });

    it('should have proper text wrapping', () => {
      render(<RoleSelectionStep />);

      const roleDescriptions = document.querySelectorAll('.min-w-0.flex-1');
      expect(roleDescriptions.length).toBeGreaterThan(0);
    });

    it('should handle badge wrapping in role cards', () => {
      render(<RoleSelectionStep />);

      const badgeContainers = document.querySelectorAll('.flex.flex-wrap');
      expect(badgeContainers.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Considerations', () => {
    it('should use CSS transforms for touch feedback', () => {
      render(<RoleSelectionStep />);

      const roleCards = screen.getAllByRole('button');
      roleCards.forEach(card => {
        expect(card).toHaveClass('active:scale-[0.98]');
      });
    });

    it('should use efficient transition classes', () => {
      render(<RoleSelectionStep />);

      const roleCards = screen.getAllByRole('button');
      roleCards.forEach(card => {
        expect(card).toHaveClass('transition-all', 'duration-200');
      });
    });
  });
});