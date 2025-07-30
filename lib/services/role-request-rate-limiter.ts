/**
 * Role Request Rate Limiter Service
 * 
 * Implements rate limiting for role requests to prevent abuse and spam.
 * Uses multiple strategies including per-user, per-IP, and per-institution limits.
 */

import { UserRole } from '../types/role-management';
import { createClient } from '../supabase/server';

export interface RateLimitConfig {
  // Per-user limits
  maxRequestsPerUser: {
    perHour: number;
    perDay: number;
    perWeek: number;
  };
  
  // Per-IP limits
  maxRequestsPerIP: {
    perHour: number;
    perDay: number;
  };
  
  // Per-institution limits
  maxRequestsPerInstitution: {
    perHour: number;
    perDay: number;
  };
  
  // Role-specific limits
  roleSpecificLimits: Record<UserRole, {
    maxPerDay: number;
    cooldownHours: number;
  }>;
  
  // Burst protection
  burstProtection: {
    maxRequestsInWindow: number;
    windowSizeMinutes: number;
  };
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number; // seconds
  remainingRequests?: number;
  resetTime?: Date;
}

export interface RateLimitEntry {
  id: string;
  identifier: string; // userId, IP, or institutionId
  identifierType: 'user' | 'ip' | 'institution';
  requestCount: number;
  windowStart: Date;
  windowEnd: Date;
  lastRequest: Date;
  blocked: boolean;
  blockedUntil?: Date;
}

export class RoleRequestRateLimiter {
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequestsPerUser: {
        perHour: 5,
        perDay: 10,
        perWeek: 20
      },
      maxRequestsPerIP: {
        perHour: 20,
        perDay: 50
      },
      maxRequestsPerInstitution: {
        perHour: 100,
        perDay: 500
      },
      roleSpecificLimits: {
        [UserRole.STUDENT]: { maxPerDay: 2, cooldownHours: 1 },
        [UserRole.TEACHER]: { maxPerDay: 3, cooldownHours: 2 },
        [UserRole.DEPARTMENT_ADMIN]: { maxPerDay: 1, cooldownHours: 24 },
        [UserRole.INSTITUTION_ADMIN]: { maxPerDay: 1, cooldownHours: 72 },
        [UserRole.SYSTEM_ADMIN]: { maxPerDay: 1, cooldownHours: 168 }
      },
      burstProtection: {
        maxRequestsInWindow: 3,
        windowSizeMinutes: 5
      },
      ...config
    };
  }

  /**
   * Check if a role request is allowed based on rate limits
   */
  async checkRateLimit(
    userId: string,
    requestedRole: UserRole,
    institutionId: string,
    clientIP?: string
  ): Promise<RateLimitResult> {
    try {
      // Check user-specific rate limits
      const userCheck = await this.checkUserRateLimit(userId, requestedRole);
      if (!userCheck.allowed) {
        await this.logRateLimitViolation(userId, 'user', userCheck.reason || 'User rate limit exceeded');
        return userCheck;
      }

      // Check IP-based rate limits if IP is provided
      if (clientIP) {
        const ipCheck = await this.checkIPRateLimit(clientIP);
        if (!ipCheck.allowed) {
          await this.logRateLimitViolation(userId, 'ip', ipCheck.reason || 'IP rate limit exceeded', { clientIP });
          return ipCheck;
        }
      }

      // Check institution-wide rate limits
      const institutionCheck = await this.checkInstitutionRateLimit(institutionId);
      if (!institutionCheck.allowed) {
        await this.logRateLimitViolation(userId, 'institution', institutionCheck.reason || 'Institution rate limit exceeded');
        return institutionCheck;
      }

      // Check burst protection
      const burstCheck = await this.checkBurstProtection(userId);
      if (!burstCheck.allowed) {
        await this.logRateLimitViolation(userId, 'burst', burstCheck.reason || 'Burst protection triggered');
        return burstCheck;
      }

      // Check role-specific cooldown
      const cooldownCheck = await this.checkRoleCooldown(userId, requestedRole);
      if (!cooldownCheck.allowed) {
        await this.logRateLimitViolation(userId, 'cooldown', cooldownCheck.reason || 'Role cooldown active');
        return cooldownCheck;
      }

      // All checks passed - record the request
      await this.recordRequest(userId, requestedRole, institutionId, clientIP);

      return { allowed: true };

    } catch (error) {
      console.error('Error checking rate limit:', error);
      // Fail secure - deny the request if we can't check limits
      return {
        allowed: false,
        reason: 'Unable to verify rate limits due to system error'
      };
    }
  }

  /**
   * Get current rate limit status for a user
   */
  async getRateLimitStatus(userId: string): Promise<{
    hourlyRemaining: number;
    dailyRemaining: number;
    weeklyRemaining: number;
    nextResetTime: Date;
    activeCooldowns: Array<{ role: UserRole; expiresAt: Date }>;
  }> {
    const supabase = createClient();
    
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get request counts for different time windows
      const { data: requests, error } = await supabase
        .from('role_request_rate_limits')
        .select('created_at, requested_role')
        .eq('user_id', userId)
        .gte('created_at', oneWeekAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const hourlyCount = requests?.filter(r => new Date(r.created_at) >= oneHourAgo).length || 0;
      const dailyCount = requests?.filter(r => new Date(r.created_at) >= oneDayAgo).length || 0;
      const weeklyCount = requests?.length || 0;

      // Check active cooldowns
      const { data: cooldowns } = await supabase
        .from('role_request_cooldowns')
        .select('requested_role, expires_at')
        .eq('user_id', userId)
        .gt('expires_at', now.toISOString());

      const activeCooldowns = cooldowns?.map(c => ({
        role: c.requested_role as UserRole,
        expiresAt: new Date(c.expires_at)
      })) || [];

      // Calculate next reset time (next hour boundary)
      const nextResetTime = new Date(now);
      nextResetTime.setHours(nextResetTime.getHours() + 1, 0, 0, 0);

      return {
        hourlyRemaining: Math.max(0, this.config.maxRequestsPerUser.perHour - hourlyCount),
        dailyRemaining: Math.max(0, this.config.maxRequestsPerUser.perDay - dailyCount),
        weeklyRemaining: Math.max(0, this.config.maxRequestsPerUser.perWeek - weeklyCount),
        nextResetTime,
        activeCooldowns
      };

    } catch (error) {
      console.error('Error getting rate limit status:', error);
      return {
        hourlyRemaining: 0,
        dailyRemaining: 0,
        weeklyRemaining: 0,
        nextResetTime: new Date(),
        activeCooldowns: []
      };
    }
  }

  /**
   * Reset rate limits for a user (admin function)
   */
  async resetUserRateLimit(userId: string, adminId: string): Promise<void> {
    const supabase = createClient();
    
    try {
      // Remove rate limit entries
      await supabase
        .from('role_request_rate_limits')
        .delete()
        .eq('user_id', userId);

      // Remove cooldowns
      await supabase
        .from('role_request_cooldowns')
        .delete()
        .eq('user_id', userId);

      // Log the reset
      await supabase
        .from('rate_limit_admin_actions')
        .insert({
          user_id: userId,
          admin_id: adminId,
          action: 'reset_rate_limit',
          timestamp: new Date().toISOString()
        });

    } catch (error) {
      console.error('Error resetting user rate limit:', error);
      throw error;
    }
  }

  /**
   * Block a user from making role requests (admin function)
   */
  async blockUser(userId: string, adminId: string, reason: string, durationHours: number): Promise<void> {
    const supabase = createClient();
    
    try {
      const blockedUntil = new Date();
      blockedUntil.setHours(blockedUntil.getHours() + durationHours);

      await supabase
        .from('role_request_blocks')
        .upsert({
          user_id: userId,
          blocked_by: adminId,
          reason,
          blocked_at: new Date().toISOString(),
          blocked_until: blockedUntil.toISOString(),
          active: true
        });

      // Log the block action
      await supabase
        .from('rate_limit_admin_actions')
        .insert({
          user_id: userId,
          admin_id: adminId,
          action: 'block_user',
          reason,
          duration_hours: durationHours,
          timestamp: new Date().toISOString()
        });

    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  // Private helper methods

  private async checkUserRateLimit(userId: string, requestedRole: UserRole): Promise<RateLimitResult> {
    const supabase = createClient();
    
    try {
      // Check if user is blocked
      const { data: block } = await supabase
        .from('role_request_blocks')
        .select('blocked_until, reason')
        .eq('user_id', userId)
        .eq('active', true)
        .gt('blocked_until', new Date().toISOString())
        .single();

      if (block) {
        const blockedUntil = new Date(block.blocked_until);
        const retryAfter = Math.ceil((blockedUntil.getTime() - Date.now()) / 1000);
        
        return {
          allowed: false,
          reason: `User is blocked: ${block.reason}`,
          retryAfter
        };
      }

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get request counts
      const { data: requests, error } = await supabase
        .from('role_request_rate_limits')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', oneWeekAgo.toISOString());

      if (error) {
        throw error;
      }

      const hourlyCount = requests?.filter(r => new Date(r.created_at) >= oneHourAgo).length || 0;
      const dailyCount = requests?.filter(r => new Date(r.created_at) >= oneDayAgo).length || 0;
      const weeklyCount = requests?.length || 0;

      // Check hourly limit
      if (hourlyCount >= this.config.maxRequestsPerUser.perHour) {
        const nextHour = new Date(now);
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        const retryAfter = Math.ceil((nextHour.getTime() - now.getTime()) / 1000);
        
        return {
          allowed: false,
          reason: `Hourly limit exceeded (${hourlyCount}/${this.config.maxRequestsPerUser.perHour})`,
          retryAfter,
          resetTime: nextHour
        };
      }

      // Check daily limit
      if (dailyCount >= this.config.maxRequestsPerUser.perDay) {
        const nextDay = new Date(now);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        const retryAfter = Math.ceil((nextDay.getTime() - now.getTime()) / 1000);
        
        return {
          allowed: false,
          reason: `Daily limit exceeded (${dailyCount}/${this.config.maxRequestsPerUser.perDay})`,
          retryAfter,
          resetTime: nextDay
        };
      }

      // Check weekly limit
      if (weeklyCount >= this.config.maxRequestsPerUser.perWeek) {
        const nextWeek = new Date(oneWeekAgo);
        nextWeek.setDate(nextWeek.getDate() + 7);
        const retryAfter = Math.ceil((nextWeek.getTime() - now.getTime()) / 1000);
        
        return {
          allowed: false,
          reason: `Weekly limit exceeded (${weeklyCount}/${this.config.maxRequestsPerUser.perWeek})`,
          retryAfter,
          resetTime: nextWeek
        };
      }

      return {
        allowed: true,
        remainingRequests: this.config.maxRequestsPerUser.perHour - hourlyCount
      };

    } catch (error) {
      console.error('Error checking user rate limit:', error);
      return { allowed: false, reason: 'Unable to verify user rate limit' };
    }
  }

  private async checkIPRateLimit(clientIP: string): Promise<RateLimitResult> {
    const supabase = createClient();
    
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const { data: requests, error } = await supabase
        .from('role_request_rate_limits')
        .select('created_at')
        .eq('client_ip', clientIP)
        .gte('created_at', oneDayAgo.toISOString());

      if (error) {
        throw error;
      }

      const hourlyCount = requests?.filter(r => new Date(r.created_at) >= oneHourAgo).length || 0;
      const dailyCount = requests?.length || 0;

      // Check hourly limit
      if (hourlyCount >= this.config.maxRequestsPerIP.perHour) {
        const nextHour = new Date(now);
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        const retryAfter = Math.ceil((nextHour.getTime() - now.getTime()) / 1000);
        
        return {
          allowed: false,
          reason: `IP hourly limit exceeded (${hourlyCount}/${this.config.maxRequestsPerIP.perHour})`,
          retryAfter
        };
      }

      // Check daily limit
      if (dailyCount >= this.config.maxRequestsPerIP.perDay) {
        const nextDay = new Date(now);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        const retryAfter = Math.ceil((nextDay.getTime() - now.getTime()) / 1000);
        
        return {
          allowed: false,
          reason: `IP daily limit exceeded (${dailyCount}/${this.config.maxRequestsPerIP.perDay})`,
          retryAfter
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error checking IP rate limit:', error);
      return { allowed: false, reason: 'Unable to verify IP rate limit' };
    }
  }

  private async checkInstitutionRateLimit(institutionId: string): Promise<RateLimitResult> {
    const supabase = createClient();
    
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const { data: requests, error } = await supabase
        .from('role_request_rate_limits')
        .select('created_at')
        .eq('institution_id', institutionId)
        .gte('created_at', oneDayAgo.toISOString());

      if (error) {
        throw error;
      }

      const hourlyCount = requests?.filter(r => new Date(r.created_at) >= oneHourAgo).length || 0;
      const dailyCount = requests?.length || 0;

      // Check hourly limit
      if (hourlyCount >= this.config.maxRequestsPerInstitution.perHour) {
        return {
          allowed: false,
          reason: `Institution hourly limit exceeded (${hourlyCount}/${this.config.maxRequestsPerInstitution.perHour})`
        };
      }

      // Check daily limit
      if (dailyCount >= this.config.maxRequestsPerInstitution.perDay) {
        return {
          allowed: false,
          reason: `Institution daily limit exceeded (${dailyCount}/${this.config.maxRequestsPerInstitution.perDay})`
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error checking institution rate limit:', error);
      return { allowed: false, reason: 'Unable to verify institution rate limit' };
    }
  }

  private async checkBurstProtection(userId: string): Promise<RateLimitResult> {
    const supabase = createClient();
    
    try {
      const windowStart = new Date();
      windowStart.setMinutes(windowStart.getMinutes() - this.config.burstProtection.windowSizeMinutes);

      const { data: requests, error } = await supabase
        .from('role_request_rate_limits')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', windowStart.toISOString());

      if (error) {
        throw error;
      }

      const requestCount = requests?.length || 0;

      if (requestCount >= this.config.burstProtection.maxRequestsInWindow) {
        const retryAfter = this.config.burstProtection.windowSizeMinutes * 60;
        
        return {
          allowed: false,
          reason: `Burst protection triggered (${requestCount}/${this.config.burstProtection.maxRequestsInWindow} requests in ${this.config.burstProtection.windowSizeMinutes} minutes)`,
          retryAfter
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error checking burst protection:', error);
      return { allowed: false, reason: 'Unable to verify burst protection' };
    }
  }

  private async checkRoleCooldown(userId: string, requestedRole: UserRole): Promise<RateLimitResult> {
    const supabase = createClient();
    
    try {
      const { data: cooldown } = await supabase
        .from('role_request_cooldowns')
        .select('expires_at')
        .eq('user_id', userId)
        .eq('requested_role', requestedRole)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cooldown) {
        const expiresAt = new Date(cooldown.expires_at);
        const retryAfter = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
        
        return {
          allowed: false,
          reason: `Role cooldown active for ${requestedRole}`,
          retryAfter,
          resetTime: expiresAt
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error checking role cooldown:', error);
      return { allowed: true }; // Allow if we can't check cooldown
    }
  }

  private async recordRequest(
    userId: string,
    requestedRole: UserRole,
    institutionId: string,
    clientIP?: string
  ): Promise<void> {
    const supabase = createClient();
    
    try {
      // Record the rate limit entry
      await supabase
        .from('role_request_rate_limits')
        .insert({
          user_id: userId,
          requested_role: requestedRole,
          institution_id: institutionId,
          client_ip: clientIP,
          created_at: new Date().toISOString()
        });

      // Set cooldown for this role
      const roleConfig = this.config.roleSpecificLimits[requestedRole];
      if (roleConfig && roleConfig.cooldownHours > 0) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + roleConfig.cooldownHours);

        await supabase
          .from('role_request_cooldowns')
          .upsert({
            user_id: userId,
            requested_role: requestedRole,
            expires_at: expiresAt.toISOString(),
            created_at: new Date().toISOString()
          });
      }

    } catch (error) {
      console.error('Error recording request:', error);
      // Don't throw - this shouldn't block the request
    }
  }

  private async logRateLimitViolation(
    userId: string,
    violationType: string,
    reason: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const supabase = createClient();
    
    try {
      await supabase
        .from('rate_limit_violations')
        .insert({
          user_id: userId,
          violation_type: violationType,
          reason,
          metadata: metadata || {},
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging rate limit violation:', error);
    }
  }
}