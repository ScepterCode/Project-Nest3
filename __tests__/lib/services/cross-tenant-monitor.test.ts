// Tests for cross-tenant monitoring and access prevention
import { CrossTenantMonitor } from '@/lib/services/cross-tenant-monitor';
import { TenantContext } from '@/lib/types/institution';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          gte: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          })),
          lte: jest.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    }))
  }))
}));

describe('CrossTenantMonitor', () => {
  let monitor: CrossTenantMonitor;
  let mockContext: TenantContext;

  beforeEach(() => {
    monitor = new CrossTenantMonitor();
    mockContext = {
      institutionId: 'inst-123',
      departmentId: 'dept-456',
      userId: 'user-789',
      role: 'institution_admin',
      permissions: ['read', 'write']
    };
  });

  describe('preventCrossTenantAccess', () => {
    it('should allow system admin to access any resource', async () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const targetResource = {
        type: 'institution',
        institutionId: 'other-inst',
        resourceId: 'resource-123'
      };

      const result = await monitor.preventCrossTenantAccess(
        systemAdminContext,
        targetResource,
        'read'
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('System admin access');
    });

    it('should allow access to own institution resources', async () => {
      const targetResource = {
        type: 'institution',
        institutionId: 'inst-123',
        resourceId: 'resource-123'
      };

      const result = await monitor.preventCrossTenantAccess(
        mockContext,
        targetResource,
        'read'
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Access granted');
    });

    it('should deny cross-tenant access', async () => {
      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
              }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.rpc = mockRpc;
      (monitor as any).supabase.from = mockFrom;

      const targetResource = {
        type: 'institution',
        institutionId: 'other-inst',
        resourceId: 'resource-123'
      };

      const result = await monitor.preventCrossTenantAccess(
        mockContext,
        targetResource,
        'read'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Access denied: Cannot access resources from other institutions');
      expect(mockRpc).toHaveBeenCalledWith('log_security_event', expect.any(Object));
    });

    it('should allow institution admin to access any department in their institution', async () => {
      const targetResource = {
        type: 'department',
        institutionId: 'inst-123',
        departmentId: 'other-dept',
        resourceId: 'resource-123'
      };

      const result = await monitor.preventCrossTenantAccess(
        mockContext,
        targetResource,
        'read'
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Access granted');
    });

    it('should deny cross-department access without permissions', async () => {
      const userContext = { ...mockContext, role: 'teacher', permissions: ['read'] };
      const targetResource = {
        type: 'department',
        institutionId: 'inst-123',
        departmentId: 'other-dept',
        resourceId: 'resource-123'
      };

      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
              }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.rpc = mockRpc;
      (monitor as any).supabase.from = mockFrom;

      const result = await monitor.preventCrossTenantAccess(
        userContext,
        targetResource,
        'read'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Access denied: Cannot access resources from other departments');
    });

    it('should allow cross-department access with proper permissions', async () => {
      const userContext = { 
        ...mockContext, 
        role: 'teacher', 
        permissions: ['read', 'cross_department_access'] 
      };
      const targetResource = {
        type: 'department',
        institutionId: 'inst-123',
        departmentId: 'other-dept',
        resourceId: 'resource-123'
      };

      const result = await monitor.preventCrossTenantAccess(
        userContext,
        targetResource,
        'read'
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Access granted');
    });

    it('should generate security alert for repeated violations', async () => {
      const mockRecentAttempts = Array(6).fill({
        user_id: 'user-789',
        event_type: 'access_denied',
        target_institution_id: 'other-inst',
        resource: 'institution:resource-123'
      });

      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve({ 
                  data: mockRecentAttempts, 
                  error: null 
                }))
              }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.rpc = mockRpc;
      (monitor as any).supabase.from = mockFrom;

      const targetResource = {
        type: 'institution',
        institutionId: 'other-inst',
        resourceId: 'resource-123'
      };

      const result = await monitor.preventCrossTenantAccess(
        mockContext,
        targetResource,
        'read'
      );

      expect(result.allowed).toBe(false);
      expect(result.alertGenerated).toBe(true);
      expect(mockRpc).toHaveBeenCalledTimes(2); // Once for logging, once for alert
    });
  });

  describe('analyzeAccessPatterns', () => {
    it('should analyze access patterns and identify suspicious behavior', async () => {
      const mockEvents = [
        {
          user_id: 'user-1',
          event_type: 'access_denied',
          target_institution_id: 'other-inst',
          timestamp: new Date().toISOString()
        },
        {
          user_id: 'user-1',
          event_type: 'access_granted',
          target_institution_id: 'inst-123',
          timestamp: new Date().toISOString()
        }
      ];

      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              lte: jest.fn(() => Promise.resolve({ data: mockEvents, error: null }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.from = mockFrom;

      const result = await monitor.analyzeAccessPatterns('inst-123', {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date()
      });

      expect(result.totalAttempts).toBe(2);
      expect(result.blockedAttempts).toBe(1);
      expect(result.suspiciousUsers).toHaveLength(0); // Not enough blocked attempts
      expect(result.patterns).toHaveLength(0); // Not enough cross-tenant attempts
    });

    it('should identify high-risk users', async () => {
      const mockEvents = Array(10).fill(null).map((_, i) => ({
        user_id: 'risky-user',
        event_type: i < 8 ? 'access_denied' : 'access_granted',
        target_institution_id: 'other-inst',
        timestamp: new Date().toISOString()
      }));

      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              lte: jest.fn(() => Promise.resolve({ data: mockEvents, error: null }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.from = mockFrom;

      const result = await monitor.analyzeAccessPatterns('inst-123', {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date()
      });

      expect(result.suspiciousUsers).toHaveLength(1);
      expect(result.suspiciousUsers[0].userId).toBe('risky-user');
      expect(result.suspiciousUsers[0].riskScore).toBe(80); // 8 blocked out of 10
    });

    it('should identify cross-tenant access patterns', async () => {
      const mockEvents = Array(15).fill(null).map(() => ({
        user_id: 'user-1',
        event_type: 'access_denied',
        target_institution_id: 'other-inst',
        timestamp: new Date().toISOString()
      }));

      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              lte: jest.fn(() => Promise.resolve({ data: mockEvents, error: null }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.from = mockFrom;

      const result = await monitor.analyzeAccessPatterns('inst-123', {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date()
      });

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].type).toBe('cross_tenant_access');
      expect(result.patterns[0].severity).toBe('high');
    });
  });

  describe('getSecurityMetrics', () => {
    it('should return security metrics for institution', async () => {
      // Mock the analyzeAccessPatterns method
      const mockAnalysis = {
        totalAttempts: 100,
        blockedAttempts: 20,
        suspiciousUsers: [
          { userId: 'user-1', riskScore: 75 },
          { userId: 'user-2', riskScore: 60 }
        ],
        patterns: [
          { type: 'cross_tenant_access', severity: 'high', count: 15 }
        ]
      };

      jest.spyOn(monitor, 'analyzeAccessPatterns').mockResolvedValue(mockAnalysis);

      const result = await monitor.getSecurityMetrics('inst-123', {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date()
      });

      expect(result.accessAttempts).toBe(100);
      expect(result.blockedAttempts).toBe(20);
      expect(result.riskScore).toBe(20); // 20/100 * 100
      expect(result.securityAlerts).toBe(1);
      expect(result.topRiskyUsers).toHaveLength(2);
      expect(result.recommendations).toContain('Consider implementing additional access controls');
    });

    it('should provide appropriate recommendations based on risk level', async () => {
      const mockAnalysis = {
        totalAttempts: 100,
        blockedAttempts: 50, // High risk
        suspiciousUsers: [{ userId: 'user-1', riskScore: 90 }],
        patterns: [{ type: 'critical_violation', severity: 'critical', count: 5 }]
      };

      jest.spyOn(monitor, 'analyzeAccessPatterns').mockResolvedValue(mockAnalysis);

      const result = await monitor.getSecurityMetrics('inst-123', {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date()
      });

      expect(result.recommendations).toContain('Consider implementing additional access controls');
      expect(result.recommendations).toContain('Review access patterns for flagged users');
      expect(result.recommendations).toContain('Immediate security review required');
    });
  });

  describe('temporaryBlockUser', () => {
    it('should temporarily block user and log the action', async () => {
      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
      (monitor as any).supabase.rpc = mockRpc;

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await monitor.temporaryBlockUser('user-123', 'inst-123', 'Suspicious activity', 60);

      expect(mockRpc).toHaveBeenCalledWith('log_security_event', {
        p_user_id: 'user-123',
        p_institution_id: 'inst-123',
        p_department_id: null,
        p_role: null,
        p_event_type: 'access_denied',
        p_resource: 'user_account',
        p_action: 'temporary_block',
        p_metadata: {
          reason: 'Suspicious activity',
          blockUntil: expect.any(String),
          durationMinutes: 60
        }
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[USER_BLOCKED] User user-123 blocked until')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('isUserBlocked', () => {
    it('should return false for non-blocked user', async () => {
      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
              }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.from = mockFrom;

      const result = await monitor.isUserBlocked('user-123');

      expect(result.blocked).toBe(false);
    });

    it('should return true for currently blocked user', async () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
      const mockBlockEvent = {
        metadata: {
          reason: 'Suspicious activity',
          blockUntil: futureDate.toISOString()
        }
      };

      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve({ 
                  data: [mockBlockEvent], 
                  error: null 
                }))
              }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.from = mockFrom;

      const result = await monitor.isUserBlocked('user-123');

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Suspicious activity');
      expect(result.until).toEqual(futureDate);
    });

    it('should return false for expired block', async () => {
      const pastDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const mockBlockEvent = {
        metadata: {
          reason: 'Suspicious activity',
          blockUntil: pastDate.toISOString()
        }
      };

      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve({ 
                  data: [mockBlockEvent], 
                  error: null 
                }))
              }))
            }))
          }))
        }))
      }));
      (monitor as any).supabase.from = mockFrom;

      const result = await monitor.isUserBlocked('user-123');

      expect(result.blocked).toBe(false);
    });
  });
});