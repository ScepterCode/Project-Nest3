/**
 * Role Escalation Prevention Service
 * 
 * Implements security measures to prevent unauthorized role escalation
 * and detect suspicious role-related activities.
 */

import { UserRole, RoleRequest, UserRoleAssignment, AuditAction } from '../types/role-management';
import { createClient } from '../supabase/server';

export interface EscalationRule {
  id: string;
  name: string;
  description: string;
  fromRole: UserRole;
  toRole: UserRole;
  requiresApproval: boolean;
  requiresVerification: boolean;
  maxRequestsPerDay: number;
  cooldownPeriod: number; // hours
  requiredApproverRole: UserRole;
}

export interface SuspiciousActivity {
  id: string;
  userId: string;
  activityType: 'rapid_role_requests' | 'privilege_escalation' | 'unusual_pattern' | 'bulk_requests';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  metadata: Record<string, any>;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
}

export interface EscalationAttempt {
  userId: string;
  fromRole: UserRole;
  toRole: UserRole;
  requestedAt: Date;
  blocked: boolean;
  reason: string;
  metadata: Record<string, any>;
}

export class RoleEscalationPreventionService {
  private escalationRules: EscalationRule[];

  constructor() {
    this.escalationRules = this.getDefaultEscalationRules();
  }

  /**
   * Validate if a role request is allowed based on escalation rules
   */
  async validateRoleRequest(
    userId: string,
    currentRole: UserRole | undefined,
    requestedRole: UserRole,
    institutionId: string,
    context?: { ipAddress?: string; userAgent?: string; sessionId?: string }
  ): Promise<{ allowed: boolean; reason?: string; requiresApproval?: boolean; riskScore?: number }> {
    try {
      // Check if user exists and get their current roles
      const userRoles = await this.getUserActiveRoles(userId, institutionId);
      const primaryRole = currentRole || (userRoles.length > 0 ? userRoles[0].role : UserRole.STUDENT);

      // Calculate initial risk score
      let riskScore = this.calculateBaseRiskScore(primaryRole, requestedRole);

      // Enhanced security checks
      const securityChecks = await this.performSecurityChecks(userId, primaryRole, requestedRole, institutionId, context);
      
      if (!securityChecks.passed) {
        await this.logEscalationAttempt({
          userId,
          fromRole: primaryRole,
          toRole: requestedRole,
          requestedAt: new Date(),
          blocked: true,
          reason: securityChecks.reason || 'Security check failed',
          metadata: { 
            riskScore: securityChecks.riskScore,
            failedChecks: securityChecks.failedChecks,
            ...context 
          }
        });
        
        return { 
          allowed: false, 
          reason: securityChecks.reason,
          riskScore: securityChecks.riskScore
        };
      }

      riskScore += securityChecks.riskScore;

      // Find applicable escalation rule
      const rule = this.findEscalationRule(primaryRole, requestedRole);
      
      if (!rule) {
        // No specific rule found - check if it's a valid transition
        if (this.isValidRoleTransition(primaryRole, requestedRole)) {
          return { 
            allowed: true, 
            requiresApproval: this.requiresApprovalByDefault(requestedRole),
            riskScore 
          };
        } else {
          await this.logEscalationAttempt({
            userId,
            fromRole: primaryRole,
            toRole: requestedRole,
            requestedAt: new Date(),
            blocked: true,
            reason: `Invalid role transition from ${primaryRole} to ${requestedRole}`,
            metadata: { riskScore, ...context }
          });
          
          return { 
            allowed: false, 
            reason: `Role transition from ${primaryRole} to ${requestedRole} is not permitted`,
            riskScore
          };
        }
      }

      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(userId, rule);
      if (!rateLimitCheck.allowed) {
        await this.logSuspiciousActivity({
          userId,
          activityType: 'rapid_role_requests',
          description: `User exceeded rate limit for role requests: ${rateLimitCheck.reason}`,
          severity: 'medium',
          metadata: { rule: rule.id, requestedRole, riskScore }
        });
        return { allowed: false, reason: rateLimitCheck.reason, riskScore };
      }

      // Check cooldown period
      const cooldownCheck = await this.checkCooldownPeriod(userId, requestedRole, rule);
      if (!cooldownCheck.allowed) {
        return { allowed: false, reason: cooldownCheck.reason, riskScore };
      }

      // Check for suspicious patterns
      const suspiciousCheck = await this.detectSuspiciousPattern(userId, requestedRole, context);
      if (suspiciousCheck.suspicious) {
        riskScore += 30; // Increase risk score for suspicious patterns
        
        await this.logSuspiciousActivity({
          userId,
          activityType: 'unusual_pattern',
          description: suspiciousCheck.reason || 'Unusual role request pattern detected',
          severity: 'high',
          metadata: { requestedRole, pattern: suspiciousCheck.pattern, riskScore }
        });
        
        // Block if critical, otherwise require additional approval
        if (suspiciousCheck.severity === 'critical' || riskScore > 80) {
          await this.logEscalationAttempt({
            userId,
            fromRole: primaryRole,
            toRole: requestedRole,
            requestedAt: new Date(),
            blocked: true,
            reason: 'Request blocked due to high risk score and suspicious activity',
            metadata: { riskScore, suspiciousPattern: suspiciousCheck.pattern, ...context }
          });
          
          return { allowed: false, reason: 'Request blocked due to suspicious activity', riskScore };
        }
      }

      // Log successful validation
      await this.logEscalationAttempt({
        userId,
        fromRole: primaryRole,
        toRole: requestedRole,
        requestedAt: new Date(),
        blocked: false,
        reason: 'Role request validated successfully',
        metadata: { riskScore, rule: rule.id, ...context }
      });

      return { 
        allowed: true, 
        requiresApproval: rule.requiresApproval || suspiciousCheck.suspicious || riskScore > 50,
        riskScore
      };

    } catch (error) {
      console.error('Error validating role request:', error);
      
      // Log the error for security monitoring
      await this.logSuspiciousActivity({
        userId,
        activityType: 'unusual_pattern',
        description: 'Role validation system error - potential security issue',
        severity: 'high',
        metadata: { error: error.message, requestedRole, currentRole }
      });
      
      // Fail secure - deny the request if validation fails
      return { 
        allowed: false, 
        reason: 'Unable to validate role request due to system error',
        riskScore: 100
      };
    }
  }

  /**
   * Validate if a user can approve a role request
   */
  async validateApproverPermission(
    approverId: string,
    roleRequest: RoleRequest
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // Get approver's roles
      const approverRoles = await this.getUserActiveRoles(approverId, roleRequest.institutionId);
      
      if (approverRoles.length === 0) {
        return { allowed: false, reason: 'Approver has no active roles' };
      }

      // Find the escalation rule for this request
      const rule = this.findEscalationRule(roleRequest.currentRole, roleRequest.requestedRole);
      
      if (rule) {
        // Check if approver has the required role
        const hasRequiredRole = approverRoles.some(assignment => 
          this.canRoleApprove(assignment.role, rule.requiredApproverRole)
        );
        
        if (!hasRequiredRole) {
          return { 
            allowed: false, 
            reason: `Approver must have ${rule.requiredApproverRole} role or higher` 
          };
        }
      } else {
        // Default approval rules
        const canApprove = approverRoles.some(assignment => 
          this.canApproveRoleByDefault(assignment.role, roleRequest.requestedRole)
        );
        
        if (!canApprove) {
          return { 
            allowed: false, 
            reason: 'Approver does not have sufficient permissions' 
          };
        }
      }

      // Check if approver is trying to approve their own request
      if (approverId === roleRequest.userId) {
        await this.logSuspiciousActivity({
          userId: approverId,
          activityType: 'privilege_escalation',
          description: 'User attempted to approve their own role request',
          severity: 'high',
          metadata: { roleRequestId: roleRequest.id, requestedRole: roleRequest.requestedRole }
        });
        
        return { allowed: false, reason: 'Cannot approve your own role request' };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error validating approver permission:', error);
      return { 
        allowed: false, 
        reason: 'Unable to validate approver permissions due to system error' 
      };
    }
  }

  /**
   * Detect and log escalation attempts
   */
  async logEscalationAttempt(attempt: EscalationAttempt): Promise<void> {
    const supabase = createClient();
    
    try {
      await supabase
        .from('role_escalation_attempts')
        .insert({
          user_id: attempt.userId,
          from_role: attempt.fromRole,
          to_role: attempt.toRole,
          requested_at: attempt.requestedAt.toISOString(),
          blocked: attempt.blocked,
          reason: attempt.reason,
          metadata: attempt.metadata,
          created_at: new Date().toISOString()
        });

      // If blocked, also log as suspicious activity
      if (attempt.blocked) {
        await this.logSuspiciousActivity({
          userId: attempt.userId,
          activityType: 'privilege_escalation',
          description: `Blocked escalation attempt: ${attempt.reason}`,
          severity: 'high',
          metadata: {
            fromRole: attempt.fromRole,
            toRole: attempt.toRole,
            ...attempt.metadata
          }
        });
      }
    } catch (error) {
      console.error('Failed to log escalation attempt:', error);
    }
  }

  /**
   * Get suspicious activities for monitoring
   */
  async getSuspiciousActivities(
    institutionId?: string,
    severity?: string,
    resolved?: boolean,
    limit: number = 100
  ): Promise<SuspiciousActivity[]> {
    const supabase = createClient();
    
    try {
      let query = supabase
        .from('suspicious_activities')
        .select(`
          *,
          users!suspicious_activities_user_id_fkey (email, full_name)
        `)
        .order('detected_at', { ascending: false })
        .limit(limit);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }
      if (severity) {
        query = query.eq('severity', severity);
      }
      if (resolved !== undefined) {
        query = query.eq('resolved', resolved);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data?.map(row => ({
        id: row.id,
        userId: row.user_id,
        activityType: row.activity_type,
        description: row.description,
        severity: row.severity,
        detectedAt: new Date(row.detected_at),
        metadata: row.metadata || {},
        resolved: row.resolved,
        resolvedBy: row.resolved_by,
        resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined
      })) || [];

    } catch (error) {
      console.error('Failed to get suspicious activities:', error);
      return [];
    }
  }

  /**
   * Resolve a suspicious activity
   */
  async resolveSuspiciousActivity(
    activityId: string,
    resolvedBy: string,
    resolution: string
  ): Promise<void> {
    const supabase = createClient();
    
    try {
      await supabase
        .from('suspicious_activities')
        .update({
          resolved: true,
          resolved_by: resolvedBy,
          resolved_at: new Date().toISOString(),
          resolution
        })
        .eq('id', activityId);
    } catch (error) {
      console.error('Failed to resolve suspicious activity:', error);
      throw error;
    }
  }

  // Private helper methods

  private getDefaultEscalationRules(): EscalationRule[] {
    return [
      {
        id: 'student-to-teacher',
        name: 'Student to Teacher',
        description: 'Student requesting teacher role',
        fromRole: UserRole.STUDENT,
        toRole: UserRole.TEACHER,
        requiresApproval: true,
        requiresVerification: true,
        maxRequestsPerDay: 1,
        cooldownPeriod: 24,
        requiredApproverRole: UserRole.DEPARTMENT_ADMIN
      },
      {
        id: 'teacher-to-dept-admin',
        name: 'Teacher to Department Admin',
        description: 'Teacher requesting department admin role',
        fromRole: UserRole.TEACHER,
        toRole: UserRole.DEPARTMENT_ADMIN,
        requiresApproval: true,
        requiresVerification: true,
        maxRequestsPerDay: 1,
        cooldownPeriod: 72,
        requiredApproverRole: UserRole.INSTITUTION_ADMIN
      },
      {
        id: 'dept-admin-to-inst-admin',
        name: 'Department Admin to Institution Admin',
        description: 'Department admin requesting institution admin role',
        fromRole: UserRole.DEPARTMENT_ADMIN,
        toRole: UserRole.INSTITUTION_ADMIN,
        requiresApproval: true,
        requiresVerification: true,
        maxRequestsPerDay: 1,
        cooldownPeriod: 168, // 1 week
        requiredApproverRole: UserRole.SYSTEM_ADMIN
      },
      {
        id: 'any-to-system-admin',
        name: 'Any to System Admin',
        description: 'Any role requesting system admin role',
        fromRole: UserRole.STUDENT, // This will match any role due to hierarchy
        toRole: UserRole.SYSTEM_ADMIN,
        requiresApproval: true,
        requiresVerification: true,
        maxRequestsPerDay: 1,
        cooldownPeriod: 720, // 30 days
        requiredApproverRole: UserRole.SYSTEM_ADMIN
      }
    ];
  }

  private findEscalationRule(fromRole: UserRole | undefined, toRole: UserRole): EscalationRule | null {
    // Find exact match first
    let rule = this.escalationRules.find(r => r.fromRole === fromRole && r.toRole === toRole);
    
    // If no exact match, find rule that applies to this escalation
    if (!rule) {
      rule = this.escalationRules.find(r => 
        r.toRole === toRole && this.isRoleEqualOrLower(fromRole, r.fromRole)
      );
    }
    
    return rule || null;
  }

  private isValidRoleTransition(fromRole: UserRole, toRole: UserRole): boolean {
    // Define valid role transitions
    const validTransitions: Record<UserRole, UserRole[]> = {
      [UserRole.STUDENT]: [UserRole.TEACHER],
      [UserRole.TEACHER]: [UserRole.STUDENT, UserRole.DEPARTMENT_ADMIN],
      [UserRole.DEPARTMENT_ADMIN]: [UserRole.TEACHER, UserRole.INSTITUTION_ADMIN],
      [UserRole.INSTITUTION_ADMIN]: [UserRole.DEPARTMENT_ADMIN, UserRole.SYSTEM_ADMIN],
      [UserRole.SYSTEM_ADMIN]: [UserRole.INSTITUTION_ADMIN]
    };

    return validTransitions[fromRole]?.includes(toRole) || false;
  }

  private requiresApprovalByDefault(role: UserRole): boolean {
    return [
      UserRole.TEACHER,
      UserRole.DEPARTMENT_ADMIN,
      UserRole.INSTITUTION_ADMIN,
      UserRole.SYSTEM_ADMIN
    ].includes(role);
  }

  private canRoleApprove(approverRole: UserRole, requiredRole: UserRole): boolean {
    const roleHierarchy = {
      [UserRole.STUDENT]: 0,
      [UserRole.TEACHER]: 1,
      [UserRole.DEPARTMENT_ADMIN]: 2,
      [UserRole.INSTITUTION_ADMIN]: 3,
      [UserRole.SYSTEM_ADMIN]: 4
    };

    return roleHierarchy[approverRole] >= roleHierarchy[requiredRole];
  }

  private canApproveRoleByDefault(approverRole: UserRole, requestedRole: UserRole): boolean {
    const approvalMatrix: Record<UserRole, UserRole[]> = {
      [UserRole.DEPARTMENT_ADMIN]: [UserRole.TEACHER],
      [UserRole.INSTITUTION_ADMIN]: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN],
      [UserRole.SYSTEM_ADMIN]: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN]
    };

    return approvalMatrix[approverRole]?.includes(requestedRole) || false;
  }

  private isRoleEqualOrLower(role: UserRole | undefined, compareRole: UserRole): boolean {
    if (!role) return true; // Undefined role is considered lowest
    
    const roleHierarchy = {
      [UserRole.STUDENT]: 0,
      [UserRole.TEACHER]: 1,
      [UserRole.DEPARTMENT_ADMIN]: 2,
      [UserRole.INSTITUTION_ADMIN]: 3,
      [UserRole.SYSTEM_ADMIN]: 4
    };

    return roleHierarchy[role] <= roleHierarchy[compareRole];
  }

  private async getUserActiveRoles(userId: string, institutionId: string): Promise<UserRoleAssignment[]> {
    const supabase = createClient();
    
    try {
      const { data, error } = await supabase
        .from('user_role_assignments')
        .select('*')
        .eq('user_id', userId)
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .or('expires_at.is.null,expires_at.gt.now()');

      if (error) {
        throw error;
      }

      return data?.map(row => ({
        id: row.id,
        userId: row.user_id,
        role: row.role,
        status: row.status,
        assignedBy: row.assigned_by,
        assignedAt: new Date(row.assigned_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
        departmentId: row.department_id,
        institutionId: row.institution_id,
        isTemporary: row.is_temporary,
        metadata: row.metadata || {},
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      })) || [];

    } catch (error) {
      console.error('Failed to get user active roles:', error);
      return [];
    }
  }

  private async checkRateLimit(userId: string, rule: EscalationRule): Promise<{ allowed: boolean; reason?: string }> {
    const supabase = createClient();
    
    try {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { data, error } = await supabase
        .from('role_requests')
        .select('id')
        .eq('user_id', userId)
        .eq('requested_role', rule.toRole)
        .gte('requested_at', oneDayAgo.toISOString());

      if (error) {
        throw error;
      }

      const requestCount = data?.length || 0;
      
      if (requestCount >= rule.maxRequestsPerDay) {
        return { 
          allowed: false, 
          reason: `Rate limit exceeded: ${requestCount}/${rule.maxRequestsPerDay} requests in 24 hours` 
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Failed to check rate limit:', error);
      // Fail secure - deny if we can't check
      return { allowed: false, reason: 'Unable to verify rate limit' };
    }
  }

  private async checkCooldownPeriod(
    userId: string, 
    requestedRole: UserRole, 
    rule: EscalationRule
  ): Promise<{ allowed: boolean; reason?: string }> {
    const supabase = createClient();
    
    try {
      const cooldownStart = new Date();
      cooldownStart.setHours(cooldownStart.getHours() - rule.cooldownPeriod);

      const { data, error } = await supabase
        .from('role_requests')
        .select('requested_at')
        .eq('user_id', userId)
        .eq('requested_role', requestedRole)
        .in('status', ['approved', 'denied'])
        .gte('requested_at', cooldownStart.toISOString())
        .order('requested_at', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        const lastRequest = new Date(data[0].requested_at);
        const hoursRemaining = Math.ceil((lastRequest.getTime() + (rule.cooldownPeriod * 60 * 60 * 1000) - Date.now()) / (60 * 60 * 1000));
        
        return { 
          allowed: false, 
          reason: `Cooldown period active. Please wait ${hoursRemaining} hours before requesting this role again` 
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Failed to check cooldown period:', error);
      return { allowed: true }; // Allow if we can't check cooldown
    }
  }

  private async detectSuspiciousPattern(
    userId: string, 
    requestedRole: UserRole
  ): Promise<{ suspicious: boolean; severity?: string; reason?: string; pattern?: string }> {
    const supabase = createClient();
    
    try {
      // Check for rapid successive requests
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const { data: recentRequests, error } = await supabase
        .from('role_requests')
        .select('requested_role, requested_at')
        .eq('user_id', userId)
        .gte('requested_at', oneHourAgo.toISOString())
        .order('requested_at', { ascending: false });

      if (error) {
        throw error;
      }

      const requestCount = recentRequests?.length || 0;
      
      // Pattern 1: Too many requests in short time
      if (requestCount >= 5) {
        return {
          suspicious: true,
          severity: 'critical',
          reason: `${requestCount} role requests in the last hour`,
          pattern: 'rapid_requests'
        };
      }

      // Pattern 2: Requesting multiple high-privilege roles
      const highPrivilegeRoles = [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN];
      const highPrivilegeRequests = recentRequests?.filter(req => 
        highPrivilegeRoles.includes(req.requested_role)
      ) || [];

      if (highPrivilegeRequests.length >= 2) {
        return {
          suspicious: true,
          severity: 'high',
          reason: 'Multiple high-privilege role requests in short time',
          pattern: 'privilege_escalation'
        };
      }

      // Pattern 3: Unusual role progression
      if (requestedRole === UserRole.SYSTEM_ADMIN) {
        const userRoles = await this.getUserActiveRoles(userId, ''); // Check across all institutions
        const hasLowerRole = userRoles.some(assignment => 
          [UserRole.STUDENT, UserRole.TEACHER].includes(assignment.role)
        );
        
        if (hasLowerRole) {
          return {
            suspicious: true,
            severity: 'high',
            reason: 'Attempting to jump from low-privilege to system admin role',
            pattern: 'unusual_progression'
          };
        }
      }

      return { suspicious: false };

    } catch (error) {
      console.error('Failed to detect suspicious pattern:', error);
      return { suspicious: false };
    }
  }

  private async logSuspiciousActivity(activity: Omit<SuspiciousActivity, 'id' | 'detectedAt' | 'resolved'>): Promise<void> {
    const supabase = createClient();
    
    try {
      await supabase
        .from('suspicious_activities')
        .insert({
          user_id: activity.userId,
          activity_type: activity.activityType,
          description: activity.description,
          severity: activity.severity,
          detected_at: new Date().toISOString(),
          metadata: activity.metadata,
          resolved: false
        });
    } catch (error) {
      console.error('Failed to log suspicious activity:', error);
    }
  }

  /**
   * Calculate base risk score for role transition
   */
  private calculateBaseRiskScore(fromRole: UserRole, toRole: UserRole): number {
    const roleHierarchy = {
      [UserRole.STUDENT]: 0,
      [UserRole.TEACHER]: 1,
      [UserRole.DEPARTMENT_ADMIN]: 2,
      [UserRole.INSTITUTION_ADMIN]: 3,
      [UserRole.SYSTEM_ADMIN]: 4
    };

    const fromLevel = roleHierarchy[fromRole] || 0;
    const toLevel = roleHierarchy[toRole] || 0;
    const levelJump = toLevel - fromLevel;

    // Base risk increases with privilege level jump
    let riskScore = 0;
    
    if (levelJump === 1) {
      riskScore = 10; // Normal progression
    } else if (levelJump === 2) {
      riskScore = 25; // Skipping one level
    } else if (levelJump >= 3) {
      riskScore = 50; // Major privilege escalation
    } else if (levelJump <= 0) {
      riskScore = 5; // Downgrade or lateral move
    }

    // Additional risk for system admin requests
    if (toRole === UserRole.SYSTEM_ADMIN) {
      riskScore += 20;
    }

    return Math.min(riskScore, 100);
  }

  /**
   * Perform comprehensive security checks
   */
  private async performSecurityChecks(
    userId: string,
    fromRole: UserRole,
    toRole: UserRole,
    institutionId: string,
    context?: { ipAddress?: string; userAgent?: string; sessionId?: string }
  ): Promise<{
    passed: boolean;
    reason?: string;
    riskScore: number;
    failedChecks: string[];
  }> {
    const failedChecks: string[] = [];
    let riskScore = 0;

    try {
      // Check 1: Time-based patterns
      const timeCheck = await this.checkTimeBasedPatterns(userId);
      if (!timeCheck.passed) {
        failedChecks.push('time_pattern');
        riskScore += timeCheck.riskIncrease;
      }

      // Check 2: IP-based analysis
      if (context?.ipAddress) {
        const ipCheck = await this.checkIPPatterns(userId, context.ipAddress);
        if (!ipCheck.passed) {
          failedChecks.push('ip_pattern');
          riskScore += ipCheck.riskIncrease;
        }
      }

      // Check 3: Session validation
      if (context?.sessionId) {
        const sessionCheck = await this.checkSessionSecurity(userId, context.sessionId);
        if (!sessionCheck.passed) {
          failedChecks.push('session_security');
          riskScore += sessionCheck.riskIncrease;
        }
      }

      // Check 4: User behavior analysis
      const behaviorCheck = await this.checkUserBehaviorPatterns(userId, institutionId);
      if (!behaviorCheck.passed) {
        failedChecks.push('behavior_pattern');
        riskScore += behaviorCheck.riskIncrease;
      }

      // Check 5: Cross-institution analysis
      const crossInstCheck = await this.checkCrossInstitutionActivity(userId);
      if (!crossInstCheck.passed) {
        failedChecks.push('cross_institution');
        riskScore += crossInstCheck.riskIncrease;
      }

      // Determine if checks passed based on risk threshold
      const criticalFailures = failedChecks.filter(check => 
        ['session_security', 'behavior_pattern'].includes(check)
      );

      if (criticalFailures.length > 0 || riskScore > 70) {
        return {
          passed: false,
          reason: `Security checks failed: ${failedChecks.join(', ')}`,
          riskScore,
          failedChecks
        };
      }

      return {
        passed: true,
        riskScore,
        failedChecks
      };

    } catch (error) {
      console.error('Error performing security checks:', error);
      return {
        passed: false,
        reason: 'Security validation system error',
        riskScore: 100,
        failedChecks: ['system_error']
      };
    }
  }

  /**
   * Check for suspicious time-based patterns
   */
  private async checkTimeBasedPatterns(userId: string): Promise<{ passed: boolean; riskIncrease: number }> {
    const supabase = createClient();
    
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Check for requests outside normal hours (assuming 6 AM - 10 PM)
      const currentHour = now.getHours();
      const isOffHours = currentHour < 6 || currentHour > 22;

      // Check recent activity frequency
      const { data: recentActivity, error } = await supabase
        .from('role_requests')
        .select('requested_at')
        .eq('user_id', userId)
        .gte('requested_at', oneDayAgo.toISOString());

      if (error) {
        throw error;
      }

      const activityCount = recentActivity?.length || 0;
      let riskIncrease = 0;

      if (isOffHours) {
        riskIncrease += 15;
      }

      if (activityCount > 3) {
        riskIncrease += 20;
      }

      return {
        passed: riskIncrease < 30,
        riskIncrease
      };

    } catch (error) {
      console.error('Error checking time patterns:', error);
      return { passed: false, riskIncrease: 25 };
    }
  }

  /**
   * Check IP-based patterns for suspicious activity
   */
  private async checkIPPatterns(userId: string, ipAddress: string): Promise<{ passed: boolean; riskIncrease: number }> {
    const supabase = createClient();
    
    try {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      // Check for multiple IPs used by same user
      const { data: ipHistory, error } = await supabase
        .from('role_request_rate_limits')
        .select('client_ip')
        .eq('user_id', userId)
        .gte('created_at', oneDayAgo.toISOString());

      if (error) {
        throw error;
      }

      const uniqueIPs = new Set(ipHistory?.map(r => r.client_ip).filter(Boolean));
      let riskIncrease = 0;

      // Multiple IPs in short time is suspicious
      if (uniqueIPs.size > 3) {
        riskIncrease += 25;
      }

      // Check if IP is from known suspicious ranges (simplified)
      if (this.isSuspiciousIP(ipAddress)) {
        riskIncrease += 30;
      }

      return {
        passed: riskIncrease < 40,
        riskIncrease
      };

    } catch (error) {
      console.error('Error checking IP patterns:', error);
      return { passed: false, riskIncrease: 20 };
    }
  }

  /**
   * Check session security
   */
  private async checkSessionSecurity(userId: string, sessionId: string): Promise<{ passed: boolean; riskIncrease: number }> {
    // In a real implementation, this would validate session integrity,
    // check for session hijacking indicators, etc.
    
    try {
      // Simplified session validation
      if (!sessionId || sessionId.length < 10) {
        return { passed: false, riskIncrease: 50 };
      }

      // Check session age, concurrent sessions, etc.
      // This is a placeholder for more sophisticated session analysis
      
      return { passed: true, riskIncrease: 0 };

    } catch (error) {
      console.error('Error checking session security:', error);
      return { passed: false, riskIncrease: 40 };
    }
  }

  /**
   * Check user behavior patterns
   */
  private async checkUserBehaviorPatterns(userId: string, institutionId: string): Promise<{ passed: boolean; riskIncrease: number }> {
    const supabase = createClient();
    
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Check user's historical activity
      const { data: userActivity, error } = await supabase
        .from('role_requests')
        .select('requested_role, status, requested_at')
        .eq('user_id', userId)
        .eq('institution_id', institutionId)
        .gte('requested_at', oneWeekAgo.toISOString());

      if (error) {
        throw error;
      }

      let riskIncrease = 0;
      const activities = userActivity || [];

      // Check for unusual patterns
      const deniedRequests = activities.filter(a => a.status === 'denied').length;
      const totalRequests = activities.length;

      // High denial rate is suspicious
      if (totalRequests > 0 && deniedRequests / totalRequests > 0.5) {
        riskIncrease += 25;
      }

      // Rapid escalation attempts
      const escalationAttempts = activities.filter(a => 
        [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN].includes(a.requested_role)
      ).length;

      if (escalationAttempts > 2) {
        riskIncrease += 30;
      }

      return {
        passed: riskIncrease < 35,
        riskIncrease
      };

    } catch (error) {
      console.error('Error checking user behavior patterns:', error);
      return { passed: false, riskIncrease: 25 };
    }
  }

  /**
   * Check cross-institution activity
   */
  private async checkCrossInstitutionActivity(userId: string): Promise<{ passed: boolean; riskIncrease: number }> {
    const supabase = createClient();
    
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Check for role requests across multiple institutions
      const { data: crossInstActivity, error } = await supabase
        .from('role_requests')
        .select('institution_id, requested_role')
        .eq('user_id', userId)
        .gte('requested_at', oneWeekAgo.toISOString());

      if (error) {
        throw error;
      }

      const uniqueInstitutions = new Set(crossInstActivity?.map(r => r.institution_id));
      let riskIncrease = 0;

      // Multiple institutions in short time is suspicious
      if (uniqueInstitutions.size > 2) {
        riskIncrease += 20;
      }

      // High-privilege requests across institutions
      const highPrivilegeRequests = crossInstActivity?.filter(r => 
        [UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN].includes(r.requested_role)
      ).length || 0;

      if (highPrivilegeRequests > 1) {
        riskIncrease += 25;
      }

      return {
        passed: riskIncrease < 30,
        riskIncrease
      };

    } catch (error) {
      console.error('Error checking cross-institution activity:', error);
      return { passed: false, riskIncrease: 15 };
    }
  }

  /**
   * Check if IP address is from suspicious range
   */
  private isSuspiciousIP(ipAddress: string): boolean {
    // Simplified suspicious IP detection
    // In a real implementation, this would check against threat intelligence feeds,
    // known VPN/proxy ranges, etc.
    
    const suspiciousPatterns = [
      /^10\./, // Private networks (could indicate VPN)
      /^192\.168\./, // Private networks
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private networks
      /^127\./, // Localhost
      /^0\./, // Invalid range
    ];

    return suspiciousPatterns.some(pattern => pattern.test(ipAddress));
  }

  /**
   * Enhanced suspicious pattern detection with context
   */
  private async detectSuspiciousPattern(
    userId: string, 
    requestedRole: UserRole,
    context?: { ipAddress?: string; userAgent?: string; sessionId?: string }
  ): Promise<{ suspicious: boolean; severity?: string; reason?: string; pattern?: string }> {
    const supabase = createClient();
    
    try {
      // Check for rapid successive requests
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const { data: recentRequests, error } = await supabase
        .from('role_requests')
        .select('requested_role, requested_at')
        .eq('user_id', userId)
        .gte('requested_at', oneHourAgo.toISOString())
        .order('requested_at', { ascending: false });

      if (error) {
        throw error;
      }

      const requestCount = recentRequests?.length || 0;
      
      // Pattern 1: Too many requests in short time
      if (requestCount >= 5) {
        return {
          suspicious: true,
          severity: 'critical',
          reason: `${requestCount} role requests in the last hour`,
          pattern: 'rapid_requests'
        };
      }

      // Pattern 2: Requesting multiple high-privilege roles
      const highPrivilegeRoles = [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN];
      const highPrivilegeRequests = recentRequests?.filter(req => 
        highPrivilegeRoles.includes(req.requested_role)
      ) || [];

      if (highPrivilegeRequests.length >= 2) {
        return {
          suspicious: true,
          severity: 'high',
          reason: 'Multiple high-privilege role requests in short time',
          pattern: 'privilege_escalation'
        };
      }

      // Pattern 3: Unusual role progression
      if (requestedRole === UserRole.SYSTEM_ADMIN) {
        const userRoles = await this.getUserActiveRoles(userId, ''); // Check across all institutions
        const hasLowerRole = userRoles.some(assignment => 
          [UserRole.STUDENT, UserRole.TEACHER].includes(assignment.role)
        );
        
        if (hasLowerRole) {
          return {
            suspicious: true,
            severity: 'high',
            reason: 'Attempting to jump from low-privilege to system admin role',
            pattern: 'unusual_progression'
          };
        }
      }

      // Pattern 4: Context-based suspicious indicators
      if (context) {
        // Check for suspicious user agent patterns
        if (context.userAgent && this.isSuspiciousUserAgent(context.userAgent)) {
          return {
            suspicious: true,
            severity: 'medium',
            reason: 'Suspicious user agent detected',
            pattern: 'suspicious_client'
          };
        }

        // Check for automated request patterns
        if (this.detectAutomatedBehavior(recentRequests || [], context)) {
          return {
            suspicious: true,
            severity: 'high',
            reason: 'Automated request pattern detected',
            pattern: 'automation'
          };
        }
      }

      return { suspicious: false };

    } catch (error) {
      console.error('Failed to detect suspicious pattern:', error);
      return { suspicious: false };
    }
  }

  /**
   * Check if user agent indicates suspicious client
   */
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /curl/i,
      /wget/i,
      /python/i,
      /bot/i,
      /crawler/i,
      /script/i,
      /automated/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Detect automated behavior patterns
   */
  private detectAutomatedBehavior(
    recentRequests: any[], 
    context: { ipAddress?: string; userAgent?: string; sessionId?: string }
  ): boolean {
    if (recentRequests.length < 2) {
      return false;
    }

    // Check for perfectly timed requests (indicating automation)
    const timestamps = recentRequests.map(r => new Date(r.requested_at).getTime());
    const intervals = [];
    
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i-1] - timestamps[i]);
    }

    // If intervals are too regular, it might be automated
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    
    // Low variance in timing suggests automation
    return variance < 1000; // Less than 1 second variance
  }
}