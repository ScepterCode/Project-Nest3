// Unit tests for onboarding status utilities (without Supabase dependencies)

import { describe, it, expect } from '@jest/globals';
import { 
  shouldRedirectToOnboarding, 
  canAccessOnboardingStep,
  hasMinimumOnboardingData,
  getOnboardingStepUrl,
  isEmailConfirmed,
  getUserDisplayName
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

describe('Onboarding Status Utils', () => {
  describe('shouldRedirectToOnboarding', () => {
    const mockUser = createMockUser();

    it('should not redirect unauthenticated users', () => {
      expect(shouldRedirectToOnboarding(null, '/dashboard')).toBe(false);
    });

    it('should not redirect on onboarding or auth pages', () => {
      expect(shouldRedirectToOnboarding(mockUser, '/onboarding')).toBe(false);
      expect(shouldRedirectToOnboarding(mockUser, '/onboarding/step/1')).toBe(false);
      expect(shouldRedirectToOnboarding(mockUser, '/auth/login')).toBe(false);
      expect(shouldRedirectToOnboarding(mockUser, '/auth/sign-up')).toBe(false);
    });

    it('should not redirect on public pages', () => {
      expect(shouldRedirectToOnboarding(mockUser, '/')).toBe(false);
      expect(shouldRedirectToOnboarding(mockUser, '/about')).toBe(false);
      expect(shouldRedirectToOnboarding(mockUser, '/contact')).toBe(false);
    });

    it('should redirect incomplete users on protected routes', () => {
      const incompleteInfo = {
        hasProfile: false,
        onboardingCompleted: false,
        currentStep: 0
      };
      
      expect(shouldRedirectToOnboarding(mockUser, '/dashboard', incompleteInfo)).toBe(true);
      expect(shouldRedirectToOnboarding(mockUser, '/dashboard/student', incompleteInfo)).toBe(true);
      expect(shouldRedirectToOnboarding(mockUser, '/profile', incompleteInfo)).toBe(true);
      expect(shouldRedirectToOnboarding(mockUser, '/classes', incompleteInfo)).toBe(true);
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
      expect(shouldRedirectToOnboarding(mockUser, '/profile', completeInfo)).toBe(false);
    });

    it('should assume redirect needed for protected routes without onboarding info', () => {
      expect(shouldRedirectToOnboarding(mockUser, '/dashboard')).toBe(true);
      expect(shouldRedirectToOnboarding(mockUser, '/profile')).toBe(true);
    });
  });

  describe('canAccessOnboardingStep', () => {
    it('should allow access to current and adjacent steps', () => {
      expect(canAccessOnboardingStep(0, 0, 5)).toBe(true); // First step
      expect(canAccessOnboardingStep(1, 1, 5)).toBe(true); // Current step
      expect(canAccessOnboardingStep(2, 1, 5)).toBe(true); // Next step
      expect(canAccessOnboardingStep(0, 2, 5)).toBe(true); // Previous step
    });

    it('should deny access to steps too far ahead', () => {
      expect(canAccessOnboardingStep(3, 1, 5)).toBe(false);
      expect(canAccessOnboardingStep(4, 1, 5)).toBe(false);
      expect(canAccessOnboardingStep(5, 2, 5)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(canAccessOnboardingStep(-1, 1, 5)).toBe(false); // Negative step
      expect(canAccessOnboardingStep(6, 1, 5)).toBe(false); // Beyond total steps
    });

    it('should handle boundary conditions', () => {
      expect(canAccessOnboardingStep(5, 4, 5)).toBe(true); // Last step from second-to-last
      expect(canAccessOnboardingStep(5, 5, 5)).toBe(true); // Last step when current
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

    it('should validate complete teacher data', () => {
      const completeTeacher = {
        hasProfile: true,
        onboardingCompleted: true,
        currentStep: 5,
        role: 'teacher',
        institutionId: 'inst-1',
        departmentId: 'dept-1'
      };
      
      expect(hasMinimumOnboardingData(completeTeacher)).toBe(true);
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

    it('should reject missing role', () => {
      const noRole = {
        hasProfile: true,
        onboardingCompleted: false,
        currentStep: 2,
        institutionId: 'inst-1',
        departmentId: 'dept-1'
        // Missing role
      };
      
      expect(hasMinimumOnboardingData(noRole)).toBe(false);
    });

    it('should reject missing institution', () => {
      const noInstitution = {
        hasProfile: true,
        onboardingCompleted: false,
        currentStep: 2,
        role: 'student',
        departmentId: 'dept-1'
        // Missing institutionId
      };
      
      expect(hasMinimumOnboardingData(noInstitution)).toBe(false);
    });
  });

  describe('getOnboardingStepUrl', () => {
    it('should return base URL for step 0 or negative', () => {
      expect(getOnboardingStepUrl(0)).toBe('/onboarding');
      expect(getOnboardingStepUrl(-1)).toBe('/onboarding');
    });

    it('should return step-specific URL for positive steps', () => {
      expect(getOnboardingStepUrl(1)).toBe('/onboarding?step=1');
      expect(getOnboardingStepUrl(2)).toBe('/onboarding?step=2');
      expect(getOnboardingStepUrl(5)).toBe('/onboarding?step=5');
    });
  });

  describe('isEmailConfirmed', () => {
    it('should return true for confirmed emails', () => {
      const confirmedUser = createMockUser({
        email_confirmed_at: '2023-01-01T00:00:00Z'
      });
      expect(isEmailConfirmed(confirmedUser)).toBe(true);
    });

    it('should return true for legacy confirmed_at field', () => {
      const legacyConfirmedUser = createMockUser({
        email_confirmed_at: null,
        confirmed_at: '2023-01-01T00:00:00Z'
      } as any);
      expect(isEmailConfirmed(legacyConfirmedUser)).toBe(true);
    });

    it('should return false for unconfirmed emails', () => {
      const unconfirmedUser = createMockUser({
        email_confirmed_at: null
      });
      expect(isEmailConfirmed(unconfirmedUser)).toBe(false);
    });
  });

  describe('getUserDisplayName', () => {
    it('should return full name when available', () => {
      const userWithName = createMockUser({
        user_metadata: {
          first_name: 'John',
          last_name: 'Doe'
        }
      });
      expect(getUserDisplayName(userWithName)).toBe('John Doe');
    });

    it('should return full_name when available', () => {
      const userWithFullName = createMockUser({
        user_metadata: {
          full_name: 'Jane Smith'
        }
      });
      expect(getUserDisplayName(userWithFullName)).toBe('Jane Smith');
    });

    it('should return email prefix when no name available', () => {
      const userWithEmail = createMockUser({
        email: 'test.user@example.com',
        user_metadata: {}
      });
      expect(getUserDisplayName(userWithEmail)).toBe('test.user');
    });

    it('should return default when no information available', () => {
      const minimalUser = createMockUser({
        email: null,
        user_metadata: {}
      } as any);
      expect(getUserDisplayName(minimalUser)).toBe('User');
    });
  });
});