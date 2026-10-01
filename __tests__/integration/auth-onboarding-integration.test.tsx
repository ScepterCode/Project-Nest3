/**
 * Sign-up success page behaviour and the onboarding guard's routing rules.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { OnboardingGuard } from '@/lib/utils/onboarding-guard';
import SignUpSuccessPage from '@/app/auth/sign-up-success/page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/contexts/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useAuth: jest.fn(),
}));

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const confirmedUser = (role?: string) => ({
  id: 'user-123',
  email: 'test@example.com',
  email_confirmed_at: '2024-01-01T00:00:00Z',
  user_metadata: role ? { role } : {},
});

const signedIn = (user: unknown, onboardingStatus: unknown, loading = false) =>
  mockUseAuth.mockReturnValue({
    user,
    loading,
    onboardingStatus,
    refreshOnboardingStatus: jest.fn(),
  } as never);

describe('Sign-up success page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    } as never);
  });

  it('redirects new users to onboarding', async () => {
    signedIn(confirmedUser('student'), {
      isComplete: false,
      currentStep: 0,
      totalSteps: 5,
      needsOnboarding: true,
      redirectPath: '/onboarding',
    });
    render(<SignUpSuccessPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding'));
  });

  it('resumes onboarding at the saved step', async () => {
    signedIn(confirmedUser('student'), {
      isComplete: false,
      currentStep: 2,
      totalSteps: 5,
      needsOnboarding: true,
      redirectPath: '/onboarding?step=2',
    });
    render(<SignUpSuccessPage />);
    await waitFor(() =>
      expect(
        screen.getByText('Redirecting to onboarding...')
      ).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/onboarding?step=2')
    );
  });

  it('sends users who finished onboarding to /dashboard, which routes by their stored role', async () => {
    // Not /dashboard/<user_metadata.role>: metadata is user-editable.
    signedIn(confirmedUser('institution_admin'), {
      isComplete: true,
      currentStep: 5,
      totalSteps: 5,
      needsOnboarding: false,
    });
    render(<SignUpSuccessPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockPush).not.toHaveBeenCalledWith('/dashboard/institution_admin');
  });

  it('asks unconfirmed users to confirm their email', () => {
    signedIn({ ...confirmedUser('student'), email_confirmed_at: null }, null);
    render(<SignUpSuccessPage />);
    expect(screen.getByText('Thank you for signing up!')).toBeInTheDocument();
    expect(screen.getByText('Check your email to confirm')).toBeInTheDocument();
    expect(screen.getByText(/I've confirmed my email/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows a loading state while auth is resolving', () => {
    signedIn(null, null, true);
    render(<SignUpSuccessPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('OnboardingGuard', () => {
  it('protects app routes but not onboarding or auth routes', () => {
    for (const path of [
      '/dashboard',
      '/dashboard/student',
      '/classes',
      '/assignments',
      '/grades',
      '/profile',
      '/settings',
    ]) {
      expect(OnboardingGuard.requiresOnboarding(path)).toBe(true);
    }
    for (const path of [
      '/onboarding',
      '/onboarding?step=2',
      '/auth/login',
      '/auth/sign-up',
      '/',
    ]) {
      expect(OnboardingGuard.requiresOnboarding(path)).toBe(false);
    }
  });

  it('maps roles to dashboards (roles without a dashboard go to their profile)', () => {
    expect(OnboardingGuard.getDashboardPath('student')).toBe(
      '/dashboard/student'
    );
    expect(OnboardingGuard.getDashboardPath('teacher')).toBe(
      '/dashboard/teacher'
    );
    expect(OnboardingGuard.getDashboardPath('institution_admin')).toBe(
      '/dashboard/institution'
    );
    expect(OnboardingGuard.getDashboardPath('department_admin')).toBe(
      '/dashboard/profile'
    );
    expect(OnboardingGuard.getDashboardPath('system_admin')).toBe(
      '/dashboard/profile'
    );
    expect(OnboardingGuard.getDashboardPath()).toBe('/dashboard');
    expect(OnboardingGuard.getDashboardPath('unknown_role')).toBe('/dashboard');
  });

  it('returns users to where they were headed after onboarding', () => {
    expect(OnboardingGuard.getPostOnboardingRedirect('student')).toBe(
      '/dashboard/student'
    );
    expect(
      OnboardingGuard.getPostOnboardingRedirect('teacher', '/classes')
    ).toBe('/classes');
    expect(
      OnboardingGuard.getPostOnboardingRedirect('student', '/onboarding')
    ).toBe('/dashboard/student');
    expect(OnboardingGuard.getPostOnboardingRedirect('teacher', '/')).toBe(
      '/dashboard/teacher'
    );
  });

  it('allows the current, previous and next onboarding step only', () => {
    expect(OnboardingGuard.canAccessStep(2, 2, 5)).toBe(true);
    expect(OnboardingGuard.canAccessStep(0, 2, 5)).toBe(true);
    expect(OnboardingGuard.canAccessStep(3, 2, 5)).toBe(true);
    expect(OnboardingGuard.canAccessStep(4, 2, 5)).toBe(false);
    expect(OnboardingGuard.canAccessStep(-1, 2, 5)).toBe(false);
    expect(OnboardingGuard.canAccessStep(6, 5, 5)).toBe(false);
  });

  it('only lets confirmed users into onboarding', () => {
    expect(OnboardingGuard.canAccessOnboarding(confirmedUser() as never)).toBe(
      true
    );
    expect(
      OnboardingGuard.canAccessOnboarding({
        ...confirmedUser(),
        email_confirmed_at: null,
      } as never)
    ).toBe(false);
    expect(OnboardingGuard.canAccessOnboarding(null)).toBe(false);
  });
});
