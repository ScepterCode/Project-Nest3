import { OnboardingAnalyticsServiceImpl } from '@/lib/services/onboarding-analytics';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase
jest.mock('@/lib/supabase/server');

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      gte: jest.fn(() => ({
        lte: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      eq: jest.fn(() => ({
        order: jest.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      single: jest.fn(() => Promise.resolve({ data: null, error: null }))
    })),
    insert: jest.fn(() => Promise.resolve({ error: null })),
    update: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({ error: null }))
    }))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('OnboardingAnalyticsService', () => {
  let service: OnboardingAnalyticsServiceImpl;

  beforeEach(() => {
    service = new OnboardingAnalyticsServiceImpl();
    jest.clearAllMocks();
  });

  describe('trackStepEvent', () => {
    it('should track step event successfully', async () => {
      const mockInsert = jest.fn(() => Promise.resolve({ error: null }));
      mockSupabase.from.mockReturnValue({
        insert: mockInsert
      });

      await service.trackStepEvent('session-123', 'role-selection', 1, 'started', { role: 'student' });

      expect(mockSupabase.from).toHaveBeenCalledWith('onboarding_step_events');
      expect(mockInsert).toHaveBeenCalledWith({
        session_id: 'session-123',
        step_name: 'role-selection',
        step_number: 1,
        event_type: 'started',
        event_data: { role: 'student' },
        timestamp: expect.any(String)
      });
    });

    it('should handle tracking errors', async () => {
      const mockInsert = jest.fn(() => Promise.resolve({ error: { message: 'Database error' } }));
      mockSupabase.from.mockReturnValue({
        insert: mockInsert
      });

      await expect(
        service.trackStepEvent('session-123', 'role-selection', 1, 'started')
      ).rejects.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should calculate metrics correctly', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          started_at: '2024-01-01T10:00:00Z',
          completed_at: '2024-01-01T10:30:00Z',
          users: { role: 'student', institution_id: 'inst-1' }
        },
        {
          id: 'session-2',
          started_at: '2024-01-01T11:00:00Z',
          completed_at: null,
          users: { role: 'teacher', institution_id: 'inst-1' }
        },
        {
          id: 'session-3',
          started_at: '2024-01-01T12:00:00Z',
          completed_at: '2024-01-01T12:45:00Z',
          users: { role: 'student', institution_id: 'inst-1' }
        }
      ];

      const mockSelect = jest.fn(() => ({
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: mockSessions, error: null }))
          }))
        }))
      }));

      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      // Mock calculateDropOffPoints and getDailyAnalytics
      jest.spyOn(service, 'calculateDropOffPoints').mockResolvedValue({ step_2: 33.33 });
      jest.spyOn(service, 'getDailyAnalytics').mockResolvedValue([]);

      const metrics = await service.getMetrics();

      expect(metrics.totalSessions).toBe(3);
      expect(metrics.completedSessions).toBe(2);
      expect(metrics.completionRate).toBe(66.67);
      expect(metrics.completionByRole.student.started).toBe(2);
      expect(metrics.completionByRole.student.completed).toBe(2);
      expect(metrics.completionByRole.student.rate).toBe(100);
      expect(metrics.completionByRole.teacher.started).toBe(1);
      expect(metrics.completionByRole.teacher.completed).toBe(0);
      expect(metrics.completionByRole.teacher.rate).toBe(0);
    });

    it('should handle empty data', async () => {
      const mockSelect = jest.fn(() => Promise.resolve({ data: [], error: null }));
      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      jest.spyOn(service, 'calculateDropOffPoints').mockResolvedValue({});
      jest.spyOn(service, 'getDailyAnalytics').mockResolvedValue([]);

      const metrics = await service.getMetrics();

      expect(metrics.totalSessions).toBe(0);
      expect(metrics.completedSessions).toBe(0);
      expect(metrics.completionRate).toBe(0);
      expect(metrics.averageCompletionTime).toBe(0);
    });

    it('should apply filters correctly', async () => {
      const mockQuery = {
        gte: jest.fn(() => mockQuery),
        lte: jest.fn(() => mockQuery),
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      };
      const mockSelect = jest.fn(() => mockQuery);
      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      jest.spyOn(service, 'calculateDropOffPoints').mockResolvedValue({});
      jest.spyOn(service, 'getDailyAnalytics').mockResolvedValue([]);

      await service.getMetrics({
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        role: 'student',
        institutionId: 'inst-1'
      });

      expect(mockQuery.gte).toHaveBeenCalledWith('started_at', '2024-01-01');
      expect(mockQuery.lte).toHaveBeenCalledWith('started_at', '2024-01-31');
      expect(mockQuery.eq).toHaveBeenCalledWith('users.role', 'student');
      expect(mockQuery.eq).toHaveBeenCalledWith('users.institution_id', 'inst-1');
    });
  });

  describe('getStepAnalytics', () => {
    it('should calculate step analytics correctly', async () => {
      const mockEvents = [
        {
          step_name: 'role-selection',
          step_number: 1,
          event_type: 'started',
          onboarding_sessions: { users: { role: 'student' } }
        },
        {
          step_name: 'role-selection',
          step_number: 1,
          event_type: 'completed',
          onboarding_sessions: { users: { role: 'student' } }
        },
        {
          step_name: 'institution-setup',
          step_number: 2,
          event_type: 'started',
          onboarding_sessions: { users: { role: 'student' } }
        },
        {
          step_name: 'institution-setup',
          step_number: 2,
          event_type: 'skipped',
          onboarding_sessions: { users: { role: 'student' } }
        }
      ];

      const mockQuery = {
        gte: jest.fn(() => mockQuery),
        lte: jest.fn(() => mockQuery),
        eq: jest.fn(() => Promise.resolve({ data: mockEvents, error: null }))
      };
      const mockSelect = jest.fn(() => mockQuery);
      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      const stepAnalytics = await service.getStepAnalytics();

      expect(stepAnalytics).toHaveLength(2);
      
      const roleSelectionStep = stepAnalytics.find(s => s.stepName === 'role-selection');
      expect(roleSelectionStep?.totalStarted).toBe(1);
      expect(roleSelectionStep?.totalCompleted).toBe(1);
      expect(roleSelectionStep?.completionRate).toBe(100);

      const institutionStep = stepAnalytics.find(s => s.stepName === 'institution-setup');
      expect(institutionStep?.totalStarted).toBe(1);
      expect(institutionStep?.totalSkipped).toBe(1);
      expect(institutionStep?.completionRate).toBe(0);
    });
  });

  describe('calculateDropOffPoints', () => {
    it('should calculate drop-off points correctly', async () => {
      const mockSessions = [
        { current_step: 1, completed_at: null, users: { role: 'student' } },
        { current_step: 2, completed_at: null, users: { role: 'student' } },
        { current_step: 2, completed_at: null, users: { role: 'teacher' } },
        { current_step: 3, completed_at: '2024-01-01T10:00:00Z', users: { role: 'student' } }
      ];

      const mockQuery = {
        gte: jest.fn(() => mockQuery),
        lte: jest.fn(() => mockQuery),
        eq: jest.fn(() => Promise.resolve({ data: mockSessions, error: null }))
      };
      const mockSelect = jest.fn(() => mockQuery);
      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      const dropOffPoints = await service.calculateDropOffPoints();

      expect(dropOffPoints.step_1).toBe(33.33); // 1 out of 3 incomplete sessions
      expect(dropOffPoints.step_2).toBe(66.67); // 2 out of 3 incomplete sessions
      expect(dropOffPoints.step_3).toBeUndefined(); // This session was completed
    });

    it('should handle no incomplete sessions', async () => {
      const mockSessions = [
        { current_step: 3, completed_at: '2024-01-01T10:00:00Z', users: { role: 'student' } }
      ];

      const mockSelect = jest.fn(() => Promise.resolve({ data: mockSessions, error: null }));
      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      const dropOffPoints = await service.calculateDropOffPoints();

      expect(Object.keys(dropOffPoints)).toHaveLength(0);
    });
  });

  describe('getDailyAnalytics', () => {
    it('should retrieve daily analytics with filters', async () => {
      const mockAnalytics = [
        {
          date: '2024-01-01',
          role: 'student',
          total_started: 10,
          total_completed: 8,
          completion_rate: 80
        }
      ];

      const mockQuery = {
        gte: jest.fn(() => mockQuery),
        lte: jest.fn(() => mockQuery),
        eq: jest.fn(() => mockQuery),
        order: jest.fn(() => Promise.resolve({ data: mockAnalytics, error: null }))
      };
      const mockSelect = jest.fn(() => mockQuery);
      mockSupabase.from.mockReturnValue({
        select: mockSelect
      });

      const result = await service.getDailyAnalytics('2024-01-01', '2024-01-31', { role: 'student' });

      expect(mockSupabase.from).toHaveBeenCalledWith('onboarding_analytics');
      expect(mockQuery.gte).toHaveBeenCalledWith('date', '2024-01-01');
      expect(mockQuery.lte).toHaveBeenCalledWith('date', '2024-01-31');
      expect(mockQuery.eq).toHaveBeenCalledWith('role', 'student');
      expect(mockQuery.order).toHaveBeenCalledWith('date', { ascending: true });
      expect(result).toEqual(mockAnalytics);
    });
  });
});