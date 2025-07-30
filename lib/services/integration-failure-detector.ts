import { createClient } from '@/lib/supabase/server';
import { NotificationService } from './notification-service';

export interface IntegrationFailure {
  id: string;
  institutionId: string;
  integrationId: string;
  integrationType: 'sso' | 'sis' | 'lms' | 'analytics' | 'storage';
  failureType: 'connection_timeout' | 'authentication_failed' | 'sync_error' | 'rate_limit' | 'server_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  errorDetails: string;
  timestamp: Date;
  resolved: boolean;
  retryCount: number;
  metadata?: Record<string, any>;
}

export interface IntegrationHealth {
  integrationId: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastSuccessfulSync?: Date;
  consecutiveFailures: number;
  uptime: number; // percentage
  responseTime: number; // milliseconds
}

export class IntegrationFailureDetector {
  private supabase = createClient();
  private notificationService = new NotificationService();
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly FAILURE_THRESHOLD = 5; // consecutive failures before marking as failed

  async detectIntegrationFailures(institutionId: string): Promise<IntegrationFailure[]> {
    const { data: integrations } = await this.supabase
      .from('institution_integrations')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('enabled', true);

    if (!integrations) return [];

    const failures: IntegrationFailure[] = [];

    for (const integration of integrations) {
      const health = await this.checkIntegrationHealth(integration);
      
      if (health.status === 'failed' || health.status === 'degraded') {
        const failure = await this.createFailureRecord(integration, health);
        failures.push(failure);
      }
    }

    return failures;
  }

  private async checkIntegrationHealth(integration: any): Promise<IntegrationHealth> {
    const integrationId = integration.id;
    
    // Get recent sync attempts
    const { data: syncLogs } = await this.supabase
      .from('integration_sync_logs')
      .select('*')
      .eq('integration_id', integrationId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!syncLogs || syncLogs.length === 0) {
      return {
        integrationId,
        status: 'failed',
        consecutiveFailures: 0,
        uptime: 0,
        responseTime: 0
      };
    }

    const recentLogs = syncLogs.slice(0, 10);
    const successfulSyncs = recentLogs.filter(log => log.status === 'success');
    const failedSyncs = recentLogs.filter(log => log.status === 'failed');
    
    // Calculate consecutive failures
    let consecutiveFailures = 0;
    for (const log of recentLogs) {
      if (log.status === 'failed') {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    // Calculate uptime percentage
    const uptime = (successfulSyncs.length / recentLogs.length) * 100;
    
    // Calculate average response time
    const responseTimes = recentLogs
      .filter(log => log.response_time)
      .map(log => log.response_time);
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    // Determine status
    let status: IntegrationHealth['status'] = 'healthy';
    if (consecutiveFailures >= this.FAILURE_THRESHOLD) {
      status = 'failed';
    } else if (uptime < 80 || consecutiveFailures > 2) {
      status = 'degraded';
    }

    return {
      integrationId,
      status,
      lastSuccessfulSync: successfulSyncs[0]?.created_at ? new Date(successfulSyncs[0].created_at) : undefined,
      consecutiveFailures,
      uptime,
      responseTime: avgResponseTime
    };
  }

  private async createFailureRecord(integration: any, health: IntegrationHealth): Promise<IntegrationFailure> {
    const failureType = this.determineFailureType(integration, health);
    const severity = this.determineSeverity(health);
    const message = this.generateFailureMessage(integration, health, failureType);

    const failure: IntegrationFailure = {
      id: `failure_${integration.id}_${Date.now()}`,
      institutionId: integration.institution_id,
      integrationId: integration.id,
      integrationType: integration.type,
      failureType,
      severity,
      message,
      errorDetails: integration.sync_errors?.join('; ') || 'No specific error details available',
      timestamp: new Date(),
      resolved: false,
      retryCount: 0,
      metadata: {
        uptime: health.uptime,
        consecutiveFailures: health.consecutiveFailures,
        responseTime: health.responseTime,
        provider: integration.provider
      }
    };

    // Store failure record
    await this.supabase
      .from('integration_failures')
      .insert({
        institution_id: failure.institutionId,
        integration_id: failure.integrationId,
        integration_type: failure.integrationType,
        failure_type: failure.failureType,
        severity: failure.severity,
        message: failure.message,
        error_details: failure.errorDetails,
        resolved: failure.resolved,
        retry_count: failure.retryCount,
        metadata: failure.metadata
      });

    // Send notification
    await this.sendFailureNotification(failure);

    return failure;
  }

  private determineFailureType(integration: any, health: IntegrationHealth): IntegrationFailure['failureType'] {
    if (health.responseTime > 30000) {
      return 'connection_timeout';
    }
    
    if (integration.sync_errors?.some((error: string) => error.includes('authentication'))) {
      return 'authentication_failed';
    }
    
    if (integration.sync_errors?.some((error: string) => error.includes('rate limit'))) {
      return 'rate_limit';
    }
    
    if (health.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      return 'server_error';
    }
    
    return 'sync_error';
  }

  private determineSeverity(health: IntegrationHealth): IntegrationFailure['severity'] {
    if (health.status === 'failed' && health.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      return 'critical';
    }
    
    if (health.uptime < 50) {
      return 'high';
    }
    
    if (health.uptime < 80 || health.consecutiveFailures > 2) {
      return 'medium';
    }
    
    return 'low';
  }

  private generateFailureMessage(integration: any, health: IntegrationHealth, failureType: string): string {
    const provider = integration.provider;
    const type = integration.type.toUpperCase();
    
    switch (failureType) {
      case 'connection_timeout':
        return `${type} integration with ${provider} is experiencing connection timeouts (avg response: ${health.responseTime}ms)`;
      case 'authentication_failed':
        return `${type} integration with ${provider} authentication has failed - credentials may need updating`;
      case 'sync_error':
        return `${type} integration with ${provider} sync failures detected (${health.consecutiveFailures} consecutive failures)`;
      case 'rate_limit':
        return `${type} integration with ${provider} is being rate limited - consider reducing sync frequency`;
      case 'server_error':
        return `${type} integration with ${provider} is experiencing server errors (uptime: ${health.uptime.toFixed(1)}%)`;
      default:
        return `${type} integration with ${provider} is experiencing issues`;
    }
  }

  private async sendFailureNotification(failure: IntegrationFailure): Promise<void> {
    // Get institution admins
    const { data: admins } = await this.supabase
      .from('users')
      .select('id, email')
      .eq('institution_id', failure.institutionId)
      .in('role', ['institution_admin', 'system_admin']);

    if (admins) {
      for (const admin of admins) {
        await this.notificationService.sendNotification({
          userId: admin.id,
          type: 'integration_failure',
          title: `Integration Failure - ${failure.severity.toUpperCase()}`,
          message: failure.message,
          metadata: {
            failureId: failure.id,
            integrationId: failure.integrationId,
            integrationType: failure.integrationType,
            severity: failure.severity
          }
        });
      }
    }
  }

  async retryIntegration(integrationId: string): Promise<boolean> {
    try {
      // Update retry count
      await this.supabase
        .from('integration_failures')
        .update({
          retry_count: this.supabase.raw('retry_count + 1'),
          updated_at: new Date().toISOString()
        })
        .eq('integration_id', integrationId)
        .eq('resolved', false);

      // Trigger integration sync
      const { data: integration } = await this.supabase
        .from('institution_integrations')
        .select('*')
        .eq('id', integrationId)
        .single();

      if (integration) {
        // This would trigger the actual integration sync
        // Implementation depends on the specific integration type
        await this.triggerIntegrationSync(integration);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to retry integration:', error);
      return false;
    }
  }

  private async triggerIntegrationSync(integration: any): Promise<void> {
    // Log sync attempt
    await this.supabase
      .from('integration_sync_logs')
      .insert({
        integration_id: integration.id,
        status: 'in_progress',
        started_at: new Date().toISOString()
      });

    // This would contain the actual integration sync logic
    // For now, we'll simulate a sync attempt
    const success = Math.random() > 0.3; // 70% success rate for simulation

    await this.supabase
      .from('integration_sync_logs')
      .update({
        status: success ? 'success' : 'failed',
        completed_at: new Date().toISOString(),
        error_message: success ? null : 'Simulated sync failure'
      })
      .eq('integration_id', integration.id)
      .is('completed_at', null);
  }

  async resolveFailure(failureId: string, userId: string): Promise<void> {
    await this.supabase
      .from('integration_failures')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId
      })
      .eq('id', failureId);
  }

  async getIntegrationHealthSummary(institutionId: string): Promise<{
    totalIntegrations: number;
    healthyIntegrations: number;
    degradedIntegrations: number;
    failedIntegrations: number;
    activeFailures: number;
  }> {
    const { data: integrations } = await this.supabase
      .from('institution_integrations')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('enabled', true);

    if (!integrations) {
      return {
        totalIntegrations: 0,
        healthyIntegrations: 0,
        degradedIntegrations: 0,
        failedIntegrations: 0,
        activeFailures: 0
      };
    }

    let healthyCount = 0;
    let degradedCount = 0;
    let failedCount = 0;

    for (const integration of integrations) {
      const health = await this.checkIntegrationHealth(integration);
      switch (health.status) {
        case 'healthy':
          healthyCount++;
          break;
        case 'degraded':
          degradedCount++;
          break;
        case 'failed':
          failedCount++;
          break;
      }
    }

    const { data: activeFailures } = await this.supabase
      .from('integration_failures')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('resolved', false);

    return {
      totalIntegrations: integrations.length,
      healthyIntegrations: healthyCount,
      degradedIntegrations: degradedCount,
      failedIntegrations: failedCount,
      activeFailures: activeFailures?.length || 0
    };
  }
}