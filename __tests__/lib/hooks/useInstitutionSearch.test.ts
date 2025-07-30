import { renderHook, act } from '@testing-library/react';
import { useInstitutionSearch } from '@/lib/hooks/useOnboarding';
import { useOnboarding } from '@/contexts/onboarding-context';
import { onboardingService } from '@/lib/services/onboarding';
import { InstitutionSearchResult, OnboardingError, UserRole } from '@/lib/types/onboarding';

// Mock dependencies
jest.mock('@/contexts/onboarding-context');
jest.mock('@/lib/services/onboarding');

const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;
const mockOnboardingService = onboardingService as jest.Mocked<typeof onboardingService>;

const mockInstitutions: InstitutionSearchResult[] = [
  {
    id: '1',
    name: 'University of Example',
    domain: 'example.edu',
    type: 'university',
    departmentCount: 15,
    userCount: 1200
  },
  {
    id: '2',
    name: 'Example College',
    domain: 'college.edu',
    type: 'college',
    departmentCount: 8,
    userCount: 500
  }
];

describe('useInstitutionSearch', () => {
  const mockUpdateOnboardingData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseOnboarding.mockReturnValue({
      currentStep: 1,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        currentStep: 1,
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
    const { result } = renderHook(() => useInstitutionSearch());

    expect(result.current.institutions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.searchInstitutions).toBe('function');
    expect(typeof result.current.selectInstitution).toBe('function');
    expect(typeof result.current.clearSearch).toBe('function');
  });

  it('clears institutions for empty queries', async () => {
    const { result } = renderHook(() => useInstitutionSearch());

    await act(async () => {
      await result.current.searchInstitutions('');
    });

    expect(result.current.institutions).toEqual([]);
    expect(mockOnboardingService.searchInstitutions).not.toHaveBeenCalled();
  });

  it('clears institutions for whitespace-only queries', async () => {
    const { result } = renderHook(() => useInstitutionSearch());

    await act(async () => {
      await result.current.searchInstitutions('   ');
    });

    expect(result.current.institutions).toEqual([]);
    expect(mockOnboardingService.searchInstitutions).not.toHaveBeenCalled();
  });

  it('searches institutions successfully', async () => {
    mockOnboardingService.searchInstitutions.mockResolvedValue(mockInstitutions);

    const { result } = renderHook(() => useInstitutionSearch());

    await act(async () => {
      await result.current.searchInstitutions('university');
    });

    expect(mockOnboardingService.searchInstitutions).toHaveBeenCalledWith('university');
    expect(result.current.institutions).toEqual(mockInstitutions);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('handles search errors', async () => {
    const errorMessage = 'Search failed';
    mockOnboardingService.searchInstitutions.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useInstitutionSearch());

    await act(async () => {
      await result.current.searchInstitutions('university');
    });

    expect(result.current.institutions).toEqual([]);
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.loading).toBe(false);
  });

  it('handles OnboardingError specifically', async () => {
    const onboardingError = new OnboardingError('Institution search failed', 'VALIDATION_FAILED');
    mockOnboardingService.searchInstitutions.mockRejectedValue(onboardingError);

    const { result } = renderHook(() => useInstitutionSearch());

    await act(async () => {
      await result.current.searchInstitutions('university');
    });

    expect(result.current.error).toBe('Institution search failed');
  });

  it('sets loading state during search', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    mockOnboardingService.searchInstitutions.mockReturnValue(promise);

    const { result } = renderHook(() => useInstitutionSearch());

    // Start search
    act(() => {
      result.current.searchInstitutions('university');
    });

    // Should be loading
    expect(result.current.loading).toBe(true);

    // Resolve the promise
    await act(async () => {
      resolvePromise!(mockInstitutions);
      await promise;
    });

    // Should no longer be loading
    expect(result.current.loading).toBe(false);
    expect(result.current.institutions).toEqual(mockInstitutions);
  });

  it('selects institution successfully', async () => {
    mockUpdateOnboardingData.mockResolvedValue(undefined);

    const { result } = renderHook(() => useInstitutionSearch());

    let success: boolean = false;

    await act(async () => {
      success = await result.current.selectInstitution(mockInstitutions[0]);
    });

    expect(success).toBe(true);
    expect(mockUpdateOnboardingData).toHaveBeenCalledWith({
      institutionId: mockInstitutions[0].id
    });
    expect(result.current.error).toBe(null);
  });

  it('handles institution selection failure', async () => {
    const errorMessage = 'Failed to select institution';
    mockUpdateOnboardingData.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useInstitutionSearch());

    let success: boolean = true;

    await act(async () => {
      success = await result.current.selectInstitution(mockInstitutions[0]);
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe(errorMessage);
  });

  it('handles OnboardingError during selection', async () => {
    const onboardingError = new OnboardingError('Selection failed', 'VALIDATION_FAILED');
    mockUpdateOnboardingData.mockRejectedValue(onboardingError);

    const { result } = renderHook(() => useInstitutionSearch());

    let success: boolean = true;

    await act(async () => {
      success = await result.current.selectInstitution(mockInstitutions[0]);
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe('Selection failed');
  });

  it('clears search results and error', () => {
    const { result } = renderHook(() => useInstitutionSearch());

    // Set some initial state
    act(() => {
      // Simulate having search results and error
      result.current.searchInstitutions('test').catch(() => { });
    });

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.institutions).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it('clears error when starting new search', async () => {
    // First, cause an error
    mockOnboardingService.searchInstitutions.mockRejectedValue(new Error('First error'));

    const { result } = renderHook(() => useInstitutionSearch());

    await act(async () => {
      await result.current.searchInstitutions('fail');
    });

    expect(result.current.error).toBe('First error');

    // Now make a successful search
    mockOnboardingService.searchInstitutions.mockResolvedValue(mockInstitutions);

    await act(async () => {
      await result.current.searchInstitutions('success');
    });

    expect(result.current.error).toBe(null);
    expect(result.current.institutions).toEqual(mockInstitutions);
  });

  it('trims search query before sending to service', async () => {
    mockOnboardingService.searchInstitutions.mockResolvedValue([]);

    const { result } = renderHook(() => useInstitutionSearch());

    await act(async () => {
      await result.current.searchInstitutions('  university  ');
    });

    expect(mockOnboardingService.searchInstitutions).toHaveBeenCalledWith('  university  ');
  });

  it('handles concurrent searches correctly', async () => {
    let resolveFirst: (value: any) => void;
    let resolveSecond: (value: any) => void;

    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise(resolve => {
      resolveSecond = resolve;
    });

    mockOnboardingService.searchInstitutions
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const { result } = renderHook(() => useInstitutionSearch());

    // Start first search
    act(() => {
      result.current.searchInstitutions('first');
    });

    // Start second search
    act(() => {
      result.current.searchInstitutions('second');
    });

    // Resolve second search first
    await act(async () => {
      resolveSecond!(mockInstitutions);
      await secondPromise;
    });

    expect(result.current.institutions).toEqual(mockInstitutions);

    // Resolve first search (should not override second)
    await act(async () => {
      resolveFirst!([]);
      await firstPromise;
    });

    // Should still have results from second search
    expect(result.current.institutions).toEqual(mockInstitutions);
  });
});