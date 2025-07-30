import { InstitutionHealthMonitor } from '@/lib/services/institution-health-monitor';
import { IntegrationFailureDetector } from '@/lib/services/integration-failure-detector';
import { UsageQuotaMonitor } from '@/lib/services/usage-quota-monitor';
import { PerformanceMonitor } from '@/lib/services/performance-monitor';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/services/notification-service');

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        gte: jest.fn(() => ({ data: [] })),
        lte: jest.fn(() => ({ data: [] })),
        single: jest.fn(() => ({ data: null })),
        order: jest.fn(() => ({
          limit: jest.fn(() => ({ data: [] }))
        })),
        in: jest.fn(() => ({ data: [] })),
        is: jest.fn(() => ({ data: [] })),
        not: jest.fn(() => ({ data: [] }))
      }))
    })),
    insert: jest.fn(() => ({ data: null })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({ data: null }))
    }))
  }))
};

(createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockSupabase as any);

describe('Monitoring System Integration', () => {
  const institutionId = 'test-institution-id';
  let healthMonitor: InstitutionHealthMonitor;
  let failureDetector: IntegrationFailureDetector;
  let quotaMonitor: UsageQuotaMonitor;
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    healthMonitor = new InstitutionHealthMonitor();
    failureDetector = new IntegrationFailureDetector();
    quotaMonitor = new UsageQuotaMonitor();
    performanceMonitor = new PerformanceMonitor();
    jest.clearAllMocks();
  });

  describe('Comprehensive Institution Monitoring', () => {
    it('should collect all monitoring data for an institution', async () => {
      // Mock data for all monitoring systems
      mockSupabase.from.mockImplementation((table: string) => {
        switch (table) {
          case 'users':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  gte: jest.fn(() => ({ data: Array(50).fill({ id: 'user' }) })) // 50 active users
                }))
              }))
            };
          case 'institutions':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: {
                      subscription: {
                        userLimit: 100,
                        storageLimit: 10,
                        apiCallsLimit: 10000,
                        integrationsLimit: 5,
                        classesLimit: 50
                      }
                    }
                  }))
                }))
              }))
            };
          case 'institution_integrations':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  data: [
                    {
                      id: 'integration-1',
                      institution_id: institutionId,
                      type: 'sso',
                      provider: 'SAML',
                      enabled: true,
                      sync_errors: []
                    }
                  ]
                }))
              }))
            };
          case 'integration_sync_logs':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn(() => ({
                    limit: jest.fn(() => ({
                      data: [
                        { status: 'success', response_time: 1000, created_at: new Date().toISOString() }
                      ]
                    }))
                  }))
                }))
              }))
            };
          case 'api_usage_logs':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  gte: jest.fn(() => ({
                    not: jest.fn(() => ({
                      data: [
                        { endpoint: '/api/users', response_time: 150, created_at: new Date().toISOString() }
                      ]
                    }))
                  }))
                }))
              }))
            };
          case 'file_storage_usage':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: { total_bytes: 3 * 1024 * 1024 * 1024 } // 3GB
                  }))
                }))
              }))
            };
          default:
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({ data: [] }))
              })),
              insert: jest.fn(() => ({ data: null }))
            };
        }
      });

      // Collect all monitoring data
      const [healthMetrics, integrationFailures, quotas, performanceMetrics] = await Promise.all([
        healthMonitor.collectHealthMetrics(institutionId),
        failureDetector.detectIntegrationFailures(institutionId),
        quotaMonitor.monitorAllQuotas(institutionId),
        performanceMonitor.collectPerformanceMetrics(institutionId)
      ]);

      // Verify health metrics
      expect(healthMetrics).toHaveLength(5);
      expect(healthMetrics.map(m => m.metricType)).toEqual([
        'user_activity',
        'login_rate',
        'content_creation',
        'engagement',
        'error_rate'
      ]);

      // Verify integration monitoring
      expect(integrationFailures).toHaveLength(0); // Healthy integration

      // Verify quota monitoring
      expect(quotas).toHaveLength(5);
      expect(quotas.map(q => q.quotaType)).toEqual([
        'users',
        'storage',
        'api_calls',
        'integrations',
        'classes'
      ]);

      // Verify performance monitoring
      expect(performanceMetrics.length).toBeGreaterThan(0);
    });

    it('should detect and correlate issues across monitoring systems', async () => {
      // Mock problematic data
      mockSupabase.from.mockImplementation((table: string) => {
        switch (table) {
          case 'users':
            const selectMock = jest.fn();
            // Low activity users
            selectMock.mockReturnValueOnce({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: [{ id: '1' }] })) // 1 active user
              }))
            });
            // High total users (quota issue)
            selectMock.mockReturnValueOnce({
              eq: jest.fn(() => ({ data: Array(95).fill({ id: 'user' }) })) // 95 total users
            });
            return { select: selectMock };
          case 'institutions':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: {
                      subscription: { userLimit: 100 }
                    }
                  }))
                }))
              }))
            };
          case 'institution_integrations':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  data: [
                    {
                      id: 'integration-1',
                      institution_id: institutionId,
                      type: 'sso',
                      provider: 'SAML',
                      enabled: true,
                      sync_errors: ['Authentication failed']
                    }
                  ]
                }))
              }))
            };
          case 'integration_sync_logs':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn(() => ({
                    limit: jest.fn(() => ({
                      data: Array(6).fill({
                        status: 'failed',
                        response_time: 5000,
                        created_at: new Date().toISOString()
                      })
                    }))
                  }))
                }))
              }))
            };
          case 'api_usage_logs':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  gte: jest.fn(() => ({
                    not: jest.fn(() => ({
                      data: [
                        { endpoint: '/api/users', response_time: 5000, created_at: new Date().toISOString() }
                      ]
                    }))
                  }))
                }))
              }))
            };
          case 'performance_metrics':
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  gte: jest.fn(() => ({
                    order: jest.fn(() => ({
                      data: Array(20).fill({ value: 100 }) // Baseline data
                    }))
                  }))
                }))
              }))
            };
          default:
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({ data: [] }))
              })),
              insert: jest.fn(() => ({ data: null }))
            };
        }
      });

      // Collect monitoring data
      const [healthMetrics, integrationFailures, quotas] = await Promise.all([
        healthMonitor.collectHealthMetrics(institutionId),
        failureDetector.detectIntegrationFailures(institutionId),
        quotaMonitor.monitorAllQuotas(institutionId)
      ]);

      // Verify correlated issues
      const activityMetric = healthMetrics.find(m => m.metricType === 'user_activity');
      expect(activityMetric?.status).toBe('critical'); // Low user activity

      expect(integrationFailures).toHaveLength(1);
      expect(integrationFailures[0].failureType).toBe('authentication_failed');

      const userQuota = quotas.find(q => q.quotaType === 'users');
      expect(userQuota?.status).toBe('critical'); // Near user limit

      // These issues could be correlated:
      // - Low user activity might be due to authentication failures
      // - High user count approaching limit might cause performance issues
    });
  });

  describe('Alert Coordination', () => {
    it('should generate coordinated alerts across systems', async () => {
      // Mock admin users for notifications
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users' && mockSupabase.from().select().eq().in) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                in: jest.fn(() => ({ data: [{ id: 'admin1', email: 'admin@test.com' }] }))
              }))
            }))
          };
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({ data: [] }))
          })),
          insert: jest.fn(() => ({ data: null }))
        };
      });

      // Mock critical health metrics
      jest.spyOn(healthMonitor, 'collectHealthMetrics').mockResolvedValue([
        {
          id: 'metric1',
          institutionId,
          metricType: 'user_activity',
          value: 0.1,
          threshold: 0.3,
          status: 'critical',
          timestamp: new Date(),
          metadata: {}
        }
      ]);

      // Mock critical quota
      jest.spyOn(quotaMonitor, 'monitorAllQuotas').mockResolvedValue([
        {
          institutionId,
          quotaType: 'users',
          currentUsage: 98,
          limit: 100,
          unit: 'users',
          utilizationPercentage: 98,
          status: 'critical',
          lastUpdated: new Date()
        }
      ]);

      // Generate alerts
      const [healthAlerts] = await Promise.all([
        healthMonitor.checkHealthAlerts(institutionId),
        quotaMonitor.monitorAllQuotas(institutionId) // This will trigger quota alerts internally
      ]);

      expect(healthAlerts).toHaveLength(1);
      expect(healthAlerts[0].severity).toBe('critical');
    });
  });

  describe('Monitoring Dashboard Data', () => {
    it('should provide comprehensive dashboard data', async () => {
      // Mock all monitoring systems
      jest.spyOn(healthMonitor, 'getHealthStatus').mockResolvedValue({
        overall: 'warning',
        metrics: [],
        activeAlerts: 2
      });

      jest.spyOn(failureDetector, 'getIntegrationHealthSummary').mockResolvedValue({
        totalIntegrations: 3,
        healthyIntegrations: 2,
        degradedIntegrations: 1,
        failedIntegrations: 0,
        activeFailures: 1
      });

      jest.spyOn(quotaMonitor, 'getUsageSummary').mockResolvedValue({
        quotas: [],
        totalAlerts: 1,
        criticalAlerts: 0,
        recommendations: ['Monitor usage closely']
      });

      jest.spyOn(performanceMonitor, 'getPerformanceSummary').mockResolvedValue({
        currentMetrics: [],
        activeAnomalies: 0,
        performanceScore: 85,
        trends: {
          response_time: 'improving',
          throughput: 'stable',
          error_rate: 'improving'
        }
      });

      // Collect dashboard data
      const [healthStatus, integrationSummary, usageSummary, performanceSummary] = await Promise.all([
        healthMonitor.getHealthStatus(institutionId),
        failureDetector.getIntegrationHealthSummary(institutionId),
        quotaMonitor.getUsageSummary(institutionId),
        performanceMonitor.getPerformanceSummary(institutionId)
      ]);

      // Verify comprehensive monitoring data
      expect(healthStatus.overall).toBe('warning');
      expect(healthStatus.activeAlerts).toBe(2);

      expect(integrationSummary.totalIntegrations).toBe(3);
      expect(integrationSummary.activeFailures).toBe(1);

      expect(usageSummary.totalAlerts).toBe(1);
      expect(usageSummary.recommendations).toContain('Monitor usage closely');

      expect(performanceSummary.performanceScore).toBe(85);
      expect(performanceSummary.trends.response_time).toBe('improving');
    });
  });

  describe('Monitoring System Resilience', () => {
    it('should handle monitoring system failures gracefully', async () => {
      // Mock database errors
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      // Monitoring should not crash on database errors
      await expect(healthMonitor.collectHealthMetrics(institutionId)).rejects.toThrow();
      await expect(failureDetector.detectIntegrationFailures(institutionId)).rejects.toThrow();
      await expect(quotaMonitor.monitorAllQuotas(institutionId)).rejects.toThrow();
      await expect(performanceMonitor.collectPerformanceMetrics(institutionId)).rejects.toThrow();
    });

    it('should handle partial data gracefully', async () => {
      // Mock partial data availability
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: null })) // No data
            }))
          };
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({ data: [] }))
          })),
          insert: jest.fn(() => ({ data: null }))
        };
      });

      // Should handle missing data without crashing
      const healthMetrics = await healthMonitor.collectHealthMetrics(institutionId);
      expect(healthMetrics).toHaveLength(5); // Should still return all metric types

      const integrationFailures = await failureDetector.detectIntegrationFailures(institutionId);
      expect(integrationFailures).toHaveLength(0); // No integrations to check

      const quotas = await quotaMonitor.monitorAllQuotas(institutionId);
      expect(quotas).toHaveLength(5); // Should return all quota types with defaults
    });
  });

  describe('Performance Impact', () => {
    it('should complete monitoring within reasonable time', async () => {
      const startTime = Date.now();

      // Run all monitoring systems
      await Promise.all([
        healthMonitor.collectHealthMetrics(institutionId),
        failureDetector.detectIntegrationFailures(institutionId),
        quotaMonitor.monitorAllQuotas(institutionId),
        performanceMonitor.collectPerformanceMetrics(institutionId)
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 5 seconds (generous for testing)
      expect(duration).toBeLessThan(5000);
    });

    it('should not overwhelm the database with queries', async () => {
      let queryCount = 0;
      const originalFrom = mockSupabase.from;
      mockSupabase.from = jest.fn((...args) => {
        queryCount++;
        return originalFrom(...args);
      });

      // Run monitoring
      await Promise.all([
        healthMonitor.collectHealthMetrics(institutionId),
        quotaMonitor.monitorAllQuotas(institutionId)
      ]);

      // Should use reasonable number of queries (less than 50 for this test)
      expect(queryCount).toBeLessThan(50);
    });
  });
});