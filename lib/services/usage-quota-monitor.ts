import { createClient } from '@/lib/supabase/server';
import { NotificationService } from './notification-service';

export interface UsageQuota {
  institutionId: string;
  quotaType: 'users' | 'storage' | 'api_calls' | 'integrations' | 'classes';
  currentUsage: number;
  limit: number;
  unit: string;
  utilizationPercentage: number;
  status: 'normal' | 'warning' | 'critical' | 'exceeded';
  lastUpdated: Date;
}

export interface QuotaAlert {
  id: string;
  institutionId: string;
  quotaType: string;
  alertType: 'approaching_limit' | 'limit_exceeded' | 'usage_spike';
  threshold: number;
  currentUsage: number;
  limit: number;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  acknowledged: boolean;
  timestamp: Date;
}

export class UsageQuotaMonitor {
  private supabase = createClient();
  private notificationService = new NotificationService();
  
  // Warning thresholds
  private readonly WARNING_THRESHOLD = 0.8; // 80%
  private readonly CRITICAL_THRESHOLD = 0.95; // 95%

  async monitorAllQuotas(institutionId: string): Promise<UsageQuota[]> {
    const quotas: UsageQuota[] = [];

    // Monitor user quota
    const userQuota = await this.monitorUserQuota(institutionId);
    quotas.push(userQuota);

    // Monitor storage quota
    const storageQuota = await this.monitorStorageQuota(institutionId);
    quotas.push(storageQuota);

    // Monitor API calls quota
    const apiQuota = await this.monitorApiCallsQuota(institutionId);
    quotas.push(apiQuota);

    // Monitor integrations quota
    const integrationsQuota = await this.monitorIntegrationsQuota(institutionId);
    quotas.push(integrationsQuota);

    // Monitor classes quota
    const classesQuota = await this.monitorClassesQuota(institutionId);
    quotas.push(classesQuota);

    // Store quota data
    await this.storeQuotaData(quotas);

    // Check for alerts
    await this.checkQuotaAlerts(quotas);

    return quotas;
  }

  private async monitorUserQuota(institutionId: string): Promise<UsageQuota> {
    // Get institution subscription info
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('subscription')
      .eq('id', institutionId)
      .single();

    const subscription = institution?.subscription || {};
    const userLimit = subscription.userLimit || 100; // Default limit

    // Count current users
    const { data: users } = await this.supabase
      .from('users')
      .select('id', { count: 'exact' })
      .eq('institution_id', institutionId)
      .eq('status', 'active');

    const currentUsage = users?.length || 0;
    const utilizationPercentage = (currentUsage / userLimit) * 100;

    let status: UsageQuota['status'] = 'normal';
    if (utilizationPercentage >= 100) {
      status = 'exceeded';
    } else if (utilizationPercentage >= this.CRITICAL_THRESHOLD * 100) {
      status = 'critical';
    } else if (utilizationPercentage >= this.WARNING_THRESHOLD * 100) {
      status = 'warning';
    }

    return {
      institutionId,
      quotaType: 'users',
      currentUsage,
      limit: userLimit,
      unit: 'users',
      utilizationPercentage,
      status,
      lastUpdated: new Date()
    };
  }

  private async monitorStorageQuota(institutionId: string): Promise<UsageQuota> {
    // Get institution subscription info
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('subscription')
      .eq('id', institutionId)
      .single();

    const subscription = institution?.subscription || {};
    const storageLimit = (subscription.storageLimit || 10) * 1024 * 1024 * 1024; // Convert GB to bytes

    // Calculate current storage usage
    const { data: storageUsage } = await this.supabase
      .from('file_storage_usage')
      .select('total_bytes')
      .eq('institution_id', institutionId)
      .single();

    const currentUsage = storageUsage?.total_bytes || 0;
    const utilizationPercentage = (currentUsage / storageLimit) * 100;

    let status: UsageQuota['status'] = 'normal';
    if (utilizationPercentage >= 100) {
      status = 'exceeded';
    } else if (utilizationPercentage >= this.CRITICAL_THRESHOLD * 100) {
      status = 'critical';
    } else if (utilizationPercentage >= this.WARNING_THRESHOLD * 100) {
      status = 'warning';
    }

    return {
      institutionId,
      quotaType: 'storage',
      currentUsage: Math.round(currentUsage / (1024 * 1024 * 1024) * 100) / 100, // Convert to GB
      limit: subscription.storageLimit || 10,
      unit: 'GB',
      utilizationPercentage,
      status,
      lastUpdated: new Date()
    };
  }

  private async monitorApiCallsQuota(institutionId: string): Promise<UsageQuota> {
    // Get institution subscription info
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('subscription')
      .eq('id', institutionId)
      .single();

    const subscription = institution?.subscription || {};
    const apiLimit = subscription.apiCallsLimit || 10000; // Default limit per month

    // Count API calls in current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: apiCalls } = await this.supabase
      .from('api_usage_logs')
      .select('id', { count: 'exact' })
      .eq('institution_id', institutionId)
      .gte('created_at', startOfMonth.toISOString());

    const currentUsage = apiCalls?.length || 0;
    const utilizationPercentage = (currentUsage / apiLimit) * 100;

    let status: UsageQuota['status'] = 'normal';
    if (utilizationPercentage >= 100) {
      status = 'exceeded';
    } else if (utilizationPercentage >= this.CRITICAL_THRESHOLD * 100) {
      status = 'critical';
    } else if (utilizationPercentage >= this.WARNING_THRESHOLD * 100) {
      status = 'warning';
    }

    return {
      institutionId,
      quotaType: 'api_calls',
      currentUsage,
      limit: apiLimit,
      unit: 'calls/month',
      utilizationPercentage,
      status,
      lastUpdated: new Date()
    };
  }

  private async monitorIntegrationsQuota(institutionId: string): Promise<UsageQuota> {
    // Get institution subscription info
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('subscription')
      .eq('id', institutionId)
      .single();

    const subscription = institution?.subscription || {};
    const integrationsLimit = subscription.integrationsLimit || 5; // Default limit

    // Count active integrations
    const { data: integrations } = await this.supabase
      .from('institution_integrations')
      .select('id', { count: 'exact' })
      .eq('institution_id', institutionId)
      .eq('enabled', true);

    const currentUsage = integrations?.length || 0;
    const utilizationPercentage = (currentUsage / integrationsLimit) * 100;

    let status: UsageQuota['status'] = 'normal';
    if (utilizationPercentage >= 100) {
      status = 'exceeded';
    } else if (utilizationPercentage >= this.CRITICAL_THRESHOLD * 100) {
      status = 'critical';
    } else if (utilizationPercentage >= this.WARNING_THRESHOLD * 100) {
      status = 'warning';
    }

    return {
      institutionId,
      quotaType: 'integrations',
      currentUsage,
      limit: integrationsLimit,
      unit: 'integrations',
      utilizationPercentage,
      status,
      lastUpdated: new Date()
    };
  }

  private async monitorClassesQuota(institutionId: string): Promise<UsageQuota> {
    // Get institution subscription info
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('subscription')
      .eq('id', institutionId)
      .single();

    const subscription = institution?.subscription || {};
    const classesLimit = subscription.classesLimit || 50; // Default limit

    // Count active classes
    const { data: classes } = await this.supabase
      .from('classes')
      .select('id', { count: 'exact' })
      .eq('institution_id', institutionId)
      .eq('status', 'active');

    const currentUsage = classes?.length || 0;
    const utilizationPercentage = (currentUsage / classesLimit) * 100;

    let status: UsageQuota['status'] = 'normal';
    if (utilizationPercentage >= 100) {
      status = 'exceeded';
    } else if (utilizationPercentage >= this.CRITICAL_THRESHOLD * 100) {
      status = 'critical';
    } else if (utilizationPercentage >= this.WARNING_THRESHOLD * 100) {
      status = 'warning';
    }

    return {
      institutionId,
      quotaType: 'classes',
      currentUsage,
      limit: classesLimit,
      unit: 'classes',
      utilizationPercentage,
      status,
      lastUpdated: new Date()
    };
  }

  private async storeQuotaData(quotas: UsageQuota[]): Promise<void> {
    const quotaData = quotas.map(quota => ({
      institution_id: quota.institutionId,
      quota_type: quota.quotaType,
      current_usage: quota.currentUsage,
      quota_limit: quota.limit,
      unit: quota.unit,
      utilization_percentage: quota.utilizationPercentage,
      status: quota.status,
      recorded_at: quota.lastUpdated.toISOString()
    }));

    await this.supabase
      .from('usage_quota_logs')
      .insert(quotaData);
  }

  private async checkQuotaAlerts(quotas: UsageQuota[]): Promise<void> {
    for (const quota of quotas) {
      if (quota.status === 'warning' || quota.status === 'critical' || quota.status === 'exceeded') {
        await this.createQuotaAlert(quota);
      }
    }
  }

  private async createQuotaAlert(quota: UsageQuota): Promise<void> {
    const alertType = quota.status === 'exceeded' ? 'limit_exceeded' : 'approaching_limit';
    const severity = this.getAlertSeverity(quota.status);
    const message = this.generateQuotaAlertMessage(quota);

    const alert: QuotaAlert = {
      id: `quota_alert_${quota.institutionId}_${quota.quotaType}_${Date.now()}`,
      institutionId: quota.institutionId,
      quotaType: quota.quotaType,
      alertType,
      threshold: quota.status === 'exceeded' ? 100 : 
                 quota.status === 'critical' ? this.CRITICAL_THRESHOLD * 100 : 
                 this.WARNING_THRESHOLD * 100,
      currentUsage: quota.currentUsage,
      limit: quota.limit,
      message,
      severity,
      acknowledged: false,
      timestamp: new Date()
    };

    // Check if similar alert already exists and is not acknowledged
    const { data: existingAlert } = await this.supabase
      .from('usage_quota_alerts')
      .select('id')
      .eq('institution_id', alert.institutionId)
      .eq('quota_type', alert.quotaType)
      .eq('acknowledged', false)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Within last 24 hours
      .single();

    if (!existingAlert) {
      // Store alert
      await this.supabase
        .from('usage_quota_alerts')
        .insert({
          institution_id: alert.institutionId,
          quota_type: alert.quotaType,
          alert_type: alert.alertType,
          threshold: alert.threshold,
          current_usage: alert.currentUsage,
          quota_limit: alert.limit,
          message: alert.message,
          severity: alert.severity,
          acknowledged: alert.acknowledged
        });

      // Send notification
      await this.sendQuotaAlert(alert);
    }
  }

  private getAlertSeverity(status: UsageQuota['status']): QuotaAlert['severity'] {
    switch (status) {
      case 'exceeded':
        return 'critical';
      case 'critical':
        return 'high';
      case 'warning':
        return 'medium';
      default:
        return 'low';
    }
  }

  private generateQuotaAlertMessage(quota: UsageQuota): string {
    const percentage = quota.utilizationPercentage.toFixed(1);
    const quotaTypeDisplay = quota.quotaType.replace('_', ' ').toUpperCase();

    if (quota.status === 'exceeded') {
      return `${quotaTypeDisplay} quota exceeded: ${quota.currentUsage}/${quota.limit} ${quota.unit} (${percentage}%). Immediate action required.`;
    } else if (quota.status === 'critical') {
      return `${quotaTypeDisplay} quota critically high: ${quota.currentUsage}/${quota.limit} ${quota.unit} (${percentage}%). Consider upgrading your plan.`;
    } else {
      return `${quotaTypeDisplay} quota warning: ${quota.currentUsage}/${quota.limit} ${quota.unit} (${percentage}%). Monitor usage closely.`;
    }
  }

  private async sendQuotaAlert(alert: QuotaAlert): Promise<void> {
    // Get institution admins and billing contacts
    const { data: admins } = await this.supabase
      .from('users')
      .select('id, email')
      .eq('institution_id', alert.institutionId)
      .in('role', ['institution_admin', 'billing_admin']);

    if (admins) {
      for (const admin of admins) {
        await this.notificationService.sendNotification({
          userId: admin.id,
          type: 'quota_alert',
          title: `Usage Quota Alert - ${alert.severity.toUpperCase()}`,
          message: alert.message,
          metadata: {
            alertId: alert.id,
            quotaType: alert.quotaType,
            currentUsage: alert.currentUsage,
            limit: alert.limit,
            severity: alert.severity
          }
        });
      }
    }
  }

  async acknowledgeQuotaAlert(alertId: string, userId: string): Promise<void> {
    await this.supabase
      .from('usage_quota_alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId
      })
      .eq('id', alertId);
  }

  async getUsageSummary(institutionId: string): Promise<{
    quotas: UsageQuota[];
    totalAlerts: number;
    criticalAlerts: number;
    recommendations: string[];
  }> {
    const quotas = await this.monitorAllQuotas(institutionId);
    
    const { data: alerts } = await this.supabase
      .from('usage_quota_alerts')
      .select('severity')
      .eq('institution_id', institutionId)
      .eq('acknowledged', false);

    const totalAlerts = alerts?.length || 0;
    const criticalAlerts = alerts?.filter(alert => alert.severity === 'critical').length || 0;

    const recommendations = this.generateRecommendations(quotas);

    return {
      quotas,
      totalAlerts,
      criticalAlerts,
      recommendations
    };
  }

  private generateRecommendations(quotas: UsageQuota[]): string[] {
    const recommendations: string[] = [];

    for (const quota of quotas) {
      if (quota.status === 'exceeded') {
        recommendations.push(`Upgrade your ${quota.quotaType} limit immediately to avoid service disruption`);
      } else if (quota.status === 'critical') {
        recommendations.push(`Consider upgrading your ${quota.quotaType} limit before reaching the maximum`);
      } else if (quota.status === 'warning') {
        recommendations.push(`Monitor ${quota.quotaType} usage closely and plan for potential upgrade`);
      }
    }

    return recommendations;
  }

  async predictUsageTrend(institutionId: string, quotaType: string, days: number = 30): Promise<{
    currentUsage: number;
    predictedUsage: number;
    trendDirection: 'increasing' | 'decreasing' | 'stable';
    daysToLimit?: number;
  }> {
    const { data: historicalData } = await this.supabase
      .from('usage_quota_logs')
      .select('current_usage, recorded_at')
      .eq('institution_id', institutionId)
      .eq('quota_type', quotaType)
      .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('recorded_at', { ascending: true });

    if (!historicalData || historicalData.length < 2) {
      return {
        currentUsage: 0,
        predictedUsage: 0,
        trendDirection: 'stable'
      };
    }

    const currentUsage = historicalData[historicalData.length - 1].current_usage;
    const oldestUsage = historicalData[0].current_usage;
    const usageChange = currentUsage - oldestUsage;
    const dailyChange = usageChange / days;

    let trendDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(dailyChange) > 0.1) {
      trendDirection = dailyChange > 0 ? 'increasing' : 'decreasing';
    }

    const predictedUsage = Math.max(0, currentUsage + (dailyChange * 30)); // 30-day prediction

    // Calculate days to limit if trend is increasing
    let daysToLimit: number | undefined;
    if (trendDirection === 'increasing' && dailyChange > 0) {
      const quota = await this.monitorAllQuotas(institutionId);
      const currentQuota = quota.find(q => q.quotaType === quotaType);
      if (currentQuota) {
        const remainingCapacity = currentQuota.limit - currentUsage;
        daysToLimit = Math.ceil(remainingCapacity / dailyChange);
      }
    }

    return {
      currentUsage,
      predictedUsage,
      trendDirection,
      daysToLimit
    };
  }
}