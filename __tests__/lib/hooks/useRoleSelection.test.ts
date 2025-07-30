import { renderHook, act } from '@testing-library/react';
import { useRoleSelection } from '@/lib/hooks/useOnboarding';
import { useOnboarding } from '@/contexts/onboarding-context';
import { UserRole, OnboardingError } from '@/lib/types/onboarding';

// Mock the onboarding context
jest.mock('@/contexts/onboarding-context');

const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;

describe('useRoleSelection', () => {
  const mockUpdateOnboardingData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseOnboarding.mockReturnValue({
      currentStep: 0,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        currentStep: 0,
        skippedSteps: []
      },
      session: undefined,
      loading: false,
      error: undefined,
      updateOnboardingData: mockUpdateOnboardingData,
      nextStep: jest.fn(),
      previousStep: jest.fn(),
      skipStep: jest.fn(),
      completeOnboarding: jest.fn(),
      restartOnboarding: jest.fn()
    });
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useRoleSelection());
    
    expect(result.current.validating).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.selectRole).toBe('function');
    expect(typeof result.current.getRoleDescription).toBe('function');
    expect(typeof result.current.getRolePermissions).toBe('function');
  });

  it('successfully selects a valid role', async () => {
    mockUpdateOnboardingData.mockResolvedValue(undefined);
    
    const { result } = renderHook(() => useRoleSelection());
    
    let success: boolean = false;
    
    await act(async () => {
      success = await result.current.selectRole(UserRole.TEACHER);
    });
    
    expect(success).toBe(true);
    expect(mockUpdateOnboardingData).toHaveBeenCalledWith({ role: UserRole.TEACHER });
    expect(result.current.error).toBe(null);
    expect(result.current.validating).toBe(false);
  });

  it('handles role selection failure', async () => {
    const errorMessage = 'Failed to update role';
    mockUpdateOnboardingData.mockRejectedValue(new Error(errorMessage));
    
    const { result } = renderHook(() => useRoleSelection());
    
    let success: boolean = true;
    
    await act(async () => {
      success = await result.current.selectRole(UserRole.STUDENT);
    });
    
    expect(success).toBe(false);
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.validating).toBe(false);
  });

  it('handles OnboardingError specifically', async () => {
    const onboardingError = new OnboardingError('Invalid role', 'INVALID_ROLE');
    mockUpdateOnboardingData.mockRejectedValue(onboardingError);
    
    const { result } = renderHook(() => useRoleSelection());
    
    let success: boolean = true;
    
    await act(async () => {
      success = await result.current.selectRole(UserRole.DEPARTMENT_ADMIN);
    });
    
    expect(success).toBe(false);
    expect(result.current.error).toBe('Invalid role');
    expect(result.current.validating).toBe(false);
  });

  it('rejects invalid role values', async () => {
    const { result } = renderHook(() => useRoleSelection());
    
    let success: boolean = true;
    
    await act(async () => {
      // @ts-ignore - Testing invalid role
      success = await result.current.selectRole('invalid_role');
    });
    
    expect(success).toBe(false);
    expect(result.current.error).toBe('Invalid role selected');
    expect(mockUpdateOnboardingData).not.toHaveBeenCalled();
  });

  it('sets validating state during role selection', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });
    
    mockUpdateOnboardingData.mockReturnValue(promise);
    
    const { result } = renderHook(() => useRoleSelection());
    
    // Start role selection
    act(() => {
      result.current.selectRole(UserRole.TEACHER);
    });
    
    // Should be validating
    expect(result.current.validating).toBe(true);
    
    // Resolve the promise
    await act(async () => {
      resolvePromise!(undefined);
      await promise;
    });
    
    // Should no longer be validating
    expect(result.current.validating).toBe(false);
  });

  it('provides correct role descriptions', () => {
    const { result } = renderHook(() => useRoleSelection());
    
    expect(result.current.getRoleDescription(UserRole.STUDENT))
      .toBe('Access assignments, submit work, and track your progress');
    
    expect(result.current.getRoleDescription(UserRole.TEACHER))
      .toBe('Create classes, manage assignments, and grade student work');
    
    expect(result.current.getRoleDescription(UserRole.DEPARTMENT_ADMIN))
      .toBe('Manage department users, classes, and settings');
    
    expect(result.current.getRoleDescription(UserRole.INSTITUTION_ADMIN))
      .toBe('Oversee institution-wide settings and user management');
    
    expect(result.current.getRoleDescription(UserRole.SYSTEM_ADMIN))
      .toBe('Full system access and configuration capabilities');
  });

  it('provides correct role permissions', () => {
    const { result } = renderHook(() => useRoleSelection());
    
    const studentPermissions = result.current.getRolePermissions(UserRole.STUDENT);
    expect(studentPermissions).toContain('View and join classes');
    expect(studentPermissions).toContain('Submit assignments');
    
    const teacherPermissions = result.current.getRolePermissions(UserRole.TEACHER);
    expect(teacherPermissions).toContain('Create and manage classes');
    expect(teacherPermissions).toContain('Grade student submissions');
    
    const deptAdminPermissions = result.current.getRolePermissions(UserRole.DEPARTMENT_ADMIN);
    expect(deptAdminPermissions).toContain('Manage department users');
    expect(deptAdminPermissions).toContain('View department analytics');
    
    const instAdminPermissions = result.current.getRolePermissions(UserRole.INSTITUTION_ADMIN);
    expect(instAdminPermissions).toContain('Manage all institution users');
    expect(instAdminPermissions).toContain('Configure institution settings');
    
    const sysAdminPermissions = result.current.getRolePermissions(UserRole.SYSTEM_ADMIN);
    expect(sysAdminPermissions).toContain('Full system administration');
    expect(sysAdminPermissions).toContain('System configuration');
  });

  it('handles unknown role gracefully', () => {
    const { result } = renderHook(() => useRoleSelection());
    
    // @ts-ignore - Testing unknown role
    const description = result.current.getRoleDescription('unknown_role');
    expect(description).toBe('Role description not available');
    
    // @ts-ignore - Testing unknown role
    const permissions = result.current.getRolePermissions('unknown_role');
    expect(permissions).toEqual([]);
  });

  it('clears error when starting new role selection', async () => {
    // First, cause an error
    mockUpdateOnboardingData.mockRejectedValue(new Error('First error'));
    
    const { result } = renderHook(() => useRoleSelection());
    
    await act(async () => {
      await result.current.selectRole(UserRole.STUDENT);
    });
    
    expect(result.current.error).toBe('First error');
    
    // Now make a successful call
    mockUpdateOnboardingData.mockResolvedValue(undefined);
    
    await act(async () => {
      await result.current.selectRole(UserRole.TEACHER);
    });
    
    expect(result.current.error).toBe(null);
  });
});