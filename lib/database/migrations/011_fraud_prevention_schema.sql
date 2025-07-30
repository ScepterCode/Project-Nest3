-- Fraud Prevention and Security Schema
-- This migration adds tables for enrollment fraud prevention, rate limiting, and identity verification

-- Enrollment attempts tracking for rate limiting and pattern analysis
CREATE TABLE enrollment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id),
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR,
  attempt_type VARCHAR NOT NULL DEFAULT 'enrollment', -- 'enrollment', 'waitlist', 'search', etc.
  success BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Rate limiting entries
CREATE TABLE rate_limit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR UNIQUE NOT NULL, -- Format: "user_id:action" or "ip:action"
  attempts INTEGER DEFAULT 0,
  window_start TIMESTAMP NOT NULL,
  blocked_until TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Fraud detection log
CREATE TABLE fraud_detection_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id),
  risk_score INTEGER NOT NULL,
  flags TEXT[] DEFAULT '{}',
  validation_result JSONB DEFAULT '{}',
  detected_at TIMESTAMP DEFAULT NOW()
);

-- Suspicious activities tracking
CREATE TABLE suspicious_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  activity_type VARCHAR NOT NULL, -- 'rapid_enrollment', 'duplicate_requests', etc.
  description TEXT NOT NULL,
  risk_level VARCHAR NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}',
  detected_at TIMESTAMP DEFAULT NOW()
);

-- Identity verification challenges
CREATE TABLE verification_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  type VARCHAR NOT NULL, -- 'email', 'sms', 'security_question', 'admin_approval'
  challenge_data TEXT NOT NULL, -- Encrypted challenge (code, question, etc.)
  operation_type VARCHAR NOT NULL, -- 'bulk_enrollment', 'override_capacity', etc.
  operation_metadata JSONB DEFAULT '{}',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  invalidated_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Verification events log
CREATE TABLE verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  challenge_id UUID REFERENCES verification_challenges(id),
  event_type VARCHAR NOT NULL, -- 'success', 'failed_attempt', 'expired', 'invalidated'
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Enrollment pattern analysis results
CREATE TABLE enrollment_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  pattern_type VARCHAR NOT NULL, -- 'temporal', 'behavioral', 'academic', 'geographic'
  description TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  confidence DECIMAL(3,2) NOT NULL, -- 0.00 to 1.00
  metadata JSONB DEFAULT '{}',
  detected_at TIMESTAMP DEFAULT NOW(),
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP
);

-- Security audit log for sensitive operations
CREATE TABLE security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  action VARCHAR NOT NULL,
  resource_type VARCHAR, -- 'enrollment', 'class', 'user', etc.
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  risk_score INTEGER,
  verification_required BOOLEAN DEFAULT FALSE,
  verification_completed BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_enrollment_attempts_user_id ON enrollment_attempts(user_id);
CREATE INDEX idx_enrollment_attempts_created_at ON enrollment_attempts(created_at);
CREATE INDEX idx_enrollment_attempts_ip_address ON enrollment_attempts(ip_address);
CREATE INDEX idx_enrollment_attempts_user_created ON enrollment_attempts(user_id, created_at);

CREATE INDEX idx_rate_limit_entries_key ON rate_limit_entries(key);
CREATE INDEX idx_rate_limit_entries_updated_at ON rate_limit_entries(updated_at);

CREATE INDEX idx_fraud_detection_log_user_id ON fraud_detection_log(user_id);
CREATE INDEX idx_fraud_detection_log_detected_at ON fraud_detection_log(detected_at);
CREATE INDEX idx_fraud_detection_log_risk_score ON fraud_detection_log(risk_score);

CREATE INDEX idx_suspicious_activities_user_id ON suspicious_activities(user_id);
CREATE INDEX idx_suspicious_activities_activity_type ON suspicious_activities(activity_type);
CREATE INDEX idx_suspicious_activities_risk_level ON suspicious_activities(risk_level);
CREATE INDEX idx_suspicious_activities_resolved ON suspicious_activities(resolved);
CREATE INDEX idx_suspicious_activities_detected_at ON suspicious_activities(detected_at);

CREATE INDEX idx_verification_challenges_user_id ON verification_challenges(user_id);
CREATE INDEX idx_verification_challenges_expires_at ON verification_challenges(expires_at);
CREATE INDEX idx_verification_challenges_verified ON verification_challenges(verified);

CREATE INDEX idx_verification_events_user_id ON verification_events(user_id);
CREATE INDEX idx_verification_events_challenge_id ON verification_events(challenge_id);
CREATE INDEX idx_verification_events_timestamp ON verification_events(timestamp);

CREATE INDEX idx_enrollment_patterns_user_id ON enrollment_patterns(user_id);
CREATE INDEX idx_enrollment_patterns_pattern_type ON enrollment_patterns(pattern_type);
CREATE INDEX idx_enrollment_patterns_risk_score ON enrollment_patterns(risk_score);
CREATE INDEX idx_enrollment_patterns_detected_at ON enrollment_patterns(detected_at);
CREATE INDEX idx_enrollment_patterns_reviewed ON enrollment_patterns(reviewed);

CREATE INDEX idx_security_audit_log_user_id ON security_audit_log(user_id);
CREATE INDEX idx_security_audit_log_action ON security_audit_log(action);
CREATE INDEX idx_security_audit_log_timestamp ON security_audit_log(timestamp);
CREATE INDEX idx_security_audit_log_success ON security_audit_log(success);

-- Functions for automatic cleanup of old data
CREATE OR REPLACE FUNCTION cleanup_old_enrollment_attempts()
RETURNS void AS $$
BEGIN
  -- Delete enrollment attempts older than 30 days
  DELETE FROM enrollment_attempts 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete rate limit entries older than 7 days
  DELETE FROM rate_limit_entries 
  WHERE updated_at < NOW() - INTERVAL '7 days';
  
  -- Delete expired verification challenges
  DELETE FROM verification_challenges 
  WHERE expires_at < NOW() AND verified = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate user risk score
CREATE OR REPLACE FUNCTION calculate_user_risk_score(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  risk_score INTEGER := 0;
  recent_flags INTEGER;
  pattern_risk INTEGER;
  suspicious_count INTEGER;
BEGIN
  -- Count recent fraud detection flags (last 30 days)
  SELECT COUNT(*) INTO recent_flags
  FROM fraud_detection_log
  WHERE user_id = user_uuid 
    AND detected_at > NOW() - INTERVAL '30 days'
    AND array_length(flags, 1) > 0;
  
  -- Get average pattern risk score (last 30 days)
  SELECT COALESCE(AVG(risk_score), 0) INTO pattern_risk
  FROM enrollment_patterns
  WHERE user_id = user_uuid 
    AND detected_at > NOW() - INTERVAL '30 days';
  
  -- Count unresolved suspicious activities
  SELECT COUNT(*) INTO suspicious_count
  FROM suspicious_activities
  WHERE user_id = user_uuid 
    AND resolved = FALSE;
  
  -- Calculate composite risk score
  risk_score := (recent_flags * 10) + (pattern_risk::INTEGER) + (suspicious_count * 15);
  
  -- Cap at 100
  IF risk_score > 100 THEN
    risk_score := 100;
  END IF;
  
  RETURN risk_score;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is currently rate limited
CREATE OR REPLACE FUNCTION is_user_rate_limited(user_uuid UUID, action_name VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  rate_limit_key VARCHAR;
  entry RECORD;
BEGIN
  rate_limit_key := user_uuid::TEXT || ':' || action_name;
  
  SELECT * INTO entry
  FROM rate_limit_entries
  WHERE key = rate_limit_key;
  
  -- If no entry exists, user is not rate limited
  IF entry IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if currently blocked
  IF entry.blocked_until IS NOT NULL AND entry.blocked_until > NOW() THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically log enrollment attempts
CREATE OR REPLACE FUNCTION log_enrollment_attempt()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO enrollment_attempts (user_id, class_id, attempt_type, success)
  VALUES (NEW.student_id, NEW.class_id, 'enrollment', TRUE);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_enrollment_attempt
  AFTER INSERT ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION log_enrollment_attempt();

-- Trigger to automatically log waitlist attempts
CREATE OR REPLACE FUNCTION log_waitlist_attempt()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO enrollment_attempts (user_id, class_id, attempt_type, success)
  VALUES (NEW.student_id, NEW.class_id, 'waitlist', TRUE);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_waitlist_attempt
  AFTER INSERT ON waitlist_entries
  FOR EACH ROW
  EXECUTE FUNCTION log_waitlist_attempt();

-- Row Level Security (RLS) policies
ALTER TABLE enrollment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_detection_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicious_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- Policies for enrollment_attempts
CREATE POLICY "Users can view their own enrollment attempts" ON enrollment_attempts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all enrollment attempts" ON enrollment_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'department_admin')
    )
  );

-- Policies for fraud_detection_log
CREATE POLICY "Users can view their own fraud detection log" ON fraud_detection_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all fraud detection logs" ON fraud_detection_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'department_admin')
    )
  );

-- Policies for suspicious_activities
CREATE POLICY "Admins can manage suspicious activities" ON suspicious_activities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'department_admin')
    )
  );

-- Policies for verification_challenges
CREATE POLICY "Users can manage their own verification challenges" ON verification_challenges
  FOR ALL USING (user_id = auth.uid());

-- Policies for security_audit_log
CREATE POLICY "Admins can view security audit log" ON security_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'department_admin')
    )
  );

-- Comments for documentation
COMMENT ON TABLE enrollment_attempts IS 'Tracks all enrollment-related attempts for rate limiting and pattern analysis';
COMMENT ON TABLE rate_limit_entries IS 'Stores rate limiting state for users and IP addresses';
COMMENT ON TABLE fraud_detection_log IS 'Logs fraud detection results and risk scores';
COMMENT ON TABLE suspicious_activities IS 'Tracks detected suspicious enrollment activities';
COMMENT ON TABLE verification_challenges IS 'Stores identity verification challenges for sensitive operations';
COMMENT ON TABLE verification_events IS 'Logs verification attempt events';
COMMENT ON TABLE enrollment_patterns IS 'Stores detected enrollment patterns and anomalies';
COMMENT ON TABLE security_audit_log IS 'Comprehensive audit log for security-sensitive operations';