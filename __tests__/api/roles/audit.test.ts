import { GET, POST } from '@/app/api/roles/audit/route';
import { createClient } from '@/lib/supabase/server';
import { RoleAuditService } from '@/lib/services/role-audit-service';
import { NextRequest } from 'next/server';
import { AuditAction, UserRole } from '@/lib/types/role-management';

// Mock dependencies
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/services/role-audit-service');

describe('/api/roles/audit', () => {
  let mockSupabase: any;
  let mockRoleAuditService: jest.Mocked<RoleAuditService>;

  beforeEach(() => {
    mockSupabase = {
      auth: {
        getUser: jest.fn()
      }
    };

    mockRoleAuditService = {
      queryRoleAuditLogs: jest.fn(),
      generateRoleAuditReport: jest.fn()
    } as any;

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    (RoleAuditService as jest.Mock).mockImplementation(() => mockRoleAuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/roles/audit', () => {
    it('should return audit logs successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      const mockAuditEntries = [
        {
          id: 'audit-1',
          userId: 'user-1',
          action: AuditAction.ASSIGNED,
          newRole: UserRole.TEACHER,
          changedBy: 'admin-1',
          timestamp: new Date(),
          metadata: {}
        }
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockRoleAuditService.queryRoleAuditLogs.mockResolvedValue({
        entries: mockAuditEntries,
        totalCount: 1,
        hasMore: false
      });

      const request = new NextRequest('http://localhost/api/roles/audit?userId=user-1&limit=10');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toHaveLength(1);
      expect(data.totalCount).toBe(1);
      expect(data.hasMore).toBe(false);

      expect(mockRoleAuditService.queryRoleAuditLogs).toHaveBeenCalledWith({
        userId: 'user-1',
        performedBy: undefined,
        action: undefined,
        role: undefined,
        institutionId: undefined,
        departmentId: undefined,
        startDate: undefined,
        endDate: undefined,
        limit: 10,
        offset: 0
      });
    });

    it('should handle query parameters correctly', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockRoleAuditService.queryRoleAuditLogs.mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      const queryParams = new URLSearchParams({
        userId: 'user-1',
        performedBy: 'admin-1',
        action: AuditAction.ASSIGNED,
        role: UserRole.TEACHER,
        institutionId: 'inst-1',
        departmentId: 'dept-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        searchTerm: 'test',
        limit: '25',
        offset: '50'
      });

      const request = new NextRequest(`http://localhost/api/roles/audit?${queryParams}`);
      await GET(request);

      expect(mockRoleAuditService.queryRoleAuditLogs).toHaveBeenCalledWith({
        userId: 'user-1',
        performedBy: 'admin-1',
        action: AuditAction.ASSIGNED,
        role: UserRole.TEACHER,
        institutionId: 'inst-1',
        departmentId: 'dept-1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        limit: 25,
        offset: 50
      });
    });

    it('should filter results by search term', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      const mockAuditEntries = [
        {
          id: 'audit-1',
          userId: 'user-1',
          action: AuditAction.ASSIGNED,
          userName: 'John Doe',
          userEmail: 'john@example.com',
          performedByName: 'Admin User',
          reason: 'New assignment'
        },
        {
          id: 'audit-2',
          userId: 'user-2',
          action: AuditAction.REVOKED,
          userName: 'Jane Smith',
          userEmail: 'jane@example.com',
          performedByName: 'Admin User',
          reason: 'Role removed'
        }
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockRoleAuditService.queryRoleAuditLogs.mockResolvedValue({
        entries: mockAuditEntries,
        totalCount: 2,
        hasMore: false
      });

      const request = new NextRequest('http://localhost/api/roles/audit?searchTerm=john');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].userName).toBe('John Doe');
    });

    it('should return 401 for unauthenticated requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' }
      });

      const request = new NextRequest('http://localhost/api/roles/audit');
      const response = await GET(request);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('should handle service errors', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockRoleAuditService.queryRoleAuditLogs.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost/api/roles/audit');
      const response = await GET(request);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to fetch audit logs' });
    });

    it('should use default pagination values', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockRoleAuditService.queryRoleAuditLogs.mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      const request = new NextRequest('http://localhost/api/roles/audit');
      await GET(request);

      expect(mockRoleAuditService.queryRoleAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 0
        })
      );
    });
  });

  describe('POST /api/roles/audit', () => {
    it('should generate audit report successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      const mockReport = {
        id: 'report-1',
        title: 'Test Report',
        generatedBy: 'user-1',
        generatedAt: new Date(),
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-12-31'),
        summary: {
          totalRoleChanges: 10,
          roleAssignments: 5,
          roleRevocations: 2,
          roleRequests: 3,
          approvals: 2,
          denials: 1,
          suspiciousActivities: 1,
          roleDistribution: {},
          topPerformers: [],
          departmentActivity: []
        },
        entries: [],
        suspiciousActivities: []
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockRoleAuditService.generateRoleAuditReport.mockResolvedValue(mockReport);

      const requestBody = {
        title: 'Test Report',
        description: 'Test description',
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31',
        institutionId: 'inst-1'
      };

      const request = new NextRequest('http://localhost/api/roles/audit', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.report).toEqual(mockReport);

      expect(mockRoleAuditService.generateRoleAuditReport).toHaveBeenCalledWith(
        'Test Report',
        'user-1',
        new Date('2024-01-01'),
        new Date('2024-12-31'),
        'inst-1',
        undefined
      );
    });

    it('should validate required fields', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      const requestBody = {
        description: 'Missing title and dates'
      };

      const request = new NextRequest('http://localhost/api/roles/audit', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Missing required fields: title, periodStart, periodEnd'
      });
    });

    it('should return 401 for unauthenticated requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' }
      });

      const requestBody = {
        title: 'Test Report',
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31'
      };

      const request = new NextRequest('http://localhost/api/roles/audit', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('should handle service errors', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockRoleAuditService.generateRoleAuditReport.mockRejectedValue(
        new Error('Report generation failed')
      );

      const requestBody = {
        title: 'Test Report',
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31'
      };

      const request = new NextRequest('http://localhost/api/roles/audit', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to generate audit report' });
    });

    it('should include optional parameters in report generation', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      const mockReport = {
        id: 'report-1',
        title: 'Department Report',
        generatedBy: 'user-1',
        generatedAt: new Date(),
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-12-31'),
        institutionId: 'inst-1',
        departmentId: 'dept-1',
        summary: {
          totalRoleChanges: 5,
          roleAssignments: 3,
          roleRevocations: 1,
          roleRequests: 1,
          approvals: 1,
          denials: 0,
          suspiciousActivities: 0,
          roleDistribution: {},
          topPerformers: [],
          departmentActivity: []
        },
        entries: [],
        suspiciousActivities: []
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockRoleAuditService.generateRoleAuditReport.mockResolvedValue(mockReport);

      const requestBody = {
        title: 'Department Report',
        description: 'Department-specific audit report',
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31',
        institutionId: 'inst-1',
        departmentId: 'dept-1'
      };

      const request = new NextRequest('http://localhost/api/roles/audit', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      expect(mockRoleAuditService.generateRoleAuditReport).toHaveBeenCalledWith(
        'Department Report',
        'user-1',
        new Date('2024-01-01'),
        new Date('2024-12-31'),
        'inst-1',
        'dept-1'
      );
    });
  });
});