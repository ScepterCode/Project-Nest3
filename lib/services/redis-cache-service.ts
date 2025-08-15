import Redis from 'ioredis';
import { createHash } from 'crypto';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTTL?: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  averageResponseTime: number;
}

export class RedisCacheService {
  private redis: Redis;
  private metrics: CacheMetrics;
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = {
      defaultTTL: 3600, // 1 hour default
      keyPrefix: 'app:',
      ...config
    };

    this.redis = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db || 0,
      keyPrefix: this.config.keyPrefix,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      averageResponseTime: 0
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      console.log('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.redis.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });
  }

  /**
   * Get cached data with automatic JSON parsing
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      const cached = await this.redis.get(key);
      const responseTime = Date.now() - startTime;
      
      this.updateMetrics(cached !== null, responseTime);
      
      if (cached === null) {
        return null;
      }

      try {
        return JSON.parse(cached) as T;
      } catch {
        // Return as string if not valid JSON
        return cached as unknown as T;
      }
    } catch (error) {
      console.error('Cache get error:', error);
      this.updateMetrics(false, Date.now() - startTime);
      return null;
    }
  }

  /**
   * Set cached data with automatic JSON serialization
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      const expiration = ttl || this.config.defaultTTL!;
      
      await this.redis.setex(key, expiration, serializedValue);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete cached data
   */
  async del(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      
      const result = await this.redis.del(...keys);
      return result;
    } catch (error) {
      console.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  /**
   * Get or set cached data with a fallback function
   */
  async getOrSet<T>(
    key: string, 
    fallback: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const fresh = await fallback();
    await this.set(key, fresh, ttl);
    return fresh;
  }

  /**
   * Increment a counter
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, amount);
    } catch (error) {
      console.error('Cache increment error:', error);
      return 0;
    }
  }

  /**
   * Set expiration for a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.error('Cache expire error:', error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset cache metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      averageResponseTime: 0
    };
  }

  /**
   * Generate cache key with hash for complex objects
   */
  generateKey(prefix: string, identifier: string | object): string {
    if (typeof identifier === 'string') {
      return `${prefix}:${identifier}`;
    }
    
    const hash = createHash('md5')
      .update(JSON.stringify(identifier))
      .digest('hex');
    
    return `${prefix}:${hash}`;
  }

  /**
   * Batch get multiple keys
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys);
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      });
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Batch set multiple key-value pairs
   */
  async mset(pairs: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();
      
      pairs.forEach(({ key, value, ttl }) => {
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        const expiration = ttl || this.config.defaultTTL!;
        pipeline.setex(key, expiration, serializedValue);
      });
      
      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Cache mset error:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  private updateMetrics(hit: boolean, responseTime: number): void {
    this.metrics.totalRequests++;
    
    if (hit) {
      this.metrics.hits++;
    } else {
      this.metrics.misses++;
    }
    
    this.metrics.hitRate = this.metrics.hits / this.metrics.totalRequests;
    
    // Calculate rolling average response time
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime) / 
      this.metrics.totalRequests;
  }
}

// Singleton instance
let cacheInstance: RedisCacheService | null = null;

export function getCacheService(): RedisCacheService {
  if (!cacheInstance) {
    const config: CacheConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'app:',
      defaultTTL: parseInt(process.env.REDIS_DEFAULT_TTL || '3600')
    };
    
    cacheInstance = new RedisCacheService(config);
  }
  
  return cacheInstance;
}