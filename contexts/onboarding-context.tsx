"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { onboardingService } from '@/lib/services/onboarding';
import { onboardingAnalyticsService } from '@/lib/services/onboarding-analytics';
import {
  OnboardingContextType,
  OnboardingData,
  OnboardingSession,
  OnboardingError,
  OnboardingErrorCode,
  UserRole
} from '@/lib/types/onboarding';

const OnboardingContext = createContext<OnboardingContextType>({
  currentStep: 0,
  totalSteps: 5,
  onboardingData: {
    userId: '',
    role: UserRole.STUDENT,
    currentStep: 0,
    skippedSteps: []
  },
  loading: true,
  updateOnboardingData: async () => {},
  nextStep: async () => {},
  previousStep: async () => {},
  skipStep: async () => {},
  completeOnboarding: async () => {},
  restartOnboarding: async () => {}
});

interface OnboardingProviderProps {
  children: React.ReactNode;
}

// Helper function to get step name from step number
const getStepName = (stepNumber: number): string => {
  const stepNames = [
    'welcome',
    'role-selection',
    'institution-setup',
    'role-specific-setup',
    'completion'
  ];
  return stepNames[stepNumber] || `step-${stepNumber}`;
};

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { user } = useAuth();
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [isOnline, setIsOnline] = useState(true);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Auto-save interval (in milliseconds)
  const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
  const MAX_RETRY_ATTEMPTS = 3;
  const RETRY_DELAY = 2000; // 2 seconds

  // Initialize or load existing onboarding session
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    initializeOnboarding();
  }, [user]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setRetryCount(0);
      // Try to save any pending changes when back online
      if (hasUnsavedChanges && session && user) {
        saveOnboardingDataWithRetry();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hasUnsavedChanges, session, user]);

  // Auto-save functionality with error handling
  useEffect(() => {
    if (!session || !user) return;

    const interval = setInterval(() => {
      if (hasUnsavedChanges && isOnline) {
        saveOnboardingDataWithRetry();
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [session, user, hasUnsavedChanges, isOnline]);

  const initializeOnboarding = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(undefined);

      // Try to get existing session
      let existingSession = await onboardingService.getOnboardingSession(user.id);

      if (!existingSession) {
        // Create new session if none exists
        existingSession = await onboardingService.createOnboardingSession(user.id);
        
        // Track the start of onboarding
        const firstStepName = getStepName(0);
        await onboardingAnalyticsService.trackStepEvent(
          existingSession.id,
          firstStepName,
          0,
          'started'
        );
      }

      setSession(existingSession);
    } catch (err) {
      console.error('Failed to initialize onboarding:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to initialize onboarding');
    } finally {
      setLoading(false);
    }
  };

  const saveOnboardingData = async () => {
    if (!session || !user) return;

    try {
      await onboardingService.updateOnboardingSession(user.id, session);
      setLastSaveTime(new Date());
      setHasUnsavedChanges(false);
      setRetryCount(0);
    } catch (err) {
      console.error('Failed to save onboarding data:', err);
      setHasUnsavedChanges(true);
      // Don't set error state for auto-save failures to avoid disrupting UX
    }
  };

  const saveOnboardingDataWithRetry = async () => {
    if (!session || !user || !isOnline) return;

    try {
      await onboardingService.updateOnboardingSession(user.id, session);
      setLastSaveTime(new Date());
      setHasUnsavedChanges(false);
      setRetryCount(0);
    } catch (err) {
      console.error('Failed to save onboarding data:', err);
      setHasUnsavedChanges(true);
      
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          saveOnboardingDataWithRetry();
        }, RETRY_DELAY * Math.pow(2, retryCount)); // Exponential backoff
      } else {
        // Max retries reached, show user-friendly error
        setError('Unable to save your progress. Please check your connection and try again.');
      }
    }
  };

  const updateOnboardingData = useCallback(async (updates: Partial<OnboardingData>) => {
    if (!session || !user) return;

    try {
      const updatedData = { ...session.data, ...updates };
      const updatedSession = { ...session, data: updatedData, lastActivity: new Date() };
      
      setSession(updatedSession);
      setHasUnsavedChanges(true);
      
      // Save immediately for important updates
      await onboardingService.updateOnboardingSession(user.id, updatedSession);
      setLastSaveTime(new Date());
      setHasUnsavedChanges(false);
      setRetryCount(0);
    } catch (err) {
      console.error('Failed to update onboarding data:', err);
      setHasUnsavedChanges(true);
      setError(err instanceof OnboardingError ? err.message : 'Failed to update onboarding data');
    }
  }, [session, user]);

  const nextStep = useCallback(async () => {
    if (!session || !user) return;

    try {
      // Track completion of current step
      const currentStepName = getStepName(session.currentStep);
      await onboardingAnalyticsService.trackStepEvent(
        session.id,
        currentStepName,
        session.currentStep,
        'completed'
      );

      const nextStepNumber = Math.min(session.currentStep + 1, session.totalSteps);
      const updatedSession = {
        ...session,
        currentStep: nextStepNumber,
        data: { ...session.data, currentStep: nextStepNumber },
        lastActivity: new Date()
      };

      // Track start of next step if not at the end
      if (nextStepNumber <= session.totalSteps) {
        const nextStepName = getStepName(nextStepNumber);
        await onboardingAnalyticsService.trackStepEvent(
          session.id,
          nextStepName,
          nextStepNumber,
          'started'
        );
      }

      setSession(updatedSession);
      await onboardingService.updateOnboardingSession(user.id, updatedSession);
    } catch (err) {
      console.error('Failed to advance to next step:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to advance to next step');
    }
  }, [session, user]);

  const previousStep = useCallback(async () => {
    if (!session || !user) return;

    try {
      const prevStepNumber = Math.max(session.currentStep - 1, 0);
      const updatedSession = {
        ...session,
        currentStep: prevStepNumber,
        data: { ...session.data, currentStep: prevStepNumber },
        lastActivity: new Date()
      };

      setSession(updatedSession);
      await onboardingService.updateOnboardingSession(user.id, updatedSession);
    } catch (err) {
      console.error('Failed to go to previous step:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to go to previous step');
    }
  }, [session, user]);

  const skipStep = useCallback(async () => {
    if (!session || !user) return;

    try {
      // Track skip event for current step
      const currentStepName = getStepName(session.currentStep);
      await onboardingAnalyticsService.trackStepEvent(
        session.id,
        currentStepName,
        session.currentStep,
        'skipped'
      );

      const currentStepId = `step_${session.currentStep}`;
      const skippedSteps = [...session.data.skippedSteps];
      
      if (!skippedSteps.includes(currentStepId)) {
        skippedSteps.push(currentStepId);
      }

      const nextStepNumber = Math.min(session.currentStep + 1, session.totalSteps);
      const updatedSession = {
        ...session,
        currentStep: nextStepNumber,
        data: { 
          ...session.data, 
          currentStep: nextStepNumber,
          skippedSteps 
        },
        lastActivity: new Date()
      };

      // Track start of next step if not at the end
      if (nextStepNumber <= session.totalSteps) {
        const nextStepName = getStepName(nextStepNumber);
        await onboardingAnalyticsService.trackStepEvent(
          session.id,
          nextStepName,
          nextStepNumber,
          'started'
        );
      }

      setSession(updatedSession);
      await onboardingService.updateOnboardingSession(user.id, updatedSession);
    } catch (err) {
      console.error('Failed to skip step:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to skip step');
    }
  }, [session, user]);

  const completeOnboarding = useCallback(async () => {
    if (!session || !user) return;

    try {
      // Track completion of final step
      const finalStepName = getStepName(session.currentStep);
      await onboardingAnalyticsService.trackStepEvent(
        session.id,
        finalStepName,
        session.currentStep,
        'completed'
      );

      const completedSession = {
        ...session,
        completedAt: new Date(),
        lastActivity: new Date()
      };

      setSession(completedSession);
      
      // Mark onboarding as complete in the database
      await onboardingService.completeOnboarding(user.id);
      
      // Update user profile with final onboarding data
      await onboardingService.updateUserProfile(user.id, {
        role: session.data.role,
        institutionId: session.data.institutionId,
        departmentId: session.data.departmentId,
        onboardingData: session.data
      });

    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to complete onboarding');
    }
  }, [session, user]);

  const restartOnboarding = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Create a fresh onboarding session
      const newSession = await onboardingService.createOnboardingSession(user.id);
      setSession(newSession);
      setError(undefined);
    } catch (err) {
      console.error('Failed to restart onboarding:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to restart onboarding');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const contextValue: OnboardingContextType = {
    currentStep: session?.currentStep || 0,
    totalSteps: session?.totalSteps || 5,
    onboardingData: session?.data || {
      userId: user?.id || '',
      role: UserRole.STUDENT,
      currentStep: 0,
      skippedSteps: []
    },
    session,
    loading,
    error,
    updateOnboardingData,
    nextStep,
    previousStep,
    skipStep,
    completeOnboarding,
    restartOnboarding
  };

  return (
    <OnboardingContext.Provider value={contextValue}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextType {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

// Custom hook for specific onboarding step management
export function useOnboardingStep(stepNumber: number) {
  const { currentStep, nextStep, previousStep, skipStep } = useOnboarding();
  
  const isCurrentStep = currentStep === stepNumber;
  const isCompleted = currentStep > stepNumber;
  const canAccess = currentStep >= stepNumber;

  return {
    isCurrentStep,
    isCompleted,
    canAccess,
    nextStep,
    previousStep,
    skipStep
  };
}

// Custom hook for onboarding data management
export function useOnboardingData<T = any>(key: string) {
  const { onboardingData, updateOnboardingData } = useOnboarding();
  
  const value = onboardingData[key as keyof OnboardingData] as T;
  
  const setValue = useCallback(async (newValue: T) => {
    await updateOnboardingData({ [key]: newValue });
  }, [key, updateOnboardingData]);

  return [value, setValue] as const;
}