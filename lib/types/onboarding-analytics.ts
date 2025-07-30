// Onboarding Analytics Types

export interface OnboardingSession {
  id: string;
  user_id: string;
  started_at: string;
  completed_at?: string;
  current_step: number;
  total_steps: number;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStepEvent {
  id: string;
  session_id: string;
  step_name: string;
  step_number: number;
  event_type: 'started' | 'completed' | 'skipped' | 'abandoned';
  event_data: Record<string, any>;
  timestamp: string;
}

export interface OnboardingAnalytics {
  id: string;
  date: string;
  role?: string;
  institution_id?: string;
  total_started: number;
  total_completed: number;
  completion_rate: number;
  avg_completion_time_minutes: number;
  drop_off_points: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface OnboardingMetrics {
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  averageCompletionTime: number;
  dropOffByStep: Record<string, number>;
  completionByRole: Record<string, {
    started: number;
    completed: number;
    rate: number;
  }>;
  dailyTrends: Array<{
    date: string;
    started: number;
    completed: number;
    rate: number;
  }>;
}

export interface StepAnalytics {
  stepName: string;
  stepNumber: number;
  totalStarted: number;
  totalCompleted: number;
  totalSkipped: number;
  totalAbandoned: number;
  completionRate: number;
  averageTimeSpent: number;
}

export interface OnboardingAnalyticsFilters {
  dateFrom?: string;
  dateTo?: string;
  role?: string;
  institutionId?: string;
  includeIncomplete?: boolean;
}

export interface OnboardingAnalyticsService {
  trackStepEvent(
    sessionId: string,
    stepName: string,
    stepNumber: number,
    eventType: OnboardingStepEvent['event_type'],
    eventData?: Record<string, any>
  ): Promise<void>;
  
  getMetrics(filters?: OnboardingAnalyticsFilters): Promise<OnboardingMetrics>;
  
  getStepAnalytics(filters?: OnboardingAnalyticsFilters): Promise<StepAnalytics[]>;
  
  getDailyAnalytics(
    dateFrom: string,
    dateTo: string,
    filters?: Omit<OnboardingAnalyticsFilters, 'dateFrom' | 'dateTo'>
  ): Promise<OnboardingAnalytics[]>;
  
  calculateDropOffPoints(filters?: OnboardingAnalyticsFilters): Promise<Record<string, number>>;
}