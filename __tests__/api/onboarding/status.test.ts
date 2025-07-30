import { NextRequest } from 'next/server';
import { GET } from '@/app/api/onboarding/status/route';
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
    }))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('/api/onboarding/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return complete onboarding status', async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    // Mock user profile
    const userProfile = {
      onboarding_completed: true,
      onboarding_step: 5,
      onboarding_data: { role: 'student' },
      role: 'student',
      institution_id: 'inst-123',
      department_id: 'dept-123'
    };

    // Mock session
    const session = {
      id: 'session-123',
      user_id: 'user-123',
      current_step: 5,
      total_steps: 5,
      data: { role: 'student', institutionId: 'inst-123' },
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T01:00:00Z',
      last_activity: '2024-01-01T01:00:00Z'
    };

    // Mock institution and department
    const institution = { name: 'Test University' };
    const department = { name: 'Computer Science' };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: userProfile,
                error: null
              })
            }))
          }))
        };
      } else if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: session,
                error: null
              })
            }))
          }))
        };
      } else if (table === 'institutions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: institution,
                error: null
              })
            }))
          }))
        };
      } else if (table === 'departments') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: department,
                error: null
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/status', {
      method: 'GET'
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.isComplete).toBe(true);
    expect(data.data.currentStep).toBe(5);
    expect(data.data.totalSteps).toBe(5);
    expect(data.data.needsOnboarding).toBe(false);
    expect(data.data.user.role).toBe('student');
    expect(data.data.user.institutionName).toBe('Test University');
    expect(data.data.user.departmentName).toBe('Computer Science');
    expect(data.data.session.id).toBe('session-123');
  });

  it('should return incomplete onboarding status', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    const userProfile = {
      onboarding_completed: false,
      onboarding_step: 2,
      onboarding_data: {},
      role: null,
      institution_id: null,
      department_id: null
    };

    const session = {
      id: 'session-123',
      user_id: 'user-123',
      current_step: 2,
      total_steps: 5,
      data: { userId: 'user-123', currentStep: 2 },
      started_at: '2024-01-01T00:00:00Z',
      completed_at: null,
      last_activity: '2024-01-01T00:30:00Z'
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: userProfile,
                error: null
              })
            }))
          }))
        };
      } else if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: session,
                error: null
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/status', {
      method: 'GET'
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.isComplete).toBe(false);
    expect(data.data.currentStep).toBe(2);
    expect(data.data.needsOnboarding).toBe(true);
    expect(data.data.user.role).toBe(null);
    expect(data.data.user.institutionName).toBe(null);
    expect(data.data.session.completedAt).toBe(null);
  });

  it('should handle missing session gracefully', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    const userProfile = {
      onboarding_completed: false,
      onboarding_step: 0,
      onboarding_data: {},
      role: null,
      institution_id: null,
      department_id: null
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: userProfile,
                error: null
              })
            }))
          }))
        };
      } else if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' } // No rows found
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/status', {
      method: 'GET'
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.isComplete).toBe(false);
    expect(data.data.currentStep).toBe(0);
    expect(data.data.totalSteps).toBe(5);
    expect(data.data.session).toBe(null);
  });

  it('should return 401 for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' }
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/status', {
      method: 'GET'
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should handle user profile fetch errors', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
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

    const request = new NextRequest('http://localhost:3000/api/onboarding/status', {
      method: 'GET'
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch user profile');
  });

  it('should handle missing user profile gracefully', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' } // No rows found
              })
            }))
          }))
        };
      } else if (table === 'onboarding_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' }
              })
            }))
          }))
        };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/onboarding/status', {
      method: 'GET'
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.isComplete).toBe(false);
    expect(data.data.currentStep).toBe(0);
    expect(data.data.user.role).toBe(undefined);
  });
});