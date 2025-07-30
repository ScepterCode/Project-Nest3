import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn()
    })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      })),
      order: jest.fn()
    })),
    upsert: jest.fn()
  }))
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('Integration Setup Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('SSO Integration Setup', () => {
    it('should create SAML SSO integration with valid configuration', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const ssoConfig = {
        entityId: 'https://test-idp.com/entity',
        ssoUrl: 'https://test-idp.com/sso',
        certificate: '-----BEGIN CERTIFICATE-----\ntest-cert\n-----END CERTIFICATE-----',
        attributeMapping: {
          email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
          firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
          lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
        }
      };

      const mockIntegration = {
        id: 'test-integration-id',
        institution_id: 'test-institution-id',
        type: 'sso',
        provider: 'saml',
        name: 'SAML Integration',
        config: ssoConfig,
        enabled: false,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'test-user-id'
      };

      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: mockIntegration,
        error: null
      });

      const integrationManager = new IntegrationConfigManager();
      const result = await integrationManager.createIntegration({
        institutionId: 'test-institution-id',
        type: 'sso',
        provider: 'saml',
        name: 'SAML Integration',
        config: ssoConfig,
        createdBy: 'test-user-id'
      });

      expect(result).toMatchObject({
        id: 'test-integration-id',
        institutionId: 'test-institution-id',
        type: 'sso',
        provider: 'saml',
        name: 'SAML Integration',
        enabled: false,
        status: 'pending'
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('institution_integrations');
    });

    it('should validate SAML configuration and reject invalid config', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const invalidConfig = {
        entityId: 'https://test-idp.com/entity',
        // Missing required ssoUrl and certificate
        attributeMapping: {
          email: 'email'
        }
      };

      const integrationManager = new IntegrationConfigManager();
      
      await expect(integrationManager.createIntegration({
        institutionId: 'test-institution-id',
        type: 'sso',
        provider: 'saml',
        name: 'Invalid SAML Integration',
        config: invalidConfig,
        createdBy: 'test-user-id'
      })).rejects.toThrow('SAML configuration requires entityId, ssoUrl, and certificate');
    });

    it('should test SAML connection successfully', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const mockIntegration = {
        id: 'test-integration-id',
        institution_id: 'test-institution-id',
        type: 'sso',
        provider: 'saml',
        config: {
          ssoUrl: 'https://test-idp.com/sso',
          entityId: 'test-entity',
          certificate: 'test-cert'
        },
        enabled: true,
        status: 'active'
      };

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockIntegration,
        error: null
      });

      // Mock successful fetch response
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const integrationManager = new IntegrationConfigManager();
      const result = await integrationManager.testIntegrationConnection('test-integration-id');

      expect(result.success).toBe(true);
      expect(result.message).toBe('SAML endpoint is accessible');
      expect(result.responseTime).toBeGreaterThan(0);
    });
  });

  describe('SIS Integration Setup', () => {
    it('should create SIS integration with valid configuration', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const sisConfig = {
        apiUrl: 'https://api.powerschool.com',
        apiKey: 'test-api-key',
        syncSettings: {
          syncUsers: true,
          syncCourses: true,
          syncEnrollments: false,
          syncGrades: false
        },
        fieldMapping: {
          studentId: 'student_number',
          email: 'email_addr',
          firstName: 'first_name',
          lastName: 'last_name',
          courseId: 'course_number',
          courseName: 'course_name'
        }
      };

      const mockIntegration = {
        id: 'test-sis-integration-id',
        institution_id: 'test-institution-id',
        type: 'sis',
        provider: 'powerschool',
        name: 'PowerSchool Integration',
        config: sisConfig,
        enabled: false,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'test-user-id'
      };

      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: mockIntegration,
        error: null
      });

      const integrationManager = new IntegrationConfigManager();
      const result = await integrationManager.createIntegration({
        institutionId: 'test-institution-id',
        type: 'sis',
        provider: 'powerschool',
        name: 'PowerSchool Integration',
        config: sisConfig,
        createdBy: 'test-user-id'
      });

      expect(result.type).toBe('sis');
      expect(result.provider).toBe('powerschool');
      expect(result.config).toEqual(sisConfig);
    });

    it('should validate SIS configuration requirements', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const invalidConfig = {
        // Missing required apiUrl
        apiKey: 'test-key',
        syncSettings: {
          syncUsers: true,
          syncCourses: false,
          syncEnrollments: false,
          syncGrades: false
        },
        fieldMapping: {
          studentId: 'id',
          // Missing required email mapping
          firstName: 'first_name',
          lastName: 'last_name'
        }
      };

      const integrationManager = new IntegrationConfigManager();
      
      await expect(integrationManager.createIntegration({
        institutionId: 'test-institution-id',
        type: 'sis',
        provider: 'powerschool',
        name: 'Invalid SIS Integration',
        config: invalidConfig,
        createdBy: 'test-user-id'
      })).rejects.toThrow('SIS configuration requires apiUrl');
    });
  });

  describe('Integration Health Monitoring', () => {
    it('should perform health check and store results', async () => {
      const { IntegrationHealthMonitor } = await import('@/lib/services/integration-health-monitor');
      
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: 'test-institution-id',
          type: 'sis',
          provider: 'powerschool',
          config: {
            apiUrl: 'https://api.powerschool.com',
            apiKey: 'test-key'
          },
          enabled: true,
          status: 'active',
          health_check_url: 'https://api.powerschool.com/health'
        },
        error: null
      });

      // Mock successful health check
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      mockSupabase.from().insert.mockResolvedValue({ error: null });
      mockSupabase.from().upsert.mockResolvedValue({ error: null });

      const healthMonitor = new IntegrationHealthMonitor();
      const result = await healthMonitor.performHealthCheck(integrationId);

      expect(result.status).toBe('healthy');
      expect(result.integrationId).toBe(integrationId);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(mockSupabase.from).toHaveBeenCalledWith('integration_health_checks');
      expect(mockSupabase.from).toHaveBeenCalledWith('integration_health');
    });

    it('should handle health check failures', async () => {
      const { IntegrationHealthMonitor } = await import('@/lib/services/integration-health-monitor');
      
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: 'test-institution-id',
          type: 'sis',
          provider: 'powerschool',
          config: {
            apiUrl: 'https://api.powerschool.com',
            apiKey: 'test-key'
          },
          enabled: true,
          status: 'active'
        },
        error: null
      });

      // Mock failed health check
      global.fetch.mockRejectedValue(new Error('Connection timeout'));

      mockSupabase.from().insert.mockResolvedValue({ error: null });
      mockSupabase.from().upsert.mockResolvedValue({ error: null });

      const healthMonitor = new IntegrationHealthMonitor();
      const result = await healthMonitor.performHealthCheck(integrationId);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toBe('Connection timeout');
    });
  });

  describe('Integration Management Workflows', () => {
    it('should enable integration and update status', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().update().eq().select().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: 'test-institution-id',
          type: 'sso',
          provider: 'saml',
          enabled: true,
          status: 'active',
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const integrationManager = new IntegrationConfigManager();
      const result = await integrationManager.enableIntegration(integrationId);

      expect(result.enabled).toBe(true);
      expect(result.status).toBe('active');
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        enabled: true,
        status: 'active'
      });
    });

    it('should disable integration and update status', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().update().eq().select().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: 'test-institution-id',
          type: 'sso',
          provider: 'saml',
          enabled: false,
          status: 'inactive',
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const integrationManager = new IntegrationConfigManager();
      const result = await integrationManager.disableIntegration(integrationId);

      expect(result.enabled).toBe(false);
      expect(result.status).toBe('inactive');
    });

    it('should list integrations with filters', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const mockIntegrations = [
        {
          id: 'integration-1',
          institution_id: 'test-institution-id',
          type: 'sso',
          provider: 'saml',
          name: 'SAML Integration',
          enabled: true,
          status: 'active'
        }
      ];

      mockSupabase.from().select().eq().eq().order.mockResolvedValue({
        data: mockIntegrations,
        error: null
      });

      const integrationManager = new IntegrationConfigManager();
      const result = await integrationManager.listIntegrations('test-institution-id', {
        type: 'sso'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('sso');
      expect(result[0].provider).toBe('saml');
    });

    it('should delete integration', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().delete().eq.mockResolvedValue({
        error: null
      });

      const integrationManager = new IntegrationConfigManager();
      await expect(integrationManager.deleteIntegration(integrationId)).resolves.not.toThrow();
      
      expect(mockSupabase.from().delete().eq).toHaveBeenCalledWith('id', integrationId);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const { IntegrationConfigManager } = await import('@/lib/services/integration-config-manager');
      
      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const integrationManager = new IntegrationConfigManager();
      
      await expect(integrationManager.createIntegration({
        institutionId: 'test-institution-id',
        type: 'sso',
        provider: 'saml',
        name: 'Test Integration',
        config: {},
        createdBy: 'test-user-id'
      })).rejects.toThrow('Failed to create integration: Database connection failed');
    });

    it('should handle network timeouts during health checks', async () => {
      const { IntegrationHealthMonitor } = await import('@/lib/services/integration-health-monitor');
      
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: 'test-institution-id',
          type: 'sis',
          provider: 'powerschool',
          config: { apiUrl: 'https://api.powerschool.com' },
          enabled: true,
          status: 'active'
        },
        error: null
      });

      // Mock network timeout
      global.fetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      mockSupabase.from().insert.mockResolvedValue({ error: null });
      mockSupabase.from().upsert.mockResolvedValue({ error: null });

      const healthMonitor = new IntegrationHealthMonitor();
      const result = await healthMonitor.performHealthCheck(integrationId);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toBe('Network timeout');
    });
  });
});