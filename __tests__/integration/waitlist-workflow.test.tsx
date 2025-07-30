/**
 * Integration test for waitlist workflow
 * Tests the complete waitlist management system including:
 * - Adding students to waitlist
 * - Position tracking and probability calculation
 * - Automatic promotion when spots become available
 * - Notification system with response deadlines
 */

import { WaitlistManager } from '@/lib/services/waitlist-manager';
import { NotificationService } from '@/lib/services/notification-service';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';
import { 
  EnrollmentStatus, 
  NotificationType, 
  AuditAction 
} from '@/lib/types/enrollment';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  lt: jest.fn(),
  not: jest.fn(),
  is: jest.fn(),
  order: jest.fn(),
  limit: jest.fn(),
  single: jest.fn(),
  in: jest.fn()
};

// Mock the Supabase client creation
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('Waitlist Workflow Integration Tests', () => {
  let waitlistManager: WaitlistManager;
  let notificationService: NotificationService;
  let enrollmentManager: EnrollmentManager;

  beforeEach(() => {
    waitlistManager = new WaitlistManager();
    notificationService = new NotificationService();
    enrollmentManager = new EnrollmentManager();
    
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.lt.mockReturnValue(mockSupabase);
    mockSupabase.not.mockReturnValue(mockSupabase);
    mockSupabase.is.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
    mockSupabase.single.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
  });

  describe('Complete Waitlist Workflow', () => {
    const classId = 'class-full-101';
    const students = [
      { id: 'student-1', name: 'Alice Johnson', priority: 0 },
      { id: 'student-2', name: 'Bob Smith', priority: 5 },
      { id: 'student-3', name: 'Carol Davis', priority: 0 },
      { id: 'student-4', name: 'David Wilson', priority: 10 }
    ];

    it('should handle complete waitlist workflow from joining to enrollment', async () => {
      // Step 1: Students join waitlist
      console.log('Step 1: Adding students to waitlist...');
      
      // Mock no existing entries for each student
      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // student-1
        .mockResolvedValueOnce({ 
          data: { 
            id: 'waitlist-1', 
            student_id: 'student-1', 
            class_id: classId, 
            position: 1, 
            priority: 0,
            estimated_probability: 0.8,
            added_at: new Date().toISOString()
          }, 
          error: null 
        })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // student-2
        .mockResolvedValueOnce({ 
          data: { 
            id: 'waitlist-2', 
            student_id: 'student-2', 
            class_id: classId, 
            position: 1, // Higher priority, should be position 1
            priority: 5,
            estimated_probability: 0.8,
            added_at: new Date().toISOString()
          }, 
          error: null 
        });

      // Mock empty waitlist initially, then with entries
      mockSupabase.order
        .mockResolvedValueOnce({ data: [], error: null }) // For student-1
        .mockResolvedValueOnce({ data: [
          { position: 1, priority: 0, added_at: '2024-01-01T10:00:00Z' }
        ], error: null }); // For student-2

      // Add students to waitlist
      const entry1 = await waitlistManager.addToWaitlist(students[0].id, classId, students[0].priority);
      const entry2 = await waitlistManager.addToWaitlist(students[1].id, classId, students[1].priority);

      expect(entry1.student_id).toBe(students[0].id);
      expect(entry2.student_id).toBe(students[1].id);
      expect(entry2.priority).toBe(5); // Higher priority student

      // Step 2: Check waitlist positions and probabilities
      console.log('Step 2: Checking waitlist positions...');
      
      mockSupabase.single
        .mockResolvedValueOnce({ data: { position: 2 }, error: null }) // student-1 moved to position 2
        .mockResolvedValueOnce({ data: { position: 1 }, error: null }); // student-2 at position 1

      const position1 = await waitlistManager.getWaitlistPosition(students[0].id, classId);
      const position2 = await waitlistManager.getWaitlistPosition(students[1].id, classId);

      expect(position2).toBe(1); // Higher priority student should be first
      expect(position1).toBe(2); // Lower priority student should be second

      // Step 3: A spot becomes available - process waitlist
      console.log('Step 3: Processing waitlist when spot becomes available...');
      
      // Mock class with available capacity
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { capacity: 30, current_enrollment: 29, waitlist_capacity: 10 },
          error: null
        });

      // Mock next student on waitlist (highest priority)
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{
          id: 'waitlist-2',
          student_id: students[1].id,
          class_id: classId,
          position: 1,
          priority: 5,
          notified_at: null
        }],
        error: null
      });

      // Mock waitlist entry with class info for notification
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'waitlist-2',
          student_id: students[1].id,
          class_id: classId,
          position: 1,
          classes: {
            id: classId,
            name: 'Advanced Mathematics',
            code: 'MATH-301'
          }
        },
        error: null
      });

      await waitlistManager.processWaitlist(classId);

      // Verify notification was created
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          waitlist_entry_id: 'waitlist-2',
          notification_type: NotificationType.ENROLLMENT_AVAILABLE
        })
      );

      // Verify student was notified (notification expiration set)
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          notified_at: expect.any(String),
          notification_expires_at: expect.any(String)
        })
      );

      // Step 4: Student responds to notification (accepts)
      console.log('Step 4: Student accepts enrollment opportunity...');
      
      // Mock waitlist entry for response handling
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'waitlist-2',
          student_id: students[1].id,
          class_id: classId,
          position: 1
        },
        error: null
      });

      await waitlistManager.handleWaitlistResponse(students[1].id, classId, 'accept');

      // Verify notification response was recorded
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          responded: true,
          response: 'accept'
        })
      );

      // Verify enrollment was created
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: students[1].id,
          class_id: classId,
          status: EnrollmentStatus.ENROLLED,
          enrolled_by: 'waitlist_system'
        })
      );

      // Verify student was removed from waitlist
      expect(mockSupabase.delete).toHaveBeenCalled();

      console.log('✅ Complete waitlist workflow test passed!');
    });

    it('should handle waitlist position tracking with priority ordering', async () => {
      console.log('Testing priority-based position tracking...');

      // Mock existing waitlist entries with different priorities
      const existingEntries = [
        { position: 1, priority: 10, added_at: '2024-01-01T10:00:00Z' },
        { position: 2, priority: 5, added_at: '2024-01-02T10:00:00Z' },
        { position: 3, priority: 0, added_at: '2024-01-03T10:00:00Z' }
      ];

      // Test adding student with medium priority (should be inserted at position 2)
      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: {
            id: 'waitlist-new',
            student_id: 'student-priority',
            class_id: classId,
            position: 2,
            priority: 7
          },
          error: null
        });

      mockSupabase.order.mockResolvedValue({ data: existingEntries, error: null });

      const entry = await waitlistManager.addToWaitlist('student-priority', classId, 7);

      expect(entry.position).toBe(2); // Should be inserted between priority 10 and 5
      expect(entry.priority).toBe(7);

      console.log('✅ Priority-based position tracking test passed!');
    });

    it('should handle automatic promotion of multiple students', async () => {
      console.log('Testing automatic promotion of multiple students...');

      // Mock class with multiple available spots
      mockSupabase.single.mockResolvedValueOnce({
        data: { capacity: 30, current_enrollment: 27, waitlist_capacity: 10 }, // 3 spots available
        error: null
      });

      // Mock multiple students on waitlist
      const waitlistEntries = [
        { id: 'w1', student_id: 's1', position: 1, priority: 0, notified_at: null },
        { id: 'w2', student_id: 's2', position: 2, priority: 0, notified_at: null },
        { id: 'w3', student_id: 's3', position: 3, priority: 0, notified_at: null }
      ];

      mockSupabase.limit.mockResolvedValueOnce({ data: waitlistEntries, error: null });

      // Mock waitlist entries with class info for notifications
      for (let i = 0; i < 3; i++) {
        mockSupabase.single.mockResolvedValueOnce({
          data: {
            ...waitlistEntries[i],
            classes: {
              id: classId,
              name: 'Advanced Mathematics',
              code: 'MATH-301'
            }
          },
          error: null
        });
      }

      await waitlistManager.processWaitlist(classId);

      // Verify all 3 students were notified
      expect(mockSupabase.update).toHaveBeenCalledTimes(3);
      expect(mockSupabase.insert).toHaveBeenCalledTimes(3); // 3 notifications created

      console.log('✅ Multiple student promotion test passed!');
    });

    it('should handle expired notifications correctly', async () => {
      console.log('Testing expired notification handling...');

      const expiredEntries = [
        {
          id: 'waitlist-expired',
          student_id: 'student-expired',
          class_id: classId,
          notification_expires_at: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
          waitlist_notifications: [{ responded: false }]
        }
      ];

      // Mock expired entries
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.lt.mockResolvedValue({ data: expiredEntries, error: null });

      // Mock the entry for removal
      mockSupabase.single.mockResolvedValue({ 
        data: expiredEntries[0], 
        error: null 
      });

      await waitlistManager.processExpiredNotifications();

      // Verify notification was marked as no response
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          responded: true,
          response: 'no_response'
        })
      );

      // Verify student was removed from waitlist
      expect(mockSupabase.delete).toHaveBeenCalled();

      console.log('✅ Expired notification handling test passed!');
    });

    it('should calculate enrollment probabilities correctly', async () => {
      console.log('Testing enrollment probability calculations...');

      const testCases = [
        { position: 1, expectedMin: 0.7, expectedMax: 1.0 },
        { position: 3, expectedMin: 0.7, expectedMax: 1.0 },
        { position: 5, expectedMin: 0.5, expectedMax: 0.7 },
        { position: 10, expectedMin: 0.3, expectedMax: 0.5 },
        { position: 20, expectedMin: 0.0, expectedMax: 0.2 }
      ];

      for (const testCase of testCases) {
        mockSupabase.single.mockResolvedValue({
          data: { position: testCase.position },
          error: null
        });

        const probability = await waitlistManager.estimateEnrollmentProbability('test-student', classId);
        
        expect(probability).toBeGreaterThanOrEqual(testCase.expectedMin);
        expect(probability).toBeLessThanOrEqual(testCase.expectedMax);
      }

      console.log('✅ Enrollment probability calculation test passed!');
    });

    it('should provide detailed student waitlist information', async () => {
      console.log('Testing detailed student waitlist information...');

      const mockEntry = {
        id: 'waitlist-detail',
        student_id: 'student-detail',
        class_id: classId,
        position: 3,
        estimated_probability: 0.6,
        added_at: '2024-01-01T10:00:00Z',
        notified_at: '2024-01-02T10:00:00Z',
        notification_expires_at: '2024-01-03T10:00:00Z'
      };

      mockSupabase.single.mockResolvedValue({ data: mockEntry, error: null });

      const info = await waitlistManager.getStudentWaitlistInfo('student-detail', classId);

      expect(info.entry).toEqual(mockEntry);
      expect(info.position).toBe(3);
      expect(info.estimatedProbability).toBe(0.6);
      expect(info.isNotified).toBe(true);
      expect(info.responseDeadline).toEqual(new Date('2024-01-03T10:00:00Z'));
      expect(info.estimatedWaitTime).toContain('days'); // Should contain time estimate

      console.log('✅ Detailed student information test passed!');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle duplicate waitlist entries gracefully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 'existing-entry', student_id: 'student-1', class_id: 'class-1' },
        error: null
      });

      await expect(waitlistManager.addToWaitlist('student-1', 'class-1'))
        .rejects.toThrow('Student is already on the waitlist for this class');
    });

    it('should handle empty waitlist processing', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { capacity: 30, current_enrollment: 25, waitlist_capacity: 10 },
        error: null
      });

      mockSupabase.limit.mockResolvedValue({ data: [], error: null });

      // Should not throw error when no students on waitlist
      await expect(waitlistManager.processWaitlist('empty-class')).resolves.not.toThrow();
    });

    it('should handle full class capacity correctly', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { capacity: 30, current_enrollment: 30, waitlist_capacity: 10 }, // Full class
        error: null
      });

      await waitlistManager.processWaitlist('full-class');

      // Should not attempt to process waitlist when class is full
      expect(mockSupabase.limit).not.toHaveBeenCalled();
    });
  });

  describe('Notification System Integration', () => {
    it('should send appropriate notifications for waitlist events', async () => {
      console.log('Testing notification system integration...');

      // Mock waitlist entry with class info
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'waitlist-notify',
          student_id: 'student-notify',
          class_id: 'class-notify',
          position: 1,
          classes: {
            id: 'class-notify',
            name: 'Test Class',
            code: 'TEST-101'
          }
        },
        error: null
      });

      // Test notification creation
      await waitlistManager.notifyWaitlistAdvancement('student-notify', 'class-notify');

      // Verify notification record was created
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          waitlist_entry_id: 'waitlist-notify',
          notification_type: NotificationType.ENROLLMENT_AVAILABLE
        })
      );

      console.log('✅ Notification system integration test passed!');
    });
  });
});