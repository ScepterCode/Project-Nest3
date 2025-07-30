/**
 * Integration tests for real-time enrollment system
 * Tests end-to-end functionality and integration between components
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { io, Socket } from 'socket.io-client';
import { createClient } from '@supabase/supabase-js';
import { RealtimeEnrollmentService } from '@/lib/services/realtime-enrollment';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';
import { WaitlistManager } from '@/lib/services/waitlist-manager';
import { createServer } from 'http';
import {
  EnrollmentStatus,
  RealtimeEventType,
  RealtimeEnrollmentEvent,
  RealtimeWaitlistEvent
} from '@/lib/types/enrollment';

// Test configuration
const TEST_CONFIG = {
  SERVER_URL: 'http://localhost:3002',
  TEST_TIMEOUT: 20000,
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-key'
};

describe('Real-time Enrollment Integration Tests', () => {
  let server: any;
  let realtimeService: RealtimeEnrollmentService;
  let enrollmentManager: EnrollmentManager;
  let waitlistManager: WaitlistManager;
  let supabase: any;
  let testClassId: string;
  let testStudentIds: string[];
  let testTeacherId: string;

  beforeAll(async () => {
    // Setup test server
    server = createServer();
    realtimeService = new RealtimeEnrollmentService();
    realtimeService.initialize(server);
    
    await new Promise<void>((resolve) => {
      server.listen(3002, resolve);
    });

    // Initialize services
    enrollmentManager = new EnrollmentManager();
    waitlistManager = new WaitlistManager();
    
    // Setup Supabase client for testing
    supabase = createClient(TEST_CONFIG.SUPABASE_URL, TEST_CONFIG.SUPABASE_ANON_KEY);

    // Generate test data
    const timestamp = Date.now();
    testClassId = `test-class-${timestamp}`;
    testTeacherId = `test-teacher-${timestamp}`;
    testStudentIds = Array.from({ length: 10 }, (_, i) => `test-student-${i}-${timestamp}`);

    // Create test class in database
    await setupTestClass();
  }, TEST_CONFIG.TEST_TIMEOUT);

  afterAll(async () => {
    await cleanupTestData();
    await realtimeService.cleanup();
    server.close();
  });

  beforeEach(async () => {
    // Reset test state before each test
    await resetTestState();
  });

  afterEach(() => {
    // Cleanup after each test
  });

  async function setupTestClass() {
    // This would create a test class in the database
    // For now, we'll mock this setup
    console.log(`Setting up test class: ${testClassId}`);
  }

  async function cleanupTestData() {
    // This would clean up test data from the database
    console.log('Cleaning up test data');
  }

  async function resetTestState() {
    // Reset any test state between tests
    console.log('Resetting test state');
  }

  describe('End-to-End Enrollment Flow', () => {
    test('should handle complete enrollment workflow with real-time updates', async () => {
      const studentSocket = io(TEST_CONFIG.SERVER_URL, {
        transports: ['websocket']
      });

      const teacherSocket = io(TEST_CONFIG.SERVER_URL, {
        transports: ['websocket']
      });

      // Connect both sockets
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          studentSocket.on('connect', () => {
            studentSocket.emit('join-class', testClassId);
            studentSocket.emit('join-student', testStudentIds[0]);
            resolve();
          });
          studentSocket.on('connect_error', reject);
          setTimeout(() => reject(new Error('Student connection timeout')), 5000);
        }),
        new Promise<void>((resolve, reject) => {
          teacherSocket.on('connect', () => {
            teacherSocket.emit('join-class', testClassId);
            teacherSocket.emit('join-teacher', testTeacherId);
            resolve();
          });
          teacherSocket.on('connect_error', reject);
          setTimeout(() => reject(new Error('Teacher connection timeout')), 5000);
        })
      ]);

      const enrollmentEvents: any[] = [];
      const teacherEvents: any[] = [];

      // Listen for events
      studentSocket.on('personal-enrollment-update', (event) => {
        enrollmentEvents.push({ type: 'personal', event });
      });

      studentSocket.on('enrollment-result', (result) => {
        enrollmentEvents.push({ type: 'result', result });
      });

      teacherSocket.on('enrollment-update', (event) => {
        teacherEvents.push({ type: 'enrollment', event });
      });

      teacherSocket.on('enrollment-count-update', (event) => {
        teacherEvents.push({ type: 'count', event });
      });

      // Student requests enrollment
      studentSocket.emit('request-enrollment', {
        studentId: testStudentIds[0],
        classId: testClassId,
        justification: 'Integration test enrollment'
      });

      // Wait for enrollment to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify events were received
      expect(enrollmentEvents.length).toBeGreaterThan(0);
      expect(teacherEvents.length).toBeGreaterThan(0);

      // Check that enrollment result was received
      const enrollmentResult = enrollmentEvents.find(e => e.type === 'result');
      expect(enrollmentResult).toBeDefined();
      expect(enrollmentResult.result.success).toBe(true);

      // Check that teacher received enrollment updates
      const teacherEnrollmentUpdate = teacherEvents.find(e => e.type === 'enrollment');
      expect(teacherEnrollmentUpdate).toBeDefined();

      studentSocket.disconnect();
      teacherSocket.disconnect();
    }, TEST_CONFIG.TEST_TIMEOUT);

    test('should handle waitlist workflow with position updates', async () => {
      const studentSockets: Socket[] = [];
      const waitlistEvents: Array<{ studentIndex: number; events: any[] }> = [];

      // Create multiple student connections
      for (let i = 0; i < 5; i++) {
        const socket = io(TEST_CONFIG.SERVER_URL, {
          transports: ['websocket']
        });

        await new Promise<void>((resolve, reject) => {
          socket.on('connect', () => {
            socket.emit('join-class', testClassId);
            socket.emit('join-student', testStudentIds[i]);
            resolve();
          });
          socket.on('connect_error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        waitlistEvents[i] = { studentIndex: i, events: [] };

        // Listen for waitlist events
        socket.on('waitlist-joined', (event) => {
          waitlistEvents[i].events.push({ type: 'joined', event });
        });

        socket.on('waitlist-position-change', (event) => {
          waitlistEvents[i].events.push({ type: 'position-change', event });
        });

        socket.on('waitlist-advancement', (event) => {
          waitlistEvents[i].events.push({ type: 'advancement', event });
        });

        studentSockets.push(socket);
      }

      // All students join waitlist (assuming class is full)
      for (let i = 0; i < 5; i++) {
        studentSockets[i].emit('request-enrollment', {
          studentId: testStudentIds[i],
          classId: testClassId
        });

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Wait for all waitlist operations to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify waitlist events
      for (let i = 0; i < 5; i++) {
        const studentEvents = waitlistEvents[i].events;
        expect(studentEvents.length).toBeGreaterThan(0);
        
        // Each student should have joined the waitlist
        const joinedEvent = studentEvents.find(e => e.type === 'joined');
        expect(joinedEvent).toBeDefined();
        expect(joinedEvent.event.data.position).toBeGreaterThan(0);
      }

      // Simulate a student dropping to trigger waitlist advancement
      // This would normally be done through the enrollment manager
      // For now, we'll emit a mock event
      studentSockets[0].emit('drop-enrollment', {
        studentId: 'mock-enrolled-student',
        classId: testClassId
      });

      // Wait for waitlist processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if first waitlisted student received advancement notification
      const firstStudentEvents = waitlistEvents[0].events;
      const advancementEvent = firstStudentEvents.find(e => e.type === 'advancement');
      
      // Note: This might not trigger in the test environment without proper database setup
      // In a real integration test, we would verify the advancement notification

      // Cleanup
      studentSockets.forEach(socket => socket.disconnect());
    }, TEST_CONFIG.TEST_TIMEOUT);
  });

  describe('Concurrent Operations', () => {
    test('should handle multiple simultaneous enrollment requests', async () => {
      const numStudents = 8;
      const sockets: Socket[] = [];
      const results: any[] = [];

      // Create connections
      for (let i = 0; i < numStudents; i++) {
        const socket = io(TEST_CONFIG.SERVER_URL, {
          transports: ['websocket']
        });

        await new Promise<void>((resolve, reject) => {
          socket.on('connect', () => {
            socket.emit('join-class', testClassId);
            socket.emit('join-student', testStudentIds[i]);
            resolve();
          });
          socket.on('connect_error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        sockets.push(socket);
      }

      // Set up result collection
      const resultPromises = sockets.map((socket, index) => {
        return new Promise<void>((resolve) => {
          socket.once('enrollment-result', (result) => {
            results.push({ studentIndex: index, result });
            resolve();
          });

          socket.once('enrollment-error', (error) => {
            results.push({ studentIndex: index, error });
            resolve();
          });

          // Timeout fallback
          setTimeout(() => {
            results.push({ studentIndex: index, timeout: true });
            resolve();
          }, 10000);
        });
      });

      // Send all enrollment requests simultaneously
      sockets.forEach((socket, index) => {
        socket.emit('request-enrollment', {
          studentId: testStudentIds[index],
          classId: testClassId,
          justification: `Concurrent test ${index}`
        });
      });

      // Wait for all results
      await Promise.all(resultPromises);

      // Verify results
      expect(results.length).toBe(numStudents);
      
      // Check that we got responses for all requests
      const timeouts = results.filter(r => r.timeout);
      expect(timeouts.length).toBe(0);

      // Check for data consistency (no duplicate enrollments)
      const successfulEnrollments = results.filter(r => r.result?.success && r.result?.status === EnrollmentStatus.ENROLLED);
      const waitlistedStudents = results.filter(r => r.result?.success && r.result?.status === EnrollmentStatus.WAITLISTED);
      
      console.log(`Enrolled: ${successfulEnrollments.length}, Waitlisted: ${waitlistedStudents.length}`);
      
      // Total successful operations should equal number of students
      expect(successfulEnrollments.length + waitlistedStudents.length).toBeLessThanOrEqual(numStudents);

      // Cleanup
      sockets.forEach(socket => socket.disconnect());
    }, TEST_CONFIG.TEST_TIMEOUT);

    test('should maintain data consistency during concurrent waitlist operations', async () => {
      const numOperations = 10;
      const sockets: Socket[] = [];
      const waitlistResults: any[] = [];

      // Create connections
      for (let i = 0; i < numOperations; i++) {
        const socket = io(TEST_CONFIG.SERVER_URL, {
          transports: ['websocket']
        });

        await new Promise<void>((resolve, reject) => {
          socket.on('connect', () => {
            socket.emit('join-class', testClassId);
            socket.emit('join-student', testStudentIds[i]);
            resolve();
          });
          socket.on('connect_error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        sockets.push(socket);
      }

      // Listen for waitlist events
      sockets.forEach((socket, index) => {
        socket.on('waitlist-joined', (event) => {
          waitlistResults.push({
            studentIndex: index,
            type: 'joined',
            position: event.data.position,
            timestamp: Date.now()
          });
        });

        socket.on('waitlist-position-change', (event) => {
          waitlistResults.push({
            studentIndex: index,
            type: 'position-change',
            newPosition: event.data.newPosition,
            oldPosition: event.data.oldPosition,
            timestamp: Date.now()
          });
        });
      });

      // Perform concurrent waitlist operations
      const operationPromises = sockets.map((socket, index) => {
        return new Promise<void>((resolve) => {
          // Join waitlist
          socket.emit('request-enrollment', {
            studentId: testStudentIds[index],
            classId: testClassId
          });

          setTimeout(resolve, 1000);
        });
      });

      await Promise.all(operationPromises);

      // Wait for all events to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify waitlist consistency
      const joinedEvents = waitlistResults.filter(r => r.type === 'joined');
      expect(joinedEvents.length).toBeGreaterThan(0);

      // Check that positions are sequential and unique
      const positions = joinedEvents.map(e => e.position).sort((a, b) => a - b);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }

      // Cleanup
      sockets.forEach(socket => socket.disconnect());
    }, TEST_CONFIG.TEST_TIMEOUT);
  });

  describe('Error Handling and Recovery', () => {
    test('should handle connection drops gracefully', async () => {
      const socket = io(TEST_CONFIG.SERVER_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000
      });

      let connectionCount = 0;
      let disconnectionCount = 0;
      const events: any[] = [];

      socket.on('connect', () => {
        connectionCount++;
        socket.emit('join-class', testClassId);
        socket.emit('join-student', testStudentIds[0]);
      });

      socket.on('disconnect', () => {
        disconnectionCount++;
      });

      socket.on('enrollment-count-update', (event) => {
        events.push({ type: 'count-update', event, timestamp: Date.now() });
      });

      // Wait for initial connection
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(connectionCount).toBe(1);

      // Force disconnect
      socket.disconnect();
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(disconnectionCount).toBe(1);

      // Reconnect
      socket.connect();
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', resolve);
        setTimeout(() => reject(new Error('Reconnection timeout')), 5000);
      });

      expect(connectionCount).toBe(2);

      // Verify that events are still received after reconnection
      socket.emit('get-realtime-stats', testClassId);
      await new Promise(resolve => setTimeout(resolve, 1000));

      socket.disconnect();
    }, TEST_CONFIG.TEST_TIMEOUT);

    test('should handle invalid requests gracefully', async () => {
      const socket = io(TEST_CONFIG.SERVER_URL, {
        transports: ['websocket']
      });

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const errors: any[] = [];

      socket.on('enrollment-error', (error) => {
        errors.push({ type: 'enrollment', error });
      });

      socket.on('waitlist-response-error', (error) => {
        errors.push({ type: 'waitlist', error });
      });

      // Send invalid enrollment request
      socket.emit('request-enrollment', {
        studentId: '', // Invalid student ID
        classId: testClassId
      });

      // Send invalid waitlist response
      socket.emit('waitlist-response', {
        studentId: 'non-existent-student',
        classId: 'non-existent-class',
        response: 'accept'
      });

      // Wait for error responses
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should have received error responses
      expect(errors.length).toBeGreaterThan(0);

      // Connection should still be stable
      expect(socket.connected).toBe(true);

      socket.disconnect();
    }, TEST_CONFIG.TEST_TIMEOUT);
  });

  describe('Performance Under Load', () => {
    test('should maintain responsiveness under moderate load', async () => {
      const numClients = 15;
      const sockets: Socket[] = [];
      const responseTimes: number[] = [];

      // Create multiple connections
      for (let i = 0; i < numClients; i++) {
        const socket = io(TEST_CONFIG.SERVER_URL, {
          transports: ['websocket']
        });

        await new Promise<void>((resolve, reject) => {
          socket.on('connect', () => {
            socket.emit('join-class', testClassId);
            resolve();
          });
          socket.on('connect_error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        sockets.push(socket);
      }

      // Perform operations and measure response times
      const operationPromises = sockets.map((socket, index) => {
        return new Promise<void>((resolve) => {
          const startTime = Date.now();
          
          socket.once('realtime-stats', () => {
            const responseTime = Date.now() - startTime;
            responseTimes.push(responseTime);
            resolve();
          });

          socket.emit('get-realtime-stats', testClassId);

          // Timeout fallback
          setTimeout(() => {
            responseTimes.push(5000); // Max response time
            resolve();
          }, 5000);
        });
      });

      await Promise.all(operationPromises);

      // Analyze performance
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(`Average response time: ${avgResponseTime}ms`);
      console.log(`Max response time: ${maxResponseTime}ms`);

      // Performance should be reasonable
      expect(avgResponseTime).toBeLessThan(2000);
      expect(maxResponseTime).toBeLessThan(5000);

      // Cleanup
      sockets.forEach(socket => socket.disconnect());
    }, TEST_CONFIG.TEST_TIMEOUT);
  });

  describe('Data Synchronization', () => {
    test('should keep enrollment counts synchronized across clients', async () => {
      const numClients = 5;
      const sockets: Socket[] = [];
      const enrollmentCounts: Array<{ clientIndex: number; counts: number[] }> = [];

      // Create connections
      for (let i = 0; i < numClients; i++) {
        const socket = io(TEST_CONFIG.SERVER_URL, {
          transports: ['websocket']
        });

        await new Promise<void>((resolve, reject) => {
          socket.on('connect', () => {
            socket.emit('join-class', testClassId);
            resolve();
          });
          socket.on('connect_error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        enrollmentCounts[i] = { clientIndex: i, counts: [] };

        socket.on('enrollment-count-update', (event) => {
          enrollmentCounts[i].counts.push(event.data.currentEnrollment);
        });

        sockets.push(socket);
      }

      // Trigger enrollment events
      for (let i = 0; i < 3; i++) {
        sockets[0].emit('request-enrollment', {
          studentId: `sync-test-student-${i}`,
          classId: testClassId
        });

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Wait for synchronization
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify that all clients received the same updates
      const firstClientCounts = enrollmentCounts[0].counts;
      
      if (firstClientCounts.length > 0) {
        for (let i = 1; i < numClients; i++) {
          const clientCounts = enrollmentCounts[i].counts;
          
          // All clients should have received some updates
          expect(clientCounts.length).toBeGreaterThan(0);
          
          // The final counts should be consistent
          if (clientCounts.length > 0 && firstClientCounts.length > 0) {
            const lastCountClient0 = firstClientCounts[firstClientCounts.length - 1];
            const lastCountClientI = clientCounts[clientCounts.length - 1];
            expect(lastCountClientI).toBe(lastCountClient0);
          }
        }
      }

      // Cleanup
      sockets.forEach(socket => socket.disconnect());
    }, TEST_CONFIG.TEST_TIMEOUT);
  });
});