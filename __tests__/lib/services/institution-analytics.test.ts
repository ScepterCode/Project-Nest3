import { InstitutionAnalyticsService } from '@/lib/services/institution-analytics';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('InstitutionAnalyticsService', () => {
  let service: InstitutionAnalyticsService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis()
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new InstitutionAnalyticsService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('collectMetrics', () => {
    it('should collect and store institution metrics', async () => {
      const institutionId = 'test-institution-id';
      
      // Mock the metric calculation methods
      jest.spyOn(service as any, 'calculateInstitutionMetrics').mockResolvedValue({
        userCount: 100,
        activeUsers: 80,
        classCount: 20,
        enrollmentCount: 150,
        loginRate: 0.75,
        contentCreationRate: 2.3,
        engagementScore: 78.5
      });

      mockSupabase.insert.mockResolvedValue({ error: null });

      await service.collectMetrics(institutionId);

      expect(mockSupabase.from).toHaveBeenCalledWith('institution_analytics');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            institution_id: institutionId,
            metric_name: 'userCount',
            metric_value: 100
          })
        ])
      );
    });

    it('should handle errors during metric collection', async () => {
      const institutionId = 'test-institution-id';
      
      jest.spyOn(service as any, 'calculateInstitutionMetrics').mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.collectMetrics(institutionId)).rejects.toThrow(
        'Failed to collect institution metrics'
      );
    });
  });

  describe('getInstitutionMetrics', () => {
    it('should retrieve institution metrics for a timeframe', async () => {
      const institutionId = 'test-institution-id';
      const timeframe = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
        period: 'monthly' as const
      };

      const mockAnalyticsData = [
        { metric_name: 'user_count', metric_value: 100, recorded_at: '2024-01-15' },
        { metric_name: 'active_users', metric_value: 80, recorded_at: '2024-01-15' },
        { metric_name: 'engagement_score', metric_value: 78.5, recorded_at: '2024-01-15' }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockAnalyticsData, error: null });

      const result = await service.getInstitutionMetrics(institutionId, timeframe);

      expect(result).toEqual({
        userCount: 100,
        activeUsers: 80,
        classCount: 0,
        enrollmentCount: 0,
        loginRate: 0,
        contentCreationRate: 0,
        engagementScore: 78.5
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('institution_analytics');
      expect(mockSupabase.eq).toHaveBeenCalledWith('institution_id', institutionId);
      expect(mockSupabase.gte).toHaveBeenCalledWith('recorded_at', timeframe.start.toISOString());
      expect(mockSupabase.lte).toHaveBeenCalledWith('recorded_at', timeframe.end.toISOString());
    });

    it('should handle missing metrics gracefully', async () => {
      const institutionId = 'test-institution-id';

      mockSupabase.select.mockResolvedValue({ data: [], error: null });

      const result = await service.getInstitutionMetrics(institutionId);

      expect(result).toEqual({
        userCount: 0,
        activeUsers: 0,
        classCount: 0,
        enrollmentCount: 0,
        loginRate: 0,
        contentCreationRate: 0,
        engagementScore: 0
      });
    });
  });

  describe('monitorInstitutionHealth', () => {
    it('should return healthy status for good metrics', async () => {
      const institutionId = 'test-institution-id';
      
      jest.spyOn(service, 'getInstitutionMetrics').mockResolvedValue({
        userCount: 100,
        activeUsers: 80,
        classCount: 20,
        enrollmentCount: 150,
        loginRate: 0.75,
        contentCreationRate: 2.3,
        engagementScore: 85.0 // High engagement score
      });

      const result = await service.monitorInstitutionHealth(institutionId);

      expect(result.overall).toBe('healthy');
      expect(result.metrics.userEngagement).toBe('healthy');
      expect(result.alerts).toHaveLength(0);
    });

    it('should return warning status for concerning metrics', async () => {
      const institutionId = 'test-institution-id';
      
      jest.spyOn(service, 'getInstitutionMetrics').mockResolvedValue({
        userCount: 100,
        activeUsers: 80,
        classCount: 20,
        enrollmentCount: 150,
        loginRate: 0.75,
        contentCreationRate: 2.3,
        engagementScore: 65.0 // Warning level engagement
      });

      const result = await service.monitorInstitutionHealth(institutionId);

      expect(result.overall).toBe('warning');
      expect(result.metrics.userEngagement).toBe('warning');
      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].severity).toBe('medium');
    });

    it('should return critical status for poor metrics', async () => {
      const institutionId = 'test-institution-id';
      
      jest.spyOn(service, 'getInstitutionMetrics').mockResolvedValue({
        userCount: 100,
        activeUsers: 80,
        classCount: 20,
        enrollmentCount: 150,
        loginRate: 0.75,
        contentCreationRate: 2.3,
        engagementScore: 45.0 // Critical level engagement
      });

      const result = await service.monitorInstitutionHealth(institutionId);

      expect(result.overall).toBe('critical');
      expect(result.metrics.userEngagement).toBe('critical');
      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].severity).toBe('critical');
    });
  });

  describe('getComparativeAnalytics', () => {
    it('should return comparative analytics for multiple institutions', async () => {
      const institutionIds = ['inst1', 'inst2', 'inst3'];
      
      // Mock institution info
      mockSupabase.single.mockResolvedValueOnce({ data: { name: 'Institution 1' }, error: null })
                          .mockResolvedValueOnce({ data: { name: 'Institution 2' }, error: null })
                          .mockResolvedValueOnce({ data: { name: 'Institution 3' }, error: null });

      // Mock metrics for each institution
      jest.spyOn(service, 'getInstitutionMetrics')
          .mockResolvedValueOnce({
            userCount: 100, activeUsers: 80, classCount: 20, enrollmentCount: 150,
            loginRate: 0.75, contentCreationRate: 2.3, engagementScore: 85.0
          })
          .mockResolvedValueOnce({
            userCount: 150, activeUsers: 120, classCount: 30, enrollmentCount: 200,
            loginRate: 0.80, contentCreationRate: 3.1, engagementScore: 78.0
          })
          .mockResolvedValueOnce({
            userCount: 80, activeUsers: 60, classCount: 15, enrollmentCount: 100,
            loginRate: 0.70, contentCreationRate: 1.8, engagementScore: 82.0
          });

      const result = await service.getComparativeAnalytics(institutionIds);

      expect(result).toHaveLength(3);
      expect(result[0].institutionName).toBe('Institution 1');
      expect(result[0].ranking.userEngagement).toBeGreaterThan(0);
      expect(result[0].ranking.contentCreation).toBeGreaterThan(0);
      expect(result[0].ranking.overallPerformance).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('should generate a privacy-compliant analytics report', async () => {
      const institutionId = 'test-institution-id';
      const timeframe = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
        period: 'monthly' as const
      };

      // Mock the data methods
      jest.spyOn(service as any, 'getUserActivityData').mockResolvedValue({
        totalUsers: 100,
        activeUsers: 80,
        loginFrequency: 0.75
      });

      const result = await service.generateReport(institutionId, 'user_activity', timeframe);

      expect(result.institutionId).toBe(institutionId);
      expect(result.type).toBe('user_activity');
      expect(result.title).toBe('User Activity Report');
      expect(result.privacyCompliant).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should anonymize sensitive data in reports', async () => {
      const testData = {
        email: 'test@example.com',
        name: 'John Doe',
        phone: '123-456-7890',
        metrics: {
          engagement: 85,
          nested: {
            email: 'nested@example.com',
            score: 90
          }
        }
      };

      const anonymized = (service as any).anonymizeData(testData);

      expect(anonymized.email).toBeUndefined();
      expect(anonymized.name).toBeUndefined();
      expect(anonymized.phone).toBeUndefined();
      expect(anonymized.metrics.engagement).toBe(85);
      expect(anonymized.metrics.nested.email).toBeUndefined();
      expect(anonymized.metrics.nested.score).toBe(90);
    });
  });

  describe('exportReport', () => {
    it('should export report as JSON', async () => {
      const report = {
        id: 'test-report',
        institutionId: 'test-inst',
        type: 'user_activity' as const,
        title: 'Test Report',
        description: 'Test Description',
        generatedAt: new Date(),
        timeframe: { start: new Date(), end: new Date(), period: 'monthly' as const },
        data: { test: 'data' },
        exportFormats: ['json' as const],
        privacyCompliant: true
      };

      const result = await service.exportReport(report, 'json');
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe('test-report');
      expect(parsed.data.test).toBe('data');
    });

    it('should export report as CSV', async () => {
      const report = {
        id: 'test-report',
        institutionId: 'test-inst',
        type: 'user_activity' as const,
        title: 'Test Report',
        description: 'Test Description',
        generatedAt: new Date(),
        timeframe: { start: new Date(), end: new Date(), period: 'monthly' as const },
        data: [
          { name: 'John', score: 85 },
          { name: 'Jane', score: 92 }
        ],
        exportFormats: ['csv' as const],
        privacyCompliant: true
      };

      const result = await service.exportReport(report, 'csv');

      expect(result).toContain('name,score');
      expect(result).toContain('"John",85');
      expect(result).toContain('"Jane",92');
    });

    it('should handle unsupported export formats', async () => {
      const report = {
        id: 'test-report',
        institutionId: 'test-inst',
        type: 'user_activity' as const,
        title: 'Test Report',
        description: 'Test Description',
        generatedAt: new Date(),
        timeframe: { start: new Date(), end: new Date(), period: 'monthly' as const },
        data: {},
        exportFormats: ['json' as const],
        privacyCompliant: true
      };

      await expect(service.exportReport(report, 'xml' as any)).rejects.toThrow(
        'Unsupported export format: xml'
      );
    });
  });
});