import { IntegrationConfig, SSOConfig, OAuth2Config } from '@/lib/types/integration';
import { createClient } from '@/lib/supabase/server';

export interface SSOAuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
    department?: string;
  };
  error?: string;
  redirectUrl?: string;
}

export class SSOProvider {
  private supabase = createClient();

  async initiateSAMLAuth(integrationId: string, returnUrl?: string): Promise<{
    redirectUrl: string;
    requestId: string;
  }> {
    const integration = await this.getIntegration(integrationId);
    if (!integration || integration.type !== 'sso' || integration.provider !== 'saml') {
      throw new Error('Invalid SAML integration');
    }

    const config = integration.config as SSOConfig;
    const requestId = this.generateRequestId();
    
    // Store request state
    await this.storeAuthRequest(requestId, {
      integrationId,
      returnUrl,
      timestamp: new Date(),
    });

    // Generate SAML AuthnRequest
    const samlRequest = this.generateSAMLRequest(config, requestId);
    const encodedRequest = Buffer.from(samlRequest).toString('base64');
    
    const redirectUrl = `${config.ssoUrl}?SAMLRequest=${encodeURIComponent(encodedRequest)}&RelayState=${requestId}`;

    return {
      redirectUrl,
      requestId,
    };
  }

  async handleSAMLResponse(samlResponse: string, relayState: string): Promise<SSOAuthResult> {
    try {
      // Retrieve auth request
      const authRequest = await this.getAuthRequest(relayState);
      if (!authRequest) {
        return { success: false, error: 'Invalid or expired authentication request' };
      }

      const integration = await this.getIntegration(authRequest.integrationId);
      if (!integration) {
        return { success: false, error: 'Integration not found' };
      }

      const config = integration.config as SSOConfig;
      
      // Decode and validate SAML response
      const decodedResponse = Buffer.from(samlResponse, 'base64').toString();
      const userAttributes = await this.validateSAMLResponse(decodedResponse, config);
      
      if (!userAttributes) {
        return { success: false, error: 'Invalid SAML response' };
      }

      // Map attributes to user data
      const userData = this.mapSAMLAttributes(userAttributes, config.attributeMapping);
      
      // Create or update user
      const user = await this.createOrUpdateUser(userData, integration.institutionId);
      
      // Clean up auth request
      await this.cleanupAuthRequest(relayState);

      return {
        success: true,
        user,
        redirectUrl: authRequest.returnUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  async initiateOAuthAuth(integrationId: string, returnUrl?: string): Promise<{
    redirectUrl: string;
    state: string;
  }> {
    const integration = await this.getIntegration(integrationId);
    if (!integration || integration.type !== 'sso' || !['oauth2', 'google', 'microsoft', 'okta'].includes(integration.provider)) {
      throw new Error('Invalid OAuth integration');
    }

    const config = integration.config as OAuth2Config;
    const state = this.generateRequestId();
    
    // Store request state
    await this.storeAuthRequest(state, {
      integrationId,
      returnUrl,
      timestamp: new Date(),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope.join(' '),
      state,
    });

    const redirectUrl = `${config.authorizationUrl}?${params.toString()}`;

    return {
      redirectUrl,
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string): Promise<SSOAuthResult> {
    try {
      // Retrieve auth request
      const authRequest = await this.getAuthRequest(state);
      if (!authRequest) {
        return { success: false, error: 'Invalid or expired authentication request' };
      }

      const integration = await this.getIntegration(authRequest.integrationId);
      if (!integration) {
        return { success: false, error: 'Integration not found' };
      }

      const config = integration.config as OAuth2Config;
      
      // Exchange code for access token
      const tokenResponse = await this.exchangeCodeForToken(code, config);
      if (!tokenResponse.access_token) {
        return { success: false, error: 'Failed to obtain access token' };
      }

      // Get user info
      const userInfo = await this.getOAuthUserInfo(tokenResponse.access_token, config);
      if (!userInfo) {
        return { success: false, error: 'Failed to retrieve user information' };
      }

      // Map attributes to user data
      const userData = this.mapOAuthAttributes(userInfo, config.attributeMapping);
      
      // Create or update user
      const user = await this.createOrUpdateUser(userData, integration.institutionId);
      
      // Clean up auth request
      await this.cleanupAuthRequest(state);

      return {
        success: true,
        user,
        redirectUrl: authRequest.returnUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  private async getIntegration(id: string): Promise<IntegrationConfig | null> {
    const { data, error } = await this.supabase
      .from('institution_integrations')
      .select('*')
      .eq('id', id)
      .eq('enabled', true)
      .single();

    if (error || !data) return null;

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
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      createdBy: data.created_by,
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async storeAuthRequest(requestId: string, data: any): Promise<void> {
    const { error } = await this.supabase
      .from('sso_auth_requests')
      .insert({
        id: requestId,
        data,
        expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      });

    if (error) {
      throw new Error(`Failed to store auth request: ${error.message}`);
    }
  }

  private async getAuthRequest(requestId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('sso_auth_requests')
      .select('*')
      .eq('id', requestId)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;
    return data.data;
  }

  private async cleanupAuthRequest(requestId: string): Promise<void> {
    await this.supabase
      .from('sso_auth_requests')
      .delete()
      .eq('id', requestId);
  }

  private generateSAMLRequest(config: SSOConfig, requestId: string): string {
    const timestamp = new Date().toISOString();
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="${requestId}"
                    Version="2.0"
                    IssueInstant="${timestamp}"
                    Destination="${config.ssoUrl}"
                    AssertionConsumerServiceURL="${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/saml/callback"
                    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${config.entityId}</saml:Issuer>
  <samlp:NameIDPolicy Format="${config.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'}"
                      AllowCreate="true"/>
</samlp:AuthnRequest>`;
  }

  private async validateSAMLResponse(response: string, config: SSOConfig): Promise<Record<string, any> | null> {
    // This is a simplified validation - in production, you'd use a proper SAML library
    // to validate signatures, timestamps, etc.
    
    try {
      // Parse XML and extract attributes
      // This would typically use xml2js or similar library
      const attributes: Record<string, any> = {};
      
      // Extract email from response (simplified)
      const emailMatch = response.match(/<saml:AttributeValue[^>]*>([^<]+@[^<]+)<\/saml:AttributeValue>/);
      if (emailMatch) {
        attributes.email = emailMatch[1];
      }
      
      // Extract other attributes based on config
      // This is a placeholder - real implementation would parse XML properly
      
      return attributes.email ? attributes : null;
    } catch (error) {
      console.error('SAML validation error:', error);
      return null;
    }
  }

  private mapSAMLAttributes(attributes: Record<string, any>, mapping: SSOConfig['attributeMapping']) {
    return {
      email: attributes[mapping.email],
      firstName: attributes[mapping.firstName],
      lastName: attributes[mapping.lastName],
      role: mapping.role ? attributes[mapping.role] : undefined,
      department: mapping.department ? attributes[mapping.department] : undefined,
    };
  }

  private async exchangeCodeForToken(code: string, config: OAuth2Config): Promise<any> {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  private async getOAuthUserInfo(accessToken: string, config: OAuth2Config): Promise<any> {
    const response = await fetch(config.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`User info request failed: ${response.statusText}`);
    }

    return response.json();
  }

  private mapOAuthAttributes(userInfo: any, mapping: OAuth2Config['attributeMapping']) {
    return {
      email: userInfo[mapping.email],
      firstName: userInfo[mapping.firstName],
      lastName: userInfo[mapping.lastName],
      role: mapping.role ? userInfo[mapping.role] : undefined,
      department: mapping.department ? userInfo[mapping.department] : undefined,
    };
  }

  private async createOrUpdateUser(userData: any, institutionId: string) {
    // Check if user exists
    const { data: existingUser } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('email', userData.email)
      .single();

    if (existingUser) {
      // Update existing user
      const { data: updatedUser, error } = await this.supabase
        .from('profiles')
        .update({
          first_name: userData.firstName,
          last_name: userData.lastName,
          role: userData.role,
          department: userData.department,
          institution_id: institutionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update user: ${error.message}`);
      }

      return {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        role: updatedUser.role,
        department: updatedUser.department,
      };
    } else {
      // Create new user
      const { data: newUser, error } = await this.supabase
        .from('profiles')
        .insert({
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          role: userData.role,
          department: userData.department,
          institution_id: institutionId,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create user: ${error.message}`);
      }

      return {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        department: newUser.department,
      };
    }
  }
}