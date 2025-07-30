// Custom hooks for onboarding operations

import { useCallback, useState } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { onboardingService } from '@/lib/services/onboarding';
import {
  InstitutionSearchResult,
  DepartmentSearchResult,
  UserRole,
  OnboardingError,
  ClassJoinResult
} from '@/lib/types/onboarding';

// Hook for institution search and selection
export function useInstitutionSearch() {
  const [institutions, setInstitutions] = useState<InstitutionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateOnboardingData } = useOnboarding();

  const searchInstitutions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setInstitutions([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await onboardingService.searchInstitutions(query);
      setInstitutions(results);
    } catch (err) {
      console.error('Institution search failed:', err);
      setError(err instanceof OnboardingError ? err.message : 'Search failed');
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectInstitution = useCallback(async (institution: InstitutionSearchResult) => {
    try {
      await updateOnboardingData({ institutionId: institution.id });
      return true;
    } catch (err) {
      console.error('Failed to select institution:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to select institution');
      return false;
    }
  }, [updateOnboardingData]);

  const clearSearch = useCallback(() => {
    setInstitutions([]);
    setError(null);
  }, []);

  return {
    institutions,
    loading,
    error,
    searchInstitutions,
    selectInstitution,
    clearSearch
  };
}

// Hook for department search and selection
export function useDepartmentSearch() {
  const [departments, setDepartments] = useState<DepartmentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { onboardingData, updateOnboardingData } = useOnboarding();

  const loadDepartments = useCallback(async (institutionId?: string) => {
    const targetInstitutionId = institutionId || onboardingData.institutionId;
    
    if (!targetInstitutionId) {
      setDepartments([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await onboardingService.getDepartmentsByInstitution(targetInstitutionId);
      setDepartments(results);
    } catch (err) {
      console.error('Failed to load departments:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to load departments');
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [onboardingData.institutionId]);

  const selectDepartment = useCallback(async (department: DepartmentSearchResult) => {
    try {
      await updateOnboardingData({ departmentId: department.id });
      return true;
    } catch (err) {
      console.error('Failed to select department:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to select department');
      return false;
    }
  }, [updateOnboardingData]);

  return {
    departments,
    loading,
    error,
    loadDepartments,
    selectDepartment
  };
}

// Hook for role selection and validation
export function useRoleSelection() {
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateOnboardingData } = useOnboarding();

  const selectRole = useCallback(async (role: UserRole) => {
    try {
      setValidating(true);
      setError(null);
      
      // Validate role selection (could include additional business logic)
      if (!Object.values(UserRole).includes(role)) {
        throw new OnboardingError('Invalid role selected', 'INVALID_ROLE');
      }

      await updateOnboardingData({ role });
      return true;
    } catch (err) {
      console.error('Failed to select role:', err);
      setError(err instanceof OnboardingError ? err.message : 'Failed to select role');
      return false;
    } finally {
      setValidating(false);
    }
  }, [updateOnboardingData]);

  const getRoleDescription = useCallback((role: UserRole): string => {
    const descriptions = {
      [UserRole.STUDENT]: 'Access assignments, submit work, and track your progress',
      [UserRole.TEACHER]: 'Create classes, manage assignments, and grade student work',
      [UserRole.DEPARTMENT_ADMIN]: 'Manage department users, classes, and settings',
      [UserRole.INSTITUTION_ADMIN]: 'Oversee institution-wide settings and user management',
      [UserRole.SYSTEM_ADMIN]: 'Full system access and configuration capabilities'
    };
    return descriptions[role] || 'Role description not available';
  }, []);

  const getRolePermissions = useCallback((role: UserRole): string[] => {
    const permissions = {
      [UserRole.STUDENT]: [
        'View and join classes',
        'Submit assignments',
        'View grades and feedback',
        'Participate in peer reviews'
      ],
      [UserRole.TEACHER]: [
        'Create and manage classes',
        'Create assignments and rubrics',
        'Grade student submissions',
        'Manage class rosters'
      ],
      [UserRole.DEPARTMENT_ADMIN]: [
        'Manage department users',
        'Oversee department classes',
        'View department analytics',
        'Configure department settings'
      ],
      [UserRole.INSTITUTION_ADMIN]: [
        'Manage all institution users',
        'Configure institution settings',
        'View institution analytics',
        'Manage departments'
      ],
      [UserRole.SYSTEM_ADMIN]: [
        'Full system administration',
        'Manage all institutions',
        'System configuration',
        'Advanced analytics'
      ]
    };
    return permissions[role] || [];
  }, []);

  return {
    validating,
    error,
    selectRole,
    getRoleDescription,
    getRolePermissions
  };
}

// Hook for onboarding progress tracking
export function useOnboardingProgress() {
  const { currentStep, totalSteps, onboardingData } = useOnboarding();

  const progressPercentage = Math.round((currentStep / totalSteps) * 100);
  
  const getStepStatus = useCallback((stepNumber: number) => {
    if (stepNumber < currentStep) return 'completed';
    if (stepNumber === currentStep) return 'current';
    return 'pending';
  }, [currentStep]);

  const isStepSkipped = useCallback((stepNumber: number) => {
    const stepId = `step_${stepNumber}`;
    return onboardingData.skippedSteps.includes(stepId);
  }, [onboardingData.skippedSteps]);

  const getCompletedSteps = useCallback(() => {
    return Array.from({ length: currentStep }, (_, i) => i);
  }, [currentStep]);

  const getRemainingSteps = useCallback(() => {
    return Array.from({ length: totalSteps - currentStep }, (_, i) => currentStep + i);
  }, [currentStep, totalSteps]);

  return {
    currentStep,
    totalSteps,
    progressPercentage,
    getStepStatus,
    isStepSkipped,
    getCompletedSteps,
    getRemainingSteps
  };
}

// Hook for class joining functionality
export function useClassJoin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateOnboardingData, onboardingData } = useOnboarding();

  const joinClass = useCallback(async (classCode: string): Promise<ClassJoinResult> => {
    try {
      setLoading(true);
      setError(null);
      
      // Validate class code format
      if (!classCode || classCode.length < 4) {
        throw new OnboardingError('Invalid class code format', 'VALIDATION_FAILED');
      }

      const response = await fetch('/api/classes/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          classCode: classCode.toUpperCase().trim(),
          userId: onboardingData.userId 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join class');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to join class');
      }

      // Update onboarding data with joined class
      if (result.data?.class) {
        const currentClassIds = onboardingData.classIds || [];
        const newClassIds = [...currentClassIds, result.data.class.id];
        await updateOnboardingData({ classIds: newClassIds });
      }

      return {
        success: true,
        class: result.data?.class,
        message: result.message
      };
    } catch (err) {
      console.error('Failed to join class:', err);
      const errorMessage = err instanceof OnboardingError ? err.message : 
                          err instanceof Error ? err.message : 'Failed to join class';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, [onboardingData, updateOnboardingData]);

  return {
    joinClass,
    loading,
    error
  };
}

// Hook for onboarding validation
export function useOnboardingValidation() {
  const { onboardingData } = useOnboarding();

  const validateStep = useCallback((stepNumber: number): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    switch (stepNumber) {
      case 1: // Role selection
        if (!onboardingData.role) {
          errors.push('Please select a role');
        }
        break;
      
      case 2: // Institution selection
        if (!onboardingData.institutionId) {
          errors.push('Please select an institution');
        }
        break;
      
      case 3: // Department selection
        if (!onboardingData.departmentId && onboardingData.role !== UserRole.SYSTEM_ADMIN) {
          errors.push('Please select a department');
        }
        break;
      
      default:
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, [onboardingData]);

  const validateAllSteps = useCallback(() => {
    const allErrors: Record<number, string[]> = {};
    let isAllValid = true;

    for (let step = 1; step <= 5; step++) {
      const { isValid, errors } = validateStep(step);
      if (!isValid) {
        allErrors[step] = errors;
        isAllValid = false;
      }
    }

    return {
      isValid: isAllValid,
      errors: allErrors
    };
  }, [validateStep]);

  const canCompleteOnboarding = useCallback(() => {
    const requiredFields = ['role', 'institutionId'];
    
    // Department is required for non-system admins
    if (onboardingData.role !== UserRole.SYSTEM_ADMIN) {
      requiredFields.push('departmentId');
    }

    return requiredFields.every(field => 
      onboardingData[field as keyof typeof onboardingData]
    );
  }, [onboardingData]);

  return {
    validateStep,
    validateAllSteps,
    canCompleteOnboarding
  };
}