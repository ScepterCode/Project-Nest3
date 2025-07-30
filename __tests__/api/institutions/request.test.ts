import { POST } from '@/app/api/institutions/request/route';
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
        single: jest.fn()
      }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    }))
  }))
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('/api/institutions/request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
  });

  it('should create institution request successfully', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const requestData = {
      name: 'New University',
      domain: 'newuni.edu',
      type: 'university',
      contactEmail: 'admin@newuni.edu',
      description: 'A new university for testing'
    };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock no existing institution
    const mockSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' } // Not found
    });
    const mockIlike = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });

    // Mock successful insert
    const mockInsertSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'request-123',
        name: requestData.name,
        status: 'pending'
      },
      error: null
    });
    const mockInsertSelect = jest.fn().mockReturnValue({ single: mockInsertSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockInsertSelect });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        return { select: mockSelect };
      } else if (table === 'institution_requests') {
        return { insert: mockInsert };
      }
      return {};
    });

    const request = new NextRequest('http://localhost/api/institutions/request', {
      method: 'POST',
      body: JSON.stringify(requestData)
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('request-123');
    expect(data.data.message).toContain('submitted successfully');

    expect(mockInsert).toHaveBeenCalledWith([{
      name: requestData.name,
      domain: requestData.domain,
      type: requestData.type,
      contact_email: requestData.contactEmail,
      description: requestData.description,
      requested_by: mockUser.id,
      status: 'pending',
      created_at: expect.any(String)
    }]);
  });

  it('should return 401 for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' }
    });

    const request = new NextRequest('http://localhost/api/institutions/request', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test University' })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 400 for missing institution name', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    const request = new NextRequest('http://localhost/api/institutions/request', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Institution name is required');
  });

  it('should return 400 for institution name too short', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    const request = new NextRequest('http://localhost/api/institutions/request', {
      method: 'POST',
      body: JSON.stringify({ name: 'A' })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('must be at least 2 characters long');
  });

  it('should return 409 for existing institution name', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock existing institution
    const mockSingle = jest.fn().mockResolvedValue({
      data: { id: 'existing-123', name: 'Existing University' },
      error: null
    });
    const mockIlike = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        return { select: mockSelect };
      }
      return {};
    });

    const request = new NextRequest('http://localhost/api/institutions/request', {
      method: 'POST',
      body: JSON.stringify({ name: 'Existing University' })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('An institution with this name already exists');
  });

  it('should handle database errors gracefully', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock no existing institution
    const mockSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' }
    });
    const mockIlike = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });

    // Mock database error on insert
    const mockInsertSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Database error' }
    });
    const mockInsertSelect = jest.fn().mockReturnValue({ single: mockInsertSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockInsertSelect });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        return { select: mockSelect };
      } else if (table === 'institution_requests') {
        return { insert: mockInsert };
      }
      return {};
    });

    const request = new NextRequest('http://localhost/api/institutions/request', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test University' })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to submit institution request');
  });

  it('should handle minimal request data', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock no existing institution
    const mockSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' }
    });
    const mockIlike = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });

    // Mock successful insert
    const mockInsertSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'request-123',
        name: 'Minimal University',
        status: 'pending'
      },
      error: null
    });
    const mockInsertSelect = jest.fn().mockReturnValue({ single: mockInsertSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockInsertSelect });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        return { select: mockSelect };
      } else if (table === 'institution_requests') {
        return { insert: mockInsert };
      }
      return {};
    });

    const request = new NextRequest('http://localhost/api/institutions/request', {
      method: 'POST',
      body: JSON.stringify({ name: 'Minimal University' })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    expect(mockInsert).toHaveBeenCalledWith([{
      name: 'Minimal University',
      domain: null,
      type: 'other',
      contact_email: null,
      description: null,
      requested_by: mockUser.id,
      status: 'pending',
      created_at: expect.any(String)
    }]);
  });

  it('should trim whitespace from input fields', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Mock no existing institution
    const mockSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' }
    });
    const mockIlike = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });

    // Mock successful insert
    const mockInsertSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'request-123',
        name: 'Trimmed University',
        status: 'pending'
      },
      error: null
    });
    const mockInsertSelect = jest.fn().mockReturnValue({ single: mockInsertSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockInsertSelect });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'institutions') {
        return { select: mockSelect };
      } else if (table === 'institution_requests') {
        return { insert: mockInsert };
      }
      return {};
    });

    const request = new NextRequest('http://localhost/api/institutions/request', {
      method: 'POST',
      body: JSON.stringify({
        name: '  Trimmed University  ',
        domain: '  trimmed.edu  ',
        contactEmail: '  admin@trimmed.edu  ',
        description: '  A university with spaces  '
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    expect(mockInsert).toHaveBeenCalledWith([{
      name: 'Trimmed University',
      domain: 'trimmed.edu',
      type: 'other',
      contact_email: 'admin@trimmed.edu',
      description: 'A university with spaces',
      requested_by: mockUser.id,
      status: 'pending',
      created_at: expect.any(String)
    }]);
  });
});