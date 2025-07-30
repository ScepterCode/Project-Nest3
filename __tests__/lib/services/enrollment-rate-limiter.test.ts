import { EnrollmentRateLimiter } from '@/lib/services/enrollment-rate-limiter';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  lt: jest.fn(),
  single: jest.fn()
};

// Mock the Supabase client creation
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('EnrollmentRateLimiter', () => {
  let rateLimiter: EnrollmentRateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.upsert.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.lt.mockReturnValue(mockSupabase);
    
    rateLimiter = new EnrollmentRateLimiter();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      // Mock no existing rate limit entry
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await rateLimiter.checkRateLimit('user-1', 'enrollment_request');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(4); // 5 max - 1 used
      expect(result.blockedUntil).toBeUndefined();
    });

    it('should block requests when rate limit exceeded', async () => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 30000); // 30 seconds ago

      // Mock existing rate limit entry at max attempts
      mockSupabase.single.mockResolvedValue({
        data: {
          key: 'user-1:enrollment_request',
          attempts: 5, // At max limit
          window_start: windowStart.toISOString(),
          blocked_until: null
        },
        error: null
      });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await rateLimiter.checkRateLimit('user-1', 'enrollment_request');

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.blockedUntil).toBeDefined();
    });

    it('should respect existing block period', async () => {
      const now = new Date();
      const blockedUntil = new Date(now.getTime() + 300000); // 5 minutes from now

      // Mock blocked rate limit entry
      mockSupabase.single.mockResolvedValue({
        data: {
          key: 'user-1:enrollment_request',
          attempts: 6,
          window_start: new Date(now.getTime() - 60000).toISOString(),
          blocked_until: blockedUntil.toISOString()
        },
        error: null
      });

      const result = await rateLimiter.checkRateLimit('user-1', 'enrollment_request');

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.blockedUntil).toEqual(blockedUntil);
    });

    it('should reset window when time window expires', async () => {
      const now = new Date();
      const oldWindowStart = new Date(now.getTime() - 120000); // 2 minutes ago (outside 1-minute window)

      // Mock old rate limit entry
      mockSupabase.single.mockResolvedValue({
        data: {
          key: 'user-1:enrollment_request',
          attempts: 3,
          window_start: oldWindowStart.toISOString(),
          blocked_until: null
        },
        error: null
      });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await rateLimiter.checkRateLimit('user-1', 'enrollment_request');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(4); // Should reset to new window
    });

    it('should handle different rate limit configurations', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      // Test waitlist_join action (different limits)
      const result = await rateLimiter.checkRateLimit('user-1', 'waitlist_join');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(2); // 3 max - 1 used
    });

    it('should handle custom rate limit configuration', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const customConfig = {
        windowMs: 30000, // 30 seconds
        maxAttempts: 2,
        blockDurationMs: 60000 // 1 minute
      };

      const result = await rateLimiter.checkRateLimit('user-1', 'enrollment_request', customConfig);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(1); // 2 max - 1 used
    });

    it('should fail open on database errors', async () => {
      mockSupabase.single.mockRejectedValue(new Error('Database error'));

      const result = await rateLimiter.checkRateLimit('user-1', 'enrollment_request');

      expect(result.allowed).toBe(true); // Should fail open
      expect(result.remainingAttempts).toBeGreaterThan(0);
    });

    it('should throw error for unknown actions', async () => {
      await expect(
        rateLimiter.checkRateLimit('user-1', 'unknown_action')
      ).rejects.toThrow('Unknown rate limit action: unknown_action');
    });
  });

  describe('recordEnrollmentAttempt', () => {
    it('should record enrollment attempt successfully', async () => {
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      await rateLimiter.recordEnrollmentAttempt(
        'user-1',
        'class-1',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('enrollment_attempts');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          class_id: 'class-1',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0'
        })
      );
    });

    it('should handle recording errors gracefully', async () => {
      mockSupabase.insert.mockRejectedValue(new Error('Database error'));

      await expect(
        rateLimiter.recordEnrollmentAttempt('user-1', 'class-1')
      ).resolves.not.toThrow();
    });
  });

  describe('clearRateLimit', () => {
    it('should clear rate limit for user and action', async () => {
      mockSupabase.delete.mockResolvedValue({ data: null, error: null });

      await rateLimiter.clearRateLimit('user-1', 'enrollment_request');

      expect(mockSupabase.from).toHaveBeenCalledWith('rate_limit_entries');
      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(mockSupabase.eq).toHaveBeenCalledWith('key', 'user-1:enrollment_request');
    });

    it('should handle clear errors', async () => {
      mockSupabase.delete.mockRejectedValue(new Error('Database error'));

      await expect(
        rateLimiter.clearRateLimit('user-1', 'enrollment_request')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status for all actions', async () => {
      // Mock no existing entries (all actions allowed)
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      const status = await rateLimiter.getRateLimitStatus('user-1');

      expect(status).toHaveProperty('enrollment_request');
      expect(status).toHaveProperty('enrollment_submission');
      expect(status).toHaveProperty('waitlist_join');
      expect(status).toHaveProperty('class_search');
      expect(status).toHaveProperty('invitation_accept');

      Object.values(status).forEach(actionStatus => {
        expect(actionStatus.allowed).toBe(true);
        expect(actionStatus.remainingAttempts).toBeGreaterThan(0);
      });
    });

    it('should show blocked status for rate limited actions', async () => {
      const now = new Date();
      const blockedUntil = new Date(now.getTime() + 300000);

      // Mock blocked entry for enrollment_request
      mockSupabase.single.mockImplementation((query) => {
        if (query && query.includes && query.includes('user-1:enrollment_request')) {
          return Promise.resolve({
            data: {
              key: 'user-1:enrollment_request',
              attempts: 6,
              window_start: new Date(now.getTime() - 60000).toISOString(),
              blocked_until: blockedUntil.toISOString()
            },
            error: null
          });
        }
        return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
      });

      const status = await rateLimiter.getRateLimitStatus('user-1');

      expect(status.enrollment_request.allowed).toBe(false);
      expect(status.enrollment_request.blockedUntil).toEqual(blockedUntil);
      expect(status.enrollment_submission.allowed).toBe(true);
    });

    it('should handle status check errors gracefully', async () => {
      mockSupabase.single.mockRejectedValue(new Error('Database error'));

      const status = await rateLimiter.getRateLimitStatus('user-1');

      // Should return default allowed status on error
      Object.values(status).forEach(actionStatus => {
        expect(actionStatus.allowed).toBe(true);
        expect(actionStatus.remainingAttempts).toBeGreaterThan(0);
      });
    });
  });

  describe('checkIPRateLimit', () => {
    it('should check IP-based rate limiting', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await rateLimiter.checkIPRateLimit('192.168.1.1', 'enrollment_request');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(49); // 50 max - 1 used
    });

    it('should block IP when limit exceeded', async () => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 30000);

      mockSupabase.single.mockResolvedValue({
        data: {
          key: 'ip:192.168.1.1:enrollment_request',
          attempts: 50,
          window_start: windowStart.toISOString(),
          blocked_until: null
        },
        error: null
      });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await rateLimiter.checkIPRateLimit('192.168.1.1', 'enrollment_request');

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.blockedUntil).toBeDefined();
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should clean up expired entries', async () => {
      mockSupabase.delete.mockResolvedValue({ data: null, error: null });

      await rateLimiter.cleanupExpiredEntries();

      expect(mockSupabase.from).toHaveBeenCalledWith('rate_limit_entries');
      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(mockSupabase.lt).toHaveBeenCalledWith(
        'updated_at',
        expect.any(String)
      );
    });

    it('should handle cleanup errors', async () => {
      mockSupabase.delete.mockRejectedValue(new Error('Database error'));

      await expect(rateLimiter.cleanupExpiredEntries()).resolves.not.toThrow();
    });
  });

  describe('Static Methods', () => {
    it('should return rate limit configuration for known actions', () => {
      const config = EnrollmentRateLimiter.getRateLimitConfig('enrollment_request');

      expect(config).toBeDefined();
      expect(config?.maxAttempts).toBe(5);
      expect(config?.windowMs).toBe(60000);
      expect(config?.blockDurationMs).toBe(300000);
    });

    it('should return null for unknown actions', () => {
      const config = EnrollmentRateLimiter.getRateLimitConfig('unknown_action');

      expect(config).toBeNull();
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle malformed rate limit keys', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          key: 'malformed:key:with:colons',
          attempts: 1,
          window_start: new Date().toISOString(),
          blocked_until: null
        },
        error: null
      });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await rateLimiter.checkRateLimit('user-1', 'enrollment_request');

      expect(result).toBeDefined();
      expect(typeof result.allowed).toBe('boolean');
    });

    it('should handle concurrent rate limit checks', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const promises = Array.from({ length: 10 }, () =>
        rateLimiter.checkRateLimit('user-1', 'enrollment_request')
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.allowed).toBe('boolean');
      });
    });

    it('should validate input parameters', async () => {
      await expect(
        rateLimiter.checkRateLimit('', 'enrollment_request')
      ).rejects.toThrow();

      await expect(
        rateLimiter.checkRateLimit('user-1', '')
      ).rejects.toThrow();
    });

    it('should handle null/undefined timestamps', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          key: 'user-1:enrollment_request',
          attempts: 1,
          window_start: null,
          blocked_until: null
        },
        error: null
      });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await rateLimiter.checkRateLimit('user-1', 'enrollment_request');

      expect(result).toBeDefined();
      expect(typeof result.allowed).toBe('boolean');
    });
  });

  describe('Performance Tests', () => {
    it('should complete rate limit check quickly', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const startTime = Date.now();
      await rateLimiter.checkRateLimit('user-1', 'enrollment_request');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle high-frequency requests efficiently', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const startTime = Date.now();
      const promises = Array.from({ length: 100 }, () =>
        rateLimiter.checkRateLimit('user-1', 'enrollment_request')
      );
      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should handle 100 requests within 1 second
    });
  });
});