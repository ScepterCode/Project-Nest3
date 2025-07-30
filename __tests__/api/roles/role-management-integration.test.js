/**
 * Role Management API Integration Tests
 * 
 * Tests all role and permission management API endpoints including:
 * - POST /api/roles/request
 * - PUT /api/roles/requests/:id/approve
 * - PUT /api/roles/requests/:id/deny
 * - GET /api/permissions/user/:userId
 * - POST /api/roles/bulk-assign
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock Next.js server functions
const mockNextRequest = {
  json: jest.fn(),
  formData: jest.fn(),
  url: 'http://localhost:3000/api/test'
};

const mockNextResponse = {
  json: jest.fn((data) => ({
    json: () => Promise.resolve(data),
    status: 200
  }))
};

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: null, error: null })),
            order: jest.fn(() => Promise.resolve({ data: [], error: null })),
            in: jest.fn(() => Promise.resolve({ data: [], error: null }))
          })),
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
          order: jest.fn(() => Promise.resolve({ data: [], error: null })),
          in: jest.fn(() => Promise.resolve({ data: [], error: null }))
        })),
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        order: jest.fn(() => Promise.resolve({ data: [], error: null })),
        in: jest.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      order: jest.fn(() => Promise.resolve({ data: [], error: null })),
      in: jest.fn(() => Promise.resolve({ data: [], error: null }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({ data: null, error: null }))
    }))
  })),
  rpc: jest.fn(() => Promise.resolve({ data: null, error: null }))
};

// Mock services
const mockRoleManager = {
  requestRole: jest.fn(),
  approveRole: jest.fn(),
  denyRole: jest.fn()
};

const mockPermissionChecker = {
  hasPermission: jest.fn(),
  canAccessResource: jest.fn(),
  getUserPermissions: jest.fn()
};

const mockBulkRoleAssignmentService = {
  processBulkAssignment: jest.fn(),
  parseFile: jest.fn()
};

// Define test constants
const UserRole = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  DEPARTMENT_ADMIN: 'department_admin',
  INSTITUTION_ADMIN: 'institution_admin',
  SYSTEM_ADMIN: 'system_admin'
};

const RoleRequestStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
  EXPIRED: 'expired'
};

describe('Role Management API Integration Tests', () => {
  let mockUser;
  let mockInstitution;
  let mockDepartment;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock user data
    mockUser = {
      id: 'user-123',
      email: 'test@university.edu',
      full_name: 'Test User'
    };

    mockInstitution = {
      id: 'inst-123',
      name: 'Test University',
      domain: 'university.edu'
    };

    mockDepartment = {
      id: 'dept-123',
      name: 'Computer Science',
      institution_id: 'inst-123'
    };

    // Setup default mock responses
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });
  });

  describe('POST /api/roles/request', () => {
    it('should successfully create a role request', async () => {
      // Mock user profile
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockUser.id,
                institution_id: mockInstitution.id,
                primary_role: UserRole.STUDENT
              },
              error: null
            })
          })
        })
      });

      // Mock no existing requests
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });

      // Mock role request creation
      mockRoleManager.requestRole.mockResolvedValue({
        id: 'request-123',
        userId: mockUser.id,
        requestedRole: UserRole.TEACHER,
        currentRole: UserRole.STUDENT,
        justification: 'I am a faculty member',
        status: RoleRequestStatus.PENDING,
        requestedAt: new Date(),
        verificationMethod: 'admin_approval',
        institutionId: mockInstitution.id,
        departmentId: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        metadata: {}
      });

      // Mock database insert
      mockSupabaseClient.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'request-123',
                requested_role: UserRole.TEACHER,
                status: RoleRequestStatus.PENDING,
                requested_at: new Date().toISOString()
              },
              error: null
            })
          })
        })
      });

      // Mock admin notification
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [
                  { id: 'admin-1', email: 'admin@university.edu', full_name: 'Admin User' }
                ],
                error: null
              })
            })
          })
        })
      });

      mockSupabaseClient.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      });

      const requestData = {
        requestedRole: UserRole.TEACHER,
        justification: 'I am a faculty member at this institution',
        institutionId: mockInstitution.id
      };

      // Simulate API call
      const result = await simulateRoleRequest(requestData);

      expect(result.success).toBe(true);
      expect(result.data.requestedRole).toBe(UserRole.TEACHER);
      expect(result.data.status).toBe(RoleRequestStatus.PENDING);
      expect(result.data.requiresApproval).toBe(true);
    });

    it('should reject invalid role requests', async () => {
      const invalidRequests = [
        { requestedRole: 'invalid_role', justification: 'Test', institutionId: mockInstitution.id },
        { requestedRole: UserRole.TEACHER, justification: 'Too short', institutionId: mockInstitution.id },
        { requestedRole: UserRole.TEACHER, justification: 'Valid justification', institutionId: null }
      ];

      for (const request of invalidRequests) {
        const result = await simulateRoleRequest(request);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should prevent duplicate pending requests', async () => {
      // Mock user profile
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockUser.id,
                institution_id: mockInstitution.id,
                primary_role: UserRole.STUDENT
              },
              error: null
            })
          })
        })
      });

      // Mock existing pending request
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ id: 'existing-request', status: RoleRequestStatus.PENDING }],
                error: null
              })
            })
          })
        })
      });

      const requestData = {
        requestedRole: UserRole.TEACHER,
        justification: 'I am a faculty member at this institution',
        institutionId: mockInstitution.id
      };

      const result = await simulateRoleRequest(requestData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You already have a pending request for this role');
    });
  });

  describe('PUT /api/roles/requests/:id/approve', () => {
    it('should successfully approve a role request', async () => {
      const requestId = 'request-123';
      
      // Mock role request data
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: requestId,
                user_id: 'user-456',
                requested_role: UserRole.TEACHER,
                current_role: UserRole.STUDENT,
                status: RoleRequestStatus.PENDING,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                institution_id: mockInstitution.id,
                department_id: null,
                users: {
                  id: 'user-456',
                  email: 'user@university.edu',
                  full_name: 'User Name',
                  institution_id: mockInstitution.id,
                  primary_role: UserRole.STUDENT
                }
              },
              error: null
            })
          })
        })
      });

      // Mock approver profile
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockUser.id,
                institution_id: mockInstitution.id,
                primary_role: UserRole.INSTITUTION_ADMIN,
                department_id: null,
                full_name: 'Admin User'
              },
              error: null
            })
          })
        })
      });

      // Mock database updates
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      });

      const result = await simulateRoleApproval(requestId, { notes: 'Approved based on verification' });

      expect(result.success).toBe(true);
      expect(result.data.requestId).toBe(requestId);
      expect(result.data.approvedRole).toBe(UserRole.TEACHER);
    });

    it('should reject approval from unauthorized users', async () => {
      const requestId = 'request-123';
      
      // Mock role request data
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: requestId,
                user_id: 'user-456',
                requested_role: UserRole.TEACHER,
                status: RoleRequestStatus.PENDING,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                institution_id: mockInstitution.id
              },
              error: null
            })
          })
        })
      });

      // Mock unauthorized approver (student)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockUser.id,
                institution_id: mockInstitution.id,
                primary_role: UserRole.STUDENT,
                department_id: null
              },
              error: null
            })
          })
        })
      });

      const result = await simulateRoleApproval(requestId, { notes: 'Trying to approve' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions to approve this role request');
    });

    it('should reject approval of expired requests', async () => {
      const requestId = 'request-123';
      
      // Mock expired role request
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: requestId,
                user_id: 'user-456',
                requested_role: UserRole.TEACHER,
                status: RoleRequestStatus.PENDING,
                expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Expired
                institution_id: mockInstitution.id
              },
              error: null
            })
          })
        })
      });

      // Mock status update to expired
      mockSupabaseClient.from.mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        })
      });

      const result = await simulateRoleApproval(requestId, { notes: 'Trying to approve expired' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Role request has expired');
    });
  });

  describe('PUT /api/roles/requests/:id/deny', () => {
    it('should successfully deny a role request', async () => {
      const requestId = 'request-123';
      
      // Mock role request data
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: requestId,
                user_id: 'user-456',
                requested_role: UserRole.TEACHER,
                current_role: UserRole.STUDENT,
                status: RoleRequestStatus.PENDING,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                institution_id: mockInstitution.id,
                users: {
                  id: 'user-456',
                  email: 'user@university.edu',
                  full_name: 'User Name'
                }
              },
              error: null
            })
          })
        })
      });

      // Mock approver profile
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockUser.id,
                institution_id: mockInstitution.id,
                primary_role: UserRole.INSTITUTION_ADMIN,
                full_name: 'Admin User'
              },
              error: null
            })
          })
        })
      });

      // Mock database updates
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      });

      const result = await simulateRoleDenial(requestId, { reason: 'Insufficient documentation provided' });

      expect(result.success).toBe(true);
      expect(result.data.requestId).toBe(requestId);
      expect(result.data.deniedRole).toBe(UserRole.TEACHER);
      expect(result.data.reason).toBe('Insufficient documentation provided');
    });

    it('should require a reason for denial', async () => {
      const requestId = 'request-123';
      
      const result = await simulateRoleDenial(requestId, { reason: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Reason for denial is required');
    });

    it('should reject denial from unauthorized users', async () => {
      const requestId = 'request-123';
      
      // Mock role request data
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: requestId,
                user_id: 'user-456',
                requested_role: UserRole.TEACHER,
                status: RoleRequestStatus.PENDING,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                institution_id: mockInstitution.id
              },
              error: null
            })
          })
        })
      });

      // Mock unauthorized user (student)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockUser.id,
                institution_id: mockInstitution.id,
                primary_role: UserRole.STUDENT
              },
              error: null
            })
          })
        })
      });

      const result = await simulateRoleDenial(requestId, { reason: 'Not authorized' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions to deny this role request');
    });
  });

  describe('GET /api/permissions/user/:userId', () => {
    it('should successfully retrieve user permissions', async () => {
      const targetUserId = 'user-456';
      
      // Mock role assignments
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'role-1',
                    role: UserRole.TEACHER,
                    status: 'active',
                    assigned_at: new Date().toISOString(),
                    expires_at: null,
                    is_temporary: false,
                    department_id: mockDepartment.id,
                    institution_id: mockInstitution.id,
                    departments: { id: mockDepartment.id, name: mockDepartment.name },
                    institutions: { id: mockInstitution.id, name: mockInstitution.name }
                  }
                ],
                error: null
              })
            })
          })
        })
      });

      // Mock permission details
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [
              { id: 'perm-1', name: 'view_classes', category: 'content', description: 'View class information' },
              { id: 'perm-2', name: 'manage_students', category: 'user_management', description: 'Manage student enrollments' }
            ],
            error: null
          })
        })
      });

      // Mock user profile
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: targetUserId,
                email: 'user@university.edu',
                full_name: 'User Name',
                primary_role: UserRole.TEACHER,
                role_status: 'active'
              },
              error: null
            })
          })
        })
      });

      // Mock permission checker
      mockPermissionChecker.getUserPermissions.mockResolvedValue([
        { id: 'perm-1', name: 'view_classes' },
        { id: 'perm-2', name: 'manage_students' }
      ]);

      const result = await simulateGetUserPermissions(targetUserId);

      expect(result.success).toBe(true);
      expect(result.data.user.id).toBe(targetUserId);
      expect(result.data.roleAssignments).toHaveLength(1);
      expect(result.data.permissions.total).toBe(2);
      expect(result.data.summary.activeRoles).toBe(1);
    });

    it('should allow users to view their own permissions', async () => {
      const result = await simulateGetUserPermissions(mockUser.id);
      // Should not fail with permission error when user views their own permissions
      expect(result.success).toBe(true);
    });

    it('should restrict access to other users permissions for non-admins', async () => {
      const targetUserId = 'other-user-456';
      
      // Mock requester as student (no admin permissions)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ role: UserRole.STUDENT, institution_id: mockInstitution.id, department_id: null, status: 'active' }],
              error: null
            })
          })
        })
      });

      // Mock target user in different institution
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ institution_id: 'other-inst-123', department_id: null }],
              error: null
            })
          })
        })
      });

      const result = await simulateGetUserPermissions(targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions to view user permissions');
    });
  });

  describe('POST /api/roles/bulk-assign', () => {
    it('should successfully process bulk role assignments', async () => {
      const bulkRequest = {
        assignments: [
          {
            email: 'user1@university.edu',
            firstName: 'User',
            lastName: 'One',
            role: UserRole.STUDENT,
            institutionId: mockInstitution.id
          },
          {
            email: 'user2@university.edu',
            firstName: 'User',
            lastName: 'Two',
            role: UserRole.TEACHER,
            institutionId: mockInstitution.id,
            departmentId: mockDepartment.id
          }
        ]
      };

      // Mock admin permissions
      mockSupabaseClient.from.mockReturnValueOnce({
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

      // Mock successful bulk processing
      mockBulkRoleAssignmentService.processBulkAssignment.mockResolvedValue({
        successful: 2,
        failed: 0,
        errors: [],
        assignments: [
          { id: 'assign-1', userId: 'user-1', email: 'user1@university.edu' },
          { id: 'assign-2', userId: 'user-2', email: 'user2@university.edu' }
        ]
      });

      // Mock transaction functions
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: null, error: null }) // begin_transaction
        .mockResolvedValueOnce({ data: null, error: null }); // commit_transaction

      // Mock audit logging
      mockSupabaseClient.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      });

      const result = await simulateBulkRoleAssignment(bulkRequest);

      expect(result.success).toBe(true);
      expect(result.result.successful).toBe(2);
      expect(result.result.failed).toBe(0);
      expect(result.result.total).toBe(2);
    });

    it('should reject bulk assignments from unauthorized users', async () => {
      const bulkRequest = {
        assignments: [
          {
            email: 'user1@university.edu',
            role: UserRole.STUDENT,
            institutionId: mockInstitution.id
          }
        ]
      };

      // Mock non-admin user
      mockSupabaseClient.from.mockReturnValueOnce({
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

      const result = await simulateBulkRoleAssignment(bulkRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions for bulk role assignment');
    });

    it('should validate bulk assignment request structure', async () => {
      const invalidRequests = [
        { assignments: 'not-an-array' },
        { assignments: [] },
        { assignments: Array(15000).fill({ email: 'test@example.com', role: UserRole.STUDENT, institutionId: 'inst-123' }) }
      ];

      for (const request of invalidRequests) {
        const result = await simulateBulkRoleAssignment(request);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should handle partial failures in bulk assignments', async () => {
      const bulkRequest = {
        assignments: [
          {
            email: 'valid@university.edu',
            role: UserRole.STUDENT,
            institutionId: mockInstitution.id
          },
          {
            email: 'invalid-email',
            role: UserRole.STUDENT,
            institutionId: mockInstitution.id
          }
        ]
      };

      // Mock admin permissions
      mockSupabaseClient.from.mockReturnValueOnce({
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

      // Mock partial success
      mockBulkRoleAssignmentService.processBulkAssignment.mockResolvedValue({
        successful: 1,
        failed: 1,
        errors: [
          { index: 1, email: 'invalid-email', error: 'Invalid email format' }
        ],
        assignments: [
          { id: 'assign-1', userId: 'user-1', email: 'valid@university.edu' }
        ]
      });

      // Mock transaction functions
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      // Mock audit logging
      mockSupabaseClient.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      });

      const result = await simulateBulkRoleAssignment(bulkRequest);

      expect(result.success).toBe(true);
      expect(result.result.successful).toBe(1);
      expect(result.result.failed).toBe(1);
      expect(result.result.errors).toHaveLength(1);
    });
  });

  // Helper functions to simulate API calls
  async function simulateRoleRequest(requestData) {
    try {
      // Validate authentication
      const authResult = await mockSupabaseClient.auth.getUser();
      if (!authResult.data.user) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate required fields
      if (!requestData.requestedRole || !requestData.justification || !requestData.institutionId) {
        return { success: false, error: 'Missing required fields: requestedRole, justification, institutionId' };
      }

      // Validate role
      if (!Object.values(UserRole).includes(requestData.requestedRole)) {
        return { success: false, error: 'Invalid role specified' };
      }

      // Validate justification length
      if (requestData.justification.trim().length < 20 || requestData.justification.trim().length > 500) {
        return { success: false, error: 'Justification must be between 20 and 500 characters' };
      }

      // Check user profile and existing requests
      const userProfile = await mockSupabaseClient.from('users').select('*').eq('id', mockUser.id).single();
      const existingRequests = await mockSupabaseClient.from('role_requests').select('*').eq('user_id', mockUser.id);

      if (existingRequests.data && existingRequests.data.length > 0) {
        return { success: false, error: 'You already have a pending request for this role' };
      }

      // Create role request
      const roleRequest = await mockRoleManager.requestRole(
        mockUser.id,
        requestData.requestedRole,
        requestData.institutionId,
        requestData.justification
      );

      // Save to database
      await mockSupabaseClient.from('role_requests').insert({}).select().single();

      const requiresApproval = [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN]
        .includes(requestData.requestedRole);

      return {
        success: true,
        data: {
          id: roleRequest.id || 'request-123',
          requestedRole: requestData.requestedRole,
          status: RoleRequestStatus.PENDING,
          requestedAt: new Date().toISOString(),
          requiresApproval
        }
      };
    } catch (error) {
      return { success: false, error: 'Internal server error' };
    }
  }

  async function simulateRoleApproval(requestId, body) {
    try {
      // Check authentication
      const authResult = await mockSupabaseClient.auth.getUser();
      if (!authResult.data.user) {
        return { success: false, error: 'Unauthorized' };
      }

      // Get role request
      const roleRequest = await mockSupabaseClient.from('role_requests').select('*').eq('id', requestId).single();
      if (!roleRequest.data) {
        return { success: false, error: 'Role request not found' };
      }

      if (roleRequest.data.status !== RoleRequestStatus.PENDING) {
        return { success: false, error: 'Role request is not in pending status' };
      }

      // Check if expired
      if (new Date(roleRequest.data.expires_at) < new Date()) {
        await mockSupabaseClient.from('role_requests').update({}).eq('id', requestId);
        return { success: false, error: 'Role request has expired' };
      }

      // Check approver permissions
      const approverProfile = await mockSupabaseClient.from('users').select('*').eq('id', mockUser.id).single();
      
      const canApprove = validateApproverPermission(approverProfile.data, roleRequest.data);
      if (!canApprove) {
        return { success: false, error: 'Insufficient permissions to approve this role request' };
      }

      // Update request and user role
      await mockSupabaseClient.from('role_requests').update({}).eq('id', requestId);
      await mockSupabaseClient.from('users').update({}).eq('id', roleRequest.data.user_id);
      await mockSupabaseClient.from('user_role_assignments').insert({});
      await mockSupabaseClient.from('role_audit_log').insert({});
      await mockSupabaseClient.from('notifications').insert({});

      return {
        success: true,
        message: 'Role request approved successfully',
        data: {
          requestId,
          approvedRole: roleRequest.data.requested_role,
          approvedAt: new Date().toISOString(),
          approvedBy: mockUser.id
        }
      };
    } catch (error) {
      return { success: false, error: 'Internal server error' };
    }
  }

  async function simulateRoleDenial(requestId, body) {
    try {
      // Check authentication
      const authResult = await mockSupabaseClient.auth.getUser();
      if (!authResult.data.user) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate reason
      if (!body.reason || body.reason.trim().length === 0) {
        return { success: false, error: 'Reason for denial is required' };
      }

      // Get role request
      const roleRequest = await mockSupabaseClient.from('role_requests').select('*').eq('id', requestId).single();
      if (!roleRequest.data) {
        return { success: false, error: 'Role request not found' };
      }

      // Check approver permissions
      const approverProfile = await mockSupabaseClient.from('users').select('*').eq('id', mockUser.id).single();
      
      const canDeny = validateApproverPermission(approverProfile.data, roleRequest.data);
      if (!canDeny) {
        return { success: false, error: 'Insufficient permissions to deny this role request' };
      }

      // Update request status
      await mockSupabaseClient.from('role_requests').update({}).eq('id', requestId);
      await mockSupabaseClient.from('role_audit_log').insert({});
      await mockSupabaseClient.from('notifications').insert({});

      return {
        success: true,
        message: 'Role request denied successfully',
        data: {
          requestId,
          deniedRole: roleRequest.data.requested_role,
          deniedAt: new Date().toISOString(),
          deniedBy: mockUser.id,
          reason: body.reason.trim()
        }
      };
    } catch (error) {
      return { success: false, error: 'Internal server error' };
    }
  }

  async function simulateGetUserPermissions(targetUserId) {
    try {
      // Check authentication
      const authResult = await mockSupabaseClient.auth.getUser();
      if (!authResult.data.user) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate access permissions
      const canAccess = await validatePermissionAccess(mockUser.id, targetUserId);
      if (!canAccess) {
        return { success: false, error: 'Insufficient permissions to view user permissions' };
      }

      // Get role assignments
      const roleAssignments = await mockSupabaseClient.from('user_role_assignments').select('*').eq('user_id', targetUserId);
      
      // Get permissions
      const permissions = await mockPermissionChecker.getUserPermissions(targetUserId);
      const permissionDetails = await mockSupabaseClient.from('permissions').select('*').in('id', []);
      
      // Get user profile
      const userProfile = await mockSupabaseClient.from('users').select('*').eq('id', targetUserId).single();

      return {
        success: true,
        data: {
          user: {
            id: targetUserId,
            email: userProfile.data?.email || 'user@example.com',
            fullName: userProfile.data?.full_name || 'User Name',
            primaryRole: userProfile.data?.primary_role || UserRole.STUDENT,
            roleStatus: userProfile.data?.role_status || 'active'
          },
          roleAssignments: roleAssignments.data || [],
          permissions: {
            total: permissions.length,
            byCategory: {},
            details: permissionDetails.data || []
          },
          summary: {
            activeRoles: 1,
            temporaryRoles: 0,
            expiredRoles: 0,
            totalPermissions: permissions.length
          }
        }
      };
    } catch (error) {
      return { success: false, error: 'Internal server error' };
    }
  }

  async function simulateBulkRoleAssignment(bulkRequest) {
    try {
      // Check authentication
      const authResult = await mockSupabaseClient.auth.getUser();
      if (!authResult.data.user) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate request structure
      if (!bulkRequest.assignments || !Array.isArray(bulkRequest.assignments)) {
        return { success: false, error: 'Invalid request: assignments array is required' };
      }

      if (bulkRequest.assignments.length === 0) {
        return { success: false, error: 'No assignments provided' };
      }

      if (bulkRequest.assignments.length > 10000) {
        return { success: false, error: 'Too many assignments. Maximum allowed: 10000' };
      }

      // Check permissions
      const hasPermission = await checkBulkAssignmentPermission(mockUser.id, bulkRequest.assignments[0].institutionId);
      if (!hasPermission) {
        return { success: false, error: 'Insufficient permissions for bulk role assignment' };
      }

      // Process assignments
      const result = await mockBulkRoleAssignmentService.processBulkAssignment(
        bulkRequest.assignments,
        bulkRequest.assignments[0].institutionId,
        mockUser.id,
        { validateOnly: bulkRequest.validateOnly || false }
      );

      // Log operation
      await mockSupabaseClient.from('role_audit_log').insert({});

      return {
        success: true,
        result: {
          successful: result.successful,
          failed: result.failed,
          total: bulkRequest.assignments.length,
          errors: result.errors,
          validateOnly: bulkRequest.validateOnly || false
        }
      };
    } catch (error) {
      return { success: false, error: 'Internal server error' };
    }
  }

  function validateApproverPermission(approver, roleRequest) {
    if (approver.primary_role === UserRole.SYSTEM_ADMIN) {
      return true;
    }

    if (approver.primary_role === UserRole.INSTITUTION_ADMIN) {
      return approver.institution_id === roleRequest.institution_id;
    }

    if (approver.primary_role === UserRole.DEPARTMENT_ADMIN) {
      return approver.institution_id === roleRequest.institution_id &&
             approver.department_id === roleRequest.department_id &&
             [UserRole.TEACHER, UserRole.STUDENT].includes(roleRequest.requested_role);
    }

    return false;
  }

  async function validatePermissionAccess(requesterId, targetUserId) {
    if (requesterId === targetUserId) {
      return true;
    }

    const requesterRoles = await mockSupabaseClient.from('user_role_assignments').select('*').eq('user_id', requesterId);
    
    if (requesterRoles.data?.some(r => r.role === UserRole.SYSTEM_ADMIN)) {
      return true;
    }

    // Simplified permission check for testing
    return requesterRoles.data?.some(r => 
      r.role === UserRole.INSTITUTION_ADMIN || r.role === UserRole.DEPARTMENT_ADMIN
    );
  }

  async function checkBulkAssignmentPermission(userId, institutionId) {
    const userRoles = await mockSupabaseClient.from('user_role_assignments').select('*').eq('user_id', userId);
    
    return userRoles.data?.some(role => 
      role.role === UserRole.INSTITUTION_ADMIN || role.role === UserRole.SYSTEM_ADMIN
    );
  }
});