/**
 * Integration tests for institution management APIs
 * These tests verify that the institution search, request, and department APIs work together
 */

import { GET as searchInstitutions } from '@/app/api/institutions/search/route';
import { POST as requestInstitution } from '@/app/api/institutions/request/route';
import { GET as getDepartments } from '@/app/api/institutions/[id]/departments/route';
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
          limit: jest.fn(),
          single: jest.fn(),
          order: jest.fn()
        }))
      })),
      eq: jest.fn(() => ({
        single: jest.fn(),
        order: jest.fn()
      })),
      single: jest.fn()
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    }))
  }))
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('Institution Management Integration', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockUserProfile = { role: 'student', institution_id: null };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
    
    // Default auth setup
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });
  });

  describe('Institution Search Flow', () => {
    it('should allow users to search for institutions during onboarding', async () => {
      const mockInstitutions = [
        {
          id: 'inst-1',
          name: 'University of Example',
          domain: 'example.edu',
          type: 'university',
          status: 'active',
          departments: [{ count: 15 }],
          users: [{ count: 1200 }]
        }
      ];

      // Mock user profile lookup
      const mockProfileSingle = jest.fn().mockResolvedValue({
        data: mockUserProfile,
        error: null
      });
      const mockProfileEq = jest.fn().mockReturnValue({ single: mockProfileSingle });
      const mockProfileSelect = jest.fn().mockReturnValue({ eq: mockProfileEq });

      // Mock institution search
      const mockLimit = jest.fn().mockResolvedValue({
        data: mockInstitutions,
        error: null
      });
      const mockEq = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockIlike = jest.fn().mockReturnValue({ eq: mockEq });
      const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return { select: mockProfileSelect };
        } else if (table === 'institutions') {
          return { select: mockSelect };
        }
        return {};
      });

      const request = new NextRequest('http://localhost/api/institutions/search?q=university');
      const response = await searchInstitutions(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('University of Example');
    });

    it('should allow users to request new institution if not found', async () => {
      const requestData = {
        name: 'New University',
        domain: 'newuni.edu',
        type: 'university',
        contactEmail: 'admin@newuni.edu'
      };

      // Mock user profile lookup
      const mockProfileSingle = jest.fn().mockResolvedValue({
        data: mockUserProfile,
        error: null
      });
      const mockProfileEq = jest.fn().mockReturnValue({ single: mockProfileSingle });
      const mockProfileSelect = jest.fn().mockReturnValue({ eq: mockProfileEq });

      // Mock no existing institution
      const mockExistingSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });
      const mockExistingIlike = jest.fn().mockReturnValue({ single: mockExistingSingle });
      const mockExistingSelect = jest.fn().mockReturnValue({ ilike: mockExistingIlike });

      // Mock successful request creation
      const mockInsertSingle = jest.fn().mockResolvedValue({
        data: { id: 'request-123', name: requestData.name, status: 'pending' },
        error: null
      });
      const mockInsertSelect = jest.fn().mockReturnValue({ single: mockInsertSingle });
      const mockInsert = jest.fn().mockReturnValue({ select: mockInsertSelect });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return { select: mockProfileSelect };
        } else if (table === 'institutions') {
          return { select: mockExistingSelect };
        } else if (table === 'institution_requests') {
          return { insert: mockInsert };
        }
        return {};
      });

      const request = new NextRequest('http://localhost/api/institutions/request', {
        method: 'POST',
        body: JSON.stringify(requestData)
      });

      const response = await requestInstitution(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('request-123');
    });
  });

  describe('Department Selection Flow', () => {
    it('should allow users to view departments after selecting institution', async () => {
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
          description: 'CS Department',
          admin_id: 'admin-1',
          users: [{ count: 150 }],
          admin: { first_name: 'John', last_name: 'Doe', email: 'john@test.edu' }
        }
      ];

      // Mock user profile lookup
      const mockProfileSingle = jest.fn().mockResolvedValue({
        data: mockUserProfile,
        error: null
      });
      const mockProfileEq = jest.fn().mockReturnValue({ single: mockProfileSingle });
      const mockProfileSelect = jest.fn().mockReturnValue({ eq: mockProfileEq });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return { select: mockProfileSelect };
        } else if (table === 'institutions') {
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
      const response = await getDepartments(request, { params: { id: institutionId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.institution.name).toBe('Test University');
      expect(data.data.departments).toHaveLength(1);
      expect(data.data.departments[0].name).toBe('Computer Science');
    });
  });

  describe('Complete Onboarding Flow', () => {
    it('should support complete institution selection workflow', async () => {
      // This test simulates a complete flow:
      // 1. User searches for institution
      // 2. User selects institution
      // 3. User views departments
      // 4. User selects department

      const institutionId = 'inst-123';
      
      // Step 1: Search institutions
      const mockInstitutions = [{
        id: institutionId,
        name: 'Selected University',
        domain: 'selected.edu',
        type: 'university',
        status: 'active',
        departments: [{ count: 5 }],
        users: [{ count: 500 }]
      }];

      // Step 2: Get departments for selected institution
      const mockDepartments = [{
        id: 'dept-1',
        name: 'Engineering',
        code: 'ENG',
        description: 'Engineering Department',
        admin_id: 'admin-1',
        users: [{ count: 100 }],
        admin: { first_name: 'Jane', last_name: 'Smith', email: 'jane@selected.edu' }
      }];

      // Mock user profile lookup (used by both endpoints)
      const mockProfileSingle = jest.fn().mockResolvedValue({
        data: mockUserProfile,
        error: null
      });
      const mockProfileEq = jest.fn().mockReturnValue({ single: mockProfileSingle });
      const mockProfileSelect = jest.fn().mockReturnValue({ eq: mockProfileEq });

      // Mock search response
      const mockSearchLimit = jest.fn().mockResolvedValue({
        data: mockInstitutions,
        error: null
      });
      const mockSearchEq = jest.fn().mockReturnValue({ limit: mockSearchLimit });
      const mockSearchIlike = jest.fn().mockReturnValue({ eq: mockSearchEq });
      const mockSearchSelect = jest.fn().mockReturnValue({ ilike: mockSearchIlike });

      // Mock institution verification for departments endpoint
      const mockInstSingle = jest.fn().mockResolvedValue({
        data: { id: institutionId, name: 'Selected University', status: 'active' },
        error: null
      });
      const mockInstEq2 = jest.fn().mockReturnValue({ single: mockInstSingle });
      const mockInstEq1 = jest.fn().mockReturnValue({ eq: mockInstEq2 });
      const mockInstSelect = jest.fn().mockReturnValue({ eq: mockInstEq1 });

      // Mock departments response
      const mockDeptOrder = jest.fn().mockResolvedValue({
        data: mockDepartments,
        error: null
      });
      const mockDeptEq2 = jest.fn().mockReturnValue({ order: mockDeptOrder });
      const mockDeptEq1 = jest.fn().mockReturnValue({ eq: mockDeptEq2 });
      const mockDeptSelect = jest.fn().mockReturnValue({ eq: mockDeptEq1 });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return { select: mockProfileSelect };
        } else if (table === 'institutions') {
          // For search endpoint, return search mock
          // For departments endpoint, return institution verification mock
          return { select: mockSearchSelect };
        } else if (table === 'departments') {
          return { select: mockDeptSelect };
        }
        return {};
      });

      // Step 1: Search for institutions
      const searchRequest = new NextRequest('http://localhost/api/institutions/search?q=selected');
      const searchResponse = await searchInstitutions(searchRequest);
      const searchData = await searchResponse.json();

      expect(searchResponse.status).toBe(200);
      expect(searchData.success).toBe(true);
      expect(searchData.data[0].id).toBe(institutionId);

      // Reset mocks for departments call
      jest.clearAllMocks();
      mockCreateClient.mockReturnValue(mockSupabase as any);
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return { select: mockProfileSelect };
        } else if (table === 'institutions') {
          return { select: mockInstSelect };
        } else if (table === 'departments') {
          return { select: mockDeptSelect };
        }
        return {};
      });

      // Step 2: Get departments for selected institution
      const deptRequest = new NextRequest(`http://localhost/api/institutions/${institutionId}/departments`);
      const deptResponse = await getDepartments(deptRequest, { params: { id: institutionId } });
      const deptData = await deptResponse.json();

      expect(deptResponse.status).toBe(200);
      expect(deptData.success).toBe(true);
      expect(deptData.data.departments[0].id).toBe('dept-1');

      // Verify the complete flow provides necessary data for onboarding
      expect(searchData.data[0]).toHaveProperty('id');
      expect(searchData.data[0]).toHaveProperty('name');
      expect(deptData.data.departments[0]).toHaveProperty('id');
      expect(deptData.data.departments[0]).toHaveProperty('name');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors consistently across all endpoints', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' }
      });

      // Test search endpoint
      const searchRequest = new NextRequest('http://localhost/api/institutions/search?q=test');
      const searchResponse = await searchInstitutions(searchRequest);
      const searchData = await searchResponse.json();

      expect(searchResponse.status).toBe(401);
      expect(searchData.success).toBe(false);
      expect(searchData.error).toBe('Unauthorized');

      // Test request endpoint
      const requestRequest = new NextRequest('http://localhost/api/institutions/request', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test University' })
      });
      const requestResponse = await requestInstitution(requestRequest);
      const requestData = await requestResponse.json();

      expect(requestResponse.status).toBe(401);
      expect(requestData.success).toBe(false);
      expect(requestData.error).toBe('Unauthorized');

      // Test departments endpoint
      const deptRequest = new NextRequest('http://localhost/api/institutions/inst-123/departments');
      const deptResponse = await getDepartments(deptRequest, { params: { id: 'inst-123' } });
      const deptData = await deptResponse.json();

      expect(deptResponse.status).toBe(401);
      expect(deptData.success).toBe(false);
      expect(deptData.error).toBe('Unauthorized');
    });
  });
});