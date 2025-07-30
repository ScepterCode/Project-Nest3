/**
 * Role Security Logger Service
 * 
 * Implements comprehensive security logging for role-related activities,
 * including suspicious behavior detection and audit trail maintenance.
 */

import { UserRole, AuditAction } from '../types/role-management';
import { createClient } from '../supabase/server';

export enum SecurityEventType {
  // Authentication events
  LOGIN_ATTEMPT = 'login_attempt',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  
  // Role request events
  ROLE_REQUEST_CREATED = 'role_request_created',
  ROLE_REQUEST_APPROVED = 'role_request_approved',
  ROLE_REQUEST_DENIED = 'role_request_denied',
  ROLE_REQUEST_EXPIRED = 'role_request_expired',
  
  // Role assignment events
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REVOKED = 'role_revoked',
  ROLE_CHANGED = 'role_changed',
  ROLE_EXPIRED = 'role_expired',
  
  // Suspicious activities
  RAPID_ROLE_REQUESTS = 'rapid_role_requests',
  PRIVILEGE_ESCALATION_ATTEMPT = 'privilege_escalation_attempt',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'unauthorized_access_attempt',
  SUSPICIOUS_PATTERN_DETECTED = 'suspicious_pattern_detected',
  BULK_OPERATION_ANOMALY = 'bulk_operation_anomaly',
  
  // Security violations
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  PERMISSION_VIOLATION = 'permission_violation',
  SELF_APPROVAL_ATTEMPT = 'self_approval_attempt',
  INVALID_ROLE_TRANSITION = 'invalid_role_transition',
  
  // Administrative actions
  USER_BLOCKED = 'user_blocked',
  USER_UNBLOCKED = 'user_unblocked',
  RATE_LIMIT_RESET = 'rate_limit_reset',
  SECURITY_ALERT_RESOLVED = 'security_alert_resolved',
  
  // System events
  CONFIGURATION_CHANGED = 'configuration_changed',
  SECURITY_POLICY_UPDATED = 'security_policy_updated',
  AUDIT_LOG_ACCESSED = 'audit_log_accessed'
}

export enum SecurityEventSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface SecurityEvent {
  id: string;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  userId?: string;
  targetUserId?: string;
  institutionId?: string;
  departmentId?: string;
  description: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  correlationId?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: string;
}

export interface SecurityAlert {
  id: string;
  alertType: string;
  severity: SecurityEventSeverity;
  title: string;
  description: string;
  userId?: string;
  institutionId?: string;
  events: SecurityEvent[];
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: string;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsBySeverity: Record<SecurityEventSeverity, number>;
  eventsByType: Record<SecurityEventType, number>;
  suspiciousActivities: number;
  resolvedAlerts: number;
  pendingAlerts: number;
  topRiskyUsers: Array<{ userId: string; riskScore: number; eventCount: number }>;
  institutionRiskScores: Array<{ institutionId: string; riskScore: number }>;
}

export class RoleSecurityLogger {
  private static instance: RoleSecurityLogger;
  private eventBuffer: SecurityEvent[] = [];
  private bufferSize = 100;
  private flushInterval = 30000; // 30 seconds

  private constructor() {
    // Start periodic buffer flush
    setInterval(() => {
      this.flushBuffer();
    }, this.flushInterval);
  }

  public static getInstance(): RoleSecurityLogger {
    if (!RoleSecurityLogger.instance) {
      RoleSecurityLogger.instance = new RoleSecurityLogger();
    }
    return RoleSecurityLogger.instance;
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    description: string,
    details: Record<string, any> = {},
    context?: {
      userId?: string;
      targetUserId?: string;
      institutionId?: string;
      departmentId?: string;
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
      correlationId?: string;
    }
  ): Promise<void> {
    const event: SecurityEvent = {
      id: this.generateId(),
      eventType,
      severity: this.determineSeverity(eventType),
      userId: context?.userId,
      targetUserId: context?.targetUserId,
      institutionId: context?.institutionId,
      departmentId: context?.departmentId,
      description,
      details,
      timestamp: new Date(),
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      correlationId: context?.correlationId,
      resolved: false
    };

    // Add to buffer for batch processing
    this.eventBuffer.push(event);

    // Immediate flush for critical events
    if (event.severity === SecurityEventSeverity.CRITICAL) {
      await this.flushBuffer();
      await this.createSecurityAlert(event);
    }

    // Flush buffer if it's full
    if (this.eventBuffer.length >= this.bufferSize) {
      await this.flushBuffer();
    }

    // Check for suspicious patterns
    await this.analyzeForSuspiciousPatterns(event);
  }

  /**
   * Log role request events
   */
  async logRoleRequest(
    action: 'created' | 'approved' | 'denied' | 'expired',
    requestId: string,
    userId: string,
    requestedRole: UserRole,
    institutionId: string,
    details: Record<string, any> = {},
    context?: { approvedBy?: string; reason?: string; ipAddress?: string }
  ): Promise<void> {
    const eventTypeMap = {
      created: SecurityEventType.ROLE_REQUEST_CREATED,
      approved: SecurityEventType.ROLE_REQUEST_APPROVED,
      denied: SecurityEventType.ROLE_REQUEST_DENIED,
      expired: SecurityEventType.ROLE_REQUEST_EXPIRED
    };

    await this.logSecurityEvent(
      eventTypeMap[action],
      `Role request ${action}: ${requestedRole}`,
      {
        requestId,
        requestedRole,
        approvedBy: context?.approvedBy,
        reason: context?.reason,
        ...details
      },
      {
        userId,
        targetUserId: context?.approvedBy,
        institutionId,
        ipAddress: context?.ipAddress
      }
    );
  }

  /**
   * Log role assignment events
   */
  async logRoleAssignment(
    action: AuditAction,
    userId: string,
    role: UserRole,
    institutionId: string,
    assignedBy: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    const eventTypeMap = {
      [AuditAction.ASSIGNED]: SecurityEventType.ROLE_ASSIGNED,
      [AuditAction.REVOKED]: SecurityEventType.ROLE_REVOKED,
      [AuditAction.CHANGED]: SecurityEventType.ROLE_CHANGED,
      [AuditAction.EXPIRED]: SecurityEventType.ROLE_EXPIRED
    };

    await this.logSecurityEvent(
      eventTypeMap[action] || SecurityEventType.ROLE_ASSIGNED,
      `Role ${action.toLowerCase()}: ${role}`,
      {
        role,
        assignedBy,
        ...details
      },
      {
        userId,
        targetUserId: assignedBy,
        institutionId
      }
    );
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(
    activityType: string,
    userId: string,
    description: string,
    severity: SecurityEventSeverity = SecurityEventSeverity.MEDIUM,
    details: Record<string, any> = {},
    institutionId?: string
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.SUSPICIOUS_PATTERN_DETECTED,
      `Suspicious activity detected: ${description}`,
      {
        activityType,
        ...details
      },
      {
        userId,
        institutionId
      }
    );

    // Create alert for high severity suspicious activities
    if (severity === SecurityEventSeverity.HIGH || severity === SecurityEventSeverity.CRITICAL) {
      const event: SecurityEvent = {
        id: this.generateId(),
        eventType: SecurityEventType.SUSPICIOUS_PATTERN_DETECTED,
        severity,
        userId,
        institutionId,
        description,
        details: { activityType, ...details },
        timestamp: new Date(),
        resolved: false
      };

      await this.createSecurityAlert(event);
    }
  }

  /**
   * Log permission violations
   */
  async logPermissionViolation(
    userId: string,
    operation: string,
    requiredRole: UserRole,
    currentRole: UserRole,
    institutionId: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PERMISSION_VIOLATION,
      `Permission violation: ${operation}`,
      {
        operation,
        requiredRole,
        currentRole,
        ...details
      },
      {
        userId,
        institutionId
      }
    );
  }

  /**
   * Get security events with filtering
   */
  async getSecurityEvents(filters: {
    eventType?: SecurityEventType;
    severity?: SecurityEventSeverity;
    userId?: string;
    institutionId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<SecurityEvent[]> {
    const supabase = createClient();

    try {
      let query = supabase
        .from('security_events')
        .select('*')
        .order('timestamp', { ascending: false });

      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }
      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }
      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate.toISOString());
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data?.map(this.mapRowToSecurityEvent) || [];

    } catch (error) {
      console.error('Error getting security events:', error);
      return [];
    }
  }

  /**
   * Get security alerts
   */
  async getSecurityAlerts(filters: {
    severity?: SecurityEventSeverity;
    resolved?: boolean;
    institutionId?: string;
    limit?: number;
  } = {}): Promise<SecurityAlert[]> {
    const supabase = createClient();

    try {
      let query = supabase
        .from('security_alerts')
        .select(`
          *,
          security_alert_events (
            security_events (*)
          )
        `)
        .order('created_at', { ascending: false });

      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }
      if (filters.resolved !== undefined) {
        query = query.eq('resolved', filters.resolved);
      }
      if (filters.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data?.map(row => ({
        id: row.id,
        alertType: row.alert_type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        userId: row.user_id,
        institutionId: row.institution_id,
        events: row.security_alert_events?.map((ae: any) => 
          this.mapRowToSecurityEvent(ae.security_events)
        ) || [],
        createdAt: new Date(row.created_at),
        acknowledged: row.acknowledged,
        acknowledgedBy: row.acknowledged_by,
        acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
        resolved: row.resolved,
        resolvedBy: row.resolved_by,
        resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
        resolution: row.resolution
      })) || [];

    } catch (error) {
      console.error('Error getting security alerts:', error);
      return [];
    }
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(
    institutionId?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<SecurityMetrics> {
    const supabase = createClient();

    try {
      let query = supabase
        .from('security_events')
        .select('event_type, severity, user_id, institution_id');

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }
      if (timeRange) {
        query = query.gte('timestamp', timeRange.start.toISOString())
                    .lte('timestamp', timeRange.end.toISOString());
      }

      const { data: events, error } = await query;

      if (error) {
        throw error;
      }

      // Calculate metrics
      const totalEvents = events?.length || 0;
      const eventsBySeverity: Record<SecurityEventSeverity, number> = {
        [SecurityEventSeverity.INFO]: 0,
        [SecurityEventSeverity.LOW]: 0,
        [SecurityEventSeverity.MEDIUM]: 0,
        [SecurityEventSeverity.HIGH]: 0,
        [SecurityEventSeverity.CRITICAL]: 0
      };
      const eventsByType: Record<SecurityEventType, number> = {} as Record<SecurityEventType, number>;
      const userEventCounts: Record<string, number> = {};
      const institutionEventCounts: Record<string, number> = {};

      events?.forEach(event => {
        eventsBySeverity[event.severity as SecurityEventSeverity]++;
        eventsByType[event.event_type as SecurityEventType] = 
          (eventsByType[event.event_type as SecurityEventType] || 0) + 1;
        
        if (event.user_id) {
          userEventCounts[event.user_id] = (userEventCounts[event.user_id] || 0) + 1;
        }
        if (event.institution_id) {
          institutionEventCounts[event.institution_id] = 
            (institutionEventCounts[event.institution_id] || 0) + 1;
        }
      });

      // Get alert counts
      const { data: alerts } = await supabase
        .from('security_alerts')
        .select('resolved');

      const resolvedAlerts = alerts?.filter(a => a.resolved).length || 0;
      const pendingAlerts = alerts?.filter(a => !a.resolved).length || 0;

      // Calculate risk scores (simplified)
      const topRiskyUsers = Object.entries(userEventCounts)
        .map(([userId, eventCount]) => ({
          userId,
          riskScore: this.calculateUserRiskScore(eventCount),
          eventCount
        }))
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 10);

      const institutionRiskScores = Object.entries(institutionEventCounts)
        .map(([institutionId, eventCount]) => ({
          institutionId,
          riskScore: this.calculateInstitutionRiskScore(eventCount)
        }))
        .sort((a, b) => b.riskScore - a.riskScore);

      const suspiciousActivities = events?.filter(e => 
        e.event_type === SecurityEventType.SUSPICIOUS_PATTERN_DETECTED ||
        e.event_type === SecurityEventType.PRIVILEGE_ESCALATION_ATTEMPT ||
        e.event_type === SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT
      ).length || 0;

      return {
        totalEvents,
        eventsBySeverity,
        eventsByType,
        suspiciousActivities,
        resolvedAlerts,
        pendingAlerts,
        topRiskyUsers,
        institutionRiskScores
      };

    } catch (error) {
      console.error('Error getting security metrics:', error);
      return {
        totalEvents: 0,
        eventsBySeverity: {
          [SecurityEventSeverity.INFO]: 0,
          [SecurityEventSeverity.LOW]: 0,
          [SecurityEventSeverity.MEDIUM]: 0,
          [SecurityEventSeverity.HIGH]: 0,
          [SecurityEventSeverity.CRITICAL]: 0
        },
        eventsByType: {} as Record<SecurityEventType, number>,
        suspiciousActivities: 0,
        resolvedAlerts: 0,
        pendingAlerts: 0,
        topRiskyUsers: [],
        institutionRiskScores: []
      };
    }
  }

  /**
   * Acknowledge a security alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const supabase = createClient();

    try {
      await supabase
        .from('security_alerts')
        .update({
          acknowledged: true,
          acknowledged_by: acknowledgedBy,
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', alertId);

      await this.logSecurityEvent(
        SecurityEventType.SECURITY_ALERT_RESOLVED,
        `Security alert acknowledged: ${alertId}`,
        { alertId },
        { userId: acknowledgedBy }
      );

    } catch (error) {
      console.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  /**
   * Resolve a security alert
   */
  async resolveAlert(alertId: string, resolvedBy: string, resolution: string): Promise<void> {
    const supabase = createClient();

    try {
      await supabase
        .from('security_alerts')
        .update({
          resolved: true,
          resolved_by: resolvedBy,
          resolved_at: new Date().toISOString(),
          resolution
        })
        .eq('id', alertId);

      await this.logSecurityEvent(
        SecurityEventType.SECURITY_ALERT_RESOLVED,
        `Security alert resolved: ${alertId}`,
        { alertId, resolution },
        { userId: resolvedBy }
      );

    } catch (error) {
      console.error('Error resolving alert:', error);
      throw error;
    }
  }

  // Private helper methods

  private generateId(): string {
    return crypto.randomUUID();
  }

  private determineSeverity(eventType: SecurityEventType): SecurityEventSeverity {
    const severityMap: Record<SecurityEventType, SecurityEventSeverity> = {
      [SecurityEventType.LOGIN_ATTEMPT]: SecurityEventSeverity.INFO,
      [SecurityEventType.LOGIN_SUCCESS]: SecurityEventSeverity.INFO,
      [SecurityEventType.LOGIN_FAILURE]: SecurityEventSeverity.LOW,
      [SecurityEventType.LOGOUT]: SecurityEventSeverity.INFO,
      
      [SecurityEventType.ROLE_REQUEST_CREATED]: SecurityEventSeverity.INFO,
      [SecurityEventType.ROLE_REQUEST_APPROVED]: SecurityEventSeverity.INFO,
      [SecurityEventType.ROLE_REQUEST_DENIED]: SecurityEventSeverity.INFO,
      [SecurityEventType.ROLE_REQUEST_EXPIRED]: SecurityEventSeverity.LOW,
      
      [SecurityEventType.ROLE_ASSIGNED]: SecurityEventSeverity.MEDIUM,
      [SecurityEventType.ROLE_REVOKED]: SecurityEventSeverity.MEDIUM,
      [SecurityEventType.ROLE_CHANGED]: SecurityEventSeverity.MEDIUM,
      [SecurityEventType.ROLE_EXPIRED]: SecurityEventSeverity.LOW,
      
      [SecurityEventType.RAPID_ROLE_REQUESTS]: SecurityEventSeverity.HIGH,
      [SecurityEventType.PRIVILEGE_ESCALATION_ATTEMPT]: SecurityEventSeverity.CRITICAL,
      [SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT]: SecurityEventSeverity.HIGH,
      [SecurityEventType.SUSPICIOUS_PATTERN_DETECTED]: SecurityEventSeverity.MEDIUM,
      [SecurityEventType.BULK_OPERATION_ANOMALY]: SecurityEventSeverity.MEDIUM,
      
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: SecurityEventSeverity.LOW,
      [SecurityEventType.PERMISSION_VIOLATION]: SecurityEventSeverity.MEDIUM,
      [SecurityEventType.SELF_APPROVAL_ATTEMPT]: SecurityEventSeverity.HIGH,
      [SecurityEventType.INVALID_ROLE_TRANSITION]: SecurityEventSeverity.MEDIUM,
      
      [SecurityEventType.USER_BLOCKED]: SecurityEventSeverity.MEDIUM,
      [SecurityEventType.USER_UNBLOCKED]: SecurityEventSeverity.MEDIUM,
      [SecurityEventType.RATE_LIMIT_RESET]: SecurityEventSeverity.LOW,
      [SecurityEventType.SECURITY_ALERT_RESOLVED]: SecurityEventSeverity.INFO,
      
      [SecurityEventType.CONFIGURATION_CHANGED]: SecurityEventSeverity.MEDIUM,
      [SecurityEventType.SECURITY_POLICY_UPDATED]: SecurityEventSeverity.HIGH,
      [SecurityEventType.AUDIT_LOG_ACCESSED]: SecurityEventSeverity.MEDIUM
    };

    return severityMap[eventType] || SecurityEventSeverity.MEDIUM;
  }

  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      const supabase = createClient();
      
      const eventRows = events.map(event => ({
        id: event.id,
        event_type: event.eventType,
        severity: event.severity,
        user_id: event.userId,
        target_user_id: event.targetUserId,
        institution_id: event.institutionId,
        department_id: event.departmentId,
        description: event.description,
        details: event.details,
        timestamp: event.timestamp.toISOString(),
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        session_id: event.sessionId,
        correlation_id: event.correlationId,
        resolved: event.resolved
      }));

      await supabase
        .from('security_events')
        .insert(eventRows);

    } catch (error) {
      console.error('Error flushing security event buffer:', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...events);
    }
  }

  private async analyzeForSuspiciousPatterns(event: SecurityEvent): Promise<void> {
    if (!event.userId) {
      return;
    }

    try {
      // Check for rapid role requests
      if (event.eventType === SecurityEventType.ROLE_REQUEST_CREATED) {
        await this.checkRapidRoleRequests(event.userId, event.institutionId);
      }

      // Check for privilege escalation patterns
      if (event.eventType === SecurityEventType.ROLE_REQUEST_CREATED && 
          event.details.requestedRole === UserRole.SYSTEM_ADMIN) {
        await this.checkPrivilegeEscalationPattern(event.userId);
      }

      // Check for permission violations
      if (event.eventType === SecurityEventType.PERMISSION_VIOLATION) {
        await this.checkRepeatedPermissionViolations(event.userId);
      }

    } catch (error) {
      console.error('Error analyzing suspicious patterns:', error);
    }
  }

  private async checkRapidRoleRequests(userId: string, institutionId?: string): Promise<void> {
    const supabase = createClient();
    
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { data, error } = await supabase
      .from('security_events')
      .select('id')
      .eq('user_id', userId)
      .eq('event_type', SecurityEventType.ROLE_REQUEST_CREATED)
      .gte('timestamp', oneHourAgo.toISOString());

    if (!error && data && data.length >= 5) {
      await this.logSuspiciousActivity(
        'rapid_role_requests',
        userId,
        `User made ${data.length} role requests in the last hour`,
        SecurityEventSeverity.HIGH,
        { requestCount: data.length, timeWindow: '1 hour' },
        institutionId
      );
    }
  }

  private async checkPrivilegeEscalationPattern(userId: string): Promise<void> {
    // Implementation would check for patterns indicating privilege escalation attempts
    await this.logSuspiciousActivity(
      'privilege_escalation_attempt',
      userId,
      'User requested system admin role',
      SecurityEventSeverity.CRITICAL,
      { requestedRole: UserRole.SYSTEM_ADMIN }
    );
  }

  private async checkRepeatedPermissionViolations(userId: string): Promise<void> {
    const supabase = createClient();
    
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data, error } = await supabase
      .from('security_events')
      .select('id')
      .eq('user_id', userId)
      .eq('event_type', SecurityEventType.PERMISSION_VIOLATION)
      .gte('timestamp', oneDayAgo.toISOString());

    if (!error && data && data.length >= 3) {
      await this.logSuspiciousActivity(
        'repeated_permission_violations',
        userId,
        `User had ${data.length} permission violations in the last day`,
        SecurityEventSeverity.MEDIUM,
        { violationCount: data.length, timeWindow: '1 day' }
      );
    }
  }

  private async createSecurityAlert(event: SecurityEvent): Promise<void> {
    const supabase = createClient();

    try {
      const alert: Omit<SecurityAlert, 'events'> = {
        id: this.generateId(),
        alertType: event.eventType,
        severity: event.severity,
        title: `Security Alert: ${event.eventType}`,
        description: event.description,
        userId: event.userId,
        institutionId: event.institutionId,
        createdAt: new Date(),
        acknowledged: false,
        resolved: false
      };

      // Insert alert
      await supabase
        .from('security_alerts')
        .insert({
          id: alert.id,
          alert_type: alert.alertType,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          user_id: alert.userId,
          institution_id: alert.institutionId,
          created_at: alert.createdAt.toISOString(),
          acknowledged: alert.acknowledged,
          resolved: alert.resolved
        });

      // Link event to alert
      await supabase
        .from('security_alert_events')
        .insert({
          alert_id: alert.id,
          event_id: event.id
        });

    } catch (error) {
      console.error('Error creating security alert:', error);
    }
  }

  private mapRowToSecurityEvent(row: any): SecurityEvent {
    return {
      id: row.id,
      eventType: row.event_type,
      severity: row.severity,
      userId: row.user_id,
      targetUserId: row.target_user_id,
      institutionId: row.institution_id,
      departmentId: row.department_id,
      description: row.description,
      details: row.details || {},
      timestamp: new Date(row.timestamp),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      sessionId: row.session_id,
      correlationId: row.correlation_id,
      resolved: row.resolved,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolution: row.resolution
    };
  }

  private calculateUserRiskScore(eventCount: number): number {
    // Simplified risk score calculation
    // In a real implementation, this would consider event types, severity, patterns, etc.
    return Math.min(100, eventCount * 5);
  }

  private calculateInstitutionRiskScore(eventCount: number): number {
    // Simplified risk score calculation for institutions
    return Math.min(100, Math.log(eventCount + 1) * 20);
  }
}