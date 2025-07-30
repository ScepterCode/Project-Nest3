/**
 * Performance tests for enrollment system
 * Tests high-volume scenarios and system load
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createClient } from '@/lib/supabase/server';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';
import { WaitlistManager } from '@/lib/services/waitlist-manager';
import { cacheManager } from '@/lib/services/cache-manager';
import { performanceMonitor } from '@/lib/services/performance-monitor';
import { backgroundJobProcessor } from '@/lib/services/background-job-processor';

// Test configuration
const PERFORMANCE_THRESHOLDS = {
  CLASS_SEARCH_MAX_TIME: 500, // ms
  ENROLLMENT_REQUEST_MAX_TIME: 200, // ms
  ELIGIBILITY_CHECK_MAX_TIME: 300, // ms
  WAITLIST_PROCESSING_MAX_TIME: 1000, // ms
  BULK_ENROLLMENT_MAX_TIME: 2000, // ms
  CONCURRENT_USERS_TARGET: 100,
  CACHE_HIT_RATE_MIN: 80 // %
};

describe('Enrollment System Performance Tests', () => {
  let supabase: any;
  let classDiscovery: ClassDiscoveryService;
  let enrollmentManager: EnrollmentManager;
  let waitlistManager: WaitlistManager;
  let testClassIds: string[] = [];
  let testStudentIds: string[] = [];

  beforeAll(async () => {
    supabase = createClient();
    classDiscovery = new ClassDiscoveryService();
    enrollmentManager = new EnrollmentManager();
    waitlistManager = new WaitlistManager();

    // Start performance monitoring for tests
    performanceMonitor.startMonitoring(5000);

    // Create test data
    await setupTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    
    // Stop monitoring
    performanceMonitor.stopMonitoring();
    backgroundJobProcessor.stop();
  });

  beforeEach(() => {
    // Clear cache before each test to ensure consistent conditions
    cacheManager.invalidate('class-discovery');
    cacheManager.invalidate('class-details');
    cacheManager.invalidate('user-eligibility');
  });

  describe('Class Discovery Performance', () => {
    it('should handle class search within performance threshold', async () => {
      const startTime = Date.now();
      
      const result = await classDiscovery.searchClasses({
        query: 'computer science',
        limit: 20,
        offset: 0
      });
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CLASS_SEARCH_MAX_TIME);
      expect(result.classes).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
      
      // Record performance metric
      await performanceMonitor.recordMetric('class_search_time', duration, 'ms', {
        query: 'computer science',
        resultCount: result.classes.length
      });
    });

    it('should handle concurrent class searches efficiently', async () => {
      const concurrentSearches = 50;
      const searchPromises: Promise<any>[] = [];
      
      const startTime = Date.now();
      
      // Create concurrent search requests
      for (let i = 0; i < concurrentSearches; i++) {
        searchPromises.push(
          classDiscovery.searchClasses({
            query: `search${i % 10}`, // Vary queries to test different scenarios
            limit: 10,
            offset: i * 10
          })
        );
      }
      
      const results = await Promise.all(searchPromises);
      const totalDuration = Date.now() - startTime;
      const averageDuration = totalDuration / concurrentSearches;
      
      expect(averageDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.CLASS_SEARCH_MAX_TIME);
      expect(results).toHaveLength(concurrentSearches);
      
      // All searches should return results
      results.forEach(result => {
        expect(result.classes).toBeDefined();
      });
      
      await performanceMonitor.recordMetric('concurrent_class_search', averageDuration, 'ms', {
        concurrentRequests: concurrentSearches,
        totalDuration
      });
    });

    it('should benefit from caching on repeated searches', async () => {
      const searchCriteria = {
        query: 'mathematics',
        limit: 20,
        offset: 0
      };
      
      // First search (cache miss)
      const firstSearchStart = Date.now();
      const firstResult = await classDiscovery.searchClasses(searchCriteria);
      const firstSearchDuration = Date.now() - firstSearchStart;
      
      // Second search (should hit cache)
      const secondSearchStart = Date.now();
      const secondResult = await classDiscovery.searchClasses(searchCriteria);
      const secondSearchDuration = Date.now() - secondSearchStart;
      
      // Cache hit should be significantly faster
      expect(secondSearchDuration).toBeLessThan(firstSearchDuration * 0.5);
      expect(firstResult.classes).toEqual(secondResult.classes);
      
      const cacheHitRatio = (1 - secondSearchDuration / firstSearchDuration) * 100;
      await performanceMonitor.recordMetric('cache_hit_performance', cacheHitRatio, '%', {
        firstDuration: firstSearchDuration,
        secondDuration: secondSearchDuration
      });
    });
  });

  describe('Enrollment Request Performance', () => {
    it('should process enrollment requests within threshold', async () => {
      const studentId = testStudentIds[0];
      const classId = testClassIds[0];
      
      const startTime = Date.now();
      
      const result = await enrollmentManager.requestEnrollment(studentId, classId);
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.ENROLLMENT_REQUEST_MAX_TIME);
      expect(result.success).toBe(true);
      
      await performanceMonitor.recordMetric('enrollment_request_time', duration, 'ms', {
        studentId,
        classId,
        success: result.success
      });
    });

    it('should handle concurrent enrollment requests', async () => {
      const concurrentRequests = 25;
      const enrollmentPromises: Promise<any>[] = [];
      
      const startTime = Date.now();
      
      // Create concurrent enrollment requests
      for (let i = 0; i < concurrentRequests; i++) {
        const studentId = testStudentIds[i % testStudentIds.length];
        const classId = testClassIds[i % testClassIds.length];
        
        enrollmentPromises.push(
          enrollmentManager.requestEnrollment(studentId, classId)
        );
      }
      
      const results = await Promise.all(enrollmentPromises);
      const totalDuration = Date.now() - startTime;
      const averageDuration = totalDuration / concurrentRequests;
      
      expect(averageDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.ENROLLMENT_REQUEST_MAX_TIME);
      
      // Count successful enrollments
      const successfulEnrollments = results.filter(r => r.success).length;
      expect(successfulEnrollments).toBeGreaterThan(0);
      
      await performanceMonitor.recordMetric('concurrent_enrollment_requests', averageDuration, 'ms', {
        concurrentRequests,
        successfulEnrollments,
        totalDuration
      });
    });

    it('should handle bulk enrollment efficiently', async () => {
      const bulkStudentIds = testStudentIds.slice(0, 20);
      const classId = testClassIds[0];
      
      const startTime = Date.now();
      
      const result = await enrollmentManager.bulkEnroll(bulkStudentIds, classId);
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_ENROLLMENT_MAX_TIME);
      expect(result.successful).toBeGreaterThan(0);
      
      await performanceMonitor.recordMetric('bulk_enrollment_time', duration, 'ms', {
        studentCount: bulkStudentIds.length,
        successfulEnrollments: result.successful,
        failedEnrollments: result.failed
      });
    });
  });

  describe('Eligibility Check Performance', () => {
    it('should check eligibility within performance threshold', async () => {
      const studentId = testStudentIds[0];
      const classId = testClassIds[0];
      
      const startTime = Date.now();
      
      const result = await classDiscovery.checkEnrollmentEligibility(studentId, classId);
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.ELIGIBILITY_CHECK_MAX_TIME);
      expect(result.eligible).toBeDefined();
      
      await performanceMonitor.recordMetric('eligibility_check_time', duration, 'ms', {
        studentId,
        classId,
        eligible: result.eligible
      });
    });

    it('should handle batch eligibility checks efficiently', async () => {
      const studentId = testStudentIds[0];
      const classIds = testClassIds.slice(0, 10);
      
      const startTime = Date.now();
      
      // Check eligibility for multiple classes
      const eligibilityPromises = classIds.map(classId =>
        classDiscovery.checkEnrollmentEligibility(studentId, classId)
      );
      
      const results = await Promise.all(eligibilityPromises);
      const duration = Date.now() - startTime;
      const averageDuration = duration / classIds.length;
      
      expect(averageDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.ELIGIBILITY_CHECK_MAX_TIME);
      expect(results).toHaveLength(classIds.length);
      
      await performanceMonitor.recordMetric('batch_eligibility_check', averageDuration, 'ms', {
        studentId,
        classCount: classIds.length,
        totalDuration: duration
      });
    });
  });

  describe('Waitlist Performance', () => {
    it('should process waitlist operations within threshold', async () => {
      const studentId = testStudentIds[0];
      const classId = testClassIds[0];
      
      // Add to waitlist
      const addStartTime = Date.now();
      const waitlistEntry = await waitlistManager.addToWaitlist(studentId, classId);
      const addDuration = Date.now() - addStartTime;
      
      expect(addDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.WAITLIST_PROCESSING_MAX_TIME);
      expect(waitlistEntry.id).toBeDefined();
      
      // Get position
      const positionStartTime = Date.now();
      const position = await waitlistManager.getWaitlistPosition(studentId, classId);
      const positionDuration = Date.now() - positionStartTime;
      
      expect(positionDuration).toBeLessThan(100); // Position check should be very fast
      expect(position).toBeGreaterThan(0);
      
      await performanceMonitor.recordMetric('waitlist_operations', addDuration + positionDuration, 'ms', {
        operation: 'add_and_check_position',
        studentId,
        classId,
        position
      });
    });

    it('should handle waitlist processing for full class', async () => {
      const classId = testClassIds[1];
      const studentsToWaitlist = testStudentIds.slice(0, 15);
      
      // Add multiple students to waitlist
      const waitlistPromises = studentsToWaitlist.map(studentId =>
        waitlistManager.addToWaitlist(studentId, classId)
      );
      
      await Promise.all(waitlistPromises);
      
      // Process waitlist
      const processStartTime = Date.now();
      await waitlistManager.processWaitlist(classId);
      const processDuration = Date.now() - processStartTime;
      
      expect(processDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.WAITLIST_PROCESSING_MAX_TIME);
      
      await performanceMonitor.recordMetric('waitlist_processing_time', processDuration, 'ms', {
        classId,
        waitlistSize: studentsToWaitlist.length
      });
    });
  });

  describe('System Load Tests', () => {
    it('should handle high concurrent user load', async () => {
      const concurrentUsers = PERFORMANCE_THRESHOLDS.CONCURRENT_USERS_TARGET;
      const operationsPerUser = 5;
      const allPromises: Promise<any>[] = [];
      
      const startTime = Date.now();
      
      // Simulate concurrent users performing various operations
      for (let user = 0; user < concurrentUsers; user++) {
        const studentId = testStudentIds[user % testStudentIds.length];
        
        // Each user performs multiple operations
        for (let op = 0; op < operationsPerUser; op++) {
          const classId = testClassIds[op % testClassIds.length];
          
          switch (op % 4) {
            case 0:
              // Search for classes
              allPromises.push(
                classDiscovery.searchClasses({
                  query: `search${user}`,
                  limit: 10
                })
              );
              break;
            case 1:
              // Check eligibility
              allPromises.push(
                classDiscovery.checkEnrollmentEligibility(studentId, classId)
              );
              break;
            case 2:
              // Get class details
              allPromises.push(
                classDiscovery.getClassDetails(classId, studentId)
              );
              break;
            case 3:
              // Get available classes
              allPromises.push(
                classDiscovery.getAvailableClasses(studentId)
              );
              break;
          }
        }
      }
      
      const results = await Promise.all(allPromises);
      const totalDuration = Date.now() - startTime;
      const averageResponseTime = totalDuration / results.length;
      
      expect(averageResponseTime).toBeLessThan(1000); // Average response under 1 second
      expect(results.length).toBe(concurrentUsers * operationsPerUser);
      
      // Calculate success rate
      const successfulOperations = results.filter(r => r !== null && r !== undefined).length;
      const successRate = (successfulOperations / results.length) * 100;
      
      expect(successRate).toBeGreaterThan(95); // 95% success rate minimum
      
      await performanceMonitor.recordMetric('high_load_test', averageResponseTime, 'ms', {
        concurrentUsers,
        operationsPerUser,
        totalOperations: results.length,
        successRate,
        totalDuration
      });
    });

    it('should maintain cache efficiency under load', async () => {
      const iterations = 100;
      const cacheHits = [];
      
      // Perform repeated operations to test cache efficiency
      for (let i = 0; i < iterations; i++) {
        const classId = testClassIds[i % testClassIds.length];
        const studentId = testStudentIds[i % testStudentIds.length];
        
        const startTime = Date.now();
        await classDiscovery.getClassDetails(classId, studentId);
        const duration = Date.now() - startTime;
        
        // Assume cache hit if response is very fast
        if (duration < 50) {
          cacheHits.push(i);
        }
      }
      
      const cacheHitRate = (cacheHits.length / iterations) * 100;
      
      expect(cacheHitRate).toBeGreaterThan(PERFORMANCE_THRESHOLDS.CACHE_HIT_RATE_MIN);
      
      await performanceMonitor.recordMetric('cache_hit_rate', cacheHitRate, '%', {
        iterations,
        cacheHits: cacheHits.length
      });
    });

    it('should handle database connection pooling efficiently', async () => {
      const concurrentQueries = 50;
      const queryPromises: Promise<any>[] = [];
      
      const startTime = Date.now();
      
      // Create many concurrent database queries
      for (let i = 0; i < concurrentQueries; i++) {
        queryPromises.push(
          supabase
            .from('classes')
            .select('id, name, current_enrollment, capacity')
            .limit(10)
        );
      }
      
      const results = await Promise.all(queryPromises);
      const totalDuration = Date.now() - startTime;
      const averageQueryTime = totalDuration / concurrentQueries;
      
      expect(averageQueryTime).toBeLessThan(200); // Average query under 200ms
      expect(results).toHaveLength(concurrentQueries);
      
      // All queries should succeed
      const successfulQueries = results.filter(r => !r.error).length;
      expect(successfulQueries).toBe(concurrentQueries);
      
      await performanceMonitor.recordMetric('database_connection_pooling', averageQueryTime, 'ms', {
        concurrentQueries,
        successfulQueries,
        totalDuration
      });
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not have memory leaks during extended operation', async () => {
      const initialMemory = process.memoryUsage();
      const iterations = 1000;
      
      // Perform many operations
      for (let i = 0; i < iterations; i++) {
        const studentId = testStudentIds[i % testStudentIds.length];
        const classId = testClassIds[i % testClassIds.length];
        
        await classDiscovery.checkEnrollmentEligibility(studentId, classId);
        
        // Force garbage collection periodically
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePerOperation = memoryIncrease / iterations;
      
      // Memory increase per operation should be minimal
      expect(memoryIncreasePerOperation).toBeLessThan(1024); // Less than 1KB per operation
      
      await performanceMonitor.recordMetric('memory_usage_per_operation', memoryIncreasePerOperation, 'bytes', {
        iterations,
        initialMemory: initialMemory.heapUsed,
        finalMemory: finalMemory.heapUsed,
        memoryIncrease
      });
    });
  });

  // Helper functions for test setup and cleanup
  async function setupTestData(): Promise<void> {
    // Create test institutions, departments, and users
    const { data: institution } = await supabase
      .from('institutions')
      .insert({
        name: 'Performance Test University',
        domain: 'perf-test.edu'
      })
      .select('id')
      .single();

    const { data: department } = await supabase
      .from('departments')
      .insert({
        name: 'Computer Science',
        institution_id: institution.id
      })
      .select('id')
      .single();

    // Create test students
    const studentInserts = [];
    for (let i = 0; i < 100; i++) {
      studentInserts.push({
        email: `student${i}@perf-test.edu`,
        first_name: `Student${i}`,
        last_name: 'Test',
        role: 'student',
        institution_id: institution.id,
        department_id: department.id
      });
    }

    const { data: students } = await supabase
      .from('users')
      .insert(studentInserts)
      .select('id');

    testStudentIds = students?.map(s => s.id) || [];

    // Create test teacher
    const { data: teacher } = await supabase
      .from('users')
      .insert({
        email: 'teacher@perf-test.edu',
        first_name: 'Test',
        last_name: 'Teacher',
        role: 'teacher',
        institution_id: institution.id,
        department_id: department.id
      })
      .select('id')
      .single();

    // Create test classes
    const classInserts = [];
    for (let i = 0; i < 20; i++) {
      classInserts.push({
        name: `Performance Test Class ${i}`,
        code: `PERF${i.toString().padStart(3, '0')}`,
        description: `Test class for performance testing ${i}`,
        teacher_id: teacher.id,
        institution_id: institution.id,
        department_id: department.id,
        capacity: 30,
        current_enrollment: 0,
        status: 'active',
        enrollment_type: 'open'
      });
    }

    const { data: classes } = await supabase
      .from('classes')
      .insert(classInserts)
      .select('id');

    testClassIds = classes?.map(c => c.id) || [];
  }

  async function cleanupTestData(): Promise<void> {
    // Clean up in reverse order of creation
    if (testClassIds.length > 0) {
      await supabase
        .from('classes')
        .delete()
        .in('id', testClassIds);
    }

    if (testStudentIds.length > 0) {
      await supabase
        .from('users')
        .delete()
        .in('id', testStudentIds);
    }

    // Clean up other test data
    await supabase
      .from('users')
      .delete()
      .eq('email', 'teacher@perf-test.edu');

    await supabase
      .from('departments')
      .delete()
      .eq('name', 'Computer Science');

    await supabase
      .from('institutions')
      .delete()
      .eq('name', 'Performance Test University');
  }
});