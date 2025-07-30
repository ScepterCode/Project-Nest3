/**
 * Hook for handling onboarding completion and dashboard integration
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { OnboardingGuard } from '@/lib/utils/onboarding-guard';

interface UseOnboardingCompletionOptions {
  redirectOnIncomplete?: boolean;
  showReminders?: boolean;
  reminderDelay?: number; // milliseconds
}

interface OnboardingCompletionState {
  isComplete: boolean;
  showReminder: boolean;
  currentStep: number;
  totalSteps: number;
  completionPercentage: number;
  dismissReminder: () => void;
  goToOnboarding: () => void;
  refreshStatus: () => Promise<void>;
}

export function useOnboardingCompletion(
  options: UseOnboardingCompletionOptions = {}
): OnboardingCompletionState {
  const {
    redirectOnIncomplete = false,
    showReminders = true,
    reminderDelay = 5000 // 5 seconds
  } = options;

  const { user, onboardingStatus, refreshOnboardingStatus } = useAuth();
  const router = useRouter();
  const [showReminder, setShowReminder] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // Calculate completion percentage
  const completionPercentage = onboardingStatus
    ? Math.round((onboardingStatus.currentStep / onboardingStatus.totalSteps) * 100)
    : 0;

  // Handle redirect on incomplete onboarding
  useEffect(() => {
    if (redirectOnIncomplete && user && onboardingStatus?.needsOnboarding) {
      router.push(onboardingStatus.redirectPath || '/onboarding');
    }
  }, [redirectOnIncomplete, user, onboardingStatus, router]);

  // Handle reminder display
  useEffect(() => {
    if (
      showReminders &&
      user &&
      onboardingStatus?.needsOnboarding &&
      !reminderDismissed &&
      onboardingStatus.currentStep > 0 // Only show if user has started onboarding
    ) {
      const timer = setTimeout(() => {
        setShowReminder(true);
      }, reminderDelay);

      return () => clearTimeout(timer);
    }
  }, [showReminders, user, onboardingStatus, reminderDismissed, reminderDelay]);

  const dismissReminder = () => {
    setShowReminder(false);
    setReminderDismissed(true);
    
    // Store dismissal in sessionStorage to persist during session
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding-reminder-dismissed', 'true');
    }
  };

  const goToOnboarding = () => {
    if (onboardingStatus?.redirectPath) {
      router.push(onboardingStatus.redirectPath);
    } else {
      router.push('/onboarding');
    }
  };

  const refreshStatus = async () => {
    await refreshOnboardingStatus();
  };

  // Check if reminder was previously dismissed in this session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dismissed = sessionStorage.getItem('onboarding-reminder-dismissed');
      if (dismissed === 'true') {
        setReminderDismissed(true);
      }
    }
  }, []);

  return {
    isComplete: !onboardingStatus?.needsOnboarding,
    showReminder: showReminder && !reminderDismissed,
    currentStep: onboardingStatus?.currentStep || 0,
    totalSteps: onboardingStatus?.totalSteps || 5,
    completionPercentage,
    dismissReminder,
    goToOnboarding,
    refreshStatus
  };
}

// Hook for getting onboarding completion status without side effects
export function useOnboardingStatus() {
  const { onboardingStatus } = useAuth();
  
  return {
    isComplete: !onboardingStatus?.needsOnboarding,
    needsOnboarding: onboardingStatus?.needsOnboarding || false,
    currentStep: onboardingStatus?.currentStep || 0,
    totalSteps: onboardingStatus?.totalSteps || 5,
    redirectPath: onboardingStatus?.redirectPath,
    completionPercentage: onboardingStatus
      ? Math.round((onboardingStatus.currentStep / onboardingStatus.totalSteps) * 100)
      : 0
  };
}

// Hook for onboarding step validation
export function useOnboardingStepValidation(requestedStep: number) {
  const { onboardingStatus } = useAuth();
  
  const canAccess = onboardingStatus
    ? OnboardingGuard.canAccessStep(
        requestedStep,
        onboardingStatus.currentStep,
        onboardingStatus.totalSteps
      )
    : false;

  const shouldRedirect = !canAccess && onboardingStatus?.needsOnboarding;
  const redirectPath = shouldRedirect
    ? `/onboarding?step=${onboardingStatus?.currentStep || 0}`
    : null;

  return {
    canAccess,
    shouldRedirect,
    redirectPath,
    currentStep: onboardingStatus?.currentStep || 0,
    isComplete: !onboardingStatus?.needsOnboarding
  };
}