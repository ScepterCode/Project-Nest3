import { InstitutionHealthMonitor } from '@/lib/services/institution-health-monitor';
import { IntegrationFailureDetector } from '@/lib/services/integration-failure-detector';
import { UsageQuotaMonitor } from '@/lib/services/usage-quota-monitor';
import { PerformanceMonitor } from '@/lib/services/performance-monitor';

// Simple mock setup
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({ data: [] }),
          single: () => ({ data: null }),
          is: () => ({ data: [] }),
          order: () => ({
            limit: () => ({ data: [] })
          }),
          in: () => ({ data: [] }),
          not: () => ({ data: [] }),
          lte: () => ({ data: [] })
        })
      }),
      insert: () => ({ data: null }),
      update: () => ({
        eq: () => ({ data: null })
      })
    })
  })
}));

jest.mock('@/lib/services/notification-service', () => ({
  NotificationService: class {
    sendNotification = jest.fn();
  }
}));

describe('Monitoring System', () => {
  const institutionId = 'test-institution-id';

  describe('InstitutionHealthMonitor', () => {
    it('should create instance and collect metrics', async () => {
      const monitor = new InstitutionHealthMonitor();
      expect(monitor).toBeDefined();
      
      // This should not throw an error
      const metrics = await monitor.collectHealthMetrics(institutionId);
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should get health status', async () => {
      const monitor = new InstitutionHealthMonitor();
      const status = await monitor.getHealthStatus(institutionId);
      
      expect(status).toHaveProperty('overall');
      expect(status).toHaveProperty('metrics');
      expect(status).toHaveProperty('activeAlerts');
    });
  });

  describe('IntegrationFailureDetector', () => {
    it('should create instance and detect failures', async () => {
      const detector = new IntegrationFailureDetector();
      expect(detector).toBeDefined();
      
      const failures = await detector.detectIntegrationFailures(institutionId);
      expect(Array.isArray(failures)).toBe(true);
    });

    it('should get integration health summary', async () => {
      const detector = new IntegrationFailureDetector();
      const summary = await detector.getIntegrationHealthSummary(institutionId);
      
      expect(summary).toHaveProperty('totalIntegrations');
      expect(summary).toHaveProperty('healthyIntegrations');
      expect(summary).toHaveProperty('degradedIntegrations');
      expect(summary).toHaveProperty('failedIntegrations');
      expect(summary).toHaveProperty('activeFailures');
    });
  });

  describe('UsageQuotaMonitor', () => {
    it('should create instance and monitor quotas', async () => {
      const monitor = new UsageQuotaMonitor();
      expect(monitor).toBeDefined();
      
      const quotas = await monitor.monitorAllQuotas(institutionId);
      expect(Array.isArray(quotas)).toBe(true);
    });

    it('should get usage summary', async () => {
      const monitor = new UsageQuotaMonitor();
      const summary = await monitor.getUsageSummary(institutionId);
      
      expect(summary).toHaveProperty('quotas');
      expect(summary).toHaveProperty('totalAlerts');
      expect(summary).toHaveProperty('criticalAlerts');
      expect(summary).toHaveProperty('recommendations');
    });
  });

  describe('PerformanceMonitor', () => {
    it('should create instance and collect metrics', async () => {
      const monitor = new PerformanceMonitor();
      expect(monitor).toBeDefined();
      
      const metrics = await monitor.collectPerformanceMetrics(institutionId);
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should get performance summary', async () => {
      const monitor = new PerformanceMonitor();
      const summary = await monitor.getPerformanceSummary(institutionId);
      
      expect(summary).toHaveProperty('currentMetrics');
      expect(summary).toHaveProperty('activeAnomalies');
      expect(summary).toHaveProperty('performanceScore');
      expect(summary).toHaveProperty('trends');
    });
  });

  describe('Integration Test', () => {
    it('should run all monitoring systems together', async () => {
      const healthMonitor = new InstitutionHealthMonitor();
      const failureDetector = new IntegrationFailureDetector();
      const quotaMonitor = new UsageQuotaMonitor();
      const performanceMonitor = new PerformanceMonitor();

      // Run all monitoring systems in parallel
      const results = await Promise.all([
        healthMonitor.collectHealthMetrics(institutionId),
        failureDetector.detectIntegrationFailures(institutionId),
        quotaMonitor.monitorAllQuotas(institutionId),
        performanceMonitor.collectPerformanceMetrics(institutionId)
      ]);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should provide comprehensive monitoring dashboard data', async () => {
      const healthMonitor = new InstitutionHealthMonitor();
      const failureDetector = new IntegrationFailureDetector();
      const quotaMonitor = new UsageQuotaMonitor();
      const performanceMonitor = new PerformanceMonitor();

      const [healthStatus, integrationSummary, usageSummary, performanceSummary] = await Promise.all([
        healthMonitor.getHealthStatus(institutionId),
        failureDetector.getIntegrationHealthSummary(institutionId),
        quotaMonitor.getUsageSummary(institutionId),
        performanceMonitor.getPerformanceSummary(institutionId)
      ]);

      // Verify all summaries have expected structure
      expect(healthStatus.overall).toBeDefined();
      expect(integrationSummary.totalIntegrations).toBeDefined();
      expect(usageSummary.quotas).toBeDefined();
      expect(performanceSummary.performanceScore).toBeDefined();
    });
  });
});