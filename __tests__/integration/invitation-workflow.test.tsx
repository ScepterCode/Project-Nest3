import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createClient } from '@/lib/supabase/server';
import { InvitationManager } from '@/lib/services/invitation-manager';
import { EnrollmentType } from '@/lib/types/enrollment';

// Mock Supabase client
jest.mock('@/lib/supabase/server');
const mockSupabase = {
  from: jest.fn(),
  auth: {
    getUser: jest.fn()
  },
  rpc: jest.fn()
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

// Mock notification service
jest.mock('@/lib/services/notification-service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    sendNotification: jest.fn().mockResolvedValue(undefined),
    sendEnrollmentConfirmation: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('Invitation Workflow Integration Tests', () => {
  let invitationManager: InvitationManager;
  let mockClassData: any;
  let mockTeacherData: any;
  let mockStudentData: any;

  beforeEach(() => {
    invitationManager = new InvitationManager();
    
    // Reset all mocks
    jest.clearAllMocks();

    // Mock class data
    mockClassData = {
      id: 'class-123',
      name: 'Advanced Mathematics',
      code: 'MATH-401',
      teacher_id: 'teacher-123',
      capacity: 30,
      current_enrollment: 15,
      enrollment_type: EnrollmentType.INVITATION_ONLY,
      users: {
        first_name: 'John',
        last_name: 'Doe'
      }
    };

    // Mock teacher data
    mockTeacherData = {
      id: 'teacher-123',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@university.edu'
    };

    // Mock student data
    mockStudentData = {
      id: 'student-123',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane.smith@student.edu'
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Single Invitation Creation', () => {
    it('should create a single invitation successfully', async () => {
      // Mock database responses
      const mockInvitationData = {
        id: 'invitation-123',
        class_id: 'class-123',
        student_id: 'student-123',
        email: 'jane.smith@student.edu',
        invited_by: 'teacher-123',
        token: 'mock-token-123',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        message: 'Welcome to the class!',
        created_at: new Date().toISOString()
      };

      // Mock class permission check
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { teacher_id: 'teacher-123' },
              error: null
            })
          })
        })
      });

      // Mock invitation creation
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitationData,
              error: null
            })
          })
        })
      });

      // Mock class details for notification
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockClassData,
              error: null
            })
          })
        })
      });

      // Mock audit log insertion
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      const invitation = await invitationManager.createInvitation('teacher-123', {
        classId: 'class-123',
        studentId: 'student-123',
        email: 'jane.smith@student.edu',
        message: 'Welcome to the class!'
      });

      expect(invitation).toMatchObject({
        id: 'invitation-123',
        classId: 'class-123',
        studentId: 'student-123',
        email: 'jane.smith@student.edu',
        invitedBy: 'teacher-123',
        message: 'Welcome to the class!'
      });

      expect(invitation.token).toBeDefined();
      expect(invitation.expiresAt).toBeInstanceOf(Date);
    });

    it('should reject invitation creation by unauthorized user', async () => {
      // Mock class permission check - different teacher
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { teacher_id: 'different-teacher' },
              error: null
            })
          })
        })
      });

      // Mock user role check - no admin role
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null
              })
            })
          })
        })
      });

      await expect(
        invitationManager.createInvitation('unauthorized-user', {
          classId: 'class-123',
          email: 'student@example.com'
        })
      ).rejects.toThrow('Insufficient permissions to manage invitations for this class');
    });
  });

  describe('Bulk Invitation Creation', () => {
    it('should create multiple invitations successfully', async () => {
      const invitationRequests = [
        { email: 'student1@example.com', message: 'Welcome!' },
        { email: 'student2@example.com', message: 'Join us!' },
        { email: 'student3@example.com' }
      ];

      // Mock permission check
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { teacher_id: 'teacher-123' },
              error: null
            })
          })
        })
      });

      // Mock successful invitation creation for each request
      invitationRequests.forEach((_, index) => {
        mockSupabase.from.mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: `invitation-${index + 1}`,
                  class_id: 'class-123',
                  email: `student${index + 1}@example.com`,
                  invited_by: 'teacher-123',
                  token: `token-${index + 1}`,
                  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  created_at: new Date().toISOString()
                },
                error: null
              })
            })
          })
        });

        // Mock class details for notification
        mockSupabase.from.mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockClassData,
                error: null
              })
            })
          })
        });

        // Mock audit log
        mockSupabase.from.mockReturnValueOnce({
          insert: jest.fn().mockResolvedValue({ error: null })
        });
      });

      const result = await invitationManager.createBulkInvitations('teacher-123', {
        classId: 'class-123',
        invitations: invitationRequests,
        defaultMessage: 'Welcome to our class!'
      });

      expect(result.stats.total).toBe(3);
      expect(result.stats.successful).toBe(3);
      expect(result.stats.failed).toBe(0);
      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
    });

    it('should handle partial failures in bulk invitation creation', async () => {
      const invitationRequests = [
        { email: 'valid@example.com' },
        { email: 'invalid-email' }, // This will fail
        { email: 'another@example.com' }
      ];

      // Mock permission check
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { teacher_id: 'teacher-123' },
              error: null
            })
          })
        })
      });

      // Mock first invitation success
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'invitation-1',
                class_id: 'class-123',
                email: 'valid@example.com',
                invited_by: 'teacher-123',
                token: 'token-1',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                created_at: new Date().toISOString()
              },
              error: null
            })
          })
        })
      });

      // Mock class details and audit log for first invitation
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockClassData,
              error: null
            })
          })
        })
      });
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      // Mock second invitation failure (invalid email)
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Invalid email format' }
            })
          })
        })
      });

      // Mock third invitation success
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'invitation-3',
                class_id: 'class-123',
                email: 'another@example.com',
                invited_by: 'teacher-123',
                token: 'token-3',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                created_at: new Date().toISOString()
              },
              error: null
            })
          })
        })
      });

      // Mock class details and audit log for third invitation
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockClassData,
              error: null
            })
          })
        })
      });
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      const result = await invitationManager.createBulkInvitations('teacher-123', {
        classId: 'class-123',
        invitations: invitationRequests
      });

      expect(result.stats.total).toBe(3);
      expect(result.stats.successful).toBe(2);
      expect(result.stats.failed).toBe(1);
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('Invalid email format');
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

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
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

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      const result = await invitationManager.validateInvitation('expired-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invitation has expired');
    });

    it('should reject already accepted invitation', async () => {
      const mockInvitation = {
        id: 'invitation-123',
        class_id: 'class-123',
        token: 'accepted-token',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: new Date().toISOString(),
        declined_at: null
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      const result = await invitationManager.validateInvitation('accepted-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invitation has already been responded to');
    });

    it('should reject invitation for full class', async () => {
      const mockInvitation = {
        id: 'invitation-123',
        class_id: 'class-123',
        token: 'full-class-token',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        declined_at: null,
        classes: {
          id: 'class-123',
          capacity: 30,
          current_enrollment: 30 // Full capacity
        }
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      const result = await invitationManager.validateInvitation('full-class-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Class is now at full capacity');
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
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      // Mock enrollment creation
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'enrollment-123',
                student_id: 'student-123',
                class_id: 'class-123',
                status: 'enrolled'
              },
              error: null
            })
          })
        })
      });

      // Mock invitation acceptance update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      });

      // Mock enrollment count increment
      mockSupabase.rpc.mockResolvedValueOnce({ error: null });

      // Mock audit log
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

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
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      const result = await invitationManager.acceptInvitation('valid-token', 'wrong-student');

      expect(result.success).toBe(false);
      expect(result.message).toBe('This invitation is not for your account');
      expect(result.errors?.[0].code).toBe('STUDENT_MISMATCH');
    });
  });

  describe('Invitation Statistics', () => {
    it('should calculate invitation statistics correctly', async () => {
      const mockInvitations = [
        { accepted_at: new Date().toISOString(), declined_at: null, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
        { accepted_at: new Date().toISOString(), declined_at: null, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
        { accepted_at: null, declined_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
        { accepted_at: null, declined_at: null, expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }, // Expired
        { accepted_at: null, declined_at: null, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() } // Pending
      ];

      // Mock permission check
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { teacher_id: 'teacher-123' },
              error: null
            })
          })
        })
      });

      // Mock invitations data
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: mockInvitations,
            error: null
          })
        })
      });

      const stats = await invitationManager.getInvitationStats('class-123', 'teacher-123');

      expect(stats.total).toBe(5);
      expect(stats.accepted).toBe(2);
      expect(stats.declined).toBe(1);
      expect(stats.expired).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.acceptanceRate).toBe(40); // 2/5 * 100
    });
  });

  describe('Security Tests', () => {
    it('should prevent unauthorized invitation creation', async () => {
      // Mock class not found
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Class not found' }
            })
          })
        })
      });

      await expect(
        invitationManager.createInvitation('unauthorized-user', {
          classId: 'nonexistent-class',
          email: 'student@example.com'
        })
      ).rejects.toThrow('Class not found');
    });

    it('should prevent invitation token manipulation', async () => {
      // Mock invalid token
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'No rows returned' }
            })
          })
        })
      });

      const result = await invitationManager.validateInvitation('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid invitation token');
    });

    it('should prevent duplicate invitation acceptance', async () => {
      const mockInvitation = {
        id: 'invitation-123',
        class_id: 'class-123',
        student_id: 'student-123',
        token: 'already-accepted-token',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: new Date().toISOString(), // Already accepted
        declined_at: null
      };

      // Mock validation
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      const result = await invitationManager.acceptInvitation('already-accepted-token', 'student-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invitation has already been responded to');
    });

    it('should validate invitation expiration strictly', async () => {
      const expiredTime = new Date(Date.now() - 1000); // 1 second ago
      const mockInvitation = {
        id: 'invitation-123',
        class_id: 'class-123',
        token: 'barely-expired-token',
        expires_at: expiredTime.toISOString(),
        accepted_at: null,
        declined_at: null
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      const result = await invitationManager.validateInvitation('barely-expired-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invitation has expired');
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up expired invitations', async () => {
      const mockExpiredInvitations = [
        { id: 'expired-1' },
        { id: 'expired-2' },
        { id: 'expired-3' }
      ];

      mockSupabase.from.mockReturnValueOnce({
        delete: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              is: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({
                  data: mockExpiredInvitations,
                  error: null
                })
              })
            })
          })
        })
      });

      const cleanedCount = await invitationManager.cleanupExpiredInvitations();

      expect(cleanedCount).toBe(3);
    });
  });
});