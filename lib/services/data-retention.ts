import { createClient } from '@/lib/supabase/server';

export interface RetentionPolicy {
  id: string;
  data_type: string;
  table_name: string;
  retention_period_days: number;
  action: 'archive' | 'delete' | 'anonymize';
  conditions?: Record<string, any>;
  enabled: boolean;
  last_executed?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PrivacyControl {
  id: string;
  student_id: string;
  data_type: string;
  access_level: 'public' | 'restricted' | 'private';
  allowed_roles: string[];
  expiry_date?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface DataDeletionRequest {
  id: string;
  student_id: string;
  requested_by: string;
  data_types: string[];
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'completed';
  requested_at: Date;
  processed_at?: Date;
  processed_by?: string;
  notes?: string;
}

export class DataRetentionService {
  private supabase = createClient();

  /**
   * Create or update retention policy
   */
  async createRetentionPolicy(
    dataType: string,
    tableName: string,
    retentionPeriodDays: number,
    action: 'archive' | 'delete' | 'anonymize',
    conditions?: Record<string, any>
  ): Promise<RetentionPolicy> {
    const policy = {
      data_type: dataType,
      table_name: tableName,
      retention_period_days: retentionPeriodDays,
      action,
      conditions: conditions || {},
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('retention_policies')
      .insert(policy)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create retention policy: ${error.message}`);
    }

    return data;
  }

  /**
   * Execute retention policies
   */
  async executeRetentionPolicies(): Promise<{
    policiesExecuted: number;
    recordsProcessed: number;
    recordsArchived: number;
    recordsDeleted: number;
    recordsAnonymized: number;
    errors: string[];
  }> {
    const { data: policies, error } = await this.supabase
      .from('retention_policies')
      .select('*')
      .eq('enabled', true);

    if (error) {
      throw new Error(`Failed to fetch retention policies: ${error.message}`);
    }

    let policiesExecuted = 0;
    let recordsProcessed = 0;
    let recordsArchived = 0;
    let recordsDeleted = 0;
    let recordsAnonymized = 0;
    const errors: string[] = [];

    for (const policy of policies || []) {
      try {
        const result = await this.executePolicy(policy);
        policiesExecuted++;
        recordsProcessed += result.recordsProcessed;
        
        switch (policy.action) {
          case 'archive':
            recordsArchived += result.recordsProcessed;
            break;
          case 'delete':
            recordsDeleted += result.recordsProcessed;
            break;
          case 'anonymize':
            recordsAnonymized += result.recordsProcessed;
            break;
        }

        // Update last executed timestamp
        await this.supabase
          .from('retention_policies')
          .update({ last_executed: new Date().toISOString() })
          .eq('id', policy.id);

      } catch (error) {
        errors.push(`Policy ${policy.id} (${policy.data_type}): ${error}`);
      }
    }

    return {
      policiesExecuted,
      recordsProcessed,
      recordsArchived,
      recordsDeleted,
      recordsAnonymized,
      errors
    };
  }

  /**
   * Set privacy controls for student data
   */
  async setPrivacyControl(
    studentId: string,
    dataType: string,
    accessLevel: 'public' | 'restricted' | 'private',
    allowedRoles: string[] = [],
    expiryDate?: Date
  ): Promise<PrivacyControl> {
    // Check if control already exists
    const { data: existing } = await this.supabase
      .from('privacy_controls')
      .select('*')
      .eq('student_id', studentId)
      .eq('data_type', dataType)
      .single();

    const controlData = {
      student_id: studentId,
      data_type: dataType,
      access_level: accessLevel,
      allowed_roles: allowedRoles,
      expiry_date: expiryDate?.toISOString(),
      updated_at: new Date().toISOString()
    };

    if (existing) {
      const { data, error } = await this.supabase
        .from('privacy_controls')
        .update(controlData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update privacy control: ${error.message}`);
      }

      return data;
    } else {
      const { data, error } = await this.supabase
        .from('privacy_controls')
        .insert({
          ...controlData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create privacy control: ${error.message}`);
      }

      return data;
    }
  }

  /**
   * Check if user can access student data based on privacy controls
   */
  async checkDataAccess(
    userId: string,
    studentId: string,
    dataType: string,
    userRole: string
  ): Promise<{
    allowed: boolean;
    reason: string;
    accessLevel: string;
  }> {
    // Self-access is always allowed
    if (userId === studentId) {
      return {
        allowed: true,
        reason: 'Self-access',
        accessLevel: 'full'
      };
    }

    // Check privacy controls
    const { data: control } = await this.supabase
      .from('privacy_controls')
      .select('*')
      .eq('student_id', studentId)
      .eq('data_type', dataType)
      .single();

    if (!control) {
      // No specific control, use default institutional policy
      return {
        allowed: this.hasDefaultAccess(userRole, dataType),
        reason: 'Default institutional policy',
        accessLevel: 'default'
      };
    }

    // Check if control has expired
    if (control.expiry_date && new Date(control.expiry_date) < new Date()) {
      return {
        allowed: this.hasDefaultAccess(userRole, dataType),
        reason: 'Privacy control expired',
        accessLevel: 'default'
      };
    }

    switch (control.access_level) {
      case 'public':
        return {
          allowed: true,
          reason: 'Public access level',
          accessLevel: 'public'
        };

      case 'restricted':
        const hasRoleAccess = control.allowed_roles.includes(userRole);
        return {
          allowed: hasRoleAccess,
          reason: hasRoleAccess ? 'Role-based access granted' : 'Role not in allowed list',
          accessLevel: 'restricted'
        };

      case 'private':
        return {
          allowed: false,
          reason: 'Private access level - access denied',
          accessLevel: 'private'
        };

      default:
        return {
          allowed: false,
          reason: 'Unknown access level',
          accessLevel: 'unknown'
        };
    }
  }

  /**
   * Request data deletion (Right to be Forgotten)
   */
  async requestDataDeletion(
    studentId: string,
    requestedBy: string,
    dataTypes: string[],
    reason: string
  ): Promise<DataDeletionRequest> {
    const request = {
      student_id: studentId,
      requested_by: requestedBy,
      data_types: dataTypes,
      reason,
      status: 'pending' as const,
      requested_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('data_deletion_requests')
      .insert(request)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create deletion request: ${error.message}`);
    }

    // Notify administrators
    await this.notifyAdministrators(data.id, studentId, dataTypes);

    return data;
  }

  /**
   * Process data deletion request
   */
  async processDeletionRequest(
    requestId: string,
    processedBy: string,
    approved: boolean,
    notes?: string
  ): Promise<void> {
    const { data: request, error: fetchError } = await this.supabase
      .from('data_deletion_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      throw new Error('Deletion request not found');
    }

    if (approved) {
      // Execute deletion for each data type
      for (const dataType of request.data_types) {
        await this.deleteStudentData(request.student_id, dataType);
      }
    }

    // Update request status
    const { error: updateError } = await this.supabase
      .from('data_deletion_requests')
      .update({
        status: approved ? 'completed' : 'denied',
        processed_at: new Date().toISOString(),
        processed_by: processedBy,
        notes
      })
      .eq('id', requestId);

    if (updateError) {
      throw new Error(`Failed to update deletion request: ${updateError.message}`);
    }

    // Notify student of decision
    await this.notifyStudentOfDeletionDecision(request.student_id, approved, notes);
  }

  /**
   * Anonymize student data
   */
  async anonymizeStudentData(
    studentId: string,
    dataTypes: string[]
  ): Promise<{
    success: boolean;
    anonymizedRecords: number;
    errors: string[];
  }> {
    let anonymizedRecords = 0;
    const errors: string[] = [];

    for (const dataType of dataTypes) {
      try {
        const count = await this.anonymizeDataType(studentId, dataType);
        anonymizedRecords += count;
      } catch (error) {
        errors.push(`Failed to anonymize ${dataType}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      anonymizedRecords,
      errors
    };
  }

  /**
   * Get data retention report
   */
  async getRetentionReport(
    options: {
      startDate?: Date;
      endDate?: Date;
      dataType?: string;
    } = {}
  ): Promise<{
    policies: RetentionPolicy[];
    executionHistory: Array<{
      policy_id: string;
      executed_at: Date;
      records_processed: number;
      action: string;
      success: boolean;
    }>;
    upcomingActions: Array<{
      policy_id: string;
      data_type: string;
      estimated_records: number;
      next_execution: Date;
    }>;
  }> {
    // Get policies
    let policyQuery = this.supabase
      .from('retention_policies')
      .select('*')
      .eq('enabled', true);

    if (options.dataType) {
      policyQuery = policyQuery.eq('data_type', options.dataType);
    }

    const { data: policies, error: policyError } = await policyQuery;

    if (policyError) {
      throw new Error(`Failed to fetch policies: ${policyError.message}`);
    }

    // Get execution history
    let historyQuery = this.supabase
      .from('retention_execution_log')
      .select('*')
      .order('executed_at', { ascending: false });

    if (options.startDate) {
      historyQuery = historyQuery.gte('executed_at', options.startDate.toISOString());
    }

    if (options.endDate) {
      historyQuery = historyQuery.lte('executed_at', options.endDate.toISOString());
    }

    const { data: executionHistory } = await historyQuery;

    // Calculate upcoming actions
    const upcomingActions = await this.calculateUpcomingActions(policies || []);

    return {
      policies: policies || [],
      executionHistory: executionHistory || [],
      upcomingActions
    };
  }

  private async executePolicy(policy: RetentionPolicy): Promise<{
    recordsProcessed: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retention_period_days);

    // Build query conditions
    let conditions = `created_at.lt.${cutoffDate.toISOString()}`;
    
    if (policy.conditions) {
      Object.entries(policy.conditions).forEach(([key, value]) => {
        conditions += `,${key}.eq.${value}`;
      });
    }

    // Get records to process
    const { data: records, error } = await this.supabase
      .from(policy.table_name)
      .select('id')
      .or(conditions);

    if (error) {
      throw new Error(`Failed to query records: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return { recordsProcessed: 0 };
    }

    const recordIds = records.map(r => r.id);

    switch (policy.action) {
      case 'archive':
        await this.archiveRecords(policy.table_name, recordIds);
        break;
      case 'delete':
        await this.deleteRecords(policy.table_name, recordIds);
        break;
      case 'anonymize':
        await this.anonymizeRecords(policy.table_name, recordIds);
        break;
    }

    // Log execution
    await this.logPolicyExecution(policy.id, recordIds.length, policy.action, true);

    return { recordsProcessed: recordIds.length };
  }

  private hasDefaultAccess(userRole: string, dataType: string): boolean {
    const accessMatrix: Record<string, string[]> = {
      'enrollment_data': ['teacher', 'department_admin', 'institution_admin', 'registrar'],
      'grade_data': ['teacher', 'department_admin', 'institution_admin'],
      'personal_info': ['department_admin', 'institution_admin', 'registrar'],
      'financial_data': ['financial_aid', 'institution_admin']
    };

    return accessMatrix[dataType]?.includes(userRole) || false;
  }

  private async deleteStudentData(studentId: string, dataType: string): Promise<void> {
    const tableMap: Record<string, string> = {
      'enrollment_data': 'enrollments',
      'grade_data': 'grades',
      'personal_info': 'user_profiles',
      'communication_data': 'messages'
    };

    const tableName = tableMap[dataType];
    if (!tableName) {
      throw new Error(`Unknown data type: ${dataType}`);
    }

    const { error } = await this.supabase
      .from(tableName)
      .delete()
      .eq('student_id', studentId);

    if (error) {
      throw new Error(`Failed to delete ${dataType}: ${error.message}`);
    }
  }

  private async anonymizeDataType(studentId: string, dataType: string): Promise<number> {
    // Implementation would anonymize specific data types
    // This is a simplified example
    const anonymizedData = {
      email: `anonymous_${Date.now()}@example.com`,
      full_name: 'Anonymous User',
      phone: null,
      address: null
    };

    const { error, count } = await this.supabase
      .from('users')
      .update(anonymizedData)
      .eq('id', studentId);

    if (error) {
      throw new Error(`Failed to anonymize data: ${error.message}`);
    }

    return count || 0;
  }

  private async archiveRecords(tableName: string, recordIds: string[]): Promise<void> {
    // Move records to archive table
    const archiveTableName = `${tableName}_archive`;
    
    // This would typically involve copying data to archive table
    // and then deleting from original table
    console.log(`Archiving ${recordIds.length} records from ${tableName} to ${archiveTableName}`);
  }

  private async deleteRecords(tableName: string, recordIds: string[]): Promise<void> {
    const { error } = await this.supabase
      .from(tableName)
      .delete()
      .in('id', recordIds);

    if (error) {
      throw new Error(`Failed to delete records: ${error.message}`);
    }
  }

  private async anonymizeRecords(tableName: string, recordIds: string[]): Promise<void> {
    // Implementation would anonymize specific fields in records
    console.log(`Anonymizing ${recordIds.length} records in ${tableName}`);
  }

  private async logPolicyExecution(
    policyId: string,
    recordsProcessed: number,
    action: string,
    success: boolean
  ): Promise<void> {
    const logEntry = {
      policy_id: policyId,
      executed_at: new Date().toISOString(),
      records_processed: recordsProcessed,
      action,
      success
    };

    await this.supabase
      .from('retention_execution_log')
      .insert(logEntry);
  }

  private async calculateUpcomingActions(policies: RetentionPolicy[]): Promise<Array<{
    policy_id: string;
    data_type: string;
    estimated_records: number;
    next_execution: Date;
  }>> {
    const upcomingActions = [];

    for (const policy of policies) {
      const nextExecution = new Date();
      nextExecution.setDate(nextExecution.getDate() + 1); // Daily execution

      // Estimate records that will be affected
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retention_period_days);

      const { count } = await this.supabase
        .from(policy.table_name)
        .select('id', { count: 'exact', head: true })
        .lt('created_at', cutoffDate.toISOString());

      upcomingActions.push({
        policy_id: policy.id,
        data_type: policy.data_type,
        estimated_records: count || 0,
        next_execution: nextExecution
      });
    }

    return upcomingActions;
  }

  private async notifyAdministrators(
    requestId: string,
    studentId: string,
    dataTypes: string[]
  ): Promise<void> {
    // Implementation would send notifications to administrators
    console.log(`Notifying administrators of deletion request ${requestId} for student ${studentId}`);
  }

  private async notifyStudentOfDeletionDecision(
    studentId: string,
    approved: boolean,
    notes?: string
  ): Promise<void> {
    // Implementation would send notification to student
    console.log(`Notifying student ${studentId} of deletion decision: ${approved ? 'approved' : 'denied'}`);
  }
}