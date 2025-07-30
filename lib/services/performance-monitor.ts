import { createClient } from '@/lib/supabase/server';
import { NotificationService } from './notification-service';

export interface PerformanceMetric {
  id: string;
  institutionId: string;
  metricType: 'response_time' | 'throughput' | 'error_rate' | 'cpu_usage' | 'memory_usage' | 'database_performance';
  value: number;
  unit: string;
  timestamp: Date;
  endpoint?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceAnomaly {
  id: string;
  institutionId: string;
  metricType: string;
  anomalyType: 'spike' | 'drop' | 'trend_change' | 'threshold_breach';
  severity: 'low' | 'medium' | 'high' | 'critical';
  currentValue: number;
  expectedValue: number;
  deviation: number;
  message: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: Record<string, any>;
}

export interface PerformanceBaseline {
  metricType: string;
  institutionId: string;
  average: number;
  median: number;
  p95: number;
  p99: number;
  standardDeviation: number;
  sampleSize: number;
  lastUpdated: Date;
}

export class PerformanceMonitor {
  private supabase = createClient();
  private notificationService = new NotificationService();
  
  // Anomaly detection thresholds
  private readonly SPIKE_THRESHOLD = 3; // 3 standard deviations
  private readonly TREND_WINDOW = 24; // hours
  private readonly MIN_SAMPLES = 10;

  async collectPerformanceMetrics(institutionId: string): Promise<PerformanceMetric[]> {
    const metrics: PerformanceMetric[] = [];

    // Collect response time metrics
    const responseTimeMetrics = await this.collectResponseTimeMetrics(institutionId);
    metrics.push(...responseTimeMetrics);

    // Collect throughput metrics
    const throughputMetrics = await this.collectThroughputMetrics(institutionId);
    metrics.push(...throughputMetrics);

    // Collect error rate metrics
    const errorRateMetrics = await this.collectErrorRateMetrics(institutionId);
    metrics.push(...errorRateMetrics);

    // Collect database performance metrics
    const dbMetrics = await this.collectDatabaseMetrics(institutionId);
    metrics.push(...dbMetrics);

    // Store metrics
    await this.storeMetrics(metrics);

    return metrics;
  }

  private async collectResponseTimeMetrics(institutionId: string): Promise<PerformanceMetric[]> {
    const { data: apiLogs } = await this.supabase
      .from('api_usage_logs')
      .select('endpoint, response_time, created_at')
      .eq('institution_id', institutionId)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
      .not('response_time', 'is', null);

    if (!apiLogs) return [];

    const metrics: PerformanceMetric[] = [];
    const endpointGroups = this.groupByEndpoint(apiLogs);

    for (const [endpoint, logs] of Object.entries(endpointGroups)) {
      const avgResponseTime = logs.reduce((sum, log) => sum + log.response_time, 0) / logs.length;
      
      metrics.push({
        id: `response_time_${institutionId}_${endpoint}_${Date.now()}`,
        institutionId,
        metricType: 'response_time',
        value: avgResponseTime,
        unit: 'ms',
        timestamp: new Date(),
        endpoint,
        metadata: {
          sampleSize: logs.length,
          minResponseTime: Math.min(...logs.map(l => l.response_time)),
          maxResponseTime: Math.max(...logs.map(l => l.response_time))
        }
      });
    }

    return metrics;
  }

  private async collectThroughputMetrics(institutionId: string): Promise<PerformanceMetric[]> {
    const { data: apiLogs } = await this.supabase
      .from('api_usage_logs')
      .select('endpoint, created_at')
      .eq('institution_id', institutionId)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

    if (!apiLogs) return [];

    const metrics: PerformanceMetric[] = [];
    const endpointGroups = this.groupByEndpoint(apiLogs);

    for (const [endpoint, logs] of Object.entries(endpointGroups)) {
      const requestsPerMinute = logs.length / 60; // Convert to requests per minute
      
      metrics.push({
        id: `throughput_${institutionId}_${endpoint}_${Date.now()}`,
        institutionId,
        metricType: 'throughput',
        value: requestsPerMinute,
        unit: 'requests/min',
        timestamp: new Date(),
        endpoint,
        metadata: {
          totalRequests: logs.length,
          timeWindow: '1 hour'
        }
      });
    }

    return metrics;
  }

  private async collectErrorRateMetrics(institutionId: string): Promise<PerformanceMetric[]> {
    const { data: apiLogs } = await this.supabase
      .from('api_usage_logs')
      .select('endpoint, status_code, created_at')
      .eq('institution_id', institutionId)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

    if (!apiLogs) return [];

    const metrics: PerformanceMetric[] = [];
    const endpointGroups = this.groupByEndpoint(apiLogs);

    for (const [endpoint, logs] of Object.entries(endpointGroups)) {
      const errorCount = logs.filter(log => log.status_code >= 400).length;
      const errorRate = (errorCount / logs.length) * 100;
      
      metrics.push({
        id: `error_rate_${institutionId}_${endpoint}_${Date.now()}`,
        institutionId,
        metricType: 'error_rate',
        value: errorRate,
        unit: 'percentage',
        timestamp: new Date(),
        endpoint,
        metadata: {
          totalRequests: logs.length,
          errorCount,
          successCount: logs.length - errorCount
        }
      });
    }

    return metrics;
  }

  private async collectDatabaseMetrics(institutionId: string): Promise<PerformanceMetric[]> {
    // This would typically collect from database monitoring tools
    // For now, we'll simulate some database metrics
    const metrics: PerformanceMetric[] = [];

    // Simulate query performance
    const avgQueryTime = Math.random() * 100 + 10; // 10-110ms
    metrics.push({
      id: `db_performance_${institutionId}_${Date.now()}`,
      institutionId,
      metricType: 'database_performance',
      value: avgQueryTime,
      unit: 'ms',
      timestamp: new Date(),
      metadata: {
        metricName: 'average_query_time',
        connectionPool: 'active'
      }
    });

    return metrics;
  }

  private groupByEndpoint(logs: any[]): Record<string, any[]> {
    return logs.reduce((groups, log) => {
      const endpoint = log.endpoint || 'unknown';
      if (!groups[endpoint]) {
        groups[endpoint] = [];
      }
      groups[endpoint].push(log);
      return groups;
    }, {});
  }

  private async storeMetrics(metrics: PerformanceMetric[]): Promise<void> {
    const metricsData = metrics.map(metric => ({
      institution_id: metric.institutionId,
      metric_type: metric.metricType,
      value: metric.value,
      unit: metric.unit,
      endpoint: metric.endpoint,
      metadata: metric.metadata || {},
      recorded_at: metric.timestamp.toISOString()
    }));

    await this.supabase
      .from('performance_metrics')
      .insert(metricsData);
  }

  async detectAnomalies(institutionId: string): Promise<PerformanceAnomaly[]> {
    const anomalies: PerformanceAnomaly[] = [];
    const metricTypes = ['response_time', 'throughput', 'error_rate', 'database_performance'];

    for (const metricType of metricTypes) {
      const baseline = await this.getPerformanceBaseline(institutionId, metricType);
      if (!baseline) continue;

      const recentMetrics = await this.getRecentMetrics(institutionId, metricType, 1); // Last hour
      
      for (const metric of recentMetrics) {
        const anomaly = this.detectMetricAnomaly(metric, baseline);
        if (anomaly) {
          anomalies.push(anomaly);
        }
      }
    }

    // Store and notify about anomalies
    for (const anomaly of anomalies) {
      await this.storeAnomaly(anomaly);
      await this.sendAnomalyAlert(anomaly);
    }

    return anomalies;
  }

  private async getPerformanceBaseline(institutionId: string, metricType: string): Promise<PerformanceBaseline | null> {
    const { data: historicalMetrics } = await this.supabase
      .from('performance_metrics')
      .select('value')
      .eq('institution_id', institutionId)
      .eq('metric_type', metricType)
      .gte('recorded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
      .order('recorded_at', { ascending: false });

    if (!historicalMetrics || historicalMetrics.length < this.MIN_SAMPLES) {
      return null;
    }

    const values = historicalMetrics.map(m => m.value).sort((a, b) => a - b);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const median = values[Math.floor(values.length / 2)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      metricType,
      institutionId,
      average,
      median,
      p95,
      p99,
      standardDeviation,
      sampleSize: values.length,
      lastUpdated: new Date()
    };
  }

  private async getRecentMetrics(institutionId: string, metricType: string, hours: number): Promise<PerformanceMetric[]> {
    const { data: metrics } = await this.supabase
      .from('performance_metrics')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('metric_type', metricType)
      .gte('recorded_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
      .order('recorded_at', { ascending: false });

    if (!metrics) return [];

    return metrics.map(m => ({
      id: m.id,
      institutionId: m.institution_id,
      metricType: m.metric_type,
      value: m.value,
      unit: m.unit,
      timestamp: new Date(m.recorded_at),
      endpoint: m.endpoint,
      metadata: m.metadata
    }));
  }

  private detectMetricAnomaly(metric: PerformanceMetric, baseline: PerformanceBaseline): PerformanceAnomaly | null {
    const deviation = Math.abs(metric.value - baseline.average) / baseline.standardDeviation;
    
    if (deviation < this.SPIKE_THRESHOLD) {
      return null; // Not anomalous
    }

    let anomalyType: PerformanceAnomaly['anomalyType'] = 'spike';
    let severity: PerformanceAnomaly['severity'] = 'low';

    // Determine anomaly type
    if (metric.value > baseline.average) {
      anomalyType = metric.metricType === 'error_rate' ? 'spike' : 'spike';
    } else {
      anomalyType = metric.metricType === 'throughput' ? 'drop' : 'drop';
    }

    // Determine severity
    if (deviation > 5) {
      severity = 'critical';
    } else if (deviation > 4) {
      severity = 'high';
    } else if (deviation > 3) {
      severity = 'medium';
    }

    const message = this.generateAnomalyMessage(metric, baseline, anomalyType, deviation);

    return {
      id: `anomaly_${metric.institutionId}_${metric.metricType}_${Date.now()}`,
      institutionId: metric.institutionId,
      metricType: metric.metricType,
      anomalyType,
      severity,
      currentValue: metric.value,
      expectedValue: baseline.average,
      deviation,
      message,
      timestamp: new Date(),
      resolved: false,
      metadata: {
        endpoint: metric.endpoint,
        baseline: {
          average: baseline.average,
          standardDeviation: baseline.standardDeviation,
          sampleSize: baseline.sampleSize
        }
      }
    };
  }

  private generateAnomalyMessage(
    metric: PerformanceMetric, 
    baseline: PerformanceBaseline, 
    anomalyType: string, 
    deviation: number
  ): string {
    const metricName = metric.metricType.replace('_', ' ').toUpperCase();
    const endpointInfo = metric.endpoint ? ` for ${metric.endpoint}` : '';
    const deviationText = `${deviation.toFixed(1)} standard deviations`;

    switch (anomalyType) {
      case 'spike':
        return `${metricName} spike detected${endpointInfo}: ${metric.value}${metric.unit} (expected: ${baseline.average.toFixed(2)}${metric.unit}, ${deviationText} above normal)`;
      case 'drop':
        return `${metricName} drop detected${endpointInfo}: ${metric.value}${metric.unit} (expected: ${baseline.average.toFixed(2)}${metric.unit}, ${deviationText} below normal)`;
      default:
        return `${metricName} anomaly detected${endpointInfo}: ${metric.value}${metric.unit} (${deviationText} from baseline)`;
    }
  }

  private async storeAnomaly(anomaly: PerformanceAnomaly): Promise<void> {
    await this.supabase
      .from('performance_anomalies')
      .insert({
        institution_id: anomaly.institutionId,
        metric_type: anomaly.metricType,
        anomaly_type: anomaly.anomalyType,
        severity: anomaly.severity,
        current_value: anomaly.currentValue,
        expected_value: anomaly.expectedValue,
        deviation: anomaly.deviation,
        message: anomaly.message,
        resolved: anomaly.resolved,
        metadata: anomaly.metadata
      });
  }

  private async sendAnomalyAlert(anomaly: PerformanceAnomaly): Promise<void> {
    // Only send alerts for medium severity and above
    if (anomaly.severity === 'low') return;

    // Get institution admins and technical contacts
    const { data: admins } = await this.supabase
      .from('users')
      .select('id, email')
      .eq('institution_id', anomaly.institutionId)
      .in('role', ['institution_admin', 'technical_admin']);

    if (admins) {
      for (const admin of admins) {
        await this.notificationService.sendNotification({
          userId: admin.id,
          type: 'performance_anomaly',
          title: `Performance Anomaly - ${anomaly.severity.toUpperCase()}`,
          message: anomaly.message,
          metadata: {
            anomalyId: anomaly.id,
            metricType: anomaly.metricType,
            severity: anomaly.severity,
            currentValue: anomaly.currentValue,
            expectedValue: anomaly.expectedValue
          }
        });
      }
    }
  }

  async resolveAnomaly(anomalyId: string, userId: string): Promise<void> {
    await this.supabase
      .from('performance_anomalies')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId
      })
      .eq('id', anomalyId);
  }

  async getPerformanceSummary(institutionId: string): Promise<{
    currentMetrics: PerformanceMetric[];
    activeAnomalies: number;
    performanceScore: number;
    trends: Record<string, 'improving' | 'stable' | 'degrading'>;
  }> {
    const currentMetrics = await this.collectPerformanceMetrics(institutionId);
    
    const { data: activeAnomalies } = await this.supabase
      .from('performance_anomalies')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('resolved', false);

    const performanceScore = await this.calculatePerformanceScore(institutionId);
    const trends = await this.calculatePerformanceTrends(institutionId);

    return {
      currentMetrics,
      activeAnomalies: activeAnomalies?.length || 0,
      performanceScore,
      trends
    };
  }

  private async calculatePerformanceScore(institutionId: string): Promise<number> {
    const metricTypes = ['response_time', 'throughput', 'error_rate'];
    let totalScore = 0;
    let validMetrics = 0;

    for (const metricType of metricTypes) {
      const baseline = await this.getPerformanceBaseline(institutionId, metricType);
      const recentMetrics = await this.getRecentMetrics(institutionId, metricType, 1);
      
      if (baseline && recentMetrics.length > 0) {
        const avgRecent = recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;
        
        let score = 100;
        if (metricType === 'error_rate') {
          // Lower is better for error rate
          score = Math.max(0, 100 - (avgRecent * 10));
        } else if (metricType === 'response_time') {
          // Lower is better for response time
          const deviation = (avgRecent - baseline.average) / baseline.standardDeviation;
          score = Math.max(0, 100 - (deviation * 10));
        } else if (metricType === 'throughput') {
          // Higher is better for throughput
          const deviation = (baseline.average - avgRecent) / baseline.standardDeviation;
          score = Math.max(0, 100 - (deviation * 10));
        }
        
        totalScore += Math.min(100, Math.max(0, score));
        validMetrics++;
      }
    }

    return validMetrics > 0 ? totalScore / validMetrics : 50; // Default to 50 if no data
  }

  private async calculatePerformanceTrends(institutionId: string): Promise<Record<string, 'improving' | 'stable' | 'degrading'>> {
    const trends: Record<string, 'improving' | 'stable' | 'degrading'> = {};
    const metricTypes = ['response_time', 'throughput', 'error_rate'];

    for (const metricType of metricTypes) {
      const recentMetrics = await this.getRecentMetrics(institutionId, metricType, 24); // Last 24 hours
      const olderMetrics = await this.getMetricsInRange(institutionId, metricType, 48, 24); // 24-48 hours ago

      if (recentMetrics.length > 0 && olderMetrics.length > 0) {
        const recentAvg = recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;
        const olderAvg = olderMetrics.reduce((sum, m) => sum + m.value, 0) / olderMetrics.length;
        
        const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (Math.abs(changePercent) < 5) {
          trends[metricType] = 'stable';
        } else if (metricType === 'error_rate' || metricType === 'response_time') {
          // Lower is better
          trends[metricType] = changePercent < 0 ? 'improving' : 'degrading';
        } else {
          // Higher is better
          trends[metricType] = changePercent > 0 ? 'improving' : 'degrading';
        }
      } else {
        trends[metricType] = 'stable';
      }
    }

    return trends;
  }

  private async getMetricsInRange(institutionId: string, metricType: string, hoursAgo: number, duration: number): Promise<PerformanceMetric[]> {
    const endTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const startTime = new Date(endTime.getTime() - duration * 60 * 60 * 1000);

    const { data: metrics } = await this.supabase
      .from('performance_metrics')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('metric_type', metricType)
      .gte('recorded_at', startTime.toISOString())
      .lte('recorded_at', endTime.toISOString());

    if (!metrics) return [];

    return metrics.map(m => ({
      id: m.id,
      institutionId: m.institution_id,
      metricType: m.metric_type,
      value: m.value,
      unit: m.unit,
      timestamp: new Date(m.recorded_at),
      endpoint: m.endpoint,
      metadata: m.metadata
    }));
  }
}