/**
 * Integration tests for the complete role request workflow
 * 
 * Tests the end-to-end flow from role request submission through approval/denial
 * and notification delivery.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { UserRole, RoleRequestStatus } from '../../lib/types/role-management';
import { RoleManager } from '../../lib/services/role-manager';
import { RoleNotificationService } from '../../lib/services/role-notification-service';

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn(),
    or: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis()
  }))
};

jest.mock('../../lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('Role Request Workflow Integration', () => {
  let roleManager;
  let notificationService;
  
  const mockUser = {
    id: 'user-123',
    email: 'student@university.edu',
    full_name: 'John Student'
  };

  const mockInstitution = {
    id: 'inst-123',
    name: 'Test University'
  };

  const mockAdmin = {
    id: 'admin-123',
    email: 'admin@university.edu',
    full_name: 'Jane Admin',
    primary_role: UserRole.INSTITUTION_ADMIN
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    roleManager = new RoleManager({
      defaultRoleRequestExpiration: 7,
      maxTemporaryRoleDuration: 30,
      requireApprovalForRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
      autoApproveRoles: [UserRole.STUDENT]
    });

    notificationService = new RoleNotificationService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Role Request Submission', () => {
    it('should successfully submit a teacher role request', async () => {
      // Mock database responses
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: {
          id: mockUser.id,
          institution_id: mockInstitution.id,
          primary_role: UserRole.STUDENT
        },
        error: null
      });

      // Mock no existing requests
      mockSupabase.from().mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        data: [],
        error: null
      });

      // Mock successful insert
      mockSupabase.from().select.mockResolvedValueOnce({
        data: {
          id: 'request-123',
          user_id: mockUser.id,
          requested_role: UserRole.TEACHER,
          status: RoleRequestStatus.PENDING,
          requested_at: new Date().toISOString()
        },
        error: null
      });

      // Mock admin lookup for notifications
      mockSupabase.from().mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        data: [mockAdmin],
        error: null
      });

      const response = await fetch('/api/roles/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedRole: UserRole.TEACHER,
          justification: 'I have 5 years of teaching experience and would like to create courses for my students.',
          institutionId: mockInstitution.id
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.requestedRole).toBe(UserRole.TEACHER);
      expect(data.data.status).toBe(RoleRequestStatus.PENDING);
      expect(data.data.requiresApproval).toBe(true);
    });

    it('should reject request with insufficient justification', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      const response = await fetch('/api/roles/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedRole: UserRole.TEACHER,
          justification: 'I want it',
          institutionId: mockInstitution.id
        }),
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('Justification must be between 20 and 500 characters');
    });

    it('should reject duplicate pending requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: {
          id: mockUser.id,
          institution_id: mockInstitution.id,
          primary_role: UserRole.STUDENT
        },
        error: null
      });

      // Mock existing pending request
      mockSupabase.from().mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        data: [{
          id: 'existing-request',
          status: RoleRequestStatus.PENDING
        }],
        error: null
      });

      const response = await fetch('/api/roles/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedRole: UserRole.TEACHER,
          justification: 'I have teaching experience and want to create courses.',
          institutionId: mockInstitution.id
        }),
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('You already have a pending request for this role');
    });
  });

  describe('Role Request Approval', () => {
    const mockRequest = {
      id: 'request-123',
      user_id: mockUser.id,
      requested_role: UserRole.TEACHER,
      current_role: UserRole.STUDENT,
      justification: 'I have teaching experience and want to create courses.',
      status: RoleRequestStatus.PENDING,
      institution_id: mockInstitution.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      users: mockUser
    };

    it('should successfully approve a role request', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockAdmin },
        error: null
      });

      // Mock getting the role request
      mockSupabase.from().single.mockResolvedValueOnce({
        data: mockRequest,
        error: null
      });

      // Mock getting approver profile
      mockSupabase.from().single.mockResolvedValueOnce({
        data: mockAdmin,
        error: null
      });

      // Mock successful updates
      mockSupabase.from().update.mockResolvedValue({
        data: null,
        error: null
      });

      const response = await fetch(`/api/roles/requests/${mockRequest.id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: 'Approved based on teaching credentials'
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.approvedRole).toBe(UserRole.TEACHER);
    });

    it('should reject approval from unauthorized user', async () => {
      const unauthorizedUser = {
        id: 'student-456',
        email: 'student2@university.edu',
        primary_role: UserRole.STUDENT
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: unauthorizedUser },
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: mockRequest,
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: unauthorizedUser,
        error: null
      });

      const response = await fetch(`/api/roles/requests/${mockRequest.id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: 'Trying to approve'
        }),
      });

      expect(response.status).toBe(403);
      
      const data = await response.json();
      expect(data.error).toContain('Insufficient permissions');
    });

    it('should reject approval of expired request', async () => {
      const expiredRequest = {
        ...mockRequest,
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Yesterday
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockAdmin },
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: expiredRequest,
        error: null
      });

      const response = await fetch(`/api/roles/requests/${mockRequest.id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: 'Trying to approve expired request'
        }),
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('Role request has expired');
    });
  });

  describe('Role Request Denial', () => {
    const mockRequest = {
      id: 'request-123',
      user_id: mockUser.id,
      requested_role: UserRole.TEACHER,
      current_role: UserRole.STUDENT,
      justification: 'I want to teach.',
      status: RoleRequestStatus.PENDING,
      institution_id: mockInstitution.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      users: mockUser
    };

    it('should successfully deny a role request', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockAdmin },
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: mockRequest,
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: mockAdmin,
        error: null
      });

      mockSupabase.from().update.mockResolvedValue({
        data: null,
        error: null
      });

      const response = await fetch(`/api/roles/requests/${mockRequest.id}/deny`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Insufficient teaching experience demonstrated in justification'
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.deniedRole).toBe(UserRole.TEACHER);
    });

    it('should require reason for denial', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockAdmin },
        error: null
      });

      const response = await fetch(`/api/roles/requests/${mockRequest.id}/deny`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: ''
        }),
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('Reason for denial is required');
    });
  });

  describe('Pending Requests Retrieval', () => {
    it('should return pending requests for institution admin', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockAdmin },
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: mockAdmin,
        error: null
      });

      const mockPendingRequests = [
        {
          id: 'request-1',
          user_id: 'user-1',
          requested_role: UserRole.TEACHER,
          status: RoleRequestStatus.PENDING,
          requested_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          users: { id: 'user-1', email: 'user1@university.edu', full_name: 'User One' }
        },
        {
          id: 'request-2',
          user_id: 'user-2',
          requested_role: UserRole.DEPARTMENT_ADMIN,
          status: RoleRequestStatus.PENDING,
          requested_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          users: { id: 'user-2', email: 'user2@university.edu', full_name: 'User Two' }
        }
      ];

      mockSupabase.from().mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        data: mockPendingRequests,
        error: null
      });

      // Mock count query
      mockSupabase.from().mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        count: 2,
        error: null
      });

      const response = await fetch('/api/roles/requests/pending');
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.requests).toHaveLength(2);
      expect(data.data.summary.totalPending).toBe(2);
      expect(data.data.requests[0].canApprove).toBe(true);
    });

    it('should restrict access for non-admin users', async () => {
      const studentUser = {
        id: 'student-123',
        email: 'student@university.edu',
        primary_role: UserRole.STUDENT
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: studentUser },
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: studentUser,
        error: null
      });

      const response = await fetch('/api/roles/requests/pending');
      
      expect(response.status).toBe(403);
      
      const data = await response.json();
      expect(data.error).toContain('Insufficient permissions');
    });
  });

  describe('Notification System', () => {
    it('should send notifications when role request is submitted', async () => {
      const mockAdmins = [mockAdmin];
      
      // Mock admin lookup
      mockSupabase.from().mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        data: mockAdmins,
        error: null
      });

      // Mock notification insert
      mockSupabase.from().insert.mockResolvedValue({
        data: null,
        error: null
      });

      await notificationService.notifyRoleRequestSubmitted({
        requestId: 'request-123',
        userId: mockUser.id,
        requestedRole: UserRole.TEACHER,
        institutionId: mockInstitution.id,
        requesterName: mockUser.full_name,
        requesterEmail: mockUser.email
      });

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: mockAdmin.id,
            type: 'role_request_submitted',
            title: 'New Role Request'
          })
        ])
      );
    });

    it('should send approval notification to user', async () => {
      // Mock user lookup
      mockSupabase.from().single.mockResolvedValueOnce({
        data: mockUser,
        error: null
      });

      // Mock notification insert
      mockSupabase.from().insert.mockResolvedValue({
        data: null,
        error: null
      });

      await notificationService.notifyRoleRequestApproved({
        requestId: 'request-123',
        userId: mockUser.id,
        requestedRole: UserRole.TEACHER,
        status: RoleRequestStatus.APPROVED,
        reviewedBy: mockAdmin.id,
        reviewerName: mockAdmin.full_name,
        notes: 'Approved based on credentials',
        institutionId: mockInstitution.id
      });

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUser.id,
          type: 'role_request_approved',
          title: 'Role Request Approved'
        })
      );
    });

    it('should send denial notification to user', async () => {
      // Mock user lookup
      mockSupabase.from().single.mockResolvedValueOnce({
        data: mockUser,
        error: null
      });

      // Mock notification insert
      mockSupabase.from().insert.mockResolvedValue({
        data: null,
        error: null
      });

      await notificationService.notifyRoleRequestDenied({
        requestId: 'request-123',
        userId: mockUser.id,
        requestedRole: UserRole.TEACHER,
        status: RoleRequestStatus.DENIED,
        reviewedBy: mockAdmin.id,
        reviewerName: mockAdmin.full_name,
        reason: 'Insufficient experience',
        institutionId: mockInstitution.id
      });

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUser.id,
          type: 'role_request_denied',
          title: 'Role Request Denied'
        })
      );
    });
  });

  describe('Auto-approval Flow', () => {
    it('should auto-approve student role requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      mockSupabase.from().single.mockResolvedValueOnce({
        data: {
          id: mockUser.id,
          institution_id: mockInstitution.id,
          primary_role: UserRole.TEACHER // Current role
        },
        error: null
      });

      // Mock no existing requests
      mockSupabase.from().mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        data: [],
        error: null
      });

      // Mock successful insert and immediate approval
      mockSupabase.from().select.mockResolvedValueOnce({
        data: {
          id: 'request-123',
          user_id: mockUser.id,
          requested_role: UserRole.STUDENT,
          status: RoleRequestStatus.APPROVED, // Auto-approved
          requested_at: new Date().toISOString()
        },
        error: null
      });

      const response = await fetch('/api/roles/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedRole: UserRole.STUDENT,
          justification: 'I want to switch back to student role to take additional courses.',
          institutionId: mockInstitution.id
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.requiresApproval).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      // Mock database error
      mockSupabase.from().single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const response = await fetch('/api/roles/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedRole: UserRole.TEACHER,
          justification: 'I have teaching experience and want to create courses.',
          institutionId: mockInstitution.id
        }),
      });

      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error).toContain('User profile not found');
    });

    it('should handle unauthorized access', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'No user found' }
      });

      const response = await fetch('/api/roles/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedRole: UserRole.TEACHER,
          justification: 'I have teaching experience.',
          institutionId: mockInstitution.id
        }),
      });

      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });
});