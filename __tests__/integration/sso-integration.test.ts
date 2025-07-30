import { SSOProvider } from '@/lib/services/sso-provider';
import { IntegrationConfigManager } from '@/lib/services/integration-config-manager';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server');
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        limit: jest.fn(() => ({
          order: jest.fn(() => ({
            single: jest.fn(),
          })),
        })),
      })),
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
    })),
    upsert: jest.fn(),
    delete: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('SSO Integration Tests', () => {
  let ssoProvider: SSOProvider;
  let configManager: IntegrationConfigManager;

  beforeEach(() => {
    ssoProvider = new SSOProvider();
    configManager = new IntegrationConfigManager();
    jest.clearAllMocks();
  });

  describe('SAML Authentication Flow', () => {
    const mockSAMLIntegration = {
      id: 'integration-1',
      institutionId: 'inst-1',
      type: 'sso' as const,
      provider: 'saml' as const,
      name: 'Test SAML',
      config: {
        entityId: 'test-entity',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'mock-certificate',
        attributeMapping: {
          email: 'email',
          firstName: 'firstName',
          lastName: 'lastName',
        },
      },
      enabled: true,
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'admin-1',
    };

    it('should initiate SAML authentication successfully', async () => {
      // Mock integration retrieval
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: mockSAMLIntegration.id,
          institution_id: mockSAMLIntegration.institutionId,
          type: mockSAMLIntegration.type,
          provider: mockSAMLIntegration.provider,
          config: mockSAMLIntegration.config,
          enabled: true,
          status: 'active',
          created_at: mockSAMLIntegration.createdAt.toISOString(),
          updated_at: mockSAMLIntegration.updatedAt.toISOString(),
          created_by: mockSAMLIntegration.createdBy,
        },
        error: null,
      });

      // Mock auth request storage
      mockSupabase.from().insert().mockResolvedValueOnce({
        error: null,
      });

      const result = await ssoProvider.initiateSAMLAuth(
        mockSAMLIntegration.id,
        'https://app.example.com/dashboard'
      );

      expect(result).toHaveProperty('redirectUrl');
      expect(result).toHaveProperty('requestId');
      expect(result.redirectUrl).toContain(mockSAMLIntegration.config.ssoUrl);
      expect(result.redirectUrl).toContain('SAMLRequest=');
      expect(result.redirectUrl).toContain('RelayState=');
    });

    it('should handle SAML response and create user', async () => {
      const mockAuthRequest = {
        integrationId: mockSAMLIntegration.id,
        returnUrl: 'https://app.example.com/dashboard',
        timestamp: new Date(),
      };

      // Mock auth request retrieval
      mockSupabase.from().select().eq().gt().single.mockResolvedValueOnce({
        data: { data: mockAuthRequest },
        error: null,
      });

      // Mock integration retrieval
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: mockSAMLIntegration.id,
          institution_id: mockSAMLIntegration.institutionId,
          type: mockSAMLIntegration.type,
          provider: mockSAMLIntegration.provider,
          config: mockSAMLIntegration.config,
          enabled: true,
        },
        error: null,
      });

      // Mock user lookup (not found)
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      // Mock user creation
      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: {
          id: 'user-1',
          email: 'test@example.com',
          first_name: 'John',
          last_name: 'Doe',
          role: 'student',
        },
        error: null,
      });

      // Mock auth request cleanup
      mockSupabase.from().delete().eq.mockResolvedValueOnce({
        error: null,
      });

      const mockSAMLResponse = Buffer.from(`
        <saml:Response>
          <saml:AttributeValue>test@example.com</saml:AttributeValue>
        </saml:Response>
      `).toString('base64');

      const result = await ssoProvider.handleSAMLResponse(
        mockSAMLResponse,
        'test-relay-state'
      );

      expect(result.success).toBe(true);
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'student',
        department: undefined,
      });
      expect(result.redirectUrl).toBe(mockAuthRequest.returnUrl);
    });

    it('should handle invalid SAML response', async () => {
      const mockAuthRequest = {
        integrationId: mockSAMLIntegration.id,
        returnUrl: 'https://app.example.com/dashboard',
        timestamp: new Date(),
      };

      // Mock auth request retrieval
      mockSupabase.from().select().eq().gt().single.mockResolvedValueOnce({
        data: { data: mockAuthRequest },
        error: null,
      });

      // Mock integration retrieval
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: mockSAMLIntegration.id,
          config: mockSAMLIntegration.config,
        },
        error: null,
      });

      const invalidSAMLResponse = Buffer.from('invalid-response').toString('base64');

      const result = await ssoProvider.handleSAMLResponse(
        invalidSAMLResponse,
        'test-relay-state'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid SAML response');
    });
  });

  describe('OAuth Authentication Flow', () => {
    const mockOAuthIntegration = {
      id: 'integration-2',
      institutionId: 'inst-1',
      type: 'sso' as const,
      provider: 'oauth2' as const,
      name: 'Test OAuth',
      config: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        authorizationUrl: 'https://oauth.example.com/authorize',
        tokenUrl: 'https://oauth.example.com/token',
        userInfoUrl: 'https://oauth.example.com/userinfo',
        redirectUri: 'https://app.example.com/auth/callback',
        scope: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: 'email',
          firstName: 'given_name',
          lastName: 'family_name',
        },
      },
      enabled: true,
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'admin-1',
    };

    it('should initiate OAuth authentication successfully', async () => {
      // Mock integration retrieval
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: mockOAuthIntegration.id,
          institution_id: mockOAuthIntegration.institutionId,
          type: mockOAuthIntegration.type,
          provider: mockOAuthIntegration.provider,
          config: mockOAuthIntegration.config,
          enabled: true,
        },
        error: null,
      });

      // Mock auth request storage
      mockSupabase.from().insert().mockResolvedValueOnce({
        error: null,
      });

      const result = await ssoProvider.initiateOAuthAuth(
        mockOAuthIntegration.id,
        'https://app.example.com/dashboard'
      );

      expect(result).toHaveProperty('redirectUrl');
      expect(result).toHaveProperty('state');
      expect(result.redirectUrl).toContain(mockOAuthIntegration.config.authorizationUrl);
      expect(result.redirectUrl).toContain('client_id=test-client-id');
      expect(result.redirectUrl).toContain('response_type=code');
    });

    it('should handle OAuth callback and create user', async () => {
      const mockAuthRequest = {
        integrationId: mockOAuthIntegration.id,
        returnUrl: 'https://app.example.com/dashboard',
        timestamp: new Date(),
      };

      // Mock auth request retrieval
      mockSupabase.from().select().eq().gt().single.mockResolvedValueOnce({
        data: { data: mockAuthRequest },
        error: null,
      });

      // Mock integration retrieval
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: mockOAuthIntegration.id,
          institution_id: mockOAuthIntegration.institutionId,
          config: mockOAuthIntegration.config,
        },
        error: null,
      });

      // Mock token exchange
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'mock-access-token',
            token_type: 'Bearer',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            email: 'test@example.com',
            given_name: 'Jane',
            family_name: 'Smith',
          }),
        });

      // Mock user lookup (not found)
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      // Mock user creation
      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: {
          id: 'user-2',
          email: 'test@example.com',
          first_name: 'Jane',
          last_name: 'Smith',
          role: 'student',
        },
        error: null,
      });

      // Mock auth request cleanup
      mockSupabase.from().delete().eq.mockResolvedValueOnce({
        error: null,
      });

      const result = await ssoProvider.handleOAuthCallback(
        'mock-auth-code',
        'test-state'
      );

      expect(result.success).toBe(true);
      expect(result.user).toEqual({
        id: 'user-2',
        email: 'test@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'student',
        department: undefined,
      });
    });
  });

  describe('Integration Configuration', () => {
    it('should create SSO integration with valid configuration', async () => {
      const integrationData = {
        institutionId: 'inst-1',
        type: 'sso' as const,
        provider: 'saml' as const,
        name: 'Test SAML Integration',
        config: {
          entityId: 'test-entity',
          ssoUrl: 'https://idp.example.com/sso',
          certificate: 'mock-certificate',
          attributeMapping: {
            email: 'email',
            firstName: 'firstName',
            lastName: 'lastName',
          },
        },
        createdBy: 'admin-1',
      };

      // Mock database insert
      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: {
          id: 'integration-1',
          institution_id: integrationData.institutionId,
          type: integrationData.type,
          provider: integrationData.provider,
          name: integrationData.name,
          config: integrationData.config,
          enabled: false,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: integrationData.createdBy,
        },
        error: null,
      });

      const result = await configManager.createIntegration(integrationData);

      expect(result).toHaveProperty('id');
      expect(result.type).toBe('sso');
      expect(result.provider).toBe('saml');
      expect(result.enabled).toBe(false);
      expect(result.status).toBe('pending');
    });

    it('should reject invalid SSO configuration', async () => {
      const invalidData = {
        institutionId: 'inst-1',
        type: 'sso' as const,
        provider: 'saml' as const,
        name: 'Invalid SAML',
        config: {
          // Missing required fields
          entityId: '',
          ssoUrl: '',
        },
        createdBy: 'admin-1',
      };

      await expect(configManager.createIntegration(invalidData))
        .rejects
        .toThrow('SAML configuration requires entityId, ssoUrl, and certificate');
    });

    it('should test integration connection', async () => {
      const integrationId = 'integration-1';

      // Mock integration retrieval
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: integrationId,
          type: 'sso',
          provider: 'saml',
          config: {
            ssoUrl: 'https://idp.example.com/sso',
          },
        },
        error: null,
      });

      // Mock successful connection test
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await configManager.testIntegrationConnection(integrationId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('SAML endpoint is accessible');
      expect(result.responseTime).toBeGreaterThan(0);
    });
  });
});