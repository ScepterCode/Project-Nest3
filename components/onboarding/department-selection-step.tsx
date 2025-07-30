"use client";

import React, { useState, useEffect } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useDepartmentSearch } from '@/lib/hooks/useOnboarding';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DepartmentSearchResult, UserRole } from '@/lib/types/onboarding';
import { 
  Users, 
  ChevronRight,
  Check,
  AlertCircle,
  Building2,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function DepartmentSelectionStep() {
  const { onboardingData, nextStep } = useOnboarding();
  const { 
    departments, 
    loading, 
    error, 
    loadDepartments, 
    selectDepartment 
  } = useDepartmentSearch();
  
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentSearchResult | null>(null);

  // Load departments when component mounts
  useEffect(() => {
    if (onboardingData.institutionId) {
      loadDepartments(onboardingData.institutionId);
    }
  }, [onboardingData.institutionId, loadDepartments]);

  // Skip department selection for system admins
  const isSystemAdmin = onboardingData.role === UserRole.SYSTEM_ADMIN;

  useEffect(() => {
    if (isSystemAdmin) {
      // System admins don't need to select a department
      nextStep();
    }
  }, [isSystemAdmin, nextStep]);

  const handleDepartmentSelect = async (department: DepartmentSearchResult) => {
    setSelectedDepartment(department);
    const success = await selectDepartment(department);
    if (!success) {
      setSelectedDepartment(null);
    }
  };

  const handleContinue = async () => {
    if (selectedDepartment) {
      await nextStep();
    }
  };

  const handleSkipForNow = async () => {
    // Allow users to skip department selection and choose later
    await nextStep();
  };

  if (isSystemAdmin) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-600">Setting up your account...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Choose the department that best matches your role and responsibilities.
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm text-gray-600">Loading departments...</span>
        </div>
      )}

      {/* Department List */}
      {!loading && departments.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Available Departments
          </h3>
          <div className="grid gap-3">
            {departments.map((department) => (
              <Card
                key={department.id}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  selectedDepartment?.id === department.id
                    ? "ring-2 ring-blue-500 border-blue-200 bg-blue-50 dark:bg-blue-950"
                    : "hover:border-gray-300"
                )}
                onClick={() => handleDepartmentSelect(department)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                        <Building2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {department.name}
                          </h4>
                          {department.code && (
                            <Badge variant="outline" className="text-xs">
                              {department.code}
                            </Badge>
                          )}
                        </div>
                        {department.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {department.description}
                          </p>
                        )}
                        <div className="flex items-center space-x-4 mt-2">
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Users className="h-3 w-3" />
                            <span>{department.userCount} members</span>
                          </div>
                          {department.adminName && (
                            <div className="flex items-center space-x-1 text-xs text-gray-500">
                              <User className="h-3 w-3" />
                              <span>Admin: {department.adminName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {selectedDepartment?.id === department.id && (
                      <div className="flex items-center justify-center w-6 h-6 bg-blue-500 rounded-full">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* No Departments Available */}
      {!loading && departments.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Building2 className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">
              No departments available
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This institution doesn't have any departments set up yet, or you may not have access to view them.
            </p>
            <p className="text-xs text-gray-500">
              You can continue without selecting a department and choose one later.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Selected Department Display */}
      {selectedDepartment && (
        <Card className="bg-green-50 dark:bg-green-950 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-8 h-8 bg-green-500 rounded-full">
                <Check className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-medium text-green-900 dark:text-green-100">
                  Selected: {selectedDepartment.name}
                </h4>
                <p className="text-sm text-green-700 dark:text-green-300">
                  You'll be connected with this department.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={handleSkipForNow}
          className="text-gray-600"
        >
          Skip for now
        </Button>
        
        <Button
          onClick={handleContinue}
          disabled={!selectedDepartment}
          className="flex items-center space-x-2"
        >
          <span>Continue</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Help Text */}
      <div className="text-center">
        <p className="text-xs text-gray-500">
          Don't see your department? You can contact your institution administrator to have it added.
        </p>
      </div>
    </div>
  );
}