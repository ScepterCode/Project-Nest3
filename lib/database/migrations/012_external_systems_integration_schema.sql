-- External Systems Integration Database Schema
-- Migration 012: External System Integration Tables

-- Student Information System (SIS) Configuration
CREATE TABLE IF NOT EXISTS sis_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  provider VARCHAR NOT NULL CHECK (provider IN ('banner', 'peoplesoft', 'canvas', 'blackboard', 'custom')),
  api_endpoint VARCHAR NOT NULL,
  api_key VARCHAR,
  username VARCHAR,
  password VARCHAR, -- Should be encrypted in production
  sync_interval INTEGER DEFAULT 60, -- minutes
  enable_real_time_sync BOOLEAN DEFAULT FALSE,
  sync_students BOOLEAN DEFAULT TRUE,
  sync_enrollments BOOLEAN DEFAULT TRUE,
  sync_courses BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  last_students_sync TIMESTAMP,
  last_enrollments_sync TIMESTAMP,
  last_courses_sync TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id)
);

-- SIS Student Synchronization Data
CREATE TABLE IF NOT EXISTS sis_student_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sis_id VARCHAR NOT NULL,
  student_id UUID REFERENCES users(id),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  student_number VARCHAR,
  academic_level VARCHAR,
  major VARCHAR,
  gpa NUMERIC,
  credit_hours INTEGER DEFAULT 0,
  enrollment_status VARCHAR DEFAULT 'active' CHECK (enrollment_status IN ('active', 'inactive', 'graduated', 'withdrawn')),
  last_sync_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(sis_id, institution_id)
);

-- SIS Enrollment Synchronization Data
CREATE TABLE IF NOT EXISTS sis_enrollment_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sis_enrollment_id VARCHAR NOT NULL,
  student_sis_id VARCHAR NOT NULL,
  course_sis_id VARCHAR NOT NULL,
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  enrollment_status VARCHAR DEFAULT 'enrolled' CHECK (enrollment_status IN ('enrolled', 'dropped', 'withdrawn', 'completed')),
  enrollment_date DATE NOT NULL,
  drop_date DATE,
  grade VARCHAR,
  credit_hours INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(sis_enrollment_id, institution_id)
);

-- SIS Synchronization Log
CREATE TABLE IF NOT EXISTS sis_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  operation VARCHAR NOT NULL, -- 'student_sync', 'enrollment_sync', 'enrollment_push', etc.
  record_id VARCHAR,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  records_processed INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Academic Calendar Configuration
CREATE TABLE IF NOT EXISTS calendar_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  provider VARCHAR NOT NULL CHECK (provider IN ('banner', 'peoplesoft', 'custom', 'manual')),
  api_endpoint VARCHAR,
  api_key VARCHAR,
  sync_interval INTEGER DEFAULT 24, -- hours
  auto_update_deadlines BOOLEAN DEFAULT TRUE,
  enable_notifications BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id)
);

-- Academic Terms
CREATE TABLE IF NOT EXISTS academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  name VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  enrollment_start_date DATE NOT NULL,
  enrollment_end_date DATE NOT NULL,
  drop_deadline DATE NOT NULL,
  withdraw_deadline DATE NOT NULL,
  term_type VARCHAR NOT NULL CHECK (term_type IN ('semester', 'quarter', 'trimester', 'summer', 'winter')),
  year INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id, code, year)
);

-- Enrollment Periods
CREATE TABLE IF NOT EXISTS enrollment_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID REFERENCES academic_terms(id) NOT NULL,
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  name VARCHAR NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  period_type VARCHAR NOT NULL CHECK (period_type IN ('early', 'regular', 'late', 'add_drop', 'withdrawal')),
  priority INTEGER DEFAULT 0,
  restrictions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Academic Events
CREATE TABLE IF NOT EXISTS academic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID REFERENCES academic_terms(id) NOT NULL,
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  event_date TIMESTAMP NOT NULL,
  event_type VARCHAR NOT NULL CHECK (event_type IN ('enrollment_start', 'enrollment_end', 'drop_deadline', 'withdraw_deadline', 'finals_week', 'break', 'holiday')),
  affects_enrollment BOOLEAN DEFAULT FALSE,
  notification_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scheduled Notifications
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  event_id UUID REFERENCES academic_events(id),
  notification_type VARCHAR NOT NULL,
  scheduled_for TIMESTAMP NOT NULL,
  message TEXT NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Gradebook Configuration
CREATE TABLE IF NOT EXISTS gradebook_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  provider VARCHAR NOT NULL CHECK (provider IN ('canvas', 'blackboard', 'moodle', 'brightspace', 'schoology', 'custom')),
  api_endpoint VARCHAR NOT NULL,
  api_key VARCHAR,
  access_token VARCHAR,
  sync_interval INTEGER DEFAULT 6, -- hours
  enable_real_time_sync BOOLEAN DEFAULT FALSE,
  sync_grades BOOLEAN DEFAULT TRUE,
  sync_attendance BOOLEAN DEFAULT TRUE,
  track_completion BOOLEAN DEFAULT TRUE,
  enable_early_warning BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id)
);

-- Gradebook Synchronization Log
CREATE TABLE IF NOT EXISTS gradebook_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  operation VARCHAR NOT NULL, -- 'enrollment_push', 'grade_sync', 'completion_sync', etc.
  record_id VARCHAR,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Communication Platform Configuration
CREATE TABLE IF NOT EXISTS communication_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  email_provider JSONB, -- { type, apiKey, fromEmail, etc. }
  sms_provider JSONB, -- { type, accountSid, authToken, fromNumber, etc. }
  slack_integration JSONB, -- { workspaceId, botToken, channels, etc. }
  teams_integration JSONB, -- { tenantId, clientId, clientSecret, channels, etc. }
  push_provider JSONB, -- { type, serverKey, vapidKeys, etc. }
  webhooks JSONB DEFAULT '[]', -- Array of webhook configurations
  enabled_channels JSONB DEFAULT '["email", "in_app"]',
  fallback_channels JSONB DEFAULT '["email"]',
  retry_policy JSONB DEFAULT '{"maxRetries": 3, "backoffMultiplier": 2, "maxBackoffTime": 300000}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id)
);

-- Communication Delivery Log
CREATE TABLE IF NOT EXISTS communication_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  notification_type VARCHAR NOT NULL,
  channel VARCHAR NOT NULL, -- 'email', 'sms', 'slack', 'teams', 'push', etc.
  provider VARCHAR NOT NULL, -- 'sendgrid', 'twilio', 'slack', etc.
  success BOOLEAN NOT NULL,
  message_id VARCHAR,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  delivered_at TIMESTAMP DEFAULT NOW()
);

-- User Push Tokens (for push notifications)
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  token VARCHAR NOT NULL,
  platform VARCHAR NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  device_info JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- Add gradebook_id to classes table if not exists
ALTER TABLE classes ADD COLUMN IF NOT EXISTS gradebook_id VARCHAR;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES academic_terms(id);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_sis_student_sync_sis_id ON sis_student_sync(sis_id);
CREATE INDEX IF NOT EXISTS idx_sis_student_sync_student_id ON sis_student_sync(student_id);
CREATE INDEX IF NOT EXISTS idx_sis_student_sync_institution_id ON sis_student_sync(institution_id);
CREATE INDEX IF NOT EXISTS idx_sis_student_sync_last_sync ON sis_student_sync(last_sync_at);

CREATE INDEX IF NOT EXISTS idx_sis_enrollment_sync_sis_enrollment_id ON sis_enrollment_sync(sis_enrollment_id);
CREATE INDEX IF NOT EXISTS idx_sis_enrollment_sync_student_sis_id ON sis_enrollment_sync(student_sis_id);
CREATE INDEX IF NOT EXISTS idx_sis_enrollment_sync_course_sis_id ON sis_enrollment_sync(course_sis_id);
CREATE INDEX IF NOT EXISTS idx_sis_enrollment_sync_institution_id ON sis_enrollment_sync(institution_id);

CREATE INDEX IF NOT EXISTS idx_sis_sync_log_institution_id ON sis_sync_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_sis_sync_log_synced_at ON sis_sync_log(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_sis_sync_log_operation ON sis_sync_log(operation);

CREATE INDEX IF NOT EXISTS idx_academic_terms_institution_id ON academic_terms(institution_id);
CREATE INDEX IF NOT EXISTS idx_academic_terms_is_current ON academic_terms(is_current);
CREATE INDEX IF NOT EXISTS idx_academic_terms_year ON academic_terms(year);
CREATE INDEX IF NOT EXISTS idx_academic_terms_dates ON academic_terms(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_enrollment_periods_term_id ON enrollment_periods(term_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_periods_institution_id ON enrollment_periods(institution_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_periods_dates ON enrollment_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_enrollment_periods_priority ON enrollment_periods(priority);

CREATE INDEX IF NOT EXISTS idx_academic_events_term_id ON academic_events(term_id);
CREATE INDEX IF NOT EXISTS idx_academic_events_institution_id ON academic_events(institution_id);
CREATE INDEX IF NOT EXISTS idx_academic_events_event_date ON academic_events(event_date);
CREATE INDEX IF NOT EXISTS idx_academic_events_affects_enrollment ON academic_events(affects_enrollment);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled_for ON scheduled_notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_sent ON scheduled_notifications(sent);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_institution_id ON scheduled_notifications(institution_id);

CREATE INDEX IF NOT EXISTS idx_gradebook_sync_log_institution_id ON gradebook_sync_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_gradebook_sync_log_synced_at ON gradebook_sync_log(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_gradebook_sync_log_operation ON gradebook_sync_log(operation);

CREATE INDEX IF NOT EXISTS idx_communication_delivery_log_user_id ON communication_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_communication_delivery_log_delivered_at ON communication_delivery_log(delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_delivery_log_channel ON communication_delivery_log(channel);
CREATE INDEX IF NOT EXISTS idx_communication_delivery_log_success ON communication_delivery_log(success);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON user_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_is_active ON user_push_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_platform ON user_push_tokens(platform);

CREATE INDEX IF NOT EXISTS idx_classes_gradebook_id ON classes(gradebook_id);
CREATE INDEX IF NOT EXISTS idx_classes_term_id ON classes(term_id);

-- Triggers for maintaining data consistency

-- Function to update academic term current status
CREATE OR REPLACE FUNCTION update_current_term()
RETURNS TRIGGER AS $
BEGIN
  -- If setting a term as current, unset all other current terms for the same institution
  IF NEW.is_current = TRUE THEN
    UPDATE academic_terms 
    SET is_current = FALSE, updated_at = NOW()
    WHERE institution_id = NEW.institution_id 
      AND id != NEW.id 
      AND is_current = TRUE;
  END IF;
  
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Create trigger for academic terms
DROP TRIGGER IF EXISTS academic_terms_current_trigger ON academic_terms;
CREATE TRIGGER academic_terms_current_trigger
  BEFORE INSERT OR UPDATE ON academic_terms
  FOR EACH ROW EXECUTE FUNCTION update_current_term();

-- Function to process scheduled notifications
CREATE OR REPLACE FUNCTION process_scheduled_notifications()
RETURNS VOID AS $
BEGIN
  -- This function would be called by a cron job or background process
  -- to send scheduled notifications that are due
  
  UPDATE scheduled_notifications 
  SET sent = TRUE, sent_at = NOW()
  WHERE scheduled_for <= NOW() 
    AND sent = FALSE;
END;
$ LANGUAGE plpgsql;

-- Function to cleanup old sync logs
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS VOID AS $
BEGIN
  -- Keep only last 30 days of sync logs
  DELETE FROM sis_sync_log 
  WHERE synced_at < NOW() - INTERVAL '30 days';
  
  DELETE FROM gradebook_sync_log 
  WHERE synced_at < NOW() - INTERVAL '30 days';
  
  DELETE FROM communication_delivery_log 
  WHERE delivered_at < NOW() - INTERVAL '30 days';
END;
$ LANGUAGE plpgsql;

-- Function to update class deadlines from term
CREATE OR REPLACE FUNCTION update_class_deadlines_from_term()
RETURNS TRIGGER AS $
BEGIN
  -- Update all classes in this term with new deadlines
  UPDATE classes 
  SET 
    enrollment_start = NEW.enrollment_start_date,
    enrollment_end = NEW.enrollment_end_date,
    drop_deadline = NEW.drop_deadline,
    withdraw_deadline = NEW.withdraw_deadline,
    updated_at = NOW()
  WHERE term_id = NEW.id;
  
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Create trigger for term deadline updates
DROP TRIGGER IF EXISTS term_deadline_update_trigger ON academic_terms;
CREATE TRIGGER term_deadline_update_trigger
  AFTER UPDATE ON academic_terms
  FOR EACH ROW 
  WHEN (OLD.enrollment_start_date != NEW.enrollment_start_date OR 
        OLD.enrollment_end_date != NEW.enrollment_end_date OR 
        OLD.drop_deadline != NEW.drop_deadline OR 
        OLD.withdraw_deadline != NEW.withdraw_deadline)
  EXECUTE FUNCTION update_class_deadlines_from_term();

-- Add some sample data for testing (optional)
-- This would typically be done through the application, not in the migration

-- Sample academic term
INSERT INTO academic_terms (
  id, institution_id, name, code, start_date, end_date,
  enrollment_start_date, enrollment_end_date, drop_deadline, withdraw_deadline,
  term_type, year, is_current
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM institutions LIMIT 1),
  'Fall 2024',
  'FALL2024',
  '2024-08-15',
  '2024-12-15',
  '2024-07-01',
  '2024-08-10',
  '2024-09-15',
  '2024-11-15',
  'semester',
  2024,
  TRUE
) ON CONFLICT DO NOTHING;

-- Sample enrollment periods
INSERT INTO enrollment_periods (
  term_id, institution_id, name, start_date, end_date, period_type, priority
) SELECT 
  t.id,
  t.institution_id,
  'Early Registration',
  '2024-07-01 00:00:00',
  '2024-07-15 23:59:59',
  'early',
  1
FROM academic_terms t 
WHERE t.code = 'FALL2024'
ON CONFLICT DO NOTHING;

INSERT INTO enrollment_periods (
  term_id, institution_id, name, start_date, end_date, period_type, priority
) SELECT 
  t.id,
  t.institution_id,
  'Regular Registration',
  '2024-07-16 00:00:00',
  '2024-08-10 23:59:59',
  'regular',
  2
FROM academic_terms t 
WHERE t.code = 'FALL2024'
ON CONFLICT DO NOTHING;

-- Sample academic events
INSERT INTO academic_events (
  term_id, institution_id, name, event_date, event_type, affects_enrollment, notification_required
) SELECT 
  t.id,
  t.institution_id,
  'Enrollment Period Ends',
  '2024-08-10 23:59:59',
  'enrollment_end',
  TRUE,
  TRUE
FROM academic_terms t 
WHERE t.code = 'FALL2024'
ON CONFLICT DO NOTHING;

INSERT INTO academic_events (
  term_id, institution_id, name, event_date, event_type, affects_enrollment, notification_required
) SELECT 
  t.id,
  t.institution_id,
  'Drop Deadline',
  '2024-09-15 23:59:59',
  'drop_deadline',
  TRUE,
  TRUE
FROM academic_terms t 
WHERE t.code = 'FALL2024'
ON CONFLICT DO NOTHING;