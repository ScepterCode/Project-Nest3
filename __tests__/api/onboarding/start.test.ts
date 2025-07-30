import { NextRequest } from 'next/server';
import { POST } from '@/app/api/onboarding/start/route';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase
jest.mock('@/lib/supabase/server');
const mockSupabase = {
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
    })),
    update: jest.fn(() => ({
      eq: jest.fn()
    }))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('/api/onboarding/start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should start new onboarding session successfully', async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    // Mock no existing session
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' } // No rows found
              })
            }))
          })),
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'session-123',
                  user_id: 'user-123',
                  current_step: 0,
                  total_steps: 5,
                  data: { userId: 'user-123', currentStep: 0, skippedSteps: [] },
                  started_at: '2024-01-01T00:00:00Z',
                  completed_at: null,
                  last_activity: '2024-01-01T00:00:00Z'
                },
                error: null
              })
            }))
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

    const request = new NextRequest('http://localhost:3000/api/onboarding/start', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.session.id).toBe('session-123');
    expect(data.data.session.currentStep).toBe(0);
    expect(data.data.message).toBe('Onboarding session started successfully');
  });

  it('should return existing incomplete session', async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    // Mock existing incomplete session
    const existingSession = {
      id: 'session-123',
      user_id: 'user-123',
      current_step: 2,
      total_steps: 5,
      data: { userId: 'user-123', currentStep: 2, role: 'student' },
      started_at: '2024-01-01T00:00:00Z',
      completed_at: null,
      last_activity: '2024-01-01T01:00:00Z'
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: existingSession,
                error: null
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/start', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.session.currentStep).toBe(2);
    expect(data.data.message).toBe('Existing onboarding session found');
  });

  it('should return 401 for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' }
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/start', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Authentication failed');
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
                error: { message: 'Database connection error' }
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/start', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to check existing onboarding session');
  });

  it('should handle session creation failure', async () => {
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
                error: { code: 'PGRST116' }
              })
            }))
          })),
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Insert failed' }
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/start', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to create onboarding session');
  });
});