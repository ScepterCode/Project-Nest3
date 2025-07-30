/**
 * Role Security Middleware
 * 
 * Comprehensive security middleware for role management operations
 * that integrates all security measures including rate limiting,
 * escalation prevention, and security logging.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RoleEscalationPreventionService } from '../services/role-escalation-prevention';
import { RoleRequestRateLimiter } from '../services/role-request-rate-limiter';
import { RoleSecurityLogger, SecurityEventType } from '../services/role-security-logger';
import { RoleErrorHandler, RoleErrorCode } from '../utils/role-error-handling';
import { UserRole } from '../types/role-management';

export interface SecurityContext {
  userId: string;
  institutionId: string;
  ipAddress: string;
  userAgent: string;
  sessionId?: string;
  operation: string;
  requestData?: any;
}

export interface SecurityValidationResult {
  allowed: boolean;
  reason?: string;
  riskScore?: number;
  requiresAdditionalApproval?: boolean;
  securityWarnings?: string[];
}

export class RoleSecurityMiddleware {
  private escalationService: RoleEscalationPreventionService;
  private rateLimiter: RoleRequestRateLimiter;
  private securityLogger: RoleSecurityLogger;
  private errorHandler: RoleErrorHandler;

  constructor() {
    this.escalationService = new RoleEscalationPreventionService();
    this.rateLimiter = new RoleRequestRateLimiter();
    this.securityLogger = RoleSecurityLogger.getInstance();
    this.errorHandler = RoleErrorHandler.getInstance();
  }

  /**
   * Main security validation middleware
   */
  async validateRoleOperation(
    context: SecurityContext
  ): Promise<SecurityValidationResult> {
    const startTime = Date.now();
    
    try {
      // Log the operation attempt
      await this.securityLogger.logSecurityEvent(
        SecurityEventType.ROLE_REQUEST_CREATED,
        `Role operation attempted: ${context.operation}`,
        {
          operation: context.operation,
          requestData: context.requestData,
          startTime
        },
        {
          userId: context.userId,
          institutionId: context.institutionId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          sessionId: context.sessionId
        }
      );

      // Step 1: Basic input validation
      const inputValidation = await this.validateInput(context);
      if (!inputValidation.valid) {
        return {
          allowed: false,
          reason: inputValidation.reason,
          securityWarnings: inputValidation.warnings
        };
      }

      // Step 2: Rate limiting check
      const rateLimitResult = await this.checkRateLimit(context);
      if (!rateLimitResult.allowed) {
        await this.logSecurityViolation(context, 'rate_limit_exceeded', rateLimitResult.reason);
        return rateLimitResult;
      }

      // Step 3: Role escalation prevention
      const escalationResult = await this.checkRoleEscalation(context);
      if (!escalationResult.allowed) {
        await this.logSecurityViolation(context, 'escalation_blocked', escalationResult.reason);
        return escalationResult;
      }

      // Step 4: Advanced security analysis
      const securityAnalysis = await this.performSecurityAnalysis(context);
      if (!securityAnalysis.allowed) {
        await this.logSecurityViolation(context, 'security_analysis_failed', securityAnalysis.reason);
        return securityAnalysis;
      }

      // Step 5: Behavioral analysis
      const behaviorAnalysis = await this.analyzeBehaviorPatterns(context);
      
      // Combine all results
      const finalResult: SecurityValidationResult = {
        allowed: true,
        riskScore: (escalationResult.riskScore || 0) + (securityAnalysis.riskScore || 0),
        requiresAdditionalApproval: 
          escalationResult.requiresAdditionalApproval || 
          securityAnalysis.requiresAdditionalApproval ||
          behaviorAnalysis.suspicious,
        securityWarnings: [
          ...(escalationResult.securityWarnings || []),
          ...(securityAnalysis.securityWarnings || []),
          ...(behaviorAnalysis.warnings || [])
        ]
      };

      // Log successful validation
      await this.securityLogger.logSecurityEvent(
        SecurityEventType.ROLE_REQUEST_CREATED,
        `Role operation validated: ${context.operation}`,
        {
          operation: context.operation,
          riskScore: finalResult.riskScore,
          requiresAdditionalApproval: finalResult.requiresAdditionalApproval,
          processingTime: Date.now() - startTime
        },
        {
          userId: context.userId,
          institutionId: context.institutionId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          sessionId: context.sessionId
        }
      );

      return finalResult;

    } catch (error) {
      // Log the error and fail securely
      await this.handleSecurityError(context, error);
      
      return {
        allowed: false,
        reason: 'Security validation failed due to system error',
        riskScore: 100,
        securityWarnings: ['System error during security validation']
      };
    }
  }

  /**
   * Validate input data for security issues
   */
  private async validateInput(context: SecurityContext): Promise<{
    valid: boolean;
    reason?: string;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // Check for SQL injection patterns
    if (this.containsSQLInjection(JSON.stringify(context.requestData))) {
      return {
        valid: false,
        reason: 'Potential SQL injection detected',
        warnings: ['SQL injection attempt detected']
      };
    }

    // Check for XSS patterns
    if (this.containsXSS(JSON.stringify(context.requestData))) {
      warnings.push('Potential XSS content detected');
    }

    // Check for suspicious user agent
    if (this.isSuspiciousUserAgent(context.userAgent)) {
      warnings.push('Suspicious user agent detected');
    }

    // Check for suspicious IP patterns
    if (this.isSuspiciousIP(context.ipAddress)) {
      warnings.push('Request from suspicious IP range');
    }

    return {
      valid: true,
      warnings
    };
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(context: SecurityContext): Promise<SecurityValidationResult> {
    try {
      const requestedRole = context.requestData?.requestedRole as UserRole;
      
      if (!requestedRole) {
        return { allowed: true };
      }

      const rateLimitResult = await this.rateLimiter.checkRateLimit(
        context.userId,
        requestedRole,
        context.institutionId,
        context.ipAddress
      );

      if (!rateLimitResult.allowed) {
        return {
          allowed: false,
          reason: rateLimitResult.reason,
          securityWarnings: ['Rate limit exceeded']
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error checking rate limit:', error);
      return {
        allowed: false,
        reason: 'Unable to verify rate limits',
        securityWarnings: ['Rate limit check failed']
      };
    }
  }

  /**
   * Check role escalation prevention
   */
  private async checkRoleEscalation(context: SecurityContext): Promise<SecurityValidationResult> {
    try {
      const { currentRole, requestedRole } = context.requestData || {};
      
      if (!requestedRole) {
        return { allowed: true };
      }

      const escalationResult = await this.escalationService.validateRoleRequest(
        context.userId,
        currentRole,
        requestedRole,
        context.institutionId,
        {
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          sessionId: context.sessionId
        }
      );

      return {
        allowed: escalationResult.allowed,
        reason: escalationResult.reason,
        riskScore: escalationResult.riskScore,
        requiresAdditionalApproval: escalationResult.requiresApproval,
        securityWarnings: escalationResult.allowed ? [] : ['Role escalation blocked']
      };

    } catch (error) {
      console.error('Error checking role escalation:', error);
      return {
        allowed: false,
        reason: 'Unable to validate role escalation',
        riskScore: 100,
        securityWarnings: ['Escalation check failed']
      };
    }
  }

  /**
   * Perform advanced security analysis
   */
  private async performSecurityAnalysis(context: SecurityContext): Promise<SecurityValidationResult> {
    const warnings: string[] = [];
    let riskScore = 0;
    let requiresAdditionalApproval = false;

    try {
      // Check for concurrent sessions
      const concurrentSessions = await this.checkConcurrentSessions(context.userId);
      if (concurrentSessions > 3) {
        warnings.push('Multiple concurrent sessions detected');
        riskScore += 15;
      }

      // Check for geographic anomalies
      const geoAnomaly = await this.checkGeographicAnomaly(context.userId, context.ipAddress);
      if (geoAnomaly.suspicious) {
        warnings.push('Geographic location anomaly detected');
        riskScore += geoAnomaly.riskIncrease;
      }

      // Check for device fingerprinting anomalies
      const deviceAnomaly = await this.checkDeviceFingerprint(context.userId, context.userAgent);
      if (deviceAnomaly.suspicious) {
        warnings.push('Device fingerprint anomaly detected');
        riskScore += deviceAnomaly.riskIncrease;
      }

      // Check for time-based anomalies
      const timeAnomaly = await this.checkTimeBasedAnomaly(context.userId);
      if (timeAnomaly.suspicious) {
        warnings.push('Unusual timing pattern detected');
        riskScore += timeAnomaly.riskIncrease;
      }

      // Determine if additional approval is required
      if (riskScore > 40) {
        requiresAdditionalApproval = true;
      }

      // Block if risk score is too high
      if (riskScore > 70) {
        return {
          allowed: false,
          reason: 'High risk score from security analysis',
          riskScore,
          securityWarnings: warnings
        };
      }

      return {
        allowed: true,
        riskScore,
        requiresAdditionalApproval,
        securityWarnings: warnings
      };

    } catch (error) {
      console.error('Error in security analysis:', error);
      return {
        allowed: false,
        reason: 'Security analysis failed',
        riskScore: 100,
        securityWarnings: ['Security analysis system error']
      };
    }
  }

  /**
   * Analyze behavior patterns
   */
  private async analyzeBehaviorPatterns(context: SecurityContext): Promise<{
    suspicious: boolean;
    warnings: string[];
    riskIncrease: number;
  }> {
    const warnings: string[] = [];
    let riskIncrease = 0;
    let suspicious = false;

    try {
      // Check for automation patterns
      if (this.detectAutomationPatterns(context)) {
        warnings.push('Automated behavior detected');
        riskIncrease += 25;
        suspicious = true;
      }

      // Check for unusual request patterns
      const patternAnalysis = await this.analyzeRequestPatterns(context.userId);
      if (patternAnalysis.unusual) {
        warnings.push('Unusual request pattern detected');
        riskIncrease += patternAnalysis.riskIncrease;
        suspicious = true;
      }

      return {
        suspicious,
        warnings,
        riskIncrease
      };

    } catch (error) {
      console.error('Error analyzing behavior patterns:', error);
      return {
        suspicious: true,
        warnings: ['Behavior analysis failed'],
        riskIncrease: 30
      };
    }
  }

  /**
   * Log security violations
   */
  private async logSecurityViolation(
    context: SecurityContext,
    violationType: string,
    reason?: string
  ): Promise<void> {
    await this.securityLogger.logSecurityEvent(
      SecurityEventType.PERMISSION_VIOLATION,
      `Security violation: ${violationType}`,
      {
        violationType,
        reason,
        operation: context.operation,
        requestData: context.requestData
      },
      {
        userId: context.userId,
        institutionId: context.institutionId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId
      }
    );
  }

  /**
   * Handle security errors
   */
  private async handleSecurityError(context: SecurityContext, error: any): Promise<void> {
    const roleError = this.errorHandler.createError(
      RoleErrorCode.UNKNOWN_ERROR,
      `Security validation error: ${error.message}`,
      {
        operation: context.operation,
        userId: context.userId,
        institutionId: context.institutionId,
        metadata: {
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          sessionId: context.sessionId,
          requestData: context.requestData
        }
      },
      error
    );

    await this.errorHandler.handleError(roleError, {
      operation: context.operation,
      userId: context.userId,
      institutionId: context.institutionId
    });

    await this.securityLogger.logSecurityEvent(
      SecurityEventType.SUSPICIOUS_PATTERN_DETECTED,
      'Security validation system error',
      {
        error: error.message,
        operation: context.operation,
        stack: error.stack
      },
      {
        userId: context.userId,
        institutionId: context.institutionId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId
      }
    );
  }

  // Helper methods for security checks

  private containsSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
      /(--|\/\*|\*\/)/,
      /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT)\b)/i,
      /(\bxp_\w+)/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  private containsXSS(input: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe\b/i,
      /<object\b/i,
      /<embed\b/i
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /curl/i,
      /wget/i,
      /python/i,
      /bot/i,
      /crawler/i,
      /script/i,
      /automated/i,
      /^$/,
      /null/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  private isSuspiciousIP(ipAddress: string): boolean {
    // Simplified suspicious IP detection
    const suspiciousPatterns = [
      /^127\./, // Localhost
      /^0\./, // Invalid range
      /^169\.254\./, // Link-local
      /^224\./, // Multicast
    ];

    return suspiciousPatterns.some(pattern => pattern.test(ipAddress));
  }

  private detectAutomationPatterns(context: SecurityContext): boolean {
    // Check for automation indicators
    const automationIndicators = [
      !context.userAgent || context.userAgent.length < 10,
      this.isSuspiciousUserAgent(context.userAgent),
      !context.sessionId,
      // Add more automation detection logic
    ];

    return automationIndicators.filter(Boolean).length >= 2;
  }

  private async checkConcurrentSessions(userId: string): Promise<number> {
    // Simplified concurrent session check
    // In a real implementation, this would check active sessions
    return 1;
  }

  private async checkGeographicAnomaly(userId: string, ipAddress: string): Promise<{
    suspicious: boolean;
    riskIncrease: number;
  }> {
    // Simplified geographic anomaly detection
    // In a real implementation, this would use IP geolocation services
    return {
      suspicious: false,
      riskIncrease: 0
    };
  }

  private async checkDeviceFingerprint(userId: string, userAgent: string): Promise<{
    suspicious: boolean;
    riskIncrease: number;
  }> {
    // Simplified device fingerprint check
    // In a real implementation, this would analyze device characteristics
    return {
      suspicious: this.isSuspiciousUserAgent(userAgent),
      riskIncrease: this.isSuspiciousUserAgent(userAgent) ? 20 : 0
    };
  }

  private async checkTimeBasedAnomaly(userId: string): Promise<{
    suspicious: boolean;
    riskIncrease: number;
  }> {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Check for off-hours activity (simplified)
    const isOffHours = currentHour < 6 || currentHour > 22;
    
    return {
      suspicious: isOffHours,
      riskIncrease: isOffHours ? 10 : 0
    };
  }

  private async analyzeRequestPatterns(userId: string): Promise<{
    unusual: boolean;
    riskIncrease: number;
  }> {
    // Simplified request pattern analysis
    // In a real implementation, this would analyze historical patterns
    return {
      unusual: false,
      riskIncrease: 0
    };
  }
}

/**
 * Express/Next.js middleware wrapper
 */
export function createRoleSecurityMiddleware() {
  const securityMiddleware = new RoleSecurityMiddleware();

  return async (req: NextRequest) => {
    try {
      // Extract security context from request
      const context: SecurityContext = {
        userId: req.headers.get('x-user-id') || '',
        institutionId: req.headers.get('x-institution-id') || '',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '',
        userAgent: req.headers.get('user-agent') || '',
        sessionId: req.headers.get('x-session-id'),
        operation: `${req.method} ${req.nextUrl.pathname}`,
        requestData: req.method === 'POST' ? await req.json() : Object.fromEntries(req.nextUrl.searchParams)
      };

      // Validate the operation
      const result = await securityMiddleware.validateRoleOperation(context);

      if (!result.allowed) {
        return NextResponse.json(
          {
            error: 'Security validation failed',
            reason: result.reason,
            warnings: result.securityWarnings
          },
          { status: 403 }
        );
      }

      // Add security headers to response
      const response = NextResponse.next();
      response.headers.set('X-Security-Risk-Score', result.riskScore?.toString() || '0');
      response.headers.set('X-Requires-Additional-Approval', result.requiresAdditionalApproval?.toString() || 'false');
      
      if (result.securityWarnings && result.securityWarnings.length > 0) {
        response.headers.set('X-Security-Warnings', result.securityWarnings.join(', '));
      }

      return response;

    } catch (error) {
      console.error('Security middleware error:', error);
      return NextResponse.json(
        { error: 'Security validation failed' },
        { status: 500 }
      );
    }
  };
}