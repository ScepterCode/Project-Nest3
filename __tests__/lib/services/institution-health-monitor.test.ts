import { InstitutionHealthMonitor } from '@/lib/services/institution-health-monitor';
import { createClient } from '@/lib/supabase/server';
import { NotificationService } from '@/lib/services/notification-service';

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

jest.mock('@/lib/services/notification-service', () => ({
  NotificationService: jest.fn()
}));

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        gte: jest.fn(() => ({ data: [] })),
        single: jest.fn(() => ({ data: null })),
        is: jest.fn(() => ({ data: [] }))
      }))
    })),
    insert: jest.fn(() => ({ data: null })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({ data: null }))
    }))
  }))
};

const mockNotificationService = {
  sendNotification: jest.fn()
};

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const MockedNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;

mockedCreateClient.mockReturnValue(mockSupabase as any);
MockedNotificationService.mockImplementation(() => mockNotificationService as any);

describe('InstitutionHealthMonitor', () => {
  let monitor: InstitutionHealthMonitor;
  const institutionId = 'test-institution-id';

  beforeEach(() => {
    monitor = new InstitutionHealthMonitor();
    jest.clearAllMocks();
  });

  describe('collectHealthMetrics', () => {
    it('should collect all health metrics for an institution', async () => {
      // Mock user activity data
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: [{ id: '1' }, { id: '2' }] })) // 2 active users
              }))
            }))
          };
        }
        if (table === 'auth_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: [{ id: '1' }] })) // 1 login
              }))
            }))
          };
        }
        if (table === 'classes') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: [{ id: '1' }] })) // 1 new class
              }))
            }))
          };
        }
        if (table === 'enrollments') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: [{ id: '1' }] })) // 1 enrollment
              }))
            }))
          };
        }
        if (table === 'error_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: [] })) // No errors
              }))
            }))
          };
        }
        return {
          insert: jest.fn(() => ({ data: null }))
        };
      });

      const metrics = await monitor.collectHealthMetrics(institutionId);

      expect(metrics).toHaveLength(5);
      expect(metrics.map(m => m.metricType)).toEqual([
        'user_activity',
        'login_rate',
        'content_creation',
        'engagement',
        'error_rate'
      ]);
    });

    it('should calculate correct activity rate', async () => {
      // Mock 3 active users out of 10 total users
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          const selectMock = jest.fn();
          selectMock.mockReturnValueOnce({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({ data: [{ id: '1' }, { id: '2' }, { id: '3' }] })) // 3 active
            }))
          });
          selectMock.mockReturnValueOnce({
            eq: jest.fn(() => ({ data: Array(10).fill(0).map((_, i) => ({ id: i.toString() })) })) // 10 total
          });
          return { select: selectMock };
        }
        return { insert: jest.fn() };
      });

      const metrics = await monitor.collectHealthMetrics(institutionId);
      const activityMetric = metrics.find(m => m.metricType === 'user_activity');

      expect(activityMetric?.value).toBe(0.3); // 30% activity rate
      expect(activityMetric?.status).toBe('healthy'); // Above 30% threshold
    });

    it('should mark low activity as critical', async () => {
      // Mock 1 active user out of 10 total users
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          const selectMock = jest.fn();
          selectMock.mockReturnValueOnce({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({ data: [{ id: '1' }] })) // 1 active
            }))
          });
          selectMock.mockReturnValueOnce({
            eq: jest.fn(() => ({ data: Array(10).fill(0).map((_, i) => ({ id: i.toString() })) })) // 10 total
          });
          return { select: selectMock };
        }
        return { insert: jest.fn() };
      });

      const metrics = await monitor.collectHealthMetrics(institutionId);
      const activityMetric = metrics.find(m => m.metricType === 'user_activity');

      expect(activityMetric?.value).toBe(0.1); // 10% activity rate
      expect(activityMetric?.status).toBe('critical'); // Below 21% (70% of 30%)
    });
  });

  describe('checkHealthAlerts', () => {
    it('should create alerts for warning and critical metrics', async () => {
      // Mock metrics with warning and critical status
      jest.spyOn(monitor, 'collectHealthMetrics').mockResolvedValue([
        {
          id: 'metric1',
          institutionId,
          metricType: 'user_activity',
          value: 0.2,
          threshold: 0.3,
          status: 'warning',
          timestamp: new Date(),
          metadata: {}
        },
        {
          id: 'metric2',
          institutionId,
          metricType: 'error_rate',
          value: 100,
          threshold: 50,
          status: 'critical',
          timestamp: new Date(),
          metadata: {}
        }
      ]);

      // Mock admin users
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: [{ id: 'admin1', email: 'admin@test.com' }] }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const alerts = await monitor.checkHealthAlerts(institutionId);

      expect(alerts).toHaveLength(2);
      expect(alerts[0].severity).toBe('medium');
      expect(alerts[1].severity).toBe('critical');
      expect(mockNotificationService.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should not create alerts for healthy metrics', async () => {
      jest.spyOn(monitor, 'collectHealthMetrics').mockResolvedValue([
        {
          id: 'metric1',
          institutionId,
          metricType: 'user_activity',
          value: 0.8,
          threshold: 0.3,
          status: 'healthy',
          timestamp: new Date(),
          metadata: {}
        }
      ]);

      const alerts = await monitor.checkHealthAlerts(institutionId);

      expect(alerts).toHaveLength(0);
      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('acknowledgeAlert', () => {
    it('should update alert acknowledgment', async () => {
      const alertId = 'test-alert-id';
      const userId = 'test-user-id';

      await monitor.acknowledgeAlert(alertId, userId);

      expect(mockSupabase.from).toHaveBeenCalledWith('institution_health_alerts');
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        acknowledged_at: expect.any(String),
        acknowledged_by: userId
      });
    });
  });

  describe('resolveAlert', () => {
    it('should update alert resolution', async () => {
      const alertId = 'test-alert-id';
      const userId = 'test-user-id';

      await monitor.resolveAlert(alertId, userId);

      expect(mockSupabase.from).toHaveBeenCalledWith('institution_health_alerts');
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        resolved_at: expect.any(String),
        resolved_by: userId,
        triggered: false
      });
    });
  });

  describe('getHealthStatus', () => {
    it('should return overall health status', async () => {
      jest.spyOn(monitor, 'collectHealthMetrics').mockResolvedValue([
        {
          id: 'metric1',
          institutionId,
          metricType: 'user_activity',
          value: 0.2,
          threshold: 0.3,
          status: 'warning',
          timestamp: new Date(),
          metadata: {}
        },
        {
          id: 'metric2',
          institutionId,
          metricType: 'error_rate',
          value: 100,
          threshold: 50,
          status: 'critical',
          timestamp: new Date(),
          metadata: {}
        }
      ]);

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institution_health_alerts') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                is: jest.fn(() => ({ data: [{ id: 'alert1' }] }))
              }))
            }))
          };
        }
        return {};
      });

      const status = await monitor.getHealthStatus(institutionId);

      expect(status.overall).toBe('critical'); // Has critical metrics
      expect(status.metrics).toHaveLength(2);
      expect(status.activeAlerts).toBe(1);
    });

    it('should return healthy status when all metrics are healthy', async () => {
      jest.spyOn(monitor, 'collectHealthMetrics').mockResolvedValue([
        {
          id: 'metric1',
          institutionId,
          metricType: 'user_activity',
          value: 0.8,
          threshold: 0.3,
          status: 'healthy',
          timestamp: new Date(),
          metadata: {}
        }
      ]);

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institution_health_alerts') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                is: jest.fn(() => ({ data: [] }))
              }))
            }))
          };
        }
        return {};
      });

      const status = await monitor.getHealthStatus(institutionId);

      expect(status.overall).toBe('healthy');
      expect(status.activeAlerts).toBe(0);
    });
  });

  describe('generateAlertMessage', () => {
    it('should generate appropriate messages for different metric types', () => {
      const testCases = [
        {
          metricType: 'user_activity',
          value: 0.2,
          threshold: 0.3,
          expected: 'Low user activity detected: 20.0% activity rate (threshold: 30.0%)'
        },
        {
          metricType: 'login_rate',
          value: 5,
          threshold: 10,
          expected: 'Low login rate detected: 5 logins in 24h (threshold: 10)'
        },
        {
          metricType: 'error_rate',
          value: 75,
          threshold: 50,
          expected: 'High error rate: 75 errors in 24h (threshold: 50)'
        }
      ];

      testCases.forEach(({ metricType, value, threshold, expected }) => {
        const metric = {
          id: 'test',
          institutionId,
          metricType: metricType as any,
          value,
          threshold,
          status: 'warning' as const,
          timestamp: new Date(),
          metadata: {}
        };

        const message = (monitor as any).generateAlertMessage(metric);
        expect(message).toBe(expected);
      });
    });
  });
});