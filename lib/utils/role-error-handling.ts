/**
 * Role Management Error Handling Utilities
 * 
 * Provides comprehensive error handling, validation, and recovery
 * mechanisms for role management operations.
 */

import { UserRole, RoleRequestStatus } from '../types/role-management';

export enum RoleErrorCode {
  // Validation errors
  INVALID_ROLE = 'INVALID_ROLE',
  INVALID_USER = 'INVALID_USER',
  INVALID_INSTITUTION = 'INVALID_INSTITUTION',
  INVALID_DEPARTMENT = 'INVALID_DEPARTMENT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Permission errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  UNAUTHORIZED_OPERATION = 'UNAUTHORIZED_OPERATION',
  ROLE_ESCALATION_BLOCKED = 'ROLE_ESCALATION_BLOCKED',
  SELF_APPROVAL_BLOCKED = 'SELF_APPROVAL_BLOCKED',
  
  // Rate limiting errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  COOLDOWN_ACTIVE = 'COOLDOWN_ACTIVE',
  USER_BLOCKED = 'USER_BLOCKED',
  BURST_PROTECTION_TRIGGERED = 'BURST_PROTECTION_TRIGGERED',
  
  // Business logic errors
  ROLE_ALREADY_ASSIGNED = 'ROLE_ALREADY_ASSIGNED',
  ROLE_NOT_FOUND = 'ROLE_NOT_FOUND',
  REQUEST_NOT_FOUND = 'REQUEST_NOT_FOUND',
  REQUEST_ALREADY_PROCESSED = 'REQUEST_ALREADY_PROCESSED',
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
  INVALID_ROLE_TRANSITION = 'INVALID_ROLE_TRANSITION',
  
  // Verification errors
  VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  DOMAIN_NOT_VERIFIED = 'DOMAIN_NOT_VERIFIED',
  EVIDENCE_INVALID = 'EVIDENCE_INVALID',
  
  // System errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum RoleErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface RoleError {
  code: RoleErrorCode;
  message: string;
  severity: RoleErrorSeverity;
  details?: Record<string, any>;
  timestamp: Date;
  userId?: string;
  institutionId?: string;
  requestId?: string;
  stackTrace?: string;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface ErrorContext {
  operation: string;
  userId?: string;
  institutionId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export class RoleErrorHandler {
  private static instance: RoleErrorHandler;
  private errorLog: RoleError[] = [];

  private constructor() {}

  public static getInstance(): RoleErrorHandler {
    if (!RoleErrorHandler.instance) {
      RoleErrorHandler.instance = new RoleErrorHandler();
    }
    return RoleErrorHandler.instance;
  }

  /**
   * Create a standardized role error
   */
  createError(
    code: RoleErrorCode,
    message: string,
    context?: ErrorContext,
    originalError?: Error
  ): RoleError {
    const error: RoleError = {
      code,
      message,
      severity: this.determineSeverity(code),
      timestamp: new Date(),
      userId: context?.userId,
      institutionId: context?.institutionId,
      requestId: context?.requestId,
      details: context?.metadata,
      stackTrace: originalError?.stack,
      recoverable: this.isRecoverable(code),
      suggestedAction: this.getSuggestedAction(code)
    };

    // Log the error
    this.logError(error);

    return error;
  }

  /**
   * Handle and process role-related errors
   */
  async handleError(error: RoleError, context?: ErrorContext): Promise<void> {
    try {
      // Log to persistent storage
      await this.persistError(error);

      // Send notifications for critical errors
      if (error.severity === RoleErrorSeverity.CRITICAL) {
        await this.notifyCriticalError(error);
      }

      // Attempt automatic recovery for recoverable errors
      if (error.recoverable && context) {
        await this.attemptRecovery(error, context);
      }

      // Update metrics
      await this.updateErrorMetrics(error);

    } catch (handlingError) {
      console.error('Error handling failed:', handlingError);
      // Fallback logging
      console.error('Original error:', error);
    }
  }

  /**
   * Validate role request data
   */
  validateRoleRequest(data: {
    userId?: string;
    requestedRole?: string;
    institutionId?: string;
    justification?: string;
  }): RoleError[] {
    const errors: RoleError[] = [];

    if (!data.userId) {
      errors.push(this.createError(
        RoleErrorCode.MISSING_REQUIRED_FIELD,
        'User ID is required',
        { operation: 'validateRoleRequest', metadata: { field: 'userId' } }
      ));
    }

    if (!data.requestedRole) {
      errors.push(this.createError(
        RoleErrorCode.MISSING_REQUIRED_FIELD,
        'Requested role is required',
        { operation: 'validateRoleRequest', metadata: { field: 'requestedRole' } }
      ));
    } else if (!Object.values(UserRole).includes(data.requestedRole as UserRole)) {
      errors.push(this.createError(
        RoleErrorCode.INVALID_ROLE,
        `Invalid role: ${data.requestedRole}`,
        { operation: 'validateRoleRequest', metadata: { requestedRole: data.requestedRole } }
      ));
    }

    if (!data.institutionId) {
      errors.push(this.createError(
        RoleErrorCode.MISSING_REQUIRED_FIELD,
        'Institution ID is required',
        { operation: 'validateRoleRequest', metadata: { field: 'institutionId' } }
      ));
    }

    if (data.justification && data.justification.length < 10) {
      errors.push(this.createError(
        RoleErrorCode.MISSING_REQUIRED_FIELD,
        'Justification must be at least 10 characters',
        { operation: 'validateRoleRequest', metadata: { justificationLength: data.justification.length } }
      ));
    }

    return errors;
  }

  /**
   * Validate role assignment data
   */
  validateRoleAssignment(data: {
    userId?: string;
    role?: string;
    assignedBy?: string;
    institutionId?: string;
    expiresAt?: Date;
  }): RoleError[] {
    const errors: RoleError[] = [];

    if (!data.userId) {
      errors.push(this.createError(
        RoleErrorCode.MISSING_REQUIRED_FIELD,
        'User ID is required',
        { operation: 'validateRoleAssignment', metadata: { field: 'userId' } }
      ));
    }

    if (!data.role) {
      errors.push(this.createError(
        RoleErrorCode.MISSING_REQUIRED_FIELD,
        'Role is required',
        { operation: 'validateRoleAssignment', metadata: { field: 'role' } }
      ));
    } else if (!Object.values(UserRole).includes(data.role as UserRole)) {
      errors.push(this.createError(
        RoleErrorCode.INVALID_ROLE,
        `Invalid role: ${data.role}`,
        { operation: 'validateRoleAssignment', metadata: { role: data.role } }
      ));
    }

    if (!data.assignedBy) {
      errors.push(this.createError(
        RoleErrorCode.MISSING_REQUIRED_FIELD,
        'Assigned by is required',
        { operation: 'validateRoleAssignment', metadata: { field: 'assignedBy' } }
      ));
    }

    if (!data.institutionId) {
      errors.push(this.createError(
        RoleErrorCode.MISSING_REQUIRED_FIELD,
        'Institution ID is required',
        { operation: 'validateRoleAssignment', metadata: { field: 'institutionId' } }
      ));
    }

    if (data.expiresAt && data.expiresAt <= new Date()) {
      errors.push(this.createError(
        RoleErrorCode.INVALID_ROLE_TRANSITION,
        'Expiration date must be in the future',
        { operation: 'validateRoleAssignment', metadata: { expiresAt: data.expiresAt } }
      ));
    }

    return errors;
  }

  /**
   * Wrap async operations with error handling
   */
  async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<{ success: boolean; data?: T; error?: RoleError }> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const roleError = this.mapErrorToRoleError(error, context);
      await this.handleError(roleError, context);
      return { success: false, error: roleError };
    }
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(timeRange?: { start: Date; end: Date }): {
    totalErrors: number;
    errorsByCode: Record<RoleErrorCode, number>;
    errorsBySeverity: Record<RoleErrorSeverity, number>;
    recoverableErrors: number;
    criticalErrors: number;
  } {
    let errors = this.errorLog;

    if (timeRange) {
      errors = errors.filter(e => 
        e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
      );
    }

    const errorsByCode: Record<RoleErrorCode, number> = {} as Record<RoleErrorCode, number>;
    const errorsBySeverity: Record<RoleErrorSeverity, number> = {} as Record<RoleErrorSeverity, number>;

    errors.forEach(error => {
      errorsByCode[error.code] = (errorsByCode[error.code] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    });

    return {
      totalErrors: errors.length,
      errorsByCode,
      errorsBySeverity,
      recoverableErrors: errors.filter(e => e.recoverable).length,
      criticalErrors: errors.filter(e => e.severity === RoleErrorSeverity.CRITICAL).length
    };
  }

  // Private helper methods

  private determineSeverity(code: RoleErrorCode): RoleErrorSeverity {
    const severityMap: Record<RoleErrorCode, RoleErrorSeverity> = {
      [RoleErrorCode.INVALID_ROLE]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.INVALID_USER]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.INVALID_INSTITUTION]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.INVALID_DEPARTMENT]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.MISSING_REQUIRED_FIELD]: RoleErrorSeverity.LOW,
      
      [RoleErrorCode.INSUFFICIENT_PERMISSIONS]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.UNAUTHORIZED_OPERATION]: RoleErrorSeverity.HIGH,
      [RoleErrorCode.ROLE_ESCALATION_BLOCKED]: RoleErrorSeverity.HIGH,
      [RoleErrorCode.SELF_APPROVAL_BLOCKED]: RoleErrorSeverity.MEDIUM,
      
      [RoleErrorCode.RATE_LIMIT_EXCEEDED]: RoleErrorSeverity.LOW,
      [RoleErrorCode.COOLDOWN_ACTIVE]: RoleErrorSeverity.LOW,
      [RoleErrorCode.USER_BLOCKED]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.BURST_PROTECTION_TRIGGERED]: RoleErrorSeverity.MEDIUM,
      
      [RoleErrorCode.ROLE_ALREADY_ASSIGNED]: RoleErrorSeverity.LOW,
      [RoleErrorCode.ROLE_NOT_FOUND]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.REQUEST_NOT_FOUND]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.REQUEST_ALREADY_PROCESSED]: RoleErrorSeverity.LOW,
      [RoleErrorCode.REQUEST_EXPIRED]: RoleErrorSeverity.LOW,
      [RoleErrorCode.INVALID_ROLE_TRANSITION]: RoleErrorSeverity.MEDIUM,
      
      [RoleErrorCode.VERIFICATION_REQUIRED]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.VERIFICATION_FAILED]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.DOMAIN_NOT_VERIFIED]: RoleErrorSeverity.MEDIUM,
      [RoleErrorCode.EVIDENCE_INVALID]: RoleErrorSeverity.MEDIUM,
      
      [RoleErrorCode.DATABASE_ERROR]: RoleErrorSeverity.CRITICAL,
      [RoleErrorCode.EXTERNAL_SERVICE_ERROR]: RoleErrorSeverity.HIGH,
      [RoleErrorCode.CONFIGURATION_ERROR]: RoleErrorSeverity.HIGH,
      [RoleErrorCode.UNKNOWN_ERROR]: RoleErrorSeverity.HIGH
    };

    return severityMap[code] || RoleErrorSeverity.MEDIUM;
  }

  private isRecoverable(code: RoleErrorCode): boolean {
    const recoverableCodes = [
      RoleErrorCode.RATE_LIMIT_EXCEEDED,
      RoleErrorCode.COOLDOWN_ACTIVE,
      RoleErrorCode.EXTERNAL_SERVICE_ERROR,
      RoleErrorCode.REQUEST_EXPIRED
    ];

    return recoverableCodes.includes(code);
  }

  private getSuggestedAction(code: RoleErrorCode): string {
    const actionMap: Record<RoleErrorCode, string> = {
      [RoleErrorCode.INVALID_ROLE]: 'Please select a valid role from the available options',
      [RoleErrorCode.INVALID_USER]: 'Please verify the user ID and try again',
      [RoleErrorCode.MISSING_REQUIRED_FIELD]: 'Please fill in all required fields',
      [RoleErrorCode.INSUFFICIENT_PERMISSIONS]: 'Contact an administrator for permission to perform this action',
      [RoleErrorCode.RATE_LIMIT_EXCEEDED]: 'Please wait before making another request',
      [RoleErrorCode.COOLDOWN_ACTIVE]: 'Please wait for the cooldown period to expire',
      [RoleErrorCode.USER_BLOCKED]: 'Contact an administrator to resolve the block',
      [RoleErrorCode.ROLE_ALREADY_ASSIGNED]: 'The user already has this role',
      [RoleErrorCode.REQUEST_NOT_FOUND]: 'The request may have been deleted or expired',
      [RoleErrorCode.VERIFICATION_REQUIRED]: 'Please complete the verification process',
      [RoleErrorCode.DATABASE_ERROR]: 'Please try again later or contact support',
      [RoleErrorCode.UNKNOWN_ERROR]: 'Please try again or contact support if the problem persists'
    };

    return actionMap[code] || 'Please contact support for assistance';
  }

  private mapErrorToRoleError(error: any, context: ErrorContext): RoleError {
    // Map common error types to role error codes
    if (error.code === '23505') { // PostgreSQL unique violation
      return this.createError(
        RoleErrorCode.ROLE_ALREADY_ASSIGNED,
        'Role is already assigned to this user',
        context,
        error
      );
    }

    if (error.code === '23503') { // PostgreSQL foreign key violation
      return this.createError(
        RoleErrorCode.INVALID_USER,
        'Referenced user, institution, or department does not exist',
        context,
        error
      );
    }

    if (error.message?.includes('rate limit')) {
      return this.createError(
        RoleErrorCode.RATE_LIMIT_EXCEEDED,
        error.message,
        context,
        error
      );
    }

    if (error.message?.includes('permission')) {
      return this.createError(
        RoleErrorCode.INSUFFICIENT_PERMISSIONS,
        error.message,
        context,
        error
      );
    }

    // Default to unknown error
    return this.createError(
      RoleErrorCode.UNKNOWN_ERROR,
      error.message || 'An unknown error occurred',
      context,
      error
    );
  }

  private logError(error: RoleError): void {
    this.errorLog.push(error);
    
    // Keep only recent errors in memory (last 1000)
    if (this.errorLog.length > 1000) {
      this.errorLog = this.errorLog.slice(-1000);
    }

    // Console logging based on severity
    const logMethod = this.getLogMethod(error.severity);
    logMethod(`[${error.code}] ${error.message}`, {
      severity: error.severity,
      userId: error.userId,
      institutionId: error.institutionId,
      details: error.details
    });
  }

  private getLogMethod(severity: RoleErrorSeverity): (message: string, data?: any) => void {
    switch (severity) {
      case RoleErrorSeverity.CRITICAL:
        return console.error;
      case RoleErrorSeverity.HIGH:
        return console.error;
      case RoleErrorSeverity.MEDIUM:
        return console.warn;
      case RoleErrorSeverity.LOW:
        return console.info;
      default:
        return console.log;
    }
  }

  private async persistError(error: RoleError): Promise<void> {
    try {
      const { createClient } = await import('../supabase/server');
      const supabase = createClient();

      await supabase
        .from('role_error_log')
        .insert({
          error_code: error.code,
          message: error.message,
          severity: error.severity,
          user_id: error.userId,
          institution_id: error.institutionId,
          request_id: error.requestId,
          details: error.details,
          stack_trace: error.stackTrace,
          recoverable: error.recoverable,
          suggested_action: error.suggestedAction,
          timestamp: error.timestamp.toISOString()
        });
    } catch (persistError) {
      console.error('Failed to persist error:', persistError);
    }
  }

  private async notifyCriticalError(error: RoleError): Promise<void> {
    try {
      // In a real implementation, this would send notifications to administrators
      console.error('CRITICAL ROLE ERROR:', {
        code: error.code,
        message: error.message,
        userId: error.userId,
        institutionId: error.institutionId,
        timestamp: error.timestamp
      });

      // Could integrate with notification services, email, Slack, etc.
    } catch (notificationError) {
      console.error('Failed to send critical error notification:', notificationError);
    }
  }

  private async attemptRecovery(error: RoleError, context: ErrorContext): Promise<void> {
    try {
      switch (error.code) {
        case RoleErrorCode.RATE_LIMIT_EXCEEDED:
          // Could implement exponential backoff retry
          console.log('Rate limit recovery: implementing backoff strategy');
          break;
        
        case RoleErrorCode.EXTERNAL_SERVICE_ERROR:
          // Could retry with different service endpoint
          console.log('External service recovery: attempting fallback');
          break;
        
        case RoleErrorCode.REQUEST_EXPIRED:
          // Could automatically create a new request
          console.log('Expired request recovery: creating new request');
          break;
        
        default:
          console.log(`No recovery strategy available for error code: ${error.code}`);
      }
    } catch (recoveryError) {
      console.error('Recovery attempt failed:', recoveryError);
    }
  }

  private async updateErrorMetrics(error: RoleError): Promise<void> {
    try {
      // In a real implementation, this would update monitoring metrics
      // Could integrate with Prometheus, DataDog, etc.
      console.log('Updating error metrics:', {
        code: error.code,
        severity: error.severity,
        timestamp: error.timestamp
      });
    } catch (metricsError) {
      console.error('Failed to update error metrics:', metricsError);
    }
  }
}

// Convenience functions for common error scenarios
export const createValidationError = (field: string, message: string, context?: ErrorContext): RoleError => {
  return RoleErrorHandler.getInstance().createError(
    RoleErrorCode.MISSING_REQUIRED_FIELD,
    message,
    { ...context, metadata: { field, ...context?.metadata } }
  );
};

export const createPermissionError = (operation: string, requiredRole?: UserRole, context?: ErrorContext): RoleError => {
  return RoleErrorHandler.getInstance().createError(
    RoleErrorCode.INSUFFICIENT_PERMISSIONS,
    `Insufficient permissions for operation: ${operation}`,
    { ...context, metadata: { operation, requiredRole, ...context?.metadata } }
  );
};

export const createRateLimitError = (limitType: string, retryAfter?: number, context?: ErrorContext): RoleError => {
  return RoleErrorHandler.getInstance().createError(
    RoleErrorCode.RATE_LIMIT_EXCEEDED,
    `Rate limit exceeded: ${limitType}`,
    { ...context, metadata: { limitType, retryAfter, ...context?.metadata } }
  );
};

export const createEscalationError = (fromRole: UserRole, toRole: UserRole, reason: string, context?: ErrorContext): RoleError => {
  return RoleErrorHandler.getInstance().createError(
    RoleErrorCode.ROLE_ESCALATION_BLOCKED,
    `Role escalation blocked: ${reason}`,
    { ...context, metadata: { fromRole, toRole, reason, ...context?.metadata } }
  );
};