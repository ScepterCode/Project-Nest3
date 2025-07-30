/**
 * Cache Performance Tests
 * Tests caching strategies and performance optimization
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { cacheManager } from '@/lib/services/cache-manager';
import { performanceMonitor } from '@/lib/services/performance-monitor';

describe('Cache Performance Tests', () => {
  beforeEach(() => {
    // Clear all caches before each test
    cacheManager.invalidate('class-discovery');
    cacheManager.invalidate('class-details');
    cacheManager.invalidate('user-eligibility');
    cacheManager.invalidate('enrollment-data');
    cacheManager.invalidate('waitlist-positions');
  });

  afterEach(() => {
    // Clean up after each test
    cacheManager.invalidate('class-discovery');
    cacheManager.invalidate('class-details');
    cacheManager.invalidate('user-eligibility');
    cacheManager.invalidate('enrollment-data');
    cacheManager.invalidate('waitlist-positions');
  });

  describe('Cache Hit Performance', () => {
    it('should provide significant performance improvement on cache hits', async () => {
      const testData = { 
        classes: [
          { id: '1', name: 'Test Class 1' },
          { id: '2', name: 'Test Class 2' }
        ],
        total: 2 
      };
      const cacheKey = 'test-search-key';

      // First access (cache miss) - simulate slow operation
      const missStartTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate 100ms operation
      cacheManager.set('class-discovery', cacheKey, testData);
      const missDuration = Date.now() - missStartTime;

      // Second access (cache hit)
      const hitStartTime = Date.now();
      const cachedResult = cacheManager.get('class-discovery', cacheKey);
      const hitDuration = Date.now() - hitStartTime;

      expect(cachedResult).toEqual(testData);
      expect(hitDuration).toBeLessThan(missDuration * 0.1); // Cache hit should be 10x faster
      
      const performanceImprovement = ((missDuration - hitDuration) / missDuration) * 100;
      expect(performanceImprovement).toBeGreaterThan(90); // At least 90% improvement

      await performanceMonitor.recordMetric('cache_hit_performance_improvement', performanceImprovement, '%', {
        missDuration,
        hitDuration,
        cacheKey
      });
    });

    it('should handle high-frequency cache operations efficiently', async () => {
      const operations = 1000;
      const testData = { value: 'test-data' };
      
      const startTime = Date.now();
      
      // Perform many cache operations
      for (let i = 0; i < operations; i++) {
        const key = `key-${i % 10}`; // Use 10 different keys to test cache efficiency
        
        if (i % 10 === 0) {
          // Set operation (10% of operations)
          cacheManager.set('class-discovery', key, { ...testData, id: i });
        } else {
          // Get operation (90% of operations)
          cacheManager.get('class-discovery', key);
        }
      }
      
      const totalDuration = Date.now() - startTime;
      const averageOperationTime = totalDuration / operations;
      
      expect(averageOperationTime).toBeLessThan(1); // Less than 1ms per operation
      expect(totalDuration).toBeLessThan(100); // Total under 100ms
      
      await performanceMonitor.recordMetric('cache_operation_performance', averageOperationTime, 'ms', {
        operations,
        totalDuration
      });
    });

    it('should maintain performance under memory pressure', async () => {
      const largeDataSize = 1000; // Number of large objects to cache
      const largeObject = {
        data: new Array(1000).fill('x').join(''), // 1KB string
        metadata: new Array(100).fill({ key: 'value', timestamp: Date.now() })
      };

      const startTime = Date.now();
      
      // Fill cache with large objects
      for (let i = 0; i < largeDataSize; i++) {
        cacheManager.set('class-discovery', `large-key-${i}`, {
          ...largeObject,
          id: i
        });
      }
      
      const fillDuration = Date.now() - startTime;
      
      // Test retrieval performance after cache is full
      const retrievalStartTime = Date.now();
      const retrievalResults = [];
      
      for (let i = 0; i < 100; i++) {
        const key = `large-key-${i}`;
        const result = cacheManager.get('class-discovery', key);
        retrievalResults.push(result);
      }
      
      const retrievalDuration = Date.now() - retrievalStartTime;
      const averageRetrievalTime = retrievalDuration / 100;
      
      expect(averageRetrievalTime).toBeLessThan(5); // Less than 5ms per retrieval
      expect(retrievalResults.filter(r => r !== null)).toHaveLength(100); // All should be found
      
      await performanceMonitor.recordMetric('cache_memory_pressure_performance', averageRetrievalTime, 'ms', {
        largeDataSize,
        fillDuration,
        retrievalDuration,
        objectSize: JSON.stringify(largeObject).length
      });
    });
  });

  describe('Cache Eviction Performance', () => {
    it('should handle LRU eviction efficiently', async () => {
      // Create cache with small max size for testing
      cacheManager.createCache('test-lru', {
        ttl: 300,
        maxSize: 10,
        strategy: 'lru'
      });

      const startTime = Date.now();
      
      // Add more items than cache size to trigger eviction
      for (let i = 0; i < 20; i++) {
        cacheManager.set('test-lru', `key-${i}`, { value: i });
        
        // Access some keys to affect LRU order
        if (i > 5) {
          cacheManager.get('test-lru', `key-${i - 5}`);
        }
      }
      
      const evictionDuration = Date.now() - startTime;
      
      // Check that cache size is maintained
      const stats = cacheManager.getStats('test-lru');
      expect(stats?.size).toBeLessThanOrEqual(10);
      
      // Eviction should be fast
      expect(evictionDuration).toBeLessThan(50); // Less than 50ms for 20 operations
      
      await performanceMonitor.recordMetric('cache_eviction_performance', evictionDuration, 'ms', {
        itemsAdded: 20,
        maxCacheSize: 10,
        finalCacheSize: stats?.size
      });
    });

    it('should handle TTL expiration efficiently', async () => {
      // Create cache with short TTL for testing
      cacheManager.createCache('test-ttl', {
        ttl: 1, // 1 second TTL
        maxSize: 100,
        strategy: 'ttl'
      });

      // Add items to cache
      const itemCount = 50;
      for (let i = 0; i < itemCount; i++) {
        cacheManager.set('test-ttl', `ttl-key-${i}`, { value: i });
      }

      // Wait for items to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const cleanupStartTime = Date.now();
      
      // Trigger cleanup by accessing cache
      cacheManager.cleanup();
      
      const cleanupDuration = Date.now() - cleanupStartTime;
      
      // Check that expired items are removed
      const remainingItems = [];
      for (let i = 0; i < itemCount; i++) {
        const item = cacheManager.get('test-ttl', `ttl-key-${i}`);
        if (item !== null) {
          remainingItems.push(item);
        }
      }
      
      expect(remainingItems).toHaveLength(0); // All items should be expired
      expect(cleanupDuration).toBeLessThan(20); // Cleanup should be fast
      
      await performanceMonitor.recordMetric('cache_ttl_cleanup_performance', cleanupDuration, 'ms', {
        expiredItems: itemCount,
        remainingItems: remainingItems.length
      });
    });
  });

  describe('Cache Pattern Performance', () => {
    it('should handle cache invalidation patterns efficiently', async () => {
      const baseKey = 'pattern-test';
      const itemCount = 100;
      
      // Add items with pattern-based keys
      for (let i = 0; i < itemCount; i++) {
        cacheManager.set('class-discovery', `${baseKey}-${i}`, { value: i });
        cacheManager.set('class-discovery', `other-key-${i}`, { value: i });
      }
      
      const invalidationStartTime = Date.now();
      
      // Invalidate items matching pattern
      cacheManager.invalidatePattern('class-discovery', `${baseKey}-.*`);
      
      const invalidationDuration = Date.now() - invalidationStartTime;
      
      // Check that pattern-matched items are removed
      let patternItemsRemaining = 0;
      let otherItemsRemaining = 0;
      
      for (let i = 0; i < itemCount; i++) {
        if (cacheManager.get('class-discovery', `${baseKey}-${i}`) !== null) {
          patternItemsRemaining++;
        }
        if (cacheManager.get('class-discovery', `other-key-${i}`) !== null) {
          otherItemsRemaining++;
        }
      }
      
      expect(patternItemsRemaining).toBe(0); // Pattern items should be removed
      expect(otherItemsRemaining).toBe(itemCount); // Other items should remain
      expect(invalidationDuration).toBeLessThan(50); // Invalidation should be fast
      
      await performanceMonitor.recordMetric('cache_pattern_invalidation_performance', invalidationDuration, 'ms', {
        totalItems: itemCount * 2,
        patternItems: itemCount,
        invalidatedItems: itemCount - patternItemsRemaining
      });
    });

    it('should handle concurrent cache access efficiently', async () => {
      const concurrentOperations = 100;
      const promises: Promise<any>[] = [];
      
      const startTime = Date.now();
      
      // Create concurrent cache operations
      for (let i = 0; i < concurrentOperations; i++) {
        const operation = i % 4;
        const key = `concurrent-key-${i % 10}`;
        
        switch (operation) {
          case 0: // Set operation
            promises.push(
              Promise.resolve(cacheManager.set('class-discovery', key, { value: i }))
            );
            break;
          case 1: // Get operation
            promises.push(
              Promise.resolve(cacheManager.get('class-discovery', key))
            );
            break;
          case 2: // Invalidate operation
            promises.push(
              Promise.resolve(cacheManager.invalidate('class-discovery', key))
            );
            break;
          case 3: // Stats operation
            promises.push(
              Promise.resolve(cacheManager.getStats('class-discovery'))
            );
            break;
        }
      }
      
      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;
      const averageOperationTime = totalDuration / concurrentOperations;
      
      expect(results).toHaveLength(concurrentOperations);
      expect(averageOperationTime).toBeLessThan(2); // Less than 2ms per operation
      expect(totalDuration).toBeLessThan(100); // Total under 100ms
      
      await performanceMonitor.recordMetric('concurrent_cache_access_performance', averageOperationTime, 'ms', {
        concurrentOperations,
        totalDuration,
        operationTypes: 4
      });
    });
  });

  describe('Cache Statistics and Monitoring', () => {
    it('should provide accurate cache statistics efficiently', async () => {
      const testCacheName = 'stats-test';
      cacheManager.createCache(testCacheName, {
        ttl: 300,
        maxSize: 50,
        strategy: 'lru'
      });

      // Add items and access them to generate statistics
      for (let i = 0; i < 30; i++) {
        cacheManager.set(testCacheName, `stats-key-${i}`, { value: i });
      }

      // Access some items multiple times
      for (let i = 0; i < 10; i++) {
        cacheManager.get(testCacheName, `stats-key-${i}`);
        cacheManager.get(testCacheName, `stats-key-${i}`);
      }

      const statsStartTime = Date.now();
      const stats = cacheManager.getStats(testCacheName);
      const statsDuration = Date.now() - statsStartTime;

      expect(stats).toBeDefined();
      expect(stats?.size).toBe(30);
      expect(stats?.hitCount).toBeGreaterThan(0);
      expect(statsDuration).toBeLessThan(5); // Stats should be very fast

      await performanceMonitor.recordMetric('cache_stats_performance', statsDuration, 'ms', {
        cacheSize: stats?.size,
        hitCount: stats?.hitCount
      });
    });
  });
});