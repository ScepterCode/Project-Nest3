"use client";

import React, { useState } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useRoleSelection } from '@/lib/hooks/useOnboarding';
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
  ChevronRight,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_OPTIONS = [
  {
    role: UserRole.STUDENT,
    icon: GraduationCap,
    title: 'Student',
    description: 'I\'m here to learn and complete assignments',
    features: [
      'Join classes and view assignments',
      'Submit work and track progress',
      'Participate in peer reviews',
      'View grades and feedback'
    ],
    color: 'bg-blue-500'
  },
  {
    role: UserRole.TEACHER,
    icon: BookOpen,
    title: 'Teacher',
    description: 'I teach classes and manage student learning',
    features: [
      'Create and manage classes',
      'Design assignments and rubrics',
      'Grade student submissions',
      'Track student progress'
    ],
    color: 'bg-green-500'
  },
  {
    role: UserRole.DEPARTMENT_ADMIN,
    icon: Users,
    title: 'Department Administrator',
    description: 'I manage users and classes within my department',
    features: [
      'Manage department users',
      'Oversee department classes',
      'View department analytics',
      'Configure department settings'
    ],
    color: 'bg-purple-500'
  },
  {
    role: UserRole.INSTITUTION_ADMIN,
    icon: Building,
    title: 'Institution Administrator',
    description: 'I oversee institution-wide operations',
    features: [
      'Manage all institution users',
      'Configure institution settings',
      'View comprehensive analytics',
      'Manage departments and policies'
    ],
    color: 'bg-orange-500'
  },
  {
    role: UserRole.SYSTEM_ADMIN,
    icon: Settings,
    title: 'System Administrator',
    description: 'I have full system access and configuration',
    features: [
      'Full system administration',
      'Manage all institutions',
      'System configuration',
      'Advanced analytics and reporting'
    ],
    color: 'bg-red-500'
  }
];

export function RoleSelectionStep() {
  const { onboardingData, nextStep } = useOnboarding();
  const { selectRole, validating, error } = useRoleSelection();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(
    onboardingData.role || null
  );

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    
    // Announce selection to screen readers
    const announcement = `Selected role: ${ROLE_OPTIONS.find(r => r.role === role)?.title}`;
    const ariaLiveRegion = document.getElementById('role-selection-announcements');
    if (ariaLiveRegion) {
      ariaLiveRegion.textContent = announcement;
    }
  };

  // Keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent, role: UserRole) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRoleSelect(role);
    }
  };

  const handleContinue = async () => {
    if (!selectedRole) return;

    const success = await selectRole(selectedRole);
    if (success) {
      await nextStep();
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen reader announcements */}
      <div 
        id="role-selection-announcements" 
        className="sr-only" 
        aria-live="polite" 
        aria-atomic="true"
      />

      {error && (
        <div 
          className="p-4 bg-red-50 border border-red-200 rounded-lg"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="sr-only">Select your role</legend>
        <div className="grid gap-3 sm:gap-4">
          {ROLE_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const isSelected = selectedRole === option.role;
            
            return (
              <Card
                key={option.role}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2",
                  "touch-manipulation", // Optimize for touch devices
                  "active:scale-[0.98]", // Touch feedback
                  isSelected 
                    ? "ring-2 ring-blue-500 border-blue-200 bg-blue-50 dark:bg-blue-950" 
                    : "hover:border-gray-300"
                )}
                role="button"
                tabIndex={0}
                onClick={() => handleRoleSelect(option.role)}
                onKeyDown={(e) => handleKeyDown(e, option.role)}
                aria-pressed={isSelected}
                aria-describedby={`role-${option.role}-description`}
                aria-label={`Select ${option.title} role. ${option.description}`}
              >
                <CardHeader className="pb-3 px-4 sm:px-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div 
                        className={cn("p-2 rounded-lg text-white flex-shrink-0", option.color)}
                        aria-hidden="true"
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg leading-tight">
                          {option.title}
                        </CardTitle>
                        <CardDescription className="text-sm mt-1">
                          {option.description}
                        </CardDescription>
                      </div>
                    </div>
                    {isSelected && (
                      <div 
                        className="flex items-center justify-center w-6 h-6 bg-blue-500 rounded-full flex-shrink-0 self-start sm:self-center"
                        aria-hidden="true"
                      >
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0 px-4 sm:px-6">
                  <div className="space-y-2">
                    <p 
                      className="text-sm font-medium text-gray-700 dark:text-gray-300"
                      id={`role-${option.role}-description`}
                    >
                      What you can do:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {option.features.map((feature, featureIndex) => (
                        <Badge 
                          key={featureIndex} 
                          variant="secondary" 
                          className="text-xs"
                        >
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col sm:flex-row sm:justify-end pt-4 gap-3">
        <Button
          onClick={handleContinue}
          disabled={!selectedRole || validating}
          className="flex items-center justify-center space-x-2 min-h-[44px] w-full sm:w-auto px-6"
          aria-describedby={!selectedRole ? "continue-button-help" : undefined}
        >
          {validating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <span>Continue</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
        {!selectedRole && (
          <p 
            id="continue-button-help" 
            className="text-sm text-gray-500 text-center sm:text-right"
          >
            Please select a role to continue
          </p>
        )}
      </div>

      {selectedRole && (
        <div 
          className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
          role="status"
          aria-live="polite"
        >
          <h4 className="font-medium text-gray-900 dark:text-white mb-2">
            Selected Role: {ROLE_OPTIONS.find(r => r.role === selectedRole)?.title}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You can change this later in your profile settings if needed.
          </p>
        </div>
      )}
    </div>
  );
}