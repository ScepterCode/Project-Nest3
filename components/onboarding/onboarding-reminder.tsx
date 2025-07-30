'use client';

import React from 'react';
import { X, ArrowRight, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useOnboardingCompletion } from '@/lib/hooks/useOnboardingCompletion';

interface OnboardingReminderProps {
  className?: string;
  variant?: 'banner' | 'card' | 'compact';
  showProgress?: boolean;
  autoShow?: boolean;
}

export function OnboardingReminder({
  className = '',
  variant = 'banner',
  showProgress = true,
  autoShow = true
}: OnboardingReminderProps) {
  const {
    isComplete,
    showReminder,
    currentStep,
    totalSteps,
    completionPercentage,
    dismissReminder,
    goToOnboarding
  } = useOnboardingCompletion({
    showReminders: autoShow,
    reminderDelay: 3000
  });

  // Don't render if onboarding is complete or reminder shouldn't show
  if (isComplete || (!showReminder && autoShow)) {
    return null;
  }

  const handleContinueOnboarding = () => {
    goToOnboarding();
  };

  const handleDismiss = () => {
    dismissReminder();
  };

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md ${className}`}>
        <CheckCircle className="h-4 w-4 text-blue-600" />
        <span className="text-sm text-blue-800 flex-1">
          Complete your profile setup ({currentStep}/{totalSteps})
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleContinueOnboarding}
          className="h-6 px-2 text-blue-600 hover:text-blue-800"
        >
          Continue
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
          className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <Card className={`border-blue-200 bg-blue-50 ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                <h3 className="font-medium text-blue-900">
                  Complete Your Profile Setup
                </h3>
              </div>
              <p className="text-sm text-blue-700 mb-3">
                You're {completionPercentage}% done! Finish setting up your profile to get the most out of your experience.
              </p>
              {showProgress && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-blue-600 mb-1">
                    <span>Step {currentStep} of {totalSteps}</span>
                    <span>{completionPercentage}%</span>
                  </div>
                  <Progress value={completionPercentage} className="h-2" />
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleContinueOnboarding}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Continue Setup
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Remind me later
                </Button>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-blue-600 hover:text-blue-800 -mt-1 -mr-1"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default banner variant
  return (
    <div className={`bg-blue-600 text-white p-4 ${className}`}>
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4 flex-1">
          <CheckCircle className="h-5 w-5" />
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <span className="font-medium">
                Complete your profile setup to get started
              </span>
              {showProgress && (
                <div className="flex items-center gap-2 text-sm">
                  <span>{currentStep}/{totalSteps} steps</span>
                  <div className="w-24 bg-blue-500 rounded-full h-2">
                    <div
                      className="bg-white rounded-full h-2 transition-all duration-300"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                  <span>{completionPercentage}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleContinueOnboarding}
            className="bg-white text-blue-600 hover:bg-blue-50"
          >
            Continue Setup
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-white hover:bg-blue-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Convenience component for dashboard layouts
export function DashboardOnboardingReminder() {
  return (
    <OnboardingReminder
      variant="card"
      className="mb-6"
      showProgress={true}
      autoShow={true}
    />
  );
}

// Convenience component for header banners
export function HeaderOnboardingReminder() {
  return (
    <OnboardingReminder
      variant="banner"
      showProgress={true}
      autoShow={true}
    />
  );
}

// Convenience component for compact notifications
export function CompactOnboardingReminder() {
  return (
    <OnboardingReminder
      variant="compact"
      showProgress={false}
      autoShow={true}
    />
  );
}