import { NextRequest } from 'next/server';
import { PUT } from '@/app/api/onboarding/update/route';
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
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    }))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('/api/onboarding/update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update onboarding progress successfully', async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    // Mock existing session
    const existingSession = {
      id: 'session-123',
      user_id: 'user-123',
      current_step: 1,
      total_steps: 5,
      data: { userId: 'user-123', currentStep: 1 }
    };

    const updatedSession = {
      ...existingSession,
      current_step: 2,
      data: { userId: 'user-123', currentStep: 2, role: 'student' }
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
          })),
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: updatedSession,
                  error: null
                })
              }))
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

    const requestBody = {
      currentStep: 2,
      data: { role: 'student' }
    };

    const request = new NextRequest('http://localhost:3000/api/onboarding/update', {
      method: 'PUT',
      body: JSON.stringify(requestBody)
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.session.currentStep).toBe(2);
    expect(data.data.session.data.role).toBe('student');
    expect(data.data.message).toBe('Onboarding progress updated successfully');
  });

  it('should validate current step parameter', async () => {
    const requestBody = {
      currentStep: -1 // Invalid step
    };

    const request = new NextRequest('http://localhost:3000/api/onboarding/update', {
      method: 'PUT',
      body: JSON.stringify(requestBody)
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Current step must be an integer between 0 and 10');
  });

  it('should validate onboarding data', async () => {
    const requestBody = {
      data: {
        role: 'invalid_role', // Invalid role
        classCode: '123' // Too short
      }
    };

    const request = new NextRequest('http://localhost:3000/api/onboarding/update', {
      method: 'PUT',
      body: JSON.stringify(requestBody)
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid onboarding data');
    expect(data.details).toContain('Invalid role specified');
    expect(data.details).toContain('Class code must be at least 6 characters');
  });

  it('should create new session if none exists', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });

    const newSession = {
      id: 'session-123',
      user_id: 'user-123',
      current_step: 1,
      total_steps: 5,
      data: { userId: 'user-123', currentStep: 1, role: 'teacher' }
    };

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
                data: newSession,
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

    const requestBody = {
      currentStep: 1,
      data: { role: 'teacher' }
    };

    const request = new NextRequest('http://localhost:3000/api/onboarding/update', {
      method: 'PUT',
      body: JSON.stringify(requestBody)
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.session.currentStep).toBe(1);
    expect(data.data.session.data.role).toBe('teacher');
  });

  it('should return 401 for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' }
    });

    const requestBody = { currentStep: 1 };

    const request = new NextRequest('http://localhost:3000/api/onboarding/update', {
      method: 'PUT',
      body: JSON.stringify(requestBody)
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should handle invalid JSON body', async () => {
    const request = new NextRequest('http://localhost:3000/api/onboarding/update', {
      method: 'PUT',
      body: 'invalid json'
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Internal server error');
  });

  it('should handle database update errors', async () => {
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
                data: { id: 'session-123', user_id: 'user-123' },
                error: null
              })
            }))
          })),
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Update failed' }
                })
              }))
            }))
          }))
        };
      }
      return {};
    });

    const requestBody = { currentStep: 2 };

    const request = new NextRequest('http://localhost:3000/api/onboarding/update', {
      method: 'PUT',
      body: JSON.stringify(requestBody)
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to update onboarding session');
  });
});