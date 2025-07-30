// Unit tests for onboarding service

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OnboardingService } from '@/lib/services/onboarding';
import { OnboardingError, OnboardingErrorCode, UserRole } from '@/lib/types/onboarding';

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
          limit: jest.fn()
        })),
        ilike: jest.fn(() => ({
          eq: jest.fn(() => ({
            limit: jest.fn()
          }))
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn()
          }))
        }))
      }))
    }))
  }))
}));

describe('OnboardingService', () => {
  let onboardingService: OnboardingService;
  let mockSupabase: any;

  beforeEach(() => {
    onboardingService = new OnboardingService();
    mockSupabase = (onboardingService as any).supabase;
  });

  describe('createOnboardingSession', () => {
    it('should create a new onboarding session successfully', async () => {
      const userId = 'test-user-id';
      const mockSessionData = {
        id: 'session-id',
        user_id: userId,
        current_step: 0,
        total_steps: 5,
        data: { userId, currentStep: 0, skippedSteps: [] },
        started_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      };

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockSessionData, error: null })
          })
        })
      });

      const result = await onboardingService.createOnboardingSession(userId);

      expect(result.userId).toBe(userId);
      expect(result.currentStep).toBe(0);
      expect(result.totalSteps).toBe(5);
      expect(mockSupabase.from).toHaveBeenCalledWith('onboarding_sessions');
    });

    it('should throw OnboardingError when creation fails', async () => {
      const userId = 'test-user-id';
      const mockError = { message: 'Database error' };

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: mockError })
          })
        })
      });

      await expect(onboardingService.createOnboardingSession(userId))
        .rejects.toThrow(OnboardingError);
    });
  });

  describe('getOnboardingSession', () => {
    it('should retrieve existing onboarding session', async () => {
      const userId = 'test-user-id';
      const mockSessionData = {
        id: 'session-id',
        user_id: userId,
        current_step: 2,
        total_steps: 5,
        data: { userId, currentStep: 2, skippedSteps: [] },
        started_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockSessionData, error: null })
          })
        })
      });

      const result = await onboardingService.getOnboardingSession(userId);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(userId);
      expect(result?.currentStep).toBe(2);
    });

    it('should return null when session does not exist', async () => {
      const userId = 'test-user-id';

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: null, 
              error: { code: 'PGRST116' } // Not found error
            })
          })
        })
      });

      const result = await onboardingService.getOnboardingSession(userId);

      expect(result).toBeNull();
    });
  });

  describe('searchInstitutions', () => {
    it('should return matching institutions', async () => {
      const query = 'University';
      const mockInstitutions = [
        {
          id: 'inst-1',
          name: 'Demo University',
          domain: 'demo.edu',
          type: 'university',
          departments: [{ count: 5 }]
        },
        {
          id: 'inst-2',
          name: 'Test University',
          domain: 'test.edu',
          type: 'university',
          departments: [{ count: 3 }]
        }
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          ilike: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: mockInstitutions, error: null })
            })
          })
        })
      });

      const result = await onboardingService.searchInstitutions(query);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Demo University');
      expect(result[0].departmentCount).toBe(5);
      expect(result[1].departmentCount).toBe(3);
    });

    it('should handle search errors gracefully', async () => {
      const query = 'University';
      const mockError = { message: 'Search failed' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          ilike: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: null, error: mockError })
            })
          })
        })
      });

      await expect(onboardingService.searchInstitutions(query))
        .rejects.toThrow(OnboardingError);
    });
  });

  describe('validateInstitutionAccess', () => {
    it('should return true for valid institution', async () => {
      const userId = 'user-id';
      const institutionId = 'inst-id';

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ 
                data: { id: institutionId }, 
                error: null 
              })
            })
          })
        })
      });

      const result = await onboardingService.validateInstitutionAccess(userId, institutionId);

      expect(result).toBe(true);
    });

    it('should return false for invalid institution', async () => {
      const userId = 'user-id';
      const institutionId = 'invalid-inst-id';

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ 
                data: null, 
                error: { code: 'PGRST116' }
              })
            })
          })
        })
      });

      const result = await onboardingService.validateInstitutionAccess(userId, institutionId);

      expect(result).toBe(false);
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
      const userId = 'user-id';
      const updates = {
        role: UserRole.STUDENT,
        institutionId: 'inst-id',
        departmentId: 'dept-id'
      };

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      });

      await expect(onboardingService.updateUserProfile(userId, updates))
        .resolves.not.toThrow();

      expect(mockSupabase.from).toHaveBeenCalledWith('users');
    });

    it('should throw error when update fails', async () => {
      const userId = 'user-id';
      const updates = { role: UserRole.STUDENT };
      const mockError = { message: 'Update failed' };

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: mockError })
        })
      });

      await expect(onboardingService.updateUserProfile(userId, updates))
        .rejects.toThrow(OnboardingError);
    });
  });
});

// Test OnboardingError class
describe('OnboardingError', () => {
  it('should create error with all properties', () => {
    const error = new OnboardingError(
      'Test error',
      OnboardingErrorCode.INVALID_STEP,
      2,
      'role'
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(OnboardingErrorCode.INVALID_STEP);
    expect(error.step).toBe(2);
    expect(error.field).toBe('role');
    expect(error.name).toBe('OnboardingError');
  });

  it('should create error with minimal properties', () => {
    const error = new OnboardingError(
      'Simple error',
      OnboardingErrorCode.VALIDATION_FAILED
    );

    expect(error.message).toBe('Simple error');
    expect(error.code).toBe(OnboardingErrorCode.VALIDATION_FAILED);
    expect(error.step).toBeUndefined();
    expect(error.field).toBeUndefined();
  });
});