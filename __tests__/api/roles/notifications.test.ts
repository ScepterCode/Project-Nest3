import { NextRequest } from 'next/server';
import { GET, PUT } from '@/app/api/roles/notifications/preferences/route';
import { POST } from '@/app/api/roles/notifications/process/route';
import { RoleNotificationService } from '@/lib/services/role-notification-service';

// Mock the services
jest.mock('@/lib/services/role-notification-service');
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: null }))
        }))
      }))
    }))
  }))
}));

describe('/api/roles/notifications/preferences', () => {
  let mockRoleNotificationService: jest.Mocked<RoleNotificationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleNotificationService = new RoleNotificationService() as jest.Mocked<RoleNotificationService>;
    (RoleNotificationService as jest.Mock).mockImplementation(() => mockRoleNotificationService);
  });

  describe('GET', () => {
    it('should return user preferences', async () => {
      const mockUser = { id: 'user-1', email: 'user@example.com' };
      const mockPreferences = {
        userId: 'user-1',
        roleRequests: { email: true, inApp: true, sms: false },
        roleAssignments: { email: true, inApp: true, sms: false },
        temporaryRoles: { email: true, inApp: true, sms: false, reminderDays: [7, 3, 1] },
        adminNotifications: { email: true, inApp: true, sms: false, digestFrequency: 'daily' as const }
      };

      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      
      mockRoleNotificationService.getRoleNotificationPreferences.mockResolvedValue(mockPreferences);

      const request = new NextRequest('http://localhost/api/roles/notifications/preferences');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.preferences).toEqual(mockPreferences);
      expect(mockRoleNotificationService.getRoleNotificationPreferences).toHaveBeenCalledWith('user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Not authenticated') });

      const request = new NextRequest('http://localhost/api/roles/notifications/preferences');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 when service throws error', async () => {
      const mockUser = { id: 'user-1', email: 'user@example.com' };
      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      
      mockRoleNotificationService.getRoleNotificationPreferences.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/roles/notifications/preferences');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch role notification preferences');
    });
  });

  describe('PUT', () => {
    it('should update user preferences', async () => {
      const mockUser = { id: 'user-1', email: 'user@example.com' };
      const mockPreferences = {
        userId: 'user-1',
        roleRequests: { email: false, inApp: true, sms: false },
        roleAssignments: { email: true, inApp: true, sms: true },
        temporaryRoles: { email: true, inApp: true, sms: false, reminderDays: [3, 1] },
        adminNotifications: { email: true, inApp: true, sms: false, digestFrequency: 'weekly' as const }
      };

      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      
      mockRoleNotificationService.updateRoleNotificationPreferences.mockResolvedValue();

      const request = new NextRequest('http://localhost/api/roles/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences: mockPreferences })
      });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockRoleNotificationService.updateRoleNotificationPreferences).toHaveBeenCalledWith(mockPreferences);
    });

    it('should return 400 when preferences userId does not match authenticated user', async () => {
      const mockUser = { id: 'user-1', email: 'user@example.com' };
      const mockPreferences = {
        userId: 'user-2', // Different user ID
        roleRequests: { email: true, inApp: true, sms: false },
        roleAssignments: { email: true, inApp: true, sms: false },
        temporaryRoles: { email: true, inApp: true, sms: false, reminderDays: [7, 3, 1] },
        adminNotifications: { email: true, inApp: true, sms: false, digestFrequency: 'daily' as const }
      };

      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const request = new NextRequest('http://localhost/api/roles/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences: mockPreferences })
      });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid preferences data');
    });

    it('should return 401 when user is not authenticated', async () => {
      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Not authenticated') });

      const request = new NextRequest('http://localhost/api/roles/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences: {} })
      });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });
});

describe('/api/roles/notifications/process', () => {
  let mockRoleNotificationService: jest.Mocked<RoleNotificationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleNotificationService = new RoleNotificationService() as jest.Mocked<RoleNotificationService>;
    (RoleNotificationService as jest.Mock).mockImplementation(() => mockRoleNotificationService);
  });

  describe('POST', () => {
    it('should process scheduled notifications with valid cron secret', async () => {
      process.env.CRON_SECRET = 'test-secret';
      mockRoleNotificationService.processScheduledRoleNotifications.mockResolvedValue();

      const request = new NextRequest('http://localhost/api/roles/notifications/process', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Scheduled role notifications processed successfully');
      expect(mockRoleNotificationService.processScheduledRoleNotifications).toHaveBeenCalled();
    });

    it('should process notifications when called by system admin', async () => {
      delete process.env.CRON_SECRET;
      const mockUser = { id: 'admin-1', email: 'admin@example.com' };
      const mockRoleAssignment = { role: 'system_admin' };

      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockRoleAssignment, error: null })
              })
            })
          })
        })
      });

      mockRoleNotificationService.processScheduledRoleNotifications.mockResolvedValue();

      const request = new NextRequest('http://localhost/api/roles/notifications/process', {
        method: 'POST'
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockRoleNotificationService.processScheduledRoleNotifications).toHaveBeenCalled();
    });

    it('should return 401 when no valid authorization', async () => {
      delete process.env.CRON_SECRET;
      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Not authenticated') });

      const request = new NextRequest('http://localhost/api/roles/notifications/process', {
        method: 'POST'
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 when user is not system admin', async () => {
      delete process.env.CRON_SECRET;
      const mockUser = { id: 'user-1', email: 'user@example.com' };

      const { createClient } = require('@/lib/supabase/server');
      const mockSupabase = createClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          })
        })
      });

      const request = new NextRequest('http://localhost/api/roles/notifications/process', {
        method: 'POST'
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Insufficient permissions');
    });

    it('should return 500 when service throws error', async () => {
      process.env.CRON_SECRET = 'test-secret';
      mockRoleNotificationService.processScheduledRoleNotifications.mockRejectedValue(new Error('Processing error'));

      const request = new NextRequest('http://localhost/api/roles/notifications/process', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to process scheduled role notifications');
    });
  });
});