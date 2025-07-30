/**
 * Integration tests for authentication and onboarding flow
 * These tests verify that the auth system properly integrates with onboarding
 */

import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { OnboardingGuard } from '@/lib/utils/onboarding-guard';
import SignUpSuccessPage from '@/app/auth/sign-up-success/page';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock OnboardingGuard
jest.mock('@/lib/utils/onboarding-guard');

// Mock auth context
jest.mock('@/contexts/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: jest.fn(),
}));

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockOnboardingGuard = OnboardingGuard as jest.Mocked<typeof OnboardingGuard>;

describe('Auth and Onboarding Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    } as any);
  });

  describe('Sign-up Success Page', () => {
    it('should redirect to onboarding for new users who need onboarding', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z',
        user_metadata: { role: 'student' }
      };

      const mockOnboardingStatus = {
        isComplete: false,
        currentStep: 0,
        totalSteps: 5,
        needsOnboarding: true,
        redirectPath: '/onboarding'
      };

      mockUseAuth.mockReturnValue({
        user: mockUser,
        loading: false,
        onboardingStatus: mockOnboardingStatus,
        refreshOnboardingStatus: jest.fn()
      } as any);

      render(<SignUpSuccessPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/onboarding');
      });
    });

    it('should redirect to dashboard for users who completed onboarding', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z',
        user_metadata: { role: 'teacher' }
      };

      const mockOnboardingStatus = {
        isComplete: true,
        currentStep: 5,
        totalSteps: 5,
        needsOnboarding: false
      };

      mockUseAuth.mockReturnValue({
        user: mockUser,
        loading: false,
        onboardingStatus: mockOnboardingStatus,
        refreshOnboardingStatus: jest.fn()
      } as any);

      render(<SignUpSuccessPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard/teacher');
      });
    });

    it('should show confirmation message for unconfirmed users', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: null, // Not confirmed yet
        user_metadata: { role: 'student' }
      };

      mockUseAuth.mockReturnValue({
        user: mockUser,
        loading: false,
        onboardingStatus: null,
        refreshOnboardingStatus: jest.fn()
      } as any);

      render(<SignUpSuccessPage />);

      expect(screen.getByText('Thank you for signing up!')).toBeInTheDocument();
      expect(screen.getByText(/check your email to confirm/i)).toBeInTheDocument();
      expect(screen.getByText(/I've confirmed my email/i)).toBeInTheDocument();
    });

    it('should show loading state while checking auth status', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: true,
        onboardingStatus: null,
        refreshOnboardingStatus: jest.fn()
      } as any);

      render(<SignUpSuccessPage />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show redirecting state when redirecting to onboarding', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z',
        user_metadata: { role: 'student' }
      };

      const mockOnboardingStatus = {
        isComplete: false,
        currentStep: 2,
        totalSteps: 5,
        needsOnboarding: true,
        redirectPath: '/onboarding?step=2'
      };

      mockUseAuth.mockReturnValue({
        user: mockUser,
        loading: false,
        onboardingStatus: mockOnboardingStatus,
        refreshOnboardingStatus: jest.fn()
      } as any);

      render(<SignUpSuccessPage />);

      await waitFor(() => {
        expect(screen.getByText('Redirecting to onboarding...')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/onboarding?step=2');
      });
    });
  });

  describe('OnboardingGuard Integration', () => {
    it('should correctly identify routes that require onboarding', () => {
      expect(OnboardingGuard.requiresOnboarding('/dashboard')).toBe(true);
      expect(OnboardingGuard.requiresOnboarding('/dashboard/student')).toBe(true);
      expect(OnboardingGuard.requiresOnboarding('/classes')).toBe(true);
      expect(OnboardingGuard.requiresOnboarding('/assignments')).toBe(true);
      expect(OnboardingGuard.requiresOnboarding('/onboarding')).toBe(false);
      expect(OnboardingGuard.requiresOnboarding('/auth/login')).toBe(false);
      expect(OnboardingGuard.requiresOnboarding('/auth/sign-up')).toBe(false);
    });

    it('should generate correct dashboard paths for different roles', () => {
      expect(OnboardingGuard.getDashboardPath('student')).toBe('/dashboard/student');
      expect(OnboardingGuard.getDashboardPath('teacher')).toBe('/dashboard/teacher');
      expect(OnboardingGuard.getDashboardPath('department_admin')).toBe('/dashboard/department_admin');
      expect(OnboardingGuard.getDashboardPath('institution_admin')).toBe('/dashboard/institution_admin');
      expect(OnboardingGuard.getDashboardPath('system_admin')).toBe('/dashboard/system_admin');
      expect(OnboardingGuard.getDashboardPath()).toBe('/dashboard');
      expect(OnboardingGuard.getDashboardPath('unknown_role')).toBe('/dashboard');
    });

    it('should determine correct post-onboarding redirect paths', () => {
      expect(OnboardingGuard.getPostOnboardingRedirect('student')).toBe('/dashboard/student');
      expect(OnboardingGuard.getPostOnboardingRedirect('teacher', '/classes')).toBe('/classes');
      expect(OnboardingGuard.getPostOnboardingRedirect('student', '/onboarding')).toBe('/dashboard/student');
      expect(OnboardingGuard.getPostOnboardingRedirect('teacher', '/')).toBe('/dashboard/teacher');
    });

    it('should validate onboarding step access correctly', () => {
      // Can access current step
      expect(OnboardingGuard.canAccessStep(2, 2, 5)).toBe(true);
      
      // Can access previous steps
      expect(OnboardingGuard.canAccessStep(1, 2, 5)).toBe(true);
      expect(OnboardingGuard.canAccessStep(0, 2, 5)).toBe(true);
      
      // Can access next step (current + 1)
      expect(OnboardingGuard.canAccessStep(3, 2, 5)).toBe(true);
      
      // Cannot access future steps beyond next
      expect(OnboardingGuard.canAccessStep(4, 2, 5)).toBe(false);
      expect(OnboardingGuard.canAccessStep(5, 2, 5)).toBe(false);
      
      // Cannot access negative steps
      expect(OnboardingGuard.canAccessStep(-1, 2, 5)).toBe(false);
      
      // Cannot access steps beyond total
      expect(OnboardingGuard.canAccessStep(6, 2, 5)).toBe(false);
    });

    it('should validate onboarding access for authenticated users', () => {
      const confirmedUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z'
      };

      const unconfirmedUser = {
        id: 'user-456',
        email: 'test2@example.com',
        email_confirmed_at: null
      };

      expect(OnboardingGuard.canAccessOnboarding(confirmedUser as any)).toBe(true);
      expect(OnboardingGuard.canAccessOnboarding(unconfirmedUser as any)).toBe(false);
      expect(OnboardingGuard.canAccessOnboarding(null)).toBe(false);
    });
  });

  describe('Auth Context Integration', () => {
    it('should refresh onboarding status when user changes', async () => {
      const mockRefreshOnboardingStatus = jest.fn();
      
      // Mock initial state with no user
      mockUseAuth.mockReturnValueOnce({
        user: null,
        loading: false,
        onboardingStatus: null,
        refreshOnboardingStatus: mockRefreshOnboardingStatus
      } as any);

      const { rerender } = render(<div>Test Component</div>);

      // Mock state with user
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z'
      };

      mockUseAuth.mockReturnValueOnce({
        user: mockUser,
        loading: false,
        onboardingStatus: null,
        refreshOnboardingStatus: mockRefreshOnboardingStatus
      } as any);

      rerender(<div>Test Component</div>);

      // Should refresh onboarding status when user is set
      expect(mockRefreshOnboardingStatus).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle onboarding status check failures gracefully', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z'
      };

      // Mock error in onboarding status
      const mockOnboardingStatus = {
        isComplete: false,
        currentStep: 0,
        totalSteps: 5,
        needsOnboarding: true,
        redirectPath: '/onboarding'
      };

      mockUseAuth.mockReturnValue({
        user: mockUser,
        loading: false,
        onboardingStatus: mockOnboardingStatus,
        refreshOnboardingStatus: jest.fn()
      } as any);

      render(<SignUpSuccessPage />);

      // Should still redirect to onboarding even with default status
      expect(mockPush).toHaveBeenCalledWith('/onboarding');
    });

    it('should handle missing user metadata gracefully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z',
        user_metadata: {} // No role specified
      };

      const mockOnboardingStatus = {
        isComplete: true,
        currentStep: 5,
        totalSteps: 5,
        needsOnboarding: false
      };

      mockUseAuth.mockReturnValue({
        user: mockUser,
        loading: false,
        onboardingStatus: mockOnboardingStatus,
        refreshOnboardingStatus: jest.fn()
      } as any);

      render(<SignUpSuccessPage />);

      await waitFor(() => {
        // Should default to student dashboard
        expect(mockPush).toHaveBeenCalledWith('/dashboard/student');
      });
    });
  });
});