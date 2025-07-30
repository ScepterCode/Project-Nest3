-- Onboarding Analytics Schema Migration
-- This migration adds tables for tracking onboarding analytics and user progression

-- Onboarding sessions tracking table
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP NULL,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 7,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Onboarding step tracking for detailed analytics
CREATE TABLE IF NOT EXISTS onboarding_step_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  step_name VARCHAR NOT NULL,
  step_number INTEGER NOT NULL,
  event_type VARCHAR NOT NULL CHECK (event_type IN ('started', 'completed', 'skipped', 'abandoned')),
  event_data JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Onboarding completion analytics view
CREATE TABLE IF NOT EXISTS onboarding_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  role VARCHAR,
  institution_id UUID,
  total_started INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2) DEFAULT 0,
  avg_completion_time_minutes INTEGER DEFAULT 0,
  drop_off_points JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, role, institution_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_started_at ON onboarding_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_completed_at ON onboarding_sessions(completed_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_step_events_session_id ON onboarding_step_events(session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_step_events_timestamp ON onboarding_step_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_date ON onboarding_analytics(date);
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_role ON onboarding_analytics(role);

-- Function to update analytics daily
CREATE OR REPLACE FUNCTION update_onboarding_analytics()
RETURNS void AS $$
BEGIN
  INSERT INTO onboarding_analytics (date, role, institution_id, total_started, total_completed, completion_rate, avg_completion_time_minutes, drop_off_points)
  SELECT 
    CURRENT_DATE,
    u.role,
    u.institution_id,
    COUNT(*) as total_started,
    COUNT(os.completed_at) as total_completed,
    CASE 
      WHEN COUNT(*) > 0 THEN ROUND((COUNT(os.completed_at)::decimal / COUNT(*)) * 100, 2)
      ELSE 0
    END as completion_rate,
    CASE 
      WHEN COUNT(os.completed_at) > 0 THEN 
        ROUND(AVG(EXTRACT(EPOCH FROM (os.completed_at - os.started_at)) / 60))::integer
      ELSE 0
    END as avg_completion_time_minutes,
    '{}'::jsonb as drop_off_points
  FROM onboarding_sessions os
  JOIN auth.users u ON os.user_id = u.id
  WHERE os.started_at >= CURRENT_DATE - INTERVAL '1 day'
    AND os.started_at < CURRENT_DATE
  GROUP BY u.role, u.institution_id
  ON CONFLICT (date, role, institution_id) 
  DO UPDATE SET
    total_started = EXCLUDED.total_started,
    total_completed = EXCLUDED.total_completed,
    completion_rate = EXCLUDED.completion_rate,
    avg_completion_time_minutes = EXCLUDED.avg_completion_time_minutes,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_onboarding_sessions_updated_at
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_onboarding_analytics_updated_at
  BEFORE UPDATE ON onboarding_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();