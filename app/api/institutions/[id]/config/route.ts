import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionConfigManager } from '@/lib/services/institution-config-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const institutionId = params.id;
    const { searchParams } = new URL(request.url);

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionMember = userProfile.institution_id === institutionId;
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && isInstitutionMember;

    if (!isSystemAdmin && !isInstitutionMember) {
      return NextResponse.json({
        success: false,
        error: 'Access denied'
      }, { status: 403 });
    }

    // Verify institution exists
    const { data: institution, error: institutionError } = await supabase
      .from('institutions')
      .select('id, name, status')
      .eq('id', institutionId)
      .single();

    if (institutionError || !institution) {
      return NextResponse.json({
        success: false,
        error: 'Institution not found'
      }, { status: 404 });
    }

    const configManager = new InstitutionConfigManager();
    const configType = searchParams.get('type') || 'all';

    let configData = {};

    switch (configType) {
      case 'all':
        const [config, branding, featureFlags] = await Promise.all([
          configManager.getConfig(institutionId),
          configManager.getBranding(institutionId),
          configManager.getFeatureFlags(institutionId)
        ]);

        configData = {
          config,
          branding,
          featureFlags
        };
        break;

      case 'general':
        configData = {
          config: await configManager.getConfig(institutionId)
        };
        break;

      case 'branding':
        configData = {
          branding: await configManager.getBranding(institutionId)
        };
        break;

      case 'features':
        configData = {
          featureFlags: await configManager.getFeatureFlags(institutionId)
        };
        break;

      case 'integrations':
        if (!isInstitutionAdmin && !isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Integration settings require admin privileges'
          }, { status: 403 });
        }
        configData = {
          integrations: await configManager.getIntegrations(institutionId)
        };
        break;

      case 'security':
        if (!isInstitutionAdmin && !isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Security settings require admin privileges'
          }, { status: 403 });
        }
        configData = {
          security: await configManager.getSecuritySettings(institutionId)
        };
        break;

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid configuration type'
        }, { status: 400 });
    }

    // Filter sensitive data for non-admin users
    if (!isInstitutionAdmin && !isSystemAdmin) {
      if (configData.config) {
        configData.config = {
          ...configData.config,
          integrations: undefined,
          securitySettings: undefined
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        institutionId,
        institution: {
          id: institution.id,
          name: institution.name
        },
        ...configData,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Institution config GET API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const institutionId = params.id;
    const body = await request.json();

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === institutionId;

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    const configManager = new InstitutionConfigManager();
    const { configType, ...configData } = body;

    let updateResult = {};

    switch (configType) {
      case 'general':
        const { config } = configData;
        updateResult = await configManager.updateConfig(institutionId, config, user.id);
        break;

      case 'branding':
        const { branding } = configData;
        updateResult = await configManager.updateBranding(institutionId, branding, user.id);
        break;

      case 'features':
        const { featureFlags } = configData;
        updateResult = await configManager.updateFeatureFlags(institutionId, featureFlags, user.id);
        break;

      case 'integrations':
        const { integrations } = configData;
        updateResult = await configManager.updateIntegrations(institutionId, integrations, user.id);
        break;

      case 'security':
        const { security } = configData;
        updateResult = await configManager.updateSecuritySettings(institutionId, security, user.id);
        break;

      case 'bulk':
        // Update multiple configuration types at once
        const { config: bulkConfig, branding: bulkBranding, featureFlags: bulkFeatures } = configData;
        
        const bulkUpdates = [];
        if (bulkConfig) bulkUpdates.push(configManager.updateConfig(institutionId, bulkConfig, user.id));
        if (bulkBranding) bulkUpdates.push(configManager.updateBranding(institutionId, bulkBranding, user.id));
        if (bulkFeatures) bulkUpdates.push(configManager.updateFeatureFlags(institutionId, bulkFeatures, user.id));

        const bulkResults = await Promise.all(bulkUpdates);
        updateResult = {
          success: bulkResults.every(result => result.success),
          results: bulkResults
        };
        break;

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid configuration type'
        }, { status: 400 });
    }

    if (!updateResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to update configuration',
        errors: updateResult.errors
      }, { status: 400 });
    }

    // Log configuration change
    await supabase
      .from('institution_audit_log')
      .insert({
        institution_id: institutionId,
        user_id: user.id,
        action: 'config_update',
        details: {
          configType,
          timestamp: new Date().toISOString()
        }
      });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Configuration updated successfully',
        updatedAt: new Date().toISOString(),
        updatedBy: user.id
      }
    });

  } catch (error) {
    console.error('Institution config PUT API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const institutionId = params.id;
    const body = await request.json();

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === institutionId;

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    const configManager = new InstitutionConfigManager();
    const { action, ...data } = body;

    switch (action) {
      case 'validate_config':
        const { configType, configData: validateData } = data;
        const validationResult = await configManager.validateConfiguration(configType, validateData);
        
        return NextResponse.json({
          success: true,
          data: {
            validation: validationResult
          }
        });

      case 'reset_to_defaults':
        const { configType: resetType } = data;
        const resetResult = await configManager.resetToDefaults(institutionId, resetType, user.id);
        
        if (!resetResult.success) {
          return NextResponse.json({
            success: false,
            error: 'Failed to reset configuration',
            errors: resetResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          data: {
            message: 'Configuration reset to defaults',
            resetAt: new Date().toISOString()
          }
        });

      case 'export_config':
        const { includeSecrets } = data;
        
        // Only system admins can export with secrets
        if (includeSecrets && !isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Exporting secrets requires system admin privileges'
          }, { status: 403 });
        }

        const exportResult = await configManager.exportConfiguration(institutionId, {
          includeSecrets,
          exportedBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            export: exportResult,
            downloadUrl: `/api/institutions/${institutionId}/config/download/${exportResult.exportId}`
          }
        });

      case 'import_config':
        const { configFile, overwriteExisting } = data;
        const importResult = await configManager.importConfiguration(institutionId, {
          configFile,
          overwriteExisting,
          importedBy: user.id
        });

        if (!importResult.success) {
          return NextResponse.json({
            success: false,
            error: 'Failed to import configuration',
            errors: importResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          data: {
            import: importResult
          }
        });

      case 'test_integration':
        const { integrationType, integrationConfig } = data;
        const testResult = await configManager.testIntegration(integrationType, integrationConfig);

        return NextResponse.json({
          success: true,
          data: {
            test: testResult
          }
        });

      case 'backup_config':
        const backupResult = await configManager.createConfigBackup(institutionId, user.id);

        return NextResponse.json({
          success: true,
          data: {
            backup: backupResult
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Institution config POST API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}