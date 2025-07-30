import { GET } from '@/app/api/institutions/search/route';
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
      ilike: jest.fn(() => ({
        eq: jest.fn(() => ({
          limit: jest.fn(() => ({
            // This will be mocked per test
          }))
        }))
      }))
    }))
  }))
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('/api/institutions/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
  });

  it('returns 400 for queries shorter than 2 characters', async () => {
    const request = new NextRequest('http://localhost/api/institutions/search?q=a');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Query must be at least 2 characters long');
  });

  it('returns 400 for missing query parameter', async () => {
    const request = new NextRequest('http://localhost/api/institutions/search');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Query must be at least 2 characters long');
  });

  it('returns 401 for unauthenticated users', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Not authenticated')
    });

    const request = new NextRequest('http://localhost/api/institutions/search?q=university');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns search results for authenticated users', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const mockInstitutions = [
      {
        id: '1',
        name: 'University of Example',
        domain: 'example.edu',
        type: 'university',
        status: 'active',
        departments: [{ count: 15 }],
        users: [{ count: 1200 }]
      },
      {
        id: '2',
        name: 'Example College',
        domain: 'college.edu',
        type: 'college',
        status: 'active',
        departments: [{ count: 8 }],
        users: [{ count: 500 }]
      }
    ];

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock the query chain
    const mockLimit = jest.fn().mockResolvedValue({
      data: mockInstitutions,
      error: null
    });
    const mockEq = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockIlike = jest.fn().mockReturnValue({ eq: mockEq });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });
    mockSupabase.from.mockReturnValue({ select: mockSelect });

    const request = new NextRequest('http://localhost/api/institutions/search?q=university');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.data[0]).toEqual({
      id: '1',
      name: 'University of Example',
      domain: 'example.edu',
      type: 'university',
      departmentCount: 15,
      userCount: 1200
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('institutions');
    expect(mockIlike).toHaveBeenCalledWith('name', '%university%');
    expect(mockEq).toHaveBeenCalledWith('status', 'active');
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('handles database errors gracefully', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock database error
    const mockLimit = jest.fn().mockResolvedValue({
      data: null,
      error: new Error('Database connection failed')
    });
    const mockEq = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockIlike = jest.fn().mockReturnValue({ eq: mockEq });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });
    mockSupabase.from.mockReturnValue({ select: mockSelect });

    const request = new NextRequest('http://localhost/api/institutions/search?q=university');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to search institutions');
  });

  it('handles empty search results', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock empty results
    const mockLimit = jest.fn().mockResolvedValue({
      data: [],
      error: null
    });
    const mockEq = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockIlike = jest.fn().mockReturnValue({ eq: mockEq });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });
    mockSupabase.from.mockReturnValue({ select: mockSelect });

    const request = new NextRequest('http://localhost/api/institutions/search?q=nonexistent');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
  });

  it('properly encodes search query', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    const mockLimit = jest.fn().mockResolvedValue({
      data: [],
      error: null
    });
    const mockEq = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockIlike = jest.fn().mockReturnValue({ eq: mockEq });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });
    mockSupabase.from.mockReturnValue({ select: mockSelect });

    const request = new NextRequest('http://localhost/api/institutions/search?q=University%20of%20California');
    
    await GET(request);
    
    expect(mockIlike).toHaveBeenCalledWith('name', '%University of California%');
  });
});