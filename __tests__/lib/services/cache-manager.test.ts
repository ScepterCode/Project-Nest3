/**
 * Unit tests for Cache Manager
 */

import { CacheManager } from '@/lib/services/cache-manager';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  describe('Basic Cache Operations', () => {
    it('should set and get cache values', () => {
      const testData = { id: '1', name: 'Test' };
      
      cacheManager.set('test-cache', 'key1', testData);
      const result = cacheManager.get('test-cache', 'key1');
      
      expect(result).toEqual(testData);
    });

    it('should return null for non-existent keys', () => {
      const result = cacheManager.get('test-cache', 'non-existent');
      expect(result).toBeNull();
    });

    it('should handle cache invalidation', () => {
      const testData = { id: '1', name: 'Test' };
      
      cacheManager.set('test-cache', 'key1', testData);
      expect(cacheManager.get('test-cache', 'key1')).toEqual(testData);
      
      cacheManager.invalidate('test-cache', 'key1');
      expect(cacheManager.get('test-cache', 'key1')).toBeNull();
    });

    it('should handle TTL expiration', async () => {
      // Create cache with very short TTL
      cacheManager.createCache('ttl-test', {
        ttl: 0.1, // 0.1 seconds
        strategy: 'ttl'
      });

      const testData = { id: '1', name: 'Test' };
      cacheManager.set('ttl-test', 'key1', testData);
      
      // Should be available immediately
      expect(cacheManager.get('ttl-test', 'key1')).toEqual(testData);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      expect(cacheManager.get('ttl-test', 'key1')).toBeNull();
    });

    it('should provide cache statistics', () => {
      cacheManager.createCache('stats-test', {
        ttl: 300,
        maxSize: 10,
        strategy: 'lru'
      });

      // Add some data
      for (let i = 0; i < 5; i++) {
        cacheManager.set('stats-test', `key${i}`, { value: i });
      }

      // Access some data to generate hit counts
      cacheManager.get('stats-test', 'key0');
      cacheManager.get('stats-test', 'key1');

      const stats = cacheManager.getStats('stats-test');
      
      expect(stats).toBeDefined();
      expect(stats?.size).toBe(5);
      expect(stats?.hitCount).toBeGreaterThan(0);
    });
  });

  describe('Cache Strategies', () => {
    it('should handle LRU eviction', () => {
      cacheManager.createCache('lru-test', {
        ttl: 300,
        maxSize: 3,
        strategy: 'lru'
      });

      // Fill cache to capacity
      cacheManager.set('lru-test', 'key1', { value: 1 });
      cacheManager.set('lru-test', 'key2', { value: 2 });
      cacheManager.set('lru-test', 'key3', { value: 3 });

      // Access key1 to make it recently used
      cacheManager.get('lru-test', 'key1');

      // Add another item, should evict key2 (least recently used)
      cacheManager.set('lru-test', 'key4', { value: 4 });

      expect(cacheManager.get('lru-test', 'key1')).toBeDefined(); // Should still exist
      expect(cacheManager.get('lru-test', 'key2')).toBeNull(); // Should be evicted
      expect(cacheManager.get('lru-test', 'key3')).toBeDefined(); // Should still exist
      expect(cacheManager.get('lru-test', 'key4')).toBeDefined(); // Should exist
    });

    it('should handle pattern-based invalidation', () => {
      const testData = { value: 'test' };
      
      // Set multiple keys with patterns
      cacheManager.set('test-cache', 'user:1:profile', testData);
      cacheManager.set('test-cache', 'user:1:settings', testData);
      cacheManager.set('test-cache', 'user:2:profile', testData);
      cacheManager.set('test-cache', 'class:1:details', testData);

      // Invalidate user:1 pattern
      cacheManager.invalidatePattern('test-cache', 'user:1:.*');

      // Check results
      expect(cacheManager.get('test-cache', 'user:1:profile')).toBeNull();
      expect(cacheManager.get('test-cache', 'user:1:settings')).toBeNull();
      expect(cacheManager.get('test-cache', 'user:2:profile')).toBeDefined();
      expect(cacheManager.get('test-cache', 'class:1:details')).toBeDefined();
    });
  });
});