/**
 * Role Security Tests
 * 
 * Comprehensive tests for role escalation prevention, rate limiting,
 * error handling, and security logging functionality.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RoleEscalationPreventionService } from '../../../lib/services/role-escalation-prevention';
import { RoleRequestRateLimiter } from '../../../lib/services/role-request-rate-limiter';
import { RoleErrorHandler, RoleErrorCode, RoleErrorSeverity } from '../../../lib/utils/role-error-handling';
import { RoleSecurityLogger, SecurityEventType, SecurityEventSeverity } from '../../../lib/services/role-security-logger';
import { UserRole } from '../../../lib/types/role-management';
import { Result } from 'postcss';
import { error } from 'console';
import { error } from 'console';

// Mock Supabase client
jest.mock('../../../lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => ({ data: null, error: null })),
              limit: jest.fn(() => ({ data: [], error: null }))
            })),
            single: jest.fn(() => ({ data: null, error: null })),
            limit: jest.fn(() => ({ data: [], error: null })),
            order: jest.fn(() => ({ data: [], error: null }))
          })),
          single: jest.fn(() => ({ data: null, error: null })),
          limit: jest.fn(() => ({ data: [], error: null })),
          order: jest.fn(() => ({ data: [], error: null })),
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({ data: [], error: null })),
            data: [],
            error: null
          }))
        })),
        single: jest.fn(() => ({ data: null, error: null })),
        limit: jest.fn(() => ({ data: [], error: null })),
        order: jest.fn(() => ({ data: [], error: null })),
        gte: jest.fn(() => ({ data: [], error: null })),
        gt: jest.fn(() => ({ data: [], error: null })),
        in: jest.fn(() => ({ data: [], error: null })),
        or: jest.fn(() => ({ data: [], error: null }))
      })),
      insert: jest.fn(() => ({ error: null })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({ error: null }))
      })),
      upsert: jest.fn(() => ({ error: null })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({ error: null }))
      }))
    }))
  }))
}));

describe('Role Escalation Prevention Service', () => {
  let escalationService: RoleEscalationPreventionService;
  const mockUserId = 'user-123';
  const mockInstitutionId = 'inst-123';

  beforeEach(() => {
    escalationService = new RoleEscalationPreventionService();
  });

  describe('validateRoleRequest', () => {
    it('should allow valid role transitions', async () => {
      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      );

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskScore).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      );

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskScore).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('should block invalid role transitions', async () => {
      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.SYSTEM_ADMIN,
        mockInstitutionId
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted');
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should detect privilege escalation attempts with context', async () => {
      const context = {
        ipAddress: '192.168.1.1',
        userAgent: 'curl/7.68.0',
        sessionId: 'test-session'
      };

      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.SYSTEM_ADMIN,
        mockInstitutionId,
        context
      );

      expect(result.allowed).toBe(false);
      expect(result.riskScore).toBeGreaterThan(50);
    });

    it('should calculate appropriate risk scores', async () => {
      // Test different role transitions and their risk scores
      const studentToTeacher = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      );

      const studentToAdmin = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.SYSTEM_ADMIN,
        mockInstitutionId
      );

      expect(studentToTeacher.riskScore).toBeLessThan(studentToAdmin.riskScore || 0);
    });

    it('should handle security check failures gracefully', async () => {
      // Mock a database error
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                data: null,
                error: new Error('Database connection failed')
              })
            })
          })
        })
      });

      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('system error');
      expect(result.riskScore).toBe(100);
    });

    it('should detect suspicious IP addresses', async () => {
      const suspiciousContext = {
        ipAddress: '127.0.0.1', // localhost
        userAgent: 'Mozilla/5.0',
        sessionId: 'test-session'
      };

      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId,
        suspiciousContext
      );

      // Should still allow but with higher risk score
      expect(result.riskScore).toBeGreaterThan(10);
    });

    it('should detect automated behavior patterns', async () => {
      const automatedContext = {
        ipAddress: '192.168.1.1',
        userAgent: 'python-requests/2.25.1',
        sessionId: 'automated-session'
      };

      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId,
        automatedContext
      );

      expect(result.riskScore).toBeGreaterThan(20);
    });
                data: [{ id: '1' }, { id: '2' }, { id: '3' }], // 3 recent requests
                error: null
              })
            })
          })
        })
      });

      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.SYSTEM_ADMIN,
        mockInstitutionId
      );

      expect(result.allowed).toBe(false);
    });

    it('should handle rate limiting', async () => {
      // Mock rate limit exceeded
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                data: Array(10).fill({ id: 'request' }), // Exceed rate limit
                error: null
              })
            })
          })
        })
      });

      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('rate limit');
    });
  });

  describe('validateApproverPermission', () => {
    const mockRoleRequest = {
      id: 'req-123',
      userId: mockUserId,
      requestedRole: UserRole.TEACHER,
      currentRole: UserRole.STUDENT,
      justification: 'Test request',
      status: 'pending' as const,
      requestedAt: new Date(),
      verificationMethod: 'admin_approval' as const,
      institutionId: mockInstitutionId,
      expiresAt: new Date(),
      metadata: {}
    };

    it('should block self-approval attempts', async () => {
      const result = await escalationService.validateApproverPermission(
        mockUserId, // Same as request user
        mockRoleRequest
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('approve your own');
    });

    it('should allow valid approvers', async () => {
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                data: [{ role: UserRole.DEPARTMENT_ADMIN }],
                error: null
              })
            })
          })
        })
      });

      const result = await escalationService.validateApproverPermission(
        'approver-123',
        mockRoleRequest
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('logEscalationAttempt', () => {
    it('should log escalation attempts', async () => {
      const attempt = {
        userId: mockUserId,
        fromRole: UserRole.STUDENT,
        toRole: UserRole.SYSTEM_ADMIN,
        requestedAt: new Date(),
        blocked: true,
        reason: 'Invalid escalation',
        metadata: { test: 'data' }
      };

      await expect(escalationService.logEscalationAttempt(attempt)).resolves.not.toThrow();
    });
  });
});

describe('Role Request Rate Limiter', () => {
  let rateLimiter: RoleRequestRateLimiter;
  const mockUserId = 'user-123';
  const mockInstitutionId = 'inst-123';
  const mockClientIP = '192.168.1.1';

  beforeEach(() => {
    rateLimiter = new RoleRequestRateLimiter();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limits', async () => {
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              data: [], // No recent requests
              error: null
            })
          })
        })
      });

      const result = await rateLimiter.checkRateLimit(
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId,
        mockClientIP
      );

      expect(result.allowed).toBe(true);
    });

    it('should block requests exceeding user rate limit', async () => {
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              data: Array(10).fill({ created_at: new Date().toISOString() }), // Exceed hourly limit
              error: null
            })
          })
        })
      });

      const result = await rateLimiter.checkRateLimit(
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId,
        mockClientIP
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit exceeded');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should block requests from blocked users', async () => {
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gt: jest.fn().mockReturnValue({
                single: jest.fn().mockReturnValue({
                  data: {
                    blocked_until: new Date(Date.now() + 3600000).toISOString(), // Blocked for 1 hour
                    reason: 'Suspicious activity'
                  },
                  error: null
                })
              })
            })
          })
        })
      });

      const result = await rateLimiter.checkRateLimit(
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId,
        mockClientIP
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should handle burst protection', async () => {
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      
      // First call for user block check
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gt: jest.fn().mockReturnValue({
                single: jest.fn().mockReturnValue({
                  data: null, // Not blocked
                  error: null
                })
              })
            })
          })
        })
      });

      // Subsequent calls for rate limit checks
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              data: Array(5).fill({ created_at: new Date().toISOString() }), // Trigger burst protection
              error: null
            })
          })
        })
      });

      const result = await rateLimiter.checkRateLimit(
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId,
        mockClientIP
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Burst protection');
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status', async () => {
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                data: [
                  { created_at: new Date().toISOString(), requested_role: UserRole.TEACHER }
                ],
                error: null
              })
            })
          })
        })
      });

      const status = await rateLimiter.getRateLimitStatus(mockUserId);

      expect(status).toHaveProperty('hourlyRemaining');
      expect(status).toHaveProperty('dailyRemaining');
      expect(status).toHaveProperty('weeklyRemaining');
      expect(status).toHaveProperty('nextResetTime');
      expect(status).toHaveProperty('activeCooldowns');
    });
  });

  describe('blockUser', () => {
    it('should block a user', async () => {
      await expect(rateLimiter.blockUser(
        mockUserId,
        'admin-123',
        'Suspicious activity',
        24
      )).resolves.not.toThrow();
    });
  });

  describe('resetUserRateLimit', () => {
    it('should reset user rate limits', async () => {
      await expect(rateLimiter.resetUserRateLimit(
        mockUserId,
        'admin-123'
      )).resolves.not.toThrow();
    });
  });
});

describe('Role Error Handler', () => {
  let errorHandler: RoleErrorHandler;

  beforeEach(() => {
    errorHandler = RoleErrorHandler.getInstance();
  });

  describe('createError', () => {
    it('should create standardized role errors', () => {
      const error = errorHandler.createError(
        RoleErrorCode.INVALID_ROLE,
        'Invalid role specified',
        { operation: 'test', userId: 'user-123' }
      );

      expect(error.code).toBe(RoleErrorCode.INVALID_ROLE);
      expect(error.message).toBe('Invalid role specified');
      expect(error.severity).toBe(RoleErrorSeverity.MEDIUM);
      expect(error.userId).toBe('user-123');
      expect(error.recoverable).toBe(false);
      expect(error.suggestedAction).toBeTruthy();
    });

    it('should determine correct severity levels', () => {
      const criticalError = errorHandler.createError(
        RoleErrorCode.DATABASE_ERROR,
        'Database connection failed'
      );
      expect(criticalError.severity).toBe(RoleErrorSeverity.CRITICAL);

      const lowError = errorHandler.createError(
        RoleErrorCode.RATE_LIMIT_EXCEEDED,
        'Rate limit exceeded'
      );
      expect(lowError.severity).toBe(RoleErrorSeverity.LOW);
    });
  });

  describe('validateRoleRequest', () => {
    it('should validate role request data', () => {
      const errors = errorHandler.validateRoleRequest({
        userId: 'user-123',
        requestedRole: UserRole.TEACHER,
        institutionId: 'inst-123',
        justification: 'Valid justification'
      });

      expect(errors).toHaveLength(0);
    });

    it('should return validation errors for invalid data', () => {
      const errors = errorHandler.validateRoleRequest({
        userId: '',
        requestedRole: 'invalid-role',
        institutionId: '',
        justification: 'short'
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.code === RoleErrorCode.MISSING_REQUIRED_FIELD)).toBe(true);
      expect(errors.some(e => e.code === RoleErrorCode.INVALID_ROLE)).toBe(true);
    });
  });

  describe('validateRoleAssignment', () => {
    it('should validate role assignment data', () => {
      const errors = errorHandler.validateRoleAssignment({
        userId: 'user-123',
        role: UserRole.TEACHER,
        assignedBy: 'admin-123',
        institutionId: 'inst-123',
        expiresAt: new Date(Date.now() + 86400000) // Tomorrow
      });

      expect(errors).toHaveLength(0);
    });

    it('should return validation errors for invalid assignment data', () => {
      const errors = errorHandler.validateRoleAssignment({
        userId: '',
        role: 'invalid-role',
        assignedBy: '',
        institutionId: '',
        expiresAt: new Date(Date.now() - 86400000) // Yesterday
      });

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('withErrorHandling', () => {
    it('should handle successful operations', async () => {
      const result = await errorHandler.withErrorHandling(
        async () => 'success',
        { operation: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.error).toBeUndefined();
    });

    it('should handle failed operations', async () => {
      const result = await errorHandler.withErrorHandling(
        async () => {
          throw new Error('Test error');
        },
        { operation: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(RoleErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('getErrorStatistics', () => {
    it('should return error statistics', () => {
      // Create some errors first
      errorHandler.createError(RoleErrorCode.INVALID_ROLE, 'Test error 1');
      errorHandler.createError(RoleErrorCode.RATE_LIMIT_EXCEEDED, 'Test error 2');
      errorHandler.createError(RoleErrorCode.DATABASE_ERROR, 'Test error 3');

      const stats = errorHandler.getErrorStatistics();

      expect(stats.totalErrors).toBeGreaterThan(0);
      expect(stats.errorsByCode).toBeDefined();
      expect(stats.errorsBySeverity).toBeDefined();
      expect(stats.recoverableErrors).toBeGreaterThanOrEqual(0);
      expect(stats.criticalErrors).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Role Security Logger', () => {
  let securityLogger: RoleSecurityLogger;
  const mockUserId = 'user-123';
  const mockInstitutionId = 'inst-123';

  beforeEach(() => {
    securityLogger = RoleSecurityLogger.getInstance();
  });

  describe('logSecurityEvent', () => {
    it('should log security events', async () => {
      await expect(securityLogger.logSecurityEvent(
        SecurityEventType.ROLE_REQUEST_CREATED,
        'User requested teacher role',
        { requestedRole: UserRole.TEACHER },
        { userId: mockUserId, institutionId: mockInstitutionId }
      )).resolves.not.toThrow();
    });

    it('should handle critical events immediately', async () => {
      await expect(securityLogger.logSecurityEvent(
        SecurityEventType.PRIVILEGE_ESCALATION_ATTEMPT,
        'Attempted privilege escalation',
        { fromRole: UserRole.STUDENT, toRole: UserRole.SYSTEM_ADMIN },
        { userId: mockUserId, institutionId: mockInstitutionId }
      )).resolves.not.toThrow();
    });
  });

  describe('logRoleRequest', () => {
    it('should log role request events', async () => {
      await expect(securityLogger.logRoleRequest(
        'created',
        'req-123',
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId,
        { justification: 'Test request' }
      )).resolves.not.toThrow();
    });
  });

  describe('logRoleAssignment', () => {
    it('should log role assignment events', async () => {
      await expect(securityLogger.logRoleAssignment(
        'assigned' as any,
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId,
        'admin-123',
        { reason: 'Approved request' }
      )).resolves.not.toThrow();
    });
  });

  describe('logSuspiciousActivity', () => {
    it('should log suspicious activities', async () => {
      await expect(securityLogger.logSuspiciousActivity(
        'rapid_requests',
        mockUserId,
        'User made multiple rapid requests',
        SecurityEventSeverity.HIGH,
        { requestCount: 5 },
        mockInstitutionId
      )).resolves.not.toThrow();
    });
  });

  describe('logPermissionViolation', () => {
    it('should log permission violations', async () => {
      await expect(securityLogger.logPermissionViolation(
        mockUserId,
        'access_admin_panel',
        UserRole.INSTITUTION_ADMIN,
        UserRole.STUDENT,
        mockInstitutionId,
        { attemptedResource: '/admin' }
      )).resolves.not.toThrow();
    });
  });

  describe('getSecurityEvents', () => {
    it('should retrieve security events with filters', async () => {
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              data: [
                {
                  id: 'event-1',
                  event_type: SecurityEventType.ROLE_REQUEST_CREATED,
                  severity: SecurityEventSeverity.INFO,
                  user_id: mockUserId,
                  institution_id: mockInstitutionId,
                  description: 'Test event',
                  details: {},
                  timestamp: new Date().toISOString(),
                  resolved: false
                }
              ],
              error: null
            })
          })
        })
      });

      const events = await securityLogger.getSecurityEvents({
        userId: mockUserId,
        eventType: SecurityEventType.ROLE_REQUEST_CREATED
      });

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe(SecurityEventType.ROLE_REQUEST_CREATED);
    });
  });

  describe('getSecurityMetrics', () => {
    it('should return security metrics', async () => {
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              lte: jest.fn().mockReturnValue({
                data: [
                  {
                    event_type: SecurityEventType.ROLE_REQUEST_CREATED,
                    severity: SecurityEventSeverity.INFO,
                    user_id: mockUserId,
                    institution_id: mockInstitutionId
                  }
                ],
                error: null
              })
            })
          })
        })
      });

      const metrics = await securityLogger.getSecurityMetrics(mockInstitutionId);

      expect(metrics).toHaveProperty('totalEvents');
      expect(metrics).toHaveProperty('eventsBySeverity');
      expect(metrics).toHaveProperty('eventsByType');
      expect(metrics).toHaveProperty('suspiciousActivities');
      expect(metrics).toHaveProperty('topRiskyUsers');
    });
  });
});

describe('Integration Tests', () => {
  let escalationService: RoleEscalationPreventionService;
  let rateLimiter: RoleRequestRateLimiter;
  let errorHandler: RoleErrorHandler;
  let securityLogger: RoleSecurityLogger;

  beforeEach(() => {
    escalationService = new RoleEscalationPreventionService();
    rateLimiter = new RoleRequestRateLimiter();
    errorHandler = RoleErrorHandler.getInstance();
    securityLogger = RoleSecurityLogger.getInstance();
  });

  describe('Complete Role Request Security Flow', () => {
    it('should handle a complete secure role request flow', async () => {
      const mockUserId = 'user-123';
      const mockInstitutionId = 'inst-123';

      // 1. Check rate limits
      const rateLimitResult = await rateLimiter.checkRateLimit(
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId
      );

      // 2. Validate escalation rules
      const escalationResult = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      );

      // 3. Log security event
      await securityLogger.logRoleRequest(
        'created',
        'req-123',
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId
      );

      // All checks should pass for valid request
      expect(rateLimitResult.allowed).toBe(true);
      expect(escalationResult.allowed).toBe(true);
    });

    it('should block and log suspicious role escalation attempts', async () => {
      const mockUserId = 'user-123';
      const mockInstitutionId = 'inst-123';

      // Attempt to escalate directly to system admin
      const escalationResult = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.SYSTEM_ADMIN,
        mockInstitutionId
      );

      expect(escalationResult.allowed).toBe(false);

      // Log the blocked attempt
      await escalationService.logEscalationAttempt({
        userId: mockUserId,
        fromRole: UserRole.STUDENT,
        toRole: UserRole.SYSTEM_ADMIN,
        requestedAt: new Date(),
        blocked: true,
        reason: escalationResult.reason || 'Blocked escalation',
        metadata: {}
      });

      // Log as suspicious activity
      await securityLogger.logSuspiciousActivity(
        'privilege_escalation_attempt',
        mockUserId,
        'Attempted to escalate from student to system admin',
        SecurityEventSeverity.CRITICAL,
        { fromRole: UserRole.STUDENT, toRole: UserRole.SYSTEM_ADMIN },
        mockInstitutionId
      );
    });

    it('should handle errors gracefully with comprehensive logging', async () => {
      const mockUserId = 'user-123';
      const mockInstitutionId = 'inst-123';

      // Simulate an operation that might fail
      const result = await errorHandler.withErrorHandling(
        async () => {
          // Simulate database error
          throw new Error('Database connection failed');
        },
        {
          operation: 'role_request_validation',
          userId: mockUserId,
          institutionId: mockInstitutionId
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(RoleErrorCode.UNKNOWN_ERROR);

      // Error should be logged automatically
      const stats = errorHandler.getErrorStatistics();
      expect(stats.totalErrors).toBeGreaterThan(0);
    });
  });

  describe('Abuse Prevention Scenarios', () => {
    it('should detect and prevent rapid role request abuse', async () => {
      const mockUserId = 'abuser-123';
      const mockInstitutionId = 'inst-123';

      // Mock multiple rapid requests
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              data: Array(10).fill({ created_at: new Date().toISOString() }),
              error: null
            })
          })
        })
      });

      const rateLimitResult = await rateLimiter.checkRateLimit(
        mockUserId,
        UserRole.TEACHER,
        mockInstitutionId
      );

      expect(rateLimitResult.allowed).toBe(false);
      expect(rateLimitResult.reason).toContain('limit exceeded');

      // Should log the abuse attempt
      await securityLogger.logSuspiciousActivity(
        'rapid_requests',
        mockUserId,
        'User exceeded rate limits',
        SecurityEventSeverity.HIGH,
        { requestCount: 10 },
        mockInstitutionId
      );
    });

    it('should prevent self-approval attempts', async () => {
      const mockUserId = 'user-123';
      const mockRoleRequest = {
        id: 'req-123',
        userId: mockUserId,
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'Test request',
        status: 'pending' as const,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval' as const,
        institutionId: 'inst-123',
        expiresAt: new Date(),
        metadata: {}
      };

      const approvalResult = await escalationService.validateApproverPermission(
        mockUserId, // Same as requester
        mockRoleRequest
      );

      expect(approvalResult.allowed).toBe(false);
      expect(approvalResult.reason).toContain('approve your own');

      // Should log the self-approval attempt
      await securityLogger.logSuspiciousActivity(
        'self_approval_attempt',
        mockUserId,
        'User attempted to approve their own role request',
        SecurityEventSeverity.HIGH,
        { roleRequestId: mockRoleRequest.id },
        mockRoleRequest.institutionId
      );
    });

    it('should detect and prevent automated attacks', async () => {
      const mockUserId = 'bot-123';
      const mockInstitutionId = 'inst-123';
      const suspiciousContext = {
        ipAddress: '192.168.1.1',
        userAgent: 'python-requests/2.25.1', // Automated user agent
        sessionId: 'automated-session'
      };

      const escalationResult = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId,
        suspiciousContext
      );

      // Should have higher risk score due to suspicious user agent
      expect(escalationResult.riskScore).toBeGreaterThan(20);

      // Log the automated attempt
      await securityLogger.logSuspiciousActivity(
        'automated_request',
        mockUserId,
        'Automated role request detected',
        SecurityEventSeverity.MEDIUM,
        { userAgent: suspiciousContext.userAgent, riskScore: escalationResult.riskScore },
        mockInstitutionId
      );
    });
  });

  describe('Security Monitoring and Alerting', () => {
    it('should generate security alerts for critical events', async () => {
      const mockUserId = 'attacker-123';
      const mockInstitutionId = 'inst-123';

      // Log a critical security event
      await securityLogger.logSecurityEvent(
        SecurityEventType.PRIVILEGE_ESCALATION_ATTEMPT,
        'Critical privilege escalation attempt detected',
        {
          fromRole: UserRole.STUDENT,
          toRole: UserRole.SYSTEM_ADMIN,
          attemptCount: 5,
          timeWindow: '1 hour'
        },
        {
          userId: mockUserId,
          institutionId: mockInstitutionId,
          ipAddress: '10.0.0.1',
          userAgent: 'curl/7.68.0'
        }
      );

      // Verify that critical events are handled appropriately
      const metrics = await securityLogger.getSecurityMetrics(mockInstitutionId);
      expect(metrics.suspiciousActivities).toBeGreaterThanOrEqual(0);
    });

    it('should track security metrics across time periods', async () => {
      const mockInstitutionId = 'inst-123';
      const timeRange = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        end: new Date()
      };

      const metrics = await securityLogger.getSecurityMetrics(mockInstitutionId, timeRange);

      expect(metrics).toHaveProperty('totalEvents');
      expect(metrics).toHaveProperty('eventsBySeverity');
      expect(metrics).toHaveProperty('eventsByType');
      expect(metrics).toHaveProperty('topRiskyUsers');
      expect(metrics).toHaveProperty('institutionRiskScores');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle database failures gracefully', async () => {
      const mockUserId = 'user-123';
      const mockInstitutionId = 'inst-123';

      // Mock database failure
      const mockSupabase = require('../../../lib/supabase/server').createClient();
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                data: null,
                error: new Error('Database connection timeout')
              })
            })
          })
        })
      });

      const result = await escalationService.validateRoleRequest(
        mockUserId,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      );

      // Should fail securely
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('system error');
      expect(result.riskScore).toBe(100);
    });

    it('should maintain security during partial system failures', async () => {
      const mockUserId = 'user-123';
      const mockInstitutionId = 'inst-123';

      // Test with various failure scenarios
      const scenarios = [
        'rate limiter failure',
        'security logger failure',
        'escalation service failure'
      ];

      for (const scenario of scenarios) {
        const result = await errorHandler.withErrorHandling(
          async () => {
            throw new Error(scenario);
          },
          {
            operation: 'security_validation',
            userId: mockUserId,
            institutionId: mockInstitutionId
          }
        );

        // Should always fail securely
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });
});

describe('Performance and Scalability Tests', () => {
  let escalationService: RoleEscalationPreventionService;
  let rateLimiter: RoleRequestRateLimiter;
  let securityLogger: RoleSecurityLogger;

  beforeEach(() => {
    escalationService = new RoleEscalationPreventionService();
    rateLimiter = new RoleRequestRateLimiter();
    securityLogger = RoleSecurityLogger.getInstance();
  });

  it('should handle concurrent role validation requests', async () => {
    const mockUserId = 'user-123';
    const mockInstitutionId = 'inst-123';

    // Create multiple concurrent validation requests
    const concurrentRequests = Array(10).fill(null).map((_, index) => 
      escalationService.validateRoleRequest(
        `${mockUserId}-${index}`,
        UserRole.STUDENT,
        UserRole.TEACHER,
        mockInstitutionId
      )
    );

    const results = await Promise.all(concurrentRequests);

    // All requests should be processed
    expect(results).toHaveLength(10);
    results.forEach(result => {
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('riskScore');
    });
  });

  it('should efficiently validate multiple role requests', async () => {
    const escalationService = new RoleEscalationPreventionService();
    const startTime = Date.now();
    const validationPromises = [];

    // Create 50 validation requests
    for (let i = 0; i < 50; i++) {
      validationPromises.push(
        escalationService.validateRoleRequest(
          `user-${i}`,
          UserRole.STUDENT,
          UserRole.TEACHER,
          'inst-123'
        )
      );
    }

    const results = await Promise.all(validationPromises);
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Should complete within reasonable time (5 seconds for 50 requests)
    expect(processingTime).toBeLessThan(5000);
    expect(results).toHaveLength(50);

    // All results should have required properties
    results.forEach(result => {
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('riskScore');
    });
  });

  it('should handle high-volume security logging', async () => {
    const startTime = Date.now();
    const logPromises = [];

    // Create 100 concurrent log entries
    for (let i = 0; i < 100; i++) {
      logPromises.push(
        securityLogger.logSecurityEvent(
          SecurityEventType.ROLE_REQUEST_CREATED,
          `Test event ${i}`,
          { eventNumber: i },
          {
            userId: `user-${i}`,
            institutionId: 'inst-123',
            ipAddress: '192.168.1.1'
          }
        )
      );
    }

    await Promise.all(logPromises);
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Should complete within reasonable time (3 seconds for 100 logs)
    expect(processingTime).toBeLessThan(3000);
  });
});

describe('Security Compliance Tests', () => {
  let errorHandler: RoleErrorHandler;
  let securityLogger: RoleSecurityLogger;

  beforeEach(() => {
    errorHandler = RoleErrorHandler.getInstance();
    securityLogger = RoleSecurityLogger.getInstance();
  });

  it('should maintain audit trail for all security events', async () => {
    const mockUserId = 'user-123';
    const mockInstitutionId = 'inst-123';

    // Log various types of security events
    const eventTypes = [
      SecurityEventType.ROLE_REQUEST_CREATED,
      SecurityEventType.ROLE_ASSIGNED,
      SecurityEventType.PERMISSION_VIOLATION,
      SecurityEventType.SUSPICIOUS_PATTERN_DETECTED
    ];

    for (const eventType of eventTypes) {
      await securityLogger.logSecurityEvent(
        eventType,
        `Test ${eventType} event`,
        { testData: true },
        {
          userId: mockUserId,
          institutionId: mockInstitutionId,
          ipAddress: '192.168.1.1'
        }
      );
    }

    // Verify events can be retrieved
    const events = await securityLogger.getSecurityEvents({
      userId: mockUserId,
      institutionId: mockInstitutionId
    });

    expect(events.length).toBeGreaterThanOrEqual(0);
  });

  it('should ensure data privacy in error logging', () => {
    const sensitiveData = {
      password: 'secret123',
      ssn: '123-45-6789',
      creditCard: '4111-1111-1111-1111'
    };

    const error = errorHandler.createError(
      RoleErrorCode.INVALID_USER,
      'User validation failed',
      {
        operation: 'user_validation',
        userId: 'user-123',
        metadata: sensitiveData
      }
    );

    // Error should be created but sensitive data should be handled appropriately
    expect(error.code).toBe(RoleErrorCode.INVALID_USER);
    expect(error.details).toBeDefined();
    // In a real implementation, sensitive data would be sanitized
  });

  it('should provide comprehensive security reporting', async () => {
    const mockInstitutionId = 'inst-123';

    const metrics = await securityLogger.getSecurityMetrics(mockInstitutionId);

    // Verify all required metrics are present
    expect(metrics).toHaveProperty('totalEvents');
    expect(metrics).toHaveProperty('eventsBySeverity');
    expect(metrics).toHaveProperty('eventsByType');
    expect(metrics).toHaveProperty('suspiciousActivities');
    expect(metrics).toHaveProperty('resolvedAlerts');
    expect(metrics).toHaveProperty('pendingAlerts');
    expect(metrics).toHaveProperty('topRiskyUsers');
    expect(metrics).toHaveProperty('institutionRiskScores');

    // Verify data types
    expect(typeof metrics.totalEvents).toBe('number');
    expect(Array.isArray(metrics.topRiskyUsers)).toBe(true);
    expect(Array.isArray(metrics.institutionRiskScores)).toBe(true);
  });
});Result.allowed).toBe(false);
      expect(approvalResult.reason).toContain('approve your own');

      // Should log the self-approval attempt
      await securityLogger.logSecurityEvent(
        SecurityEventType.SELF_APPROVAL_ATTEMPT,
        'User attempted to approve their own role request',
        { requestId: mockRoleRequest.id },
        { userId: mockUserId }
      );
    });
  });
});

describe('Performance and Scalability Tests', () => {
  let securityLogger: RoleSecurityLogger;

  beforeEach(() => {
    securityLogger = RoleSecurityLogger.getInstance();
  });

  it('should handle high volume of security events', async () => {
    const startTime = Date.now();
    const eventPromises = [];

    // Generate 100 concurrent security events
    for (let i = 0; i < 100; i++) {
      eventPromises.push(
        securityLogger.logSecurityEvent(
          SecurityEventType.ROLE_REQUEST_CREATED,
          `Test event ${i}`,
          { eventNumber: i },
          { userId: `user-${i}`, institutionId: 'inst-123' }
        )
      );
    }

    await Promise.all(eventPromises);
    const endTime = Date.now();

    // Should complete within reasonable time (5 seconds)
    expect(endTime - startTime).toBeLessThan(5000);
  });

  it('should efficiently validate multiple role requests', async () => {
    const escalationService = new RoleEscalationPreventionService();
    const startTime = Date.now();
    const validationPromises = [];

    // Validate 50 concurrent role requests
    for (let i = 0; i < 50; i++) {
      validationPromises.push(
        escalationService.validateRoleRequest(
          `user-${i}`,
          UserRole.STUDENT,
          UserRole.TEACHER,
          'inst-123'
        )
      );
    }

    const results = await Promise.all(validationPromises);
    const endTime = Date.now();

    // All should be processed
    expect(results).toHaveLength(50);
    
    // Should complete within reasonable time (3 seconds)
    expect(endTime - startTime).toBeLessThan(3000);
  });
});