#!/usr/bin/env node

/**
 * Database Stress Testing Script
 * 
 * This script performs comprehensive stress testing on the database
 * to identify performance bottlenecks and ensure system stability
 * under various load conditions.
 */

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  // Test duration settings
  WARM_UP_DURATION: 30000,      // 30 seconds
  TEST_DURATION: 300000,        // 5 minutes
  COOL_DOWN_DURATION: 30000,    // 30 seconds
  
  // Load settings
  CONCURRENT_USERS: [1, 5, 10, 25, 50, 100],
  REQUESTS_PER_SECOND: [1, 5, 10, 25, 50, 100],
  
  // Query types and weights
  QUERY_TYPES: {
    simple_select: { weight: 40, query: 'SELECT 1 as test' },
    user_lookup: { weight: 20, query: 'SELECT * FROM users WHERE id = $1' },
    class_enrollment: { weight: 15, query: 'SELECT * FROM enrollments WHERE user_id = $1' },
    complex_join: { weight: 15, query: `
      SELECT u.*, ur.role, c.name as class_name 
      FROM users u 
      JOIN user_roles ur ON u.id = ur.user_id 
      LEFT JOIN enrollments e ON u.id = e.user_id 
      LEFT JOIN classes c ON e.class_id = c.id 
      WHERE u.id = $1
    ` },
    analytics_query: { weight: 10, query: `
      SELECT 
        COUNT(*) as total_users,
        COUNT(DISTINCT ur.institution_id) as institutions,
        AVG(EXTRACT(EPOCH FROM (NOW() - u.created_at))) as avg_user_age
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      WHERE u.created_at > NOW() - INTERVAL '30 days'
    ` }
  },
  
  // Thresholds for pass/fail
  THRESHOLDS: {
    MAX_RESPONSE_TIME: 5000,      // 5 seconds
    MAX_ERROR_RATE: 0.05,         // 5%
    MIN_THROUGHPUT: 10,           // requests per second
    MAX_CPU_USAGE: 80,            // 80%
    MAX_MEMORY_USAGE: 80          // 80%
  }
};

class DatabaseStressTester {
  constructor() {
    this.results = {
      testRuns: [],
      summary: {},
      timestamp: new Date().toISOString()
    };
    this.isRunning = false;
    this.currentMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      responseTimes: [],
      errors: []
    };
  }

  async initialize() {
    console.log('🚀 Initializing Database Stress Tester...');
    
    // Import database services (assuming they're available)
    try {
      // This would need to be adapted based on your actual module structure
      const { getConnectionPool } = require('../lib/services/database-connection-pool');
      const { getDatabaseMonitoring } = require('../lib/services/database-monitoring-service');
      
      this.connectionPool = getConnectionPool();
      this.monitoring = getDatabaseMonitoring();
      
      console.log('✅ Database services initialized');
    } catch (error) {
      console.error('❌ Failed to initialize database services:', error.message);
      process.exit(1);
    }

    // Verify database connectivity
    await this.verifyConnectivity();
    
    // Prepare test data
    await this.prepareTestData();
    
    console.log('✅ Initialization complete');
  }

  async verifyConnectivity() {
    console.log('🔍 Verifying database connectivity...');
    
    try {
      const result = await this.connectionPool.executeRead('SELECT NOW() as current_time');
      console.log(`✅ Database connected at ${result.rows[0].current_time}`);
    } catch (error) {
      console.error('❌ Database connectivity failed:', error.message);
      throw error;
    }
  }

  async prepareTestData() {
    console.log('📊 Preparing test data...');
    
    try {
      // Ensure we have test users for parameterized queries
      const userCountResult = await this.connectionPool.executeRead('SELECT COUNT(*) as count FROM users');
      const userCount = parseInt(userCountResult.rows[0].count);
      
      if (userCount < 100) {
        console.log('⚠️  Insufficient test data. Creating test users...');
        await this.createTestUsers(100 - userCount);
      }
      
      // Get sample user IDs for testing
      const userIdsResult = await this.connectionPool.executeRead('SELECT id FROM users LIMIT 100');
      this.testUserIds = userIdsResult.rows.map(row => row.id);
      
      console.log(`✅ Test data prepared (${this.testUserIds.length} test users available)`);
    } catch (error) {
      console.error('❌ Failed to prepare test data:', error.message);
      throw error;
    }
  }

  async createTestUsers(count) {
    const batchSize = 50;
    
    for (let i = 0; i < count; i += batchSize) {
      const currentBatch = Math.min(batchSize, count - i);
      const values = Array.from({ length: currentBatch }, (_, j) => 
        `('stress_test_user_${i + j}@example.com', 'Stress Test User ${i + j}', NOW(), true)`
      ).join(', ');
      
      await this.connectionPool.executeWrite(`
        INSERT INTO users (email, full_name, created_at, is_active)
        VALUES ${values}
        ON CONFLICT (email) DO NOTHING
      `);
    }
  }

  async runStressTest() {
    console.log('🏁 Starting comprehensive stress test...');
    
    for (const concurrentUsers of CONFIG.CONCURRENT_USERS) {
      for (const rps of CONFIG.REQUESTS_PER_SECOND) {
        if (concurrentUsers * rps > 1000) {
          console.log(`⏭️  Skipping ${concurrentUsers} users @ ${rps} RPS (too high load)`);
          continue;
        }
        
        console.log(`\n🧪 Testing ${concurrentUsers} concurrent users @ ${rps} RPS`);
        
        const testResult = await this.runLoadTest(concurrentUsers, rps);
        this.results.testRuns.push(testResult);
        
        // Cool down between tests
        console.log('❄️  Cooling down...');
        await this.sleep(5000);
      }
    }
    
    this.generateSummary();
    await this.saveResults();
    
    console.log('\n🎉 Stress test completed!');
  }

  async runLoadTest(concurrentUsers, requestsPerSecond) {
    const testConfig = {
      concurrentUsers,
      requestsPerSecond,
      duration: CONFIG.TEST_DURATION
    };
    
    console.log(`⏱️  Warm-up phase (${CONFIG.WARM_UP_DURATION / 1000}s)...`);
    
    // Reset metrics
    this.resetMetrics();
    
    // Warm-up phase
    this.isRunning = true;
    const warmupPromise = this.generateLoad(concurrentUsers, requestsPerSecond);
    await this.sleep(CONFIG.WARM_UP_DURATION);
    this.isRunning = false;
    await warmupPromise;
    
    // Reset metrics after warm-up
    this.resetMetrics();
    
    console.log(`🔥 Load test phase (${CONFIG.TEST_DURATION / 1000}s)...`);
    
    // Actual test phase
    const startTime = performance.now();
    const initialMetrics = await this.monitoring.collectMetrics();
    
    this.isRunning = true;
    const loadPromise = this.generateLoad(concurrentUsers, requestsPerSecond);
    
    // Monitor system during test
    const monitoringPromise = this.monitorSystem();
    
    await this.sleep(CONFIG.TEST_DURATION);
    this.isRunning = false;
    
    await Promise.all([loadPromise, monitoringPromise]);
    
    const endTime = performance.now();
    const finalMetrics = await this.monitoring.collectMetrics();
    
    // Calculate results
    const duration = (endTime - startTime) / 1000; // seconds
    const throughput = this.currentMetrics.successfulRequests / duration;
    const errorRate = this.currentMetrics.failedRequests / this.currentMetrics.totalRequests;
    const avgResponseTime = this.currentMetrics.totalResponseTime / this.currentMetrics.totalRequests;
    
    // Calculate percentiles
    const sortedResponseTimes = this.currentMetrics.responseTimes.sort((a, b) => a - b);
    const p50 = this.getPercentile(sortedResponseTimes, 50);
    const p95 = this.getPercentile(sortedResponseTimes, 95);
    const p99 = this.getPercentile(sortedResponseTimes, 99);
    
    const testResult = {
      config: testConfig,
      metrics: {
        duration,
        totalRequests: this.currentMetrics.totalRequests,
        successfulRequests: this.currentMetrics.successfulRequests,
        failedRequests: this.currentMetrics.failedRequests,
        throughput,
        errorRate,
        responseTime: {
          average: avgResponseTime,
          min: this.currentMetrics.minResponseTime,
          max: this.currentMetrics.maxResponseTime,
          p50,
          p95,
          p99
        }
      },
      systemMetrics: {
        initial: initialMetrics,
        final: finalMetrics
      },
      errors: this.currentMetrics.errors.slice(0, 10), // Keep first 10 errors
      passed: this.evaluateTestResult(throughput, errorRate, avgResponseTime),
      timestamp: new Date().toISOString()
    };
    
    this.logTestResult(testResult);
    return testResult;
  }

  async generateLoad(concurrentUsers, requestsPerSecond) {
    const requestInterval = 1000 / requestsPerSecond; // ms between requests
    const workers = [];
    
    // Create worker promises
    for (let i = 0; i < concurrentUsers; i++) {
      workers.push(this.workerLoop(requestInterval, i));
    }
    
    await Promise.all(workers);
  }

  async workerLoop(requestInterval, workerId) {
    while (this.isRunning) {
      const startTime = performance.now();
      
      try {
        await this.executeRandomQuery();
        
        const responseTime = performance.now() - startTime;
        this.recordSuccess(responseTime);
        
      } catch (error) {
        const responseTime = performance.now() - startTime;
        this.recordError(error, responseTime);
      }
      
      // Wait for next request (accounting for execution time)
      const executionTime = performance.now() - startTime;
      const waitTime = Math.max(0, requestInterval - executionTime);
      
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }
  }

  async executeRandomQuery() {
    const queryType = this.selectRandomQuery();
    const query = CONFIG.QUERY_TYPES[queryType];
    
    if (query.query.includes('$1')) {
      // Parameterized query
      const randomUserId = this.testUserIds[Math.floor(Math.random() * this.testUserIds.length)];
      return await this.connectionPool.executeRead(query.query, [randomUserId]);
    } else {
      // Simple query
      return await this.connectionPool.executeRead(query.query);
    }
  }

  selectRandomQuery() {
    const totalWeight = Object.values(CONFIG.QUERY_TYPES).reduce((sum, q) => sum + q.weight, 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const [queryType, config] of Object.entries(CONFIG.QUERY_TYPES)) {
      currentWeight += config.weight;
      if (random <= currentWeight) {
        return queryType;
      }
    }
    
    return Object.keys(CONFIG.QUERY_TYPES)[0]; // Fallback
  }

  async monitorSystem() {
    const systemMetrics = [];
    
    while (this.isRunning) {
      try {
        const metrics = await this.monitoring.collectMetrics();
        systemMetrics.push({
          timestamp: Date.now(),
          connections: metrics.connections.active,
          cacheHitRatio: metrics.performance.cacheHitRatio,
          averageQueryTime: metrics.queries.averageQueryTime
        });
      } catch (error) {
        console.error('Monitoring error:', error.message);
      }
      
      await this.sleep(5000); // Monitor every 5 seconds
    }
    
    return systemMetrics;
  }

  recordSuccess(responseTime) {
    this.currentMetrics.totalRequests++;
    this.currentMetrics.successfulRequests++;
    this.currentMetrics.totalResponseTime += responseTime;
    this.currentMetrics.minResponseTime = Math.min(this.currentMetrics.minResponseTime, responseTime);
    this.currentMetrics.maxResponseTime = Math.max(this.currentMetrics.maxResponseTime, responseTime);
    this.currentMetrics.responseTimes.push(responseTime);
  }

  recordError(error, responseTime) {
    this.currentMetrics.totalRequests++;
    this.currentMetrics.failedRequests++;
    this.currentMetrics.errors.push({
      message: error.message,
      responseTime,
      timestamp: Date.now()
    });
  }

  resetMetrics() {
    this.currentMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      responseTimes: [],
      errors: []
    };
  }

  evaluateTestResult(throughput, errorRate, avgResponseTime) {
    return (
      throughput >= CONFIG.THRESHOLDS.MIN_THROUGHPUT &&
      errorRate <= CONFIG.THRESHOLDS.MAX_ERROR_RATE &&
      avgResponseTime <= CONFIG.THRESHOLDS.MAX_RESPONSE_TIME
    );
  }

  getPercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  logTestResult(result) {
    const { config, metrics, passed } = result;
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    
    console.log(`\n${status} - ${config.concurrentUsers} users @ ${config.requestsPerSecond} RPS`);
    console.log(`  Throughput: ${metrics.throughput.toFixed(2)} req/s`);
    console.log(`  Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    console.log(`  Avg Response: ${metrics.responseTime.average.toFixed(2)}ms`);
    console.log(`  P95 Response: ${metrics.responseTime.p95.toFixed(2)}ms`);
    console.log(`  P99 Response: ${metrics.responseTime.p99.toFixed(2)}ms`);
  }

  generateSummary() {
    const passedTests = this.results.testRuns.filter(r => r.passed).length;
    const totalTests = this.results.testRuns.length;
    
    const maxThroughput = Math.max(...this.results.testRuns.map(r => r.metrics.throughput));
    const minErrorRate = Math.min(...this.results.testRuns.map(r => r.metrics.errorRate));
    const avgResponseTime = this.results.testRuns.reduce((sum, r) => sum + r.metrics.responseTime.average, 0) / totalTests;
    
    this.results.summary = {
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      successRate: (passedTests / totalTests) * 100,
      maxThroughput,
      minErrorRate: minErrorRate * 100,
      avgResponseTime,
      recommendations: this.generateRecommendations()
    };
    
    console.log('\n📊 STRESS TEST SUMMARY');
    console.log('========================');
    console.log(`Tests Passed: ${passedTests}/${totalTests} (${this.results.summary.successRate.toFixed(1)}%)`);
    console.log(`Max Throughput: ${maxThroughput.toFixed(2)} req/s`);
    console.log(`Min Error Rate: ${(minErrorRate * 100).toFixed(2)}%`);
    console.log(`Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
  }

  generateRecommendations() {
    const recommendations = [];
    const failedTests = this.results.testRuns.filter(r => !r.passed);
    
    if (failedTests.length > 0) {
      const highErrorRateTests = failedTests.filter(r => r.metrics.errorRate > CONFIG.THRESHOLDS.MAX_ERROR_RATE);
      const slowResponseTests = failedTests.filter(r => r.metrics.responseTime.average > CONFIG.THRESHOLDS.MAX_RESPONSE_TIME);
      const lowThroughputTests = failedTests.filter(r => r.metrics.throughput < CONFIG.THRESHOLDS.MIN_THROUGHPUT);
      
      if (highErrorRateTests.length > 0) {
        recommendations.push('Consider increasing connection pool size or optimizing error handling');
      }
      
      if (slowResponseTests.length > 0) {
        recommendations.push('Review slow queries and consider adding database indexes');
      }
      
      if (lowThroughputTests.length > 0) {
        recommendations.push('Consider horizontal scaling or database optimization');
      }
    }
    
    return recommendations;
  }

  async saveResults() {
    const resultsDir = path.join(__dirname, '..', 'test-results');
    const filename = `stress-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(resultsDir, filename);
    
    try {
      await fs.mkdir(resultsDir, { recursive: true });
      await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));
      console.log(`📁 Results saved to: ${filepath}`);
    } catch (error) {
      console.error('❌ Failed to save results:', error.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    try {
      // Remove test users
      await this.connectionPool.executeWrite(`
        DELETE FROM users 
        WHERE email LIKE 'stress_test_user_%@example.com'
      `);
      
      // Close connections
      if (this.connectionPool) {
        await this.connectionPool.close();
      }
      
      if (this.monitoring) {
        this.monitoring.stopMonitoring();
      }
      
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }
}

// Main execution
async function main() {
  const tester = new DatabaseStressTester();
  
  try {
    await tester.initialize();
    await tester.runStressTest();
  } catch (error) {
    console.error('❌ Stress test failed:', error);
    process.exit(1);
  } finally {
    await tester.cleanup();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️  Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DatabaseStressTester, CONFIG };