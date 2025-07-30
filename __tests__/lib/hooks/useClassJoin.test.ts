import { renderHook, act } from '@testing-library/react';
import { useClassJoin } from '@/lib/hooks/useOnboarding';
import { useOnboarding } from '@/contexts/onboarding-context';
import { ClassInfo, OnboardingError, UserRole } from '@/lib/types/onboarding';

// Mock dependencies
jest.mock('@/contexts/onboarding-context');

const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

const mockClass: ClassInfo = {
  id: 'class-1',
  name: 'Introduction to Computer Science',
  code: 'CS101',
  description: 'Learn the fundamentals of computer science',
  teacherName: 'Dr. Jane Smith',
  teacherId: 'teacher-1',
  institutionId: 'institution-1',
  departmentId: 'department-1',
  studentCount: 25,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01')
};

describe('useClassJoin', () => {
  const mockUpdateOnboardingData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseOnboarding.mockReturnValue({
      currentStep: 3,
      totalSteps: 6,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        institutionId: 'institution-1',
        departmentId: 'department-1',
        currentStep: 3,
        skippedSteps: [],
        classIds: []
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
    const { result } = renderHook(() => useClassJoin());
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.joinClass).toBe('function');
  });

  it('successfully joins a class', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: { class: mockClass },
        message: 'Successfully joined the class!'
      })
    };
    mockFetch.mockResolvedValue(mockResponse as any);
    mockUpdateOnboardingData.mockResolvedValue(undefined);

    const { result } = renderHook(() => useClassJoin());
    
    let joinResult: any;
    
    await act(async () => {
      joinResult = await result.current.joinClass('CS101');
    });
    
    expect(mockFetch).toHaveBeenCalledWith('/api/classes/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        classCode: 'CS101',
        userId: 'test-user'
      })
    });
    
    expect(joinResult.success).toBe(true);
    expect(joinResult.class).toEqual(mockClass);
    expect(joinResult.message).toBe('Successfully joined the class!');
    
    expect(mockUpdateOnboardingData).toHaveBeenCalledWith({
      classIds: [mockClass.id]
    });
    
    expect(result.current.error).toBe(null);
    expect(result.current.loading).toBe(false);
  });

  it('handles class join failure from API', async () => {
    const mockResponse = {
      ok: false,
      json: jest.fn().mockResolvedValue({
        success: false,
        error: 'Class not found'
      })
    };
    mockFetch.mockResolvedValue(mockResponse as any);

    const { result } = renderHook(() => useClassJoin());
    
    let joinResult: any;
    
    await act(async () => {
      joinResult = await result.current.joinClass('INVALID');
    });
    
    expect(joinResult.success).toBe(false);
    expect(joinResult.error).toBe('Class not found');
    expect(result.current.error).toBe('Class not found');
    expect(mockUpdateOnboardingData).not.toHaveBeenCalled();
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useClassJoin());
    
    let joinResult: any;
    
    await act(async () => {
      joinResult = await result.current.joinClass('CS101');
    });
    
    expect(joinResult.success).toBe(false);
    expect(joinResult.error).toBe('Network error');
    expect(result.current.error).toBe('Network error');
  });

  it('validates class code format', async () => {
    const { result } = renderHook(() => useClassJoin());
    
    let joinResult: any;
    
    await act(async () => {
      joinResult = await result.current.joinClass('AB');
    });
    
    expect(joinResult.success).toBe(false);
    expect(joinResult.error).toBe('Invalid class code format');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('validates empty class code', async () => {
    const { result } = renderHook(() => useClassJoin());
    
    let joinResult: any;
    
    await act(async () => {
      joinResult = await result.current.joinClass('');
    });
    
    expect(joinResult.success).toBe(false);
    expect(joinResult.error).toBe('Invalid class code format');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('converts class code to uppercase', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: { class: mockClass },
        message: 'Successfully joined the class!'
      })
    };
    mockFetch.mockResolvedValue(mockResponse as any);
    mockUpdateOnboardingData.mockResolvedValue(undefined);

    const { result } = renderHook(() => useClassJoin());
    
    await act(async () => {
      await result.current.joinClass('cs101');
    });
    
    expect(mockFetch).toHaveBeenCalledWith('/api/classes/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        classCode: 'CS101',
        userId: 'test-user'
      })
    });
  });

  it('trims whitespace from class code', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: { class: mockClass },
        message: 'Successfully joined the class!'
      })
    };
    mockFetch.mockResolvedValue(mockResponse as any);
    mockUpdateOnboardingData.mockResolvedValue(undefined);

    const { result } = renderHook(() => useClassJoin());
    
    await act(async () => {
      await result.current.joinClass('  CS101  ');
    });
    
    expect(mockFetch).toHaveBeenCalledWith('/api/classes/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        classCode: 'CS101',
        userId: 'test-user'
      })
    });
  });

  it('sets loading state during class join', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });
    
    mockFetch.mockReturnValue(promise);
    
    const { result } = renderHook(() => useClassJoin());
    
    // Start class join
    act(() => {
      result.current.joinClass('CS101');
    });
    
    // Should be loading
    expect(result.current.loading).toBe(true);
    
    // Resolve the promise
    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { class: mockClass },
          message: 'Success'
        })
      });
      await promise;
    });
    
    // Should no longer be loading
    expect(result.current.loading).toBe(false);
  });

  it('handles OnboardingError specifically', async () => {
    const onboardingError = new OnboardingError('Validation failed', 'VALIDATION_FAILED');
    mockFetch.mockRejectedValue(onboardingError);

    const { result } = renderHook(() => useClassJoin());
    
    let joinResult: any;
    
    await act(async () => {
      joinResult = await result.current.joinClass('CS101');
    });
    
    expect(joinResult.success).toBe(false);
    expect(joinResult.error).toBe('Validation failed');
    expect(result.current.error).toBe('Validation failed');
  });

  it('updates class IDs when joining additional classes', async () => {
    // Mock existing class IDs
    mockUseOnboarding.mockReturnValue({
      currentStep: 3,
      totalSteps: 6,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        institutionId: 'institution-1',
        departmentId: 'department-1',
        currentStep: 3,
        skippedSteps: [],
        classIds: ['existing-class-1', 'existing-class-2']
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

    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: { class: mockClass },
        message: 'Successfully joined the class!'
      })
    };
    mockFetch.mockResolvedValue(mockResponse as any);
    mockUpdateOnboardingData.mockResolvedValue(undefined);

    const { result } = renderHook(() => useClassJoin());
    
    await act(async () => {
      await result.current.joinClass('CS101');
    });
    
    expect(mockUpdateOnboardingData).toHaveBeenCalledWith({
      classIds: ['existing-class-1', 'existing-class-2', mockClass.id]
    });
  });

  it('handles API response without success field', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: { class: mockClass }
      })
    };
    mockFetch.mockResolvedValue(mockResponse as any);

    const { result } = renderHook(() => useClassJoin());
    
    let joinResult: any;
    
    await act(async () => {
      joinResult = await result.current.joinClass('CS101');
    });
    
    expect(joinResult.success).toBe(false);
    expect(joinResult.error).toBe('Failed to join class');
  });

  it('clears error when starting new join attempt', async () => {
    // First, cause an error
    mockFetch.mockRejectedValue(new Error('First error'));
    
    const { result } = renderHook(() => useClassJoin());
    
    await act(async () => {
      await result.current.joinClass('INVALID');
    });
    
    expect(result.current.error).toBe('First error');
    
    // Now make a successful call
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: { class: mockClass },
        message: 'Success'
      })
    };
    mockFetch.mockResolvedValue(mockResponse as any);
    mockUpdateOnboardingData.mockResolvedValue(undefined);
    
    await act(async () => {
      await result.current.joinClass('CS101');
    });
    
    expect(result.current.error).toBe(null);
  });
});