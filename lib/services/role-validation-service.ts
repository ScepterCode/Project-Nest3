/**
 * Role Validation Service
 * 
 * Provides comprehensive validation tools to ensure role assignment integrity
 * and data consistency across the role management system.
 * 
 * Requirements: 1.1, 1.5
 */

import { UserRole, RoleStatus, UserRoleAssignment, RoleRequest } from '../types/role-management';
import { createClient } from '@/lib/supabase/server';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata?: Record<string, any>;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  value?: any;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  value?: any;
  recommendation?: string;
}

export interface SystemValidationReport {
  timestamp: Date;
  totalUsers: number;
  validUsers: number;
  invalidUsers: number;
  issues: ValidationIssue[];
  summary: ValidationSummary;
}

export interface ValidationIssue {
  userId: string;
  userEmail?: string;
  issueType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestedFix?: string;
  metadata?: Record<string, any>;
}

export interface ValidationSummary {
  criticalIssues: number;
  highPriorityIssues: number;
  mediumPriorityIssues: number;
  lowPriorityIssues: number;
  totalIssues: number;
  healthScore: number; // 0-100
}

export class RoleValidationService {
  private supabase = createClient();

  /**
   * Validate a single user's role assignments
   */
  async validateUserRoles(userId: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Get user data
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('id, email, primary_role, role_status, institution_id, department_id')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        errors.push({
          code: 'USER_NOT_FOUND',
          message: 'User not found in database',
          severity: 'critical'
        });
        return { isValid: false, errors, warnings };
      }

      // Get user's role assignments
      const { data: assignments, error: assignmentError } = await this.supabase
        .from('user_role_assignments')
        .select('*')
        .eq('user_id', userId);

      if (assignmentError) {
        errors.push({
          code: 'ASSIGNMENT_FETCH_ERROR',
          message: 'Failed to fetch role assignments',
          severity: 'high'
        });
      }

      // Validate primary role consistency
      await this.validatePrimaryRoleConsistency(user, assignments || [], errors, warnings);

      // Validate role assignments
      await this.validateRoleAssignments(assignments || [], errors, warnings);

      // Validate institutional constraints
      await this.validateInstitutionalConstraints(user, assignments || [], errors, warnings);

      // Validate temporal constraints
      await this.validateTemporalConstraints(assignments || [], errors, warnings);

      // Validate permission consistency
      await this.validatePermissionConsistency(userId, assignments || [], errors, warnings);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata: {
          userId,
          userEmail: user.email,
          assignmentCount: assignments?.length || 0
        }
      };

    } catch (error) {
      errors.push({
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical'
      });

      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Validate role assignment data integrity
   */
  async validateRoleAssignment(assignment: UserRoleAssignment): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate required fields
    if (!assignment.userId) {
      errors.push({
        code: 'MISSING_USER_ID',
        message: 'User ID is required',
        field: 'userId',
        severity: 'critical'
      });
    }

    if (!assignment.role) {
      errors.push({
        code: 'MISSING_ROLE',
        message: 'Role is required',
        field: 'role',
        severity: 'critical'
      });
    }

    if (!assignment.institutionId) {
      errors.push({
        code: 'MISSING_INSTITUTION_ID',
        message: 'Institution ID is required',
        field: 'institutionId',
        severity: 'critical'
      });
    }

    // Validate role value
    if (assignment.role && !Object.values(UserRole).includes(assignment.role)) {
      errors.push({
        code: 'INVALID_ROLE',
        message: `Invalid role: ${assignment.role}`,
        field: 'role',
        value: assignment.role,
        severity: 'critical'
      });
    }

    // Validate status
    if (assignment.status && !Object.values(RoleStatus).includes(assignment.status)) {
      errors.push({
        code: 'INVALID_STATUS',
        message: `Invalid status: ${assignment.status}`,
        field: 'status',
        value: assignment.status,
        severity: 'high'
      });
    }

    // Validate temporal constraints
    if (assignment.expiresAt && assignment.assignedAt && assignment.expiresAt <= assignment.assignedAt) {
      errors.push({
        code: 'INVALID_EXPIRATION',
        message: 'Expiration date must be after assignment date',
        field: 'expiresAt',
        severity: 'high'
      });
    }

    // Validate temporary role constraints
    if (assignment.isTemporary && !assignment.expiresAt) {
      errors.push({
        code: 'TEMPORARY_ROLE_NO_EXPIRATION',
        message: 'Temporary roles must have an expiration date',
        field: 'expiresAt',
        severity: 'high'
      });
    }

    // Check for expired assignments
    if (assignment.expiresAt && assignment.expiresAt < new Date() && assignment.status === RoleStatus.ACTIVE) {
      warnings.push({
        code: 'EXPIRED_ACTIVE_ASSIGNMENT',
        message: 'Assignment is expired but still active',
        field: 'status',
        recommendation: 'Update status to expired'
      });
    }

    // Validate foreign key references
    await this.validateForeignKeyReferences(assignment, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        assignmentId: assignment.id,
        userId: assignment.userId,
        role: assignment.role
      }
    };
  }

  /**
   * Validate role request data
   */
  async validateRoleRequest(request: RoleRequest): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate required fields
    if (!request.userId) {
      errors.push({
        code: 'MISSING_USER_ID',
        message: 'User ID is required',
        field: 'userId',
        severity: 'critical'
      });
    }

    if (!request.requestedRole) {
      errors.push({
        code: 'MISSING_REQUESTED_ROLE',
        message: 'Requested role is required',
        field: 'requestedRole',
        severity: 'critical'
      });
    }

    if (!request.institutionId) {
      errors.push({
        code: 'MISSING_INSTITUTION_ID',
        message: 'Institution ID is required',
        field: 'institutionId',
        severity: 'critical'
      });
    }

    // Validate role values
    if (request.requestedRole && !Object.values(UserRole).includes(request.requestedRole)) {
      errors.push({
        code: 'INVALID_REQUESTED_ROLE',
        message: `Invalid requested role: ${request.requestedRole}`,
        field: 'requestedRole',
        value: request.requestedRole,
        severity: 'critical'
      });
    }

    if (request.currentRole && !Object.values(UserRole).includes(request.currentRole)) {
      errors.push({
        code: 'INVALID_CURRENT_ROLE',
        message: `Invalid current role: ${request.currentRole}`,
        field: 'currentRole',
        value: request.currentRole,
        severity: 'high'
      });
    }

    // Validate temporal constraints
    if (request.expiresAt && request.requestedAt && request.expiresAt <= request.requestedAt) {
      errors.push({
        code: 'INVALID_REQUEST_EXPIRATION',
        message: 'Request expiration must be after request date',
        field: 'expiresAt',
        severity: 'high'
      });
    }

    // Check for expired requests
    if (request.expiresAt && request.expiresAt < new Date() && request.status === 'pending') {
      warnings.push({
        code: 'EXPIRED_PENDING_REQUEST',
        message: 'Request is expired but still pending',
        field: 'status',
        recommendation: 'Update status to expired'
      });
    }

    // Validate business logic
    if (request.requestedRole === request.currentRole) {
      warnings.push({
        code: 'REDUNDANT_ROLE_REQUEST',
        message: 'Requested role is the same as current role',
        recommendation: 'Consider if this request is necessary'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        requestId: request.id,
        userId: request.userId,
        requestedRole: request.requestedRole
      }
    };
  }

  /**
   * Run comprehensive system validation
   */
  async validateSystem(): Promise<SystemValidationReport> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];

    try {
      // Get all users with role data
      const { data: users, error: usersError } = await this.supabase
        .from('users')
        .select('id, email, primary_role, role_status, institution_id, department_id');

      if (usersError) {
        throw new Error(`Failed to fetch users: ${usersError.message}`);
      }

      const totalUsers = users?.length || 0;
      let validUsers = 0;

      // Validate each user
      for (const user of users || []) {
        const userValidation = await this.validateUserRoles(user.id);
        
        if (userValidation.isValid) {
          validUsers++;
        } else {
          // Convert validation errors to issues
          for (const error of userValidation.errors) {
            issues.push({
              userId: user.id,
              userEmail: user.email,
              issueType: error.code,
              severity: error.severity,
              description: error.message,
              suggestedFix: this.getSuggestedFix(error.code),
              metadata: { field: error.field, value: error.value }
            });
          }

          // Convert warnings to low-priority issues
          for (const warning of userValidation.warnings) {
            issues.push({
              userId: user.id,
              userEmail: user.email,
              issueType: warning.code,
              severity: 'low',
              description: warning.message,
              suggestedFix: warning.recommendation,
              metadata: { field: warning.field, value: warning.value }
            });
          }
        }
      }

      // Additional system-wide validations
      await this.validateSystemConstraints(issues);

      // Calculate summary
      const summary = this.calculateValidationSummary(issues, totalUsers);

      return {
        timestamp: new Date(),
        totalUsers,
        validUsers,
        invalidUsers: totalUsers - validUsers,
        issues,
        summary
      };

    } catch (error) {
      throw new Error(`System validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate orphaned role assignments
   */
  async validateOrphanedAssignments(): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      // Find assignments with non-existent users
      const { data: orphanedAssignments, error } = await this.supabase
        .from('user_role_assignments')
        .select(`
          id,
          user_id,
          role,
          users!inner(id, email)
        `)
        .is('users.id', null);

      if (error) {
        throw new Error(`Failed to check orphaned assignments: ${error.message}`);
      }

      for (const assignment of orphanedAssignments || []) {
        issues.push({
          userId: assignment.user_id,
          issueType: 'ORPHANED_ASSIGNMENT',
          severity: 'high',
          description: 'Role assignment exists for non-existent user',
          suggestedFix: 'Remove orphaned assignment',
          metadata: { assignmentId: assignment.id, role: assignment.role }
        });
      }

      return issues;

    } catch (error) {
      throw new Error(`Orphaned assignment validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate duplicate role assignments
   */
  async validateDuplicateAssignments(): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      // Find duplicate active assignments
      const { data: duplicates, error } = await this.supabase
        .rpc('find_duplicate_role_assignments');

      if (error) {
        throw new Error(`Failed to check duplicate assignments: ${error.message}`);
      }

      for (const duplicate of duplicates || []) {
        issues.push({
          userId: duplicate.user_id,
          userEmail: duplicate.user_email,
          issueType: 'DUPLICATE_ASSIGNMENT',
          severity: 'medium',
          description: `User has multiple active assignments for role: ${duplicate.role}`,
          suggestedFix: 'Consolidate duplicate assignments',
          metadata: { 
            role: duplicate.role, 
            assignmentCount: duplicate.assignment_count,
            assignmentIds: duplicate.assignment_ids
          }
        });
      }

      return issues;

    } catch (error) {
      throw new Error(`Duplicate assignment validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods

  private async validatePrimaryRoleConsistency(
    user: any,
    assignments: any[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    if (!user.primary_role) {
      errors.push({
        code: 'MISSING_PRIMARY_ROLE',
        message: 'User has no primary role assigned',
        field: 'primary_role',
        severity: 'high'
      });
      return;
    }

    // Check if primary role matches any active assignment
    const activeAssignments = assignments.filter(a => a.status === 'active');
    const hasMatchingAssignment = activeAssignments.some(a => a.role === user.primary_role);

    if (!hasMatchingAssignment && activeAssignments.length > 0) {
      warnings.push({
        code: 'PRIMARY_ROLE_MISMATCH',
        message: 'Primary role does not match any active role assignment',
        field: 'primary_role',
        value: user.primary_role,
        recommendation: 'Update primary role to match active assignments'
      });
    }
  }

  private async validateRoleAssignments(
    assignments: any[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    for (const assignment of assignments) {
      // Check for expired active assignments
      if (assignment.expires_at && new Date(assignment.expires_at) < new Date() && assignment.status === 'active') {
        warnings.push({
          code: 'EXPIRED_ACTIVE_ASSIGNMENT',
          message: `Assignment ${assignment.id} is expired but still active`,
          field: 'status',
          value: assignment.status,
          recommendation: 'Update status to expired'
        });
      }

      // Check for temporary assignments without expiration
      if (assignment.is_temporary && !assignment.expires_at) {
        errors.push({
          code: 'TEMPORARY_NO_EXPIRATION',
          message: `Temporary assignment ${assignment.id} has no expiration date`,
          field: 'expires_at',
          severity: 'high'
        });
      }
    }
  }

  private async validateInstitutionalConstraints(
    user: any,
    assignments: any[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // Check if user's institution matches assignment institutions
    for (const assignment of assignments) {
      if (assignment.institution_id !== user.institution_id) {
        warnings.push({
          code: 'INSTITUTION_MISMATCH',
          message: `Assignment institution (${assignment.institution_id}) differs from user institution (${user.institution_id})`,
          field: 'institution_id',
          recommendation: 'Verify institutional assignment is correct'
        });
      }
    }
  }

  private async validateTemporalConstraints(
    assignments: any[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    for (const assignment of assignments) {
      if (assignment.expires_at && assignment.assigned_at) {
        const expiresAt = new Date(assignment.expires_at);
        const assignedAt = new Date(assignment.assigned_at);

        if (expiresAt <= assignedAt) {
          errors.push({
            code: 'INVALID_EXPIRATION_DATE',
            message: `Assignment ${assignment.id} expires before it was assigned`,
            field: 'expires_at',
            severity: 'high'
          });
        }
      }
    }
  }

  private async validatePermissionConsistency(
    userId: string,
    assignments: any[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // This would validate that the user's permissions match their role assignments
    // Implementation depends on your permission system
    // For now, we'll add a placeholder validation
    
    const activeRoles = assignments
      .filter(a => a.status === 'active')
      .map(a => a.role);

    if (activeRoles.length === 0) {
      warnings.push({
        code: 'NO_ACTIVE_ROLES',
        message: 'User has no active role assignments',
        recommendation: 'Assign appropriate role to user'
      });
    }
  }

  private async validateForeignKeyReferences(
    assignment: UserRoleAssignment,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // Validate user exists
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('id')
      .eq('id', assignment.userId)
      .single();

    if (userError || !user) {
      errors.push({
        code: 'INVALID_USER_REFERENCE',
        message: 'Referenced user does not exist',
        field: 'userId',
        value: assignment.userId,
        severity: 'critical'
      });
    }

    // Validate institution exists
    const { data: institution, error: institutionError } = await this.supabase
      .from('institutions')
      .select('id')
      .eq('id', assignment.institutionId)
      .single();

    if (institutionError || !institution) {
      errors.push({
        code: 'INVALID_INSTITUTION_REFERENCE',
        message: 'Referenced institution does not exist',
        field: 'institutionId',
        value: assignment.institutionId,
        severity: 'critical'
      });
    }

    // Validate department exists (if specified)
    if (assignment.departmentId) {
      const { data: department, error: departmentError } = await this.supabase
        .from('departments')
        .select('id')
        .eq('id', assignment.departmentId)
        .single();

      if (departmentError || !department) {
        errors.push({
          code: 'INVALID_DEPARTMENT_REFERENCE',
          message: 'Referenced department does not exist',
          field: 'departmentId',
          value: assignment.departmentId,
          severity: 'high'
        });
      }
    }
  }

  private async validateSystemConstraints(issues: ValidationIssue[]): Promise<void> {
    // Add system-wide constraint validations
    // For example, check for system admin limits, institutional constraints, etc.
    
    // Check for multiple system admins (if that's a constraint)
    const { data: systemAdmins, error } = await this.supabase
      .from('user_role_assignments')
      .select('user_id, users!inner(email)')
      .eq('role', 'system_admin')
      .eq('status', 'active');

    if (!error && systemAdmins && systemAdmins.length > 5) {
      issues.push({
        userId: 'SYSTEM',
        issueType: 'TOO_MANY_SYSTEM_ADMINS',
        severity: 'medium',
        description: `System has ${systemAdmins.length} active system administrators`,
        suggestedFix: 'Review system admin assignments for necessity',
        metadata: { count: systemAdmins.length }
      });
    }
  }

  private calculateValidationSummary(issues: ValidationIssue[], totalUsers: number): ValidationSummary {
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highPriorityIssues = issues.filter(i => i.severity === 'high').length;
    const mediumPriorityIssues = issues.filter(i => i.severity === 'medium').length;
    const lowPriorityIssues = issues.filter(i => i.severity === 'low').length;
    const totalIssues = issues.length;

    // Calculate health score (0-100)
    const maxPossibleScore = 100;
    const criticalPenalty = criticalIssues * 20;
    const highPenalty = highPriorityIssues * 10;
    const mediumPenalty = mediumPriorityIssues * 5;
    const lowPenalty = lowPriorityIssues * 1;

    const totalPenalty = criticalPenalty + highPenalty + mediumPenalty + lowPenalty;
    const healthScore = Math.max(0, maxPossibleScore - totalPenalty);

    return {
      criticalIssues,
      highPriorityIssues,
      mediumPriorityIssues,
      lowPriorityIssues,
      totalIssues,
      healthScore
    };
  }

  private getSuggestedFix(errorCode: string): string {
    const fixes: Record<string, string> = {
      'USER_NOT_FOUND': 'Remove orphaned references or restore user data',
      'MISSING_PRIMARY_ROLE': 'Assign a primary role to the user',
      'INVALID_ROLE': 'Update role to a valid value',
      'EXPIRED_ACTIVE_ASSIGNMENT': 'Update assignment status to expired',
      'TEMPORARY_NO_EXPIRATION': 'Add expiration date to temporary assignment',
      'INSTITUTION_MISMATCH': 'Verify and correct institutional assignments',
      'INVALID_EXPIRATION_DATE': 'Correct expiration date to be after assignment date',
      'ORPHANED_ASSIGNMENT': 'Remove assignment for non-existent user',
      'DUPLICATE_ASSIGNMENT': 'Consolidate or remove duplicate assignments'
    };

    return fixes[errorCode] || 'Manual review required';
  }
}

// Database functions for validation queries
export const VALIDATION_DATABASE_FUNCTIONS = `
-- Function to find duplicate role assignments
CREATE OR REPLACE FUNCTION find_duplicate_role_assignments()
RETURNS TABLE(
  user_id uuid,
  user_email text,
  role text,
  assignment_count bigint,
  assignment_ids uuid[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ura.user_id,
    u.email::text,
    ura.role::text,
    COUNT(*) as assignment_count,
    ARRAY_AGG(ura.id) as assignment_ids
  FROM user_role_assignments ura
  JOIN users u ON ura.user_id = u.id
  WHERE ura.status = 'active'
  GROUP BY ura.user_id, u.email, ura.role, ura.institution_id, ura.department_id
  HAVING COUNT(*) > 1;
END;
$$ LANGUAGE plpgsql;

-- Function to validate role assignment integrity
CREATE OR REPLACE FUNCTION validate_role_assignment_integrity()
RETURNS TABLE(
  issue_type text,
  user_id uuid,
  assignment_id uuid,
  description text
) AS $$
BEGIN
  -- Check for assignments with invalid user references
  RETURN QUERY
  SELECT 
    'INVALID_USER_REFERENCE'::text,
    ura.user_id,
    ura.id,
    'Role assignment references non-existent user'::text
  FROM user_role_assignments ura
  LEFT JOIN users u ON ura.user_id = u.id
  WHERE u.id IS NULL;

  -- Check for assignments with invalid institution references
  RETURN QUERY
  SELECT 
    'INVALID_INSTITUTION_REFERENCE'::text,
    ura.user_id,
    ura.id,
    'Role assignment references non-existent institution'::text
  FROM user_role_assignments ura
  LEFT JOIN institutions i ON ura.institution_id = i.id
  WHERE i.id IS NULL;

  -- Check for expired active assignments
  RETURN QUERY
  SELECT 
    'EXPIRED_ACTIVE_ASSIGNMENT'::text,
    ura.user_id,
    ura.id,
    'Assignment is expired but still marked as active'::text
  FROM user_role_assignments ura
  WHERE ura.expires_at < NOW() 
    AND ura.status = 'active';

  -- Check for temporary assignments without expiration
  RETURN QUERY
  SELECT 
    'TEMPORARY_NO_EXPIRATION'::text,
    ura.user_id,
    ura.id,
    'Temporary assignment has no expiration date'::text
  FROM user_role_assignments ura
  WHERE ura.is_temporary = true 
    AND ura.expires_at IS NULL;
END;
$$ LANGUAGE plpgsql;
`;