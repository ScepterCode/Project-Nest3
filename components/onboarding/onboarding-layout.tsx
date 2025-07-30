"use client";

import React from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, X, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  showSkip?: boolean;
  showBack?: boolean;
  showNext?: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  className?: string;
}

export function OnboardingLayout({
  children,
  title,
  description,
  showSkip = true,
  showBack = true,
  showNext = true,
  nextLabel = "Continue",
  nextDisabled = false,
  onNext,
  onBack,
  onSkip,
  className
}: OnboardingLayoutProps) {
  const { 
    currentStep, 
    totalSteps, 
    nextStep, 
    previousStep, 
    skipStep,
    loading 
  } = useOnboarding();

  const progressPercentage = Math.round((currentStep / totalSteps) * 100);
  
  // Focus management
  const mainContentRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    // Announce step changes to screen readers
    const announcement = `Step ${currentStep + 1} of ${totalSteps}: ${title}`;
    const ariaLiveRegion = document.getElementById('onboarding-announcements');
    if (ariaLiveRegion) {
      ariaLiveRegion.textContent = announcement;
    }
    
    // Focus main content when step changes for keyboard navigation
    if (mainContentRef.current) {
      mainContentRef.current.focus();
    }
  }, [currentStep, title, totalSteps]);

  // Enhanced keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Allow users to exit onboarding with Escape key
      window.history.back();
    }
  };

  const handleNext = async () => {
    if (onNext) {
      await onNext();
    } else {
      await nextStep();
    }
  };

  const handleBack = async () => {
    if (onBack) {
      await onBack();
    } else {
      await previousStep();
    }
  };

  const handleSkip = async () => {
    if (onSkip) {
      await onSkip();
    } else {
      await skipStep();
    }
  };

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        role="status"
        aria-live="polite"
        aria-label="Loading onboarding step"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800"
      onKeyDown={handleKeyDown}
    >
      {/* Screen reader announcements */}
      <div 
        id="onboarding-announcements" 
        className="sr-only" 
        aria-live="polite" 
        aria-atomic="true"
      />
      
      {/* Skip to main content link */}
      <a 
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50"
      >
        Skip to main content
      </a>

      {/* Header with Progress */}
      <header 
        className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b"
        role="banner"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                Welcome to the Platform
              </h1>
              <div 
                className="text-sm text-gray-500 dark:text-gray-400"
                aria-label={`Step ${currentStep + 1} of ${totalSteps}`}
              >
                Step {currentStep + 1} of {totalSteps}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.history.back()}
              className="text-gray-500 hover:text-gray-700 self-end sm:self-auto"
              aria-label="Go back to previous page"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Progress</span>
              <span>{progressPercentage}%</span>
            </div>
            <Progress 
              value={progressPercentage} 
              className="h-2"
              aria-label={`Onboarding progress: ${progressPercentage}% complete`}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main 
        id="main-content"
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8"
        role="main"
      >
        <Card 
          className={cn("w-full max-w-2xl mx-auto", className)}
          ref={mainContentRef}
          tabIndex={-1}
        >
          <CardHeader className="text-center px-4 sm:px-6">
            <CardTitle 
              className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white"
              id="step-title"
            >
              {title}
            </CardTitle>
            {description && (
              <p 
                className="text-gray-600 dark:text-gray-400 mt-2 text-sm sm:text-base"
                id="step-description"
              >
                {description}
              </p>
            )}
          </CardHeader>
          
          <CardContent 
            className="space-y-6 px-4 sm:px-6"
            aria-labelledby="step-title"
            aria-describedby={description ? "step-description" : undefined}
          >
            {children}
          </CardContent>
        </Card>

        {/* Navigation */}
        <nav 
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between max-w-2xl mx-auto mt-6 sm:mt-8 gap-4"
          role="navigation"
          aria-label="Onboarding step navigation"
        >
          <div className="flex justify-start">
            {showBack && currentStep > 0 && (
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={loading}
                className="flex items-center space-x-2 min-h-[44px] px-4"
                aria-label={`Go back to step ${currentStep}`}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back</span>
              </Button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
            {showSkip && currentStep < totalSteps - 1 && (
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={loading}
                className="flex items-center justify-center space-x-2 text-gray-500 hover:text-gray-700 min-h-[44px] px-4"
                aria-label="Skip this step for now"
              >
                <SkipForward className="h-4 w-4" aria-hidden="true" />
                <span>Skip for now</span>
              </Button>
            )}
            
            {showNext && (
              <Button
                onClick={handleNext}
                disabled={nextDisabled || loading}
                className="flex items-center justify-center space-x-2 min-h-[44px] px-6"
                aria-label={nextDisabled ? `${nextLabel} (disabled)` : nextLabel}
              >
                <span>{nextLabel}</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </nav>
      </main>
    </div>
  );
}

// Step indicator component for showing step progress
export function StepIndicator({ 
  steps, 
  currentStep 
}: { 
  steps: string[]; 
  currentStep: number; 
}) {
  return (
    <div className="flex items-center justify-center space-x-4 mb-8">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center">
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium",
              index < currentStep
                ? "bg-green-500 text-white"
                : index === currentStep
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
            )}
          >
            {index < currentStep ? "✓" : index + 1}
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                "w-12 h-0.5 mx-2",
                index < currentStep
                  ? "bg-green-500"
                  : "bg-gray-200 dark:bg-gray-700"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Onboarding step wrapper component
export function OnboardingStep({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      {children}
    </div>
  );
}