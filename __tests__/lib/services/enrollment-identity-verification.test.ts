import { EnrollmentIdentityVerificationService } from '@/lib/services/enrollment-identity-verification';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  eq: jest.fn(),
  single: jest.fn()
};

// Mock the Supabase client creation
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

// Mock crypto module
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid-123')
}));

describe('EnrollmentIdentityVerificationService', () => {
  let service: EnrollmentIdentityVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    
    service = new EnrollmentIdentityVerificationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateVerification', () => {
    const mockOperation = {
      operation: 'bulk_enrollment' as const,
      userId: 'user-1',
      classId: 'class-1',
      metadata: { studentCount: 50 }
    };

    it('should skip verification for operations that do not require it', async () => {
      // Mock user with role that doesn't require verification for this operation
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'user-1', role: 'institution_admin', metadata: {} },
        error: null
      });

      const result = await service.initiateVerification('user-1', mockOperation);

      expect(result.success).toBe(true);
      expect(result.message).toContain('No verification required');
    });

    it('should initiate email verification successfully', async () => {
      // Mock user requiring verification
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'user-1', role: 'student', metadata: {} },
        error: null
      });

      // Mock user with email
      mockSupabase.single.mockResolvedValueOnce({
        data: { 
          id: 'user-1', 
          email: 'user@example.com', 
          phone: null, 
          metadata: {} 
        },
        error: null
      });

      // Mock challenge creation
      mockSupabase.insert.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.initiateVerification('user-1', mockOperation, 'email');

      expect(result.success).toBe(true);
      expect(result.challengeId).toBe('mock-uuid-123');
      expect(result.message).toContain('Verification challenge sent via email');
      expect(result.remainingAttempts).toBe(3);
    });

    it('should initiate SMS verification successfully', async () => {
      // Mock user requiring verification
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'user-1', role: 'student', metadata: {} },
        error: null
      });

      // Mock user with phone
      mockSupabase.single.mockResolvedValueOnce({
        data: { 
          id: 'user-1', 
          email: 'user@example.com', 
          phone: '+1234567890', 
          metadata: {} 
        },
        error: null
      });

      // Mock challenge creation
      mockSupabase.insert.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.initiateVerification('user-1', mockOperation, 'sms');

      expect(result.success).toBe(true);
      expect(result.challengeId).toBe('mock-uuid-123');
      expect(result.message).toContain('Verification challenge sent via sms');
    });

    it('should initiate security question verification', async () => {
      // Mock user requiring verification
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'user-1', role: 'student', metadata: {} },
        error: null
      });

      // Mock user with security questions
      mockSupabase.single.mockResolvedValueOnce({
        data: { 
          id: 'user-1', 
          email: 'user@example.com', 
          phone: null, 
          metadata: {
            security_questions: [
              { question: 'What is your pet\'s name?', answer: 'fluffy' }
            ]
          }
        },
        error: null
      });

      // Mock challenge creation
      mockSupabase.insert.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.initiateVerification('user-1', mockOperation, 'security_question');

      expect(result.success).toBe(true);
      expect(result.challengeId).toBe('mock-uuid-123');
      expect(result.remainingAttempts).toBe(2); // Security questions have lower max attempts
    });

    it('should fail when no verification methods available', async () => {
      // Mock user requiring verification
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'user-1', role: 'student', metadata: {} },
        error: null
      });

      // Mock user with no verification methods
      mockSupabase.single.mockResolvedValueOnce({
        data: { 
          id: 'user-1', 
          email: null, 
          phone: null, 
          metadata: {} 
        },
        error: null
      });

      const result = await service.initiateVerification('user-1', mockOperation);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No verification methods available');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.single.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.initiateVerification('user-1', mockOperation);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to initiate verification');
    });
  });

  describe('verifyChallenge', () => {
    const mockChallenge = {
      id: 'challenge-1',
      userId: 'user-1',
      type: 'email' as const,
      challenge: '123456',
      expiresAt: new Date(Date.now() + 600000), // 10 minutes from now
      attempts: 0,
      maxAttempts: 3,
      verified: false
    };

    it('should verify correct email code', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      // Mock update operations
      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      const result = await service.verifyChallenge('challenge-1', '123456', 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Identity verified successfully');
    });

    it('should reject incorrect code', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      const result = await service.verifyChallenge('challenge-1', '654321', 'user-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Verification failed. Please try again.');
      expect(result.remainingAttempts).toBe(2);
    });

    it('should handle expired challenges', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() - 60000).toISOString(), // Expired
          attempts: 0,
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ data: null, error: null });

      const result = await service.verifyChallenge('challenge-1', '123456', 'user-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Verification challenge has expired');
    });

    it('should handle already verified challenges', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 1,
          max_attempts: 3,
          verified: true
        },
        error: null
      });

      const result = await service.verifyChallenge('challenge-1', '123456', 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Challenge already verified');
    });

    it('should handle maximum attempts exceeded', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 3, // At max attempts
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      const result = await service.verifyChallenge('challenge-1', '654321', 'user-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Maximum verification attempts exceeded');
    });

    it('should reject unauthorized verification attempts', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-2', // Different user
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      const result = await service.verifyChallenge('challenge-1', '123456', 'user-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unauthorized verification attempt');
    });

    it('should handle invalid challenge IDs', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.verifyChallenge('invalid-challenge', '123456', 'user-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired verification challenge');
    });

    it('should verify security question answers', async () => {
      // Mock user with security questions
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'security_question',
          challenge_data: 'What is your pet\'s name?',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          max_attempts: 2,
          verified: false
        },
        error: null
      });

      // Mock user data for security question validation
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'user-1',
          metadata: {
            security_questions: [
              { question: 'What is your pet\'s name?', answer: 'fluffy' }
            ]
          }
        },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      const result = await service.verifyChallenge('challenge-1', 'Fluffy', 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Identity verified successfully');
    });

    it('should handle database errors during verification', async () => {
      mockSupabase.single.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.verifyChallenge('challenge-1', '123456', 'user-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Verification failed due to system error');
    });
  });

  describe('isChallengeVerified', () => {
    it('should return true for valid verified challenge', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 1,
          max_attempts: 3,
          verified: true
        },
        error: null
      });

      const isVerified = await service.isChallengeVerified('challenge-1', 'user-1');

      expect(isVerified).toBe(true);
    });

    it('should return false for unverified challenge', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 1,
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      const isVerified = await service.isChallengeVerified('challenge-1', 'user-1');

      expect(isVerified).toBe(false);
    });

    it('should return false for expired challenge', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() - 60000).toISOString(), // Expired
          attempts: 1,
          max_attempts: 3,
          verified: true
        },
        error: null
      });

      const isVerified = await service.isChallengeVerified('challenge-1', 'user-1');

      expect(isVerified).toBe(false);
    });

    it('should return false for wrong user', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-2', // Different user
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 1,
          max_attempts: 3,
          verified: true
        },
        error: null
      });

      const isVerified = await service.isChallengeVerified('challenge-1', 'user-1');

      expect(isVerified).toBe(false);
    });

    it('should return false for non-existent challenge', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      const isVerified = await service.isChallengeVerified('non-existent', 'user-1');

      expect(isVerified).toBe(false);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle null/undefined parameters', async () => {
      const result = await service.verifyChallenge('', '', '');

      expect(result.success).toBe(false);
    });

    it('should handle malformed challenge data', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: null, // Malformed
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      const result = await service.verifyChallenge('challenge-1', '123456', 'user-1');

      expect(result.success).toBe(false);
    });

    it('should handle concurrent verification attempts', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      const promises = Array.from({ length: 5 }, () =>
        service.verifyChallenge('challenge-1', '123456', 'user-1')
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });
    });

    it('should validate operation types', async () => {
      const invalidOperation = {
        operation: 'invalid_operation' as any,
        userId: 'user-1',
        metadata: {}
      };

      const result = await service.initiateVerification('user-1', invalidOperation);

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should handle case-insensitive security question answers', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'security_question',
          challenge_data: 'What is your pet\'s name?',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          max_attempts: 2,
          verified: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'user-1',
          metadata: {
            security_questions: [
              { question: 'What is your pet\'s name?', answer: 'fluffy' }
            ]
          }
        },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      const result = await service.verifyChallenge('challenge-1', 'FLUFFY', 'user-1');

      expect(result.success).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should complete verification initiation quickly', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 'user-1', role: 'student', email: 'user@example.com', metadata: {} },
        error: null
      });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      const operation = {
        operation: 'bulk_enrollment' as const,
        userId: 'user-1',
        metadata: {}
      };

      const startTime = Date.now();
      await service.initiateVerification('user-1', operation);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms
    });

    it('should handle multiple verification requests efficiently', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'challenge-1',
          user_id: 'user-1',
          type: 'email',
          challenge_data: '123456',
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          max_attempts: 3,
          verified: false
        },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      const startTime = Date.now();
      const promises = Array.from({ length: 10 }, () =>
        service.verifyChallenge('challenge-1', '123456', 'user-1')
      );
      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should handle 10 requests within 1 second
    });
  });
});