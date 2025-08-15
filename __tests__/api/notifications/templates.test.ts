import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/notifications/templates/route';

// Mock Supabase
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  }))
}));

// Mock the enhanced notification service
jest.mock('@/lib/services/enhanced-notification-service', () => ({
  EnhancedNotificationService: jest.fn(() => ({
    getTemplates: jest.fn(),
    createTemplate: jest.fn()
  }))
}));

describe('/api/notifications/templates', () => {
  let mockSupabase: any;
  let mockNotificationService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const { createClient } = require('@/lib/supabase/server');
    mockSupabase = createClient();
    
    const { EnhancedNotificationService } = require('@/lib/services/enhanced-notification-service');
    mockNotificationService = new EnhancedNotificationService();
  });

  describe('GET /api/notifications/templates', () => {
    it('returns templates for authenticated admin user', async () => {
      // Mock authentication
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      });

      // Mock user data
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                institution_id: 'test-institution',
                role: 'institution_admin'
              },
              error: null
            })
          })
        })
      });

      // Mock templates
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Test Template',
          type: 'system_message',
          subject_template: 'Test Subject',
          html_template: '<p>Test</p>'
        }
      ];

      mockNotificationService.getTemplates.mockResolvedValue(mockTemplates);

      const request = new NextRequest('http://localhost:3000/api/notifications/templates');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.templates).toEqual(mockTemplates);
      expect(mockNotificationService.getTemplates).toHaveBeenCalledWith(
        'test-institution',
        expect.objectContaining({
          activeOnly: false,
          limit: 50,
          offset: 0
        })
      );
    });

    it('returns 401 for unauthenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/templates');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 for non-admin user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                institution_id: 'test-institution',
                role: 'student'
              },
              error: null
            })
          })
        })
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/templates');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Insufficient permissions');
    });

    it('handles query parameters correctly', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                institution_id: 'test-institution',
                role: 'institution_admin'
              },
              error: null
            })
          })
        })
      });

      mockNotificationService.getTemplates.mockResolvedValue([]);

      const request = new NextRequest(
        'http://localhost:3000/api/notifications/templates?type=system_message&activeOnly=true&limit=10&offset=20'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockNotificationService.getTemplates).toHaveBeenCalledWith(
        'test-institution',
        {
          type: 'system_message',
          activeOnly: true,
          limit: 10,
          offset: 20
        }
      );
    });
  });

  describe('POST /api/notifications/templates', () => {
    it('creates template for authenticated admin user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                institution_id: 'test-institution',
                role: 'institution_admin'
              },
              error: null
            })
          })
        })
      });

      const mockTemplate = {
        id: 'new-template',
        name: 'New Template',
        type: 'system_message',
        subject_template: 'New Subject',
        html_template: '<p>New Content</p>'
      };

      mockNotificationService.createTemplate.mockResolvedValue(mockTemplate);

      const requestBody = {
        name: 'New Template',
        type: 'system_message',
        subject_template: 'New Subject',
        html_template: '<p>New Content</p>',
        variables: [],
        conditions: [],
        is_active: true
      };

      const request = new NextRequest('http://localhost:3000/api/notifications/templates', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.template).toEqual(mockTemplate);
      expect(mockNotificationService.createTemplate).toHaveBeenCalledWith(
        'test-institution',
        'test-user',
        requestBody
      );
    });

    it('returns 400 for missing required fields', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                institution_id: 'test-institution',
                role: 'institution_admin'
              },
              error: null
            })
          })
        })
      });

      const requestBody = {
        name: 'New Template'
        // Missing required fields
      };

      const request = new NextRequest('http://localhost:3000/api/notifications/templates', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name, type, subject_template, and html_template are required');
    });

    it('returns 401 for unauthenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/templates', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 for non-admin user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                institution_id: 'test-institution',
                role: 'student'
              },
              error: null
            })
          })
        })
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test',
          type: 'system_message',
          subject_template: 'Test',
          html_template: '<p>Test</p>'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Insufficient permissions');
    });

    it('returns 500 when template creation fails', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                institution_id: 'test-institution',
                role: 'institution_admin'
              },
              error: null
            })
          })
        })
      });

      mockNotificationService.createTemplate.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/notifications/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test',
          type: 'system_message',
          subject_template: 'Test',
          html_template: '<p>Test</p>'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create template');
    });
  });
});