import { createClient } from '@/lib/supabase/server';

export interface AuditLogEntry {
  id: string;
  student_id: string;
  class_id: string;
  action: EnrollmentAuditAction;
  performed_by: string;
  reason?: string;
  timestamp: Date;
  metadata: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
}

export enum EnrollmentAuditAction {
  ENROLLED = 'enrolled',
  DROPPED = 'dropped',
  WITHDRAWN = 'withdrawn',
  WAITLISTED = 'waitlisted',
  APPROVED = 'approved',
  DENIED = 'denied',
  INVITED = 'invited',
  TRANSFERRED = 'transferred',
  BULK_ENROLLED = 'bulk_enrolled',
  CAPACITY_CHANGED = 'capacity_changed',
  CONFIG_UPDATED = 'config_updated',
  PREREQUISITE_OVERRIDE = 'prerequisite_override',
  ADMIN_OVERRIDE = 'admin_override',
  DATA_ACCESSED = 'data_accessed',
  DATA_EXPORTED = 'data_exported',
  PRIVACY_SETTINGS_CHANGED = 'privacy_settings_changed'
}

export interface AuditContext {
  performedBy: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export class EnrollmentAuditService {
  private supabase = createClient();

  /**
   * Log an enrollment action with comprehensive audit trail
   */
  async logAction(
    studentId: string,
    classId: string,
    action: EnrollmentAuditAction,
    context: AuditContext
  ): Promise<void> {
    try {
      const auditEntry = {
        student_id: studentId,
        class_id: classId,
        action,
        performed_by: context.performedBy,
        reason: context.reason,
        timestamp: new Date().toISOString(),
        metadata: {
          ...context.metadata,
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
          session_id: context.sessionId
        }
      };

      const { error } = await this.supabase
        .from('enrollment_audit_log')
        .insert(auditEntry);

      if (error) {
        console.error('Failed to log audit entry:', error);
        // Don't throw error to avoid breaking main operations
      }
    } catch (error) {
      console.error('Audit logging error:', error);
    }
  }

  /**
   * Log bulk enrollment actions
   */
  async logBulkAction(
    studentIds: string[],
    classId: string,
    action: EnrollmentAuditAction,
    context: AuditContext
  ): Promise<void> {
    const auditEntries = studentIds.map(studentId => ({
      student_id: studentId,
      class_id: classId,
      action,
      performed_by: context.performedBy,
      reason: context.reason,
      timestamp: new Date().toISOString(),
      metadata: {
        ...context.metadata,
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
        session_id: context.sessionId,
        bulk_operation: true,
        total_students: studentIds.length
      }
    }));

    try {
      const { error } = await this.supabase
        .from('enrollment_audit_log')
        .insert(auditEntries);

      if (error) {
        console.error('Failed to log bulk audit entries:', error);
      }
    } catch (error) {
      console.error('Bulk audit logging error:', error);
    }
  }

  /**
   * Get audit trail for a specific student
   */
  async getStudentAuditTrail(
    studentId: string,
    options: {
      classId?: string;
      startDate?: Date;
      endDate?: Date;
      actions?: EnrollmentAuditAction[];
      limit?: number;
    } = {}
  ): Promise<AuditLogEntry[]> {
    let query = this.supabase
      .from('enrollment_audit_log')
      .select(`
        *,
        student:users!enrollment_audit_log_student_id_fkey(id, email, full_name),
        class:classes!enrollment_audit_log_class_id_fkey(id, name, code),
        performer:users!enrollment_audit_log_performed_by_fkey(id, email, full_name)
      `)
      .eq('student_id', studentId)
      .order('timestamp', { ascending: false });

    if (options.classId) {
      query = query.eq('class_id', options.classId);
    }

    if (options.startDate) {
      query = query.gte('timestamp', options.startDate.toISOString());
    }

    if (options.endDate) {
      query = query.lte('timestamp', options.endDate.toISOString());
    }

    if (options.actions && options.actions.length > 0) {
      query = query.in('action', options.actions);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch audit trail: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get audit trail for a specific class
   */
  async getClassAuditTrail(
    classId: string,
    options: {
      studentId?: string;
      startDate?: Date;
      endDate?: Date;
      actions?: EnrollmentAuditAction[];
      limit?: number;
    } = {}
  ): Promise<AuditLogEntry[]> {
    let query = this.supabase
      .from('enrollment_audit_log')
      .select(`
        *,
        student:users!enrollment_audit_log_student_id_fkey(id, email, full_name),
        class:classes!enrollment_audit_log_class_id_fkey(id, name, code),
        performer:users!enrollment_audit_log_performed_by_fkey(id, email, full_name)
      `)
      .eq('class_id', classId)
      .order('timestamp', { ascending: false });

    if (options.studentId) {
      query = query.eq('student_id', options.studentId);
    }

    if (options.startDate) {
      query = query.gte('timestamp', options.startDate.toISOString());
    }

    if (options.endDate) {
      query = query.lte('timestamp', options.endDate.toISOString());
    }

    if (options.actions && options.actions.length > 0) {
      query = query.in('action', options.actions);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch class audit trail: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Generate audit report for compliance purposes
   */
  async generateAuditReport(
    options: {
      institutionId?: string;
      departmentId?: string;
      startDate: Date;
      endDate: Date;
      actions?: EnrollmentAuditAction[];
      includeMetadata?: boolean;
    }
  ): Promise<{
    summary: {
      totalActions: number;
      actionBreakdown: Record<string, number>;
      uniqueStudents: number;
      uniqueClasses: number;
    };
    entries: AuditLogEntry[];
  }> {
    let query = this.supabase
      .from('enrollment_audit_log')
      .select(`
        *,
        student:users!enrollment_audit_log_student_id_fkey(id, email, full_name),
        class:classes!enrollment_audit_log_class_id_fkey(id, name, code, department_id),
        performer:users!enrollment_audit_log_performed_by_fkey(id, email, full_name)
      `)
      .gte('timestamp', options.startDate.toISOString())
      .lte('timestamp', options.endDate.toISOString())
      .order('timestamp', { ascending: false });

    if (options.actions && options.actions.length > 0) {
      query = query.in('action', options.actions);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to generate audit report: ${error.message}`);
    }

    const entries = data || [];
    
    // Filter by institution/department if specified
    const filteredEntries = entries.filter(entry => {
      if (options.institutionId && entry.class?.institution_id !== options.institutionId) {
        return false;
      }
      if (options.departmentId && entry.class?.department_id !== options.departmentId) {
        return false;
      }
      return true;
    });

    // Generate summary statistics
    const actionBreakdown: Record<string, number> = {};
    const uniqueStudents = new Set<string>();
    const uniqueClasses = new Set<string>();

    filteredEntries.forEach(entry => {
      actionBreakdown[entry.action] = (actionBreakdown[entry.action] || 0) + 1;
      uniqueStudents.add(entry.student_id);
      uniqueClasses.add(entry.class_id);
    });

    return {
      summary: {
        totalActions: filteredEntries.length,
        actionBreakdown,
        uniqueStudents: uniqueStudents.size,
        uniqueClasses: uniqueClasses.size
      },
      entries: options.includeMetadata ? filteredEntries : filteredEntries.map(entry => ({
        ...entry,
        metadata: {} // Remove metadata for privacy if not explicitly requested
      }))
    };
  }

  /**
   * Check audit trail integrity
   */
  async verifyAuditIntegrity(
    studentId: string,
    classId: string
  ): Promise<{
    isValid: boolean;
    issues: string[];
    timeline: AuditLogEntry[];
  }> {
    const auditTrail = await this.getStudentAuditTrail(studentId, { classId });
    const issues: string[] = [];

    // Check for logical sequence of events
    const timeline = auditTrail.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let currentState: string | null = null;
    
    for (const entry of timeline) {
      switch (entry.action) {
        case EnrollmentAuditAction.ENROLLED:
          if (currentState === 'enrolled') {
            issues.push(`Duplicate enrollment detected at ${entry.timestamp}`);
          }
          currentState = 'enrolled';
          break;
          
        case EnrollmentAuditAction.DROPPED:
        case EnrollmentAuditAction.WITHDRAWN:
          if (currentState !== 'enrolled') {
            issues.push(`Drop/withdrawal without enrollment at ${entry.timestamp}`);
          }
          currentState = 'dropped';
          break;
          
        case EnrollmentAuditAction.WAITLISTED:
          currentState = 'waitlisted';
          break;
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      timeline
    };
  }
}