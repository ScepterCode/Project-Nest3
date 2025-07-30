import { PerformanceMonitor } from '@/lib/services/performance-monitor';
import { createClient } from '@/lib/supabase/server';
import { NotificationService } from '@/lib/services/notification-service';

// Mock dependencies
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/services/notification-service');

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        gte: jest.fn(() => ({ data: [] })),
        lte: jest.fn(() => ({ data: [] })),
        not: jest.fn(() => ({ data: [] })),
        order: jest.fn(() => ({ data: [] })),
        in: jest.fn(() => ({ data: [] }))
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

(createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockSupabase as any);
(NotificationService as jest.MockedClass<typeof NotificationService>).mockImplementation(() => mockNotificationService as any);

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  const institutionId = 'test-institution-id';

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    jest.clearAllMocks();
  });

  describe('collectPerformanceMetrics', () => {
    it('should collect all performance metrics', async () => {
      const mockApiLogs = [
        { endpoint: '/api/users', response_time: 150, created_at: new Date().toISOString() },
        { endpoint: '/api/classes', response_time: 200, created_at: new Date().toISOString() },
        { endpoint: '/api/users', response_time: 100, created_at: new Date().toISOString() }
      ];

      const mockApiLogsWithStatus = [
        { endpoint: '/api/users', status_code: 200, created_at: new Date().toISOString() },
        { endpoint: '/api/users', status_code: 500, created_at: new Date().toISOString() },
        { endpoint: '/api/classes', status_code: 200, created_at: new Date().toISOString() }
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'api_usage_logs') {
          const selectMock = jest.fn();
          // First call for response time metrics
          selectMock.mockReturnValueOnce({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({
                not: jest.fn(() => ({ data: mockApiLogs }))
              }))
            }))
          });
          // Second call for throughput metrics
          selectMock.mockReturnValueOnce({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({ data: mockApiLogs }))
            }))
          });
          // Third call for error rate metrics
          selectMock.mockReturnValueOnce({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({ data: mockApiLogsWithStatus }))
            }))
          });
          return { select: selectMock };
        }
        return { insert: jest.fn() };
      });

      const metrics = await monitor.collectPerformanceMetrics(institutionId);

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics.some(m => m.metricType === 'response_time')).toBe(true);
      expect(metrics.some(m => m.metricType === 'throughput')).toBe(true);
      expect(metrics.some(m => m.metricType === 'error_rate')).toBe(true);
      expect(metrics.some(m => m.metricType === 'database_performance')).toBe(true);
    });

    it('should calculate correct response time metrics', async () => {
      const mockApiLogs = [
        { endpoint: '/api/users', response_time: 100, created_at: new Date().toISOString() },
        { endpoint: '/api/users', response_time: 200, created_at: new Date().toISOString() },
        { endpoint: '/api/users', response_time: 150, created_at: new Date().toISOString() }
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'api_usage_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({
                  not: jest.fn(() => ({ data: mockApiLogs }))
                }))
              }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const metrics = await (monitor as any).collectResponseTimeMetrics(institutionId);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].endpoint).toBe('/api/users');
      expect(metrics[0].value).toBe(150); // Average of 100, 200, 150
      expect(metrics[0].unit).toBe('ms');
      expect(metrics[0].metadata.sampleSize).toBe(3);
      expect(metrics[0].metadata.minResponseTime).toBe(100);
      expect(metrics[0].metadata.maxResponseTime).toBe(200);
    });

    it('should calculate correct throughput metrics', async () => {
      const mockApiLogs = Array(120).fill(0).map((_, i) => ({
        endpoint: '/api/users',
        created_at: new Date().toISOString()
      }));

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'api_usage_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: mockApiLogs }))
              }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const metrics = await (monitor as any).collectThroughputMetrics(institutionId);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].endpoint).toBe('/api/users');
      expect(metrics[0].value).toBe(2); // 120 requests / 60 minutes = 2 requests/min
      expect(metrics[0].unit).toBe('requests/min');
    });

    it('should calculate correct error rate metrics', async () => {
      const mockApiLogs = [
        { endpoint: '/api/users', status_code: 200, created_at: new Date().toISOString() },
        { endpoint: '/api/users', status_code: 500, created_at: new Date().toISOString() },
        { endpoint: '/api/users', status_code: 200, created_at: new Date().toISOString() },
        { endpoint: '/api/users', status_code: 404, created_at: new Date().toISOString() }
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'api_usage_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: mockApiLogs }))
              }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const metrics = await (monitor as any).collectErrorRateMetrics(institutionId);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].endpoint).toBe('/api/users');
      expect(metrics[0].value).toBe(50); // 2 errors out of 4 requests = 50%
      expect(metrics[0].unit).toBe('percentage');
      expect(metrics[0].metadata.errorCount).toBe(2);
      expect(metrics[0].metadata.successCount).toBe(2);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect performance anomalies', async () => {
      // Mock baseline data
      jest.spyOn(monitor as any, 'getPerformanceBaseline').mockResolvedValue({
        metricType: 'response_time',
        institutionId,
        average: 100,
        median: 95,
        p95: 150,
        p99: 200,
        standardDeviation: 20,
        sampleSize: 100,
        lastUpdated: new Date()
      });

      // Mock recent metrics with anomaly
      jest.spyOn(monitor as any, 'getRecentMetrics').mockResolvedValue([
        {
          id: 'metric1',
          institutionId,
          metricType: 'response_time',
          value: 200, // 5 standard deviations above average (100 + 5*20)
          unit: 'ms',
          timestamp: new Date(),
          endpoint: '/api/users'
        }
      ]);

      // Mock admin users
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                in: jest.fn(() => ({ data: [{ id: 'admin1', email: 'admin@test.com' }] }))
              }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const anomalies = await monitor.detectAnomalies(institutionId);

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].metricType).toBe('response_time');
      expect(anomalies[0].anomalyType).toBe('spike');
      expect(anomalies[0].severity).toBe('critical'); // 5 standard deviations
      expect(anomalies[0].currentValue).toBe(200);
      expect(anomalies[0].expectedValue).toBe(100);
    });

    it('should not detect anomalies within normal range', async () => {
      jest.spyOn(monitor as any, 'getPerformanceBaseline').mockResolvedValue({
        metricType: 'response_time',
        institutionId,
        average: 100,
        standardDeviation: 20,
        sampleSize: 100,
        lastUpdated: new Date()
      });

      jest.spyOn(monitor as any, 'getRecentMetrics').mockResolvedValue([
        {
          id: 'metric1',
          institutionId,
          metricType: 'response_time',
          value: 110, // Within 1 standard deviation
          unit: 'ms',
          timestamp: new Date(),
          endpoint: '/api/users'
        }
      ]);

      const anomalies = await monitor.detectAnomalies(institutionId);

      expect(anomalies).toHaveLength(0);
    });
  });

  describe('getPerformanceBaseline', () => {
    it('should calculate correct baseline metrics', async () => {
      const mockHistoricalData = [
        { value: 80 },
        { value: 90 },
        { value: 100 },
        { value: 110 },
        { value: 120 }
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'performance_metrics') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({
                  order: jest.fn(() => ({ data: mockHistoricalData }))
                }))
              }))
            }))
          };
        }
        return {};
      });

      const baseline = await (monitor as any).getPerformanceBaseline(institutionId, 'response_time');

      expect(baseline).toBeDefined();
      expect(baseline.average).toBe(100); // (80+90+100+110+120)/5
      expect(baseline.median).toBe(100); // Middle value when sorted
      expect(baseline.sampleSize).toBe(5);
      expect(baseline.standardDeviation).toBeCloseTo(14.14, 1); // Standard deviation of the values
    });

    it('should return null for insufficient data', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'performance_metrics') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({
                  order: jest.fn(() => ({ data: [{ value: 100 }] })) // Only 1 sample
                }))
              }))
            }))
          };
        }
        return {};
      });

      const baseline = await (monitor as any).getPerformanceBaseline(institutionId, 'response_time');

      expect(baseline).toBeNull();
    });
  });

  describe('detectMetricAnomaly', () => {
    const baseline = {
      metricType: 'response_time',
      institutionId,
      average: 100,
      median: 95,
      p95: 150,
      p99: 200,
      standardDeviation: 20,
      sampleSize: 100,
      lastUpdated: new Date()
    };

    it('should detect spike anomaly', () => {
      const metric = {
        id: 'metric1',
        institutionId,
        metricType: 'response_time' as const,
        value: 200, // 5 standard deviations above
        unit: 'ms',
        timestamp: new Date(),
        endpoint: '/api/users'
      };

      const anomaly = (monitor as any).detectMetricAnomaly(metric, baseline);

      expect(anomaly).toBeDefined();
      expect(anomaly.anomalyType).toBe('spike');
      expect(anomaly.severity).toBe('critical');
      expect(anomaly.deviation).toBe(5);
    });

    it('should detect drop anomaly', () => {
      const metric = {
        id: 'metric1',
        institutionId,
        metricType: 'throughput' as const,
        value: 20, // 4 standard deviations below
        unit: 'requests/min',
        timestamp: new Date(),
        endpoint: '/api/users'
      };

      const anomaly = (monitor as any).detectMetricAnomaly(metric, baseline);

      expect(anomaly).toBeDefined();
      expect(anomaly.anomalyType).toBe('drop');
      expect(anomaly.severity).toBe('high');
    });

    it('should not detect anomaly within threshold', () => {
      const metric = {
        id: 'metric1',
        institutionId,
        metricType: 'response_time' as const,
        value: 110, // 0.5 standard deviations above
        unit: 'ms',
        timestamp: new Date(),
        endpoint: '/api/users'
      };

      const anomaly = (monitor as any).detectMetricAnomaly(metric, baseline);

      expect(anomaly).toBeNull();
    });
  });

  describe('calculatePerformanceScore', () => {
    it('should calculate performance score correctly', async () => {
      // Mock baselines and recent metrics
      jest.spyOn(monitor as any, 'getPerformanceBaseline')
        .mockResolvedValueOnce({
          average: 100,
          standardDeviation: 20
        })
        .mockResolvedValueOnce({
          average: 50,
          standardDeviation: 10
        })
        .mockResolvedValueOnce({
          average: 2,
          standardDeviation: 1
        });

      jest.spyOn(monitor as any, 'getRecentMetrics')
        .mockResolvedValueOnce([{ value: 90 }]) // response_time: better than average
        .mockResolvedValueOnce([{ value: 60 }]) // throughput: worse than average
        .mockResolvedValueOnce([{ value: 1 }]); // error_rate: better than average

      const score = await (monitor as any).calculatePerformanceScore(institutionId);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return default score when no data available', async () => {
      jest.spyOn(monitor as any, 'getPerformanceBaseline').mockResolvedValue(null);
      jest.spyOn(monitor as any, 'getRecentMetrics').mockResolvedValue([]);

      const score = await (monitor as any).calculatePerformanceScore(institutionId);

      expect(score).toBe(50); // Default score
    });
  });

  describe('calculatePerformanceTrends', () => {
    it('should calculate improving trend', async () => {
      // Mock recent metrics better than older metrics
      jest.spyOn(monitor as any, 'getRecentMetrics').mockResolvedValue([
        { value: 80 }, { value: 90 } // Average: 85
      ]);
      jest.spyOn(monitor as any, 'getMetricsInRange').mockResolvedValue([
        { value: 100 }, { value: 110 } // Average: 105
      ]);

      const trends = await (monitor as any).calculatePerformanceTrends(institutionId);

      expect(trends.response_time).toBe('improving'); // Lower is better for response time
    });

    it('should calculate degrading trend', async () => {
      jest.spyOn(monitor as any, 'getRecentMetrics').mockResolvedValue([
        { value: 120 }, { value: 130 } // Average: 125
      ]);
      jest.spyOn(monitor as any, 'getMetricsInRange').mockResolvedValue([
        { value: 80 }, { value: 90 } // Average: 85
      ]);

      const trends = await (monitor as any).calculatePerformanceTrends(institutionId);

      expect(trends.response_time).toBe('degrading'); // Higher is worse for response time
    });

    it('should calculate stable trend', async () => {
      jest.spyOn(monitor as any, 'getRecentMetrics').mockResolvedValue([
        { value: 100 }, { value: 102 } // Average: 101
      ]);
      jest.spyOn(monitor as any, 'getMetricsInRange').mockResolvedValue([
        { value: 98 }, { value: 100 } // Average: 99
      ]);

      const trends = await (monitor as any).calculatePerformanceTrends(institutionId);

      expect(trends.response_time).toBe('stable'); // Less than 5% change
    });
  });

  describe('getPerformanceSummary', () => {
    it('should return complete performance summary', async () => {
      jest.spyOn(monitor, 'collectPerformanceMetrics').mockResolvedValue([
        {
          id: 'metric1',
          institutionId,
          metricType: 'response_time',
          value: 100,
          unit: 'ms',
          timestamp: new Date()
        }
      ]);

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'performance_anomalies') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: [{ id: 'anomaly1' }] }))
            }))
          };
        }
        return {};
      });

      jest.spyOn(monitor as any, 'calculatePerformanceScore').mockResolvedValue(85);
      jest.spyOn(monitor as any, 'calculatePerformanceTrends').mockResolvedValue({
        response_time: 'improving',
        throughput: 'stable',
        error_rate: 'improving'
      });

      const summary = await monitor.getPerformanceSummary(institutionId);

      expect(summary.currentMetrics).toHaveLength(1);
      expect(summary.activeAnomalies).toBe(1);
      expect(summary.performanceScore).toBe(85);
      expect(summary.trends.response_time).toBe('improving');
    });
  });
});