/**
 * Bulk Role Assignment API Tests
 * 
 * Tests the API endpoints for bulk role assignment functionality,
 * including authentication, validation, and error handling.
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { NextRequest } = require('next/server');
const { POST, PUT } = require('@/app/api/roles/bulk-assign/route');
const { UserRole } = require('@/lib/types/role-management');

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    })),
    insert: jest.fn(() => Promise.resolve({ data: null, error: null }))
  })),
  rpc: jest.fn()
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabaseClient
}));

// Mock services
jest.mock('@/lib/services/bulk-role-assignment', () => ({
  BulkRoleAssignmentService: jest.fn().mockImplementation(() => ({
    processBulkAssignment: jest.fn(),
    parseFile: jest.fn()
  }))
}));

jest.mock('@/lib/services/role-manager', () => ({
  RoleManager: jest.fn().mockImplementation(() => ({}))
}));

describe('Bulk Role Assignment API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/roles/bulk-assign', () => {
    const validRequest = {
      assignments: [
        {
          email: 'user1@example.com',
          firstName: 'User',
          lastName: 'One',
          role: UserRole.STUDENT,
          institutionId: 'inst-123',
          justification: 'Test assignment'
        },
        {
          email: 'user2@example.com',
          firstName: 'User',
          lastName: 'Two',
          role: UserRole.TEACHER,
          institutionId: 'inst-123',
          departmentId: 'dept-456',
          justification: 'Teacher assignment'
        }
      ]
    };

    it('should successfully process bulk assignments', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      // Mock user permissions (institution admin)
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ role: UserRole.INSTITUTION_ADMIN, status: 'active' }],
                error: null
              })
            })
          })
        })
      });

      // Mock successful processing
      const mockBulkService = require('@/lib/services/bulk-role-assignment').BulkRoleAssignmentService;
      const mockInstance = new mockBulkService();
      mockInstance.processBulkAssignment.mockResolvedValue({
        successful: 2,
        failed: 0,
        errors: [],
        assignments: [
          { id: 'assign-1', userId: 'user-1', email: 'user1@example.com' },
          { id: 'assign-2', userId: 'user-2', email: 'user2@example.com' }
        ]
      });

      // Mock transaction functions
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: null, error: null }) // begin_transaction
        .mockResolvedValueOnce({ data: null, error: null }); // commit_transaction

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(validRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.result.successful).toBe(2);
      expect(data.result.failed).toBe(0);
      expect(data.result.total).toBe(2);
    });

    it('should reject unauthenticated requests', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      });

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(validRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject requests with insufficient permissions', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      });

      // Mock user without admin permissions
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ role: UserRole.STUDENT, status: 'active' }],
                error: null
              })
            })
          })
        })
      });

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(validRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Insufficient permissions for bulk role assignment');
    });

    it('should validate request structure', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      const invalidRequest = {
        assignments: 'not-an-array'
      };

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(invalidRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request: assignments array is required');
    });

    it('should reject empty assignments', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      const emptyRequest = {
        assignments: []
      };

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(emptyRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No assignments provided');
    });

    it('should reject too many assignments', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      const largeRequest = {
        assignments: Array.from({ length: 15000 }, (_, i) => ({
          email: `user${i}@example.com`,
          role: UserRole.STUDENT,
          institutionId: 'inst-123'
        }))
      };

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(largeRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Too many assignments. Maximum allowed: 10000');
    });

    it('should handle validation-only requests', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ role: UserRole.INSTITUTION_ADMIN, status: 'active' }],
                error: null
              })
            })
          })
        })
      });

      const mockBulkService = require('@/lib/services/bulk-role-assignment').BulkRoleAssignmentService;
      const mockInstance = new mockBulkService();
      mockInstance.processBulkAssignment.mockResolvedValue({
        successful: 2,
        failed: 0,
        errors: [],
        assignments: []
      });

      const validationRequest = {
        ...validRequest,
        validateOnly: true
      };

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(validationRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.result.validateOnly).toBe(true);
      expect(mockInstance.processBulkAssignment).toHaveBeenCalledWith(
        expect.any(Array),
        'inst-123',
        'admin-123',
        expect.objectContaining({ validateOnly: true })
      );
    });

    it('should handle processing errors gracefully', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ role: UserRole.INSTITUTION_ADMIN, status: 'active' }],
                error: null
              })
            })
          })
        })
      });

      const mockBulkService = require('@/lib/services/bulk-role-assignment').BulkRoleAssignmentService;
      const mockInstance = new mockBulkService();
      mockInstance.processBulkAssignment.mockResolvedValue({
        successful: 1,
        failed: 1,
        errors: [
          { index: 1, userId: 'user2@example.com', error: 'Invalid role assignment' }
        ],
        assignments: [
          { id: 'assign-1', userId: 'user-1', email: 'user1@example.com' }
        ]
      });

      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(validRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.result.successful).toBe(1);
      expect(data.result.failed).toBe(1);
      expect(data.result.errors).toHaveLength(1);
    });

    it('should handle transaction rollback on error', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ role: UserRole.INSTITUTION_ADMIN, status: 'active' }],
                error: null
              })
            })
          })
        })
      });

      const mockBulkService = require('@/lib/services/bulk-role-assignment').BulkRoleAssignmentService;
      const mockInstance = new mockBulkService();
      mockInstance.processBulkAssignment.mockRejectedValue(new Error('Processing failed'));

      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: null, error: null }) // begin_transaction
        .mockResolvedValueOnce({ data: null, error: null }); // rollback_transaction

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'POST',
        body: JSON.stringify(validRequest)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
      expect(data.message).toBe('Processing failed');
    });
  });

  describe('PUT /api/roles/bulk-assign (File Upload)', () => {
    it('should successfully parse uploaded file', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ role: UserRole.INSTITUTION_ADMIN, status: 'active' }],
                error: null
              })
            })
          })
        })
      });

      const mockBulkService = require('@/lib/services/bulk-role-assignment').BulkRoleAssignmentService;
      const mockInstance = new mockBulkService();
      mockInstance.parseFile.mockResolvedValue({
        data: [
          { email: 'user1@example.com', role: UserRole.STUDENT },
          { email: 'user2@example.com', role: UserRole.TEACHER }
        ],
        errors: [],
        warnings: []
      });

      const formData = new FormData();
      formData.append('file', new File(['email,role\nuser1@example.com,student'], 'test.csv'));
      formData.append('institutionId', 'inst-123');

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'PUT',
        body: formData
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.summary.isValid).toBe(true);
    });

    it('should reject file upload without authentication', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      });

      const formData = new FormData();
      formData.append('file', new File(['test'], 'test.csv'));
      formData.append('institutionId', 'inst-123');

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'PUT',
        body: formData
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject upload without file', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      const formData = new FormData();
      formData.append('institutionId', 'inst-123');

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'PUT',
        body: formData
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No file provided');
    });

    it('should reject upload without institution ID', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      const formData = new FormData();
      formData.append('file', new File(['test'], 'test.csv'));

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'PUT',
        body: formData
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Institution ID is required');
    });

    it('should handle file parsing errors', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ role: UserRole.INSTITUTION_ADMIN, status: 'active' }],
                error: null
              })
            })
          })
        })
      });

      const mockBulkService = require('@/lib/services/bulk-role-assignment').BulkRoleAssignmentService;
      const mockInstance = new mockBulkService();
      mockInstance.parseFile.mockResolvedValue({
        data: [],
        errors: [
          { row: 1, field: 'email', message: 'Invalid email format' }
        ],
        warnings: []
      });

      const formData = new FormData();
      formData.append('file', new File(['invalid data'], 'test.csv'));
      formData.append('institutionId', 'inst-123');

      const request = new NextRequest('http://localhost/api/roles/bulk-assign', {
        method: 'PUT',
        body: formData
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.errors).toHaveLength(1);
      expect(data.summary.isValid).toBe(false);
    });
  });
});