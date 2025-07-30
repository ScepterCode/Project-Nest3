"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { OnboardingProvider, useOnboarding } from '@/contexts/onboarding-context';
import { OnboardingLayout, StepIndicator } from '@/components/onboarding/onboarding-layout';
import { RoleSelectionStep } from '@/components/onboarding/role-selection-step';
import { InstitutionSelectionStep } from '@/components/onboarding/institution-selection-step';
import { DepartmentSelectionStep } from '@/components/onboarding/department-selection-step';
import { ProfileSetupStep } from '@/components/onboarding/profile-setup-step';
import { StudentClassJoinStep } from '@/components/onboarding/student-class-join-step';
import { TeacherClassGuideStep } from '@/components/onboarding/teacher-class-guide-step';
import { AdminInstitutionSetupStep } from '@/components/onboarding/admin-institution-setup-step';
import { WelcomeStep } from '@/components/onboarding/welcome-step';
import { OnboardingGuard } from '@/lib/utils/onboarding-guard';
import { UserRole } from '@/lib/types/onboarding';

const getOnboardingSteps = (role: UserRole | undefined) => {
  const baseSteps = [
    'Role Selection',
    'Institution',
    'Department'
  ];
  
  // Add role-specific steps
  if (role === UserRole.STUDENT) {
    baseSteps.push('Join Class');
  } else if (role === UserRole.TEACHER) {
    baseSteps.push('Class Setup');
  } else if (role === UserRole.INSTITUTION_ADMIN) {
    baseSteps.push('Institution Setup');
  }
  
  // Add common final steps
  baseSteps.push('Profile Setup', 'Welcome');
  
  return baseSteps;
};

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { currentStep, totalSteps, completeOnboarding, onboardingData } = useOnboarding();
  const [mounted, setMounted] = useState(false);

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if user can't access onboarding
  useEffect(() => {
    if (mounted && !OnboardingGuard.canAccessOnboarding(user)) {
      router.push('/auth/login');
    }
  }, [mounted, user, router]);

  // Handle step parameter from URL
  useEffect(() => {
    if (!mounted) return;
    
    const stepParam = searchParams.get('step');
    if (stepParam) {
      const requestedStep = parseInt(stepParam, 10);
      if (!isNaN(requestedStep) && OnboardingGuard.canAccessStep(requestedStep, currentStep, totalSteps)) {
        // Step navigation is handled by the onboarding context
        // This just validates the URL parameter
      } else {
        // Invalid step, redirect to current step
        router.replace('/onboarding');
      }
    }
  }, [mounted, searchParams, currentStep, totalSteps, router]);

  const handleComplete = async () => {
    try {
      await completeOnboarding();
      
      // Redirect to appropriate dashboard
      const userRole = onboardingData.role || user?.user_metadata?.role || 'student';
      const dashboardPath = OnboardingGuard.getDashboardPath(userRole);
      router.push(dashboardPath);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  const renderCurrentStep = () => {
    const userRole = onboardingData.role;
    
    switch (currentStep) {
      case 0:
        return <RoleSelectionStep />;
      case 1:
        return <InstitutionSelectionStep />;
      case 2:
        return <DepartmentSelectionStep />;
      case 3:
        // Role-specific step
        if (userRole === UserRole.STUDENT) {
          return <StudentClassJoinStep />;
        } else if (userRole === UserRole.TEACHER) {
          return <TeacherClassGuideStep />;
        } else if (userRole === UserRole.INSTITUTION_ADMIN) {
          return <AdminInstitutionSetupStep />;
        } else {
          return <ProfileSetupStep />;
        }
      case 4:
        return <ProfileSetupStep />;
      case 5:
        return <WelcomeStep onComplete={handleComplete} />;
      default:
        return <RoleSelectionStep />;
    }
  };

  const getStepTitle = () => {
    const userRole = onboardingData.role;
    
    switch (currentStep) {
      case 0:
        return "Choose Your Role";
      case 1:
        return "Select Your Institution";
      case 2:
        return "Choose Your Department";
      case 3:
        // Role-specific step titles
        if (userRole === UserRole.STUDENT) {
          return "Join Your First Class";
        } else if (userRole === UserRole.TEACHER) {
          return "Set Up Your First Class";
        } else if (userRole === UserRole.INSTITUTION_ADMIN) {
          return "Configure Your Institution";
        } else {
          return "Complete Your Profile";
        }
      case 4:
        return "Complete Your Profile";
      case 5:
        return "Welcome to the Platform!";
      default:
        return "Getting Started";
    }
  };

  const getStepDescription = () => {
    const userRole = onboardingData.role;
    
    switch (currentStep) {
      case 0:
        return "Let us know how you'll be using the platform so we can customize your experience.";
      case 1:
        return "Help us connect you with your educational institution.";
      case 2:
        return "Select the department or area you're associated with.";
      case 3:
        // Role-specific step descriptions
        if (userRole === UserRole.STUDENT) {
          return "Enter your class code to join your first class and start learning.";
        } else if (userRole === UserRole.TEACHER) {
          return "Get guidance on creating your first class and inviting students.";
        } else if (userRole === UserRole.INSTITUTION_ADMIN) {
          return "Set up your institution's settings and configuration.";
        } else {
          return "Add some final details to personalize your account.";
        }
      case 4:
        return "Add some final details to personalize your account.";
      case 5:
        return "You're all set! Let's explore what you can do.";
      default:
        return "Let's get you set up with everything you need.";
    }
  };

  return (
    <div className="min-h-screen">
      <StepIndicator steps={getOnboardingSteps(onboardingData.role)} currentStep={currentStep} />
      
      <OnboardingLayout
        title={getStepTitle()}
        description={getStepDescription()}
        showSkip={currentStep < totalSteps - 1}
        showBack={currentStep > 0}
        showNext={false} // Steps handle their own navigation
      >
        {renderCurrentStep()}
      </OnboardingLayout>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <OnboardingProvider>
      <OnboardingContent />
    </OnboardingProvider>
  );
}