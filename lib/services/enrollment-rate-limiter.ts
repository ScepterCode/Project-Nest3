import { createClient } from '@/lib/supabase/server';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxAttempts: number; // Maximum attempts per window
  blockDurationMs: number; // How long to block after limit exceeded
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetTime: Date;
  blockedUntil?: Date;
}

export interface RateLimitEntry {
  key: string;
  attempts: number;
  windowStart: Date;
  blockedUntil?: Date;
}

export class EnrollmentRateLimiter {
  private supabase = createClient();
  
  // Default rate limit configurations
  private static readonly DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
    enrollment_request: {
      windowMs: 60 * 1000, // 1 minute
      maxAttempts: 5,
      blockDurationMs: 5 * 60 * 1000 // 5 minutes
    },
    enrollment_submission: {
      windowMs: 60 * 1000, // 1 minute
      maxAttempts: 10,
      blockDurationMs: 2 * 60 * 1000 // 2 minutes
    },
    waitlist_join: {
      windowMs: 30 * 1000, // 30 seconds
      maxAttempts: 3,
      blockDurationMs: 60 * 1000 // 1 minute
    },
    class_search: {
      windowMs: 60 * 1000, // 1 minute
      maxAttempts: 100,
      blockDurationMs: 60 * 1000 // 1 minute
    },
    invitation_accept: {
      windowMs: 60 * 1000, // 1 minute
      maxAttempts: 3,
      blockDurationMs: 5 * 60 * 1000 // 5 minutes
    }
  };

  /**
   * Check if an action is rate limited
   */
  async checkRateLimit(
    userId: string,
    action: string,
    customConfig?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const config = {
      ...EnrollmentRateLimiter.DEFAULT_CONFIGS[action],
      ...customConfig
    };

    if (!config) {
      throw new Error(`Unknown rate limit action: ${action}`);
    }

    const key = `${userId}:${action}`;
    const now = new Date();

    try {
      // Get current rate limit entry
      const entry = await this.getRateLimitEntry(key);

      // Check if currently blocked
      if (entry?.blockedUntil && entry.blockedUntil > now) {
        return {
          allowed: false,
          remainingAttempts: 0,
          resetTime: entry.blockedUntil,
          blockedUntil: entry.blockedUntil
        };
      }

      // Check if we need to reset the window
      const windowStart = new Date(now.getTime() - config.windowMs);
      let attempts = 0;
      let currentWindowStart = now;

      if (entry && entry.windowStart > windowStart) {
        // Within current window
        attempts = entry.attempts;
        currentWindowStart = entry.windowStart;
      }

      // Check if limit exceeded
      if (attempts >= config.maxAttempts) {
        const blockedUntil = new Date(now.getTime() + config.blockDurationMs);
        
        // Update entry with block
        await this.updateRateLimitEntry(key, {
          attempts: attempts + 1,
          windowStart: currentWindowStart,
          blockedUntil
        });

        return {
          allowed: false,
          remainingAttempts: 0,
          resetTime: blockedUntil,
          blockedUntil
        };
      }

      // Increment attempts
      await this.updateRateLimitEntry(key, {
        attempts: attempts + 1,
        windowStart: currentWindowStart
      });

      const resetTime = new Date(currentWindowStart.getTime() + config.windowMs);
      
      return {
        allowed: true,
        remainingAttempts: config.maxAttempts - attempts - 1,
        resetTime
      };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      // Fail open - allow the request but log the error
      return {
        allowed: true,
        remainingAttempts: config.maxAttempts - 1,
        resetTime: new Date(now.getTime() + config.windowMs)
      };
    }
  }

  /**
   * Record an enrollment attempt for rate limiting
   */
  async recordEnrollmentAttempt(
    userId: string,
    classId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('enrollment_attempts')
        .insert({
          user_id: userId,
          class_id: classId,
          ip_address: ipAddress,
          user_agent: userAgent,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error recording enrollment attempt:', error);
    }
  }

  /**
   * Get rate limit entry from database
   */
  private async getRateLimitEntry(key: string): Promise<RateLimitEntry | null> {
    try {
      const { data, error } = await this.supabase
        .from('rate_limit_entries')
        .select('*')
        .eq('key', key)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      if (!data) return null;

      return {
        key: data.key,
        attempts: data.attempts,
        windowStart: new Date(data.window_start),
        blockedUntil: data.blocked_until ? new Date(data.blocked_until) : undefined
      };
    } catch (error) {
      console.error('Error getting rate limit entry:', error);
      return null;
    }
  }

  /**
   * Update rate limit entry in database
   */
  private async updateRateLimitEntry(
    key: string,
    entry: Omit<RateLimitEntry, 'key'>
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('rate_limit_entries')
        .upsert({
          key,
          attempts: entry.attempts,
          window_start: entry.windowStart.toISOString(),
          blocked_until: entry.blockedUntil?.toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating rate limit entry:', error);
      throw error;
    }
  }

  /**
   * Clear rate limit for a user and action (admin function)
   */
  async clearRateLimit(userId: string, action: string): Promise<void> {
    const key = `${userId}:${action}`;
    
    try {
      await this.supabase
        .from('rate_limit_entries')
        .delete()
        .eq('key', key);
    } catch (error) {
      console.error('Error clearing rate limit:', error);
      throw error;
    }
  }

  /**
   * Get rate limit status for a user
   */
  async getRateLimitStatus(userId: string): Promise<Record<string, RateLimitResult>> {
    const actions = Object.keys(EnrollmentRateLimiter.DEFAULT_CONFIGS);
    const status: Record<string, RateLimitResult> = {};

    for (const action of actions) {
      try {
        // Check without incrementing
        const key = `${userId}:${action}`;
        const entry = await this.getRateLimitEntry(key);
        const config = EnrollmentRateLimiter.DEFAULT_CONFIGS[action];
        const now = new Date();

        if (entry?.blockedUntil && entry.blockedUntil > now) {
          status[action] = {
            allowed: false,
            remainingAttempts: 0,
            resetTime: entry.blockedUntil,
            blockedUntil: entry.blockedUntil
          };
        } else {
          const windowStart = new Date(now.getTime() - config.windowMs);
          const attempts = entry && entry.windowStart > windowStart ? entry.attempts : 0;
          const resetTime = entry ? 
            new Date(entry.windowStart.getTime() + config.windowMs) :
            new Date(now.getTime() + config.windowMs);

          status[action] = {
            allowed: attempts < config.maxAttempts,
            remainingAttempts: Math.max(0, config.maxAttempts - attempts),
            resetTime
          };
        }
      } catch (error) {
        console.error(`Error getting rate limit status for ${action}:`, error);
        status[action] = {
          allowed: true,
          remainingAttempts: EnrollmentRateLimiter.DEFAULT_CONFIGS[action].maxAttempts,
          resetTime: new Date(Date.now() + EnrollmentRateLimiter.DEFAULT_CONFIGS[action].windowMs)
        };
      }
    }

    return status;
  }

  /**
   * Clean up expired rate limit entries
   */
  async cleanupExpiredEntries(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      await this.supabase
        .from('rate_limit_entries')
        .delete()
        .lt('updated_at', cutoffTime.toISOString());
    } catch (error) {
      console.error('Error cleaning up expired rate limit entries:', error);
    }
  }

  /**
   * Get rate limit configuration for an action
   */
  static getRateLimitConfig(action: string): RateLimitConfig | null {
    return EnrollmentRateLimiter.DEFAULT_CONFIGS[action] || null;
  }

  /**
   * Check if IP address is rate limited
   */
  async checkIPRateLimit(ipAddress: string, action: string): Promise<RateLimitResult> {
    const config = {
      windowMs: 60 * 1000, // 1 minute
      maxAttempts: 50, // Higher limit for IP-based limiting
      blockDurationMs: 10 * 60 * 1000 // 10 minutes
    };

    return this.checkRateLimit(`ip:${ipAddress}`, action, config);
  }
}