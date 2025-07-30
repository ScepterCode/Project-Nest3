import { InvitationManager } from '@/lib/services/invitation-manager';
import { EnrollmentStatus } from '@/lib/types/enrollment';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  auth: {
    getUser: jest.fn()
  },
  rpc: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  or: jest.fn(),
  is: jest.fn(),
  gt: jest.fn(),
  lt: jest.fn(),
  in: jest.fn(),
  single: jest.fn(),
  order: jest.fn()
};

// Mock the Supabase client creation
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

// Mock notification service
jest.mock('@/lib/services/notification-service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    sendNotification: jest.fn().mockResolvedValue(undefined),
    sendEnrollmentConfirmation: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock crypto module
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mock-token-123')
  })
}));

describe('InvitationManager Unit Tests', () => {
  let invitationManager: InvitationManager;

  beforeEach(() => {
    invitationManager = new InvitationManager();
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.or.mockReturnValue(mockSupabase);
    mockSupabase.is.mockReturnValue(mockSupabase);
    mockSupabase.gt.mockReturnValue(mockSupabase);
    mockSupabase.lt.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.single.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Token Generation', () => {
    it('should generate unique tokens for each invitation', async () => {
      const crypto = require('crypto');
      
      // Mock different tokens for each call
      crypto.randomBytes
        .mockReturnValueOnce({ toString: () => 'token-1' })
        .mockReturnValueOnce({ toString: () => 'token-2' });

      // Mock permission check
      mockSupabase.single.mockResolvedValueOnce({
        data: { teacher_id: 'teacher-123' },
        error: null
      });

      // Mock invitation creation for first invitation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'invitation-1',
          token: 'token-1',
          class_id: 'class-123',
          invited_by: 'teacher-123',
          expires_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        error: null
      });

      // Mock class details and audit log for first invitation
      mockSupabase.single.mockResolvedValueOnce({
        data: { name: 'Test Class', code: 'TEST-101' },
        error: null
      });

      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      // Mock permission check for second invitation
      mockSupabase.single.mockResolvedValueOnce({
        data: { teacher_id: 'teacher-123' },
        error: null
      });

      // Mock invitation creation for second invitation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'invitation-2',
          token: 'token-2',
          class_id: 'class-123',
          invited_by: 'teacher-123',
          expires_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        error: null
      });

      // Mock class details and audit log for second invitation
      mockSupabase.single.mockResolvedValueOnce({
        data: { name: 'Test Class', code: 'TEST-101' },
        error: null
      });

      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      const invitation1 = await invitationManager.createInvitation('teacher-123', {
        classId: 'class-123',
        email: 'student1@example.com'
      });

      const invitation2 = await invitationManager.createInvitation('teacher-123', {
        classId: 'class-123',
        email: 'student2@example.com'
      });

      expect(invitation1.token).toBe('token-1');
      expect(invitation2.token).toBe('token-2');
      expect(invitation1.token).not.toBe(invitation2.token);
    });
  });

  describe('Permission Validation', () => {
    it('should allow class teacher to create invitations', async () => {
      // Mock permission check - user is the teacher
      mockSupabase.single.mockResolvedValueOnce({
        data: { teacher_id: 'teacher-123' },
        error: null
      });

      // Mock invitation creation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'invitation-123',
          class_id: 'class-123',
          invited_by: 'teacher-123',
          token: 'mock-token',
          expires_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        error: null
      });

      // Mock class details and audit log
      mockSupabase.single.mockResolvedValueOnce({
        data: { name: 'Test Class', code: 'TEST-101' },
        error: null
      });

      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      const invitation = await invitationManager.createInvitation('teacher-123', {
        classId: 'class-123',
        email: 'student@example.com'
      });

      expect(invitation).toBeDefined();
      expect(invitation.invitedBy).toBe('teacher-123');
    });

    it('should reject unauthorized users', async () => {
      // Mock permission check - user is not the teacher
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { teacher_id: 'different-teacher' },
          error: null
        })
        // Mock admin role check - user has no admin role
        .mockResolvedValueOnce({
          data: null,
          error: null
        });

      await expect(
        invitationManager.createInvitation('unauthorized-user', {
          classId: 'class-123',
          email: 'student@example.com'
        })
      ).rejects.toThrow('Insufficient permissions to manage invitations for this class');
    });
  });

  describe('Invitation Validation', () => {
    it('should validate a valid invitation token', async () => {
      const mockInvitation = {
        id: 'invitation-123',
        class_id: 'class-123',
        student_id: 'student-123',
        email: 'student@example.com',
        invited_by: 'teacher-123',
        token: 'valid-token',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expires tomorrow
        accepted_at: null,
        declined_at: null,
        created_at: new Date().toISOString(),
        classes: {
          id: 'class-123',
          capacity: 30,
          current_enrollment: 15
        }
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockInvitation,
        error: null
      });

      const result = await invitationManager.validateInvitation('valid-token');

      expect(result.valid).toBe(true);
      expect(result.invitation).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should reject expired invitation', async () => {
      const mockInvitation = {
        id: 'invitation-123',
        class_id: 'class-123',
        token: 'expired-token',
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Expired yesterday
        accepted_at: null,
        declined_at: null
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockInvitation,
        error: null
      });

      const result = await invitationManager.validateInvitation('expired-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invitation has expired');
    });

    it('should reject invalid invitation token', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'No rows returned' }
      });

      const result = await invitationManager.validateInvitation('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid invitation token');
    });
  });

  describe('Invitation Acceptance', () => {
    it('should successfully accept invitation and enroll student', async () => {
      const mockInvitation = {
        id: 'invitation-123',
        class_id: 'class-123',
        student_id: 'student-123',
        invited_by: 'teacher-123',
        token: 'valid-token',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        declined_at: null,
        classes: {
          capacity: 30,
          current_enrollment: 15
        }
      };

      // Mock validation
      mockSupabase.single.mockResolvedValueOnce({
        data: mockInvitation,
        error: null
      });

      // Mock enrollment creation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'enrollment-123',
          student_id: 'student-123',
          class_id: 'class-123',
          status: 'enrolled'
        },
        error: null
      });

      // Mock invitation acceptance update
      mockSupabase.update.mockResolvedValueOnce({ error: null });

      // Mock enrollment count increment
      mockSupabase.rpc.mockResolvedValueOnce({ error: null });

      // Mock audit log
      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      const result = await invitationManager.acceptInvitation('valid-token', 'student-123');

      expect(result.success).toBe(true);
      expect(result.status).toBe('enrolled');
      expect(result.enrollmentId).toBe('enrollment-123');
      expect(result.message).toBe('Successfully enrolled in class via invitation');
    });

    it('should reject acceptance for wrong student', async () => {
      const mockInvitation = {
        id: 'invitation-123',
        class_id: 'class-123',
        student_id: 'different-student',
        token: 'valid-token',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        declined_at: null,
        classes: {
          capacity: 30,
          current_enrollment: 15
        }
      };

      // Mock validation
      mockSupabase.single.mockResolvedValueOnce({
        data: mockInvitation,
        error: null
      });

      const result = await invitationManager.acceptInvitation('valid-token', 'wrong-student');

      expect(result.success).toBe(false);
      expect(result.message).toBe('This invitation is not for your account');
      expect(result.errors?.[0].code).toBe('STUDENT_MISMATCH');
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up expired invitations', async () => {
      const mockExpiredInvitations = [
        { id: 'expired-1' },
        { id: 'expired-2' },
        { id: 'expired-3' }
      ];

      mockSupabase.select.mockResolvedValueOnce({
        data: mockExpiredInvitations,
        error: null
      });

      const cleanedCount = await invitationManager.cleanupExpiredInvitations();

      expect(cleanedCount).toBe(3);
    });
  });
});