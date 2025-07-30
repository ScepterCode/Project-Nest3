/**
 * Role Rollback Service
 * 
 * Provides rollback capabilities for failed role operations and system recovery.
 * Supports transaction-level rollbacks, batch operation rollbacks, and system-wide rollbacks.
 * 
 * Requirements: 1.1, 1.5
 */

import { UserRole, RoleStatus, UserRoleAssignment, RoleAuditLog } from '../types/role-management';
import { createClient } from '@/lib/supabase/server';

export interface RollbackOperation {
  id: string;
  type: 'role_assignment' | 'role_change' | 'bulk_assignment' | 'migration' | 'system_recovery';
  timestamp: Date;
  userId?: string;
  affectedUsers: string[];
  originalState: Record<string, any>;
  rollbackState: Record<string, any>;
  reason: string;
  metadata: Record<string, any>;
}

export interface RollbackResult {
  success: boolean;
  operationId: string;
  affectedUsers: number;
  rollbackActions: RollbackAction[];
  errors: RollbackError[];
  warnings: string[];
  metadata: Record<string, any>;
}

export interface RollbackAction {
  type: 'restore_assignment' | 'remove_assignment' | 'update_status' | 'restore_user_data';
  userId: string;
  details: Record<string, any>;
  success: boolean;
  error?: string;
}

export interface RollbackError {
  userId: string;
  action: string;
  error: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface RollbackSnapshot {
  id: string;
  timestamp: Date;
  description: string;
  userCount: number;
  assignmentCount: number;
  data: {
    users: any[];
    assignments: any[];
    auditLogs: any[];
  };
  metadata: Record<string, any>;
}

export class RoleRollbackService {
  private supabase = createClient();
  private rollbackHistory: Map<string, RollbackOperation> = new Map();

  /**
   * Create a rollback snapshot before performing operations
   */
  async createRollbackSnapshot(
    description: string,
    userIds?: string[],
    metadata?: Record<string, any>
  ): Promise<RollbackSnapshot> {
    try {
      const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Get users data
      let usersQuery = this.supabase
        .from('users')
        .select('id, email, primary_role, role_status, role_verified_at, role_assigned_by, institution_id, department_id');

      if (userIds && userIds.length > 0) {
        usersQuery = usersQuery.in('id', userIds);
      }

      const { data: users, error: usersError } = await usersQuery;

      if (usersError) {
        throw new Error(`Failed to snapshot users: ${usersError.message}`);
      }

      // Get role assignments
      let assignmentsQuery = this.supabase
        .from('user_role_assignments')
        .select('*');

      if (userIds && userIds.length > 0) {
        assignmentsQuery = assignmentsQuery.in('user_id', userIds);
      }

      const { data: assignments, error: assignmentsError } = await assignmentsQuery;

      if (assignmentsError) {
        throw new Error(`Failed to snapshot assignments: ${assignmentsError.message}`);
      }

      // Get recent audit logs
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      let auditQuery = this.supabase
        .from('role_audit_log')
        .select('*')
        .gte('timestamp', oneHourAgo.toISOString());

      if (userIds && userIds.length > 0) {
        auditQuery = auditQuery.in('user_id', userIds);
      }

      const { data: auditLogs, error: auditError } = await auditQuery;

      if (auditError) {
        throw new Error(`Failed to snapshot audit logs: ${auditError.message}`);
      }

      const snapshot: RollbackSnapshot = {
        id: snapshotId,
        timestamp: new Date(),
        description,
        userCount: users?.length || 0,
        assignmentCount: assignments?.length || 0,
        data: {
          users: users || [],
          assignments: assignments || [],
          auditLogs: auditLogs || []
        },
        metadata: {
          ...metadata,
          createdBy: 'RoleRollbackService',
          userIds: userIds || 'all'
        }
      };

      // Store snapshot in database
      const { error: snapshotError } = await this.supabase
        .from('role_rollback_snapshots')
        .insert({
          id: snapshotId,
          description,
          user_count: snapshot.userCount,
          assignment_count: snapshot.assignmentCount,
          data: snapshot.data,
          metadata: snapshot.metadata,
          created_at: snapshot.timestamp.toISOString()
        });

      if (snapshotError) {
        throw new Error(`Failed to store snapshot: ${snapshotError.message}`);
      }

      return snapshot;

    } catch (error) {
      throw new Error(`Failed to create rollback snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rollback to a specific snapshot
   */
  async rollbackToSnapshot(snapshotId: string, reason: string): Promise<RollbackResult> {
    const operationId = `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const rollbackActions: RollbackAction[] = [];
    const errors: RollbackError[] = [];
    const warnings: string[] = [];

    try {
      // Get snapshot data
      const { data: snapshotData, error: snapshotError } = await this.supabase
        .from('role_rollback_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();

      if (snapshotError || !snapshotData) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      const snapshot = snapshotData.data as RollbackSnapshot['data'];
      const affectedUserIds = snapshot.users.map(u => u.id);

      // Start transaction
      const { error: transactionError } = await this.supabase.rpc('begin_rollback_transaction');
      if (transactionError) {
        throw new Error(`Failed to start rollback transaction: ${transactionError.message}`);
      }

      try {
        // Restore users data
        for (const user of snapshot.users) {
          const action = await this.restoreUserData(user, operationId);
          rollbackActions.push(action);
          
          if (!action.success && action.error) {
            errors.push({
              userId: user.id,
              action: 'restore_user_data',
              error: action.error,
              severity: 'high'
            });
          }
        }

        // Remove current assignments for affected users
        const { error: removeError } = await this.supabase
          .from('user_role_assignments')
          .delete()
          .in('user_id', affectedUserIds);

        if (removeError) {
          throw new Error(`Failed to remove current assignments: ${removeError.message}`);
        }

        // Restore assignments
        for (const assignment of snapshot.assignments) {
          const action = await this.restoreAssignment(assignment, operationId);
          rollbackActions.push(action);
          
          if (!action.success && action.error) {
            errors.push({
              userId: assignment.user_id,
              action: 'restore_assignment',
              error: action.error,
              severity: 'high'
            });
          }
        }

        // Log rollback operation
        await this.logRollbackOperation({
          id: operationId,
          type: 'system_recovery',
          timestamp: new Date(),
          affectedUsers: affectedUserIds,
          originalState: { snapshotId },
          rollbackState: { restored: true },
          reason,
          metadata: {
            snapshotId,
            userCount: snapshot.users.length,
            assignmentCount: snapshot.assignments.length
          }
        });

        // Commit transaction
        const { error: commitError } = await this.supabase.rpc('commit_rollback_transaction');
        if (commitError) {
          throw new Error(`Failed to commit rollback transaction: ${commitError.message}`);
        }

        return {
          success: errors.length === 0,
          operationId,
          affectedUsers: affectedUserIds.length,
          rollbackActions,
          errors,
          warnings,
          metadata: {
            snapshotId,
            restoredUsers: snapshot.users.length,
            restoredAssignments: snapshot.assignments.length
          }
        };

      } catch (error) {
        // Rollback transaction on error
        await this.supabase.rpc('rollback_rollback_transaction');
        throw error;
      }

    } catch (error) {
      return {
        success: false,
        operationId,
        affectedUsers: 0,
        rollbackActions,
        errors: [{
          userId: 'SYSTEM',
          action: 'rollback_to_snapshot',
          error: error instanceof Error ? error.message : 'Unknown error',
          severity: 'critical'
        }],
        warnings,
        metadata: { snapshotId }
      };
    }
  }

  /**
   * Rollback a specific role assignment
   */
  async rollbackRoleAssignment(
    assignmentId: string,
    reason: string,
    userId?: string
  ): Promise<RollbackResult> {
    const operationId = `rollback_assignment_${Date.now()}`;
    const rollbackActions: RollbackAction[] = [];
    const errors: RollbackError[] = [];
    const warnings: string[] = [];

    try {
      // Get the assignment to rollback
      const { data: assignment, error: assignmentError } = await this.supabase
        .from('user_role_assignments')
        .select('*')
        .eq('id', assignmentId)
        .single();

      if (assignmentError || !assignment) {
        throw new Error(`Assignment not found: ${assignmentId}`);
      }

      // Get the previous state from audit log
      const { data: auditLogs, error: auditError } = await this.supabase
        .from('role_audit_log')
        .select('*')
        .eq('user_id', assignment.user_id)
        .lt('timestamp', assignment.assigned_at)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (auditError) {
        throw new Error(`Failed to get audit history: ${auditError.message}`);
      }

      const previousState = auditLogs && auditLogs.length > 0 ? auditLogs[0] : null;

      // Remove the current assignment
      const removeAction = await this.removeAssignment(assignmentId, operationId);
      rollbackActions.push(removeAction);

      if (!removeAction.success) {
        errors.push({
          userId: assignment.user_id,
          action: 'remove_assignment',
          error: removeAction.error || 'Failed to remove assignment',
          severity: 'high'
        });
      }

      // Restore previous role if available
      if (previousState && previousState.old_role) {
        const restoreAction = await this.restorePreviousRole(
          assignment.user_id,
          previousState.old_role,
          assignment.institution_id,
          assignment.department_id,
          operationId
        );
        rollbackActions.push(restoreAction);

        if (!restoreAction.success) {
          errors.push({
            userId: assignment.user_id,
            action: 'restore_previous_role',
            error: restoreAction.error || 'Failed to restore previous role',
            severity: 'medium'
          });
        }
      } else {
        warnings.push(`No previous role found for user ${assignment.user_id}`);
      }

      // Log rollback operation
      await this.logRollbackOperation({
        id: operationId,
        type: 'role_assignment',
        timestamp: new Date(),
        userId: assignment.user_id,
        affectedUsers: [assignment.user_id],
        originalState: { assignment },
        rollbackState: { previousRole: previousState?.old_role },
        reason,
        metadata: { assignmentId, previousState }
      });

      return {
        success: errors.length === 0,
        operationId,
        affectedUsers: 1,
        rollbackActions,
        errors,
        warnings,
        metadata: {
          assignmentId,
          userId: assignment.user_id,
          rolledBackRole: assignment.role,
          restoredRole: previousState?.old_role
        }
      };

    } catch (error) {
      return {
        success: false,
        operationId,
        affectedUsers: 0,
        rollbackActions,
        errors: [{
          userId: userId || 'UNKNOWN',
          action: 'rollback_role_assignment',
          error: error instanceof Error ? error.message : 'Unknown error',
          severity: 'critical'
        }],
        warnings,
        metadata: { assignmentId }
      };
    }
  }

  /**
   * Rollback bulk role assignment operation
   */
  async rollbackBulkAssignment(
    bulkOperationId: string,
    reason: string
  ): Promise<RollbackResult> {
    const operationId = `rollback_bulk_${Date.now()}`;
    const rollbackActions: RollbackAction[] = [];
    const errors: RollbackError[] = [];
    const warnings: string[] = [];

    try {
      // Get all assignments from the bulk operation
      const { data: assignments, error: assignmentsError } = await this.supabase
        .from('user_role_assignments')
        .select('*')
        .contains('metadata', { bulkOperationId });

      if (assignmentsError) {
        throw new Error(`Failed to get bulk assignments: ${assignmentsError.message}`);
      }

      if (!assignments || assignments.length === 0) {
        warnings.push(`No assignments found for bulk operation: ${bulkOperationId}`);
        return {
          success: true,
          operationId,
          affectedUsers: 0,
          rollbackActions,
          errors,
          warnings,
          metadata: { bulkOperationId }
        };
      }

      const affectedUserIds = [...new Set(assignments.map(a => a.user_id))];

      // Rollback each assignment
      for (const assignment of assignments) {
        const rollbackResult = await this.rollbackRoleAssignment(
          assignment.id,
          `Bulk rollback: ${reason}`,
          assignment.user_id
        );

        rollbackActions.push(...rollbackResult.rollbackActions);
        errors.push(...rollbackResult.errors);
        warnings.push(...rollbackResult.warnings);
      }

      // Log bulk rollback operation
      await this.logRollbackOperation({
        id: operationId,
        type: 'bulk_assignment',
        timestamp: new Date(),
        affectedUsers: affectedUserIds,
        originalState: { bulkOperationId, assignmentCount: assignments.length },
        rollbackState: { rolledBack: true },
        reason,
        metadata: {
          bulkOperationId,
          assignmentCount: assignments.length,
          affectedUserCount: affectedUserIds.length
        }
      });

      return {
        success: errors.length === 0,
        operationId,
        affectedUsers: affectedUserIds.length,
        rollbackActions,
        errors,
        warnings,
        metadata: {
          bulkOperationId,
          rolledBackAssignments: assignments.length,
          affectedUsers: affectedUserIds.length
        }
      };

    } catch (error) {
      return {
        success: false,
        operationId,
        affectedUsers: 0,
        rollbackActions,
        errors: [{
          userId: 'SYSTEM',
          action: 'rollback_bulk_assignment',
          error: error instanceof Error ? error.message : 'Unknown error',
          severity: 'critical'
        }],
        warnings,
        metadata: { bulkOperationId }
      };
    }
  }

  /**
   * Get rollback history
   */
  async getRollbackHistory(limit: number = 50): Promise<RollbackOperation[]> {
    const { data: history, error } = await this.supabase
      .from('role_rollback_operations')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get rollback history: ${error.message}`);
    }

    return (history || []).map(this.mapDatabaseToRollbackOperation);
  }

  /**
   * Get available snapshots
   */
  async getAvailableSnapshots(limit: number = 20): Promise<RollbackSnapshot[]> {
    const { data: snapshots, error } = await this.supabase
      .from('role_rollback_snapshots')
      .select('id, description, user_count, assignment_count, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get snapshots: ${error.message}`);
    }

    return (snapshots || []).map(s => ({
      id: s.id,
      timestamp: new Date(s.created_at),
      description: s.description,
      userCount: s.user_count,
      assignmentCount: s.assignment_count,
      data: { users: [], assignments: [], auditLogs: [] }, // Don't load full data for list
      metadata: s.metadata || {}
    }));
  }

  // Private helper methods

  private async restoreUserData(user: any, operationId: string): Promise<RollbackAction> {
    try {
      const { error } = await this.supabase
        .from('users')
        .update({
          primary_role: user.primary_role,
          role_status: user.role_status,
          role_verified_at: user.role_verified_at,
          role_assigned_by: user.role_assigned_by,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        throw new Error(error.message);
      }

      return {
        type: 'restore_user_data',
        userId: user.id,
        details: {
          primary_role: user.primary_role,
          role_status: user.role_status
        },
        success: true
      };

    } catch (error) {
      return {
        type: 'restore_user_data',
        userId: user.id,
        details: {},
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async restoreAssignment(assignment: any, operationId: string): Promise<RollbackAction> {
    try {
      const { error } = await this.supabase
        .from('user_role_assignments')
        .insert({
          ...assignment,
          metadata: {
            ...assignment.metadata,
            restoredBy: operationId,
            restoredAt: new Date().toISOString()
          }
        });

      if (error) {
        throw new Error(error.message);
      }

      return {
        type: 'restore_assignment',
        userId: assignment.user_id,
        details: {
          role: assignment.role,
          assignmentId: assignment.id
        },
        success: true
      };

    } catch (error) {
      return {
        type: 'restore_assignment',
        userId: assignment.user_id,
        details: {},
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async removeAssignment(assignmentId: string, operationId: string): Promise<RollbackAction> {
    try {
      const { data: assignment, error: fetchError } = await this.supabase
        .from('user_role_assignments')
        .select('user_id, role')
        .eq('id', assignmentId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch assignment: ${fetchError.message}`);
      }

      const { error } = await this.supabase
        .from('user_role_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) {
        throw new Error(error.message);
      }

      return {
        type: 'remove_assignment',
        userId: assignment.user_id,
        details: {
          assignmentId,
          removedRole: assignment.role
        },
        success: true
      };

    } catch (error) {
      return {
        type: 'remove_assignment',
        userId: 'UNKNOWN',
        details: { assignmentId },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async restorePreviousRole(
    userId: string,
    role: string,
    institutionId: string,
    departmentId: string | null,
    operationId: string
  ): Promise<RollbackAction> {
    try {
      const { error } = await this.supabase
        .from('user_role_assignments')
        .insert({
          user_id: userId,
          role,
          status: 'active',
          assigned_by: userId, // Self-assigned during rollback
          assigned_at: new Date().toISOString(),
          institution_id: institutionId,
          department_id: departmentId,
          is_temporary: false,
          metadata: {
            restoredBy: operationId,
            restoredAt: new Date().toISOString(),
            rollbackOperation: true
          }
        });

      if (error) {
        throw new Error(error.message);
      }

      // Update user's primary role
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          primary_role: role,
          role_status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        throw new Error(`Failed to update user primary role: ${updateError.message}`);
      }

      return {
        type: 'restore_assignment',
        userId,
        details: {
          restoredRole: role,
          institutionId,
          departmentId
        },
        success: true
      };

    } catch (error) {
      return {
        type: 'restore_assignment',
        userId,
        details: {},
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async logRollbackOperation(operation: RollbackOperation): Promise<void> {
    this.rollbackHistory.set(operation.id, operation);

    const { error } = await this.supabase
      .from('role_rollback_operations')
      .insert({
        id: operation.id,
        type: operation.type,
        timestamp: operation.timestamp.toISOString(),
        user_id: operation.userId,
        affected_users: operation.affectedUsers,
        original_state: operation.originalState,
        rollback_state: operation.rollbackState,
        reason: operation.reason,
        metadata: operation.metadata
      });

    if (error) {
      console.error('Failed to log rollback operation:', error);
    }
  }

  private mapDatabaseToRollbackOperation(row: any): RollbackOperation {
    return {
      id: row.id,
      type: row.type,
      timestamp: new Date(row.timestamp),
      userId: row.user_id,
      affectedUsers: row.affected_users || [],
      originalState: row.original_state || {},
      rollbackState: row.rollback_state || {},
      reason: row.reason,
      metadata: row.metadata || {}
    };
  }
}

// Database schema for rollback functionality
export const ROLLBACK_DATABASE_SCHEMA = `
-- Rollback snapshots table
CREATE TABLE IF NOT EXISTS role_rollback_snapshots (
  id VARCHAR PRIMARY KEY,
  description TEXT NOT NULL,
  user_count INTEGER DEFAULT 0,
  assignment_count INTEGER DEFAULT 0,
  data JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Rollback operations log
CREATE TABLE IF NOT EXISTS role_rollback_operations (
  id VARCHAR PRIMARY KEY,
  type VARCHAR NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  user_id UUID,
  affected_users UUID[] DEFAULT '{}',
  original_state JSONB DEFAULT '{}',
  rollback_state JSONB DEFAULT '{}',
  reason TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rollback_snapshots_created_at ON role_rollback_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rollback_operations_timestamp ON role_rollback_operations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rollback_operations_type ON role_rollback_operations(type);
CREATE INDEX IF NOT EXISTS idx_rollback_operations_user_id ON role_rollback_operations(user_id);

-- Transaction management functions
CREATE OR REPLACE FUNCTION begin_rollback_transaction()
RETURNS void AS $$
BEGIN
  -- Start a new transaction for rollback operations
  -- This is a placeholder - actual implementation would depend on your transaction strategy
  PERFORM pg_advisory_lock(12345);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION commit_rollback_transaction()
RETURNS void AS $$
BEGIN
  -- Commit the rollback transaction
  PERFORM pg_advisory_unlock(12345);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rollback_rollback_transaction()
RETURNS void AS $$
BEGIN
  -- Rollback the rollback transaction
  PERFORM pg_advisory_unlock(12345);
END;
$$ LANGUAGE plpgsql;
`;