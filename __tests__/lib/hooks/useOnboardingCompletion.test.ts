import { renderHook, act } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useOnboardingCompletion, useOnboardingStatus, useOnboardingStepValidation } from '@/lib/hooks/useOnboardingCompletion';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock auth context
jest.mock('@/contexts/auth-context', () => ({
  useAuth: jest.fn(),
}));

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('useOnboardingCompletion', () => {
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

    // Mock sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });
  });

  it('should return correct completion state for completed onboarding', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockOnboardingStatus = {
      isComplete: true,
      currentStep: 5,
      totalSteps: 5,
      needsOnboarding: false
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      onboardingStatus: mockOnboardingStatus,
      refreshOnboardingStatus: jest.fn()
    } as any);

    const { result } = renderHook(() => useOnboardingCompletion());

    expect(result.current.isComplete).toBe(true);
    expect(result.current.currentStep).toBe(5);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.completionPercentage).toBe(100);
    expect(result.current.showReminder).toBe(false);
  });

  it('should return correct completion state for incomplete onboarding', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 2,
      totalSteps: 5,
      needsOnboarding: true,
      redirectPath: '/onboarding?step=2'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      onboardingStatus: mockOnboardingStatus,
      refreshOnboardingStatus: jest.fn()
    } as any);

    const { result } = renderHook(() => useOnboardingCompletion());

    expect(result.current.isComplete).toBe(false);
    expect(result.current.currentStep).toBe(2);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.completionPercentage).toBe(40);
  });

  it('should redirect to onboarding when redirectOnIncomplete is true', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 1,
      totalSteps: 5,
      needsOnboarding: true,
      redirectPath: '/onboarding?step=1'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      onboardingStatus: mockOnboardingStatus,
      refreshOnboardingStatus: jest.fn()
    } as any);

    renderHook(() => useOnboardingCompletion({ redirectOnIncomplete: true }));

    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=1');
  });

  it('should handle goToOnboarding function', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 2,
      totalSteps: 5,
      needsOnboarding: true,
      redirectPath: '/onboarding?step=2'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      onboardingStatus: mockOnboardingStatus,
      refreshOnboardingStatus: jest.fn()
    } as any);

    const { result } = renderHook(() => useOnboardingCompletion());

    act(() => {
      result.current.goToOnboarding();
    });

    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=2');
  });

  it('should handle dismissReminder function', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 2,
      totalSteps: 5,
      needsOnboarding: true
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      onboardingStatus: mockOnboardingStatus,
      refreshOnboardingStatus: jest.fn()
    } as any);

    const { result } = renderHook(() => useOnboardingCompletion());

    act(() => {
      result.current.dismissReminder();
    });

    expect(result.current.showReminder).toBe(false);
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith('onboarding-reminder-dismissed', 'true');
  });

  it('should call refreshOnboardingStatus when refreshStatus is called', async () => {
    const mockRefreshOnboardingStatus = jest.fn();
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 2,
      totalSteps: 5,
      needsOnboarding: true
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      onboardingStatus: mockOnboardingStatus,
      refreshOnboardingStatus: mockRefreshOnboardingStatus
    } as any);

    const { result } = renderHook(() => useOnboardingCompletion());

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(mockRefreshOnboardingStatus).toHaveBeenCalled();
  });

  it('should handle null onboarding status gracefully', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      onboardingStatus: null,
      refreshOnboardingStatus: jest.fn()
    } as any);

    const { result } = renderHook(() => useOnboardingCompletion());

    expect(result.current.isComplete).toBe(true); // null status means complete
    expect(result.current.currentStep).toBe(0);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.completionPercentage).toBe(0);
  });
});

describe('useOnboardingStatus', () => {
  it('should return correct status for completed onboarding', () => {
    const mockOnboardingStatus = {
      isComplete: true,
      currentStep: 5,
      totalSteps: 5,
      needsOnboarding: false
    };

    mockUseAuth.mockReturnValue({
      onboardingStatus: mockOnboardingStatus
    } as any);

    const { result } = renderHook(() => useOnboardingStatus());

    expect(result.current.isComplete).toBe(true);
    expect(result.current.needsOnboarding).toBe(false);
    expect(result.current.currentStep).toBe(5);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.completionPercentage).toBe(100);
  });

  it('should return correct status for incomplete onboarding', () => {
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 3,
      totalSteps: 5,
      needsOnboarding: true,
      redirectPath: '/onboarding?step=3'
    };

    mockUseAuth.mockReturnValue({
      onboardingStatus: mockOnboardingStatus
    } as any);

    const { result } = renderHook(() => useOnboardingStatus());

    expect(result.current.isComplete).toBe(false);
    expect(result.current.needsOnboarding).toBe(true);
    expect(result.current.currentStep).toBe(3);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.completionPercentage).toBe(60);
    expect(result.current.redirectPath).toBe('/onboarding?step=3');
  });

  it('should handle null onboarding status', () => {
    mockUseAuth.mockReturnValue({
      onboardingStatus: null
    } as any);

    const { result } = renderHook(() => useOnboardingStatus());

    expect(result.current.isComplete).toBe(true);
    expect(result.current.needsOnboarding).toBe(false);
    expect(result.current.currentStep).toBe(0);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.completionPercentage).toBe(0);
  });
});

describe('useOnboardingStepValidation', () => {
  it('should allow access to current step', () => {
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 2,
      totalSteps: 5,
      needsOnboarding: true
    };

    mockUseAuth.mockReturnValue({
      onboardingStatus: mockOnboardingStatus
    } as any);

    const { result } = renderHook(() => useOnboardingStepValidation(2));

    expect(result.current.canAccess).toBe(true);
    expect(result.current.shouldRedirect).toBe(false);
    expect(result.current.redirectPath).toBe(null);
    expect(result.current.currentStep).toBe(2);
    expect(result.current.isComplete).toBe(false);
  });

  it('should allow access to previous steps', () => {
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 3,
      totalSteps: 5,
      needsOnboarding: true
    };

    mockUseAuth.mockReturnValue({
      onboardingStatus: mockOnboardingStatus
    } as any);

    const { result } = renderHook(() => useOnboardingStepValidation(1));

    expect(result.current.canAccess).toBe(true);
    expect(result.current.shouldRedirect).toBe(false);
  });

  it('should deny access to future steps', () => {
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 2,
      totalSteps: 5,
      needsOnboarding: true
    };

    mockUseAuth.mockReturnValue({
      onboardingStatus: mockOnboardingStatus
    } as any);

    const { result } = renderHook(() => useOnboardingStepValidation(4));

    expect(result.current.canAccess).toBe(false);
    expect(result.current.shouldRedirect).toBe(true);
    expect(result.current.redirectPath).toBe('/onboarding?step=2');
  });

  it('should allow access to next step', () => {
    const mockOnboardingStatus = {
      isComplete: false,
      currentStep: 2,
      totalSteps: 5,
      needsOnboarding: true
    };

    mockUseAuth.mockReturnValue({
      onboardingStatus: mockOnboardingStatus
    } as any);

    const { result } = renderHook(() => useOnboardingStepValidation(3));

    expect(result.current.canAccess).toBe(true);
    expect(result.current.shouldRedirect).toBe(false);
  });

  it('should handle completed onboarding', () => {
    const mockOnboardingStatus = {
      isComplete: true,
      currentStep: 5,
      totalSteps: 5,
      needsOnboarding: false
    };

    mockUseAuth.mockReturnValue({
      onboardingStatus: mockOnboardingStatus
    } as any);

    const { result } = renderHook(() => useOnboardingStepValidation(3));

    expect(result.current.canAccess).toBe(false); // No access needed if complete
    expect(result.current.shouldRedirect).toBe(false); // No redirect needed if complete
    expect(result.current.isComplete).toBe(true);
  });

  it('should handle null onboarding status', () => {
    mockUseAuth.mockReturnValue({
      onboardingStatus: null
    } as any);

    const { result } = renderHook(() => useOnboardingStepValidation(2));

    expect(result.current.canAccess).toBe(false);
    expect(result.current.shouldRedirect).toBe(false);
    expect(result.current.currentStep).toBe(0);
    expect(result.current.isComplete).toBe(true);
  });
});