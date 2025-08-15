-- =====================================================
-- NOTIFICATIONS SYSTEM SCHEMA
-- Database schema for comprehensive notification system
-- =====================================================

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'assignment_created',
    'assignment_graded', 
    'assignment_due_soon',
    'class_announcement',
    'class_created',
    'enrollment_approved',
    'role_changed',
    'system_message'
  )),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  is_read BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  action_label VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,
  assignment_notifications BOOLEAN DEFAULT TRUE,
  grade_notifications BOOLEAN DEFAULT TRUE,
  announcement_notifications BOOLEAN DEFAULT TRUE,
  system_notifications BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one preference record per user
  UNIQUE(user_id)
);

-- Notification delivery log (for tracking email/push delivery)
CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  delivery_method VARCHAR(20) NOT NULL CHECK (delivery_method IN ('email', 'push', 'sms')),
  delivery_status VARCHAR(20) DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  delivery_attempts INTEGER DEFAULT 0,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);

-- Notification preferences indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Notification delivery log indexes
CREATE INDEX IF NOT EXISTS idx_delivery_log_notification_id ON notification_delivery_log(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_log_status ON notification_delivery_log(delivery_status);
CREATE INDEX IF NOT EXISTS idx_delivery_log_method ON notification_delivery_log(delivery_method);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- System can insert notifications for any user
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Notification preferences policies
CREATE POLICY "Users can manage their own preferences" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Delivery log policies (admin only)
CREATE POLICY "Admins can view delivery logs" ON notification_delivery_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('institution_admin', 'department_admin')
    )
  );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Function for automatic timestamp updates (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Update updated_at timestamp for notification_preferences
CREATE TRIGGER update_notification_preferences_updated_at 
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create notification preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER create_user_notification_preferences
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_preferences();

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to get notification summary for a user
CREATE OR REPLACE FUNCTION get_notification_summary(p_user_id UUID)
RETURNS TABLE (
  total_count BIGINT,
  unread_count BIGINT,
  high_priority_count BIGINT
) AS $
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_read = FALSE) as unread_count,
    COUNT(*) FILTER (WHERE is_read = FALSE AND priority IN ('high', 'urgent')) as high_priority_count
  FROM notifications 
  WHERE user_id = p_user_id 
  AND (expires_at IS NULL OR expires_at > NOW());
END;
$ LANGUAGE plpgsql;

-- Function to mark notifications as read
CREATE OR REPLACE FUNCTION mark_notifications_read(
  p_user_id UUID,
  p_notification_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER AS $
DECLARE
  updated_count INTEGER;
BEGIN
  IF p_notification_ids IS NULL THEN
    -- Mark all unread notifications as read
    UPDATE notifications 
    SET is_read = TRUE, read_at = NOW()
    WHERE user_id = p_user_id AND is_read = FALSE;
  ELSE
    -- Mark specific notifications as read
    UPDATE notifications 
    SET is_read = TRUE, read_at = NOW()
    WHERE user_id = p_user_id 
    AND id = ANY(p_notification_ids) 
    AND is_read = FALSE;
  END IF;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$ LANGUAGE plpgsql;

-- Function to create a notification
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type VARCHAR,
  p_title VARCHAR,
  p_message TEXT,
  p_priority VARCHAR DEFAULT 'medium',
  p_action_url TEXT DEFAULT NULL,
  p_action_label VARCHAR DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID AS $
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id, type, title, message, priority, 
    action_url, action_label, metadata, expires_at
  )
  VALUES (
    p_user_id, p_type, p_title, p_message, p_priority,
    p_action_url, p_action_label, p_metadata, p_expires_at
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$ LANGUAGE plpgsql;

-- Function to clean up expired notifications
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS INTEGER AS $
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM notifications 
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$ LANGUAGE plpgsql;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions to authenticated users
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON notification_preferences TO authenticated;
GRANT SELECT ON notification_delivery_log TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_notification_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notifications_read(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION create_notification(UUID, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR, JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_notifications() TO authenticated;