// Cross-tenant data access prevention and monitoring service
import { createClient } from "@supabase/supabase-js";
import { TenantContext } from "@/lib/types/institution";

export interface AccessAttempt {
  userId: string;
  institutionId: string;
  targetInstitutionId: string;
  targetDepartmentId?: string;
  resource: string;
  action: string;
  timestamp: Date;
  blocked: boolean;
  reason: string;
  metadata?: Record<string, any>;
}

export interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'cross_tenant_access' | 'data_breach_attempt' | 'suspicious_pattern' | 'policy_violation';
  description: string;
  userId: string;
  institutionId: string;
  affectedResources: string[];
  timestamp: Date;
  resolved: boolean;
  metadata: Record<string, any>;
}

export class CrossTenantMonitor {
  private supabase;
  private alertThresholds = {
    crossTenantAttempts: 5, // Alert after 5 cross-tenant attempts in time window
    timeWindow: 15 * 60 * 1000, // 15 minutes
    suspiciousPatternThreshold: 10,
    criticalViolationThreshold: 3
  };

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Monitor and prevent cross-tenant data access
   */
  async preventCrossTenantAccess(
    context: TenantContext,
    targetResource: {
      type: string;
      institutionId?: string;
      departmentId?: string;
      resourceId: string;
    },
    action: string
  ): Promise<{ allowed: boolean; reason: string; alertGenerated?: boolean }> {
    const attempt: AccessAttempt = {
      userId: context.userId,
      institutionId: context.institutionId,
      targetInstitutionId: targetResource.institutionId || '',
      targetDepartmentId: targetResource.departmentId,
      resource: `${targetResource.type}:${targetResource.resourceId}`,
      action,
      timestamp: new Date(),
      blocked: false,
      reason: ''
    };

    // System admins can access everything
    if (context.role === 'system_admin') {
      attempt.blocked = false;
      attempt.reason = 'System admin access';
      await this.logAccessAttempt(attempt);
      return { allowed: true, reason: 'System admin access' };
    }

    // Check if accessing own institution's resources
    if (targetResource.institutionId && targetResource.institutionId !== context.institutionId) {
      attempt.blocked = true;
      attempt.reason = 'Cross-tenant access denied';
      await this.logAccessAttempt(attempt);

      // Check if this triggers an alert
      const alertGenerated = await this.checkForSecurityAlert(context, attempt);

      return { 
        allowed: false, 
        reason: 'Access denied: Cannot access resources from other institutions',
        alertGenerated
      };
    }

    // Check department-level access
    if (targetResource.departmentId && 
        context.role !== 'institution_admin' && 
        targetResource.departmentId !== context.departmentId) {
      
      // Check if user has cross-department permissions
      if (!context.permissions.includes('cross_department_access')) {
        attempt.blocked = true;
        attempt.reason = 'Cross-department access denied';
        await this.logAccessAttempt(attempt);

        const alertGenerated = await this.checkForSecurityAlert(context, attempt);

        return { 
          allowed: false, 
          reason: 'Access denied: Cannot access resources from other departments',
          alertGenerated
        };
      }
    }

    // Access allowed
    attempt.blocked = false;
    attempt.reason = 'Access granted';
    await this.logAccessAttempt(attempt);

    return { allowed: true, reason: 'Access granted' };
  }

  /**
   * Log access attempt for monitoring
   */
  private async logAccessAttempt(attempt: AccessAttempt): Promise<void> {
    try {
      await this.supabase.rpc('log_security_event', {
        p_user_id: attempt.userId,
        p_institution_id: attempt.institutionId,
        p_department_id: null,
        p_role: null,
        p_event_type: attempt.blocked ? 'access_denied' : 'access_granted',
        p_resource: attempt.resource,
        p_action: attempt.action,
        p_target_institution_id: attempt.targetInstitutionId || null,
        p_target_department_id: attempt.targetDepartmentId || null,
        p_metadata: {
          blocked: attempt.blocked,
          reason: attempt.reason,
          timestamp: attempt.timestamp.toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to log access attempt:', error);
    }
  }

  /**
   * Check if access attempt should trigger a security alert
   */
  private async checkForSecurityAlert(
    context: TenantContext,
    attempt: AccessAttempt
  ): Promise<boolean> {
    try {
      // Get recent cross-tenant attempts by this user
      const { data: recentAttempts, error } = await this.supabase
        .from('tenant_security_events')
        .select('*')
        .eq('user_id', context.userId)
        .eq('event_type', 'access_denied')
        .gte('timestamp', new Date(Date.now() - this.alertThresholds.timeWindow).toISOString())
        .order('timestamp', { ascending: false });

      if (error) {
        console.error('Error checking recent attempts:', error);
        return false;
      }

      const crossTenantAttempts = recentAttempts?.filter(
        event => event.target_institution_id && event.target_institution_id !== context.institutionId
      ) || [];

      // Generate alert if threshold exceeded
      if (crossTenantAttempts.length >= this.alertThresholds.crossTenantAttempts) {
        await this.generateSecurityAlert({
          severity: crossTenantAttempts.length > 10 ? 'critical' : 'high',
          type: 'cross_tenant_access',
          description: `User ${context.userId} attempted to access ${crossTenantAttempts.length} cross-tenant resources`,
          userId: context.userId,
          institutionId: context.institutionId,
          affectedResources: crossTenantAttempts.map(a => a.resource),
          metadata: {
            attemptCount: crossTenantAttempts.length,
            timeWindow: this.alertThresholds.timeWindow,
            latestAttempt: attempt
          }
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking for security alert:', error);
      return false;
    }
  }

  /**
   * Generate security alert
   */
  private async generateSecurityAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alert: SecurityAlert = {
      id: crypto.randomUUID(),
      ...alertData,
      timestamp: new Date(),
      resolved: false
    };

    // Log the alert
    console.log('[SECURITY_ALERT]', JSON.stringify(alert));

    // In production, this should:
    // 1. Store in alerts table
    // 2. Send notifications to security team
    // 3. Trigger automated responses for critical alerts
    // 4. Integrate with SIEM systems

    // For now, just log to security events
    try {
      await this.supabase.rpc('log_security_event', {
        p_user_id: alert.userId,
        p_institution_id: alert.institutionId,
        p_department_id: null,
        p_role: null,
        p_event_type: 'suspicious_activity',
        p_resource: 'security_alert',
        p_action: 'alert_generated',
        p_metadata: {
          alertId: alert.id,
          severity: alert.severity,
          type: alert.type,
          description: alert.description,
          affectedResources: alert.affectedResources,
          metadata: alert.metadata
        }
      });
    } catch (error) {
      console.error('Failed to log security alert:', error);
    }
  }

  /**
   * Analyze access patterns for suspicious behavior
   */
  async analyzeAccessPatterns(
    institutionId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    totalAttempts: number;
    blockedAttempts: number;
    suspiciousUsers: Array<{
      userId: string;
      attemptCount: number;
      blockedCount: number;
      riskScore: number;
    }>;
    patterns: Array<{
      type: string;
      description: string;
      severity: string;
      count: number;
    }>;
  }> {
    try {
      const { data: events, error } = await this.supabase
        .from('tenant_security_events')
        .select('*')
        .eq('institution_id', institutionId)
        .gte('timestamp', timeRange.start.toISOString())
        .lte('timestamp', timeRange.end.toISOString());

      if (error) {
        throw error;
      }

      const totalAttempts = events?.length || 0;
      const blockedAttempts = events?.filter(e => e.event_type === 'access_denied').length || 0;

      // Analyze user behavior
      const userStats = new Map<string, { total: number; blocked: number }>();
      events?.forEach(event => {
        const stats = userStats.get(event.user_id) || { total: 0, blocked: 0 };
        stats.total++;
        if (event.event_type === 'access_denied') {
          stats.blocked++;
        }
        userStats.set(event.user_id, stats);
      });

      const suspiciousUsers = Array.from(userStats.entries())
        .map(([userId, stats]) => ({
          userId,
          attemptCount: stats.total,
          blockedCount: stats.blocked,
          riskScore: (stats.blocked / stats.total) * 100
        }))
        .filter(user => user.riskScore > 50 || user.blockedCount > 5)
        .sort((a, b) => b.riskScore - a.riskScore);

      // Identify patterns
      const patterns = [];

      // High volume of cross-tenant attempts
      const crossTenantEvents = events?.filter(e => 
        e.target_institution_id && e.target_institution_id !== institutionId
      ) || [];
      
      if (crossTenantEvents.length > 10) {
        patterns.push({
          type: 'cross_tenant_access',
          description: 'High volume of cross-tenant access attempts detected',
          severity: crossTenantEvents.length > 50 ? 'critical' : 'high',
          count: crossTenantEvents.length
        });
      }

      // Rapid access attempts
      const rapidAttempts = this.detectRapidAccessAttempts(events || []);
      if (rapidAttempts.length > 0) {
        patterns.push({
          type: 'rapid_access',
          description: 'Rapid access attempts detected',
          severity: 'medium',
          count: rapidAttempts.length
        });
      }

      return {
        totalAttempts,
        blockedAttempts,
        suspiciousUsers,
        patterns
      };
    } catch (error) {
      console.error('Error analyzing access patterns:', error);
      return {
        totalAttempts: 0,
        blockedAttempts: 0,
        suspiciousUsers: [],
        patterns: []
      };
    }
  }

  /**
   * Detect rapid access attempts
   */
  private detectRapidAccessAttempts(events: any[]): any[] {
    const rapidAttempts = [];
    const userEvents = new Map<string, any[]>();

    // Group events by user
    events.forEach(event => {
      const userEventList = userEvents.get(event.user_id) || [];
      userEventList.push(event);
      userEvents.set(event.user_id, userEventList);
    });

    // Check for rapid attempts (more than 10 attempts in 1 minute)
    userEvents.forEach((userEventList, userId) => {
      userEventList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      for (let i = 0; i < userEventList.length - 9; i++) {
        const startTime = new Date(userEventList[i].timestamp).getTime();
        const endTime = new Date(userEventList[i + 9].timestamp).getTime();
        
        if (endTime - startTime < 60000) { // 1 minute
          rapidAttempts.push({
            userId,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            attemptCount: 10
          });
        }
      }
    });

    return rapidAttempts;
  }

  /**
   * Get security metrics for institution
   */
  async getSecurityMetrics(
    institutionId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    accessAttempts: number;
    blockedAttempts: number;
    securityAlerts: number;
    riskScore: number;
    topRiskyUsers: Array<{ userId: string; riskScore: number }>;
    recommendations: string[];
  }> {
    const analysis = await this.analyzeAccessPatterns(institutionId, timeRange);
    
    const riskScore = analysis.totalAttempts > 0 
      ? (analysis.blockedAttempts / analysis.totalAttempts) * 100 
      : 0;

    const recommendations = [];
    if (riskScore > 20) {
      recommendations.push('Consider implementing additional access controls');
    }
    if (analysis.suspiciousUsers.length > 0) {
      recommendations.push('Review access patterns for flagged users');
    }
    if (analysis.patterns.some(p => p.severity === 'critical')) {
      recommendations.push('Immediate security review required');
    }

    return {
      accessAttempts: analysis.totalAttempts,
      blockedAttempts: analysis.blockedAttempts,
      securityAlerts: analysis.patterns.length,
      riskScore,
      topRiskyUsers: analysis.suspiciousUsers.slice(0, 5),
      recommendations
    };
  }

  /**
   * Block user access temporarily
   */
  async temporaryBlockUser(
    userId: string,
    institutionId: string,
    reason: string,
    durationMinutes: number = 30
  ): Promise<void> {
    const blockUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    
    // Log the block action
    await this.supabase.rpc('log_security_event', {
      p_user_id: userId,
      p_institution_id: institutionId,
      p_department_id: null,
      p_role: null,
      p_event_type: 'access_denied',
      p_resource: 'user_account',
      p_action: 'temporary_block',
      p_metadata: {
        reason,
        blockUntil: blockUntil.toISOString(),
        durationMinutes
      }
    });

    console.log(`[USER_BLOCKED] User ${userId} blocked until ${blockUntil.toISOString()}: ${reason}`);
  }

  /**
   * Check if user is currently blocked
   */
  async isUserBlocked(userId: string): Promise<{ blocked: boolean; reason?: string; until?: Date }> {
    try {
      const { data: blockEvents, error } = await this.supabase
        .from('tenant_security_events')
        .select('*')
        .eq('user_id', userId)
        .eq('action', 'temporary_block')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('timestamp', { ascending: false })
        .limit(1);

      if (error || !blockEvents || blockEvents.length === 0) {
        return { blocked: false };
      }

      const latestBlock = blockEvents[0];
      const blockUntil = new Date(latestBlock.metadata.blockUntil);
      
      if (blockUntil > new Date()) {
        return {
          blocked: true,
          reason: latestBlock.metadata.reason,
          until: blockUntil
        };
      }

      return { blocked: false };
    } catch (error) {
      console.error('Error checking user block status:', error);
      return { blocked: false };
    }
  }
}