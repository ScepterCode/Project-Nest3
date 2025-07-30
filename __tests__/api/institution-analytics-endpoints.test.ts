import { NextRequest } from 'next/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

// Import API handlers after mocking
import { GET as analyticsGET, POST as analyticsPOST } from '@/app/api/institutions/[id]/analytics/route';
import { GET as deptAnalyticsGET, POST as deptAnalyticsPOST } from '@/app/api/departments/[id]/analytics/route';

describe('Institution Analytics API Endpoints', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Supabase client
    mockSupabase = {
      auth: {
        getUser: jest.fn()
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis()
    };

    (require('@/lib/supabase/server').createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  describe('Institution Analytics', () => {
    describe('GET /api/institutions/[id]/analytics', () => {
      it('should return overview analytics for institution admin', async () => {
        // Mock authenticated institution admin
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single
          .mockResolvedValueOnce({
            data: { role: 'institution_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: { id: 'inst-1', name: 'Test University', status: 'active' },
            error: null
          });

        // Mock count queries
        mockSupabase.from.mockImplementation((table) => {
          const mockQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis()
          };

          if (table === 'users') {
            mockQuery.select.mockResolvedValue({ count: 150 });
          } else if (table === 'departments') {
            mockQuery.select.mockResolvedValue({ count: 5 });
          } else if (table === 'classes') {
            mockQuery.select.mockResolvedValue({ count: 25 });
          }

          return mockQuery;
        });

        const url = 'http://localhost/api/institutions/inst-1/analytics?type=overview';
        const request = new NextRequest(url);
        const response = await analyticsGET(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.overview).toBeDefined();
        expect(data.data.overview.totalUsers).toBe(150);
        expect(data.data.overview.totalDepartments).toBe(5);
        expect(data.data.overview.activeClasses).toBe(25);
      });

      it('should return user activity analytics', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single
          .mockResolvedValueOnce({
            data: { role: 'institution_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: { id: 'inst-1', name: 'Test University', status: 'active' },
            error: null
          });

        const mockAnalyticsData = [
          {
            id: 'metric-1',
            institution_id: 'inst-1',
            metric_name: 'daily_active_users',
            metric_value: 45,
            recorded_at: '2024-01-15T10:00:00Z'
          },
          {
            id: 'metric-2',
            institution_id: 'inst-1',
            metric_name: 'weekly_active_users',
            metric_value: 120,
            recorded_at: '2024-01-15T10:00:00Z'
          }
        ];

        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: mockAnalyticsData,
            error: null
          })
        });

        const url = 'http://localhost/api/institutions/inst-1/analytics?type=user_activity&timeframe=last_30_days';
        const request = new NextRequest(url);
        const response = await analyticsGET(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.userActivity).toHaveLength(2);
        expect(data.data.timeframe).toBe('last_30_days');
      });

      it('should deny access for unauthorized user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single.mockResolvedValue({
          data: { role: 'student', institution_id: 'inst-2' },
          error: null
        });

        const url = 'http://localhost/api/institutions/inst-1/analytics';
        const request = new NextRequest(url);
        const response = await analyticsGET(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Institution admin role required');
      });

      it('should handle invalid analytics type', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single
          .mockResolvedValueOnce({
            data: { role: 'institution_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: { id: 'inst-1', name: 'Test University', status: 'active' },
            error: null
          });

        const url = 'http://localhost/api/institutions/inst-1/analytics?type=invalid_type';
        const request = new NextRequest(url);
        const response = await analyticsGET(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Invalid analytics type');
      });
    });

    describe('POST /api/institutions/[id]/analytics', () => {
      it('should generate analytics report', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        // Mock analytics data queries
        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'metric-1',
                metric_name: 'user_engagement',
                metric_value: 85,
                recorded_at: '2024-01-15T10:00:00Z'
              }
            ],
            error: null
          })
        });

        const requestBody = {
          action: 'generate_report',
          reportType: 'comprehensive',
          timeframe: 'last_30_days',
          format: 'json',
          includeDetails: true
        };

        const request = new NextRequest('http://localhost/api/institutions/inst-1/analytics', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await analyticsPOST(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.report).toBeDefined();
        expect(data.data.report.reportType).toBe('comprehensive');
        expect(data.data.report.institutionId).toBe('inst-1');
        expect(data.data.report.generatedBy).toBe('user-1');
      });

      it('should handle data export request', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        const requestBody = {
          action: 'export_data',
          exportType: 'analytics',
          dateRange: {
            start: '2024-01-01',
            end: '2024-01-31'
          },
          includePersonalData: false
        };

        const request = new NextRequest('http://localhost/api/institutions/inst-1/analytics', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await analyticsPOST(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.export).toBeDefined();
        expect(data.data.export.privacyCompliant).toBe(true);
        expect(data.data.downloadUrl).toContain('/analytics/download/');
      });

      it('should deny personal data export for non-system admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        const requestBody = {
          action: 'export_data',
          exportType: 'analytics',
          includePersonalData: true
        };

        const request = new NextRequest('http://localhost/api/institutions/inst-1/analytics', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await analyticsPOST(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('system admin privileges');
      });

      it('should handle metrics collection trigger', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single.mockResolvedValue({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        });

        const requestBody = {
          action: 'collect_metrics'
        };

        const request = new NextRequest('http://localhost/api/institutions/inst-1/analytics', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await analyticsPOST(request, { params: { id: 'inst-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.collection).toBeDefined();
        expect(data.data.collection.status).toBe('completed');
        expect(data.data.collection.triggeredBy).toBe('user-1');
      });
    });
  });

  describe('Department Analytics', () => {
    describe('GET /api/departments/[id]/analytics', () => {
      it('should return department overview for department admin', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single
          .mockResolvedValueOnce({
            data: { role: 'department_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: {
              id: 'dept-1',
              name: 'Computer Science',
              code: 'CS',
              institution_id: 'inst-1',
              admin_id: 'user-1'
            },
            error: null
          });

        // Mock count queries for department metrics
        mockSupabase.from.mockImplementation((table) => {
          const mockQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis()
          };

          if (table === 'user_departments') {
            mockQuery.select.mockResolvedValue({ count: 25 });
          } else if (table === 'classes') {
            mockQuery.select.mockResolvedValue({ count: 8 });
          } else if (table === 'enrollments') {
            mockQuery.select.mockResolvedValue({ count: 120 });
          }

          return mockQuery;
        });

        const url = 'http://localhost/api/departments/dept-1/analytics?type=overview';
        const request = new NextRequest(url);
        const response = await deptAnalyticsGET(request, { params: { id: 'dept-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.overview).toBeDefined();
        expect(data.data.overview.totalUsers).toBe(25);
        expect(data.data.overview.totalClasses).toBe(8);
        expect(data.data.overview.totalEnrollments).toBe(120);
      });

      it('should return student performance analytics', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single
          .mockResolvedValueOnce({
            data: { role: 'department_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: {
              id: 'dept-1',
              name: 'Computer Science',
              institution_id: 'inst-1',
              admin_id: 'user-1'
            },
            error: null
          });

        const mockPerformanceData = [
          {
            id: 'perf-1',
            department_id: 'dept-1',
            metric_name: 'average_grade',
            metric_value: 87.5,
            recorded_at: '2024-01-15T10:00:00Z'
          },
          {
            id: 'perf-2',
            department_id: 'dept-1',
            metric_name: 'completion_rate',
            metric_value: 92.3,
            recorded_at: '2024-01-15T10:00:00Z'
          }
        ];

        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: mockPerformanceData,
            error: null
          })
        });

        const url = 'http://localhost/api/departments/dept-1/analytics?type=student_performance';
        const request = new NextRequest(url);
        const response = await deptAnalyticsGET(request, { params: { id: 'dept-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.studentPerformance).toHaveLength(2);
        expect(data.data.studentPerformance[0].metric_name).toBe('average_grade');
      });

      it('should deny access for unauthorized user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-2' } },
          error: null
        });

        mockSupabase.single
          .mockResolvedValueOnce({
            data: { role: 'student', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: {
              id: 'dept-1',
              name: 'Computer Science',
              institution_id: 'inst-1',
              admin_id: 'user-1' // Different admin
            },
            error: null
          });

        const url = 'http://localhost/api/departments/dept-1/analytics';
        const request = new NextRequest(url);
        const response = await deptAnalyticsGET(request, { params: { id: 'dept-1' } });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Department admin role required');
      });
    });

    describe('POST /api/departments/[id]/analytics', () => {
      it('should generate department report', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single
          .mockResolvedValueOnce({
            data: { role: 'department_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: {
              id: 'dept-1',
              name: 'Computer Science',
              institution_id: 'inst-1',
              admin_id: 'user-1'
            },
            error: null
          });

        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'metric-1',
                department_id: 'dept-1',
                metric_name: 'student_engagement',
                metric_value: 78.5,
                recorded_at: '2024-01-15T10:00:00Z'
              }
            ],
            error: null
          })
        });

        const requestBody = {
          action: 'generate_report',
          reportType: 'performance',
          timeframe: 'last_30_days',
          includeStudentData: false
        };

        const request = new NextRequest('http://localhost/api/departments/dept-1/analytics', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await deptAnalyticsPOST(request, { params: { id: 'dept-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.report).toBeDefined();
        expect(data.data.report.departmentId).toBe('dept-1');
        expect(data.data.report.reportType).toBe('performance');
      });

      it('should identify at-risk students', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockSupabase.single
          .mockResolvedValueOnce({
            data: { role: 'department_admin', institution_id: 'inst-1' },
            error: null
          })
          .mockResolvedValueOnce({
            data: {
              id: 'dept-1',
              name: 'Computer Science',
              institution_id: 'inst-1',
              admin_id: 'user-1'
            },
            error: null
          });

        const requestBody = {
          action: 'identify_at_risk',
          criteria: 'low_engagement'
        };

        const request = new NextRequest('http://localhost/api/departments/dept-1/analytics', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });

        const response = await deptAnalyticsPOST(request, { params: { id: 'dept-1' } });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.atRiskAnalysis).toBeDefined();
        expect(data.data.atRiskAnalysis.departmentId).toBe('dept-1');
        expect(data.data.atRiskAnalysis.criteria).toBe('low_engagement');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Database connection failed'));

      const url = 'http://localhost/api/institutions/inst-1/analytics';
      const request = new NextRequest(url);
      const response = await analyticsGET(request, { params: { id: 'inst-1' } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle missing institution', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null
      });

      mockSupabase.single
        .mockResolvedValueOnce({
          data: { role: 'institution_admin', institution_id: 'inst-1' },
          error: null
        })
        .mockResolvedValueOnce({
          data: null,
          error: new Error('Institution not found')
        });

      const url = 'http://localhost/api/institutions/inst-1/analytics';
      const request = new NextRequest(url);
      const response = await analyticsGET(request, { params: { id: 'inst-1' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Institution not found');
    });

    it('should handle invalid action in POST request', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null
      });

      mockSupabase.single.mockResolvedValue({
        data: { role: 'institution_admin', institution_id: 'inst-1' },
        error: null
      });

      const requestBody = {
        action: 'invalid_action'
      };

      const request = new NextRequest('http://localhost/api/institutions/inst-1/analytics', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const response = await analyticsPOST(request, { params: { id: 'inst-1' } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid action');
    });
  });
});