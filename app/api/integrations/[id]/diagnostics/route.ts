import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { IntegrationConfigManager } from '@/lib/services/integration-config-manager';

interface DiagnosticResult {
  category: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  details?: string;
  resolution?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const integrationId = params.id;

    if (!integrationId) {
      return NextResponse.json(
        { error: 'Integration ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const integrationManager = new IntegrationConfigManager();

    // Get integration details
    const integration = await integrationManager.getIntegration(integrationId);
    
    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    const diagnostics: DiagnosticResult[] = [];

    // Run configuration diagnostics
    diagnostics.push(...await runConfigurationDiagnostics(integration));

    // Run connectivity diagnostics
    diagnostics.push(...await runConnectivityDiagnostics(integration));

    // Run authentication diagnostics
    diagnostics.push(...await runAuthenticationDiagnostics(integration));

    // Run data validation diagnostics
    diagnostics.push(...await runDataValidationDiagnostics(integration));

    return NextResponse.json(diagnostics);
  } catch (error) {
    console.error('Diagnostics failed:', error);
    return NextResponse.json(
      { error: 'Diagnostics failed' },
      { status: 500 }
    );
  }
}

async function runConfigurationDiagnostics(integration: any): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Check if integration is enabled
  results.push({
    category: 'Configuration',
    status: integration.enabled ? 'pass' : 'warning',
    message: integration.enabled ? 'Integration is enabled' : 'Integration is disabled',
    details: integration.enabled ? undefined : 'The integration is currently disabled and will not process requests',
    resolution: integration.enabled ? undefined : 'Enable the integration in the settings to activate it'
  });

  // Check configuration completeness
  const requiredFields = getRequiredConfigFields(integration.type, integration.provider);
  const missingFields = requiredFields.filter(field => !integration.config[field]);

  if (missingFields.length === 0) {
    results.push({
      category: 'Configuration',
      status: 'pass',
      message: 'All required configuration fields are present'
    });
  } else {
    results.push({
      category: 'Configuration',
      status: 'fail',
      message: `Missing required configuration fields: ${missingFields.join(', ')}`,
      details: `The following fields are required for ${integration.type} ${integration.provider} integration`,
      resolution: 'Update the integration configuration to include all required fields'
    });
  }

  return results;
}

async function runConnectivityDiagnostics(integration: any): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  try {
    const integrationManager = new IntegrationConfigManager();
    const connectionTest = await integrationManager.testIntegrationConnection(integration.id);

    results.push({
      category: 'Connectivity',
      status: connectionTest.success ? 'pass' : 'fail',
      message: connectionTest.message,
      details: connectionTest.responseTime ? `Response time: ${connectionTest.responseTime}ms` : undefined,
      resolution: connectionTest.success ? undefined : 'Check network connectivity and endpoint configuration'
    });
  } catch (error) {
    results.push({
      category: 'Connectivity',
      status: 'fail',
      message: 'Failed to test connection',
      details: error instanceof Error ? error.message : 'Unknown error',
      resolution: 'Check integration configuration and network connectivity'
    });
  }

  return results;
}

async function runAuthenticationDiagnostics(integration: any): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Check authentication configuration
  const authFields = getAuthenticationFields(integration.type, integration.provider);
  const hasAuthConfig = authFields.some(field => integration.config[field]);

  if (hasAuthConfig) {
    results.push({
      category: 'Authentication',
      status: 'pass',
      message: 'Authentication configuration is present'
    });

    // Test authentication if possible
    try {
      const authTest = await testAuthentication(integration);
      results.push({
        category: 'Authentication',
        status: authTest.success ? 'pass' : 'fail',
        message: authTest.message,
        details: authTest.details,
        resolution: authTest.success ? undefined : 'Verify authentication credentials and permissions'
      });
    } catch (error) {
      results.push({
        category: 'Authentication',
        status: 'warning',
        message: 'Could not test authentication',
        details: error instanceof Error ? error.message : 'Unknown error',
        resolution: 'Manually verify authentication credentials'
      });
    }
  } else {
    results.push({
      category: 'Authentication',
      status: 'fail',
      message: 'No authentication configuration found',
      details: `Required authentication fields: ${authFields.join(', ')}`,
      resolution: 'Configure authentication credentials for the integration'
    });
  }

  return results;
}

async function runDataValidationDiagnostics(integration: any): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Check field mapping configuration
  if (integration.config.fieldMapping) {
    const requiredMappings = getRequiredFieldMappings(integration.type, integration.provider);
    const missingMappings = requiredMappings.filter(field => !integration.config.fieldMapping[field]);

    if (missingMappings.length === 0) {
      results.push({
        category: 'Data Validation',
        status: 'pass',
        message: 'All required field mappings are configured'
      });
    } else {
      results.push({
        category: 'Data Validation',
        status: 'warning',
        message: `Missing field mappings: ${missingMappings.join(', ')}`,
        details: 'Some data fields may not be imported correctly',
        resolution: 'Configure field mappings for all required data fields'
      });
    }
  } else {
    results.push({
      category: 'Data Validation',
      status: 'warning',
      message: 'No field mapping configuration found',
      details: 'Data import may use default field mappings',
      resolution: 'Configure field mappings to ensure correct data import'
    });
  }

  return results;
}

function getRequiredConfigFields(type: string, provider: string): string[] {
  switch (type) {
    case 'sso':
      if (provider === 'saml') {
        return ['entityId', 'ssoUrl', 'certificate'];
      } else if (['oauth2', 'google', 'microsoft', 'okta'].includes(provider)) {
        return ['clientId', 'clientSecret', 'authorizationUrl', 'tokenUrl'];
      }
      break;
    case 'sis':
      return ['apiUrl'];
    case 'lms':
      return ['apiUrl'];
  }
  return [];
}

function getAuthenticationFields(type: string, provider: string): string[] {
  switch (type) {
    case 'sso':
      if (provider === 'saml') {
        return ['certificate'];
      } else {
        return ['clientSecret'];
      }
    case 'sis':
      return ['apiKey', 'username', 'password'];
    case 'lms':
      return ['apiKey', 'accessToken'];
  }
  return [];
}

function getRequiredFieldMappings(type: string, provider: string): string[] {
  switch (type) {
    case 'sso':
      return ['email', 'firstName', 'lastName'];
    case 'sis':
      return ['studentId', 'email', 'firstName', 'lastName'];
    case 'lms':
      return ['courseId', 'courseName', 'studentId'];
  }
  return [];
}

async function testAuthentication(integration: any): Promise<{
  success: boolean;
  message: string;
  details?: string;
}> {
  // This would implement actual authentication testing
  // For now, return a placeholder response
  return {
    success: true,
    message: 'Authentication test not implemented',
    details: 'Manual verification required'
  };
}