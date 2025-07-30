-- Migration: Role Notification Preferences
-- Description: Add table for storing user role notification preferences

-- Create user role notification preferences table
CREATE TABLE IF NOT EXISTS user_role_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  -- Role request notifications
  role_requests_email BOOLEAN DEFAULT TRUE,
  role_requests_in_app BOOLEAN DEFAULT TRUE,
  role_requests_sms BOOLEAN DEFAULT FALSE,
  
  -- Role assignment notifications
  role_assignments_email BOOLEAN DEFAULT TRUE,
  role_assignments_in_app BOOLEAN DEFAULT TRUE,
  role_assignments_sms BOOLEAN DEFAULT FALSE,
  
  -- Temporary role notifications
  temporary_roles_email BOOLEAN DEFAULT TRUE,
  temporary_roles_in_app BOOLEAN DEFAULT TRUE,
  temporary_roles_sms BOOLEAN DEFAULT FALSE,
  temporary_role_reminder_days INTEGER[] DEFAULT ARRAY[7, 3, 1],
  
  -- Admin notifications
  admin_notifications_email BOOLEAN DEFAULT TRUE,
  admin_notifications_in_app BOOLEAN DEFAULT TRUE,
  admin_notifications_sms BOOLEAN DEFAULT FALSE,
  admin_digest_frequency VARCHAR DEFAULT 'daily' CHECK (admin_digest_frequency IN ('immediate', 'daily', 'weekly')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_role_notification_preferences_user_id 
ON user_role_notification_preferences(user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_role_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_role_notification_preferences_updated_at
  BEFORE UPDATE ON user_role_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_role_notification_preferences_updated_at();

-- Add role notification types to the notifications table if not exists
DO $$
BEGIN
  -- Check if the notifications table exists and add role notification types
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    -- Add role notification types to the type enum if it exists
    -- This is a safe operation that won't fail if the types already exist
    BEGIN
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_request_submitted';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_request_approved';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_request_denied';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_request_expired';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_assigned';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_changed';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_revoked';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_expired';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'temporary_role_assigned';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'temporary_role_expiring';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'temporary_role_expired';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'temporary_role_extended';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pending_role_requests';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'role_request_reminder';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'bulk_assignment_completed';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'verification_required';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'verification_completed';
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'verification_failed';
    EXCEPTION
      WHEN duplicate_object THEN
        -- Ignore if types already exist
        NULL;
    END;
  END IF;
END $$;

-- Create notification templates for role management
INSERT INTO notification_templates (type, name, subject, email_template, sms_template, in_app_template, variables)
VALUES 
  ('role_request_submitted', 'Role Request Submitted', 'Role Request Submitted - {{requestedRole}}', 
   'Your request for {{requestedRole}} role has been submitted and is pending review.', 
   'Role request submitted for {{requestedRole}}', 
   'Your request for {{requestedRole}} role has been submitted and is pending review.',
   ARRAY['requestedRole', 'userName', 'institutionName']),
   
  ('role_request_approved', 'Role Request Approved', 'Role Request Approved - {{requestedRole}}',
   'Congratulations! Your request for {{requestedRole}} role has been approved by {{approverName}}.{{#notes}} Note: {{notes}}{{/notes}}',
   'Role request approved for {{requestedRole}}',
   'Your request for {{requestedRole}} role has been approved by {{approverName}}.',
   ARRAY['requestedRole', 'approverName', 'notes', 'institutionName']),
   
  ('role_request_denied', 'Role Request Denied', 'Role Request Denied - {{requestedRole}}',
   'Your request for {{requestedRole}} role has been denied by {{denierName}}. Reason: {{reason}}',
   'Role request denied for {{requestedRole}}',
   'Your request for {{requestedRole}} role has been denied. Reason: {{reason}}',
   ARRAY['requestedRole', 'denierName', 'reason', 'institutionName']),
   
  ('role_assigned', 'Role Assigned', 'Role Assigned - {{role}}',
   'You have been assigned the {{role}} role by {{assignedByName}}.{{#isTemporary}} This is a temporary assignment{{#expiresAt}} expiring on {{expiresAt}}{{/expiresAt}}.{{/isTemporary}}',
   'Role assigned: {{role}}',
   'You have been assigned the {{role}} role by {{assignedByName}}.',
   ARRAY['role', 'assignedByName', 'isTemporary', 'expiresAt', 'institutionName']),
   
  ('temporary_role_expiring', 'Temporary Role Expiring', 'Temporary Role Expiring - {{role}}',
   'Your temporary {{role}} role will expire in {{daysUntilExpiration}} day(s) on {{expiresAt}}.',
   'Temporary {{role}} role expires in {{daysUntilExpiration}} days',
   'Your temporary {{role}} role will expire in {{daysUntilExpiration}} day(s).',
   ARRAY['role', 'daysUntilExpiration', 'expiresAt', 'institutionName'])
ON CONFLICT (type) DO NOTHING;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON user_role_notification_preferences TO authenticated;
GRANT USAGE ON SEQUENCE user_role_notification_preferences_id_seq TO authenticated;

-- Add RLS policies
ALTER TABLE user_role_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only access their own notification preferences
CREATE POLICY "Users can view own role notification preferences" ON user_role_notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own role notification preferences" ON user_role_notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own role notification preferences" ON user_role_notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all preferences for their institution
CREATE POLICY "Admins can view institution role notification preferences" ON user_role_notification_preferences
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      WHERE ura.user_id = auth.uid()
      AND ura.role IN ('institution_admin', 'system_admin')
      AND ura.status = 'active'
    )
  );