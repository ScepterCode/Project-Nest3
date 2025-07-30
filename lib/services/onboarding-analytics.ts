import { createClient } from '@/lib/supabase/client';
import {
  OnboardingSession,
  OnboardingStepEvent,
  OnboardingAnalytics,
  OnboardingMetrics,
  StepAnalytics,
  OnboardingAnalyticsFilters,
  OnboardingAnalyticsService
} from '@/lib/types/onboarding-analytics';

export class OnboardingAnalyticsServiceImpl implements OnboardingAnalyticsService {
  private supabase = createClient();

  async trackStepEvent(
    sessionId: string,
    stepName: string,
    stepNumber: number,
    eventType: OnboardingStepEvent['event_type'],
    eventData: Record<string, any> = {}
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('onboarding_step_events')
        .insert({
          session_id: sessionId,
          step_name: stepName,
          step_number: stepNumber,
          event_type: eventType,
          event_data: eventData,
          timestamp: new Date().toISOString()
        });

      if (error) {
        console.error('Error tracking onboarding step event:', error);
        throw error;
      }
    } catch (error) {
      console.error('Failed to track step event:', error);
      throw error;
    }
  }

  async getMetrics(filters: OnboardingAnalyticsFilters = {}): Promise<OnboardingMetrics> {
    try {
      // Build query with filters
      let query = this.supabase
        .from('onboarding_sessions')
        .select(`
          *,
          users!inner(role, institution_id)
        `);

      if (filters.dateFrom) {
        query = query.gte('started_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('started_at', filters.dateTo);
      }
      if (filters.role) {
        query = query.eq('users.role', filters.role);
      }
      if (filters.institutionId) {
        query = query.eq('users.institution_id', filters.institutionId);
      }

      const { data: sessions, error } = await query;

      if (error) throw error;

      // Calculate metrics
      const totalSessions = sessions?.length || 0;
      const completedSessions = sessions?.filter(s => s.completed_at).length || 0;
      const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

      // Calculate average completion time
      const completedSessionsWithTime = sessions?.filter(s => s.completed_at && s.started_at) || [];
      const averageCompletionTime = completedSessionsWithTime.length > 0
        ? completedSessionsWithTime.reduce((acc, session) => {
            const startTime = new Date(session.started_at).getTime();
            const endTime = new Date(session.completed_at!).getTime();
            return acc + (endTime - startTime);
          }, 0) / completedSessionsWithTime.length / (1000 * 60) // Convert to minutes
        : 0;

      // Calculate completion by role
      const completionByRole: Record<string, { started: number; completed: number; rate: number }> = {};
      sessions?.forEach(session => {
        const role = (session as any).users?.role || 'unknown';
        if (!completionByRole[role]) {
          completionByRole[role] = { started: 0, completed: 0, rate: 0 };
        }
        completionByRole[role].started++;
        if (session.completed_at) {
          completionByRole[role].completed++;
        }
      });

      // Calculate rates
      Object.keys(completionByRole).forEach(role => {
        const data = completionByRole[role];
        data.rate = data.started > 0 ? (data.completed / data.started) * 100 : 0;
      });

      // Get drop-off points
      const dropOffByStep = await this.calculateDropOffPoints(filters);

      // Get daily trends (last 30 days if no date range specified)
      const dateFrom = filters.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const dateTo = filters.dateTo || new Date().toISOString();
      const dailyAnalytics = await this.getDailyAnalytics(dateFrom, dateTo, filters);
      
      const dailyTrends = dailyAnalytics.map(day => ({
        date: day.date,
        started: day.total_started,
        completed: day.total_completed,
        rate: day.completion_rate
      }));

      return {
        totalSessions,
        completedSessions,
        completionRate: Math.round(completionRate * 100) / 100,
        averageCompletionTime: Math.round(averageCompletionTime),
        dropOffByStep,
        completionByRole,
        dailyTrends
      };
    } catch (error) {
      console.error('Error getting onboarding metrics:', error);
      throw error;
    }
  }

  async getStepAnalytics(filters: OnboardingAnalyticsFilters = {}): Promise<StepAnalytics[]> {
    try {
      let query = this.supabase
        .from('onboarding_step_events')
        .select(`
          *,
          onboarding_sessions!inner(
            user_id,
            users!inner(role, institution_id)
          )
        `);

      if (filters.dateFrom) {
        query = query.gte('timestamp', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('timestamp', filters.dateTo);
      }
      if (filters.role) {
        query = query.eq('onboarding_sessions.users.role', filters.role);
      }
      if (filters.institutionId) {
        query = query.eq('onboarding_sessions.users.institution_id', filters.institutionId);
      }

      const { data: events, error } = await query;

      if (error) throw error;

      // Group events by step
      const stepGroups: Record<string, OnboardingStepEvent[]> = {};
      events?.forEach(event => {
        const key = `${event.step_number}-${event.step_name}`;
        if (!stepGroups[key]) {
          stepGroups[key] = [];
        }
        stepGroups[key].push(event);
      });

      // Calculate analytics for each step
      const stepAnalytics: StepAnalytics[] = Object.entries(stepGroups).map(([key, stepEvents]) => {
        const [stepNumber, stepName] = key.split('-', 2);
        
        const totalStarted = stepEvents.filter(e => e.event_type === 'started').length;
        const totalCompleted = stepEvents.filter(e => e.event_type === 'completed').length;
        const totalSkipped = stepEvents.filter(e => e.event_type === 'skipped').length;
        const totalAbandoned = stepEvents.filter(e => e.event_type === 'abandoned').length;
        
        const completionRate = totalStarted > 0 ? (totalCompleted / totalStarted) * 100 : 0;
        
        // Calculate average time spent (simplified - would need more sophisticated tracking)
        const averageTimeSpent = 0; // TODO: Implement time tracking between events

        return {
          stepName,
          stepNumber: parseInt(stepNumber),
          totalStarted,
          totalCompleted,
          totalSkipped,
          totalAbandoned,
          completionRate: Math.round(completionRate * 100) / 100,
          averageTimeSpent
        };
      });

      return stepAnalytics.sort((a, b) => a.stepNumber - b.stepNumber);
    } catch (error) {
      console.error('Error getting step analytics:', error);
      throw error;
    }
  }

  async getDailyAnalytics(
    dateFrom: string,
    dateTo: string,
    filters: Omit<OnboardingAnalyticsFilters, 'dateFrom' | 'dateTo'> = {}
  ): Promise<OnboardingAnalytics[]> {
    try {
      let query = this.supabase
        .from('onboarding_analytics')
        .select('*')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true });

      if (filters.role) {
        query = query.eq('role', filters.role);
      }
      if (filters.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting daily analytics:', error);
      throw error;
    }
  }

  async calculateDropOffPoints(filters: OnboardingAnalyticsFilters = {}): Promise<Record<string, number>> {
    try {
      // Get all sessions with their last completed step
      let query = this.supabase
        .from('onboarding_sessions')
        .select(`
          current_step,
          completed_at,
          users!inner(role, institution_id)
        `);

      if (filters.dateFrom) {
        query = query.gte('started_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('started_at', filters.dateTo);
      }
      if (filters.role) {
        query = query.eq('users.role', filters.role);
      }
      if (filters.institutionId) {
        query = query.eq('users.institution_id', filters.institutionId);
      }

      const { data: sessions, error } = await query;

      if (error) throw error;

      // Calculate drop-off points
      const dropOffPoints: Record<string, number> = {};
      const incompleteSessions = sessions?.filter(s => !s.completed_at) || [];

      incompleteSessions.forEach(session => {
        const stepKey = `step_${session.current_step}`;
        dropOffPoints[stepKey] = (dropOffPoints[stepKey] || 0) + 1;
      });

      // Convert to percentages
      const totalIncomplete = incompleteSessions.length;
      if (totalIncomplete > 0) {
        Object.keys(dropOffPoints).forEach(step => {
          dropOffPoints[step] = Math.round((dropOffPoints[step] / totalIncomplete) * 100 * 100) / 100;
        });
      }

      return dropOffPoints;
    } catch (error) {
      console.error('Error calculating drop-off points:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const onboardingAnalyticsService = new OnboardingAnalyticsServiceImpl();