-- Background Jobs Schema for enrollment system performance optimization
-- This migration creates tables and functions for background job processing

-- Background jobs table
CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  scheduled_at TIMESTAMP DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for background jobs
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_scheduled ON background_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_priority ON background_jobs(priority DESC, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON background_jobs(created_at DESC);

-- Class views tracking table for analytics and notifications
CREATE TABLE IF NOT EXISTS class_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  viewed_at TIMESTAMP DEFAULT NOW(),
  session_id VARCHAR,
  user_agent TEXT,
  ip_address INET
);

-- Indexes for class views
CREATE INDEX IF NOT EXISTS idx_class_views_student ON class_views(student_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_views_class ON class_views(class_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_views_recent ON class_views(viewed_at DESC) WHERE viewed_at > NOW() - INTERVAL '30 days';

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Enrollment statistics table (if not exists from previous migrations)
CREATE TABLE IF NOT EXISTS enrollment_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) NOT NULL UNIQUE,
  total_enrolled INTEGER DEFAULT 0,
  total_pending INTEGER DEFAULT 0,
  total_waitlisted INTEGER DEFAULT 0,
  available_spots INTEGER DEFAULT 0,
  waitlist_available INTEGER DEFAULT 0,
  enrollment_rate DECIMAL(5,2) DEFAULT 0.0, -- Percentage of capacity filled
  average_wait_time INTERVAL, -- Average time from waitlist to enrollment
  peak_enrollment_time TIMESTAMP, -- When most enrollments happen
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for enrollment statistics
CREATE INDEX IF NOT EXISTS idx_enrollment_statistics_class ON enrollment_statistics(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_statistics_updated ON enrollment_statistics(updated_at DESC);

-- Performance monitoring table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR NOT NULL,
  metric_value DECIMAL(10,4) NOT NULL,
  metric_unit VARCHAR DEFAULT 'ms',
  context JSONB DEFAULT '{}',
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance metrics
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name_time ON performance_metrics(metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_recent ON performance_metrics(recorded_at DESC) WHERE recorded_at > NOW() - INTERVAL '24 hours';

-- Function to clean up old background jobs
CREATE OR REPLACE FUNCTION cleanup_old_background_jobs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete completed jobs older than 7 days
  DELETE FROM background_jobs 
  WHERE status = 'completed' 
    AND updated_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Delete failed jobs older than 30 days
  DELETE FROM background_jobs 
  WHERE status = 'failed' 
    AND updated_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get job queue statistics
CREATE OR REPLACE FUNCTION get_job_queue_stats()
RETURNS TABLE(
  status VARCHAR,
  count BIGINT,
  oldest_job TIMESTAMP,
  newest_job TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bj.status,
    COUNT(*) as count,
    MIN(bj.created_at) as oldest_job,
    MAX(bj.created_at) as newest_job
  FROM background_jobs bj
  GROUP BY bj.status;
END;
$$ LANGUAGE plpgsql;

-- Function to record performance metrics
CREATE OR REPLACE FUNCTION record_performance_metric(
  p_metric_name VARCHAR,
  p_metric_value DECIMAL,
  p_metric_unit VARCHAR DEFAULT 'ms',
  p_context JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  metric_id UUID;
BEGIN
  INSERT INTO performance_metrics (metric_name, metric_value, metric_unit, context)
  VALUES (p_metric_name, p_metric_value, p_metric_unit, p_context)
  RETURNING id INTO metric_id;
  
  RETURN metric_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get performance metrics summary
CREATE OR REPLACE FUNCTION get_performance_summary(
  p_metric_name VARCHAR,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
  avg_value DECIMAL,
  min_value DECIMAL,
  max_value DECIMAL,
  count BIGINT,
  p95_value DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    AVG(metric_value) as avg_value,
    MIN(metric_value) as min_value,
    MAX(metric_value) as max_value,
    COUNT(*) as count,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95_value
  FROM performance_metrics
  WHERE metric_name = p_metric_name
    AND recorded_at > NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update enrollment statistics when enrollments change
CREATE OR REPLACE FUNCTION update_enrollment_statistics_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Update statistics for the affected class
  INSERT INTO enrollment_statistics (class_id, updated_at)
  VALUES (COALESCE(NEW.class_id, OLD.class_id), NOW())
  ON CONFLICT (class_id) DO UPDATE SET updated_at = NOW();
  
  -- Schedule a background job to recalculate detailed statistics
  INSERT INTO background_jobs (type, payload, priority)
  VALUES (
    'update_enrollment_stats',
    jsonb_build_object('classIds', ARRAY[COALESCE(NEW.class_id, OLD.class_id)]),
    1
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic statistics updates
DROP TRIGGER IF EXISTS enrollment_statistics_trigger ON enrollments;
CREATE TRIGGER enrollment_statistics_trigger
  AFTER INSERT OR UPDATE OR DELETE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_enrollment_statistics_trigger();

DROP TRIGGER IF EXISTS enrollment_requests_statistics_trigger ON enrollment_requests;
CREATE TRIGGER enrollment_requests_statistics_trigger
  AFTER INSERT OR UPDATE OR DELETE ON enrollment_requests
  FOR EACH ROW EXECUTE FUNCTION update_enrollment_statistics_trigger();

DROP TRIGGER IF EXISTS waitlist_statistics_trigger ON waitlist_entries;
CREATE TRIGGER waitlist_statistics_trigger
  AFTER INSERT OR UPDATE OR DELETE ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION update_enrollment_statistics_trigger();

-- Function to schedule recurring jobs
CREATE OR REPLACE FUNCTION schedule_recurring_jobs()
RETURNS VOID AS $$
BEGIN
  -- Schedule daily cleanup job
  INSERT INTO background_jobs (type, payload, scheduled_at, priority)
  VALUES (
    'cleanup_expired_requests',
    '{}',
    DATE_TRUNC('day', NOW() + INTERVAL '1 day') + INTERVAL '2 hours', -- 2 AM tomorrow
    5
  )
  ON CONFLICT DO NOTHING;
  
  -- Schedule hourly enrollment stats update
  INSERT INTO background_jobs (type, payload, scheduled_at, priority)
  VALUES (
    'update_enrollment_stats',
    '{}',
    DATE_TRUNC('hour', NOW() + INTERVAL '1 hour'),
    3
  )
  ON CONFLICT DO NOTHING;
  
  -- Schedule daily deadline reminders
  INSERT INTO background_jobs (type, payload, scheduled_at, priority)
  VALUES (
    'send_deadline_reminders',
    '{}',
    DATE_TRUNC('day', NOW() + INTERVAL '1 day') + INTERVAL '9 hours', -- 9 AM tomorrow
    4
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Add notification preferences to users table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'notification_preferences'
  ) THEN
    ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{"email": true, "push": true, "sms": false}';
  END IF;
END $$;

-- Create index for notification preferences
CREATE INDEX IF NOT EXISTS idx_users_notification_preferences ON users USING gin(notification_preferences);

-- Initial data setup
INSERT INTO background_jobs (type, payload, scheduled_at, priority)
VALUES 
  ('cache_warmup', '{}', NOW() + INTERVAL '5 minutes', 2),
  ('cleanup_expired_requests', '{}', NOW() + INTERVAL '1 hour', 5)
ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE background_jobs IS 'Queue for background job processing in enrollment system';
COMMENT ON TABLE class_views IS 'Tracking table for class page views for analytics and notifications';
COMMENT ON TABLE notifications IS 'User notifications for enrollment events';
COMMENT ON TABLE enrollment_statistics IS 'Cached enrollment statistics for performance optimization';
COMMENT ON TABLE performance_metrics IS 'Performance monitoring metrics for system optimization';

COMMENT ON FUNCTION cleanup_old_background_jobs() IS 'Cleans up old completed and failed background jobs';
COMMENT ON FUNCTION get_job_queue_stats() IS 'Returns statistics about the background job queue';
COMMENT ON FUNCTION record_performance_metric(VARCHAR, DECIMAL, VARCHAR, JSONB) IS 'Records a performance metric for monitoring';
COMMENT ON FUNCTION get_performance_summary(VARCHAR, INTEGER) IS 'Gets performance metrics summary for a given metric name';
COMMENT ON FUNCTION schedule_recurring_jobs() IS 'Schedules recurring background jobs';