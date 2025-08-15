// import { getCacheService } from './redis-cache-service'; // Disabled for build
import { createClient } from '@/lib/supabase/server';

export interface CacheStrategy {
  // User-specific caching
  cacheUserProfile(userId: string, ttl?: number): Promise<void>;
  getUserProfile(userId: string): Promise<any>;
  invalidateUserCache(userId: string): Promise<void>;
  
  // Institution-level caching
  cacheInstitutionData(institutionId: string, ttl?: number): Promise<void>;
  getInstitutionData(institutionId: string): Promise<any>;
  invalidateInstitutionCache(institutionId: string): Promise<void>;
  
  // Class and enrollment caching
  cacheUserClasses(userId: string, ttl?: number): Promise<void>;
  getUserClasses(userId: string): Promise<any>;
  cacheClassEnrollments(classId: string, ttl?: number): Promise<void>;
  getClassEnrollments(classId: string): Promise<any>;
  
  // Analytics caching
  cacheAnalyticsData(key: string, data: any, ttl?: number): Promise<void>;
  getAnalyticsData(key: string): Promise<any>;
  
  // System-wide caching
  cacheSystemHealth(ttl?: number): Promise<void>;
  getSystemHealth(): Promise<any>;
}

export class CacheStrategyService implements CacheStrategy {
  private memoryCache = new Map<string, { data: any; expires: number }>();
  
  private isExpired(item: { expires: number }): boolean {
    return Date.now() > item.expires;
  }
  
  private setCache(key: string, data: any, ttl: number = 300000): void {
    this.memoryCache.set(key, {
      data,
      expires: Date.now() + ttl
    });
  }
  
  private getCache(key: string): any {
    const item = this.memoryCache.get(key);
    if (!item || this.isExpired(item)) {
      this.memoryCache.delete(key);
      return null;
    }
    return item.data;
  }
  private cache = getCacheService();
  
  // Cache TTL constants (in seconds)
  private readonly TTL = {
    USER_PROFILE: 1800,      // 30 minutes
    INSTITUTION: 3600,       // 1 hour
    CLASSES: 900,            // 15 minutes
    ENROLLMENTS: 600,        // 10 minutes
    ANALYTICS: 300,          // 5 minutes
    SYSTEM_HEALTH: 60        // 1 minute
  };

  // User Profile Caching
  async cacheUserProfile(userId: string, ttl: number = this.TTL.USER_PROFILE): Promise<void> {
    const supabase = createClient();
    
    const { data: profile } = await supabase
      .from('users')
      .select(`
        *,
        user_roles (
          role,
          institution_id,
          department_id,
          is_active,
          assigned_at,
          expires_at
        ),
        institutions (
          id,
          name,
          domain
        )
      `)
      .eq('id', userId)
      .single();

    if (profile) {
      await this.cache.set(`user:profile:${userId}`, profile, ttl);
    }
  }

  async getUserProfile(userId: string): Promise<any> {
    return await this.cache.getOrSet(
      `user:profile:${userId}`,
      () => this.fetchUserProfile(userId),
      this.TTL.USER_PROFILE
    );
  }

  private async fetchUserProfile(userId: string): Promise<any> {
    const supabase = createClient();
    
    const { data: profile } = await supabase
      .from('users')
      .select(`
        *,
        user_roles (
          role,
          institution_id,
          department_id,
          is_active,
          assigned_at,
          expires_at
        ),
        institutions (
          id,
          name,
          domain
        )
      `)
      .eq('id', userId)
      .single();

    return profile;
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.cache.delPattern(`user:*:${userId}`);
  }

  // Institution Caching
  async cacheInstitutionData(institutionId: string, ttl: number = this.TTL.INSTITUTION): Promise<void> {
    const supabase = createClient();
    
    const { data: institution } = await supabase
      .from('institutions')
      .select(`
        *,
        departments (*),
        classes (
          id,
          name,
          code,
          status,
          created_at
        )
      `)
      .eq('id', institutionId)
      .single();

    if (institution) {
      await this.cache.set(`institution:${institutionId}`, institution, ttl);
      
      // Cache department count
      const departmentCount = institution.departments?.length || 0;
      await this.cache.set(`institution:${institutionId}:dept_count`, departmentCount, ttl);
      
      // Cache class count
      const classCount = institution.classes?.length || 0;
      await this.cache.set(`institution:${institutionId}:class_count`, classCount, ttl);
    }
  }

  async getInstitutionData(institutionId: string): Promise<any> {
    return await this.cache.getOrSet(
      `institution:${institutionId}`,
      () => this.fetchInstitutionData(institutionId),
      this.TTL.INSTITUTION
    );
  }

  private async fetchInstitutionData(institutionId: string): Promise<any> {
    const supabase = createClient();
    
    const { data: institution } = await supabase
      .from('institutions')
      .select(`
        *,
        departments (*),
        classes (
          id,
          name,
          code,
          status,
          created_at
        )
      `)
      .eq('id', institutionId)
      .single();

    return institution;
  }

  async invalidateInstitutionCache(institutionId: string): Promise<void> {
    await this.cache.delPattern(`institution:${institutionId}*`);
  }

  // Class and Enrollment Caching
  async cacheUserClasses(userId: string, ttl: number = this.TTL.CLASSES): Promise<void> {
    const supabase = createClient();
    
    const { data: classes } = await supabase
      .from('enrollments')
      .select(`
        *,
        classes (
          id,
          name,
          code,
          description,
          status,
          created_at,
          institutions (name)
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (classes) {
      await this.cache.set(`user:classes:${userId}`, classes, ttl);
    }
  }

  async getUserClasses(userId: string): Promise<any> {
    return await this.cache.getOrSet(
      `user:classes:${userId}`,
      () => this.fetchUserClasses(userId),
      this.TTL.CLASSES
    );
  }

  private async fetchUserClasses(userId: string): Promise<any> {
    const supabase = createClient();
    
    const { data: classes } = await supabase
      .from('enrollments')
      .select(`
        *,
        classes (
          id,
          name,
          code,
          description,
          status,
          created_at,
          institutions (name)
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    return classes;
  }

  async cacheClassEnrollments(classId: string, ttl: number = this.TTL.ENROLLMENTS): Promise<void> {
    const supabase = createClient();
    
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select(`
        *,
        users (
          id,
          email,
          full_name,
          user_roles (role)
        )
      `)
      .eq('class_id', classId)
      .eq('is_active', true);

    if (enrollments) {
      await this.cache.set(`class:enrollments:${classId}`, enrollments, ttl);
      
      // Cache enrollment count
      await this.cache.set(`class:enrollment_count:${classId}`, enrollments.length, ttl);
    }
  }

  async getClassEnrollments(classId: string): Promise<any> {
    return await this.cache.getOrSet(
      `class:enrollments:${classId}`,
      () => this.fetchClassEnrollments(classId),
      this.TTL.ENROLLMENTS
    );
  }

  private async fetchClassEnrollments(classId: string): Promise<any> {
    const supabase = createClient();
    
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select(`
        *,
        users (
          id,
          email,
          full_name,
          user_roles (role)
        )
      `)
      .eq('class_id', classId)
      .eq('is_active', true);

    return enrollments;
  }

  // Analytics Caching
  async cacheAnalyticsData(key: string, data: any, ttl: number = this.TTL.ANALYTICS): Promise<void> {
    await this.cache.set(`analytics:${key}`, data, ttl);
  }

  async getAnalyticsData(key: string): Promise<any> {
    return await this.cache.get(`analytics:${key}`);
  }

  // System Health Caching
  async cacheSystemHealth(ttl: number = this.TTL.SYSTEM_HEALTH): Promise<void> {
    const supabase = createClient();
    
    try {
      // Test database connectivity
      const { data: dbTest } = await supabase
        .from('institutions')
        .select('count')
        .limit(1);

      // Get basic system metrics
      const systemHealth = {
        database: {
          status: dbTest ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString()
        },
        cache: {
          status: 'healthy',
          metrics: this.cache.getMetrics()
        },
        timestamp: new Date().toISOString()
      };

      await this.cache.set('system:health', systemHealth, ttl);
    } catch (error) {
      const systemHealth = {
        database: {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        },
        cache: {
          status: 'healthy',
          metrics: this.cache.getMetrics()
        },
        timestamp: new Date().toISOString()
      };

      await this.cache.set('system:health', systemHealth, ttl);
    }
  }

  async getSystemHealth(): Promise<any> {
    return await this.cache.getOrSet(
      'system:health',
      () => this.generateSystemHealth(),
      this.TTL.SYSTEM_HEALTH
    );
  }

  private async generateSystemHealth(): Promise<any> {
    const supabase = createClient();
    
    try {
      const { data: dbTest } = await supabase
        .from('institutions')
        .select('count')
        .limit(1);

      return {
        database: {
          status: dbTest ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString()
        },
        cache: {
          status: 'healthy',
          metrics: this.cache.getMetrics()
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        database: {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        },
        cache: {
          status: 'healthy',
          metrics: this.cache.getMetrics()
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  // Batch cache operations
  async warmupUserCache(userId: string): Promise<void> {
    await Promise.all([
      this.cacheUserProfile(userId),
      this.cacheUserClasses(userId)
    ]);
  }

  async warmupInstitutionCache(institutionId: string): Promise<void> {
    await this.cacheInstitutionData(institutionId);
  }

  // Cache invalidation patterns
  async invalidateUserRelatedCache(userId: string): Promise<void> {
    await this.cache.delPattern(`user:*:${userId}`);
  }

  async invalidateClassRelatedCache(classId: string): Promise<void> {
    await this.cache.delPattern(`class:*:${classId}`);
  }

  async invalidateAnalyticsCache(pattern?: string): Promise<void> {
    const deletePattern = pattern ? `analytics:${pattern}` : 'analytics:*';
    await this.cache.delPattern(deletePattern);
  }

  // Get cache statistics
  async getCacheStatistics(): Promise<any> {
    const metrics = this.cache.getMetrics();
    
    return {
      ...metrics,
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance
let cacheStrategyInstance: CacheStrategyService | null = null;

export function getCacheStrategy(): CacheStrategyService {
  if (!cacheStrategyInstance) {
    cacheStrategyInstance = new CacheStrategyService();
  }
  
  return cacheStrategyInstance;
}