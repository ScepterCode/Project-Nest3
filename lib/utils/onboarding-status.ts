// Utility functions for determining user onboarding status

import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface UserOnboardingInfo {
  hasProfile: boolean;
  onboardingCompleted: boolean;
  currentStep: number;
  role?: string;
  institutionId?: string;
  departmentId?: string;
}

/**
 * Get comprehensive onboarding information for a user
 */
export async function getUserOnboardingInfo(user: User): Promise<UserOnboardingInfo> {
  try {
    const supabase = createClient();
    
    // Fetch user profile information
    const { data: userProfile, error } = await supabase
      .from('users')
      .select('onboarding_completed, onboarding_step, role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user profile:', error);
      return {
        hasProfile: false,
        onboardingCompleted: false,
        currentStep: 0
      };
    }

    // If no profile exists, user needs to complete onboarding
    if (!userProfile) {
      return {
        hasProfile: false,
        onboardingCompleted: false,
        currentStep: 0
      };
    }

    return {
      hasProfile: true,
      onboardingCompleted: userProfile.onboarding_completed || false,
      currentStep: userProfile.onboarding_step || 0,
      role: userProfile.role,
      institutionId: userProfile.institution_id,
      departmentId: userProfile.department_id
    };
  } catch (error) {
    console.error('Error getting user onboarding info:', error);
    return {
      hasProfile: false,
      onboardingCompleted: false,
      currentStep: 0
    };
  }
}

/**
 * Check if user has completed minimum required onboarding steps
 */
export function hasMinimumOnboardingData(info: UserOnboardingInfo): boolean {
  return !!(
    info.hasProfile &&
    info.role &&
    info.institutionId &&
    (info.role === 'system_admin' || info.departmentId) // System admins don't need department
  );
}

/**
 * Determine if user should be redirected to onboarding
 */
export function shouldRedirectToOnboarding(
  user: User | null,
  pathname: string,
  onboardingInfo?: UserOnboardingInfo
): boolean {
  // Not authenticated users don't need onboarding redirect
  if (!user) return false;

  // Don't redirect if already on onboarding or auth pages
  if (pathname.startsWith('/onboarding') || pathname.startsWith('/auth')) {
    return false;
  }

  // Don't redirect for public pages
  const publicPaths = ['/', '/about', '/contact', '/privacy', '/terms'];
  if (publicPaths.includes(pathname)) {
    return false;
  }

  // If we don't have onboarding info, assume redirect is needed for protected routes
  if (!onboardingInfo) {
    return pathname.startsWith('/dashboard') || pathname.startsWith('/profile');
  }

  // Redirect if onboarding is not completed and accessing protected routes
  return !onboardingInfo.onboardingCompleted && 
         (pathname.startsWith('/dashboard') || 
          pathname.startsWith('/profile') ||
          pathname.startsWith('/classes') ||
          pathname.startsWith('/assignments'));
}

/**
 * Get the next onboarding step URL
 */
export function getOnboardingStepUrl(currentStep: number): string {
  const baseUrl = '/onboarding';
  
  if (currentStep <= 0) {
    return baseUrl;
  }
  
  return `${baseUrl}?step=${currentStep}`;
}

/**
 * Validate if user can access a specific onboarding step
 */
export function canAccessOnboardingStep(
  requestedStep: number,
  currentStep: number,
  totalSteps: number = 5
): boolean {
  // Can access current step, previous steps, or next step
  return requestedStep >= 0 && 
         requestedStep <= Math.min(currentStep + 1, totalSteps) &&
         requestedStep <= totalSteps;
}

/**
 * Get appropriate redirect path after successful authentication
 */
export function getPostAuthRedirect(
  user: User,
  onboardingInfo: UserOnboardingInfo,
  intendedPath?: string
): string {
  // If user needs onboarding, redirect to onboarding
  if (!onboardingInfo.onboardingCompleted || !hasMinimumOnboardingData(onboardingInfo)) {
    return getOnboardingStepUrl(onboardingInfo.currentStep);
  }

  // If user was trying to access a specific path, redirect there
  if (intendedPath && 
      intendedPath !== '/auth/login' && 
      intendedPath !== '/auth/sign-up' &&
      intendedPath !== '/') {
    return intendedPath;
  }

  // Otherwise, redirect to appropriate dashboard
  const role = onboardingInfo.role || user.user_metadata?.role || 'student';
  switch (role) {
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
 * Check if email is confirmed (required for onboarding)
 */
export function isEmailConfirmed(user: User): boolean {
  return !!(user.email_confirmed_at || user.confirmed_at);
}

/**
 * Get user display name for onboarding
 */
export function getUserDisplayName(user: User): string {
  if (user.user_metadata?.first_name && user.user_metadata?.last_name) {
    return `${user.user_metadata.first_name} ${user.user_metadata.last_name}`;
  }
  
  if (user.user_metadata?.full_name) {
    return user.user_metadata.full_name;
  }
  
  if (user.email) {
    return user.email.split('@')[0];
  }
  
  return 'User';
}