import { POST } from '@/app/api/classes/join/route';
import { NextRequest } from 'next/server';
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
        eq: jest.fn(() => ({
          single: jest.fn()
        })),
        single: jest.fn()
      })),
      single: jest.fn()
    })),
    insert: jest.fn(() => ({
      // This will be mocked per test
    }))
  }))
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('/api/classes/join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
  });

  it('returns 400 for missing class code', async () => {
    const request = new NextRequest('http://localhost/api/classes/join', {
      method: 'POST',
      body: JSON.stringify({ userId: 'user-1' })
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Class code and user ID are required');
  });

  it('returns 400 for invalid class code format', async () => {
    const request = new NextRequest('http://localhost/api/classes/join', {
      method: 'POST',
      body: JSON.stringify({ classCode: 'AB', userId: 'user-1' })
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid class code format');
  });

  it('returns 401 for unauthenticated users', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Not authenticated')
    });

    const request = new NextRequest('http://localhost/api/classes/join', {
      method: 'POST',
      body: JSON.stringify({ classCode: 'CS101', userId: 'user-1' })
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('successfully joins a class', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const mockClass = {
      id: 'class-1',
      name: 'Introduction to Computer Science',
      code: 'CS101',
      description: 'Learn the fundamentals',
      teacher_id: 'teacher-1',
      institution_id: 'institution-1',
      department_id: 'department-1',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      teacher: {
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com'
      },
      enrollments: [{ count: 25 }]
    };
    
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock successful flow
    const mockClassSingle = jest.fn().mockResolvedValue({
      data: mockClass,
      error: null
    });
    const mockEnrollmentSingle = jest.fn().mockResolvedValue({
      data: null,
      error: new Error('Not found')
    });
    const mockSettingsSingle = jest.fn().mockResolvedValue({
      data: null,
      error: new Error('Not found')
    });
    const mockInsert = jest.fn().mockResolvedValue({
      data: [{ id: 'enrollment-1' }],
      error: null
    });

    // Setup mock chain
    mockSupabase.from
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: mockClassSingle
            })
          })
        })
      })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: mockEnrollmentSingle
            })
          })
        })
      })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: mockSettingsSingle
          })
        })
      })
      .mockReturnValueOnce({
        insert: mockInsert
      });

    const request = new NextRequest('http://localhost/api/classes/join', {
      method: 'POST',
      body: JSON.stringify({ classCode: 'CS101', userId: 'user-1' })
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.class.name).toBe('Introduction to Computer Science');
    expect(data.data.class.teacherName).toBe('Jane Smith');
    expect(data.message).toBe('Successfully joined the class!');
  });

  it('handles database errors gracefully', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock database error
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: jest.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      })
    });

    const request = new NextRequest('http://localhost/api/classes/join', {
      method: 'POST',
      body: JSON.stringify({ classCode: 'CS101', userId: 'user-1' })
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Internal server error');
  });
});