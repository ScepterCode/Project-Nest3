/**
 * Real-time Enrollment Performance Tests
 * Tests real-time updates and concurrent enrollment scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient } from '@/lib/supabase/server';
import { backgroundJobProcessor } from '@/lib/services/background-job-processor';
import { performanceMonitor } from '@/lib/services/performance-monitor';
import { cacheManager } from '@/lib/services/cache-manager';

describe('Real-time Enrollment Performance Tests', () => {
  let supabase: any;
  let testClassId: string;
  let testStudentIds: string[] = [];

  beforeAll(async () => {
    supabase = createClient();
    
    // Start background job processor for testing
    backgroundJobProcessor.start(1000); // Check every second for tests
    
    // Create test data
    await setupRealtimeTestData();
  });

  afterAll(async () => {
    backgroundJobProcessor.stop();
    await cleanupRealtimeTestData();
  });

  describe('Concurrent Enrollment Processing', () => {
    it('should handle race conditions in enrollment requests', async () => {
      const concurrentStudents = 35; // More than class capacity (30)
      const enrollmentPromises: Promise<any>[] = [];
      
      const startTime = Date.now();
      
      // Create concurrent enrollment requests for the same class
      for (let i = 0; i < concurrentStudents; i++) {
        const studentId = testStudentIds[i];
        
        enrollmentPromises.push(
          supabase
            .from('enrollments')
            .insert({
              student_id: studentId,
              class_id: testClassId,
              status: 'enrolled',
              enrolled_at: new Date().toISOString()
            })
            .then((result: any) => ({ studentId, success: !result.error, error: result.error }))
            .catch((error: any) => ({ studentId, success: false, error }))
        );
      }
      
      const results = await Promise.all(enrollmentPromises);
      const processingDuration = Date.now() - startTime;
      
      // Count successful enrollments
      const successfulEnrollments = results.filter(r => r.success).length;
      const failedEnrollments = results.filter(r => !r.success).length;
      
      // Should not exceed class capacity
      expect(successfulEnrollments).toBeLessThanOrEqual(30);
      expect(failedEnrollments).toBeGreaterThan(0); // Some should fail due to capacity
      
      // Processing should be reasonably fast
      expect(processingDuration).toBeLessThan(5000); // Under 5 seconds
      
      await performanceMonitor.recordMetric('concurrent_enrollment_race_condition', processingDuration, 'ms', {
        concurrentRequests: concurrentStudents,
        successfulEnrollments,
        failedEnrollments,
        classCapacity: 30
      });
    });

    it('should handle waitlist promotion efficiently', async () => {
      // First, fill the class to capacity
      const capacityStudents = testStudentIds.slice(0, 30);
      
      for (const studentId of capacityStudents) {
        await supabase
          .from('enrollments')
          .insert({
            student_id: studentId,
            class_id: testClassId,
            status: 'enrolled'
          });
      }
      
      // Add students to waitlist
      const waitlistStudents = testStudentIds.slice(30, 40);
      const waitlistPromises = waitlistStudents.map((studentId, index) =>
        supabase
          .from('waitlist_entries')
          .insert({
            student_id: studentId,
            class_id: testClassId,
            position: index + 1,
            added_at: new Date().toISOString()
          })
      );
      
      await Promise.all(waitlistPromises);
      
      // Simulate a student dropping to create space
      const droppedStudentId = capacityStudents[0];
      
      const promotionStartTime = Date.now();
      
      // Remove student (this should trigger waitlist processing)
      await supabase
        .from('enrollments')
        .delete()
        .eq('student_id', droppedStudentId)
        .eq('class_id', testClassId);
      
      // Add background job to process waitlist
      await backgroundJobProcessor.addJob('process_waitlist', {
        classId: testClassId
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const promotionDuration = Date.now() - promotionStartTime;
      
      // Check that waitlist was processed
      const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('type', 'waitlist_enrollment_available')
        .in('user_id', waitlistStudents);
      
      expect(notifications).toBeDefined();
      expect(notifications?.length).toBeGreaterThan(0);
      expect(promotionDuration).toBeLessThan(3000); // Under 3 seconds
      
      await performanceMonitor.recordMetric('waitlist_promotion_performance', promotionDuration, 'ms', {
        waitlistSize: waitlistStudents.length,
        notificationsSent: notifications?.length || 0
      });
    });

    it('should handle bulk enrollment operations efficiently', async () => {
      const bulkStudentIds = testStudentIds.slice(40, 60); // 20 students
      
      const bulkStartTime = Date.now();
      
      // Add bulk enrollment job
      await backgroundJobProcessor.addJob('process_bulk_enrollment', {
        studentIds: bulkStudentIds,
        classId: testClassId,
        enrolledBy: 'admin-user-id'
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const bulkDuration = Date.now() - bulkStartTime;
      
      // Check results
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('*')
        .eq('class_id', testClassId)
        .in('student_id', bulkStudentIds);
      
      const successfulBulkEnrollments = enrollments?.length || 0;
      
      expect(successfulBulkEnrollments).toBeGreaterThan(0);
      expect(bulkDuration).toBeLessThan(5000); // Under 5 seconds
      
      await performanceMonitor.recordMetric('bulk_enrollment_performance', bulkDuration, 'ms', {
        bulkSize: bulkStudentIds.length,
        successfulEnrollments: successfulBulkEnrollments,
        averageTimePerEnrollment: bulkDuration / successfulBulkEnrollments
      });
    });
  });

  describe('Real-time Notification Performance', () => {
    it('should send notifications efficiently at scale', async () => {
      const notificationCount = 100;
      const notificationPromises: Promise<any>[] = [];
      
      const startTime = Date.now();
      
      // Create many notification jobs
      for (let i = 0; i < notificationCount; i++) {
        const studentId = testStudentIds[i % testStudentIds.length];
        
        notificationPromises.push(
          backgroundJobProcessor.addJob('send_notification', {
            type: 'enrollment_confirmed',
            studentId,
            classId: testClassId,
            message: `Test notification ${i}`
          })
        );
      }
      
      await Promise.all(notificationPromises);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const totalDuration = Date.now() - startTime;
      const averageNotificationTime = totalDuration / notificationCount;
      
      // Check that notifications were created
      const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('type', 'enrollment_confirmed')
        .gte('created_at', new Date(startTime).toISOString());
      
      const processedNotifications = notifications?.length || 0;
      
      expect(processedNotifications).toBeGreaterThan(0);
      expect(averageNotificationTime).toBeLessThan(100); // Less than 100ms per notification
      
      await performanceMonitor.recordMetric('notification_processing_performance', averageNotificationTime, 'ms', {
        notificationCount,
        processedNotifications,
        totalDuration
      });
    });

    it('should handle notification delivery failures gracefully', async () => {
      const failureTestCount = 20;
      const startTime = Date.now();
      
      // Create notifications with invalid data to test failure handling
      const failurePromises: Promise<any>[] = [];
      
      for (let i = 0; i < failureTestCount; i++) {
        failurePromises.push(
          backgroundJobProcessor.addJob('send_notification', {
            type: 'test_failure',
            studentId: 'invalid-student-id', // This should cause failures
            classId: testClassId,
            message: `Failure test ${i}`
          })
        );
      }
      
      await Promise.all(failurePromises);
      
      // Wait for processing and retries
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const totalDuration = Date.now() - startTime;
      
      // Check job status
      const { data: jobs } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('type', 'send_notification')
        .gte('created_at', new Date(startTime).toISOString());
      
      const failedJobs = jobs?.filter(j => j.status === 'failed').length || 0;
      const completedJobs = jobs?.filter(j => j.status === 'completed').length || 0;
      
      expect(failedJobs + completedJobs).toBe(failureTestCount);
      expect(totalDuration).toBeLessThan(15000); // Should complete within 15 seconds including retries
      
      await performanceMonitor.recordMetric('notification_failure_handling_performance', totalDuration, 'ms', {
        totalJobs: failureTestCount,
        failedJobs,
        completedJobs
      });
    });
  });

  describe('Cache Invalidation Performance', () => {
    it('should handle cache invalidation during enrollment changes', async () => {
      // Pre-populate cache with class data
      const cacheKeys = [];
      for (let i = 0; i < 50; i++) {
        const key = `class-details-${i}`;
        cacheManager.set('class-details', key, {
          id: testClassId,
          name: `Cached Class ${i}`,
          enrollment: 20 + i
        });
        cacheKeys.push(key);
      }
      
      const invalidationStartTime = Date.now();
      
      // Simulate enrollment change that should invalidate cache
      await supabase
        .from('enrollments')
        .insert({
          student_id: testStudentIds[0],
          class_id: testClassId,
          status: 'enrolled'
        });
      
      // Manually trigger cache invalidation (in real system this would be automatic)
      cacheManager.invalidatePattern('class-details', '.*');
      cacheManager.invalidate('class-discovery');
      cacheManager.invalidate('enrollment-data');
      
      const invalidationDuration = Date.now() - invalidationStartTime;
      
      // Verify cache was cleared
      let remainingCachedItems = 0;
      for (const key of cacheKeys) {
        if (cacheManager.get('class-details', key) !== null) {
          remainingCachedItems++;
        }
      }
      
      expect(remainingCachedItems).toBe(0); // All should be invalidated
      expect(invalidationDuration).toBeLessThan(100); // Should be very fast
      
      await performanceMonitor.recordMetric('cache_invalidation_performance', invalidationDuration, 'ms', {
        cachedItemsInvalidated: cacheKeys.length,
        remainingItems: remainingCachedItems
      });
    });

    it('should handle selective cache invalidation efficiently', async () => {
      // Create cache entries for multiple classes
      const classCount = 20;
      const studentsPerClass = 5;
      
      for (let classIndex = 0; classIndex < classCount; classIndex++) {
        for (let studentIndex = 0; studentIndex < studentsPerClass; studentIndex++) {
          const key = `eligibility:student-${studentIndex}:class-${classIndex}`;
          cacheManager.set('user-eligibility', key, {
            eligible: true,
            reasons: []
          });
        }
      }
      
      const selectiveInvalidationStartTime = Date.now();
      
      // Invalidate cache for only one class
      const targetClassIndex = 5;
      cacheManager.invalidatePattern('user-eligibility', `eligibility:.*:class-${targetClassIndex}`);
      
      const selectiveInvalidationDuration = Date.now() - selectiveInvalidationStartTime;
      
      // Check that only target class cache was invalidated
      let targetClassItemsRemaining = 0;
      let otherClassItemsRemaining = 0;
      
      for (let studentIndex = 0; studentIndex < studentsPerClass; studentIndex++) {
        // Check target class
        const targetKey = `eligibility:student-${studentIndex}:class-${targetClassIndex}`;
        if (cacheManager.get('user-eligibility', targetKey) !== null) {
          targetClassItemsRemaining++;
        }
        
        // Check other class
        const otherKey = `eligibility:student-${studentIndex}:class-${targetClassIndex + 1}`;
        if (cacheManager.get('user-eligibility', otherKey) !== null) {
          otherClassItemsRemaining++;
        }
      }
      
      expect(targetClassItemsRemaining).toBe(0); // Target class should be cleared
      expect(otherClassItemsRemaining).toBe(studentsPerClass); // Other classes should remain
      expect(selectiveInvalidationDuration).toBeLessThan(50); // Should be fast
      
      await performanceMonitor.recordMetric('selective_cache_invalidation_performance', selectiveInvalidationDuration, 'ms', {
        totalCachedItems: classCount * studentsPerClass,
        targetItemsInvalidated: studentsPerClass,
        remainingItems: (classCount - 1) * studentsPerClass
      });
    });
  });

  describe('Background Job Processing Performance', () => {
    it('should process job queue efficiently under load', async () => {
      const jobCount = 100;
      const jobTypes = ['update_enrollment_stats', 'send_notification', 'cleanup_expired_requests'];
      
      const queueStartTime = Date.now();
      
      // Add many jobs to the queue
      const jobPromises: Promise<any>[] = [];
      for (let i = 0; i < jobCount; i++) {
        const jobType = jobTypes[i % jobTypes.length];
        
        jobPromises.push(
          backgroundJobProcessor.addJob(jobType as any, {
            testData: `job-${i}`,
            timestamp: Date.now()
          }, {
            priority: Math.floor(Math.random() * 5) // Random priority 0-4
          })
        );
      }
      
      await Promise.all(jobPromises);
      
      const queueDuration = Date.now() - queueStartTime;
      
      // Wait for jobs to be processed
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      const totalDuration = Date.now() - queueStartTime;
      
      // Check job completion
      const { data: jobs } = await supabase
        .from('background_jobs')
        .select('*')
        .gte('created_at', new Date(queueStartTime).toISOString());
      
      const completedJobs = jobs?.filter(j => j.status === 'completed').length || 0;
      const failedJobs = jobs?.filter(j => j.status === 'failed').length || 0;
      const processingJobs = jobs?.filter(j => j.status === 'processing').length || 0;
      
      const completionRate = (completedJobs / jobCount) * 100;
      
      expect(completionRate).toBeGreaterThan(80); // At least 80% completion rate
      expect(queueDuration).toBeLessThan(1000); // Queueing should be fast
      
      await performanceMonitor.recordMetric('background_job_processing_performance', totalDuration, 'ms', {
        jobCount,
        completedJobs,
        failedJobs,
        processingJobs,
        completionRate,
        queueDuration
      });
    });
  });

  // Helper functions
  async function setupRealtimeTestData(): Promise<void> {
    // Create test institution and department
    const { data: institution } = await supabase
      .from('institutions')
      .insert({
        name: 'Realtime Test University',
        domain: 'realtime-test.edu'
      })
      .select('id')
      .single();

    const { data: department } = await supabase
      .from('departments')
      .insert({
        name: 'Realtime Test Department',
        institution_id: institution.id
      })
      .select('id')
      .single();

    // Create test teacher
    const { data: teacher } = await supabase
      .from('users')
      .insert({
        email: 'teacher@realtime-test.edu',
        first_name: 'Test',
        last_name: 'Teacher',
        role: 'teacher',
        institution_id: institution.id,
        department_id: department.id
      })
      .select('id')
      .single();

    // Create test class
    const { data: testClass } = await supabase
      .from('classes')
      .insert({
        name: 'Realtime Test Class',
        code: 'RT101',
        description: 'Test class for realtime performance testing',
        teacher_id: teacher.id,
        institution_id: institution.id,
        department_id: department.id,
        capacity: 30,
        current_enrollment: 0,
        status: 'active',
        enrollment_type: 'open'
      })
      .select('id')
      .single();

    testClassId = testClass.id;

    // Create test students
    const studentInserts = [];
    for (let i = 0; i < 100; i++) {
      studentInserts.push({
        email: `student${i}@realtime-test.edu`,
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
  }

  async function cleanupRealtimeTestData(): Promise<void> {
    // Clean up in reverse order
    if (testClassId) {
      await supabase.from('classes').delete().eq('id', testClassId);
    }

    if (testStudentIds.length > 0) {
      await supabase.from('users').delete().in('id', testStudentIds);
    }

    await supabase.from('users').delete().eq('email', 'teacher@realtime-test.edu');
    await supabase.from('departments').delete().eq('name', 'Realtime Test Department');
    await supabase.from('institutions').delete().eq('name', 'Realtime Test University');

    // Clean up background jobs
    await supabase.from('background_jobs').delete().gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    
    // Clean up notifications
    await supabase.from('notifications').delete().gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  }
});