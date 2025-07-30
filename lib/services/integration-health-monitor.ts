import { createClient } from '@/lib/supabase/server';
import { 
  IntegrationConfig, 
  IntegrationHealth, 
  IntegrationStatus,
  SyncJob 
} from '@/lib/types/integration';
import { NotificationService } from './notification-service';

export interface HealthCheckResult {
  integrationId: string;
  status: 'healthy' | 'warning' | 'error';
  responseTime?: number;
  errorMessage?: string;
  timestamp: Date;
}

export interface AlertRule {
  id: string;
  integrationId: string;
  type: 'uptime' | 'response_time' | 'sync_failure' | 'error_rate';
  threshold: number;
  enabled: boolean;
  recipients: string[];
  cooldownMinutes: number;
  lastTriggered?: Date;
}

export class IntegrationHealthMonitor {
  private supabase = createClient();
  private notificationService = new NotificationService();

  async performHealthCheck(integrationId: string): Promise<HealthCheckResult> {
    const integration = await this.getIntegration(integrationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    const startTime = Date.now();
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    let errorMessage: string | undefined;
    let responseTime: number | undefined;

    try {
      // Perform health check based on integration type
      const checkResult = await this.checkIntegrationHealth(integration);
      status = checkResult.success ? 'healthy' : 'error';
      errorMessage = checkResult.error;
      responseTime = Date.now() - startTime;

      // Store health check result
      await this.storeHealthCheckResult({
        integrationId,
        status,
        responseTime,
        errorMessage,
        timestamp: new Date(),
      });

      // Update integration health metrics
      await this.updateHealthMetrics(integrationId, status, responseTime);

      // Check alert rules
      await this.checkAlertRules(integrationId, status, responseTime);

      return {
        integrationId,
        status,
        responseTime,
        errorMessage,
        timestamp: new Date(),
      };
    } catch (error) {
      responseTime = Date.now() - startTime;
      errorMessage = error instanceof Error ? error.message : 'Health check failed';
      status = 'error';

      await this.storeHealthCheckResult({
        integrationId,
        status,
        responseTime,
        errorMessage,
        timestamp: new Date(),
      });

      await this.updateHealthMetrics(integrationId, status, responseTime);
      await this.checkAlertRules(integrationId, status, responseTime);

      return {
        integrationId,
        status,
        responseTime,
        errorMessage,
        timestamp: new Date(),
      };
    }
  }

  async getIntegrationHealth(integrationId: string): Promise<IntegrationHealth | null> {
    const { data, error } = await this.supabase
      .from('integration_health')
      .select('*')
      .eq('integration_id', integrationId)
      .single();

    if (error || !data) return null;

    return {
      integrationId: data.integration_id,
      status: data.status,
      lastCheck: new Date(data.last_check),
      responseTime: data.response_time,
      errorMessage: data.error_message,
      uptime: data.uptime,
      metrics: {
        successfulSyncs: data.successful_syncs,
        failedSyncs: data.failed_syncs,
        lastSyncDuration: data.last_sync_duration,
        avgSyncDuration: data.avg_sync_duration,
      },
    };
  }

  async listIntegrationHealth(institutionId: string): Promise<IntegrationHealth[]> {
    const { data, error } = await this.supabase
      .from('integration_health')
      .select(`
        *,
        institution_integrations!inner(institution_id)
      `)
      .eq('institution_integrations.institution_id', institutionId);

    if (error) {
      throw new Error(`Failed to list integration health: ${error.message}`);
    }

    return data.map(item => ({
      integrationId: item.integration_id,
      status: item.status,
      lastCheck: new Date(item.last_check),
      responseTime: item.response_time,
      errorMessage: item.error_message,
      uptime: item.uptime,
      metrics: {
        successfulSyncs: item.successful_syncs,
        failedSyncs: item.failed_syncs,
        lastSyncDuration: item.last_sync_duration,
        avgSyncDuration: item.avg_sync_duration,
      },
    }));
  }

  async createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    const { data, error } = await this.supabase
      .from('integration_alert_rules')
      .insert({
        integration_id: rule.integrationId,
        type: rule.type,
        threshold: rule.threshold,
        enabled: rule.enabled,
        recipients: rule.recipients,
        cooldown_minutes: rule.cooldownMinutes,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create alert rule: ${error.message}`);
    }

    return {
      id: data.id,
      integrationId: data.integration_id,
      type: data.type,
      threshold: data.threshold,
      enabled: data.enabled,
      recipients: data.recipients,
      cooldownMinutes: data.cooldown_minutes,
      lastTriggered: data.last_triggered ? new Date(data.last_triggered) : undefined,
    };
  }

  async updateAlertRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    const { data, error } = await this.supabase
      .from('integration_alert_rules')
      .update({
        type: updates.type,
        threshold: updates.threshold,
        enabled: updates.enabled,
        recipients: updates.recipients,
        cooldown_minutes: updates.cooldownMinutes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update alert rule: ${error.message}`);
    }

    return {
      id: data.id,
      integrationId: data.integration_id,
      type: data.type,
      threshold: data.threshold,
      enabled: data.enabled,
      recipients: data.recipients,
      cooldownMinutes: data.cooldown_minutes,
      lastTriggered: data.last_triggered ? new Date(data.last_triggered) : undefined,
    };
  }

  async deleteAlertRule(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('integration_alert_rules')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete alert rule: ${error.message}`);
    }
  }

  async listAlertRules(integrationId: string): Promise<AlertRule[]> {
    const { data, error } = await this.supabase
      .from('integration_alert_rules')
      .select('*')
      .eq('integration_id', integrationId);

    if (error) {
      throw new Error(`Failed to list alert rules: ${error.message}`);
    }

    return data.map(rule => ({
      id: rule.id,
      integrationId: rule.integration_id,
      type: rule.type,
      threshold: rule.threshold,
      enabled: rule.enabled,
      recipients: rule.recipients,
      cooldownMinutes: rule.cooldown_minutes,
      lastTriggered: rule.last_triggered ? new Date(rule.last_triggered) : undefined,
    }));
  }

  async scheduleHealthChecks(): Promise<void> {
    // Get all active integrations
    const { data: integrations, error } = await this.supabase
      .from('institution_integrations')
      .select('id')
      .eq('enabled', true)
      .eq('status', 'active');

    if (error) {
      console.error('Failed to get integrations for health checks:', error);
      return;
    }

    // Perform health checks for each integration
    const healthCheckPromises = integrations.map(integration =>
      this.performHealthCheck(integration.id).catch(error => {
        console.error(`Health check failed for integration ${integration.id}:`, error);
      })
    );

    await Promise.allSettled(healthCheckPromises);
  }

  async recordSyncResult(integrationId: string, syncJob: SyncJob): Promise<void> {
    const success = syncJob.status === 'completed';
    const duration = syncJob.completedAt && syncJob.startedAt 
      ? syncJob.completedAt.getTime() - syncJob.startedAt.getTime()
      : undefined;

    // Update health metrics
    const { data: currentHealth } = await this.supabase
      .from('integration_health')
      .select('*')
      .eq('integration_id', integrationId)
      .single();

    if (currentHealth) {
      const successfulSyncs = success 
        ? currentHealth.successful_syncs + 1 
        : currentHealth.successful_syncs;
      const failedSyncs = success 
        ? currentHealth.failed_syncs 
        : currentHealth.failed_syncs + 1;

      // Calculate average sync duration
      let avgSyncDuration = currentHealth.avg_sync_duration;
      if (duration && success) {
        const totalSyncs = successfulSyncs;
        avgSyncDuration = totalSyncs === 1 
          ? duration 
          : (avgSyncDuration * (totalSyncs - 1) + duration) / totalSyncs;
      }

      await this.supabase
        .from('integration_health')
        .update({
          successful_syncs: successfulSyncs,
          failed_syncs: failedSyncs,
          last_sync_duration: duration,
          avg_sync_duration: avgSyncDuration,
          updated_at: new Date().toISOString(),
        })
        .eq('integration_id', integrationId);
    }

    // Check sync failure alerts
    if (!success) {
      await this.checkSyncFailureAlerts(integrationId, syncJob);
    }
  }

  private async checkIntegrationHealth(integration: IntegrationConfig): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Use the same health check logic from IntegrationConfigManager
      const response = await fetch(integration.healthCheckUrl || `${integration.config.apiUrl}/health`, {
        method: 'GET',
        timeout: 10000,
      });

      if (response.ok) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: `Health check returned ${response.status}: ${response.statusText}` 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private async storeHealthCheckResult(result: HealthCheckResult): Promise<void> {
    await this.supabase
      .from('integration_health_checks')
      .insert({
        integration_id: result.integrationId,
        status: result.status,
        response_time: result.responseTime,
        error_message: result.errorMessage,
        checked_at: result.timestamp.toISOString(),
      });
  }

  private async updateHealthMetrics(
    integrationId: string, 
    status: 'healthy' | 'warning' | 'error',
    responseTime?: number
  ): Promise<void> {
    // Calculate uptime based on recent health checks
    const { data: recentChecks } = await this.supabase
      .from('integration_health_checks')
      .select('status')
      .eq('integration_id', integrationId)
      .gte('checked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .order('checked_at', { ascending: false })
      .limit(100);

    let uptime = 100;
    if (recentChecks && recentChecks.length > 0) {
      const healthyChecks = recentChecks.filter(check => check.status === 'healthy').length;
      uptime = (healthyChecks / recentChecks.length) * 100;
    }

    // Upsert health record
    await this.supabase
      .from('integration_health')
      .upsert({
        integration_id: integrationId,
        status,
        last_check: new Date().toISOString(),
        response_time: responseTime,
        uptime,
        updated_at: new Date().toISOString(),
      });
  }

  private async checkAlertRules(
    integrationId: string, 
    status: 'healthy' | 'warning' | 'error',
    responseTime?: number
  ): Promise<void> {
    const rules = await this.listAlertRules(integrationId);
    const activeRules = rules.filter(rule => rule.enabled);

    for (const rule of activeRules) {
      let shouldTrigger = false;
      let alertMessage = '';

      // Check if rule is in cooldown
      if (rule.lastTriggered) {
        const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownMinutes * 60 * 1000);
        if (new Date() < cooldownEnd) {
          continue;
        }
      }

      switch (rule.type) {
        case 'uptime':
          const health = await this.getIntegrationHealth(integrationId);
          if (health && health.uptime < rule.threshold) {
            shouldTrigger = true;
            alertMessage = `Integration uptime (${health.uptime.toFixed(2)}%) is below threshold (${rule.threshold}%)`;
          }
          break;

        case 'response_time':
          if (responseTime && responseTime > rule.threshold) {
            shouldTrigger = true;
            alertMessage = `Integration response time (${responseTime}ms) exceeds threshold (${rule.threshold}ms)`;
          }
          break;

        case 'error_rate':
          // Calculate error rate from recent checks
          const { data: recentChecks } = await this.supabase
            .from('integration_health_checks')
            .select('status')
            .eq('integration_id', integrationId)
            .gte('checked_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
            .limit(20);

          if (recentChecks && recentChecks.length > 0) {
            const errorChecks = recentChecks.filter(check => check.status === 'error').length;
            const errorRate = (errorChecks / recentChecks.length) * 100;
            
            if (errorRate > rule.threshold) {
              shouldTrigger = true;
              alertMessage = `Integration error rate (${errorRate.toFixed(2)}%) exceeds threshold (${rule.threshold}%)`;
            }
          }
          break;
      }

      if (shouldTrigger) {
        await this.triggerAlert(rule, alertMessage);
      }
    }
  }

  private async checkSyncFailureAlerts(integrationId: string, syncJob: SyncJob): Promise<void> {
    const rules = await this.listAlertRules(integrationId);
    const syncFailureRules = rules.filter(rule => rule.type === 'sync_failure' && rule.enabled);

    for (const rule of syncFailureRules) {
      // Check if rule is in cooldown
      if (rule.lastTriggered) {
        const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownMinutes * 60 * 1000);
        if (new Date() < cooldownEnd) {
          continue;
        }
      }

      const alertMessage = `Sync job failed: ${syncJob.result?.errors?.[0]?.message || 'Unknown error'}`;
      await this.triggerAlert(rule, alertMessage);
    }
  }

  private async triggerAlert(rule: AlertRule, message: string): Promise<void> {
    // Send notifications to recipients
    for (const recipient of rule.recipients) {
      await this.notificationService.sendNotification({
        userId: recipient,
        type: 'integration_alert',
        title: 'Integration Alert',
        message,
        priority: 'high',
        metadata: {
          integrationId: rule.integrationId,
          alertRuleId: rule.id,
          alertType: rule.type,
        },
      });
    }

    // Update last triggered timestamp
    await this.supabase
      .from('integration_alert_rules')
      .update({
        last_triggered: new Date().toISOString(),
      })
      .eq('id', rule.id);

    // Log alert
    await this.supabase
      .from('integration_alerts')
      .insert({
        integration_id: rule.integrationId,
        alert_rule_id: rule.id,
        message,
        triggered_at: new Date().toISOString(),
      });
  }

  private async getIntegration(id: string): Promise<IntegrationConfig | null> {
    const { data, error } = await this.supabase
      .from('institution_integrations')
      .select('*')
      .eq('id', id)
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
      healthCheckUrl: data.health_check_url,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      createdBy: data.created_by,
    };
  }
}