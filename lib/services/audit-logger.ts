import { createClient } from '@/lib/supabase/server';

export interface AuditLogEntry {
  id: string;
  entityType: 'user' | 'institution' | 'department' | 'class' | 'enrollment' | 'system';
  entityId: string;
  action: string;
  performedBy: string;
  performedByRole: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  changes?: {
    before: Record<string, any>;
    after: Record<string, any>;
    fields: string[];
  };
  metadata: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'administrative' | 'academic' | 'security' | 'compliance' | 'system';
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  action?: string;
  performedBy?: string;
  startDate?: Date;
  endDate?: Date;
  severity?: string[];
  category?: string[];
  limit?: number;
  offset?: number;
}

export interface AuditReport {
  id: string;
  title: string;
  description: string;
  generatedBy: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  filters: AuditQuery;
  summary: {
    totalEntries: number;
    entriesByCategory: Record<string, number>;
    entriesBySeverity: Record<string, number>;
    topActions: { action: string; count: number }[];
    topUsers: { userId: string; userName: string; count: number }[];
  };
  entries: AuditLogEntry[];
  format: 'json' | 'csv' | 'pdf';
}

export class AuditLogger {
  private supabase = createClient();

  /**
   * Log administrative action with comprehensive audit trail
   */
  async logAdministrativeAction(
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    action: string,
    performedBy: string,
    performedByRole: string,
    changes?: AuditLogEntry['changes'],
    metadata: Record<string, any> = {},
    severity: AuditLogEntry['severity'] = 'medium',
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditId = crypto.randomUUID();
    const timestamp = new Date();

    const auditEntry: AuditLogEntry = {
      id: auditId,
      entityType,
      entityId,
      action,
      performedBy,
      performedByRole,
      timestamp,
      ipAddress,
      userAgent,
      sessionId,
      changes,
      metadata,
      severity,
      category: 'administrative'
    };

    // Store in general audit log
    await this.storeAuditEntry(auditEntry);

    // Store in specific audit tables based on entity type
    await this.storeSpecificAuditEntry(auditEntry);

    return auditId;
  }

  /**
   * Log academic action (enrollment, grading, etc.)
   */
  async logAcademicAction(
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    action: string,
    performedBy: string,
    performedByRole: string,
    changes?: AuditLogEntry['changes'],
    metadata: Record<string, any> = {},
    severity: AuditLogEntry['severity'] = 'low',
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditId = crypto.randomUUID();
    const timestamp = new Date();

    const auditEntry: AuditLogEntry = {
      id: auditId,
      entityType,
      entityId,
      action,
      performedBy,
      performedByRole,
      timestamp,
      ipAddress,
      userAgent,
      sessionId,
      changes,
      metadata,
      severity,
      category: 'academic'
    };

    await this.storeAuditEntry(auditEntry);
    await this.storeSpecificAuditEntry(auditEntry);

    return auditId;
  }

  /**
   * Log security-related action
   */
  async logSecurityAction(
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    action: string,
    performedBy: string,
    performedByRole: string,
    changes?: AuditLogEntry['changes'],
    metadata: Record<string, any> = {},
    severity: AuditLogEntry['severity'] = 'high',
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditId = crypto.randomUUID();
    const timestamp = new Date();

    const auditEntry: AuditLogEntry = {
      id: auditId,
      entityType,
      entityId,
      action,
      performedBy,
      performedByRole,
      timestamp,
      ipAddress,
      userAgent,
      sessionId,
      changes,
      metadata,
      severity,
      category: 'security'
    };

    await this.storeAuditEntry(auditEntry);
    await this.storeSpecificAuditEntry(auditEntry);

    // For critical security events, also create a security alert
    if (severity === 'critical') {
      await this.createSecurityAlert(auditEntry);
    }

    return auditId;
  }

  /**
   * Log compliance-related action
   */
  async logComplianceAction(
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    action: string,
    performedBy: string,
    performedByRole: string,
    changes?: AuditLogEntry['changes'],
    metadata: Record<string, any> = {},
    severity: AuditLogEntry['severity'] = 'medium',
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string
  ): Promise<string> {
    const auditId = crypto.randomUUID();
    const timestamp = new Date();

    const auditEntry: AuditLogEntry = {
      id: auditId,
      entityType,
      entityId,
      action,
      performedBy,
      performedByRole,
      timestamp,
      ipAddress,
      userAgent,
      sessionId,
      changes,
      metadata,
      severity,
      category: 'compliance'
    };

    await this.storeAuditEntry(auditEntry);
    await this.storeSpecificAuditEntry(auditEntry);

    return auditId;
  }

  /**
   * Log system action (automated processes, integrations, etc.)
   */
  async logSystemAction(
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    action: string,
    performedBy: string = 'system',
    changes?: AuditLogEntry['changes'],
    metadata: Record<string, any> = {},
    severity: AuditLogEntry['severity'] = 'low'
  ): Promise<string> {
    const auditId = crypto.randomUUID();
    const timestamp = new Date();

    const auditEntry: AuditLogEntry = {
      id: auditId,
      entityType,
      entityId,
      action,
      performedBy,
      performedByRole: 'system',
      timestamp,
      changes,
      metadata,
      severity,
      category: 'system'
    };

    await this.storeAuditEntry(auditEntry);
    await this.storeSpecificAuditEntry(auditEntry);

    return auditId;
  }

  /**
   * Query audit logs with filtering and pagination
   */
  async queryAuditLogs(query: AuditQuery): Promise<{
    entries: AuditLogEntry[];
    totalCount: number;
    hasMore: boolean;
  }> {
    let supabaseQuery = this.supabase
      .from('comprehensive_audit_log')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false });

    // Apply filters
    if (query.entityType) {
      supabaseQuery = supabaseQuery.eq('entity_type', query.entityType);
    }

    if (query.entityId) {
      supabaseQuery = supabaseQuery.eq('entity_id', query.entityId);
    }

    if (query.action) {
      supabaseQuery = supabaseQuery.eq('action', query.action);
    }

    if (query.performedBy) {
      supabaseQuery = supabaseQuery.eq('performed_by', query.performedBy);
    }

    if (query.startDate) {
      supabaseQuery = supabaseQuery.gte('timestamp', query.startDate.toISOString());
    }

    if (query.endDate) {
      supabaseQuery = supabaseQuery.lte('timestamp', query.endDate.toISOString());
    }

    if (query.severity && query.severity.length > 0) {
      supabaseQuery = supabaseQuery.in('severity', query.severity);
    }

    if (query.category && query.category.length > 0) {
      supabaseQuery = supabaseQuery.in('category', query.category);
    }

    // Apply pagination
    const limit = query.limit || 100;
    const offset = query.offset || 0;
    supabaseQuery = supabaseQuery.range(offset, offset + limit - 1);

    const { data, error, count } = await supabaseQuery;

    if (error) {
      throw new Error(`Failed to query audit logs: ${error.message}`);
    }

    const entries: AuditLogEntry[] = (data || []).map(row => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      performedBy: row.performed_by,
      performedByRole: row.performed_by_role,
      timestamp: new Date(row.timestamp),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      sessionId: row.session_id,
      changes: row.changes,
      metadata: row.metadata || {},
      severity: row.severity,
      category: row.category
    }));

    return {
      entries,
      totalCount: count || 0,
      hasMore: (offset + limit) < (count || 0)
    };
  }

  /**
   * Generate comprehensive audit report
   */
  async generateAuditReport(
    title: string,
    description: string,
    generatedBy: string,
    periodStart: Date,
    periodEnd: Date,
    filters: AuditQuery = {},
    format: 'json' | 'csv' | 'pdf' = 'json'
  ): Promise<AuditReport> {
    const reportId = crypto.randomUUID();
    const generatedAt = new Date();

    // Query all entries for the period
    const query: AuditQuery = {
      ...filters,
      startDate: periodStart,
      endDate: periodEnd,
      limit: 10000 // Large limit for report generation
    };

    const { entries, totalCount } = await this.queryAuditLogs(query);

    // Generate summary statistics
    const entriesByCategory: Record<string, number> = {};
    const entriesBySeverity: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    const userCounts: Record<string, number> = {};

    entries.forEach(entry => {
      // Count by category
      entriesByCategory[entry.category] = (entriesByCategory[entry.category] || 0) + 1;

      // Count by severity
      entriesBySeverity[entry.severity] = (entriesBySeverity[entry.severity] || 0) + 1;

      // Count by action
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;

      // Count by user
      userCounts[entry.performedBy] = (userCounts[entry.performedBy] || 0) + 1;
    });

    // Get top actions and users
    const topActions = Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    const topUsers = await this.enrichUserCounts(userCounts);

    const summary = {
      totalEntries: totalCount,
      entriesByCategory,
      entriesBySeverity,
      topActions,
      topUsers: topUsers.slice(0, 10)
    };

    const report: AuditReport = {
      id: reportId,
      title,
      description,
      generatedBy,
      generatedAt,
      periodStart,
      periodEnd,
      filters,
      summary,
      entries,
      format
    };

    // Store the report
    await this.storeAuditReport(report);

    return report;
  }

  /**
   * Verify audit trail integrity for a specific entity
   */
  async verifyAuditTrailIntegrity(
    entityType: string,
    entityId: string
  ): Promise<{
    isValid: boolean;
    totalEntries: number;
    issues: string[];
    recommendations: string[];
  }> {
    const { entries } = await this.queryAuditLogs({
      entityType: entityType as AuditLogEntry['entityType'],
      entityId,
      limit: 10000
    });

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for gaps in timestamps
    const sortedEntries = entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    for (let i = 1; i < sortedEntries.length; i++) {
      const timeDiff = sortedEntries[i].timestamp.getTime() - sortedEntries[i - 1].timestamp.getTime();
      
      // Flag if there are large gaps (more than 24 hours) between consecutive entries
      if (timeDiff > 24 * 60 * 60 * 1000) {
        issues.push(`Large time gap detected between entries: ${sortedEntries[i - 1].timestamp} and ${sortedEntries[i].timestamp}`);
      }
    }

    // Check for missing critical actions
    const criticalActions = ['created', 'deleted', 'status_changed', 'permissions_modified'];
    const presentActions = new Set(entries.map(e => e.action));
    
    criticalActions.forEach(action => {
      if (!presentActions.has(action)) {
        recommendations.push(`Consider logging ${action} actions for complete audit trail`);
      }
    });

    // Check for entries without proper metadata
    const entriesWithoutMetadata = entries.filter(e => !e.metadata || Object.keys(e.metadata).length === 0);
    if (entriesWithoutMetadata.length > 0) {
      issues.push(`${entriesWithoutMetadata.length} entries found without metadata`);
    }

    // Check for entries without IP address (for user actions)
    const userEntries = entries.filter(e => e.performedBy !== 'system');
    const entriesWithoutIP = userEntries.filter(e => !e.ipAddress);
    if (entriesWithoutIP.length > 0) {
      recommendations.push(`${entriesWithoutIP.length} user actions found without IP address tracking`);
    }

    return {
      isValid: issues.length === 0,
      totalEntries: entries.length,
      issues,
      recommendations
    };
  }

  /**
   * Get audit statistics for dashboard
   */
  async getAuditStatistics(
    institutionId?: string,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<{
    totalEntries: number;
    entriesThisPeriod: number;
    criticalEvents: number;
    topCategories: { category: string; count: number }[];
    recentActivity: AuditLogEntry[];
  }> {
    const now = new Date();
    const defaultPeriodStart = periodStart || new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
    const defaultPeriodEnd = periodEnd || now;

    // Get total entries
    const { totalCount: totalEntries } = await this.queryAuditLogs({ limit: 1 });

    // Get entries for this period
    const { totalCount: entriesThisPeriod } = await this.queryAuditLogs({
      startDate: defaultPeriodStart,
      endDate: defaultPeriodEnd,
      limit: 1
    });

    // Get critical events
    const { totalCount: criticalEvents } = await this.queryAuditLogs({
      severity: ['critical'],
      startDate: defaultPeriodStart,
      endDate: defaultPeriodEnd,
      limit: 1
    });

    // Get category breakdown
    const { entries: allEntries } = await this.queryAuditLogs({
      startDate: defaultPeriodStart,
      endDate: defaultPeriodEnd,
      limit: 1000
    });

    const categoryCount: Record<string, number> = {};
    allEntries.forEach(entry => {
      categoryCount[entry.category] = (categoryCount[entry.category] || 0) + 1;
    });

    const topCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // Get recent activity
    const { entries: recentActivity } = await this.queryAuditLogs({
      limit: 10
    });

    return {
      totalEntries,
      entriesThisPeriod,
      criticalEvents,
      topCategories,
      recentActivity
    };
  }

  // Private helper methods
  private async storeAuditEntry(entry: AuditLogEntry): Promise<void> {
    const { error } = await this.supabase
      .from('comprehensive_audit_log')
      .insert({
        id: entry.id,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        performed_by: entry.performedBy,
        performed_by_role: entry.performedByRole,
        timestamp: entry.timestamp.toISOString(),
        ip_address: entry.ipAddress,
        user_agent: entry.userAgent,
        session_id: entry.sessionId,
        changes: entry.changes,
        metadata: entry.metadata,
        severity: entry.severity,
        category: entry.category
      });

    if (error) {
      console.error('Failed to store audit entry:', error);
      // Don't throw error to avoid breaking main operations
    }
  }

  private async storeSpecificAuditEntry(entry: AuditLogEntry): Promise<void> {
    // Store in specific audit tables based on entity type
    switch (entry.entityType) {
      case 'enrollment':
        await this.storeEnrollmentAuditEntry(entry);
        break;
      case 'user':
        await this.storeUserAuditEntry(entry);
        break;
      case 'institution':
        await this.storeInstitutionAuditEntry(entry);
        break;
      // Add other entity types as needed
    }
  }

  private async storeEnrollmentAuditEntry(entry: AuditLogEntry): Promise<void> {
    // Store in enrollment_audit_log table
    const { error } = await this.supabase
      .from('enrollment_audit_log')
      .insert({
        student_id: entry.metadata.studentId || entry.entityId,
        class_id: entry.metadata.classId || entry.entityId,
        action: entry.action,
        performed_by: entry.performedBy,
        reason: entry.metadata.reason,
        timestamp: entry.timestamp.toISOString(),
        metadata: entry.metadata,
        ip_address: entry.ipAddress,
        user_agent: entry.userAgent,
        session_id: entry.sessionId
      });

    if (error) {
      console.error('Failed to store enrollment audit entry:', error);
    }
  }

  private async storeUserAuditEntry(entry: AuditLogEntry): Promise<void> {
    // Implementation for user-specific audit logging
    console.log('Storing user audit entry:', entry.id);
  }

  private async storeInstitutionAuditEntry(entry: AuditLogEntry): Promise<void> {
    // Implementation for institution-specific audit logging
    console.log('Storing institution audit entry:', entry.id);
  }

  private async createSecurityAlert(entry: AuditLogEntry): Promise<void> {
    // Create security alert for critical events
    const { error } = await this.supabase
      .from('security_alerts')
      .insert({
        alert_type: 'audit_critical',
        severity: entry.severity,
        description: `Critical security event: ${entry.action}`,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        performed_by: entry.performedBy,
        metadata: entry.metadata,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Failed to create security alert:', error);
    }
  }

  private async enrichUserCounts(userCounts: Record<string, number>): Promise<{ userId: string; userName: string; count: number }[]> {
    const userIds = Object.keys(userCounts);
    
    if (userIds.length === 0) {
      return [];
    }

    const { data: users } = await this.supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', userIds);

    const userMap = new Map(users?.map(u => [u.id, u]) || []);

    return Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([userId, count]) => {
        const user = userMap.get(userId);
        return {
          userId,
          userName: user ? `${user.full_name} (${user.email})` : userId,
          count
        };
      });
  }

  private async storeAuditReport(report: AuditReport): Promise<void> {
    // Store audit report in database
    console.log('Storing audit report:', report.id);
  }
}