import { createClient } from '@/lib/supabase/server';
import { 
  IntegrationConfig, 
  IntegrationType, 
  IntegrationProvider, 
  IntegrationStatus,
  SSOConfig,
  OAuth2Config,
  SISConfig,
  LMSConfig
} from '@/lib/types/integration';

export class IntegrationConfigManager {
  private supabase = createClient();

  async createIntegration(data: {
    institutionId: string;
    type: IntegrationType;
    provider: IntegrationProvider;
    name: string;
    description?: string;
    config: Record<string, any>;
    createdBy: string;
  }): Promise<IntegrationConfig> {
    // Validate configuration based on type and provider
    this.validateIntegrationConfig(data.type, data.provider, data.config);

    const integration = {
      ...data,
      enabled: false,
      status: 'pending' as IntegrationStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { data: result, error } = await this.supabase
      .from('institution_integrations')
      .insert(integration)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create integration: ${error.message}`);
    }

    return this.mapDatabaseToIntegration(result);
  }

  async updateIntegration(
    id: string, 
    updates: Partial<IntegrationConfig>
  ): Promise<IntegrationConfig> {
    if (updates.config && updates.type && updates.provider) {
      this.validateIntegrationConfig(updates.type, updates.provider, updates.config);
    }

    const { data: result, error } = await this.supabase
      .from('institution_integrations')
      .update({
        ...updates,
        updatedAt: new Date(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update integration: ${error.message}`);
    }

    return this.mapDatabaseToIntegration(result);
  }

  async deleteIntegration(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('institution_integrations')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete integration: ${error.message}`);
    }
  }

  async getIntegration(id: string): Promise<IntegrationConfig | null> {
    const { data, error } = await this.supabase
      .from('institution_integrations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get integration: ${error.message}`);
    }

    return this.mapDatabaseToIntegration(data);
  }

  async listIntegrations(
    institutionId: string,
    filters?: {
      type?: IntegrationType;
      provider?: IntegrationProvider;
      enabled?: boolean;
      status?: IntegrationStatus;
    }
  ): Promise<IntegrationConfig[]> {
    let query = this.supabase
      .from('institution_integrations')
      .select('*')
      .eq('institution_id', institutionId);

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }
    if (filters?.provider) {
      query = query.eq('provider', filters.provider);
    }
    if (filters?.enabled !== undefined) {
      query = query.eq('enabled', filters.enabled);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list integrations: ${error.message}`);
    }

    return data.map(this.mapDatabaseToIntegration);
  }

  async enableIntegration(id: string): Promise<IntegrationConfig> {
    return this.updateIntegration(id, { 
      enabled: true, 
      status: 'active' 
    });
  }

  async disableIntegration(id: string): Promise<IntegrationConfig> {
    return this.updateIntegration(id, { 
      enabled: false, 
      status: 'inactive' 
    });
  }

  async testIntegrationConnection(id: string): Promise<{
    success: boolean;
    message: string;
    responseTime?: number;
  }> {
    const integration = await this.getIntegration(id);
    if (!integration) {
      throw new Error('Integration not found');
    }

    const startTime = Date.now();
    
    try {
      // Test connection based on integration type
      switch (integration.type) {
        case 'sso':
          return await this.testSSOConnection(integration);
        case 'sis':
          return await this.testSISConnection(integration);
        case 'lms':
          return await this.testLMSConnection(integration);
        default:
          throw new Error(`Unsupported integration type: ${integration.type}`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      };
    }
  }

  private validateIntegrationConfig(
    type: IntegrationType,
    provider: IntegrationProvider,
    config: Record<string, any>
  ): void {
    switch (type) {
      case 'sso':
        this.validateSSOConfig(provider, config);
        break;
      case 'sis':
        this.validateSISConfig(provider, config);
        break;
      case 'lms':
        this.validateLMSConfig(provider, config);
        break;
      default:
        throw new Error(`Unsupported integration type: ${type}`);
    }
  }

  private validateSSOConfig(provider: IntegrationProvider, config: any): void {
    if (provider === 'saml') {
      const ssoConfig = config as SSOConfig;
      if (!ssoConfig.entityId || !ssoConfig.ssoUrl || !ssoConfig.certificate) {
        throw new Error('SAML configuration requires entityId, ssoUrl, and certificate');
      }
      if (!ssoConfig.attributeMapping?.email) {
        throw new Error('SAML configuration requires email attribute mapping');
      }
    } else if (['oauth2', 'google', 'microsoft', 'okta'].includes(provider)) {
      const oauthConfig = config as OAuth2Config;
      if (!oauthConfig.clientId || !oauthConfig.clientSecret || !oauthConfig.authorizationUrl) {
        throw new Error('OAuth2 configuration requires clientId, clientSecret, and authorizationUrl');
      }
      if (!oauthConfig.attributeMapping?.email) {
        throw new Error('OAuth2 configuration requires email attribute mapping');
      }
    }
  }

  private validateSISConfig(provider: IntegrationProvider, config: any): void {
    const sisConfig = config as SISConfig;
    if (!sisConfig.apiUrl) {
      throw new Error('SIS configuration requires apiUrl');
    }
    if (!sisConfig.apiKey && !sisConfig.username) {
      throw new Error('SIS configuration requires either apiKey or username/password');
    }
    if (!sisConfig.fieldMapping?.email) {
      throw new Error('SIS configuration requires email field mapping');
    }
  }

  private validateLMSConfig(provider: IntegrationProvider, config: any): void {
    const lmsConfig = config as LMSConfig;
    if (!lmsConfig.apiUrl) {
      throw new Error('LMS configuration requires apiUrl');
    }
    if (!lmsConfig.apiKey && !lmsConfig.accessToken) {
      throw new Error('LMS configuration requires either apiKey or accessToken');
    }
    if (!lmsConfig.fieldMapping?.courseId) {
      throw new Error('LMS configuration requires courseId field mapping');
    }
  }

  private async testSSOConnection(integration: IntegrationConfig): Promise<{
    success: boolean;
    message: string;
    responseTime?: number;
  }> {
    const startTime = Date.now();
    
    if (integration.provider === 'saml') {
      const config = integration.config as SSOConfig;
      
      // Test SAML metadata endpoint
      try {
        const response = await fetch(config.ssoUrl, {
          method: 'GET',
          timeout: 10000,
        });
        
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
          return {
            success: true,
            message: 'SAML endpoint is accessible',
            responseTime,
          };
        } else {
          return {
            success: false,
            message: `SAML endpoint returned ${response.status}: ${response.statusText}`,
            responseTime,
          };
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        return {
          success: false,
          message: `Failed to connect to SAML endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`,
          responseTime,
        };
      }
    }
    
    // Add OAuth2 testing logic here
    return {
      success: false,
      message: `Connection testing not implemented for provider: ${integration.provider}`,
    };
  }

  private async testSISConnection(integration: IntegrationConfig): Promise<{
    success: boolean;
    message: string;
    responseTime?: number;
  }> {
    const startTime = Date.now();
    const config = integration.config as SISConfig;
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }
      
      const response = await fetch(`${config.apiUrl}/health`, {
        method: 'GET',
        headers,
        timeout: 10000,
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        return {
          success: true,
          message: 'SIS API is accessible',
  
        responseTime,
        };
      } else {
        return {
          success: false,
          message: `SIS API returned ${response.status}: ${response.statusText}`,
          responseTime,
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        message: `Failed to connect to SIS API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime,
      };
    }
  }

  private async testLMSConnection(integration: IntegrationConfig): Promise<{
    success: boolean;
    message: string;
    responseTime?: number;
  }> {
    const startTime = Date.now();
    const config = integration.config as LMSConfig;
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      } else if (config.accessToken) {
        headers['Authorization'] = `Bearer ${config.accessToken}`;
      }
      
      const response = await fetch(`${config.apiUrl}/api/v1/courses`, {
        method: 'GET',
        headers,
        timeout: 10000,
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        return {
          success: true,
          message: 'LMS API is accessible',
          responseTime,
        };
      } else {
        return {
          success: false,
          message: `LMS API returned ${response.status}: ${response.statusText}`,
          responseTime,
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        message: `Failed to connect to LMS API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime,
      };
    }
  }

  private mapDatabaseToIntegration(data: any): IntegrationConfig {
    return {
      id: data.id,
      institutionId: data.institution_id,
      type: data.type,
      provider: data.provider,
      name: data.name,
      description: data.description,
      config: data.config,
      enabled: data.enabled,
      status: data.status,
      lastSync: data.last_sync ? new Date(data.last_sync) : undefined,
      lastSyncStatus: data.last_sync_status,
      syncErrors: data.sync_errors,
      syncSchedule: data.sync_schedule,
      healthCheckUrl: data.health_check_url,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      createdBy: data.created_by,
    };
  }
}