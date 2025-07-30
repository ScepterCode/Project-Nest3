import { createClient } from '@/lib/supabase/server';
import { NotificationType, NotificationPreferences, EnrollmentStatus } from '@/lib/types/enrollment';

export interface NotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: Array<'email' | 'in_app' | 'sms'>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  expiresAt?: Date;
  scheduledFor?: Date;
  templateId?: string;
}

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  name: string;
  subject: string;
  emailTemplate: string;
  smsTemplate: string;
  inAppTemplate: string;
  variables: string[];
}

export interface NotificationSchedule {
  id: string;
  userId: string;
  type: NotificationType;
  scheduledFor: Date;
  data: Record<string, any>;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

export interface DeliveryStatus {
  notificationId: string;
  channel: 'email' | 'in_app' | 'sms';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  deliveredAt?: Date;
  error?: string;
  attempts: number;
}

export class NotificationService {
  private supabase = createClient();

  /**
   * Send a notification to a user
   */
  async sendNotification(notification: NotificationData): Promise<string> {
    try {
      // Get user preferences first
      const preferences = await this.getUserNotificationPreferences(notification.userId);
      
      // Filter channels based on user preferences
      const allowedChannels = this.filterChannelsByPreferences(notification.channels, notification.type, preferences);
      
      if (allowedChannels.length === 0) {
        console.log(`No allowed channels for notification type ${notification.type} for user ${notification.userId}`);
        return '';
      }

      // Store notification in database
      const { data, error } = await this.supabase
        .from('notifications')
        .insert({
          user_id: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data || {},
          channels: allowedChannels,
          priority: notification.priority,
          expires_at: notification.expiresAt?.toISOString(),
          scheduled_for: notification.scheduledFor?.toISOString(),
          template_id: notification.templateId,
          sent_at: notification.scheduledFor ? null : new Date().toISOString(),
          read: false,
          status: notification.scheduledFor ? 'scheduled' : 'sent'
        })
        .select('id')
        .single();

      if (error) throw error;

      const notificationId = data.id;

      // If scheduled for later, don't send now
      if (notification.scheduledFor && notification.scheduledFor > new Date()) {
        await this.scheduleNotification(notificationId, notification);
        return notificationId;
      }

      // Send via different channels
      const deliveryPromises = allowedChannels.map(async (channel) => {
        try {
          await this.sendViaChannel(channel, notification, notificationId);
          await this.updateDeliveryStatus(notificationId, channel, 'sent');
        } catch (error) {
          console.error(`Failed to send via ${channel}:`, error);
          await this.updateDeliveryStatus(notificationId, channel, 'failed', error.message);
        }
      });

      await Promise.allSettled(deliveryPromises);
      return notificationId;
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  }

  /**
   * Send enrollment status change notification
   */
  async sendEnrollmentStatusNotification(
    studentId: string,
    classId: string,
    className: string,
    oldStatus: EnrollmentStatus,
    newStatus: EnrollmentStatus,
    additionalData?: Record<string, any>
  ): Promise<void> {
    const notificationTypeMap = {
      [EnrollmentStatus.ENROLLED]: NotificationType.ENROLLMENT_CONFIRMED,
      [EnrollmentStatus.DROPPED]: NotificationType.ENROLLMENT_DROPPED,
      [EnrollmentStatus.WITHDRAWN]: NotificationType.ENROLLMENT_WITHDRAWN,
      [EnrollmentStatus.WAITLISTED]: NotificationType.WAITLIST_JOINED,
    };

    const type = notificationTypeMap[newStatus];
    if (!type) return;

    const messages = {
      [NotificationType.ENROLLMENT_CONFIRMED]: `You have been successfully enrolled in ${className}`,
      [NotificationType.ENROLLMENT_DROPPED]: `You have been dropped from ${className}`,
      [NotificationType.ENROLLMENT_WITHDRAWN]: `You have withdrawn from ${className}`,
      [NotificationType.WAITLIST_JOINED]: `You have been added to the waitlist for ${className}`,
    };

    const notification: NotificationData = {
      userId: studentId,
      type,
      title: `Enrollment Status Update - ${className}`,
      message: messages[type],
      data: {
        classId,
        className,
        oldStatus,
        newStatus,
        ...additionalData
      },
      channels: ['email', 'in_app'],
      priority: 'high'
    };

    await this.sendNotification(notification);
  }

  /**
   * Send waitlist advancement notification
   */
  async sendWaitlistAdvancementNotification(
    studentId: string,
    classId: string,
    className: string,
    position: number,
    responseDeadline: Date
  ): Promise<void> {
    const notification: NotificationData = {
      userId: studentId,
      type: NotificationType.ENROLLMENT_AVAILABLE,
      title: 'Enrollment Spot Available!',
      message: `A spot has opened up in ${className}. You have until ${responseDeadline.toLocaleString()} to respond.`,
      data: {
        classId,
        className,
        position,
        responseDeadline: responseDeadline.toISOString()
      },
      channels: ['email', 'in_app'],
      priority: 'high',
      expiresAt: responseDeadline
    };

    await this.sendNotification(notification);
  }

  /**
   * Send waitlist position change notification
   */
  async sendPositionChangeNotification(
    studentId: string,
    classId: string,
    className: string,
    newPosition: number,
    estimatedProbability: number
  ): Promise<void> {
    const notification: NotificationData = {
      userId: studentId,
      type: NotificationType.POSITION_CHANGE,
      title: 'Waitlist Position Updated',
      message: `Your position for ${className} has changed to #${newPosition}. Enrollment probability: ${Math.round(estimatedProbability * 100)}%`,
      data: {
        classId,
        className,
        newPosition,
        estimatedProbability
      },
      channels: ['in_app'],
      priority: 'medium'
    };

    await this.sendNotification(notification);
  }

  /**
   * Send deadline reminder notification
   */
  async sendDeadlineReminderNotification(
    studentId: string,
    classId: string,
    className: string,
    responseDeadline: Date
  ): Promise<void> {
    const timeRemaining = responseDeadline.getTime() - Date.now();
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));

    const notification: NotificationData = {
      userId: studentId,
      type: NotificationType.DEADLINE_REMINDER,
      title: 'Response Deadline Approaching',
      message: `You have ${hoursRemaining} hours remaining to respond to the enrollment opportunity for ${className}.`,
      data: {
        classId,
        className,
        responseDeadline: responseDeadline.toISOString(),
        hoursRemaining
      },
      channels: ['email', 'in_app'],
      priority: 'high',
      expiresAt: responseDeadline
    };

    await this.sendNotification(notification);
  }

  /**
   * Send final notice notification
   */
  async sendFinalNoticeNotification(
    studentId: string,
    classId: string,
    className: string,
    responseDeadline: Date
  ): Promise<void> {
    const notification: NotificationData = {
      userId: studentId,
      type: NotificationType.FINAL_NOTICE,
      title: 'Final Notice: Enrollment Deadline',
      message: `This is your final notice. You have until ${responseDeadline.toLocaleString()} to respond to the enrollment opportunity for ${className}.`,
      data: {
        classId,
        className,
        responseDeadline: responseDeadline.toISOString()
      },
      channels: ['email', 'in_app', 'sms'],
      priority: 'urgent',
      expiresAt: responseDeadline
    };

    await this.sendNotification(notification);
  }

  /**
   * Send enrollment deadline reminder notifications
   */
  async sendEnrollmentDeadlineReminder(
    studentId: string,
    classId: string,
    className: string,
    deadline: Date,
    deadlineType: 'enrollment' | 'drop' | 'withdraw'
  ): Promise<void> {
    const timeRemaining = deadline.getTime() - Date.now();
    const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
    
    const typeMap = {
      enrollment: NotificationType.ENROLLMENT_DEADLINE_APPROACHING,
      drop: NotificationType.DROP_DEADLINE_APPROACHING,
      withdraw: NotificationType.WITHDRAW_DEADLINE_APPROACHING
    };

    const actionMap = {
      enrollment: 'enroll in',
      drop: 'drop',
      withdraw: 'withdraw from'
    };

    const notification: NotificationData = {
      userId: studentId,
      type: typeMap[deadlineType],
      title: `${deadlineType.charAt(0).toUpperCase() + deadlineType.slice(1)} Deadline Reminder`,
      message: `You have ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining to ${actionMap[deadlineType]} ${className}. Deadline: ${deadline.toLocaleDateString()}`,
      data: {
        classId,
        className,
        deadline: deadline.toISOString(),
        deadlineType,
        daysRemaining
      },
      channels: ['email', 'in_app'],
      priority: daysRemaining <= 1 ? 'urgent' : 'high'
    };

    await this.sendNotification(notification);
  }

  /**
   * Send capacity alert notification
   */
  async sendCapacityAlertNotification(
    teacherId: string,
    classId: string,
    className: string,
    currentEnrollment: number,
    capacity: number,
    alertType: 'near_full' | 'full' | 'over_capacity'
  ): Promise<void> {
    const utilizationRate = Math.round((currentEnrollment / capacity) * 100);
    
    const messages = {
      near_full: `${className} is ${utilizationRate}% full (${currentEnrollment}/${capacity} students)`,
      full: `${className} has reached full capacity (${currentEnrollment}/${capacity} students)`,
      over_capacity: `${className} is over capacity (${currentEnrollment}/${capacity} students)`
    };

    const notification: NotificationData = {
      userId: teacherId,
      type: NotificationType.CAPACITY_ALERT,
      title: `Class Capacity Alert - ${className}`,
      message: messages[alertType],
      data: {
        classId,
        className,
        currentEnrollment,
        capacity,
        utilizationRate,
        alertType
      },
      channels: ['email', 'in_app'],
      priority: alertType === 'over_capacity' ? 'urgent' : 'high'
    };

    await this.sendNotification(notification);
  }

  /**
   * Send enrollment request notification to teacher
   */
  async sendEnrollmentRequestNotification(
    teacherId: string,
    studentId: string,
    studentName: string,
    classId: string,
    className: string,
    requestId: string,
    justification?: string
  ): Promise<void> {
    const notification: NotificationData = {
      userId: teacherId,
      type: NotificationType.ENROLLMENT_REQUEST_RECEIVED,
      title: `New Enrollment Request - ${className}`,
      message: `${studentName} has requested to enroll in ${className}${justification ? '. Justification: ' + justification : ''}`,
      data: {
        classId,
        className,
        studentId,
        studentName,
        requestId,
        justification
      },
      channels: ['email', 'in_app'],
      priority: 'medium'
    };

    await this.sendNotification(notification);
  }

  /**
   * Schedule notification reminders with response timers
   */
  async scheduleWaitlistResponseReminders(
    studentId: string,
    classId: string,
    className: string,
    responseDeadline: Date
  ): Promise<void> {
    const now = new Date();
    const timeUntilDeadline = responseDeadline.getTime() - now.getTime();
    
    // Schedule reminders at different intervals
    const reminderIntervals = [
      { hours: 24, type: 'initial' },
      { hours: 6, type: 'urgent' },
      { hours: 1, type: 'final' }
    ];

    for (const interval of reminderIntervals) {
      const reminderTime = new Date(responseDeadline.getTime() - (interval.hours * 60 * 60 * 1000));
      
      if (reminderTime > now) {
        const notification: NotificationData = {
          userId: studentId,
          type: interval.type === 'final' ? NotificationType.FINAL_NOTICE : NotificationType.DEADLINE_REMINDER,
          title: `Enrollment Response Reminder - ${className}`,
          message: `You have ${interval.hours} hour${interval.hours !== 1 ? 's' : ''} remaining to respond to the enrollment opportunity for ${className}.`,
          data: {
            classId,
            className,
            responseDeadline: responseDeadline.toISOString(),
            reminderType: interval.type,
            hoursRemaining: interval.hours
          },
          channels: interval.type === 'final' ? ['email', 'in_app', 'sms'] : ['email', 'in_app'],
          priority: interval.type === 'final' ? 'urgent' : 'high',
          scheduledFor: reminderTime,
          expiresAt: responseDeadline
        };

        await this.sendNotification(notification);
      }
    }
  }

  /**
   * Get user's notification preferences
   */
  async getUserNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const { data, error } = await this.supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Return default preferences
      return {
        userId,
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
      };
    }

    return {
      userId: data.user_id,
      enrollmentConfirmation: {
        email: data.enrollment_confirmation_email,
        inApp: data.enrollment_confirmation_in_app,
        sms: data.enrollment_confirmation_sms
      },
      waitlistUpdates: {
        email: data.waitlist_updates_email,
        inApp: data.waitlist_updates_in_app,
        sms: data.waitlist_updates_sms
      },
      deadlineReminders: {
        email: data.deadline_reminders_email,
        inApp: data.deadline_reminders_in_app,
        sms: data.deadline_reminders_sms,
        daysBeforeDeadline: data.deadline_reminder_days || [7, 3, 1]
      },
      capacityAlerts: {
        email: data.capacity_alerts_email,
        inApp: data.capacity_alerts_in_app,
        sms: data.capacity_alerts_sms
      },
      digestFrequency: data.digest_frequency || 'daily'
    };
  }

  /**
   * Update user's notification preferences
   */
  async updateNotificationPreferences(preferences: NotificationPreferences): Promise<void> {
    const { error } = await this.supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: preferences.userId,
        enrollment_confirmation_email: preferences.enrollmentConfirmation.email,
        enrollment_confirmation_in_app: preferences.enrollmentConfirmation.inApp,
        enrollment_confirmation_sms: preferences.enrollmentConfirmation.sms,
        waitlist_updates_email: preferences.waitlistUpdates.email,
        waitlist_updates_in_app: preferences.waitlistUpdates.inApp,
        waitlist_updates_sms: preferences.waitlistUpdates.sms,
        deadline_reminders_email: preferences.deadlineReminders.email,
        deadline_reminders_in_app: preferences.deadlineReminders.inApp,
        deadline_reminders_sms: preferences.deadlineReminders.sms,
        deadline_reminder_days: preferences.deadlineReminders.daysBeforeDeadline,
        capacity_alerts_email: preferences.capacityAlerts.email,
        capacity_alerts_in_app: preferences.capacityAlerts.inApp,
        capacity_alerts_sms: preferences.capacityAlerts.sms,
        digest_frequency: preferences.digestFrequency,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  }

  /**
   * Mark notifications as read
   */
  async markNotificationsAsRead(userId: string, notificationIds: string[]): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', notificationIds);

    if (error) throw error;
  }

  /**
   * Get user's unread notifications
   */
  async getUnreadNotifications(userId: string, limit: number = 50): Promise<Array<{
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    data: Record<string, any>;
    sentAt: Date;
    priority: string;
  }>> {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map(notification => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      sentAt: new Date(notification.sent_at),
      priority: notification.priority
    }));
  }

  /**
   * Process scheduled notifications
   */
  async processScheduledNotifications(): Promise<void> {
    const now = new Date().toISOString();
    
    const { data: scheduledNotifications, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .limit(100);

    if (error) {
      console.error('Failed to fetch scheduled notifications:', error);
      return;
    }

    for (const notification of scheduledNotifications || []) {
      try {
        // Send the notification
        const notificationData: NotificationData = {
          userId: notification.user_id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          channels: notification.channels,
          priority: notification.priority,
          expiresAt: notification.expires_at ? new Date(notification.expires_at) : undefined
        };

        // Send via different channels
        const deliveryPromises = notification.channels.map(async (channel: string) => {
          try {
            await this.sendViaChannel(channel as 'email' | 'in_app' | 'sms', notificationData, notification.id);
            await this.updateDeliveryStatus(notification.id, channel as 'email' | 'in_app' | 'sms', 'sent');
          } catch (error) {
            console.error(`Failed to send via ${channel}:`, error);
            await this.updateDeliveryStatus(notification.id, channel as 'email' | 'in_app' | 'sms', 'failed', error.message);
          }
        });

        await Promise.allSettled(deliveryPromises);

        // Update notification status
        await this.supabase
          .from('notifications')
          .update({ 
            status: 'sent', 
            sent_at: new Date().toISOString() 
          })
          .eq('id', notification.id);

      } catch (error) {
        console.error(`Failed to process scheduled notification ${notification.id}:`, error);
        
        // Update notification status to failed
        await this.supabase
          .from('notifications')
          .update({ status: 'failed' })
          .eq('id', notification.id);
      }
    }
  }

  /**
   * Send digest notifications
   */
  async sendDigestNotifications(frequency: 'daily' | 'weekly'): Promise<void> {
    // Get users who want digest notifications
    const { data: users, error } = await this.supabase
      .from('user_notification_preferences')
      .select('user_id')
      .eq('digest_frequency', frequency);

    if (error) {
      console.error('Failed to fetch users for digest:', error);
      return;
    }

    const timeframe = frequency === 'daily' ? 1 : 7;
    const since = new Date(Date.now() - timeframe * 24 * 60 * 60 * 1000).toISOString();

    for (const user of users || []) {
      try {
        // Get unread notifications for this user
        const { data: notifications } = await this.supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.user_id)
          .eq('read', false)
          .gte('sent_at', since)
          .order('sent_at', { ascending: false });

        if (!notifications || notifications.length === 0) continue;

        // Group notifications by type
        const groupedNotifications = notifications.reduce((acc, notification) => {
          if (!acc[notification.type]) {
            acc[notification.type] = [];
          }
          acc[notification.type].push(notification);
          return acc;
        }, {} as Record<string, any[]>);

        // Create digest notification
        const digestNotification: NotificationData = {
          userId: user.user_id,
          type: NotificationType.SYSTEM_MAINTENANCE, // Using as digest type
          title: `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Notification Digest`,
          message: `You have ${notifications.length} unread notifications from the past ${timeframe} day${timeframe > 1 ? 's' : ''}.`,
          data: {
            digestType: frequency,
            notificationCount: notifications.length,
            groupedNotifications
          },
          channels: ['email'],
          priority: 'low'
        };

        await this.sendNotification(digestNotification);
      } catch (error) {
        console.error(`Failed to send digest to user ${user.user_id}:`, error);
      }
    }
  }

  // Private helper methods

  private filterChannelsByPreferences(
    channels: Array<'email' | 'in_app' | 'sms'>,
    type: NotificationType,
    preferences: NotificationPreferences
  ): Array<'email' | 'in_app' | 'sms'> {
    const allowedChannels: Array<'email' | 'in_app' | 'sms'> = [];

    for (const channel of channels) {
      let allowed = false;

      // Check based on notification type
      switch (type) {
        case NotificationType.ENROLLMENT_CONFIRMED:
        case NotificationType.ENROLLMENT_APPROVED:
        case NotificationType.ENROLLMENT_DENIED:
        case NotificationType.ENROLLMENT_DROPPED:
        case NotificationType.ENROLLMENT_WITHDRAWN:
          allowed = preferences.enrollmentConfirmation[channel === 'in_app' ? 'inApp' : channel];
          break;

        case NotificationType.POSITION_CHANGE:
        case NotificationType.ENROLLMENT_AVAILABLE:
        case NotificationType.WAITLIST_JOINED:
        case NotificationType.WAITLIST_REMOVED:
          allowed = preferences.waitlistUpdates[channel === 'in_app' ? 'inApp' : channel];
          break;

        case NotificationType.DEADLINE_REMINDER:
        case NotificationType.FINAL_NOTICE:
        case NotificationType.ENROLLMENT_DEADLINE_APPROACHING:
        case NotificationType.DROP_DEADLINE_APPROACHING:
        case NotificationType.WITHDRAW_DEADLINE_APPROACHING:
          allowed = preferences.deadlineReminders[channel === 'in_app' ? 'inApp' : channel];
          break;

        case NotificationType.CAPACITY_ALERT:
        case NotificationType.NEW_SECTION_AVAILABLE:
          allowed = preferences.capacityAlerts[channel === 'in_app' ? 'inApp' : channel];
          break;

        default:
          // For other types, allow if any preference is enabled
          allowed = preferences.enrollmentConfirmation[channel === 'in_app' ? 'inApp' : channel];
          break;
      }

      if (allowed) {
        allowedChannels.push(channel);
      }
    }

    return allowedChannels;
  }

  private async scheduleNotification(notificationId: string, notification: NotificationData): Promise<void> {
    // Store in scheduled notifications table or use a job queue
    console.log(`Scheduled notification ${notificationId} for ${notification.scheduledFor}`);
  }

  private async sendViaChannel(
    channel: 'email' | 'in_app' | 'sms',
    notification: NotificationData,
    notificationId: string
  ): Promise<void> {
    switch (channel) {
      case 'email':
        await this.sendEmailNotification(notification);
        break;
      case 'in_app':
        await this.sendInAppNotification(notification);
        break;
      case 'sms':
        await this.sendSMSNotification(notification);
        break;
    }
  }

  private async updateDeliveryStatus(
    notificationId: string,
    channel: 'email' | 'in_app' | 'sms',
    status: 'sent' | 'delivered' | 'failed',
    error?: string
  ): Promise<void> {
    const { error: dbError } = await this.supabase
      .from('notification_delivery_status')
      .upsert({
        notification_id: notificationId,
        channel,
        status,
        delivered_at: status === 'delivered' ? new Date().toISOString() : null,
        error,
        attempts: 1,
        updated_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('Failed to update delivery status:', dbError);
    }
  }

  // Private methods for different notification channels

  private async sendEmailNotification(notification: NotificationData): Promise<void> {
    // In a real implementation, this would integrate with an email service
    // like SendGrid, AWS SES, or similar
    console.log(`Sending email notification to user ${notification.userId}:`, {
      title: notification.title,
      message: notification.message
    });

    // For now, just log the notification
    // In production, you would:
    // 1. Get user's email address
    // 2. Format the email template
    // 3. Send via email service
    // 4. Handle delivery status
  }

  private async sendInAppNotification(notification: NotificationData): Promise<void> {
    // In-app notifications are handled by storing in the database
    // The frontend will poll or use real-time subscriptions to show them
    console.log(`In-app notification stored for user ${notification.userId}`);
  }

  private async sendSMSNotification(notification: NotificationData): Promise<void> {
    // In a real implementation, this would integrate with an SMS service
    // like Twilio, AWS SNS, or similar
    console.log(`Sending SMS notification to user ${notification.userId}:`, {
      message: notification.message
    });

    // For now, just log the notification
    // In production, you would:
    // 1. Get user's phone number
    // 2. Format the SMS message
    // 3. Send via SMS service
    // 4. Handle delivery status
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications(): Promise<void> {
    const now = new Date().toISOString();
    
    const { error } = await this.supabase
      .from('notifications')
      .delete()
      .lt('expires_at', now)
      .not('expires_at', 'is', null);

    if (error) {
      console.error('Failed to cleanup expired notifications:', error);
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<NotificationType, number>;
    recentActivity: Array<{
      date: string;
      count: number;
    }>;
  }> {
    // Get total and unread counts
    const { data: totalData } = await this.supabase
      .from('notifications')
      .select('id, read, type, sent_at')
      .eq('user_id', userId);

    if (!totalData) {
      return {
        total: 0,
        unread: 0,
        byType: {} as Record<NotificationType, number>,
        recentActivity: []
      };
    }

    const total = totalData.length;
    const unread = totalData.filter(n => !n.read).length;

    // Count by type
    const byType = totalData.reduce((acc, notification) => {
      acc[notification.type as NotificationType] = (acc[notification.type as NotificationType] || 0) + 1;
      return acc;
    }, {} as Record<NotificationType, number>);

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentNotifications = totalData.filter(n => new Date(n.sent_at) >= sevenDaysAgo);
    
    const recentActivity = recentNotifications.reduce((acc, notification) => {
      const date = new Date(notification.sent_at).toISOString().split('T')[0];
      const existing = acc.find(a => a.date === date);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ date, count: 1 });
      }
      return acc;
    }, [] as Array<{ date: string; count: number }>);

    return {
      total,
      unread,
      byType,
      recentActivity: recentActivity.sort((a, b) => a.date.localeCompare(b.date))
    };
  }
}