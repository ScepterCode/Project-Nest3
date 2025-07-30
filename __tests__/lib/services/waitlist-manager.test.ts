import { WaitlistManager } from '@/lib/services/waitlist-manager';
import { NotificationType, AuditAction } from '@/lib/types/enrollment';

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
  single: jest.fn()
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('WaitlistManager', () => {
  let waitlistManager: WaitlistManager;

  beforeEach(() => {
    waitlistManager = new WaitlistManager();
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
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
  });

  describe('addToWaitlist', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should add student to waitlist successfully', async () => {
      // Mock no existing entry
      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // no existing entry
        .mockResolvedValueOnce({ // new entry created
          data: {
            id: 'waitlist-1',
            student_id: studentId,
            class_id: classId,
            position: 1,
            priority: 0,
            estimated_probability: 0.8,
            added_at: new Date().toISOString()
          },
          error: null
        });

      // Mock empty waitlist for position calculation
      mockSupabase.order.mockResolvedValue({ data: [], error: null });

      const result = await waitlistManager.addToWaitlist(studentId, classId);

      expect(result.student_id).toBe(studentId);
      expect(result.class_id).toBe(classId);
      expect(result.position).toBe(1);
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: studentId,
          class_id: classId,
          position: 1,
          priority: 0
        })
      );
    });

    it('should calculate correct position based on priority', async () => {
      const existingEntries = [
        { position: 1, priority: 10, added_at: '2024-01-01' },
        { position: 2, priority: 5, added_at: '2024-01-02' },
        { position: 3, priority: 0, added_at: '2024-01-03' }
      ];

      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: {
            id: 'waitlist-1',
            student_id: studentId,
            class_id: classId,
            position: 2, // Should be inserted at position 2 with priority 7
            priority: 7
          },
          error: null
        });

      mockSupabase.order.mockResolvedValue({ data: existingEntries, error: null });

      const result = await waitlistManager.addToWaitlist(studentId, classId, 7);

      expect(result.position).toBe(2);
    });

    it('should reject duplicate waitlist entries', async () => {
      // Mock existing entry
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'existing-waitlist',
          student_id: studentId,
          class_id: classId
        },
        error: null
      });

      await expect(waitlistManager.addToWaitlist(studentId, classId))
        .rejects.toThrow('Student is already on the waitlist for this class');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: null, error: { message: 'Database error' } });

      mockSupabase.order.mockResolvedValue({ data: [], error: null });

      await expect(waitlistManager.addToWaitlist(studentId, classId))
        .rejects.toThrow();
    });
  });

  describe('removeFromWaitlist', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should remove student from waitlist successfully', async () => {
      // Mock existing entry
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'waitlist-1',
          student_id: studentId,
          class_id: classId,
          position: 3
        },
        error: null
      });

      mockSupabase.delete.mockResolvedValue({ data: null, error: null });
      mockSupabase.order.mockResolvedValue({ data: [], error: null }); // For reordering

      await expect(waitlistManager.removeFromWaitlist(studentId, classId))
        .resolves.not.toThrow();

      expect(mockSupabase.delete).toHaveBeenCalled();
    });

    it('should throw error if student not on waitlist', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      await expect(waitlistManager.removeFromWaitlist(studentId, classId))
        .rejects.toThrow('Student is not on the waitlist for this class');
    });
  });

  describe('processWaitlist', () => {
    const classId = 'class-1';

    it('should process waitlist when spots are available', async () => {
      // Mock class with available capacity
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { capacity: 30, current_enrollment: 25 },
          error: null
        })
        .mockResolvedValueOnce({
          data: {
            id: 'waitlist-1',
            student_id: 'student-1',
            class_id: classId,
            position: 1
          },
          error: null
        });

      mockSupabase.update.mockResolvedValue({ data: null, error: null });

      await expect(waitlistManager.processWaitlist(classId)).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          notified_at: expect.any(String),
          notification_expires_at: expect.any(String)
        })
      );
    });

    it('should not process waitlist when class is full', async () => {
      // Mock full class
      mockSupabase.single.mockResolvedValue({
        data: { capacity: 30, current_enrollment: 30 },
        error: null
      });

      await expect(waitlistManager.processWaitlist(classId)).resolves.not.toThrow();

      // Should not attempt to get next student
      expect(mockSupabase.limit).not.toHaveBeenCalled();
    });

    it('should handle empty waitlist gracefully', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { capacity: 30, current_enrollment: 25 },
          error: null
        })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      await expect(waitlistManager.processWaitlist(classId)).resolves.not.toThrow();
    });
  });

  describe('getWaitlistPosition', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should return correct waitlist position', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { position: 5 },
        error: null
      });

      const position = await waitlistManager.getWaitlistPosition(studentId, classId);

      expect(position).toBe(5);
    });

    it('should return 0 if student not on waitlist', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      const position = await waitlistManager.getWaitlistPosition(studentId, classId);

      expect(position).toBe(0);
    });
  });

  describe('handleWaitlistResponse', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should handle acceptance response', async () => {
      const mockEntry = {
        id: 'waitlist-1',
        student_id: studentId,
        class_id: classId,
        position: 1
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockEntry, error: null });

      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null }); // For enrollment
      mockSupabase.delete.mockResolvedValue({ data: null, error: null }); // Remove from waitlist

      await expect(waitlistManager.handleWaitlistResponse(studentId, classId, 'accept'))
        .resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          responded: true,
          response: 'accept'
        })
      );
    });

    it('should handle decline response', async () => {
      const mockEntry = {
        id: 'waitlist-1',
        student_id: studentId,
        class_id: classId,
        position: 1
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockEntry, error: null })
        .mockResolvedValueOnce({ data: mockEntry, error: null }); // For removal

      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.delete.mockResolvedValue({ data: null, error: null });

      await expect(waitlistManager.handleWaitlistResponse(studentId, classId, 'decline'))
        .resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          responded: true,
          response: 'decline'
        })
      );
    });

    it('should throw error for non-existent waitlist entry', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      await expect(waitlistManager.handleWaitlistResponse(studentId, classId, 'accept'))
        .rejects.toThrow('Waitlist entry not found');
    });
  });

  describe('processExpiredNotifications', () => {
    it('should process expired notifications', async () => {
      const expiredEntries = [
        {
          id: 'waitlist-1',
          student_id: 'student-1',
          class_id: 'class-1',
          notification_expires_at: new Date(Date.now() - 1000).toISOString(),
          waitlist_notifications: [{ responded: false }]
        }
      ];

      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.lt.mockResolvedValue({ data: expiredEntries, error: null });
      mockSupabase.single.mockResolvedValue({ data: expiredEntries[0], error: null });
      mockSupabase.update.mockResolvedValue({ data: null, error: null });
      mockSupabase.delete.mockResolvedValue({ data: null, error: null });

      await expect(waitlistManager.processExpiredNotifications()).resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          responded: true,
          response: 'no_response'
        })
      );
    });

    it('should handle no expired notifications', async () => {
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.lt.mockResolvedValue({ data: [], error: null });

      await expect(waitlistManager.processExpiredNotifications()).resolves.not.toThrow();
    });
  });

  describe('getWaitlistStats', () => {
    const classId = 'class-1';

    it('should return waitlist statistics', async () => {
      const mockEntries = [
        { position: 1, added_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        { position: 2, added_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { position: 3, added_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() }
      ];

      mockSupabase.select.mockResolvedValue({ data: mockEntries, error: null });

      const stats = await waitlistManager.getWaitlistStats(classId);

      expect(stats.totalWaitlisted).toBe(3);
      expect(stats.averageWaitTime).toBeGreaterThan(0);
      expect(stats.positionDistribution).toHaveLength(3);
      expect(stats.recentActivity).toHaveLength(3);
    });

    it('should handle empty waitlist', async () => {
      mockSupabase.select.mockResolvedValue({ data: [], error: null });

      const stats = await waitlistManager.getWaitlistStats(classId);

      expect(stats.totalWaitlisted).toBe(0);
      expect(stats.averageWaitTime).toBe(0);
      expect(stats.positionDistribution).toHaveLength(0);
    });
  });

  describe('estimateEnrollmentProbability', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should return higher probability for lower positions', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { position: 2 },
        error: null
      });

      const probability = await waitlistManager.estimateEnrollmentProbability(studentId, classId);

      expect(probability).toBeGreaterThan(0.5); // Position 2 should have high probability
    });

    it('should return lower probability for higher positions', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { position: 20 },
        error: null
      });

      const probability = await waitlistManager.estimateEnrollmentProbability(studentId, classId);

      expect(probability).toBeLessThan(0.3); // Position 20 should have low probability
    });
  });

  describe('Position Calculation and Reordering', () => {
    const classId = 'class-1';

    it('should calculate correct position for new entry with standard priority', async () => {
      const existingEntries = [
        { position: 1, priority: 0, added_at: '2024-01-01T10:00:00Z' },
        { position: 2, priority: 0, added_at: '2024-01-02T10:00:00Z' },
        { position: 3, priority: 0, added_at: '2024-01-03T10:00:00Z' }
      ];

      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: {
            id: 'waitlist-new',
            student_id: 'student-new',
            class_id: classId,
            position: 4,
            priority: 0
          },
          error: null
        });

      mockSupabase.order.mockResolvedValue({ data: existingEntries, error: null });

      const result = await waitlistManager.addToWaitlist('student-new', classId, 0);

      expect(result.position).toBe(4);
    });

    it('should insert high priority student at correct position', async () => {
      const existingEntries = [
        { position: 1, priority: 10, added_at: '2024-01-01T10:00:00Z' },
        { position: 2, priority: 5, added_at: '2024-01-02T10:00:00Z' },
        { position: 3, priority: 0, added_at: '2024-01-03T10:00:00Z' }
      ];

      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: {
            id: 'waitlist-priority',
            student_id: 'student-priority',
            class_id: classId,
            position: 2, // Should be inserted between priority 10 and 5
            priority: 7
          },
          error: null
        });

      mockSupabase.order.mockResolvedValue({ data: existingEntries, error: null });

      const result = await waitlistManager.addToWaitlist('student-priority', classId, 7);

      expect(result.position).toBe(2);
    });

    it('should reorder waitlist correctly after removal', async () => {
      const studentToRemove = 'student-2';
      const remainingEntries = [
        { id: 'waitlist-1', priority: 0, added_at: '2024-01-01T10:00:00Z' },
        { id: 'waitlist-3', priority: 0, added_at: '2024-01-03T10:00:00Z' }
      ];

      // Mock existing entry for removal
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'waitlist-2',
          student_id: studentToRemove,
          class_id: classId,
          position: 2
        },
        error: null
      });

      mockSupabase.delete.mockResolvedValue({ data: null, error: null });
      mockSupabase.order.mockResolvedValue({ data: remainingEntries, error: null });

      await waitlistManager.removeFromWaitlist(studentToRemove, classId);

      // Verify reordering was called
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          position: expect.any(Number),
          estimated_probability: expect.any(Number)
        })
      );
    });
  });

  describe('Automatic Promotion Logic', () => {
    const classId = 'class-1';

    it('should process multiple students when multiple spots available', async () => {
      const availableSpots = 3;
      const waitlistEntries = [
        { id: 'w1', student_id: 's1', position: 1, priority: 0, notified_at: null },
        { id: 'w2', student_id: 's2', position: 2, priority: 0, notified_at: null },
        { id: 'w3', student_id: 's3', position: 3, priority: 0, notified_at: null },
        { id: 'w4', student_id: 's4', position: 4, priority: 0, notified_at: null }
      ];

      mockSupabase.single.mockResolvedValue({
        data: { capacity: 30, current_enrollment: 27, waitlist_capacity: 10 },
        error: null
      });

      mockSupabase.limit.mockResolvedValue({ data: waitlistEntries.slice(0, 3), error: null });

      await waitlistManager.processWaitlist(classId);

      // Should notify first 3 students
      expect(mockSupabase.update).toHaveBeenCalledTimes(3);
    });

    it('should respect priority order in promotion', async () => {
      const waitlistEntries = [
        { id: 'w1', student_id: 's1', position: 1, priority: 10, notified_at: null },
        { id: 'w2', student_id: 's2', position: 2, priority: 5, notified_at: null },
        { id: 'w3', student_id: 's3', position: 3, priority: 0, notified_at: null }
      ];

      mockSupabase.single.mockResolvedValue({
        data: { capacity: 30, current_enrollment: 29, waitlist_capacity: 10 },
        error: null
      });

      mockSupabase.limit.mockResolvedValue({ data: [waitlistEntries[0]], error: null });

      await waitlistManager.processWaitlist(classId);

      // Should notify highest priority student first
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          notified_at: expect.any(String),
          notification_expires_at: expect.any(String)
        })
      );
    });

    it('should not process waitlist when class is full', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { capacity: 30, current_enrollment: 30, waitlist_capacity: 10 },
        error: null
      });

      await waitlistManager.processWaitlist(classId);

      // Should not attempt to get waitlist entries
      expect(mockSupabase.limit).not.toHaveBeenCalled();
    });

    it('should skip already notified students', async () => {
      const waitlistEntries = [
        { id: 'w1', student_id: 's1', position: 1, priority: 0, notified_at: '2024-01-01T10:00:00Z' },
        { id: 'w2', student_id: 's2', position: 2, priority: 0, notified_at: null }
      ];

      mockSupabase.single.mockResolvedValue({
        data: { capacity: 30, current_enrollment: 29, waitlist_capacity: 10 },
        error: null
      });

      mockSupabase.limit.mockResolvedValue({ data: [waitlistEntries[1]], error: null });

      await waitlistManager.processWaitlist(classId);

      // Should only process unnotified students
      expect(mockSupabase.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('Probability Calculation', () => {
    it('should calculate higher probability for positions 1-3', async () => {
      const studentId = 'student-1';
      const classId = 'class-1';

      for (let position = 1; position <= 3; position++) {
        mockSupabase.single.mockResolvedValue({
          data: { position },
          error: null
        });

        const probability = await waitlistManager.estimateEnrollmentProbability(studentId, classId);
        expect(probability).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should calculate medium probability for positions 4-10', async () => {
      const studentId = 'student-1';
      const classId = 'class-1';

      for (let position = 4; position <= 10; position++) {
        mockSupabase.single.mockResolvedValue({
          data: { position },
          error: null
        });

        const probability = await waitlistManager.estimateEnrollmentProbability(studentId, classId);
        expect(probability).toBeGreaterThanOrEqual(0.2);
        expect(probability).toBeLessThan(0.8);
      }
    });

    it('should calculate low probability for positions > 15', async () => {
      const studentId = 'student-1';
      const classId = 'class-1';

      mockSupabase.single.mockResolvedValue({
        data: { position: 20 },
        error: null
      });

      const probability = await waitlistManager.estimateEnrollmentProbability(studentId, classId);
      expect(probability).toBeLessThanOrEqual(0.1);
    });
  });

  describe('Bulk Operations', () => {
    it('should process multiple waitlists successfully', async () => {
      const classIds = ['class-1', 'class-2', 'class-3'];
      
      // Mock successful processing for all classes
      mockSupabase.single.mockResolvedValue({
        data: { capacity: 30, current_enrollment: 29, waitlist_capacity: 10 },
        error: null
      });
      mockSupabase.limit.mockResolvedValue({ data: [], error: null });

      const result = await waitlistManager.bulkProcessWaitlists(classIds);

      expect(result.processed).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle errors in bulk processing', async () => {
      const classIds = ['class-1', 'class-2'];
      
      // Mock error for second class
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { capacity: 30, current_enrollment: 29, waitlist_capacity: 10 },
          error: null
        })
        .mockRejectedValueOnce(new Error('Database error'));

      mockSupabase.limit.mockResolvedValue({ data: [], error: null });

      const result = await waitlistManager.bulkProcessWaitlists(classIds);

      expect(result.processed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].classId).toBe('class-2');
    });
  });

  describe('Student Waitlist Information', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should return complete waitlist information for student', async () => {
      const mockEntry = {
        id: 'waitlist-1',
        student_id: studentId,
        class_id: classId,
        position: 3,
        estimated_probability: 0.6,
        added_at: '2024-01-01T10:00:00Z',
        notified_at: null,
        notification_expires_at: null
      };

      mockSupabase.single.mockResolvedValue({ data: mockEntry, error: null });

      const info = await waitlistManager.getStudentWaitlistInfo(studentId, classId);

      expect(info.entry).toEqual(mockEntry);
      expect(info.position).toBe(3);
      expect(info.estimatedProbability).toBe(0.6);
      expect(info.isNotified).toBe(false);
      expect(info.estimatedWaitTime).toContain('days');
    });

    it('should handle student not on waitlist', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      const info = await waitlistManager.getStudentWaitlistInfo(studentId, classId);

      expect(info.entry).toBeNull();
      expect(info.position).toBe(0);
      expect(info.estimatedProbability).toBe(0);
      expect(info.estimatedWaitTime).toBe('Not on waitlist');
    });

    it('should return notification status correctly', async () => {
      const mockEntry = {
        id: 'waitlist-1',
        student_id: studentId,
        class_id: classId,
        position: 1,
        notified_at: '2024-01-01T10:00:00Z',
        notification_expires_at: '2024-01-02T10:00:00Z'
      };

      mockSupabase.single.mockResolvedValue({ data: mockEntry, error: null });

      const info = await waitlistManager.getStudentWaitlistInfo(studentId, classId);

      expect(info.isNotified).toBe(true);
      expect(info.responseDeadline).toEqual(new Date('2024-01-02T10:00:00Z'));
    });
  });

  describe('notifyWaitlistAdvancement', () => {
    const studentId = 'student-1';
    const classId = 'class-1';

    it('should create notification record', async () => {
      const mockEntry = {
        id: 'waitlist-1',
        student_id: studentId,
        class_id: classId
      };

      mockSupabase.single.mockResolvedValue({ data: mockEntry, error: null });
      mockSupabase.insert.mockResolvedValue({ data: null, error: null });

      await expect(waitlistManager.notifyWaitlistAdvancement(studentId, classId))
        .resolves.not.toThrow();

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          waitlist_entry_id: 'waitlist-1',
          notification_type: NotificationType.ENROLLMENT_AVAILABLE
        })
      );
    });

    it('should handle missing waitlist entry gracefully', async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      await expect(waitlistManager.notifyWaitlistAdvancement(studentId, classId))
        .resolves.not.toThrow();

      expect(mockSupabase.insert).not.toHaveBeenCalled();
    });
  });
});