import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createClient } from '@/lib/supabase/server';
import { IntegrationConfigManager } from '@/lib/services/integration-config-manager';
import { IntegrationHealthMonitor } from '@/lib/services/integration-health-monitor';
import { DataImportExportService } from '@/lib/services/data-import-export';
import { 
  IntegrationType, 
  IntegrationProvider, 
  SSOConfig, 
  SISConfig, 
  LMSConfig 
} from '@/lib/types/integration';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

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

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('Integration Management', () => {
  let integrationManager: IntegrationConfigManager;
  let healthMonitor: IntegrationHealthMonitor;
  let dataService: DataImportExportService;
  
  const mockInstitutionId = 'test-institution-id';
  const mockUserId = 'test-user-id';

  beforeEach(() => {
    integrationManager = new IntegrationConfigManager();
    healthMonitor = new IntegrationHealthMonitor();
    dataService = new DataImportExportService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Integration Setup Workflow', () => {
    describe('SSO Integration Setup', () => {
      it('should create SAML SSO integration with valid configuration', async () => {
        const ssoConfig: SSOConfig = {
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
          institution_id: mockInstitutionId,
          type: 'sso',
          provider: 'saml',
          name: 'SAML Integration',
          config: ssoConfig,
          enabled: false,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: mockUserId
        };

        mockSupabase.from().insert().select().single.mockResolvedValue({
          data: mockIntegration,
          error: null
        });

        const result = await integrationManager.createIntegration({
          institutionId: mockInstitutionId,
          type: 'sso',
          provider: 'saml',
          name: 'SAML Integration',
          config: ssoConfig,
          createdBy: mockUserId
        });

        expect(result).toMatchObject({
          id: 'test-integration-id',
          institutionId: mockInstitutionId,
          type: 'sso',
          provider: 'saml',
          name: 'SAML Integration',
          enabled: false,
          status: 'pending'
        });

        expect(mockSupabase.from).toHaveBeenCalledWith('institution_integrations');
      });

      it('should validate SAML configuration and reject invalid config', async () => {
        const invalidConfig = {
          entityId: 'https://test-idp.com/entity',
          // Missing required ssoUrl and certificate
          attributeMapping: {
            email: 'email'
          }
        };

        await expect(integrationManager.createIntegration({
          institutionId: mockInstitutionId,
          type: 'sso',
          provider: 'saml',
          name: 'Invalid SAML Integration',
          config: invalidConfig,
          createdBy: mockUserId
        })).rejects.toThrow('SAML configuration requires entityId, ssoUrl, and certificate');
      });

      it('should test SAML connection successfully', async () => {
        const mockIntegration = {
          id: 'test-integration-id',
          institutionId: mockInstitutionId,
          type: 'sso' as IntegrationType,
          provider: 'saml' as IntegrationProvider,
          config: {
            ssoUrl: 'https://test-idp.com/sso',
            entityId: 'test-entity',
            certificate: 'test-cert'
          },
          enabled: true,
          status: 'active' as const
        };

        mockSupabase.from().select().eq().single.mockResolvedValue({
          data: {
            id: mockIntegration.id,
            institution_id: mockIntegration.institutionId,
            type: mockIntegration.type,
            provider: mockIntegration.provider,
            config: mockIntegration.config,
            enabled: mockIntegration.enabled,
            status: mockIntegration.status
          },
          error: null
        });

        // Mock fetch for connection test
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK'
        });

        const result = await integrationManager.testIntegrationConnection(mockIntegration.id);

        expect(result.success).toBe(true);
        expect(result.message).toBe('SAML endpoint is accessible');
        expect(result.responseTime).toBeGreaterThan(0);
      });
    });

    describe('SIS Integration Setup', () => {
      it('should create SIS integration with valid configuration', async () => {
        const sisConfig: SISConfig = {
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
          institution_id: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          name: 'PowerSchool Integration',
          config: sisConfig,
          enabled: false,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: mockUserId
        };

        mockSupabase.from().insert().select().single.mockResolvedValue({
          data: mockIntegration,
          error: null
        });

        const result = await integrationManager.createIntegration({
          institutionId: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          name: 'PowerSchool Integration',
          config: sisConfig,
          createdBy: mockUserId
        });

        expect(result.type).toBe('sis');
        expect(result.provider).toBe('powerschool');
        expect(result.config).toEqual(sisConfig);
      });

      it('should validate SIS configuration requirements', async () => {
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

        await expect(integrationManager.createIntegration({
          institutionId: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          name: 'Invalid SIS Integration',
          config: invalidConfig,
          createdBy: mockUserId
        })).rejects.toThrow('SIS configuration requires apiUrl');
      });
    });

    describe('LMS Integration Setup', () => {
      it('should create LMS integration with valid configuration', async () => {
        const lmsConfig: LMSConfig = {
          apiUrl: 'https://canvas.instructure.com',
          accessToken: 'test-access-token',
          syncSettings: {
            syncCourses: true,
            syncAssignments: true,
            syncGrades: false,
            syncSubmissions: false
          },
          fieldMapping: {
            courseId: 'id',
            courseName: 'name',
            assignmentId: 'id',
            assignmentName: 'name',
            studentId: 'user_id'
          }
        };

        const mockIntegration = {
          id: 'test-lms-integration-id',
          institution_id: mockInstitutionId,
          type: 'lms',
          provider: 'canvas',
          name: 'Canvas Integration',
          config: lmsConfig,
          enabled: false,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: mockUserId
        };

        mockSupabase.from().insert().select().single.mockResolvedValue({
          data: mockIntegration,
          error: null
        });

        const result = await integrationManager.createIntegration({
          institutionId: mockInstitutionId,
          type: 'lms',
          provider: 'canvas',
          name: 'Canvas Integration',
          config: lmsConfig,
          createdBy: mockUserId
        });

        expect(result.type).toBe('lms');
        expect(result.provider).toBe('canvas');
        expect(result.config).toEqual(lmsConfig);
      });
    });
  });

  describe('Integration Health Monitoring', () => {
    it('should perform health check and store results', async () => {
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
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
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      mockSupabase.from().insert.mockResolvedValue({ error: null });
      mockSupabase.from().upsert.mockResolvedValue({ error: null });

      const result = await healthMonitor.performHealthCheck(integrationId);

      expect(result.status).toBe('healthy');
      expect(result.integrationId).toBe(integrationId);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(mockSupabase.from).toHaveBeenCalledWith('integration_health_checks');
      expect(mockSupabase.from).toHaveBeenCalledWith('integration_health');
    });

    it('should handle health check failures', async () => {
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
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
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection timeout'));

      mockSupabase.from().insert.mockResolvedValue({ error: null });
      mockSupabase.from().upsert.mockResolvedValue({ error: null });

      const result = await healthMonitor.performHealthCheck(integrationId);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toBe('Connection timeout');
    });

    it('should create and manage alert rules', async () => {
      const alertRule = {
        integrationId: 'test-integration-id',
        type: 'uptime' as const,
        threshold: 95,
        enabled: true,
        recipients: ['admin@test.com'],
        cooldownMinutes: 30
      };

      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: {
          id: 'test-alert-rule-id',
          integration_id: alertRule.integrationId,
          type: alertRule.type,
          threshold: alertRule.threshold,
          enabled: alertRule.enabled,
          recipients: alertRule.recipients,
          cooldown_minutes: alertRule.cooldownMinutes
        },
        error: null
      });

      const result = await healthMonitor.createAlertRule(alertRule);

      expect(result.id).toBe('test-alert-rule-id');
      expect(result.type).toBe('uptime');
      expect(result.threshold).toBe(95);
    });
  });

  describe('Data Sync Operations', () => {
    it('should perform successful SIS data sync', async () => {
      const integrationId = 'test-sis-integration-id';
      
      // Mock integration data
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          config: {
            apiUrl: 'https://api.powerschool.com',
            apiKey: 'test-key',
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
              lastName: 'last_name'
            }
          }
        },
        error: null
      });

      // Mock successful API responses
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            students: [
              {
                student_number: '12345',
                email_addr: 'student@test.com',
                first_name: 'John',
                last_name: 'Doe'
              }
            ]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            courses: [
              {
                course_number: 'MATH101',
                course_name: 'Mathematics 101'
              }
            ]
          })
        });

      // Mock database operations
      mockSupabase.from().upsert.mockResolvedValue({ error: null });
      mockSupabase.from().update().eq.mockResolvedValue({ error: null });

      const result = await dataService.syncFromSIS(integrationId);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.recordsImported).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle sync errors gracefully', async () => {
      const integrationId = 'test-sis-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          config: {
            apiUrl: 'https://api.powerschool.com',
            apiKey: 'invalid-key',
            syncSettings: {
              syncUsers: true,
              syncCourses: false,
              syncEnrollments: false,
              syncGrades: false
            }
          }
        },
        error: null
      });

      // Mock API failure
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      mockSupabase.from().update().eq.mockResolvedValue({ error: null });

      const result = await dataService.syncFromSIS(integrationId);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('401');
    });

    it('should validate and transform data during sync', async () => {
      const integrationId = 'test-sis-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          config: {
            apiUrl: 'https://api.powerschool.com',
            apiKey: 'test-key',
            syncSettings: {
              syncUsers: true,
              syncCourses: false,
              syncEnrollments: false,
              syncGrades: false
            },
            fieldMapping: {
              studentId: 'student_number',
              email: 'email_addr',
              firstName: 'first_name',
              lastName: 'last_name'
            }
          }
        },
        error: null
      });

      // Mock API response with invalid data
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          students: [
            {
              student_number: '12345',
              email_addr: 'valid@test.com',
              first_name: 'John',
              last_name: 'Doe'
            },
            {
              student_number: '67890',
              email_addr: 'invalid-email', // Invalid email
              first_name: 'Jane',
              last_name: 'Smith'
            },
            {
              student_number: '', // Missing required field
              email_addr: 'missing@test.com',
              first_name: 'Missing',
              last_name: 'ID'
            }
          ]
        })
      });

      mockSupabase.from().upsert.mockResolvedValue({ error: null });
      mockSupabase.from().update().eq.mockResolvedValue({ error: null });

      const result = await dataService.syncFromSIS(integrationId);

      expect(result.recordsProcessed).toBe(3);
      expect(result.recordsImported).toBe(1); // Only valid record
      expect(result.recordsFailed).toBe(2); // Two invalid records
      expect(result.errors.length).toBe(2);
    });
  });

  describe('Integration Management Workflows', () => {
    it('should enable integration and update status', async () => {
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().update().eq().select().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
          type: 'sso',
          provider: 'saml',
          enabled: true,
          status: 'active',
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const result = await integrationManager.enableIntegration(integrationId);

      expect(result.enabled).toBe(true);
      expect(result.status).toBe('active');
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        enabled: true,
        status: 'active'
      });
    });

    it('should disable integration and update status', async () => {
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().update().eq().select().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
          type: 'sso',
          provider: 'saml',
          enabled: false,
          status: 'inactive',
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const result = await integrationManager.disableIntegration(integrationId);

      expect(result.enabled).toBe(false);
      expect(result.status).toBe('inactive');
    });

    it('should list integrations with filters', async () => {
      const mockIntegrations = [
        {
          id: 'integration-1',
          institution_id: mockInstitutionId,
          type: 'sso',
          provider: 'saml',
          name: 'SAML Integration',
          enabled: true,
          status: 'active'
        },
        {
          id: 'integration-2',
          institution_id: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          name: 'PowerSchool Integration',
          enabled: false,
          status: 'inactive'
        }
      ];

      mockSupabase.from().select().eq().eq().order.mockResolvedValue({
        data: mockIntegrations.filter(i => i.type === 'sso'),
        error: null
      });

      const result = await integrationManager.listIntegrations(mockInstitutionId, {
        type: 'sso'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('sso');
      expect(result[0].provider).toBe('saml');
    });

    it('should delete integration', async () => {
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().delete().eq.mockResolvedValue({
        error: null
      });

      await expect(integrationManager.deleteIntegration(integrationId)).resolves.not.toThrow();
      
      expect(mockSupabase.from().delete().eq).toHaveBeenCalledWith('id', integrationId);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database connection errors', async () => {
      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      await expect(integrationManager.createIntegration({
        institutionId: mockInstitutionId,
        type: 'sso',
        provider: 'saml',
        name: 'Test Integration',
        config: {},
        createdBy: mockUserId
      })).rejects.toThrow('Failed to create integration: Database connection failed');
    });

    it('should handle network timeouts during health checks', async () => {
      const integrationId = 'test-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          config: { apiUrl: 'https://api.powerschool.com' },
          enabled: true,
          status: 'active'
        },
        error: null
      });

      // Mock network timeout
      global.fetch = jest.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      mockSupabase.from().insert.mockResolvedValue({ error: null });
      mockSupabase.from().upsert.mockResolvedValue({ error: null });

      const result = await healthMonitor.performHealthCheck(integrationId);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toBe('Network timeout');
    });

    it('should retry failed sync operations', async () => {
      const integrationId = 'test-sis-integration-id';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: integrationId,
          institution_id: mockInstitutionId,
          type: 'sis',
          provider: 'powerschool',
          config: {
            apiUrl: 'https://api.powerschool.com',
            apiKey: 'test-key',
            syncSettings: { syncUsers: true, syncCourses: false, syncEnrollments: false, syncGrades: false }
          }
        },
        error: null
      });

      // Mock initial failure, then success
      global.fetch = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ students: [] })
        });

      mockSupabase.from().upsert.mockResolvedValue({ error: null });
      mockSupabase.from().update().eq.mockResolvedValue({ error: null });

      // The service should implement retry logic
      const result = await dataService.syncFromSIS(integrationId);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});