import { createClient } from '@/lib/supabase/client';
import { OnboardingService } from '@/lib/services/onboarding';
import { OnboardingError, OnboardingErrorCode } from '@/lib/types/onboarding';
import { createSupabaseMock } from '../../helpers/supabase-mock';

jest.mock('@/lib/supabase/client');

const serviceWith = (select: { data?: unknown; error?: unknown }) => {
  const supabase = createSupabaseMock({
    tables: { onboarding_sessions: { select } },
  });
  (createClient as jest.Mock).mockReturnValue(supabase);
  return { service: new OnboardingService(), supabase };
};

describe('OnboardingService.getOnboardingSession', () => {
  it('maps a stored session', async () => {
    const { service, supabase } = serviceWith({
      data: {
        id: 's1',
        user_id: 'u1',
        current_step: 2,
        total_steps: 5,
        data: { role: 'student' },
        started_at: '2026-09-01T10:00:00Z',
        completed_at: null,
        last_activity: '2026-09-02T10:00:00Z',
      },
    });

    const session = await service.getOnboardingSession('u1');

    expect(session).toMatchObject({
      id: 's1',
      userId: 'u1',
      currentStep: 2,
      totalSteps: 5,
      completedAt: undefined,
    });
    expect(session?.startedAt).toEqual(new Date('2026-09-01T10:00:00Z'));
    expect(supabase.calls[0].filters).toContainEqual(['eq', 'user_id', 'u1']);
  });

  it('returns null when the user has no session', async () => {
    const { service } = serviceWith({
      data: null,
      error: { code: 'PGRST116' },
    });
    await expect(service.getOnboardingSession('u1')).resolves.toBeNull();
  });

  it('wraps database errors in an OnboardingError', async () => {
    const { service } = serviceWith({
      data: null,
      error: { code: '42501', message: 'denied' },
    });
    const failure = service.getOnboardingSession('u1');
    await expect(failure).rejects.toBeInstanceOf(OnboardingError);
    await expect(failure).rejects.toMatchObject({
      code: OnboardingErrorCode.SESSION_EXPIRED,
    });
  });
});
