import { createClient } from '@/lib/supabase/server';
import { NotificationService } from './notification-service';

export interface HealthMetric {
  id: string;
  institutionId: string;
  metricType: 'user_activity' | 'login_rate' | 'content_creation' | 'engagement' | 'error_rate';
  value: number;
  threshold: number;
  status: 'healthy' | 'warning' | 'critical';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface HealthAlert {
  id: string;
  institutionId: string;
  alertType: 'low_activity' | 'high_error_rate' | 'login_issues' | 'performance_degradation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  triggered: boolean;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export class InstitutionHealthMonitor {
  private supabase = createClient();
  private notificationService = new NotificationService();

  async collectHealthMetrics(institutionId: string): Promise<HealthMetric[]> {
    const metrics: HealthMetric[] = [];
    
    // Collect user activity metrics
    const userActivity = await this.getUserActivityMetric(institutionId);
    metrics.push(userActivity);

    // Collect login rate metrics
    const loginRate = await this.getLoginRateMetric(institutionId);
    metrics.push(loginRate);

    // Collect content creation metrics
    const contentCreation = await this.getContentCreationMetric(institutionId);
    metrics.push(contentCreation);

    // Collect engagement metrics
    const engagement = await this.getEngagementMetric(institutionId);
    metrics.push(engagement);

    // Collect error rate metrics
    const errorRate = await this.getErrorRateMetric(institutionId);
    metrics.push(errorRate);

    // Store metrics in database
    await this.storeMetrics(metrics);

    return metrics;
  }

  private async getUserActivityMetric(institutionId: string): Promise<HealthMetric> {
    const { data: activeUsers } = await this.supabase
      .from('users')
      .select('id')
      .eq('institution_id', institutionId)
      .gte('last_active_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const { data: totalUsers } = await this.supabase
      .from('users')
      .select('id', { count: 'exact' })
      .eq('institution_id', institutionId);

    const activityRate = totalUsers?.length ? (activeUsers?.length || 0) / totalUsers.length : 0;
    const threshold = 0.3; // 30% activity rate threshold

    return {
      id: `activity_${institutionId}_${Date.now()}`,
      institutionId,
      metricType: 'user_activity',
      value: activityRate,
      threshold,
      status: activityRate >= threshold ? 'healthy' : activityRate >= threshold * 0.7 ? 'warning' : 'critical',
      timestamp: new Date(),
      metadata: {
        activeUsers: activeUsers?.length || 0,
        totalUsers: totalUsers?.length || 0
      }
    };
  }

  private async getLoginRateMetric(institutionId: string): Promise<HealthMetric> {
    const { data: logins } = await this.supabase
      .from('auth_logs')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('event_type', 'login')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const loginCount = logins?.length || 0;
    const threshold = 10; // Minimum 10 logins per day

    return {
      id: `login_${institutionId}_${Date.now()}`,
      institutionId,
      metricType: 'login_rate',
      value: loginCount,
      threshold,
      status: loginCount >= threshold ? 'healthy' : loginCount >= threshold * 0.5 ? 'warning' : 'critical',
      timestamp: new Date(),
      metadata: { loginCount }
    };
  }

  private async getContentCreationMetric(institutionId: string): Promise<HealthMetric> {
    const { data: content } = await this.supabase
      .from('classes')
      .select('id')
      .eq('institution_id', institutionId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const contentCount = content?.length || 0;
    const threshold = 5; // Minimum 5 new classes per week

    return {
      id: `content_${institutionId}_${Date.now()}`,
      institutionId,
      metricType: 'content_creation',
      value: contentCount,
      threshold,
      status: contentCount >= threshold ? 'healthy' : contentCount >= threshold * 0.5 ? 'warning' : 'critical',
      timestamp: new Date(),
      metadata: { contentCount }
    };
  }

  private async getEngagementMetric(institutionId: string): Promise<HealthMetric> {
    const { data: enrollments } = await this.supabase
      .from('enrollments')
      .select('id')
      .eq('institution_id', institutionId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const engagementCount = enrollments?.length || 0;
    const threshold = 20; // Minimum 20 enrollments per week

    return {
      id: `engagement_${institutionId}_${Date.now()}`,
      institutionId,
      metricType: 'engagement',
      value: engagementCount,
      threshold,
      status: engagementCount >= threshold ? 'healthy' : engagementCount >= threshold * 0.5 ? 'warning' : 'critical',
      timestamp: new Date(),
      metadata: { engagementCount }
    };
  }

  private async getErrorRateMetric(institutionId: string): Promise<HealthMetric> {
    const { data: errors } = await this.supabase
      .from('error_logs')
      .select('id')
      .eq('institution_id', institutionId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const errorCount = errors?.length || 0;
    const threshold = 50; // Maximum 50 errors per day

    return {
      id: `error_${institutionId}_${Date.now()}`,
      institutionId,
      metricType: 'error_rate',
      value: errorCount,
      threshold,
      status: errorCount <= threshold ? 'healthy' : errorCount <= threshold * 1.5 ? 'warning' : 'critical',
      timestamp: new Date(),
      metadata: { errorCount }
    };
  }

  private async storeMetrics(metrics: HealthMetric[]): Promise<void> {
    const metricsData = metrics.map(metric => ({
      institution_id: metric.institutionId,
      metric_name: metric.metricType,
      metric_value: metric.value,
      threshold_value: metric.threshold,
      status: metric.status,
      metadata: metric.metadata || {},
      recorded_at: metric.timestamp.toISOString()
    }));

    await this.supabase
      .from('institution_health_metrics')
      .insert(metricsData);
  }

  async checkHealthAlerts(institutionId: string): Promise<HealthAlert[]> {
    const metrics = await this.collectHealthMetrics(institutionId);
    const alerts: HealthAlert[] = [];

    for (const metric of metrics) {
      if (metric.status === 'warning' || metric.status === 'critical') {
        const alert = await this.createHealthAlert(metric);
        alerts.push(alert);
      }
    }

    return alerts;
  }

  private async createHealthAlert(metric: HealthMetric): Promise<HealthAlert> {
    const alertType = this.getAlertType(metric.metricType);
    const severity = metric.status === 'critical' ? 'critical' : 'medium';
    const message = this.generateAlertMessage(metric);

    const alert: HealthAlert = {
      id: `alert_${metric.institutionId}_${Date.now()}`,
      institutionId: metric.institutionId,
      alertType,
      severity,
      message,
      triggered: true,
      metadata: {
        metricId: metric.id,
        metricType: metric.metricType,
        value: metric.value,
        threshold: metric.threshold
      }
    };

    // Store alert in database
    await this.supabase
      .from('institution_health_alerts')
      .insert({
        institution_id: alert.institutionId,
        alert_type: alert.alertType,
        severity: alert.severity,
        message: alert.message,
        triggered: alert.triggered,
        metadata: alert.metadata
      });

    // Send notification
    await this.sendHealthAlert(alert);

    return alert;
  }

  private getAlertType(metricType: string): HealthAlert['alertType'] {
    switch (metricType) {
      case 'user_activity':
      case 'engagement':
        return 'low_activity';
      case 'error_rate':
        return 'high_error_rate';
      case 'login_rate':
        return 'login_issues';
      default:
        return 'performance_degradation';
    }
  }

  private generateAlertMessage(metric: HealthMetric): string {
    switch (metric.metricType) {
      case 'user_activity':
        return `Low user activity detected: ${(metric.value * 100).toFixed(1)}% activity rate (threshold: ${(metric.threshold * 100).toFixed(1)}%)`;
      case 'login_rate':
        return `Low login rate detected: ${metric.value} logins in 24h (threshold: ${metric.threshold})`;
      case 'content_creation':
        return `Low content creation: ${metric.value} new classes in 7 days (threshold: ${metric.threshold})`;
      case 'engagement':
        return `Low engagement: ${metric.value} enrollments in 7 days (threshold: ${metric.threshold})`;
      case 'error_rate':
        return `High error rate: ${metric.value} errors in 24h (threshold: ${metric.threshold})`;
      default:
        return `Health metric ${metric.metricType} is ${metric.status}`;
    }
  }

  private async sendHealthAlert(alert: HealthAlert): Promise<void> {
    // Get institution admins
    const { data: admins } = await this.supabase
      .from('users')
      .select('id, email')
      .eq('institution_id', alert.institutionId)
      .eq('role', 'institution_admin');

    if (admins) {
      for (const admin of admins) {
        await this.notificationService.sendNotification({
          userId: admin.id,
          type: 'health_alert',
          title: `Institution Health Alert - ${alert.severity.toUpperCase()}`,
          message: alert.message,
          metadata: {
            alertId: alert.id,
            institutionId: alert.institutionId,
            severity: alert.severity
          }
        });
      }
    }
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    await this.supabase
      .from('institution_health_alerts')
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId
      })
      .eq('id', alertId);
  }

  async resolveAlert(alertId: string, userId: string): Promise<void> {
    await this.supabase
      .from('institution_health_alerts')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        triggered: false
      })
      .eq('id', alertId);
  }

  async getHealthStatus(institutionId: string): Promise<{
    overall: 'healthy' | 'warning' | 'critical';
    metrics: HealthMetric[];
    activeAlerts: number;
  }> {
    const metrics = await this.collectHealthMetrics(institutionId);
    
    const { data: activeAlerts } = await this.supabase
      .from('institution_health_alerts')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('triggered', true)
      .is('resolved_at', null);

    const criticalCount = metrics.filter(m => m.status === 'critical').length;
    const warningCount = metrics.filter(m => m.status === 'warning').length;

    let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalCount > 0) {
      overall = 'critical';
    } else if (warningCount > 0) {
      overall = 'warning';
    }

    return {
      overall,
      metrics,
      activeAlerts: activeAlerts?.length || 0
    };
  }
}