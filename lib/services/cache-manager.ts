/**
 * Cache Manager for enrollment system performance optimization
 * Handles caching strategies for class discovery and enrollment data
 */

interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize?: number;
  strategy: 'lru' | 'fifo' | 'ttl';
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export class CacheManager {
  private caches: Map<string, Map<string, CacheEntry<any>>> = new Map();
  private configs: Map<string, CacheConfig> = new Map();

  constructor() {
    this.initializeDefaultCaches();
  }

  private initializeDefaultCaches() {
    // Class discovery cache - 5 minutes TTL
    this.createCache('class-discovery', {
      ttl: 300,
      maxSize: 1000,
      strategy: 'lru'
    });

    // Enrollment data cache - 2 minutes TTL
    this.createCache('enrollment-data', {
      ttl: 120,
      maxSize: 500,
      strategy: 'ttl'
    });

    // Class details cache - 10 minutes TTL
    this.createCache('class-details', {
      ttl: 600,
      maxSize: 200,
      strategy: 'lru'
    });

    // Waitlist positions cache - 30 seconds TTL
    this.createCache('waitlist-positions', {
      ttl: 30,
      maxSize: 100,
      strategy: 'ttl'
    });

    // User eligibility cache - 5 minutes TTL
    this.createCache('user-eligibility', {
      ttl: 300,
      maxSize: 1000,
      strategy: 'lru'
    });
  }

  createCache(name: string, config: CacheConfig): void {
    this.caches.set(name, new Map());
    this.configs.set(name, config);
  }

  set<T>(cacheName: string, key: string, data: T): void {
    const cache = this.caches.get(cacheName);
    const config = this.configs.get(cacheName);
    
    if (!cache || !config) {
      throw new Error(`Cache ${cacheName} not found`);
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: config.ttl * 1000,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // Check if cache is at max size and evict if necessary
    if (config.maxSize && cache.size >= config.maxSize) {
      this.evict(cacheName, config);
    }

    cache.set(key, entry);
  }

  get<T>(cacheName: string, key: string): T | null {
    const cache = this.caches.get(cacheName);
    
    if (!cache) {
      return null;
    }

    const entry = cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      cache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.data;
  }

  invalidate(cacheName: string, key?: string): void {
    const cache = this.caches.get(cacheName);
    
    if (!cache) {
      return;
    }

    if (key) {
      cache.delete(key);
    } else {
      cache.clear();
    }
  }

  invalidatePattern(cacheName: string, pattern: string): void {
    const cache = this.caches.get(cacheName);
    
    if (!cache) {
      return;
    }

    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];

    for (const key of cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => cache.delete(key));
  }

  private evict(cacheName: string, config: CacheConfig): void {
    const cache = this.caches.get(cacheName);
    
    if (!cache) {
      return;
    }

    let keyToEvict: string | null = null;

    switch (config.strategy) {
      case 'lru':
        keyToEvict = this.findLRUKey(cache);
        break;
      case 'fifo':
        keyToEvict = this.findFIFOKey(cache);
        break;
      case 'ttl':
        keyToEvict = this.findExpiredKey(cache);
        break;
    }

    if (keyToEvict) {
      cache.delete(keyToEvict);
    }
  }

  private findLRUKey(cache: Map<string, CacheEntry<any>>): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  private findFIFOKey(cache: Map<string, CacheEntry<any>>): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  private findExpiredKey(cache: Map<string, CacheEntry<any>>): string | null {
    const now = Date.now();

    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        return key;
      }
    }

    return null;
  }

  getStats(cacheName: string) {
    const cache = this.caches.get(cacheName);
    const config = this.configs.get(cacheName);
    
    if (!cache || !config) {
      return null;
    }

    let hitCount = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const entry of cache.values()) {
      hitCount += entry.accessCount;
      if (now - entry.timestamp > entry.ttl) {
        expiredCount++;
      }
    }

    return {
      size: cache.size,
      maxSize: config.maxSize,
      hitCount,
      expiredCount,
      config
    };
  }

  cleanup(): void {
    const now = Date.now();

    for (const [cacheName, cache] of this.caches.entries()) {
      const keysToDelete: string[] = [];

      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => cache.delete(key));
    }
  }
}

export const cacheManager = new CacheManager();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  cacheManager.cleanup();
}, 5 * 60 * 1000);