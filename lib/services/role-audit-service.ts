import { createClient } from '@/lib/supabase/server';
import { AuditLogger } from './audit-logger';
import {
  UserRole,
  RoleStatus,
  AuditAction,
  RoleAuditLog,
  UserRoleAssignment,
  RoleRequest,
  RoleRequestStatus
} from '../types/role-management';

export interface RoleAuditEntry extends RoleAuditLog {
  performedByName?: string;
  performedByEmail?: string;
  userName?: string;
  userEmail?: string;
  institutionName?: string;
  departmentName?: string;
}

export interface SuspiciousActivity {
  id: string;
  type: 'rapid_role_changes' | 'privilege_escalation' | 'unusual_pattern' | 'bulk_assignment_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  userId: string;
  performedBy: string;
  detectedAt: Date;
  relatedAuditIds: string[];
  metadata: Record<string, any>;
  flagged: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

export interface RoleAuditQuery {
  userId?: string;
  performedBy?: string;
  action?: AuditAction;
  role?: UserRole;
  institutionId?: string;
  departmentId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface RoleAuditReport {
  id: string;
  title: string;
  generatedBy: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  institutionId?: string;
  departmentId?: string;
  summary: {
    totalRoleChanges: number;
    roleAssignments: number;
    roleRevocations: number;
    roleRequests: number;
    approvals: number;
    denials: number;
    suspiciousActivities: number;
    roleDistribution: Record<UserRole, number>;
    topPerformers: Array<{ userId: string; userName: string; actionCount: number }>;
    departmentActivity: Array<{ departmentId: string; departmentName: string; actionCount: number }>;
  };
  entries: RoleAuditEntry[];
  suspiciousActivities: SuspiciousActivity[];
}

export class RoleAuditService {
  private supabase = createClient();
  private auditLogger = new AuditLogger();

  /**
   * Log role assignment action
   */
  async logRoleAssignment(
    assignment: UserRoleAssignment,
    performedBy: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditEntry: RoleAuditLog = {
      id: crypto.randomUUID(),
      userId: assignment.userId,
      action: AuditAction.ASSIGNED,
      newRole: assignment.role,
      changedBy: performedBy,
      reason,
      timestamp: new Date(),
      institutionId: assignment.institutionId,
      departmentId: assignment.departmentId,
      metadata: {
        assignmentId: assignment.id,
        isTemporary: assignment.isTemporary,
        expiresAt: assignment.expiresAt?.toISOString(),
        ...assignment.metadata
      }
    };

    await this.storeRoleAuditEntry(auditEntry);

    // Also log in general audit system
    await this.auditLogger.logAdministrativeAction(
      'user',
      assignment.userId,
      'role_assigned',
      performedBy,
      'admin', // TODO: Get actual role of performer
      {
        after: { role: assignment.role },
        fields: ['role']
      },
      auditEntry.metadata,
      assignment.role === UserRole.SYSTEM_ADMIN ? 'critical' : 'medium',
      ipAddress,
      userAgent,
      sessionId
    );

    // Check for suspicious activity
    await this.detectSuspiciousActivity(auditEntry);

    return auditEntry.id;
  }

  /**
   * Log role revocation action
   */
  async logRoleRevocation(
    userId: string,
    oldRole: UserRole,
    performedBy: string,
    reason?: string,
    institutionId?: string,
    departmentId?: string,
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditEntry: RoleAuditLog = {
      id: crypto.randomUUID(),
      userId,
      action: AuditAction.REVOKED,
      oldRole,
      changedBy: performedBy,
      reason,
      timestamp: new Date(),
      institutionId,
      departmentId,
      metadata: {}
    };

    await this.storeRoleAuditEntry(auditEntry);

    await this.auditLogger.logAdministrativeAction(
      'user',
      userId,
      'role_revoked',
      performedBy,
      'admin',
      {
        before: { role: oldRole },
        fields: ['role']
      },
      auditEntry.metadata,
      'high',
      ipAddress,
      userAgent,
      sessionId
    );

    await this.detectSuspiciousActivity(auditEntry);

    return auditEntry.id;
  }

  /**
   * Log role change action
   */
  async logRoleChange(
    userId: string,
    oldRole: UserRole,
    newRole: UserRole,
    performedBy: string,
    reason?: string,
    institutionId?: string,
    departmentId?: string,
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditEntry: RoleAuditLog = {
      id: crypto.randomUUID(),
      userId,
      action: AuditAction.CHANGED,
      oldRole,
      newRole,
      changedBy: performedBy,
      reason,
      timestamp: new Date(),
      institutionId,
      departmentId,
      metadata: {}
    };

    await this.storeRoleAuditEntry(auditEntry);

    const severity = this.determineRoleChangeSeverity(oldRole, newRole);
    await this.auditLogger.logAdministrativeAction(
      'user',
      userId,
      'role_changed',
      performedBy,
      'admin',
      {
        before: { role: oldRole },
        after: { role: newRole },
        fields: ['role']
      },
      auditEntry.metadata,
      severity,
      ipAddress,
      userAgent,
      sessionId
    );

    await this.detectSuspiciousActivity(auditEntry);

    return auditEntry.id;
  }

  /**
   * Log role request action
   */
  async logRoleRequest(
    request: RoleRequest,
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditEntry: RoleAuditLog = {
      id: crypto.randomUUID(),
      userId: request.userId,
      action: AuditAction.REQUESTED,
      oldRole: request.currentRole,
      newRole: request.requestedRole,
      changedBy: request.userId, // User requesting for themselves
      reason: request.justification,
      timestamp: new Date(),
      institutionId: request.institutionId,
      departmentId: request.departmentId,
      metadata: {
        requestId: request.id,
        verificationMethod: request.verificationMethod
      }
    };

    await this.storeRoleAuditEntry(auditEntry);

    await this.auditLogger.logAdministrativeAction(
      'user',
      request.userId,
      'role_requested',
      request.userId,
      'user',
      undefined,
      auditEntry.metadata,
      'low',
      ipAddress,
      userAgent,
      sessionId
    );

    return auditEntry.id;
  }

  /**
   * Log role request approval/denial
   */
  async logRoleRequestDecision(
    request: RoleRequest,
    decision: 'approved' | 'denied',
    reviewedBy: string,
    reviewNotes?: string,
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditEntry: RoleAuditLog = {
      id: crypto.randomUUID(),
      userId: request.userId,
      action: decision === 'approved' ? AuditAction.APPROVED : AuditAction.DENIED,
      oldRole: request.currentRole,
      newRole: request.requestedRole,
      changedBy: reviewedBy,
      reason: reviewNotes || `Role request ${decision}`,
      timestamp: new Date(),
      institutionId: request.institutionId,
      departmentId: request.departmentId,
      metadata: {
        requestId: request.id,
        originalJustification: request.justification,
        verificationMethod: request.verificationMethod
      }
    };

    await this.storeRoleAuditEntry(auditEntry);

    await this.auditLogger.logAdministrativeAction(
      'user',
      request.userId,
      `role_request_${decision}`,
      reviewedBy,
      'admin',
      undefined,
      auditEntry.metadata,
      decision === 'denied' ? 'medium' : 'low',
      ipAddress,
      userAgent,
      sessionId
    );

    return auditEntry.id;
  }

  /**
   * Log role expiration
   */
  async logRoleExpiration(
    userId: string,
    expiredRole: UserRole,
    institutionId?: string,
    departmentId?: string
  ): Promise<string> {
    const auditEntry: RoleAuditLog = {
      id: crypto.randomUUID(),
      userId,
      action: AuditAction.EXPIRED,
      oldRole: expiredRole,
      changedBy: 'system',
      reason: 'Temporary role expired',
      timestamp: new Date(),
      institutionId,
      departmentId,
      metadata: {
        automated: true
      }
    };

    await this.storeRoleAuditEntry(auditEntry);

    await this.auditLogger.logSystemAction(
      'user',
      userId,
      'role_expired',
      'system',
      {
        before: { role: expiredRole },
        fields: ['role']
      },
      auditEntry.metadata,
      'medium'
    );

    return auditEntry.id;
  }

  /**
   * Query role audit logs with filtering and enrichment
   */
  async queryRoleAuditLogs(query: RoleAuditQuery): Promise<{
    entries: RoleAuditEntry[];
    totalCount: number;
    hasMore: boolean;
  }> {
    let supabaseQuery = this.supabase
      .from('role_audit_log')
      .select(`
        *,
        performer:users!role_audit_log_changed_by_fkey(id, full_name, email),
        user:users!role_audit_log_user_id_fkey(id, full_name, email),
        institution:institutions(id, name),
        department:departments(id, name)
      `, { count: 'exact' })
      .order('timestamp', { ascending: false });

    // Apply filters
    if (query.userId) {
      supabaseQuery = supabaseQuery.eq('user_id', query.userId);
    }

    if (query.performedBy) {
      supabaseQuery = supabaseQuery.eq('changed_by', query.performedBy);
    }

    if (query.action) {
      supabaseQuery = supabaseQuery.eq('action', query.action);
    }

    if (query.role) {
      supabaseQuery = supabaseQuery.or(`old_role.eq.${query.role},new_role.eq.${query.role}`);
    }

    if (query.institutionId) {
      supabaseQuery = supabaseQuery.eq('institution_id', query.institutionId);
    }

    if (query.departmentId) {
      supabaseQuery = supabaseQuery.eq('department_id', query.departmentId);
    }

    if (query.startDate) {
      supabaseQuery = supabaseQuery.gte('timestamp', query.startDate.toISOString());
    }

    if (query.endDate) {
      supabaseQuery = supabaseQuery.lte('timestamp', query.endDate.toISOString());
    }

    // Apply pagination
    const limit = query.limit || 100;
    const offset = query.offset || 0;
    supabaseQuery = supabaseQuery.range(offset, offset + limit - 1);

    const { data, error, count } = await supabaseQuery;

    if (error) {
      throw new Error(`Failed to query role audit logs: ${error.message}`);
    }

    const entries: RoleAuditEntry[] = (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      oldRole: row.old_role,
      newRole: row.new_role,
      changedBy: row.changed_by,
      reason: row.reason,
      timestamp: new Date(row.timestamp),
      institutionId: row.institution_id,
      departmentId: row.department_id,
      metadata: row.metadata || {},
      performedByName: row.performer?.full_name,
      performedByEmail: row.performer?.email,
      userName: row.user?.full_name,
      userEmail: row.user?.email,
      institutionName: row.institution?.name,
      departmentName: row.department?.name
    }));

    return {
      entries,
      totalCount: count || 0,
      hasMore: (offset + limit) < (count || 0)
    };
  }

  /**
   * Detect suspicious activity patterns
   */
  async detectSuspiciousActivity(auditEntry: RoleAuditLog): Promise<void> {
    const suspiciousActivities: SuspiciousActivity[] = [];

    // Check for rapid role changes (more than 3 in 1 hour)
    const rapidChanges = await this.checkRapidRoleChanges(auditEntry.userId, auditEntry.changedBy);
    if (rapidChanges) {
      suspiciousActivities.push(rapidChanges);
    }

    // Check for privilege escalation patterns
    const privilegeEscalation = await this.checkPrivilegeEscalation(auditEntry);
    if (privilegeEscalation) {
      suspiciousActivities.push(privilegeEscalation);
    }

    // Check for unusual patterns (e.g., role changes outside business hours)
    const unusualPattern = await this.checkUnusualPatterns(auditEntry);
    if (unusualPattern) {
      suspiciousActivities.push(unusualPattern);
    }

    // Store suspicious activities
    for (const activity of suspiciousActivities) {
      await this.storeSuspiciousActivity(activity);
    }
  }

  /**
   * Generate comprehensive role audit report
   */
  async generateRoleAuditReport(
    title: string,
    generatedBy: string,
    periodStart: Date,
    periodEnd: Date,
    institutionId?: string,
    departmentId?: string
  ): Promise<RoleAuditReport> {
    const reportId = crypto.randomUUID();
    const generatedAt = new Date();

    // Query all entries for the period
    const { entries } = await this.queryRoleAuditLogs({
      institutionId,
      departmentId,
      startDate: periodStart,
      endDate: periodEnd,
      limit: 10000
    });

    // Query suspicious activities
    const suspiciousActivities = await this.getSuspiciousActivities({
      startDate: periodStart,
      endDate: periodEnd,
      institutionId,
      departmentId
    });

    // Generate summary statistics
    const summary = await this.generateReportSummary(entries, institutionId, departmentId);

    const report: RoleAuditReport = {
      id: reportId,
      title,
      generatedBy,
      generatedAt,
      periodStart,
      periodEnd,
      institutionId,
      departmentId,
      summary,
      entries,
      suspiciousActivities
    };

    // Store the report
    await this.storeRoleAuditReport(report);

    return report;
  }

  /**
   * Get suspicious activities with filtering
   */
  async getSuspiciousActivities(filters: {
    startDate?: Date;
    endDate?: Date;
    institutionId?: string;
    departmentId?: string;
    severity?: string[];
    flagged?: boolean;
  }): Promise<SuspiciousActivity[]> {
    let query = this.supabase
      .from('role_suspicious_activities')
      .select('*')
      .order('detected_at', { ascending: false });

    if (filters.startDate) {
      query = query.gte('detected_at', filters.startDate.toISOString());
    }

    if (filters.endDate) {
      query = query.lte('detected_at', filters.endDate.toISOString());
    }

    if (filters.severity && filters.severity.length > 0) {
      query = query.in('severity', filters.severity);
    }

    if (filters.flagged !== undefined) {
      query = query.eq('flagged', filters.flagged);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get suspicious activities: ${error.message}`);
    }

    return (data || []).map(row => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      description: row.description,
      userId: row.user_id,
      performedBy: row.performed_by,
      detectedAt: new Date(row.detected_at),
      relatedAuditIds: row.related_audit_ids || [],
      metadata: row.metadata || {},
      flagged: row.flagged,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      reviewNotes: row.review_notes
    }));
  }

  /**
   * Flag suspicious activity for review
   */
  async flagSuspiciousActivity(
    activityId: string,
    reviewedBy: string,
    reviewNotes?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('role_suspicious_activities')
      .update({
        flagged: true,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes
      })
      .eq('id', activityId);

    if (error) {
      throw new Error(`Failed to flag suspicious activity: ${error.message}`);
    }
  }

  // Private helper methods
  private async storeRoleAuditEntry(entry: RoleAuditLog): Promise<void> {
    const { error } = await this.supabase
      .from('role_audit_log')
      .insert({
        id: entry.id,
        user_id: entry.userId,
        action: entry.action,
        old_role: entry.oldRole,
        new_role: entry.newRole,
        changed_by: entry.changedBy,
        reason: entry.reason,
        timestamp: entry.timestamp.toISOString(),
        institution_id: entry.institutionId,
        department_id: entry.departmentId,
        metadata: entry.metadata
      });

    if (error) {
      console.error('Failed to store role audit entry:', error);
      throw new Error(`Failed to store role audit entry: ${error.message}`);
    }
  }

  private async checkRapidRoleChanges(
    userId: string,
    performedBy: string
  ): Promise<SuspiciousActivity | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const { data, error } = await this.supabase
      .from('role_audit_log')
      .select('id, action, timestamp')
      .eq('user_id', userId)
      .eq('changed_by', performedBy)
      .gte('timestamp', oneHourAgo.toISOString())
      .order('timestamp', { ascending: false });

    if (error || !data || data.length < 3) {
      return null;
    }

    return {
      id: crypto.randomUUID(),
      type: 'rapid_role_changes',
      severity: 'high',
      description: `${data.length} role changes detected within 1 hour for user ${userId}`,
      userId,
      performedBy,
      detectedAt: new Date(),
      relatedAuditIds: data.map(d => d.id),
      metadata: {
        changeCount: data.length,
        timeWindow: '1 hour'
      },
      flagged: false
    };
  }

  private async checkPrivilegeEscalation(auditEntry: RoleAuditLog): Promise<SuspiciousActivity | null> {
    if (!auditEntry.oldRole || !auditEntry.newRole) {
      return null;
    }

    const roleHierarchy = {
      [UserRole.STUDENT]: 1,
      [UserRole.TEACHER]: 2,
      [UserRole.DEPARTMENT_ADMIN]: 3,
      [UserRole.INSTITUTION_ADMIN]: 4,
      [UserRole.SYSTEM_ADMIN]: 5
    };

    const oldLevel = roleHierarchy[auditEntry.oldRole];
    const newLevel = roleHierarchy[auditEntry.newRole];

    // Check for significant privilege escalation (jumping more than 1 level)
    if (newLevel > oldLevel && (newLevel - oldLevel) > 1) {
      return {
        id: crypto.randomUUID(),
        type: 'privilege_escalation',
        severity: newLevel === 5 ? 'critical' : 'high',
        description: `Significant privilege escalation from ${auditEntry.oldRole} to ${auditEntry.newRole}`,
        userId: auditEntry.userId,
        performedBy: auditEntry.changedBy,
        detectedAt: new Date(),
        relatedAuditIds: [auditEntry.id],
        metadata: {
          oldRole: auditEntry.oldRole,
          newRole: auditEntry.newRole,
          levelJump: newLevel - oldLevel
        },
        flagged: false
      };
    }

    return null;
  }

  private async checkUnusualPatterns(auditEntry: RoleAuditLog): Promise<SuspiciousActivity | null> {
    const hour = auditEntry.timestamp.getHours();
    const day = auditEntry.timestamp.getDay();

    // Check for role changes outside business hours (9 AM - 5 PM, Mon-Fri)
    const isWeekend = day === 0 || day === 6;
    const isOutsideBusinessHours = hour < 9 || hour > 17;

    if ((isWeekend || isOutsideBusinessHours) && auditEntry.changedBy !== 'system') {
      return {
        id: crypto.randomUUID(),
        type: 'unusual_pattern',
        severity: 'medium',
        description: `Role change performed outside business hours: ${auditEntry.timestamp.toISOString()}`,
        userId: auditEntry.userId,
        performedBy: auditEntry.changedBy,
        detectedAt: new Date(),
        relatedAuditIds: [auditEntry.id],
        metadata: {
          timestamp: auditEntry.timestamp.toISOString(),
          isWeekend,
          isOutsideBusinessHours,
          hour,
          day
        },
        flagged: false
      };
    }

    return null;
  }

  private async storeSuspiciousActivity(activity: SuspiciousActivity): Promise<void> {
    const { error } = await this.supabase
      .from('role_suspicious_activities')
      .insert({
        id: activity.id,
        type: activity.type,
        severity: activity.severity,
        description: activity.description,
        user_id: activity.userId,
        performed_by: activity.performedBy,
        detected_at: activity.detectedAt.toISOString(),
        related_audit_ids: activity.relatedAuditIds,
        metadata: activity.metadata,
        flagged: activity.flagged
      });

    if (error) {
      console.error('Failed to store suspicious activity:', error);
    }
  }

  private determineRoleChangeSeverity(oldRole: UserRole, newRole: UserRole): 'low' | 'medium' | 'high' | 'critical' {
    const roleHierarchy = {
      [UserRole.STUDENT]: 1,
      [UserRole.TEACHER]: 2,
      [UserRole.DEPARTMENT_ADMIN]: 3,
      [UserRole.INSTITUTION_ADMIN]: 4,
      [UserRole.SYSTEM_ADMIN]: 5
    };

    const oldLevel = roleHierarchy[oldRole];
    const newLevel = roleHierarchy[newRole];

    if (newRole === UserRole.SYSTEM_ADMIN) {
      return 'critical';
    }

    if (newLevel > oldLevel && (newLevel - oldLevel) > 1) {
      return 'high';
    }

    if (newLevel > oldLevel) {
      return 'medium';
    }

    return 'low';
  }

  private async generateReportSummary(
    entries: RoleAuditEntry[],
    institutionId?: string,
    departmentId?: string
  ): Promise<RoleAuditReport['summary']> {
    const actionCounts = {
      [AuditAction.ASSIGNED]: 0,
      [AuditAction.REVOKED]: 0,
      [AuditAction.CHANGED]: 0,
      [AuditAction.REQUESTED]: 0,
      [AuditAction.APPROVED]: 0,
      [AuditAction.DENIED]: 0,
      [AuditAction.EXPIRED]: 0
    };

    const roleDistribution: Record<UserRole, number> = {
      [UserRole.STUDENT]: 0,
      [UserRole.TEACHER]: 0,
      [UserRole.DEPARTMENT_ADMIN]: 0,
      [UserRole.INSTITUTION_ADMIN]: 0,
      [UserRole.SYSTEM_ADMIN]: 0
    };

    const performerCounts: Record<string, { name: string; count: number }> = {};
    const departmentCounts: Record<string, { name: string; count: number }> = {};

    entries.forEach(entry => {
      // Count actions
      actionCounts[entry.action]++;

      // Count role distribution
      if (entry.newRole) {
        roleDistribution[entry.newRole]++;
      }

      // Count performers
      if (entry.changedBy !== 'system') {
        if (!performerCounts[entry.changedBy]) {
          performerCounts[entry.changedBy] = {
            name: entry.performedByName || entry.performedByEmail || entry.changedBy,
            count: 0
          };
        }
        performerCounts[entry.changedBy].count++;
      }

      // Count department activity
      if (entry.departmentId && entry.departmentName) {
        if (!departmentCounts[entry.departmentId]) {
          departmentCounts[entry.departmentId] = {
            name: entry.departmentName,
            count: 0
          };
        }
        departmentCounts[entry.departmentId].count++;
      }
    });

    const topPerformers = Object.entries(performerCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([userId, data]) => ({
        userId,
        userName: data.name,
        actionCount: data.count
      }));

    const departmentActivity = Object.entries(departmentCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([departmentId, data]) => ({
        departmentId,
        departmentName: data.name,
        actionCount: data.count
      }));

    // Get suspicious activities count
    const suspiciousActivities = await this.getSuspiciousActivities({
      institutionId,
      departmentId
    });

    return {
      totalRoleChanges: entries.length,
      roleAssignments: actionCounts[AuditAction.ASSIGNED],
      roleRevocations: actionCounts[AuditAction.REVOKED],
      roleRequests: actionCounts[AuditAction.REQUESTED],
      approvals: actionCounts[AuditAction.APPROVED],
      denials: actionCounts[AuditAction.DENIED],
      suspiciousActivities: suspiciousActivities.length,
      roleDistribution,
      topPerformers,
      departmentActivity
    };
  }

  private async storeRoleAuditReport(report: RoleAuditReport): Promise<void> {
    const { error } = await this.supabase
      .from('role_audit_reports')
      .insert({
        id: report.id,
        title: report.title,
        generated_by: report.generatedBy,
        generated_at: report.generatedAt.toISOString(),
        period_start: report.periodStart.toISOString(),
        period_end: report.periodEnd.toISOString(),
        institution_id: report.institutionId,
        department_id: report.departmentId,
        summary: report.summary,
        entry_count: report.entries.length,
        suspicious_activity_count: report.suspiciousActivities.length
      });

    if (error) {
      console.error('Failed to store role audit report:', error);
    }
  }
}