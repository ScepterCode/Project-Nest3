// Tests for tenant security and data isolation
import { TenantSecurityService } from '@/lib/services/tenant-security';
import { TenantContext } from '@/lib/types/institution';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          neq: jest.fn(() => ({
            single: jest.fn(),
            limit: jest.fn()
          })),
          single: jest.fn(),
          limit: jest.fn()
        })),
        neq: jest.fn(() => ({
          single: jest.fn(),
          limit: jest.fn()
        })),
        single: jest.fn(),
        limit: jest.fn()
      })),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    }))
  }))
}));

describe('TenantSecurityService', () => {
  let tenantSecurity: TenantSecurityService;
  let mockContext: TenantContext;

  beforeEach(() => {
    tenantSecurity = new TenantSecurityService();
    mockContext = {
      institutionId: 'inst-123',
      departmentId: 'dept-456',
      userId: 'user-789',
      role: 'institution_admin',
      permissions: ['read', 'write']
    };
  });

  describe('setTenantContext', () => {
    it('should set tenant context with correct claims', async () => {
      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
      (tenantSecurity as any).supabase.rpc = mockRpc;

      await tenantSecurity.setTenantContext(mockContext);

      expect(mockRpc).toHaveBeenCalledWith('set_tenant_context', {
        claims: {
          institution_id: 'inst-123',
          department_id: 'dept-456',
          role: 'institution_admin',
          user_id: 'user-789',
          permissions: ['read', 'write']
        }
      });
    });
  });

  describe('validateTenantIsolation', () => {
    it('should pass validation when no cross-tenant data is accessible', async () => {
      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          neq: jest.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }));
      (tenantSecurity as any).supabase.from = mockFrom;

      const result = await tenantSecurity.validateTenantIsolation(mockContext);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when cross-tenant data is accessible', async () => {
      const mockFrom = jest.fn((table) => {
        if (table === 'institutions') {
          return {
            select: jest.fn(() => ({
              neq: jest.fn(() => Promise.resolve({ 
                data: [{ id: 'other-inst' }], 
                error: null 
              }))
            }))
          };
        }
        return {
          select: jest.fn(() => ({
            neq: jest.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        };
      });
      (tenantSecurity as any).supabase.from = mockFrom;

      const result = await tenantSecurity.validateTenantIsolation(mockContext);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Institution isolation failed: can access other institutions');
    });

    it('should allow system admin to access all data', async () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          neq: jest.fn(() => Promise.resolve({ 
            data: [{ id: 'other-inst' }], 
            error: null 
          }))
        }))
      }));
      (tenantSecurity as any).supabase.from = mockFrom;

      const result = await tenantSecurity.validateTenantIsolation(systemAdminContext);

      expect(result.isValid).toBe(true);
    });
  });

  describe('createTenantQuery', () => {
    it('should create institution-scoped query for regular users', () => {
      const mockQuery = {
        eq: jest.fn(() => mockQuery),
        or: jest.fn(() => mockQuery),
        in: jest.fn(() => mockQuery)
      };
      const mockFrom = jest.fn(() => mockQuery);
      (tenantSecurity as any).supabase.from = mockFrom;

      tenantSecurity.createTenantQuery('institutions', mockContext);

      expect(mockFrom).toHaveBeenCalledWith('institutions');
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'inst-123');
    });

    it('should create unrestricted query for system admin', () => {
      const systemAdminContext = { ...mockContext, role: 'system_admin' };
      const mockQuery = {
        eq: jest.fn(() => mockQuery),
        or: jest.fn(() => mockQuery),
        in: jest.fn(() => mockQuery)
      };
      const mockFrom = jest.fn(() => mockQuery);
      (tenantSecurity as any).supabase.from = mockFrom;

      const result = tenantSecurity.createTenantQuery('institutions', systemAdminContext);

      expect(mockFrom).toHaveBeenCalledWith('institutions');
      expect(mockQuery.eq).not.toHaveBeenCalled();
    });

    it('should create department-scoped query for department users', () => {
      const deptUserContext = { ...mockContext, role: 'teacher' };
      const mockQuery = {
        eq: jest.fn(() => mockQuery),
        or: jest.fn(() => mockQuery),
        in: jest.fn(() => mockQuery)
      };
      const mockFrom = jest.fn(() => mockQuery);
      (tenantSecurity as any).supabase.from = mockFrom;

      tenantSecurity.createTenantQuery('departments', deptUserContext);

      expect(mockQuery.or).toHaveBeenCalledWith('id.eq.dept-456,institution_id.eq.inst-123');
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events with correct parameters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await tenantSecurity.logSecurityEvent(mockContext, 'access_denied', {
        resource: 'institutions',
        action: 'read',
        targetInstitutionId: 'other-inst'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[SECURITY_EVENT]',
        expect.stringContaining('access_denied')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('enforceDataRetention', () => {
    it('should enforce data retention policies', async () => {
      const mockFrom = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({
              data: {
                settings: {
                  dataRetentionPolicy: {
                    retentionPeriodDays: 365,
                    autoDeleteInactive: true
                  }
                }
              },
              error: null
            }))
          }))
        }))
      }));
      (tenantSecurity as any).supabase.from = mockFrom;

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await tenantSecurity.enforceDataRetention('inst-123');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Enforcing data retention for institution inst-123')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('generateSecurityReport', () => {
    it('should generate security report with metrics', async () => {
      const report = await tenantSecurity.generateSecurityReport('inst-123');

      expect(report).toEqual({
        institutionId: 'inst-123',
        reportDate: expect.any(Date),
        securityScore: expect.any(Number),
        findings: expect.any(Array),
        metrics: {
          totalUsers: expect.any(Number),
          activeSessions: expect.any(Number),
          failedLoginAttempts: expect.any(Number),
          dataAccessViolations: expect.any(Number)
        }
      });
    });
  });
});