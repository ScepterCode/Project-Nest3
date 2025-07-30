import { UsageQuotaMonitor } from '@/lib/services/usage-quota-monitor';
import { createClient } from '@/lib/supabase/server';
import { NotificationService } from '@/lib/services/notification-service';

// Mock dependencies
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/services/notification-service');

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(() => ({ data: null })),
        gte: jest.fn(() => ({ data: [] })),
        lte: jest.fn(() => ({ data: [] })),
        order: jest.fn(() => ({ data: [] }))
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

describe('UsageQuotaMonitor', () => {
  let monitor: UsageQuotaMonitor;
  const institutionId = 'test-institution-id';

  beforeEach(() => {
    monitor = new UsageQuotaMonitor();
    jest.clearAllMocks();
  });

  describe('monitorAllQuotas', () => {
    it('should monitor all quota types', async () => {
      // Mock institution subscription
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institutions') {
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
        }
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: Array(25).fill({ id: 'user' }) })) // 25 users
            }))
          };
        }
        if (table === 'file_storage_usage') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => ({
                  data: { total_bytes: 5 * 1024 * 1024 * 1024 } // 5GB
                }))
              }))
            }))
          };
        }
        if (table === 'api_usage_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({ data: Array(2000).fill({ id: 'log' }) })) // 2000 API calls
              }))
            }))
          };
        }
        if (table === 'institution_integrations') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: Array(3).fill({ id: 'integration' }) })) // 3 integrations
            }))
          };
        }
        if (table === 'classes') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: Array(20).fill({ id: 'class' }) })) // 20 classes
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const quotas = await monitor.monitorAllQuotas(institutionId);

      expect(quotas).toHaveLength(5);
      expect(quotas.map(q => q.quotaType)).toEqual([
        'users',
        'storage',
        'api_calls',
        'integrations',
        'classes'
      ]);

      // Check user quota
      const userQuota = quotas.find(q => q.quotaType === 'users');
      expect(userQuota?.currentUsage).toBe(25);
      expect(userQuota?.limit).toBe(100);
      expect(userQuota?.utilizationPercentage).toBe(25);
      expect(userQuota?.status).toBe('normal');

      // Check storage quota
      const storageQuota = quotas.find(q => q.quotaType === 'storage');
      expect(storageQuota?.currentUsage).toBe(5);
      expect(storageQuota?.limit).toBe(10);
      expect(storageQuota?.utilizationPercentage).toBe(50);
      expect(storageQuota?.status).toBe('normal');
    });

    it('should mark quotas as warning when approaching limits', async () => {
      // Mock 85 users out of 100 limit (85% utilization)
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institutions') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => ({
                  data: { subscription: { userLimit: 100 } }
                }))
              }))
            }))
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: Array(85).fill({ id: 'user' }) }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const quotas = await monitor.monitorAllQuotas(institutionId);
      const userQuota = quotas.find(q => q.quotaType === 'users');

      expect(userQuota?.utilizationPercentage).toBe(85);
      expect(userQuota?.status).toBe('warning'); // Above 80% threshold
    });

    it('should mark quotas as critical when near limits', async () => {
      // Mock 96 users out of 100 limit (96% utilization)
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institutions') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => ({
                  data: { subscription: { userLimit: 100 } }
                }))
              }))
            }))
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: Array(96).fill({ id: 'user' }) }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const quotas = await monitor.monitorAllQuotas(institutionId);
      const userQuota = quotas.find(q => q.quotaType === 'users');

      expect(userQuota?.utilizationPercentage).toBe(96);
      expect(userQuota?.status).toBe('critical'); // Above 95% threshold
    });

    it('should mark quotas as exceeded when over limits', async () => {
      // Mock 105 users out of 100 limit (105% utilization)
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institutions') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => ({
                  data: { subscription: { userLimit: 100 } }
                }))
              }))
            }))
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: Array(105).fill({ id: 'user' }) }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const quotas = await monitor.monitorAllQuotas(institutionId);
      const userQuota = quotas.find(q => q.quotaType === 'users');

      expect(userQuota?.utilizationPercentage).toBe(105);
      expect(userQuota?.status).toBe('exceeded');
    });
  });

  describe('checkQuotaAlerts', () => {
    it('should create alerts for warning, critical, and exceeded quotas', async () => {
      const quotas = [
        {
          institutionId,
          quotaType: 'users' as const,
          currentUsage: 85,
          limit: 100,
          unit: 'users',
          utilizationPercentage: 85,
          status: 'warning' as const,
          lastUpdated: new Date()
        },
        {
          institutionId,
          quotaType: 'storage' as const,
          currentUsage: 9.6,
          limit: 10,
          unit: 'GB',
          utilizationPercentage: 96,
          status: 'critical' as const,
          lastUpdated: new Date()
        },
        {
          institutionId,
          quotaType: 'api_calls' as const,
          currentUsage: 11000,
          limit: 10000,
          unit: 'calls/month',
          utilizationPercentage: 110,
          status: 'exceeded' as const,
          lastUpdated: new Date()
        }
      ];

      // Mock no existing alerts
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'usage_quota_alerts') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({
                  single: jest.fn(() => ({ data: null }))
                }))
              }))
            })),
            insert: jest.fn(() => ({ data: null }))
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                in: jest.fn(() => ({ data: [{ id: 'admin1', email: 'admin@test.com' }] }))
              }))
            }))
          };
        }
        return {};
      });

      await (monitor as any).checkQuotaAlerts(quotas);

      expect(mockSupabase.from).toHaveBeenCalledWith('usage_quota_alerts');
      expect(mockNotificationService.sendNotification).toHaveBeenCalledTimes(3);
    });

    it('should not create duplicate alerts within 24 hours', async () => {
      const quotas = [
        {
          institutionId,
          quotaType: 'users' as const,
          currentUsage: 85,
          limit: 100,
          unit: 'users',
          utilizationPercentage: 85,
          status: 'warning' as const,
          lastUpdated: new Date()
        }
      ];

      // Mock existing alert
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'usage_quota_alerts') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({
                  single: jest.fn(() => ({ data: { id: 'existing-alert' } }))
                }))
              }))
            })),
            insert: jest.fn(() => ({ data: null }))
          };
        }
        return {};
      });

      await (monitor as any).checkQuotaAlerts(quotas);

      expect(mockSupabase.from().insert).not.toHaveBeenCalled();
      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('acknowledgeQuotaAlert', () => {
    it('should update alert acknowledgment', async () => {
      const alertId = 'test-alert-id';
      const userId = 'test-user-id';

      await monitor.acknowledgeQuotaAlert(alertId, userId);

      expect(mockSupabase.from).toHaveBeenCalledWith('usage_quota_alerts');
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        acknowledged: true,
        acknowledged_at: expect.any(String),
        acknowledged_by: userId
      });
    });
  });

  describe('getUsageSummary', () => {
    it('should return usage summary with recommendations', async () => {
      // Mock quota monitoring
      jest.spyOn(monitor, 'monitorAllQuotas').mockResolvedValue([
        {
          institutionId,
          quotaType: 'users',
          currentUsage: 85,
          limit: 100,
          unit: 'users',
          utilizationPercentage: 85,
          status: 'warning',
          lastUpdated: new Date()
        },
        {
          institutionId,
          quotaType: 'storage',
          currentUsage: 9.6,
          limit: 10,
          unit: 'GB',
          utilizationPercentage: 96,
          status: 'critical',
          lastUpdated: new Date()
        }
      ]);

      // Mock alerts
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'usage_quota_alerts') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                data: [
                  { severity: 'medium' },
                  { severity: 'critical' }
                ]
              }))
            }))
          };
        }
        return {};
      });

      const summary = await monitor.getUsageSummary(institutionId);

      expect(summary.quotas).toHaveLength(2);
      expect(summary.totalAlerts).toBe(2);
      expect(summary.criticalAlerts).toBe(1);
      expect(summary.recommendations).toContain('Consider upgrading your storage limit before reaching the maximum');
      expect(summary.recommendations).toContain('Monitor users usage closely and plan for potential upgrade');
    });
  });

  describe('predictUsageTrend', () => {
    it('should predict increasing usage trend', async () => {
      const historicalData = [
        { current_usage: 10, recorded_at: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString() },
        { current_usage: 15, recorded_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() },
        { current_usage: 20, recorded_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
        { current_usage: 25, recorded_at: new Date().toISOString() }
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'usage_quota_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({
                  order: jest.fn(() => ({ data: historicalData }))
                }))
              }))
            }))
          };
        }
        return {};
      });

      // Mock current quota
      jest.spyOn(monitor, 'monitorAllQuotas').mockResolvedValue([
        {
          institutionId,
          quotaType: 'users',
          currentUsage: 25,
          limit: 100,
          unit: 'users',
          utilizationPercentage: 25,
          status: 'normal',
          lastUpdated: new Date()
        }
      ]);

      const trend = await monitor.predictUsageTrend(institutionId, 'users', 30);

      expect(trend.currentUsage).toBe(25);
      expect(trend.trendDirection).toBe('increasing');
      expect(trend.predictedUsage).toBeGreaterThan(25);
      expect(trend.daysToLimit).toBeDefined();
    });

    it('should predict stable usage trend', async () => {
      const historicalData = [
        { current_usage: 20, recorded_at: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString() },
        { current_usage: 20, recorded_at: new Date().toISOString() }
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'usage_quota_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({
                  order: jest.fn(() => ({ data: historicalData }))
                }))
              }))
            }))
          };
        }
        return {};
      });

      const trend = await monitor.predictUsageTrend(institutionId, 'users', 30);

      expect(trend.currentUsage).toBe(20);
      expect(trend.trendDirection).toBe('stable');
      expect(trend.daysToLimit).toBeUndefined();
    });

    it('should handle insufficient data', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'usage_quota_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => ({
                  order: jest.fn(() => ({ data: [] }))
                }))
              }))
            }))
          };
        }
        return {};
      });

      const trend = await monitor.predictUsageTrend(institutionId, 'users', 30);

      expect(trend.currentUsage).toBe(0);
      expect(trend.predictedUsage).toBe(0);
      expect(trend.trendDirection).toBe('stable');
    });
  });

  describe('generateRecommendations', () => {
    it('should generate appropriate recommendations', () => {
      const quotas = [
        {
          institutionId,
          quotaType: 'users' as const,
          currentUsage: 105,
          limit: 100,
          unit: 'users',
          utilizationPercentage: 105,
          status: 'exceeded' as const,
          lastUpdated: new Date()
        },
        {
          institutionId,
          quotaType: 'storage' as const,
          currentUsage: 9.6,
          limit: 10,
          unit: 'GB',
          utilizationPercentage: 96,
          status: 'critical' as const,
          lastUpdated: new Date()
        },
        {
          institutionId,
          quotaType: 'api_calls' as const,
          currentUsage: 8500,
          limit: 10000,
          unit: 'calls/month',
          utilizationPercentage: 85,
          status: 'warning' as const,
          lastUpdated: new Date()
        }
      ];

      const recommendations = (monitor as any).generateRecommendations(quotas);

      expect(recommendations).toContain('Upgrade your users limit immediately to avoid service disruption');
      expect(recommendations).toContain('Consider upgrading your storage limit before reaching the maximum');
      expect(recommendations).toContain('Monitor api_calls usage closely and plan for potential upgrade');
    });
  });
});