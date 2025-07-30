import { NotificationService, NotificationData } from '@/lib/services/notification-service';
import { NotificationType, EnrollmentStatus, NotificationPreferences } from '@/lib/types/enrollment';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis()
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    notificationService = new NotificationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should send notification successfully', async () => {
      const mockNotificationData: NotificationData = {
        userId: 'user-123',
        type: NotificationType.ENROLLMENT_CONFIRMED,
        title: 'Test Notification',
        message: 'Test message',
        channels: ['email', 'in_app'],
        priority: 'high'
      };

      // Mock user preferences
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'user-123',
          enrollment_confirmation_email: true,
          enrollment_confirmation_in_app: true,
          enrollment_confirmation_sms: false
        },
        error: null
      });

      // Mock notification insert
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      // Mock delivery status updates
      mockSupabase.upsert.mockResolvedValue({ error: null });

      const result = await notificationService.sendNotification(mockNotificationData);

      expect(result).toBe('notification-123');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          type: NotificationType.ENROLLMENT_CONFIRMED,
          title: 'Test Notification',
          message: 'Test message',
          channels: ['email', 'in_app'],
          priority: 'high'
        })
      );
    });

    it('should filter channels based on user preferences', async () => {
      const mockNotificationData: NotificationData = {
        userId: 'user-123',
        type: NotificationType.ENROLLMENT_CONFIRMED,
        title: 'Test Notification',
        message: 'Test message',
        channels: ['email', 'in_app', 'sms'],
        priority: 'high'
      };

      // Mock user preferences - only email enabled
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'user-123',
          enrollment_confirmation_email: true,
          enrollment_confirmation_in_app: false,
          enrollment_confirmation_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.sendNotification(mockNotificationData);

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: ['email'] // Only email should be included
        })
      );
    });

    it('should handle scheduled notifications', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      const mockNotificationData: NotificationData = {
        userId: 'user-123',
        type: NotificationType.DEADLINE_REMINDER,
        title: 'Scheduled Notification',
        message: 'This is scheduled',
        channels: ['email'],
        priority: 'medium',
        scheduledFor: futureDate
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'user-123',
          deadline_reminders_email: true,
          deadline_reminders_in_app: true,
          deadline_reminders_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      const result = await notificationService.sendNotification(mockNotificationData);

      expect(result).toBe('notification-123');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduled_for: futureDate.toISOString(),
          status: 'scheduled'
        })
      );
    });
  });

  describe('sendEnrollmentStatusNotification', () => {
    it('should send enrollment confirmation notification', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'student-123',
          enrollment_confirmation_email: true,
          enrollment_confirmation_in_app: true,
          enrollment_confirmation_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.sendEnrollmentStatusNotification(
        'student-123',
        'class-456',
        'Mathematics 101',
        EnrollmentStatus.PENDING,
        EnrollmentStatus.ENROLLED
      );

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.ENROLLMENT_CONFIRMED,
          title: 'Enrollment Status Update - Mathematics 101',
          message: 'You have been successfully enrolled in Mathematics 101'
        })
      );
    });

    it('should send waitlist notification', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'student-123',
          enrollment_confirmation_email: true,
          enrollment_confirmation_in_app: true,
          enrollment_confirmation_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.sendEnrollmentStatusNotification(
        'student-123',
        'class-456',
        'Mathematics 101',
        EnrollmentStatus.PENDING,
        EnrollmentStatus.WAITLISTED
      );

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.WAITLIST_JOINED,
          title: 'Enrollment Status Update - Mathematics 101',
          message: 'You have been added to the waitlist for Mathematics 101'
        })
      );
    });
  });

  describe('sendWaitlistAdvancementNotification', () => {
    it('should send waitlist advancement notification with response timer', async () => {
      const responseDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'student-123',
          waitlist_updates_email: true,
          waitlist_updates_in_app: true,
          waitlist_updates_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.sendWaitlistAdvancementNotification(
        'student-123',
        'class-456',
        'Mathematics 101',
        1,
        responseDeadline
      );

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.ENROLLMENT_AVAILABLE,
          title: 'Enrollment Spot Available!',
          priority: 'high',
          expires_at: responseDeadline.toISOString()
        })
      );
    });
  });

  describe('sendEnrollmentDeadlineReminder', () => {
    it('should send enrollment deadline reminder', async () => {
      const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'student-123',
          deadline_reminders_email: true,
          deadline_reminders_in_app: true,
          deadline_reminders_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.sendEnrollmentDeadlineReminder(
        'student-123',
        'class-456',
        'Mathematics 101',
        deadline,
        'enrollment'
      );

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.ENROLLMENT_DEADLINE_APPROACHING,
          title: 'Enrollment Deadline Reminder',
          message: expect.stringContaining('3 days remaining to enroll in Mathematics 101'),
          priority: 'high'
        })
      );
    });

    it('should set urgent priority for deadlines within 1 day', async () => {
      const deadline = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'student-123',
          deadline_reminders_email: true,
          deadline_reminders_in_app: true,
          deadline_reminders_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.sendEnrollmentDeadlineReminder(
        'student-123',
        'class-456',
        'Mathematics 101',
        deadline,
        'drop'
      );

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.DROP_DEADLINE_APPROACHING,
          priority: 'urgent'
        })
      );
    });
  });

  describe('sendCapacityAlertNotification', () => {
    it('should send capacity alert to teacher', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'teacher-123',
          capacity_alerts_email: true,
          capacity_alerts_in_app: true,
          capacity_alerts_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.sendCapacityAlertNotification(
        'teacher-123',
        'class-456',
        'Mathematics 101',
        28,
        30,
        'near_full'
      );

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.CAPACITY_ALERT,
          title: 'Class Capacity Alert - Mathematics 101',
          message: 'Mathematics 101 is 93% full (28/30 students)',
          priority: 'high'
        })
      );
    });

    it('should set urgent priority for over capacity alerts', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          user_id: 'teacher-123',
          capacity_alerts_email: true,
          capacity_alerts_in_app: true,
          capacity_alerts_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.sendCapacityAlertNotification(
        'teacher-123',
        'class-456',
        'Mathematics 101',
        32,
        30,
        'over_capacity'
      );

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'urgent'
        })
      );
    });
  });

  describe('scheduleWaitlistResponseReminders', () => {
    it('should schedule multiple reminder notifications', async () => {
      const responseDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

      mockSupabase.single.mockResolvedValue({
        data: {
          user_id: 'student-123',
          deadline_reminders_email: true,
          deadline_reminders_in_app: true,
          deadline_reminders_sms: false
        },
        error: null
      });

      mockSupabase.single.mockResolvedValue({
        data: { id: 'notification-123' },
        error: null
      });

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.scheduleWaitlistResponseReminders(
        'student-123',
        'class-456',
        'Mathematics 101',
        responseDeadline
      );

      // Should schedule 3 reminders (24h, 6h, 1h before deadline)
      expect(mockSupabase.insert).toHaveBeenCalledTimes(3);
      
      // Check that final notice has urgent priority and all channels
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.FINAL_NOTICE,
          priority: 'urgent',
          channels: ['email', 'in_app', 'sms']
        })
      );
    });
  });

  describe('getUserNotificationPreferences', () => {
    it('should return user preferences', async () => {
      const mockPreferences = {
        user_id: 'user-123',
        enrollment_confirmation_email: true,
        enrollment_confirmation_in_app: true,
        enrollment_confirmation_sms: false,
        waitlist_updates_email: true,
        waitlist_updates_in_app: true,
        waitlist_updates_sms: false,
        deadline_reminders_email: true,
        deadline_reminders_in_app: true,
        deadline_reminders_sms: false,
        deadline_reminder_days: [7, 3, 1],
        capacity_alerts_email: true,
        capacity_alerts_in_app: true,
        capacity_alerts_sms: false,
        digest_frequency: 'daily'
      };

      mockSupabase.single.mockResolvedValue({
        data: mockPreferences,
        error: null
      });

      const preferences = await notificationService.getUserNotificationPreferences('user-123');

      expect(preferences).toEqual({
        userId: 'user-123',
        enrollmentConfirmation: {
          email: true,
          inApp: true,
          sms: false
        },
        waitlistUpdates: {
          email: true,
          inApp: true,
          sms: false
        },
        deadlineReminders: {
          email: true,
          inApp: true,
          sms: false,
          daysBeforeDeadline: [7, 3, 1]
        },
        capacityAlerts: {
          email: true,
          inApp: true,
          sms: false
        },
        digestFrequency: 'daily'
      });
    });

    it('should return default preferences when user preferences not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      const preferences = await notificationService.getUserNotificationPreferences('user-123');

      expect(preferences).toEqual({
        userId: 'user-123',
        enrollmentConfirmation: {
          email: true,
          inApp: true,
          sms: false
        },
        waitlistUpdates: {
          email: true,
          inApp: true,
          sms: false
        },
        deadlineReminders: {
          email: true,
          inApp: true,
          sms: false,
          daysBeforeDeadline: [7, 3, 1]
        },
        capacityAlerts: {
          email: true,
          inApp: true,
          sms: false
        },
        digestFrequency: 'daily'
      });
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update user preferences', async () => {
      const preferences: NotificationPreferences = {
        userId: 'user-123',
        enrollmentConfirmation: {
          email: false,
          inApp: true,
          sms: true
        },
        waitlistUpdates: {
          email: true,
          inApp: true,
          sms: false
        },
        deadlineReminders: {
          email: true,
          inApp: true,
          sms: true,
          daysBeforeDeadline: [1, 3]
        },
        capacityAlerts: {
          email: false,
          inApp: true,
          sms: false
        },
        digestFrequency: 'weekly'
      };

      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.updateNotificationPreferences(preferences);

      expect(mockSupabase.upsert).toHaveBeenCalledWith({
        user_id: 'user-123',
        enrollment_confirmation_email: false,
        enrollment_confirmation_in_app: true,
        enrollment_confirmation_sms: true,
        waitlist_updates_email: true,
        waitlist_updates_in_app: true,
        waitlist_updates_sms: false,
        deadline_reminders_email: true,
        deadline_reminders_in_app: true,
        deadline_reminders_sms: true,
        deadline_reminder_days: [1, 3],
        capacity_alerts_email: false,
        capacity_alerts_in_app: true,
        capacity_alerts_sms: false,
        digest_frequency: 'weekly',
        updated_at: expect.any(String)
      });
    });
  });

  describe('processScheduledNotifications', () => {
    it('should process scheduled notifications that are due', async () => {
      const mockScheduledNotifications = [
        {
          id: 'notification-1',
          user_id: 'user-123',
          type: NotificationType.DEADLINE_REMINDER,
          title: 'Scheduled Reminder',
          message: 'This is a scheduled reminder',
          data: {},
          channels: ['email', 'in_app'],
          priority: 'medium',
          expires_at: null
        }
      ];

      mockSupabase.limit.mockResolvedValue({
        data: mockScheduledNotifications,
        error: null
      });

      mockSupabase.update.mockResolvedValue({ error: null });
      mockSupabase.upsert.mockResolvedValue({ error: null });

      await notificationService.processScheduledNotifications();

      expect(mockSupabase.select).toHaveBeenCalledWith('*');
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'scheduled');
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'sent',
        sent_at: expect.any(String)
      });
    });
  });

  describe('getUnreadNotifications', () => {
    it('should return unread notifications for user', async () => {
      const mockNotifications = [
        {
          id: 'notification-1',
          type: NotificationType.ENROLLMENT_CONFIRMED,
          title: 'Enrollment Confirmed',
          message: 'You have been enrolled',
          data: {},
          sent_at: new Date().toISOString(),
          priority: 'high'
        }
      ];

      mockSupabase.limit.mockResolvedValue({
        data: mockNotifications,
        error: null
      });

      const notifications = await notificationService.getUnreadNotifications('user-123', 10);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        id: 'notification-1',
        type: NotificationType.ENROLLMENT_CONFIRMED,
        title: 'Enrollment Confirmed',
        message: 'You have been enrolled',
        data: {},
        sentAt: expect.any(Date),
        priority: 'high'
      });
    });
  });

  describe('markNotificationsAsRead', () => {
    it('should mark notifications as read', async () => {
      mockSupabase.in.mockResolvedValue({ error: null });

      await notificationService.markNotificationsAsRead('user-123', ['notification-1', 'notification-2']);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        read: true,
        read_at: expect.any(String)
      });
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSupabase.in).toHaveBeenCalledWith('id', ['notification-1', 'notification-2']);
    });
  });
});