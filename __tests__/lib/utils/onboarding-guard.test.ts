// Integration tests for onboarding route protection

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OnboardingGuard } from '@/lib/utils/onboarding-guard';
import { 
  getUserOnboardingInfo, 
  shouldRedirectToOnboarding, 
  canAccessOnboardingStep,
  getPostAuthRedirect,
  hasMinimumOnboardingData
} from '@/lib/utils/onboarding-status';
import { User } from '@supabase/supabase-js';

// Mock user object
const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'test-user-id',
  email: 'test@example.com',
  email_confirmed_at: '2023-01-01T00:00:00Z',
  user_metadata: { role: 'student' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2023-01-01T00:00:00Z',
  ...overrides
} as User);

describe('OnboardingGuard', () => {
  describe('requiresOnboarding', () => {
    it('should identify protected routes correctly', () => {
      expect(OnboardingGuard.requiresOnboarding('/dashboard')).toBe(true);
      expect(OnboardingGuard.requiresOnboarding('/dashboard/student')).toBe(true);
      expect(OnboardingGuard.requiresOnboarding('/classes')).toBe(true);
      expect(OnboardingGuard.requiresOnboarding('/assignments')).toBe(true);
      expect(OnboardingGuard.requiresOnboarding('/profile')).toBe(true);
    });

    it('should not protect onboarding and auth routes', () => {
      expect(OnboardingGuard.requiresOnboarding('/onboarding')).toBe(false);
      expect(OnboardingGuard.requiresOnboarding('/onboarding/step/1')).toBe(false);
      expect(OnboardingGuard.requiresOnboarding('/auth/login')).toBe(false);
      expect(OnboardingGuard.requiresOnboarding('/auth/sign-up')).toBe(false);
    });

    it('should not protect public routes', () => {
      expect(OnboardingGuard.requiresOnboarding('/')).toBe(false);
      expect(OnboardingGuard.requiresOnboarding('/about')).toBe(false);
      expect(OnboardingGuard.requiresOnboarding('/contact')).toBe(false);
    });
  });

  describe('getDashboardPath', () => {
    it('should return correct dashboard paths for different roles', () => {
      expect(OnboardingGuard.getDashboardPath('student')).toBe('/dashboard/student');
      expect(OnboardingGuard.getDashboardPath('teacher')).toBe('/dashboard/teacher');
      expect(OnboardingGuard.getDashboardPath('department_admin')).toBe('/dashboard/department_admin');
      expect(OnboardingGuard.getDashboardPath('institution_admin')).toBe('/dashboard/institution_admin');
      expect(OnboardingGuard.getDashboardPath('system_admin')).toBe('/dashboard/system_admin');
    });

    it('should return default dashboard for unknown roles', () => {
      expect(OnboardingGuard.getDashboardPath('unknown')).toBe('/dashboard');
      expect(OnboardingGuard.getDashboardPath()).toBe('/dashboard');
    });
  });

  describe('getPostOnboardingRedirect', () => {
    it('should redirect to intended path if provided', () => {
      const result = OnboardingGuard.getPostOnboardingRedirect('student', '/classes/123');
      expect(result).toBe('/classes/123');
    });

    it('should redirect to dashboard if no intended path', () => {
      const result = OnboardingGuard.getPostOnboardingRedirect('teacher');
      expect(result).toBe('/dashboard/teacher');
    });

    it('should not redirect to onboarding or root as intended path', () => {
      const result1 = OnboardingGuard.getPostOnboardingRedirect('student', '/onboarding');
      expect(result1).toBe('/dashboard/student');

      const result2 = OnboardingGuard.getPostOnboardingRedirect('student', '/');
      expect(result2).toBe('/dashboard/student');
    });
  });

  describe('canAccessOnboarding', () => {
    it('should allow access for confirmed users', () => {
      const user = createMockUser();
      expect(OnboardingGuard.canAccessOnboarding(user)).toBe(true);
    });

    it('should deny access for unconfirmed users', () => {
      const user = createMockUser({ email_confirmed_at: null });
      expect(OnboardingGuard.canAccessOnboarding(user)).toBe(false);
    });

    it('should deny access for null user', () => {
      expect(OnboardingGuard.canAccessOnboarding(null)).toBe(false);
    });
  });

  describe('canAccessStep', () => {
    it('should allow access to current and previous steps', () => {
      expect(OnboardingGuard.canAccessStep(0, 2, 5)).toBe(true); // Previous step
      expect(OnboardingGuard.canAccessStep(1, 2, 5)).toBe(true); // Previous step
      expect(OnboardingGuard.canAccessStep(2, 2, 5)).toBe(true); // Current step
      expect(OnboardingGuard.canAccessStep(3, 2, 5)).toBe(true); // Next step
    });

    it('should deny access to steps too far ahead', () => {
      expect(OnboardingGuard.canAccessStep(4, 2, 5)).toBe(false);
      expect(OnboardingGuard.canAccessStep(5, 2, 5)).toBe(false);
    });

    it('should deny access to invalid step numbers', () => {
      expect(OnboardingGuard.canAccessStep(-1, 2, 5)).toBe(false);
      expect(OnboardingGuard.canAccessStep(6, 2, 5)).toBe(false);
    });
  });
});

describe('Onboarding Status Utils', () => {
  describe('shouldRedirectToOnboarding', () => {
    const mockUser = createMockUser();

    it('should not redirect unauthenticated users', () => {
      expect(shouldRedirectToOnboarding(null, '/dashboard')).toBe(false);
    });

    it('should not redirect on onboarding or auth pages', () => {
      expect(shouldRedirectToOnboarding(mockUser, '/onboarding')).toBe(false);
      expect(shouldRedirectToOnboarding(mockUser, '/auth/login')).toBe(false);
    });

    it('should not redirect on public pages', () => {
      expect(shouldRedirectToOnboarding(mockUser, '/')).toBe(false);
      expect(shouldRedirectToOnboarding(mockUser, '/about')).toBe(false);
    });

    it('should redirect incomplete users on protected routes', () => {
      const incompleteInfo = {
        hasProfile: false,
        onboardingCompleted: false,
        currentStep: 0
      };
      
      expect(shouldRedirectToOnboarding(mockUser, '/dashboard', incompleteInfo)).toBe(true);
      expect(shouldRedirectToOnboarding(mockUser, '/profile', incompleteInfo)).toBe(true);
    });

    it('should not redirect completed users', () => {
      const completeInfo = {
        hasProfile: true,
        onboardingCompleted: true,
        currentStep: 5,
        role: 'student',
        institutionId: 'inst-1',
        departmentId: 'dept-1'
      };
      
      expect(shouldRedirectToOnboarding(mockUser, '/dashboard', completeInfo)).toBe(false);
    });
  });

  describe('canAccessOnboardingStep', () => {
    it('should allow access to appropriate steps', () => {
      expect(canAccessOnboardingStep(0, 0, 5)).toBe(true); // First step
      expect(canAccessOnboardingStep(1, 1, 5)).toBe(true); // Current step
      expect(canAccessOnboardingStep(2, 1, 5)).toBe(true); // Next step
      expect(canAccessOnboardingStep(0, 2, 5)).toBe(true); // Previous step
    });

    it('should deny access to steps too far ahead', () => {
      expect(canAccessOnboardingStep(3, 1, 5)).toBe(false);
      expect(canAccessOnboardingStep(5, 2, 5)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(canAccessOnboardingStep(-1, 1, 5)).toBe(false); // Negative step
      expect(canAccessOnboardingStep(6, 1, 5)).toBe(false); // Beyond total steps
    });
  });

  describe('hasMinimumOnboardingData', () => {
    it('should validate complete student data', () => {
      const completeStudent = {
        hasProfile: true,
        onboardingCompleted: true,
        currentStep: 5,
        role: 'student',
        institutionId: 'inst-1',
        departmentId: 'dept-1'
      };
      
      expect(hasMinimumOnboardingData(completeStudent)).toBe(true);
    });

    it('should validate system admin without department', () => {
      const systemAdmin = {
        hasProfile: true,
        onboardingCompleted: true,
        currentStep: 5,
        role: 'system_admin',
        institutionId: 'inst-1'
        // No department required for system admin
      };
      
      expect(hasMinimumOnboardingData(systemAdmin)).toBe(true);
    });

    it('should reject incomplete data', () => {
      const incompleteData = {
        hasProfile: true,
        onboardingCompleted: false,
        currentStep: 2,
        role: 'student',
        institutionId: 'inst-1'
        // Missing department for non-system admin
      };
      
      expect(hasMinimumOnboardingData(incompleteData)).toBe(false);
    });

    it('should reject missing profile', () => {
      const noProfile = {
        hasProfile: false,
        onboardingCompleted: false,
        currentStep: 0
      };
      
      expect(hasMinimumOnboardingData(noProfile)).toBe(false);
    });
  });

  describe('getPostAuthRedirect', () => {
    const mockUser = createMockUser();

    it('should redirect to onboarding for incomplete users', () => {
      const incompleteInfo = {
        hasProfile: false,
        onboardingCompleted: false,
        currentStep: 1
      };
      
      const result = getPostAuthRedirect(mockUser, incompleteInfo);
      expect(result).toBe('/onboarding?step=1');
    });

    it('should redirect to intended path for complete users', () => {
      const completeInfo = {
        hasProfile: true,
        onboardingCompleted: true,
        currentStep: 5,
        role: 'student',
        institutionId: 'inst-1',
        departmentId: 'dept-1'
      };
      
      const result = getPostAuthRedirect(mockUser, completeInfo, '/classes/123');
      expect(result).toBe('/classes/123');
    });

    it('should redirect to dashboard for complete users without intended path', () => {
      const completeInfo = {
        hasProfile: true,
        onboardingCompleted: true,
        currentStep: 5,
        role: 'teacher',
        institutionId: 'inst-1',
        departmentId: 'dept-1'
      };
      
      const result = getPostAuthRedirect(mockUser, completeInfo);
      expect(result).toBe('/dashboard/teacher');
    });
  });
});