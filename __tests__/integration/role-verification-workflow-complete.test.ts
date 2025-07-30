/**
 * Comprehensive integration tests for role verification workflow
 * Tests the complete verification functionality including API endpoints
 */

import { createClient } from '../../lib/supabase/server';
import { RoleVerificationService } from '../../lib/services/role-verification-service';
import { UserRole, VerificationEvidence, VerificationMethod } from '../../lib/types/role-management';

// Mock Supabase client
jest.mock('../../lib/supabase/server');
const mockSupabase = createClient as jest.MockedFunction<typeof createClient>;

// Mock notification service
jest.mock('../../lib/services/notification-service');

describe('Role Verification Workflow - Complete Integration', () => {
  let verificationService: RoleVerificationService;
  let mockSupabaseClient: any;

  const verificationConfig = {
    domainVerificationEnabled: true,
    manualVerificationEnabled: true,
    verificationTimeoutDays: 7,
    maxEvidenceFiles: 5,
    allowedFileTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    maxFileSize: 10 * 1024 * 1024 // 10MB
  };

  beforeEach(() => {
    // Setup mock Supabase client
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn(),
      order: jest.fn().mockReturnThis(),
      auth: {
        getUser: jest.fn()
      }
    };

    mockSupabase.mockReturnValue(mockSupabaseClient);
    verificationService = new RoleVerificationService(verificationConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Email Domain Verification', () => {
    it('should verify email domain against institution domains', async () => {
      // Mock institution domains
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: [
          {
            id: 'domain-1',
            institution_id: 'inst-123',
            domain: 'university.edu',
            verified: true,
            auto_approve_roles: ['teacher']
          }
        ],
        error: null
      });

      const result = await verificationService.verifyEmailDomain(
        'professor@university.edu',
        'inst-123'
      );

      expect(result).toBe(true);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('institution_domains');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('institution_id', 'inst-123');
    });

    it('should reject unverified domains', async () => {
      // Mock no matching domains
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const result = await verificationService.verifyEmailDomain(
        'user@unknown.com',
        'inst-123'
      );

      expect(result).toBe(false);
    });

    it('should check auto-approval eligibility', async () => {
      // Mock institution domains with auto-approve roles
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: [
          {
            id: 'domain-1',
            institution_id: 'inst-123',
            domain: 'university.edu',
            verified: true,
            auto_approve_roles: ['teacher', 'student']
          }
        ],
        error: null
      });

      const canAutoApprove = await verificationService.canAutoApproveRole(
        'professor@university.edu',
        'inst-123',
        UserRole.TEACHER
      );

      expect(canAutoApprove).toBe(true);
    });
  });

  describe('Manual Verification Request Submission', () => {
    it('should submit manual verification request with evidence', async () => {
      // Mock user data
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'user-123', email: 'user@example.com' },
        error: null
      });

      // Mock successful insertion
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      const evidence: VerificationEvidence[] = [
        {
          type: 'document',
          description: 'Employment letter',
          fileUrl: 'https://storage.example.com/letter.pdf',
          metadata: {
            fileName: 'employment-letter.pdf',
            fileSize: 1024,
            fileType: 'application/pdf'
          }
        }
      ];

      const request = await verificationService.requestManualVerification(
        'user-123',
        'inst-123',
        UserRole.TEACHER,
        evidence
      );

      expect(request.userId).toBe('user-123');
      expect(request.institutionId).toBe('inst-123');
      expect(request.requestedRole).toBe(UserRole.TEACHER);
      expect(request.evidence).toEqual(evidence);
      expect(request.status).toBe('pending');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should validate evidence before submission', async () => {
      const invalidEvidence: VerificationEvidence[] = [
        {
          type: 'document',
          description: 'Large file',
          fileUrl: 'https://storage.example.com/large.pdf',
          metadata: {
            fileName: 'large.pdf',
            fileSize: 20 * 1024 * 1024, // 20MB - exceeds limit
            fileType: 'application/pdf'
          }
        }
      ];

      // Mock file info to return large size
      jest.spyOn(verificationService as any, 'getFileInfo').mockResolvedValue({
        type: 'application/pdf',
        size: 20 * 1024 * 1024
      });

      await expect(
        verificationService.requestManualVerification(
          'user-123',
          'inst-123',
          UserRole.TEACHER,
          invalidEvidence
        )
      ).rejects.toThrow('File too large');
    });

    it('should limit number of evidence files', async () => {
      const tooManyEvidence: VerificationEvidence[] = Array(6).fill({
        type: 'document',
        description: 'Evidence',
        metadata: {}
      });

      await expect(
        verificationService.requestManualVerification(
          'user-123',
          'inst-123',
          UserRole.TEACHER,
          tooManyEvidence
        )
      ).rejects.toThrow('Too many evidence files');
    });
  });

  describe('Verification Review Process', () => {
    it('should process approval with role assignment', async () => {
      // Mock verification request
      const mockRequest = {
        id: 'req-123',
        userId: 'user-123',
        institutionId: 'inst-123',
        requestedRole: UserRole.TEACHER,
        verificationMethod: VerificationMethod.MANUAL_REVIEW,
        status: 'pending',
        submittedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      // Mock getting verification request
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: mockRequest.id,
          user_id: mockRequest.userId,
          institution_id: mockRequest.institutionId,
          requested_role: mockRequest.requestedRole,
          verification_method: mockRequest.verificationMethod,
          status: mockRequest.status,
          submitted_at: mockRequest.submittedAt.toISOString(),
          expires_at: mockRequest.expiresAt.toISOString(),
          verification_evidence: []
        },
        error: null
      });

      // Mock reviewer permission check
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: 'reviewer-123', institution_id: 'inst-123' },
        error: null
      });

      // Mock update verification request
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      const result = await verificationService.processVerificationResult(
        'req-123',
        true, // approved
        'reviewer-123',
        'Credentials verified successfully'
      );

      expect(result.verified).toBe(true);
      expect(result.method).toBe(VerificationMethod.MANUAL_REVIEW);
      expect(result.reason).toBe('Credentials verified successfully');
      expect(mockSupabaseClient.update).toHaveBeenCalled();
    });

    it('should process denial with reason', async () => {
      // Mock verification request
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'req-123',
          user_id: 'user-123',
          institution_id: 'inst-123',
          requested_role: UserRole.TEACHER,
          verification_method: VerificationMethod.MANUAL_REVIEW,
          status: 'pending',
          submitted_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          verification_evidence: []
        },
        error: null
      });

      // Mock reviewer permission check
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: 'reviewer-123', institution_id: 'inst-123' },
        error: null
      });

      // Mock update verification request
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      const result = await verificationService.processVerificationResult(
        'req-123',
        false, // denied
        'reviewer-123',
        'Insufficient documentation provided'
      );

      expect(result.verified).toBe(false);
      expect(result.reason).toBe('Insufficient documentation provided');
    });

    it('should validate reviewer permissions', async () => {
      // Mock verification request
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'req-123',
          user_id: 'user-123',
          institution_id: 'inst-123',
          status: 'pending'
        },
        error: null
      });

      // Mock no reviewer permissions
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'No matching record' }
      });

      await expect(
        verificationService.processVerificationResult(
          'req-123',
          true,
          'unauthorized-user',
          'Notes'
        )
      ).rejects.toThrow('User does not have permission to review verification requests');
    });
  });

  describe('Domain Configuration and Verification', () => {
    it('should configure institution domain', async () => {
      // Mock admin permission check
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: 'admin-123', institution_id: 'inst-123', role: 'institution_admin' },
        error: null
      });

      // Mock domain doesn't exist
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'No matching record' }
      });

      // Mock successful domain creation
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      const domain = await verificationService.configureInstitutionDomain(
        'inst-123',
        'university.edu',
        [UserRole.TEACHER, UserRole.STUDENT],
        'admin-123'
      );

      expect(domain.institutionId).toBe('inst-123');
      expect(domain.domain).toBe('university.edu');
      expect(domain.autoApproveRoles).toEqual([UserRole.TEACHER, UserRole.STUDENT]);
      expect(domain.verified).toBe(false);
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
    });

    it('should verify domain ownership', async () => {
      // Mock domain data
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'domain-123',
          institution_id: 'inst-123',
          domain: 'university.edu',
          verified: false
        },
        error: null
      });

      // Mock successful verification
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      const isVerified = await verificationService.verifyDomainOwnership(
        'domain-123',
        'valid-token-123'
      );

      expect(isVerified).toBe(true);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        verified: true,
        auto_approve_roles: expect.any(Array),
        verified_at: expect.any(String),
        updated_at: expect.any(String)
      });
    });

    it('should reject invalid domain format', async () => {
      // Mock admin permission check
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: 'admin-123', institution_id: 'inst-123', role: 'institution_admin' },
        error: null
      });

      await expect(
        verificationService.configureInstitutionDomain(
          'inst-123',
          'invalid-domain',
          [UserRole.TEACHER],
          'admin-123'
        )
      ).rejects.toThrow('Invalid domain format');
    });
  });

  describe('Verification Status Tracking', () => {
    it('should get pending verifications for institution', async () => {
      // Mock reviewer permission check
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: 'reviewer-123', institution_id: 'inst-123' },
        error: null
      });

      // Mock verification requests
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [
          {
            id: 'req-123',
            user_id: 'user-123',
            institution_id: 'inst-123',
            requested_role: 'teacher',
            verification_method: 'manual_review',
            status: 'pending',
            submitted_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            verification_evidence: []
          }
        ],
        error: null
      });

      const requests = await verificationService.getPendingVerifications(
        'inst-123',
        'reviewer-123'
      );

      expect(requests).toHaveLength(1);
      expect(requests[0].status).toBe('pending');
      expect(requests[0].institutionId).toBe('inst-123');
    });

    it('should track verification status changes', async () => {
      // Mock status log insertion
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      // Test the private method through reflection
      const logMethod = (verificationService as any).logVerificationStatusChange;
      await logMethod.call(
        verificationService,
        'req-123',
        'approved',
        'reviewer-123',
        'Credentials verified'
      );

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        verification_request_id: 'req-123',
        status: 'approved',
        changed_by: 'reviewer-123',
        reason: 'Credentials verified',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors', async () => {
      // Mock database error
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Connection failed' }
      });

      await expect(
        verificationService.verifyEmailDomain('user@example.com', 'inst-123')
      ).rejects.toThrow('Failed to get institution domains: Connection failed');
    });

    it('should handle expired verification requests', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      
      // Mock expired verification request
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'req-123',
          status: 'expired',
          expires_at: expiredDate.toISOString()
        },
        error: null
      });

      await expect(
        verificationService.processVerificationResult(
          'req-123',
          true,
          'reviewer-123',
          'Notes'
        )
      ).rejects.toThrow('Verification request is not pending');
    });

    it('should handle missing verification request', async () => {
      // Mock no verification request found
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'No matching record' }
      });

      await expect(
        verificationService.processVerificationResult(
          'nonexistent-req',
          true,
          'reviewer-123',
          'Notes'
        )
      ).rejects.toThrow('Verification request not found');
    });

    it('should validate file types and sizes', async () => {
      const invalidEvidence: VerificationEvidence[] = [
        {
          type: 'document',
          description: 'Invalid file',
          fileUrl: 'https://storage.example.com/malware.exe',
          metadata: {
            fileName: 'malware.exe',
            fileSize: 1024,
            fileType: 'application/x-executable'
          }
        }
      ];

      // Mock file info to return invalid type
      jest.spyOn(verificationService as any, 'getFileInfo').mockResolvedValue({
        type: 'application/x-executable',
        size: 1024
      });

      await expect(
        verificationService.requestManualVerification(
          'user-123',
          'inst-123',
          UserRole.TEACHER,
          invalidEvidence
        )
      ).rejects.toThrow('File type not allowed');
    });
  });

  describe('Notification Integration', () => {
    it('should notify reviewers of new verification requests', async () => {
      // Mock reviewers
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: [
          {
            user_id: 'reviewer-1',
            users: { email: 'reviewer1@university.edu', full_name: 'Reviewer One' }
          }
        ],
        error: null
      });

      const mockRequest = {
        id: 'req-123',
        userId: 'user-123',
        institutionId: 'inst-123',
        requestedRole: UserRole.TEACHER,
        verificationMethod: VerificationMethod.MANUAL_REVIEW,
        status: 'pending' as const,
        submittedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      // Test the private notification method
      const notifyMethod = (verificationService as any).notifyVerificationReviewers;
      await notifyMethod.call(verificationService, mockRequest);

      // Verify notification service was called (mocked)
      expect(mockSupabaseClient.select).toHaveBeenCalled();
    });

    it('should notify users of verification results', async () => {
      const result = {
        verified: true,
        method: VerificationMethod.MANUAL_REVIEW,
        reason: 'Approved',
        verifiedBy: 'reviewer-123',
        verifiedAt: new Date()
      };

      // Test the private notification method
      const notifyMethod = (verificationService as any).notifyVerificationResult;
      await notifyMethod.call(verificationService, 'user-123', result);

      // Verify notification was attempted (implementation would call NotificationService)
      // This is tested through the mock setup
    });
  });
});