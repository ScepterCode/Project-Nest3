// Onboarding session lookups (used by lib/utils/onboarding-guard.ts).

import { createClient } from '@/lib/supabase/client';
import {
  OnboardingData,
  OnboardingSession,
  OnboardingError,
  OnboardingErrorCode,
} from '@/lib/types/onboarding';

export class OnboardingService {
  private supabase = createClient();

  async getOnboardingSession(
    userId: string
  ): Promise<OnboardingSession | null> {
    try {
      const { data, error } = await this.supabase
        .from('onboarding_sessions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      return this.mapOnboardingSession(data);
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to get onboarding session',
        OnboardingErrorCode.SESSION_EXPIRED,
        0,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private mapOnboardingSession(
    data: Record<string, unknown>
  ): OnboardingSession {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      currentStep: data.current_step as number,
      totalSteps: data.total_steps as number,
      data: data.data as OnboardingData,
      startedAt: new Date(data.started_at as string),
      completedAt: data.completed_at
        ? new Date(data.completed_at as string)
        : undefined,
      lastActivity: new Date(data.last_activity as string),
    } as OnboardingSession;
  }
}

export const onboardingService = new OnboardingService();
