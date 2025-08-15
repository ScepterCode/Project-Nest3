import { EnhancedNotificationService } from '@/lib/services/enhanced-notification-service';
import { NotificationTemplate, BrandingConfig } from '@/lib/types/enhanced-notifications';

// Mock Supabase
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn()
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('EnhancedNotificationService', () => {
  let service: EnhancedNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EnhancedNotificationService();
  });

  describe('createTemplate', () => {
    it('creates a new notification template', async () => {
      const mockTemplate = {
        id: 'test-template',
        institution_id: 'test-institution',
        name: 'Test Template',
        type: 'system_message',
        subject_template: 'Test Subject',
        html_template: '<p>Test</p>',
        created_by: 'test-user'
      };

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockTemplate,
              error: null
            })
          })
        })
      });

      const result = await service.createTemplate(
        'test-institution',
        'test-user',
        {
          name: 'Test Template',
          type: 'system_message',
          subject_template: 'Test Subject',
          html_template: '<p>Test</p>',
          variables: [],
          conditions: [],
          is_active: true
        }
      );

      expect(result).toEqual(mockTemplate);
      expect(mockSupabase.from).toHaveBeenCalledWith('notification_templates');
    });

    it('returns null when creation fails', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Creation failed')
            })
          })
        })
      });

      const result = await service.createTemplate(
        'test-institution',
        'test-user',
        {
          name: 'Test Template',
          type: 'system_message',
          subject_template: 'Test Subject',
          html_template: '<p>Test</p>',
          variables: [],
          conditions: [],
          is_active: true
        }
      );

      expect(result).toBeNull();
    });
  });

  describe('updateTemplate', () => {
    it('updates an existing template', async () => {
      const mockUpdatedTemplate = {
        id: 'test-template',
        name: 'Updated Template',
        version: 2
      };

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockUpdatedTemplate,
                error: null
              })
            })
          })
        })
      });

      const result = await service.updateTemplate('test-template', {
        name: 'Updated Template'
      });

      expect(result).toEqual(mockUpdatedTemplate);
    });

    it('returns null when update fails', async () => {
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: new Error('Update failed')
              })
            })
          })
        })
      });

      const result = await service.updateTemplate('test-template', {
        name: 'Updated Template'
      });

      expect(result).toBeNull();
    });
  });

  describe('getTemplates', () => {
    it('retrieves templates for an institution', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Template 1',
          type: 'system_message'
        },
        {
          id: 'template-2',
          name: 'Template 2',
          type: 'assignment_created'
        }
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockTemplates,
          error: null
        })
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await service.getTemplates('test-institution', {
        type: 'system_message',
        activeOnly: true,
        limit: 10,
        offset: 0
      });

      expect(result).toEqual(mockTemplates);
      expect(mockQuery.eq).toHaveBeenCalledWith('institution_id', 'test-institution');
      expect(mockQuery.eq).toHaveBeenCalledWith('type', 'system_message');
      expect(mockQuery.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('returns empty array when query fails', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Query failed')
        })
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await service.getTemplates('test-institution');

      expect(result).toEqual([]);
    });
  });

  describe('previewTemplate', () => {
    it('generates template preview with variables', async () => {
      const mockPreview = {
        html_content: '<p>Hello John</p>',
        text_content: 'Hello John',
        subject: 'Welcome John'
      };

      mockSupabase.rpc.mockResolvedValue({
        data: [mockPreview],
        error: null
      });

      const result = await service.previewTemplate('test-template', {
        name: 'John'
      });

      expect(result).toEqual({
        html_content: '<p>Hello John</p>',
        text_content: 'Hello John',
        subject: 'Welcome John',
        variables_used: ['name']
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_branded_template', {
        p_template_id: 'test-template',
        p_variables: { name: 'John' }
      });
    });

    it('returns null when preview generation fails', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: new Error('Preview failed')
      });

      const result = await service.previewTemplate('test-template', {});

      expect(result).toBeNull();
    });
  });

  describe('testTemplate', () => {
    it('sends test notifications to recipients', async () => {
      // Mock preview generation
      mockSupabase.rpc.mockResolvedValue({
        data: [{
          html_content: '<p>Test</p>',
          text_content: 'Test',
          subject: 'Test Subject'
        }],
        error: null
      });

      // Mock notification creation
      const mockCreateClient = require('@/lib/supabase/server').createClient;
      const mockClient = {
        rpc: jest.fn().mockResolvedValue('notification-id')
      };
      mockCreateClient.mockReturnValue(mockClient);

      const result = await service.testTemplate(
        'test-template',
        ['user1', 'user2'],
        { name: 'Test' }
      );

      expect(result.success).toBe(true);
      expect(result.sent_count).toBe(2);
      expect(result.failed_count).toBe(0);
      expect(result.delivery_ids).toHaveLength(2);
    });

    it('handles partial failures', async () => {
      // Mock preview generation
      mockSupabase.rpc.mockResolvedValue({
        data: [{
          html_content: '<p>Test</p>',
          text_content: 'Test',
          subject: 'Test Subject'
        }],
        error: null
      });

      // Mock notification creation with one failure
      const mockCreateClient = require('@/lib/supabase/server').createClient;
      const mockClient = {
        rpc: jest.fn()
          .mockResolvedValueOnce('notification-id-1')
          .mockResolvedValueOnce(null)
      };
      mockCreateClient.mockReturnValue(mockClient);

      const result = await service.testTemplate(
        'test-template',
        ['user1', 'user2'],
        { name: 'Test' }
      );

      expect(result.success).toBe(true);
      expect(result.sent_count).toBe(1);
      expect(result.failed_count).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('getBrandingConfig', () => {
    it('retrieves branding configuration for institution', async () => {
      const mockBranding = {
        logo_url: 'https://example.com/logo.png',
        primary_color: '#007bff',
        secondary_color: '#6c757d',
        font_family: 'Arial, sans-serif'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockBranding,
              error: null
            })
          })
        })
      });

      const result = await service.getBrandingConfig('test-institution');

      expect(result).toEqual(mockBranding);
    });

    it('returns null when branding not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Not found')
            })
          })
        })
      });

      const result = await service.getBrandingConfig('test-institution');

      expect(result).toBeNull();
    });
  });

  describe('updateBrandingConfig', () => {
    it('updates branding configuration', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: null
        })
      });

      const result = await service.updateBrandingConfig('test-institution', {
        primary_color: '#ff0000'
      });

      expect(result).toBe(true);
    });

    it('returns false when update fails', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: new Error('Update failed')
        })
      });

      const result = await service.updateBrandingConfig('test-institution', {
        primary_color: '#ff0000'
      });

      expect(result).toBe(false);
    });
  });

  describe('getDeliveryPreferences', () => {
    it('retrieves delivery preferences for user', async () => {
      const mockPreferences = {
        user_id: 'test-user',
        email_enabled: true,
        push_enabled: false,
        frequency_limit: 5
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockPreferences,
              error: null
            })
          })
        })
      });

      const result = await service.getDeliveryPreferences('test-user');

      expect(result).toEqual(mockPreferences);
    });
  });

  describe('updateDeliveryPreferences', () => {
    it('updates delivery preferences', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: null
        })
      });

      const result = await service.updateDeliveryPreferences('test-user', {
        email_enabled: false
      });

      expect(result).toBe(true);
    });
  });

  describe('trackEngagement', () => {
    it('tracks engagement event', async () => {
      mockSupabase.rpc.mockResolvedValue({
        error: null
      });

      const result = await service.trackEngagement(
        'notification-id',
        'user-id',
        'opened',
        'campaign-id',
        { test: 'data' },
        'Mozilla/5.0',
        '192.168.1.1'
      );

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('track_engagement', {
        p_notification_id: 'notification-id',
        p_user_id: 'user-id',
        p_campaign_id: 'campaign-id',
        p_event_type: 'opened',
        p_event_data: { test: 'data' },
        p_user_agent: 'Mozilla/5.0',
        p_ip_address: '192.168.1.1'
      });
    });

    it('returns false when tracking fails', async () => {
      mockSupabase.rpc.mockResolvedValue({
        error: new Error('Tracking failed')
      });

      const result = await service.trackEngagement(
        'notification-id',
        'user-id',
        'opened'
      );

      expect(result).toBe(false);
    });
  });

  describe('shouldSendNotification', () => {
    it('returns true when user has no preferences', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Not found')
            })
          })
        })
      });

      const result = await service.shouldSendNotification('user-id', 'system_message');

      expect(result).toBe(true);
    });

    it('respects email preferences', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                email_enabled: false,
                push_enabled: true,
                quiet_hours_enabled: false
              },
              error: null
            })
          })
        })
      });

      const result = await service.shouldSendNotification('user-id', 'system_message', 'email');

      expect(result).toBe(false);
    });

    it('respects quiet hours', async () => {
      // Mock current time to be within quiet hours
      const mockDate = new Date('2024-01-01T23:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                email_enabled: true,
                quiet_hours_enabled: true,
                quiet_hours_start: '22:00',
                quiet_hours_end: '08:00'
              },
              error: null
            })
          })
        })
      });

      const result = await service.shouldSendNotification('user-id', 'system_message');

      expect(result).toBe(false);

      // Restore Date
      jest.restoreAllMocks();
    });
  });
});