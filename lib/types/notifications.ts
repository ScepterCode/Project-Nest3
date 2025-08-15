// Types for notification system

export type NotificationType = 
  | 'assignment_created'
  | 'assignment_graded'
  | 'assignment_due_soon'
  | 'class_announcement'
  | 'class_created'
  | 'enrollment_approved'
  | 'role_changed'
  | 'system_message';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  is_read: boolean;
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, any>;
  created_at: string;
  read_at?: string;
  expires_at?: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  assignment_notifications: boolean;
  grade_notifications: boolean;
  announcement_notifications: boolean;
  system_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationSummary {
  total_count: number;
  unread_count: number;
  high_priority_count: number;
  recent_notifications: Notification[];
}