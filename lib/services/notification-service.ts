import { createClient } from '@/lib/supabase/server';
import { 
  Notification, 
  NotificationPreferences, 
  NotificationSummary, 
  NotificationType, 
  NotificationPriority 
} from '@/lib/types/notifications';

export class NotificationService {
  private supabase: any;

  constructor(supabaseClient?: any) {
    this.supabase = supabaseClient;
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient();
    }
    return this.supabase;
  }

  /**
   * Create a new notification
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    options: {
      priority?: NotificationPriority;
      actionUrl?: string;
      actionLabel?: string;
      metadata?: Record<string, any>;
      expiresAt?: Date;
    } = {}
  ): Promise<string | null> {
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase
        .rpc('create_notification', {
          p_user_id: userId,
          p_type: type,
          p_title: title,
          p_message: message,
          p_priority: options.priority || 'medium',
          p_action_url: options.actionUrl,
          p_action_label: options.actionLabel,
          p_metadata: options.metadata || {},
          p_expires_at: options.expiresAt?.toISOString()
        });

      if (error) {
        console.error('Error creating notification:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      types?: NotificationType[];
    } = {}
  ): Promise<Notification[]> {
    try {
      const supabase = await this.getSupabase();
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      if (options.unreadOnly) {
        query = query.eq('is_read', false);
      }

      if (options.types && options.types.length > 0) {
        query = query.in('type', options.types);
      }

      // Filter out expired notifications
      query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching notifications:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  }

  /**
   * Get notification summary for a user
   */
  async getNotificationSummary(userId: string): Promise<NotificationSummary> {
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase
        .rpc('get_notification_summary', { p_user_id: userId });

      if (error) {
        console.error('Error fetching notification summary:', error);
        return {
          total_count: 0,
          unread_count: 0,
          high_priority_count: 0,
          recent_notifications: []
        };
      }

      const summary = data[0];
      
      // Get recent notifications
      const recentNotifications = await this.getUserNotifications(userId, { 
        limit: 5, 
        unreadOnly: false 
      });

      return {
        total_count: summary.total_count,
        unread_count: summary.unread_count,
        high_priority_count: summary.high_priority_count,
        recent_notifications: recentNotifications
      };
    } catch (error) {
      console.error('Error fetching notification summary:', error);
      return {
        total_count: 0,
        unread_count: 0,
        high_priority_count: 0,
        recent_notifications: []
      };
    }
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(userId: string, notificationIds?: string[]): Promise<boolean> {
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase
        .rpc('mark_notifications_read', {
          p_user_id: userId,
          p_notification_ids: notificationIds || null
        });

      if (error) {
        console.error('Error marking notifications as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      return false;
    }
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching notification preferences:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
      return null;
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(
    userId: string, 
    preferences: Partial<Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<boolean> {
    try {
      const supabase = await this.getSupabase();
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          ...preferences,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error updating notification preferences:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      return false;
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<boolean> {
    try {
      const supabase = await this.getSupabase();
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting notification:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  }

  // Convenience methods for common notification types

  /**
   * Send assignment graded notification
   */
  async sendAssignmentGradedNotification(
    studentId: string,
    assignmentTitle: string,
    grade: number,
    totalPoints: number,
    assignmentId: string
  ): Promise<void> {
    const percentage = totalPoints > 0 ? (grade / totalPoints) * 100 : 0;
    
    await this.createNotification(
      studentId,
      'assignment_graded',
      'Assignment Graded',
      `Your assignment "${assignmentTitle}" has been graded. You received ${grade}/${totalPoints} points (${percentage.toFixed(1)}%).`,
      {
        priority: 'medium',
        actionUrl: `/dashboard/student/grades/${assignmentId}`,
        actionLabel: 'View Grade',
        metadata: {
          assignment_id: assignmentId,
          grade,
          total_points: totalPoints,
          percentage
        }
      }
    );
  }

  /**
   * Send assignment due soon notification
   */
  async sendAssignmentDueSoonNotification(
    studentId: string,
    assignmentTitle: string,
    dueDate: Date,
    assignmentId: string
  ): Promise<void> {
    const hoursUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60));
    
    await this.createNotification(
      studentId,
      'assignment_due_soon',
      'Assignment Due Soon',
      `"${assignmentTitle}" is due in ${hoursUntilDue} hours. Don't forget to submit!`,
      {
        priority: hoursUntilDue <= 24 ? 'high' : 'medium',
        actionUrl: `/dashboard/student/assignments/${assignmentId}`,
        actionLabel: 'View Assignment',
        metadata: {
          assignment_id: assignmentId,
          due_date: dueDate.toISOString(),
          hours_until_due: hoursUntilDue
        },
        expiresAt: dueDate
      }
    );
  }

  /**
   * Send new assignment notification
   */
  async sendNewAssignmentNotification(
    studentId: string,
    assignmentTitle: string,
    className: string,
    dueDate: Date,
    assignmentId: string
  ): Promise<void> {
    await this.createNotification(
      studentId,
      'assignment_created',
      'New Assignment Posted',
      `A new assignment "${assignmentTitle}" has been posted in ${className}. Due: ${dueDate.toLocaleDateString()}.`,
      {
        priority: 'medium',
        actionUrl: `/dashboard/student/assignments/${assignmentId}`,
        actionLabel: 'View Assignment',
        metadata: {
          assignment_id: assignmentId,
          class_name: className,
          due_date: dueDate.toISOString()
        }
      }
    );
  }

  /**
   * Send role change notification
   */
  async sendRoleChangeNotification(
    userId: string,
    oldRole: string,
    newRole: string,
    changedBy: string
  ): Promise<void> {
    await this.createNotification(
      userId,
      'role_changed',
      'Role Updated',
      `Your role has been changed from ${oldRole} to ${newRole}.`,
      {
        priority: 'high',
        actionUrl: '/dashboard',
        actionLabel: 'Go to Dashboard',
        metadata: {
          old_role: oldRole,
          new_role: newRole,
          changed_by: changedBy
        }
      }
    );
  }

  /**
   * Send class announcement notification
   */
  async sendClassAnnouncementNotification(
    studentId: string,
    title: string,
    message: string,
    className: string,
    classId: string
  ): Promise<void> {
    await this.createNotification(
      studentId,
      'class_announcement',
      `Announcement: ${title}`,
      `${className}: ${message}`,
      {
        priority: 'medium',
        actionUrl: `/dashboard/student/classes/${classId}`,
        actionLabel: 'View Class',
        metadata: {
          class_id: classId,
          class_name: className,
          announcement_title: title
        }
      }
    );
  }

  /**
   * Send class created notification
   */
  async sendClassCreatedNotification(
    teacherId: string,
    className: string,
    classCode: string,
    classId: string
  ): Promise<void> {
    await this.createNotification(
      teacherId,
      'class_created',
      'Class Created Successfully',
      `Your class "${className}" has been created successfully. Class code: ${classCode}`,
      {
        priority: 'medium',
        actionUrl: `/dashboard/teacher/classes/${classId}`,
        actionLabel: 'View Class',
        metadata: {
          class_id: classId,
          class_name: className,
          class_code: classCode
        }
      }
    );
  }
}