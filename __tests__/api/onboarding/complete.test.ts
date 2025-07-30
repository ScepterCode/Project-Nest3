import { NextRequest } from 'next/server';
import { POST } from '@/app/api/onboarding/complete/route';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase
jest.mock('@/lib/supabase/server');
const mockSupabase = {
  auth: {
    getUser: jest.fn(),
    updateUser: jest.fn()
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn()
    }))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('/api/onboarding/complete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should complete onboarding successfully', async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    // Mock onboarding session
    const mockSession = {
      id: 'session-123',
      user_id: 'user-123',
      data: {
        role: 'student',
        institutionId: 'inst-123',
        departmentId: 'dept-123'
      }
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: mockSession,
                error: null
              })
            }))
          })),
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null })
          }))
        };
      } else if (table === 'users') {
        return {
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null })
          }))
        };
      }
      return {};
    });

    mockSupabase.auth.updateUser.mockResolvedValue({ error: null });

    const request = new NextRequest('http://localhost:3000/api/onboarding/complete', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.message).toBe('Onboarding completed successfully');
    expect(data.data.user.role).toBe('student');
    expect(data.data.user.onboardingCompleted).toBe(true);
  });

  it('should return 401 for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' }
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/complete', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 404 when onboarding session not found', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116', message: 'No rows found' }
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/complete', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Onboarding session not found');
  });

  it('should prevent completing already completed onboarding', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    // Mock already completed session
    const completedSession = {
      id: 'session-123',
      user_id: 'user-123',
      data: { role: 'student' },
      completed_at: '2024-01-01T00:00:00Z'
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: completedSession,
                error: null
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/complete', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Onboarding already completed');
  });

  it('should require role selection to complete onboarding', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    // Mock session without role
    const incompleteSession = {
      id: 'session-123',
      user_id: 'user-123',
      data: { userId: 'user-123' }, // Missing role
      completed_at: null
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: incompleteSession,
                error: null
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/complete', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Role selection is required to complete onboarding');
  });

  it('should handle database errors gracefully', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database error' }
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/complete', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Onboarding session not found');
  });

});