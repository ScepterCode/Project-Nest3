// Simple verification test for monitoring system
const { InstitutionHealthMonitor } = require('../../../lib/services/institution-health-monitor');
const { IntegrationFailureDetector } = require('../../../lib/services/integration-failure-detector');
const { UsageQuotaMonitor } = require('../../../lib/services/usage-quota-monitor');
const { PerformanceMonitor } = require('../../../lib/services/performance-monitor');

// Mock Supabase
jest.mock('../../../lib/supabase/server', () => ({
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

jest.mock('../../../lib/services/notification-service', () => ({
  NotificationService: class {
    sendNotification = jest.fn();
  }
}));

describe('Monitoring System Verification', () => {
  const institutionId = 'test-institution-id';

  test('InstitutionHealthMonitor should be instantiable', () => {
    const monitor = new InstitutionHealthMonitor();
    expect(monitor).toBeDefined();
    expect(typeof monitor.collectHealthMetrics).toBe('function');
    expect(typeof monitor.getHealthStatus).toBe('function');
  });

  test('IntegrationFailureDetector should be instantiable', () => {
    const detector = new IntegrationFailureDetector();
    expect(detector).toBeDefined();
    expect(typeof detector.detectIntegrationFailures).toBe('function');
    expect(typeof detector.getIntegrationHealthSummary).toBe('function');
  });

  test('UsageQuotaMonitor should be instantiable', () => {
    const monitor = new UsageQuotaMonitor();
    expect(monitor).toBeDefined();
    expect(typeof monitor.monitorAllQuotas).toBe('function');
    expect(typeof monitor.getUsageSummary).toBe('function');
  });

  test('PerformanceMonitor should be instantiable', () => {
    const monitor = new PerformanceMonitor();
    expect(monitor).toBeDefined();
    expect(typeof monitor.collectPerformanceMetrics).toBe('function');
    expect(typeof monitor.getPerformanceSummary).toBe('function');
  });

  test('All monitoring systems should work together', async () => {
    const healthMonitor = new InstitutionHealthMonitor();
    const failureDetector = new IntegrationFailureDetector();
    const quotaMonitor = new UsageQuotaMonitor();
    const performanceMonitor = new PerformanceMonitor();

    // Test that all methods can be called without throwing errors
    const healthMetrics = await healthMonitor.collectHealthMetrics(institutionId);
    const integrationFailures = await failureDetector.detectIntegrationFailures(institutionId);
    const quotas = await quotaMonitor.monitorAllQuotas(institutionId);
    const performanceMetrics = await performanceMonitor.collectPerformanceMetrics(institutionId);

    expect(Array.isArray(healthMetrics)).toBe(true);
    expect(Array.isArray(integrationFailures)).toBe(true);
    expect(Array.isArray(quotas)).toBe(true);
    expect(Array.isArray(performanceMetrics)).toBe(true);
  });

  test('Monitoring system should provide dashboard data', async () => {
    const healthMonitor = new InstitutionHealthMonitor();
    const failureDetector = new IntegrationFailureDetector();
    const quotaMonitor = new UsageQuotaMonitor();
    const performanceMonitor = new PerformanceMonitor();

    const healthStatus = await healthMonitor.getHealthStatus(institutionId);
    const integrationSummary = await failureDetector.getIntegrationHealthSummary(institutionId);
    const usageSummary = await quotaMonitor.getUsageSummary(institutionId);
    const performanceSummary = await performanceMonitor.getPerformanceSummary(institutionId);

    // Verify structure of returned data
    expect(healthStatus).toHaveProperty('overall');
    expect(healthStatus).toHaveProperty('metrics');
    expect(healthStatus).toHaveProperty('activeAlerts');

    expect(integrationSummary).toHaveProperty('totalIntegrations');
    expect(integrationSummary).toHaveProperty('healthyIntegrations');
    expect(integrationSummary).toHaveProperty('activeFailures');

    expect(usageSummary).toHaveProperty('quotas');
    expect(usageSummary).toHaveProperty('totalAlerts');
    expect(usageSummary).toHaveProperty('recommendations');

    expect(performanceSummary).toHaveProperty('currentMetrics');
    expect(performanceSummary).toHaveProperty('performanceScore');
    expect(performanceSummary).toHaveProperty('trends');
  });

  test('Database migration should exist', () => {
    const fs = require('fs');
    const path = require('path');
    
    const migrationPath = path.join(__dirname, '../../../lib/database/migrations/016_monitoring_system.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
    
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    expect(migrationContent).toContain('institution_health_metrics');
    expect(migrationContent).toContain('integration_failures');
    expect(migrationContent).toContain('usage_quota_logs');
    expect(migrationContent).toContain('performance_metrics');
  });
});