import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
// import { getConnectionPool } from '@/lib/services/database-connection-pool'; // Disabled for build
// import { getCacheService } from '@/lib/services/redis-cache-service'; // Disabled for build
import { getDatabaseMonitoring } from '@/lib/services/database-monitoring-service';

describe('Database Performance Tests', () => {
  let connectionPool: any;
  let cacheService: any;
  let monitoringService: any;

  beforeAll(async () => {
    connectionPool = getConnectionPool();
    cacheService = getCacheService();
    monitoringService = getDatabaseMonitoring();
  });

  afterAll(async () => {
    await connectionPool.close();
    await cacheService.disconnect();
    monitoringService.stopMonitoring();
  });

  describe('Connection Pool Performance', () => {
    it('should handle concurrent connections efficiently', async () => {
      const concurrentConnections = 50;
      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentConnections }, async () => {
        const connection = await connectionPool.getReadConnection();
        const result = await connection.query('SELECT 1 as test');
        connection.release();
        return result;
      });

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrentConnections);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      results.forEach(result => {
        expect(result.rows[0].test).toBe(1);
      });
    });

    it('should maintain connection pool limits', async () => {
      const maxConnections = 20;
      const connections: any[] = [];

      try {
        // Acquire maximum connections
        for (let i = 0; i < maxConnections; i++) {
          const connection = await connectionPool.getReadConnection();
          connections.push(connection);
        }

        const metrics = connectionPool.getMetrics();
        expect(metrics.activeConnections).toBeLessThanOrEqual(maxConnections);

        // Try to acquire one more connection (should timeout or queue)
        const startTime = Date.now();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 1000)
        );

        try {
          await Promise.race([
            connectionPool.getReadConnection(),
            timeoutPromise
          ]);
        } catch (error) {
          expect(error.message).toBe('Connection timeout');
        }

        const duration = Date.now() - startTime;
        expect(duration).toBeGreaterThan(900); // Should timeout after ~1 second
      } finally {
        // Release all connections
        connections.forEach(conn => conn.release());
      }
    });

    it('should handle connection failures gracefully', async () => {
      // This test would require a way to simulate connection failures
      // For now, we'll test error handling with invalid queries
      
      const invalidQueries = [
        'SELECT * FROM non_existent_table',
        'INVALID SQL SYNTAX',
        'SELECT 1/0' // Division by zero
      ];

      for (const query of invalidQueries) {
        try {
          await connectionPool.executeRead(query);
          fail('Expected query to throw an error');
        } catch (error) {
          expect(error).toBeDefined();
        }
      }

      // Pool should still be functional after errors
      const result = await connectionPool.executeRead('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
    });
  });

  describe('Query Performance Tests', () => {
    beforeEach(async () => {
      // Ensure test data exists
      await connectionPool.executeWrite(`
        CREATE TABLE IF NOT EXISTS performance_test_table (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100),
          email VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW(),
          data JSONB DEFAULT '{}'
        )
      `);
    });

    it('should execute simple queries within acceptable time', async () => {
      const iterations = 100;
      const startTime = Date.now();

      const promises = Array.from({ length: iterations }, () =>
        connectionPool.executeRead('SELECT 1 as test')
      );

      await Promise.all(promises);
      const duration = Date.now() - startTime;
      const averageTime = duration / iterations;

      expect(averageTime).toBeLessThan(50); // Average should be under 50ms
    });

    it('should handle bulk inserts efficiently', async () => {
      const recordCount = 1000;
      const batchSize = 100;
      const startTime = Date.now();

      // Clear test table
      await connectionPool.executeWrite('TRUNCATE performance_test_table');

      // Insert records in batches
      for (let i = 0; i < recordCount; i += batchSize) {
        const values = Array.from({ length: Math.min(batchSize, recordCount - i) }, (_, j) => 
          `('User ${i + j}', 'user${i + j}@example.com', NOW(), '{"batch": ${Math.floor(i / batchSize)}}')`
        ).join(', ');

        await connectionPool.executeWrite(`
          INSERT INTO performance_test_table (name, email, created_at, data)
          VALUES ${values}
        `);
      }

      const duration = Date.now() - startTime;
      const recordsPerSecond = recordCount / (duration / 1000);

      expect(recordsPerSecond).toBeGreaterThan(100); // Should insert at least 100 records/second

      // Verify all records were inserted
      const countResult = await connectionPool.executeRead('SELECT COUNT(*) as count FROM performance_test_table');
      expect(parseInt(countResult.rows[0].count)).toBe(recordCount);
    });

    it('should handle complex queries with joins efficiently', async () => {
      // Create related tables for join testing
      await connectionPool.executeWrite(`
        CREATE TABLE IF NOT EXISTS performance_categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50)
        )
      `);

      await connectionPool.executeWrite(`
        ALTER TABLE performance_test_table 
        ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES performance_categories(id)
      `);

      // Insert test categories
      await connectionPool.executeWrite(`
        INSERT INTO performance_categories (name) 
        VALUES ('Category 1'), ('Category 2'), ('Category 3')
        ON CONFLICT DO NOTHING
      `);

      // Update test table with category references
      await connectionPool.executeWrite(`
        UPDATE performance_test_table 
        SET category_id = (id % 3) + 1 
        WHERE category_id IS NULL
      `);

      const startTime = Date.now();

      // Execute complex join query
      const result = await connectionPool.executeRead(`
        SELECT 
          t.id,
          t.name,
          t.email,
          c.name as category_name,
          COUNT(*) OVER (PARTITION BY c.id) as category_count
        FROM performance_test_table t
        JOIN performance_categories c ON t.category_id = c.id
        WHERE t.created_at > NOW() - INTERVAL '1 day'
        ORDER BY t.id
        LIMIT 100
      `);

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty('category_name');
    });

    it('should handle concurrent read/write operations', async () => {
      const concurrentOperations = 20;
      const startTime = Date.now();

      const operations = Array.from({ length: concurrentOperations }, (_, i) => {
        if (i % 2 === 0) {
          // Read operation
          return connectionPool.executeRead(`
            SELECT * FROM performance_test_table 
            WHERE id = ${(i % 100) + 1}
          `);
        } else {
          // Write operation
          return connectionPool.executeWrite(`
            INSERT INTO performance_test_table (name, email) 
            VALUES ('Concurrent User ${i}', 'concurrent${i}@example.com')
          `);
        }
      });

      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrentOperations);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds

      // Verify no deadlocks occurred
      const deadlockResult = await connectionPool.executeRead(`
        SELECT sum(deadlocks) as total_deadlocks 
        FROM pg_stat_database 
        WHERE datname = current_database()
      `);
      
      expect(parseInt(deadlockResult.rows[0].total_deadlocks || '0')).toBe(0);
    });
  });

  describe('Cache Performance Tests', () => {
    it('should provide fast cache operations', async () => {
      const iterations = 1000;
      const testData = { id: 1, name: 'Test User', data: { complex: true, array: [1, 2, 3] } };

      // Test cache set performance
      const setStartTime = Date.now();
      const setPromises = Array.from({ length: iterations }, (_, i) =>
        cacheService.set(`perf_test_${i}`, { ...testData, id: i })
      );
      await Promise.all(setPromises);
      const setDuration = Date.now() - setStartTime;

      expect(setDuration).toBeLessThan(5000); // Should complete within 5 seconds

      // Test cache get performance
      const getStartTime = Date.now();
      const getPromises = Array.from({ length: iterations }, (_, i) =>
        cacheService.get(`perf_test_${i}`)
      );
      const results = await Promise.all(getPromises);
      const getDuration = Date.now() - getStartTime;

      expect(getDuration).toBeLessThan(2000); // Gets should be faster than sets
      expect(results.filter(r => r !== null)).toHaveLength(iterations);

      // Verify data integrity
      const firstResult = results[0] as any;
      expect(firstResult.name).toBe('Test User');
      expect(firstResult.data.complex).toBe(true);
    });

    it('should handle cache misses efficiently', async () => {
      const iterations = 100;
      const startTime = Date.now();

      const promises = Array.from({ length: iterations }, (_, i) =>
        cacheService.get(`non_existent_key_${i}`)
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Cache misses should be fast
      expect(results.every(r => r === null)).toBe(true);
    });

    it('should maintain performance under high concurrency', async () => {
      const concurrentOperations = 100;
      const startTime = Date.now();

      const operations = Array.from({ length: concurrentOperations }, (_, i) => {
        const key = `concurrent_test_${i}`;
        const value = { id: i, timestamp: Date.now() };

        // Mix of set and get operations
        if (i % 3 === 0) {
          return cacheService.set(key, value);
        } else if (i % 3 === 1) {
          return cacheService.get(key);
        } else {
          return cacheService.del(key);
        }
      });

      await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000); // Should handle concurrent operations efficiently
    });
  });

  describe('Load Testing', () => {
    it('should handle sustained load', async () => {
      const duration = 30000; // 30 seconds
      const requestsPerSecond = 10;
      const totalRequests = (duration / 1000) * requestsPerSecond;
      
      const startTime = Date.now();
      let completedRequests = 0;
      let errors = 0;

      const makeRequest = async () => {
        try {
          await connectionPool.executeRead('SELECT NOW() as current_time');
          completedRequests++;
        } catch (error) {
          errors++;
        }
      };

      // Generate sustained load
      const interval = setInterval(() => {
        for (let i = 0; i < requestsPerSecond; i++) {
          makeRequest();
        }
      }, 1000);

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, duration));
      clearInterval(interval);

      // Wait for remaining requests to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const actualDuration = Date.now() - startTime;
      const actualRPS = completedRequests / (actualDuration / 1000);

      expect(completedRequests).toBeGreaterThan(totalRequests * 0.8); // At least 80% success rate
      expect(errors / completedRequests).toBeLessThan(0.05); // Less than 5% error rate
      expect(actualRPS).toBeGreaterThan(requestsPerSecond * 0.8); // Maintain at least 80% of target RPS
    });

    it('should maintain performance under memory pressure', async () => {
      // Create large objects to simulate memory pressure
      const largeObjects: any[] = [];
      const objectSize = 1000; // 1KB objects
      const objectCount = 10000; // 10MB total

      for (let i = 0; i < objectCount; i++) {
        largeObjects.push({
          id: i,
          data: 'x'.repeat(objectSize),
          timestamp: Date.now()
        });
      }

      // Perform database operations under memory pressure
      const startTime = Date.now();
      const operations = Array.from({ length: 100 }, () =>
        connectionPool.executeRead('SELECT COUNT(*) as count FROM performance_test_table')
      );

      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Should still perform reasonably well

      // Clean up
      largeObjects.length = 0;
    });
  });

  describe('Stress Testing', () => {
    it('should handle connection exhaustion gracefully', async () => {
      const maxConnections = 25; // Slightly above pool limit
      const connections: any[] = [];
      let errors = 0;

      try {
        // Try to acquire more connections than available
        const promises = Array.from({ length: maxConnections }, async () => {
          try {
            const connection = await connectionPool.getReadConnection();
            connections.push(connection);
            
            // Hold connection for a short time
            await new Promise(resolve => setTimeout(resolve, 100));
            return connection;
          } catch (error) {
            errors++;
            throw error;
          }
        });

        await Promise.allSettled(promises);

        // System should handle this gracefully (either queue or reject)
        expect(errors).toBeGreaterThan(0); // Some requests should fail/timeout
        expect(connections.length).toBeLessThan(maxConnections); // Not all should succeed

      } finally {
        // Clean up connections
        connections.forEach(conn => {
          try {
            conn.release();
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      }
    });

    it('should recover from database errors', async () => {
      // Cause some database errors
      const errorQueries = [
        'SELECT * FROM non_existent_table',
        'INSERT INTO performance_test_table (invalid_column) VALUES (1)',
        'UPDATE performance_test_table SET id = id WHERE id = id' // Potential deadlock
      ];

      // Execute error queries
      for (const query of errorQueries) {
        try {
          await connectionPool.executeWrite(query);
        } catch (error) {
          // Expected to fail
        }
      }

      // System should recover and continue working
      const result = await connectionPool.executeRead('SELECT 1 as recovery_test');
      expect(result.rows[0].recovery_test).toBe(1);

      // Check that pool is still healthy
      const metrics = connectionPool.getMetrics();
      expect(metrics.totalConnections).toBeGreaterThan(0);
    });

    it('should handle rapid connection cycling', async () => {
      const cycles = 200;
      const startTime = Date.now();

      for (let i = 0; i < cycles; i++) {
        const connection = await connectionPool.getReadConnection();
        await connection.query('SELECT 1');
        connection.release();
      }

      const duration = Date.now() - startTime;
      const cyclesPerSecond = cycles / (duration / 1000);

      expect(cyclesPerSecond).toBeGreaterThan(50); // Should handle at least 50 cycles/second
      
      // Pool should remain stable
      const metrics = connectionPool.getMetrics();
      expect(metrics.totalConnections).toBeGreaterThan(0);
      expect(metrics.activeConnections).toBe(0); // All connections should be released
    });
  });

  describe('Monitoring Performance', () => {
    it('should collect metrics efficiently', async () => {
      const iterations = 10;
      const startTime = Date.now();

      const promises = Array.from({ length: iterations }, () =>
        monitoringService.collectMetrics()
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      const averageTime = duration / iterations;

      expect(averageTime).toBeLessThan(1000); // Should collect metrics in under 1 second
      expect(results).toHaveLength(iterations);
      
      results.forEach(metrics => {
        expect(metrics).toHaveProperty('connections');
        expect(metrics).toHaveProperty('queries');
        expect(metrics).toHaveProperty('performance');
        expect(metrics).toHaveProperty('health');
      });
    });

    it('should handle monitoring under load', async () => {
      // Start background load
      const loadPromises = Array.from({ length: 50 }, () =>
        connectionPool.executeRead('SELECT pg_sleep(0.1)')
      );

      // Collect metrics during load
      const metricsPromise = monitoringService.collectMetrics();
      
      const [metrics] = await Promise.all([metricsPromise, ...loadPromises]);

      expect(metrics).toBeDefined();
      expect(metrics.connections.active).toBeGreaterThan(0);
      expect(metrics.health.status).toBeDefined();
    });
  });
});