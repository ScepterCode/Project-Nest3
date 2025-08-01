// Onboarding route protection and redirection utilities

import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { onboardingService } from '@/lib/services/onboarding';

export interface OnboardingStatus {
  isComplete: boolean;
  currentStep: number;
  totalSteps: number;
  needsOnboarding: boolean;
  redirectPath?: string;
}

export class OnboardingGuard {
  /**
   * Check if user needs onboarding and determine redirect path
   */
  static async checkOnboardingStatus(user: User): Promise<OnboardingStatus> {
    try {
      // Check if user has completed onboarding in the users table
      const supabase = createClient();
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking user onboarding status:', error);
        // If we can't check, assume onboarding is needed
        return {
          isComplete: false,
          currentStep: 0,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: '/onboarding'
        };
      }

      // If user profile doesn't exist, they need onboarding
      if (!userProfile) {
        return {
          isComplete: false,
          currentStep: 0,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: '/onboarding'
        };
      }

      // If onboarding is marked as complete, no redirect needed
      if (userProfile.onboarding_completed) {
        return {
          isComplete: true,
          currentStep: 5,
          totalSteps: 5,
          needsOnboarding: false
        };
      }

      // Check onboarding session for current progress
      try {
        const session = await onboardingService.getOnboardingSession(user.id);
        const currentStep = session?.currentStep || 0;

        return {
          isComplete: false,
          currentStep,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: `/onboarding?step=${currentStep}`
        };
      } catch {
        // If session check fails, use basic onboarding redirect
        return {
          isComplete: false,
          currentStep: 0,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: '/onboarding'
        };
      }
    } catch (error) {
      console.error('Error in onboarding status check:', error);
      // Default to requiring onboarding on error
      return {
        isComplete: false,
        currentStep: 0,
        totalSteps: 5,
        needsOnboarding: true,
        redirectPath: '/onboarding'
      };
    }
  }

  /**
   * Check if a specific route requires onboarding completion
   */
  static requiresOnboarding(pathname: string): boolean {
    const protectedRoutes = [
      '/dashboard',
      '/classes',
      '/assignments',
      '/grades',
      '/profile',
      '/settings'
    ];

    const onboardingRoutes = [
      '/onboarding',
      '/auth'
    ];

    // Don't protect onboarding or auth routes
    if (onboardingRoutes.some(route => pathname.startsWith(route))) {
      return false;
    }

    // Protect dashboard and related routes
    return protectedRoutes.some(route => pathname.startsWith(route));
  }

  /**
   * Get the appropriate dashboard path based on user role
   */
  static getDashboardPath(userRole?: string): string {
    switch (userRole) {
      case 'student':
        return '/dashboard/student';
      case 'teacher':
        return '/dashboard/teacher';
      case 'department_admin':
        return '/dashboard/department_admin';
      case 'institution_admin':
        return '/dashboard/institution_admin';
      case 'system_admin':
        return '/dashboard/system_admin';
      default:
        return '/dashboard';
    }
  }

  /**
   * Determine where to redirect user after onboarding completion
   */
  static getPostOnboardingRedirect(userRole?: string, intendedPath?: string): string {
    // If user was trying to access a specific path, redirect there
    if (intendedPath && intendedPath !== '/onboarding' && intendedPath !== '/') {
      return intendedPath;
    }

    // Otherwise, redirect to appropriate dashboard
    return this.getDashboardPath(userRole);
  }

  /**
   * Check if user can access onboarding (must be authenticated)
   */
  static canAccessOnboarding(user: User | null): boolean {
    return !!user && !!user.email_confirmed_at;
  }

  /**
   * Validate onboarding step access
   */
  static canAccessStep(requestedStep: number, currentStep: number, totalSteps: number): boolean {
    // Can access current step or any previous step
    // Cannot access future steps
    return requestedStep >= 0 &&
      requestedStep <= Math.min(currentStep + 1, totalSteps) &&
      requestedStep <= totalSteps;
  }
}

// Utility function for client-side route protection
export function useOnboardingRedirect() {
  return {
    /**
     * Client-side redirect to onboarding if needed
     */
    redirectToOnboarding: (step?: number) => {
      const path = step !== undefined ? `/onboarding?step=${step}` : '/onboarding';
      window.location.href = path;
    },

    /**
     * Client-side redirect to dashboard after onboarding
     */
    redirectToDashboard: (userRole?: string, intendedPath?: string) => {
      const path = OnboardingGuard.getPostOnboardingRedirect(userRole, intendedPath);
      window.location.href = path;
    },

    /**
     * Check if current path requires onboarding
     */
    pathRequiresOnboarding: (pathname: string) => {
      return OnboardingGuard.requiresOnboarding(pathname);
    }
  };
}