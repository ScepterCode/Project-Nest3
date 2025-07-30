"use client";

import React, { useState } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserRole } from '@/lib/types/onboarding';
import { 
  GraduationCap, 
  BookOpen, 
  Users, 
  Building, 
  Settings,
  Check,
  Star,
  ArrowRight
} from 'lucide-react';

interface WelcomeStepProps {
  onComplete: () => void;
}

export function WelcomeStep({ onComplete }: WelcomeStepProps) {
  const { onboardingData } = useOnboarding();
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await onComplete();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    } finally {
      setIsCompleting(false);
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case UserRole.STUDENT:
        return GraduationCap;
      case UserRole.TEACHER:
        return BookOpen;
      case UserRole.DEPARTMENT_ADMIN:
        return Users;
      case UserRole.INSTITUTION_ADMIN:
        return Building;
      case UserRole.SYSTEM_ADMIN:
        return Settings;
      default:
        return GraduationCap;
    }
  };

  const getRoleTitle = (role: UserRole) => {
    switch (role) {
      case UserRole.STUDENT:
        return 'Student';
      case UserRole.TEACHER:
        return 'Teacher';
      case UserRole.DEPARTMENT_ADMIN:
        return 'Department Administrator';
      case UserRole.INSTITUTION_ADMIN:
        return 'Institution Administrator';
      case UserRole.SYSTEM_ADMIN:
        return 'System Administrator';
      default:
        return 'User';
    }
  };

  const getRoleSpecificContent = (role: UserRole) => {
    switch (role) {
      case UserRole.STUDENT:
        return {
          welcome: "Welcome to your learning journey!",
          description: "You're all set to start learning and growing with us.",
          nextSteps: [
            "Join classes using class codes from your teachers",
            "View and complete assignments",
            "Track your progress and grades",
            "Participate in peer reviews and discussions"
          ],
          dashboardFeatures: [
            "Assignment Dashboard",
            "Grade Tracker",
            "Class Materials",
            "Peer Reviews"
          ]
        };
      case UserRole.TEACHER:
        return {
          welcome: "Welcome to your teaching platform!",
          description: "Everything you need to create engaging learning experiences.",
          nextSteps: [
            "Create and manage your classes",
            "Design assignments and rubrics",
            "Grade student submissions",
            "Monitor student progress"
          ],
          dashboardFeatures: [
            "Class Management",
            "Assignment Builder",
            "Grading Tools",
            "Analytics Dashboard"
          ]
        };
      case UserRole.DEPARTMENT_ADMIN:
        return {
          welcome: "Welcome to department management!",
          description: "Oversee your department's classes and users effectively.",
          nextSteps: [
            "Manage department users and roles",
            "Monitor department classes",
            "View department analytics",
            "Configure department settings"
          ],
          dashboardFeatures: [
            "User Management",
            "Department Analytics",
            "Class Oversight",
            "Settings Panel"
          ]
        };
      case UserRole.INSTITUTION_ADMIN:
        return {
          welcome: "Welcome to institution administration!",
          description: "Manage your entire institution with powerful tools.",
          nextSteps: [
            "Oversee all institution users",
            "Configure institution settings",
            "View comprehensive analytics",
            "Manage departments and policies"
          ],
          dashboardFeatures: [
            "Institution Dashboard",
            "User Management",
            "Analytics Suite",
            "Policy Management"
          ]
        };
      default:
        return {
          welcome: "Welcome to the platform!",
          description: "You're ready to get started.",
          nextSteps: [
            "Explore the platform features",
            "Complete your profile",
            "Connect with others",
            "Start using the tools"
          ],
          dashboardFeatures: [
            "Dashboard",
            "Profile",
            "Tools",
            "Settings"
          ]
        };
    }
  };

  const RoleIcon = getRoleIcon(onboardingData.role);
  const roleTitle = getRoleTitle(onboardingData.role);
  const content = getRoleSpecificContent(onboardingData.role);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="text-center space-y-4">
        <div 
          className="flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mx-auto"
          role="img"
          aria-label="Onboarding completed successfully"
        >
          <Check className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {content.welcome}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {content.description}
          </p>
        </div>
      </div>

      {/* Role Summary */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-500 rounded-lg text-white">
              <RoleIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                You're set up as a {roleTitle}
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Your dashboard and features are customized for your role
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Star className="h-5 w-5 text-yellow-500" />
            <span>What's Next?</span>
          </CardTitle>
          <CardDescription>
            Here's what you can do to get started on the platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {content.nextSteps.map((step, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="flex items-center justify-center w-6 h-6 bg-green-100 dark:bg-green-900 rounded-full mt-0.5">
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {index + 1}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{step}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Features */}
      <Card>
        <CardHeader>
          <CardTitle>Your Dashboard Features</CardTitle>
          <CardDescription>
            Key tools and features available in your personalized dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {content.dashboardFeatures.map((feature, index) => (
              <Badge key={index} variant="secondary" className="text-sm">
                {feature}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Completion Summary */}
      {onboardingData.institutionId && (
        <Card className="bg-gray-50 dark:bg-gray-800">
          <CardContent className="p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
              Setup Complete
            </h4>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>✓ Role: {roleTitle}</p>
              <p>✓ Institution: Connected</p>
              {onboardingData.departmentId && <p>✓ Department: Selected</p>}
              {onboardingData.classIds && onboardingData.classIds.length > 0 && (
                <p>✓ Classes: {onboardingData.classIds.length} joined</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Get Started Button */}
      <div className="flex justify-center pt-6">
        <Button
          onClick={handleComplete}
          size="lg"
          disabled={isCompleting}
          className="flex items-center space-x-2 px-8"
        >
          {isCompleting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Completing Setup...</span>
            </>
          ) : (
            <>
              <span>Get Started</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </Button>
      </div>

      {/* Help Text */}
      <div className="text-center">
        <p className="text-xs text-gray-500">
          You can always update your profile and settings from your dashboard
        </p>
      </div>
    </div>
  );
}