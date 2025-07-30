import { IntegrationFailureDetector } from '@/lib/services/integration-failure-detector';
import { createClient } from '@/lib/supabase/server';
import { NotificationService } from '@/lib/services/notification-service';

// Mock dependencies
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/services/notification-service');

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn(() => ({ data: [] }))
        })),
        single: jest.fn(() => ({ data: null })),
        in: jest.fn(() => ({ data: [] }))
      }))
    })),
    insert: jest.fn(() => ({ data: null })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({ data: null })),
      is: jest.fn(() => ({ data: null }))
    })),
    raw: jest.fn((sql: string) => sql)
  }))
};

const mockNotificationService = {
  sendNotification: jest.fn()
};

(createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockSupabase as any);
(NotificationService as jest.MockedClass<typeof NotificationService>).mockImplementation(() => mockNotificationService as any);

describe('IntegrationFailureDetector', () => {
  let detector: IntegrationFailureDetector;
  const institutionId = 'test-institution-id';

  beforeEach(() => {
    detector = new IntegrationFailureDetector();
    jest.clearAllMocks();
  });

  describe('detectIntegrationFailures', () => {
    it('should detect failures for degraded integrations', async () => {
      const mockIntegration = {
        id: 'integration-1',
        institution_id: institutionId,
        type: 'sso',
        provider: 'SAML',
        enabled: true,
        sync_errors: ['Authentication failed']
      };

      // Mock integrations query
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institution_integrations') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: [mockIntegration] }))
            }))
          };
        }
        if (table === 'integration_sync_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    data: [
                      { status: 'failed', response_time: 5000, created_at: new Date().toISOString() },
                      { status: 'failed', response_time: 6000, created_at: new Date().toISOString() },
                      { status: 'failed', response_time: 7000, created_at: new Date().toISOString() },
                      { status: 'success', response_time: 1000, created_at: new Date().toISOString() }
                    ]
                  }))
                }))
              }))
            }))
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
        return { insert: jest.fn() };
      });

      const failures = await detector.detectIntegrationFailures(institutionId);

      expect(failures).toHaveLength(1);
      expect(failures[0].integrationType).toBe('sso');
      expect(failures[0].failureType).toBe('authentication_failed');
      expect(failures[0].severity).toBe('medium');
    });

    it('should not detect failures for healthy integrations', async () => {
      const mockIntegration = {
        id: 'integration-1',
        institution_id: institutionId,
        type: 'sso',
        provider: 'SAML',
        enabled: true,
        sync_errors: []
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institution_integrations') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: [mockIntegration] }))
            }))
          };
        }
        if (table === 'integration_sync_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    data: Array(10).fill(0).map(() => ({
                      status: 'success',
                      response_time: 1000,
                      created_at: new Date().toISOString()
                    }))
                  }))
                }))
              }))
            }))
          };
        }
        return { insert: jest.fn() };
      });

      const failures = await detector.detectIntegrationFailures(institutionId);

      expect(failures).toHaveLength(0);
    });
  });

  describe('checkIntegrationHealth', () => {
    it('should calculate correct health metrics', async () => {
      const mockIntegration = {
        id: 'integration-1',
        institution_id: institutionId,
        type: 'sso',
        provider: 'SAML'
      };

      const mockSyncLogs = [
        { status: 'success', response_time: 1000, created_at: new Date().toISOString() },
        { status: 'success', response_time: 1200, created_at: new Date().toISOString() },
        { status: 'failed', response_time: 5000, created_at: new Date().toISOString() },
        { status: 'success', response_time: 900, created_at: new Date().toISOString() }
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'integration_sync_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(() => ({ data: mockSyncLogs }))
                }))
              }))
            }))
          };
        }
        return {};
      });

      const health = await (detector as any).checkIntegrationHealth(mockIntegration);

      expect(health.integrationId).toBe('integration-1');
      expect(health.status).toBe('healthy'); // 75% uptime
      expect(health.uptime).toBe(75); // 3 success out of 4
      expect(health.consecutiveFailures).toBe(0); // Last one was success
      expect(health.responseTime).toBeCloseTo(2025); // Average response time
    });

    it('should mark integration as failed with consecutive failures', async () => {
      const mockIntegration = {
        id: 'integration-1',
        institution_id: institutionId,
        type: 'sso',
        provider: 'SAML'
      };

      const mockSyncLogs = Array(6).fill(0).map(() => ({
        status: 'failed',
        response_time: 5000,
        created_at: new Date().toISOString()
      }));

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'integration_sync_logs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(() => ({ data: mockSyncLogs }))
                }))
              }))
            }))
          };
        }
        return {};
      });

      const health = await (detector as any).checkIntegrationHealth(mockIntegration);

      expect(health.status).toBe('failed');
      expect(health.consecutiveFailures).toBe(6);
      expect(health.uptime).toBe(0);
    });
  });

  describe('retryIntegration', () => {
    it('should increment retry count and trigger sync', async () => {
      const integrationId = 'integration-1';
      
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institution_integrations') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => ({
                  data: {
                    id: integrationId,
                    type: 'sso',
                    provider: 'SAML'
                  }
                }))
              }))
            }))
          };
        }
        return {
          update: jest.fn(() => ({
            eq: jest.fn(() => ({ data: null }))
          })),
          insert: jest.fn(() => ({ data: null }))
        };
      });

      const result = await detector.retryIntegration(integrationId);

      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('integration_failures');
      expect(mockSupabase.from).toHaveBeenCalledWith('integration_sync_logs');
    });

    it('should return false if integration not found', async () => {
      const integrationId = 'non-existent';
      
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institution_integrations') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => ({ data: null }))
              }))
            }))
          };
        }
        return {
          update: jest.fn(() => ({
            eq: jest.fn(() => ({ data: null }))
          }))
        };
      });

      const result = await detector.retryIntegration(integrationId);

      expect(result).toBe(false);
    });
  });

  describe('getIntegrationHealthSummary', () => {
    it('should return correct health summary', async () => {
      const mockIntegrations = [
        { id: '1', type: 'sso', provider: 'SAML' },
        { id: '2', type: 'sis', provider: 'PowerSchool' },
        { id: '3', type: 'lms', provider: 'Canvas' }
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'institution_integrations') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: mockIntegrations }))
            }))
          };
        }
        if (table === 'integration_sync_logs') {
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
        }
        if (table === 'integration_failures') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: [{ id: 'failure1' }] }))
            }))
          };
        }
        return {};
      });

      // Mock checkIntegrationHealth to return healthy status
      jest.spyOn(detector as any, 'checkIntegrationHealth').mockResolvedValue({
        status: 'healthy',
        consecutiveFailures: 0,
        uptime: 100,
        responseTime: 1000
      });

      const summary = await detector.getIntegrationHealthSummary(institutionId);

      expect(summary.totalIntegrations).toBe(3);
      expect(summary.healthyIntegrations).toBe(3);
      expect(summary.degradedIntegrations).toBe(0);
      expect(summary.failedIntegrations).toBe(0);
      expect(summary.activeFailures).toBe(1);
    });
  });

  describe('failure type detection', () => {
    it('should detect connection timeout failures', () => {
      const integration = { sync_errors: [] };
      const health = { responseTime: 35000, consecutiveFailures: 2, uptime: 60 };

      const failureType = (detector as any).determineFailureType(integration, health);

      expect(failureType).toBe('connection_timeout');
    });

    it('should detect authentication failures', () => {
      const integration = { sync_errors: ['Authentication failed', 'Invalid credentials'] };
      const health = { responseTime: 1000, consecutiveFailures: 2, uptime: 60 };

      const failureType = (detector as any).determineFailureType(integration, health);

      expect(failureType).toBe('authentication_failed');
    });

    it('should detect rate limit failures', () => {
      const integration = { sync_errors: ['Rate limit exceeded'] };
      const health = { responseTime: 1000, consecutiveFailures: 2, uptime: 60 };

      const failureType = (detector as any).determineFailureType(integration, health);

      expect(failureType).toBe('rate_limit');
    });

    it('should detect server errors for high consecutive failures', () => {
      const integration = { sync_errors: [] };
      const health = { responseTime: 1000, consecutiveFailures: 6, uptime: 20 };

      const failureType = (detector as any).determineFailureType(integration, health);

      expect(failureType).toBe('server_error');
    });
  });

  describe('severity determination', () => {
    it('should assign critical severity for failed status with high consecutive failures', () => {
      const health = { status: 'failed', consecutiveFailures: 6, uptime: 20 };

      const severity = (detector as any).determineSeverity(health);

      expect(severity).toBe('critical');
    });

    it('should assign high severity for very low uptime', () => {
      const health = { status: 'degraded', consecutiveFailures: 3, uptime: 40 };

      const severity = (detector as any).determineSeverity(health);

      expect(severity).toBe('high');
    });

    it('should assign medium severity for moderate issues', () => {
      const health = { status: 'degraded', consecutiveFailures: 3, uptime: 70 };

      const severity = (detector as any).determineSeverity(health);

      expect(severity).toBe('medium');
    });

    it('should assign low severity for minor issues', () => {
      const health = { status: 'degraded', consecutiveFailures: 1, uptime: 90 };

      const severity = (detector as any).determineSeverity(health);

      expect(severity).toBe('low');
    });
  });
});