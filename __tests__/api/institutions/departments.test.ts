import { GET } from '@/app/api/institutions/[id]/departments/route';
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
        single: jest.fn(),
        order: jest.fn()
      }))
    }))
  }))
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('/api/institutions/[id]/departments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
  });

  it('should return departments for valid institution', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const institutionId = 'inst-123';
    
    const mockInstitution = {
      id: institutionId,
      name: 'Test University',
      status: 'active'
    };

    const mockDepartments = [
      {
        id: 'dept-1',
        name: 'Computer Science',
        code: 'CS',
        description: 'Computer Science Department',
        admin_id: 'admin-1',
        users: [{ count: 150 }],
        admin: {
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@test.edu'
        }
      },
      {
        id: 'dept-2',
        name: 'Mathematics',
        code: 'MATH',
        description: 'Mathematics Department',
        admin_id: 'admin-2',
        users: [{ count: 80 }],
        admin: {
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane.smith@test.edu'
        }
      }
    ];

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        const mockSingle = jest.fn().mockResolvedValue({
          data: mockInstitution,
          error: null
        });
        const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      } else if (table === 'departments') {
        const mockOrder = jest.fn().mockResolvedValue({
          data: mockDepartments,
          error: null
        });
        const mockEq2 = jest.fn().mockReturnValue({ order: mockOrder });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      }
      return {};
    });

    const request = new NextRequest(`http://localhost/api/institutions/${institutionId}/departments`);
    const response = await GET(request, { params: { id: institutionId } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.institution).toEqual({
      id: institutionId,
      name: 'Test University'
    });
    expect(data.data.departments).toHaveLength(2);
    expect(data.data.departments[0]).toEqual({
      id: 'dept-1',
      name: 'Computer Science',
      code: 'CS',
      description: 'Computer Science Department',
      userCount: 150,
      adminName: 'John Doe'
    });
    expect(data.data.departments[1]).toEqual({
      id: 'dept-2',
      name: 'Mathematics',
      code: 'MATH',
      description: 'Mathematics Department',
      userCount: 80,
      adminName: 'Jane Smith'
    });
  });

  it('should return 400 for missing institution ID', async () => {
    const request = new NextRequest('http://localhost/api/institutions//departments');
    const response = await GET(request, { params: { id: '' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Institution ID is required');
  });

  it('should return 401 for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' }
    });

    const request = new NextRequest('http://localhost/api/institutions/inst-123/departments');
    const response = await GET(request, { params: { id: 'inst-123' } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 404 for non-existent institution', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        const mockSingle = jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows found' }
        });
        const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      }
      return {};
    });

    const request = new NextRequest('http://localhost/api/institutions/nonexistent/departments');
    const response = await GET(request, { params: { id: 'nonexistent' } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Institution not found or inactive');
  });

  it('should return 404 for inactive institution', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        const mockSingle = jest.fn().mockResolvedValue({
          data: null, // No active institution found
          error: null
        });
        const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      }
      return {};
    });

    const request = new NextRequest('http://localhost/api/institutions/inactive-123/departments');
    const response = await GET(request, { params: { id: 'inactive-123' } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Institution not found or inactive');
  });

  it('should handle empty departments list', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const institutionId = 'inst-123';
    
    const mockInstitution = {
      id: institutionId,
      name: 'New University',
      status: 'active'
    };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        const mockSingle = jest.fn().mockResolvedValue({
          data: mockInstitution,
          error: null
        });
        const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      } else if (table === 'departments') {
        const mockOrder = jest.fn().mockResolvedValue({
          data: [],
          error: null
        });
        const mockEq2 = jest.fn().mockReturnValue({ order: mockOrder });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      }
      return {};
    });

    const request = new NextRequest(`http://localhost/api/institutions/${institutionId}/departments`);
    const response = await GET(request, { params: { id: institutionId } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.departments).toEqual([]);
  });

  it('should handle departments without admin info', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const institutionId = 'inst-123';
    
    const mockInstitution = {
      id: institutionId,
      name: 'Test University',
      status: 'active'
    };

    const mockDepartments = [
      {
        id: 'dept-1',
        name: 'Computer Science',
        code: 'CS',
        description: 'Computer Science Department',
        admin_id: null,
        users: [{ count: 0 }],
        admin: null
      }
    ];

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        const mockSingle = jest.fn().mockResolvedValue({
          data: mockInstitution,
          error: null
        });
        const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      } else if (table === 'departments') {
        const mockOrder = jest.fn().mockResolvedValue({
          data: mockDepartments,
          error: null
        });
        const mockEq2 = jest.fn().mockReturnValue({ order: mockOrder });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      }
      return {};
    });

    const request = new NextRequest(`http://localhost/api/institutions/${institutionId}/departments`);
    const response = await GET(request, { params: { id: institutionId } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.departments[0]).toEqual({
      id: 'dept-1',
      name: 'Computer Science',
      code: 'CS',
      description: 'Computer Science Department',
      userCount: 0,
      adminName: undefined
    });
  });

  it('should handle database errors gracefully', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const institutionId = 'inst-123';
    
    const mockInstitution = {
      id: institutionId,
      name: 'Test University',
      status: 'active'
    };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        const mockSingle = jest.fn().mockResolvedValue({
          data: mockInstitution,
          error: null
        });
        const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      } else if (table === 'departments') {
        const mockOrder = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' }
        });
        const mockEq2 = jest.fn().mockReturnValue({ order: mockOrder });
        const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
        return { select: mockSelect };
      }
      return {};
    });

    const request = new NextRequest(`http://localhost/api/institutions/${institutionId}/departments`);
    const response = await GET(request, { params: { id: institutionId } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch departments');
  });
});