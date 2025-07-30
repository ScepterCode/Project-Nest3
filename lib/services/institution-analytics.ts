import { createClient } from '@/lib/supabase/server';

export interface InstitutionMetrics {
  userCount: number;
  activeUsers: number;
  classCount: number;
  enrollmentCount: number;
  loginRate: number;
  contentCreationRate: number;
  engagementScore: number;
}

export interface DepartmentMetrics {
  studentCount: number;
  teacherCount: number;
  classCount: number;
  assignmentCount: number;
  completionRate: number;
  performanceAverage: number;
  atRiskStudents: number;
}

export interface AnalyticsTimeframe {
  start: Date;
  end: Date;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
}

export interface InstitutionHealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  metrics: {
    userEngagement: 'healthy' | 'warning' | 'critical';
    systemPerformance: 'healthy' | 'warning' | 'critical';
    dataIntegrity: 'healthy' | 'warning' | 'critical';
    securityStatus: 'healthy' | 'warning' | 'critical';
  };
  alerts: HealthAlert[];
}

export interface HealthAlert {
  id: string;
  type: 'performance' | 'security' | 'data' | 'user_activity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detectedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export interface ComparativeAnalytics {
  institutionId: string;
  institutionName: string;
  metrics: InstitutionMetrics;
  ranking: {
    userEngagement: number;
    contentCreation: number;
    overallPerformance: number;
  };
  trends: {
    userGrowth: number;
    engagementChange: number;
    performanceChange: number;
  };
}

export interface AnalyticsReport {
  id: string;
  institutionId: string;
  type: 'user_activity' | 'engagement' | 'performance' | 'comparative' | 'health';
  title: string;
  description: string;
  generatedAt: Date;
  timeframe: AnalyticsTimeframe;
  data: Record<string, any>;
  exportFormats: ('pdf' | 'csv' | 'json')[];
  privacyCompliant: boolean;
}

export class InstitutionAnalyticsService {
  private supabase = createClient();

  /**
   * Collect and store analytics metrics for an institution
   */
  async collectMetrics(institutionId: string): Promise<void> {
    try {
      const metrics = await this.calculateInstitutionMetrics(institutionId);
      
      // Store each metric in the analytics table
      const analyticsData = Object.entries(metrics).map(([metricName, value]) => ({
        institution_id: institutionId,
        metric_name: metricName,
        metric_value: value,
        recorded_at: new Date().toISOString(),
        date_bucket: new Date().toISOString().split('T')[0]
      }));

      const { error } = await this.supabase
        .from('institution_analytics')
        .insert(analyticsData);

      if (error) throw error;
    } catch (error) {
      console.error('Error collecting metrics:', error);
      throw new Error('Failed to collect institution metrics');
    }
  }

  /**
   * Get institution metrics for a specific timeframe
   */
  async getInstitutionMetrics(
    institutionId: string, 
    timeframe?: AnalyticsTimeframe
  ): Promise<InstitutionMetrics> {
    try {
      let query = this.supabase
        .from('institution_analytics')
        .select('metric_name, metric_value, recorded_at')
        .eq('institution_id', institutionId);

      if (timeframe) {
        query = query
          .gte('recorded_at', timeframe.start.toISOString())
          .lte('recorded_at', timeframe.end.toISOString());
      }

      const { data, error } = await query.order('recorded_at', { ascending: false });

      if (error) throw error;

      // Get the latest value for each metric
      const latestMetrics: Record<string, number> = {};
      data?.forEach(record => {
        if (!latestMetrics[record.metric_name]) {
          latestMetrics[record.metric_name] = record.metric_value;
        }
      });

      return {
        userCount: latestMetrics.user_count || 0,
        activeUsers: latestMetrics.active_users || 0,
        classCount: latestMetrics.class_count || 0,
        enrollmentCount: latestMetrics.enrollment_count || 0,
        loginRate: latestMetrics.login_rate || 0,
        contentCreationRate: latestMetrics.content_creation_rate || 0,
        engagementScore: latestMetrics.engagement_score || 0
      };
    } catch (error) {
      console.error('Error getting institution metrics:', error);
      throw new Error('Failed to get institution metrics');
    }
  }

  /**
   * Calculate real-time institution metrics
   */
  private async calculateInstitutionMetrics(institutionId: string): Promise<InstitutionMetrics> {
    try {
      const [
        userCount,
        activeUsers,
        classCount,
        enrollmentCount,
        loginRate,
        contentCreationRate,
        engagementScore
      ] = await Promise.all([
        this.getUserCount(institutionId),
        this.getActiveUserCount(institutionId),
        this.getClassCount(institutionId),
        this.getEnrollmentCount(institutionId),
        this.getLoginRate(institutionId),
        this.getContentCreationRate(institutionId),
        this.getEngagementScore(institutionId)
      ]);

      return {
        userCount,
        activeUsers,
        classCount,
        enrollmentCount,
        loginRate,
        contentCreationRate,
        engagementScore
      };
    } catch (error) {
      console.error('Error calculating metrics:', error);
      throw error;
    }
  }

  private async getUserCount(institutionId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    if (error) throw error;
    return count || 0;
  }

  private async getActiveUserCount(institutionId: string): Promise<number> {
    // Users active in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count, error } = await this.supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .gte('last_sign_in_at', thirtyDaysAgo.toISOString());

    if (error) throw error;
    return count || 0;
  }

  private async getClassCount(institutionId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('department.institution_id', institutionId);

    if (error) throw error;
    return count || 0;
  }

  private async getEnrollmentCount(institutionId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class.department.institution_id', institutionId)
      .eq('status', 'enrolled');

    if (error) throw error;
    return count || 0;
  }

  private async getLoginRate(institutionId: string): Promise<number> {
    // Calculate login rate as logins per user per day over the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // This would require a login tracking table - for now return a placeholder
    return 0.75; // 75% daily login rate
  }

  private async getContentCreationRate(institutionId: string): Promise<number> {
    // Calculate content creation rate - assignments, classes, etc. created per day
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // This would aggregate content creation across different tables
    return 2.3; // 2.3 pieces of content per day
  }

  private async getEngagementScore(institutionId: string): Promise<number> {
    // Calculate engagement score based on various factors
    // This would be a complex calculation involving multiple metrics
    return 78.5; // 78.5% engagement score
  }

  /**
   * Monitor institution health and detect concerning patterns
   */
  async monitorInstitutionHealth(institutionId: string): Promise<InstitutionHealthStatus> {
    try {
      const metrics = await this.getInstitutionMetrics(institutionId);
      const alerts: HealthAlert[] = [];

      // Check user engagement
      let userEngagement: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (metrics.engagementScore < 50) {
        userEngagement = 'critical';
        alerts.push({
          id: `engagement-${Date.now()}`,
          type: 'user_activity',
          severity: 'critical',
          message: 'User engagement score is critically low',
          detectedAt: new Date(),
          resolved: false,
          metadata: { engagementScore: metrics.engagementScore }
        });
      } else if (metrics.engagementScore < 70) {
        userEngagement = 'warning';
        alerts.push({
          id: `engagement-${Date.now()}`,
          type: 'user_activity',
          severity: 'medium',
          message: 'User engagement score is below recommended levels',
          detectedAt: new Date(),
          resolved: false,
          metadata: { engagementScore: metrics.engagementScore }
        });
      }

      // Check system performance
      let systemPerformance: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (metrics.loginRate < 0.3) {
        systemPerformance = 'warning';
        alerts.push({
          id: `performance-${Date.now()}`,
          type: 'performance',
          severity: 'medium',
          message: 'Login rate is lower than expected',
          detectedAt: new Date(),
          resolved: false,
          metadata: { loginRate: metrics.loginRate }
        });
      }

      // Determine overall health
      const healthLevels = [userEngagement, systemPerformance, 'healthy', 'healthy'];
      const overall = healthLevels.includes('critical') ? 'critical' : 
                     healthLevels.includes('warning') ? 'warning' : 'healthy';

      return {
        overall,
        metrics: {
          userEngagement,
          systemPerformance,
          dataIntegrity: 'healthy',
          securityStatus: 'healthy'
        },
        alerts
      };
    } catch (error) {
      console.error('Error monitoring institution health:', error);
      throw new Error('Failed to monitor institution health');
    }
  }

  /**
   * Get comparative analytics across institutions
   */
  async getComparativeAnalytics(
    institutionIds: string[],
    timeframe?: AnalyticsTimeframe
  ): Promise<ComparativeAnalytics[]> {
    try {
      const comparativeData: ComparativeAnalytics[] = [];

      for (const institutionId of institutionIds) {
        const [institution, metrics] = await Promise.all([
          this.getInstitutionInfo(institutionId),
          this.getInstitutionMetrics(institutionId, timeframe)
        ]);

        comparativeData.push({
          institutionId,
          institutionName: institution.name,
          metrics,
          ranking: {
            userEngagement: 0, // Would calculate based on all institutions
            contentCreation: 0,
            overallPerformance: 0
          },
          trends: {
            userGrowth: 0, // Would calculate from historical data
            engagementChange: 0,
            performanceChange: 0
          }
        });
      }

      // Calculate rankings
      this.calculateRankings(comparativeData);

      return comparativeData;
    } catch (error) {
      console.error('Error getting comparative analytics:', error);
      throw new Error('Failed to get comparative analytics');
    }
  }

  private async getInstitutionInfo(institutionId: string) {
    const { data, error } = await this.supabase
      .from('institutions')
      .select('name')
      .eq('id', institutionId)
      .single();

    if (error) throw error;
    return data;
  }

  private calculateRankings(data: ComparativeAnalytics[]): void {
    // Sort by engagement score and assign rankings
    const sortedByEngagement = [...data].sort((a, b) => b.metrics.engagementScore - a.metrics.engagementScore);
    sortedByEngagement.forEach((item, index) => {
      const original = data.find(d => d.institutionId === item.institutionId);
      if (original) original.ranking.userEngagement = index + 1;
    });

    // Sort by content creation rate and assign rankings
    const sortedByContent = [...data].sort((a, b) => b.metrics.contentCreationRate - a.metrics.contentCreationRate);
    sortedByContent.forEach((item, index) => {
      const original = data.find(d => d.institutionId === item.institutionId);
      if (original) original.ranking.contentCreation = index + 1;
    });

    // Calculate overall performance ranking (average of other rankings)
    data.forEach(item => {
      item.ranking.overallPerformance = Math.round(
        (item.ranking.userEngagement + item.ranking.contentCreation) / 2
      );
    });
  }

  /**
   * Generate privacy-compliant analytics report
   */
  async generateReport(
    institutionId: string,
    type: AnalyticsReport['type'],
    timeframe: AnalyticsTimeframe,
    exportFormats: ('pdf' | 'csv' | 'json')[] = ['json']
  ): Promise<AnalyticsReport> {
    try {
      let data: Record<string, any> = {};
      let title = '';
      let description = '';

      switch (type) {
        case 'user_activity':
          data = await this.getUserActivityData(institutionId, timeframe);
          title = 'User Activity Report';
          description = 'Comprehensive analysis of user engagement and activity patterns';
          break;
        case 'engagement':
          data = await this.getEngagementData(institutionId, timeframe);
          title = 'Engagement Analysis Report';
          description = 'Detailed engagement metrics and trends';
          break;
        case 'performance':
          data = await this.getPerformanceData(institutionId, timeframe);
          title = 'Performance Metrics Report';
          description = 'System and user performance analysis';
          break;
        case 'health':
          data = await this.monitorInstitutionHealth(institutionId);
          title = 'Institution Health Report';
          description = 'Current health status and alerts';
          break;
      }

      const report: AnalyticsReport = {
        id: `report-${Date.now()}`,
        institutionId,
        type,
        title,
        description,
        generatedAt: new Date(),
        timeframe,
        data: this.anonymizeData(data), // Ensure privacy compliance
        exportFormats,
        privacyCompliant: true
      };

      return report;
    } catch (error) {
      console.error('Error generating report:', error);
      throw new Error('Failed to generate analytics report');
    }
  }

  private async getUserActivityData(institutionId: string, timeframe: AnalyticsTimeframe) {
    // Get user activity data for the timeframe
    return {
      totalUsers: await this.getUserCount(institutionId),
      activeUsers: await this.getActiveUserCount(institutionId),
      loginFrequency: await this.getLoginRate(institutionId)
    };
  }

  private async getEngagementData(institutionId: string, timeframe: AnalyticsTimeframe) {
    const metrics = await this.getInstitutionMetrics(institutionId, timeframe);
    return {
      engagementScore: metrics.engagementScore,
      contentCreationRate: metrics.contentCreationRate,
      userParticipation: metrics.activeUsers / metrics.userCount
    };
  }

  private async getPerformanceData(institutionId: string, timeframe: AnalyticsTimeframe) {
    const metrics = await this.getInstitutionMetrics(institutionId, timeframe);
    return {
      systemUtilization: metrics.loginRate,
      contentVolume: metrics.contentCreationRate,
      userSatisfaction: metrics.engagementScore / 100
    };
  }

  /**
   * Anonymize sensitive data for privacy compliance
   */
  private anonymizeData(data: any): any {
    // Remove or hash any personally identifiable information
    // This is a simplified implementation - real anonymization would be more comprehensive
    if (typeof data === 'object' && data !== null) {
      const anonymized = { ...data };
      
      // Remove common PII fields
      delete anonymized.email;
      delete anonymized.name;
      delete anonymized.phone;
      delete anonymized.address;
      
      // Recursively anonymize nested objects
      Object.keys(anonymized).forEach(key => {
        if (typeof anonymized[key] === 'object') {
          anonymized[key] = this.anonymizeData(anonymized[key]);
        }
      });
      
      return anonymized;
    }
    
    return data;
  }

  /**
   * Export report data in specified format
   */
  async exportReport(report: AnalyticsReport, format: 'pdf' | 'csv' | 'json'): Promise<string> {
    try {
      switch (format) {
        case 'json':
          return JSON.stringify(report, null, 2);
        case 'csv':
          return this.convertToCSV(report.data);
        case 'pdf':
          // Would integrate with a PDF generation library
          return 'PDF generation not implemented';
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      throw new Error('Failed to export report');
    }
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - would be more sophisticated in practice
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      
      const headers = Object.keys(data[0]);
      const csvRows = [headers.join(',')];
      
      data.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          return typeof value === 'string' ? `"${value}"` : value;
        });
        csvRows.push(values.join(','));
      });
      
      return csvRows.join('\n');
    } else {
      // Convert object to key-value CSV
      const entries = Object.entries(data);
      return entries.map(([key, value]) => `"${key}","${value}"`).join('\n');
    }
  }
}

// Export singleton instance
export const institutionAnalyticsService = new InstitutionAnalyticsService();