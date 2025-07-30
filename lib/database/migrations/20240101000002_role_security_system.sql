-- Role Security System Migration
-- Creates tables for comprehensive security logging, error handling, and monitoring

-- Security events table
CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR NOT NULL,
  severity VARCHAR NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  user_id UUID REFERENCES users(id),
  target_user_id UUID REFERENCES users(id),
  institution_id UUID REFERENCES institutions(id),
  department_id UUID REFERENCES departments(id),
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR,
  correlation_id VARCHAR,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolution TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Security alerts table
CREATE TABLE security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR NOT NULL,
  severity VARCHAR NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  title VARCHAR NOT NULL,
  description TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMP DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolution TEXT
);

-- Security alert events junction table
CREATE TABLE security_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES security_alerts(id) ON DELETE CASCADE,
  event_id UUID REFERENCES security_events(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(alert_id, event_id)
);

-- Role escalation attempts table
CREATE TABLE role_escalation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  from_role VARCHAR,
  to_role VARCHAR NOT NULL,
  requested_at TIMESTAMP DEFAULT NOW(),
  blocked BOOLEAN DEFAULT FALSE,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Suspicious activities table
CREATE TABLE suspicious_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  institution_id UUID REFERENCES institutions(id),
  activity_type VARCHAR NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  detected_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolution TEXT
);

-- Rate limiting tables
CREATE TABLE role_request_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  requested_role VARCHAR NOT NULL,
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  client_ip INET,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE role_request_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  requested_role VARCHAR NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, requested_role)
);

CREATE TABLE role_request_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  blocked_by UUID REFERENCES users(id) NOT NULL,
  reason TEXT NOT NULL,
  blocked_at TIMESTAMP DEFAULT NOW(),
  blocked_until TIMESTAMP NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, active) WHERE active = TRUE
);

CREATE TABLE rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  violation_type VARCHAR NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE rate_limit_admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  admin_id UUID REFERENCES users(id) NOT NULL,
  action VARCHAR NOT NULL,
  reason TEXT,
  duration_hours INTEGER,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Error logging table
CREATE TABLE role_error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code VARCHAR NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id UUID REFERENCES users(id),
  institution_id UUID REFERENCES institutions(id),
  request_id VARCHAR,
  details JSONB DEFAULT '{}',
  stack_trace TEXT,
  recoverable BOOLEAN DEFAULT FALSE,
  suggested_action TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Verification system tables (extending existing verification system)
CREATE TABLE verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  requested_role VARCHAR NOT NULL,
  verification_method VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  justification TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  review_notes TEXT,
  expires_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE verification_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID REFERENCES verification_requests(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL,
  description TEXT NOT NULL,
  file_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE verification_reviewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  UNIQUE(user_id, institution_id)
);

CREATE TABLE verification_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID REFERENCES verification_requests(id) ON DELETE CASCADE,
  status VARCHAR NOT NULL,
  changed_by UUID REFERENCES users(id) NOT NULL,
  reason TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_institution_id ON security_events(institution_id);
CREATE INDEX idx_security_events_timestamp ON security_events(timestamp);
CREATE INDEX idx_security_events_event_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);

CREATE INDEX idx_security_alerts_user_id ON security_alerts(user_id);
CREATE INDEX idx_security_alerts_institution_id ON security_alerts(institution_id);
CREATE INDEX idx_security_alerts_resolved ON security_alerts(resolved);
CREATE INDEX idx_security_alerts_severity ON security_alerts(severity);

CREATE INDEX idx_role_escalation_attempts_user_id ON role_escalation_attempts(user_id);
CREATE INDEX idx_role_escalation_attempts_blocked ON role_escalation_attempts(blocked);
CREATE INDEX idx_role_escalation_attempts_requested_at ON role_escalation_attempts(requested_at);

CREATE INDEX idx_suspicious_activities_user_id ON suspicious_activities(user_id);
CREATE INDEX idx_suspicious_activities_institution_id ON suspicious_activities(institution_id);
CREATE INDEX idx_suspicious_activities_detected_at ON suspicious_activities(detected_at);
CREATE INDEX idx_suspicious_activities_resolved ON suspicious_activities(resolved);

CREATE INDEX idx_rate_limits_user_id ON role_request_rate_limits(user_id);
CREATE INDEX idx_rate_limits_created_at ON role_request_rate_limits(created_at);
CREATE INDEX idx_rate_limits_institution_id ON role_request_rate_limits(institution_id);
CREATE INDEX idx_rate_limits_client_ip ON role_request_rate_limits(client_ip);

CREATE INDEX idx_cooldowns_user_id ON role_request_cooldowns(user_id);
CREATE INDEX idx_cooldowns_expires_at ON role_request_cooldowns(expires_at);

CREATE INDEX idx_blocks_user_id ON role_request_blocks(user_id);
CREATE INDEX idx_blocks_active ON role_request_blocks(active);
CREATE INDEX idx_blocks_blocked_until ON role_request_blocks(blocked_until);

CREATE INDEX idx_error_log_user_id ON role_error_log(user_id);
CREATE INDEX idx_error_log_institution_id ON role_error_log(institution_id);
CREATE INDEX idx_error_log_timestamp ON role_error_log(timestamp);
CREATE INDEX idx_error_log_error_code ON role_error_log(error_code);
CREATE INDEX idx_error_log_severity ON role_error_log(severity);

CREATE INDEX idx_verification_requests_user_id ON verification_requests(user_id);
CREATE INDEX idx_verification_requests_institution_id ON verification_requests(institution_id);
CREATE INDEX idx_verification_requests_status ON verification_requests(status);
CREATE INDEX idx_verification_requests_expires_at ON verification_requests(expires_at);

CREATE INDEX idx_verification_reviewers_institution_id ON verification_reviewers(institution_id);
CREATE INDEX idx_verification_reviewers_active ON verification_reviewers(is_active);

-- Row Level Security (RLS) policies
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicious_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- Security events policies
CREATE POLICY "Users can view their own security events" ON security_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Institution admins can view institution security events" ON security_events
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_role_assignments 
      WHERE user_id = auth.uid() 
      AND role IN ('institution_admin', 'system_admin')
      AND status = 'active'
    )
  );

CREATE POLICY "System admins can view all security events" ON security_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments 
      WHERE user_id = auth.uid() 
      AND role = 'system_admin'
      AND status = 'active'
    )
  );

-- Security alerts policies
CREATE POLICY "Institution admins can view institution security alerts" ON security_alerts
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_role_assignments 
      WHERE user_id = auth.uid() 
      AND role IN ('institution_admin', 'system_admin')
      AND status = 'active'
    )
  );

CREATE POLICY "System admins can view all security alerts" ON security_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments 
      WHERE user_id = auth.uid() 
      AND role = 'system_admin'
      AND status = 'active'
    )
  );

-- Suspicious activities policies
CREATE POLICY "Users can view their own suspicious activities" ON suspicious_activities
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Institution admins can view institution suspicious activities" ON suspicious_activities
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_role_assignments 
      WHERE user_id = auth.uid() 
      AND role IN ('institution_admin', 'system_admin')
      AND status = 'active'
    )
  );

-- Verification requests policies
CREATE POLICY "Users can view their own verification requests" ON verification_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own verification requests" ON verification_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Reviewers can view verification requests for their institution" ON verification_requests
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM verification_reviewers 
      WHERE user_id = auth.uid() 
      AND is_active = TRUE
    )
    OR
    institution_id IN (
      SELECT institution_id FROM user_role_assignments 
      WHERE user_id = auth.uid() 
      AND role IN ('institution_admin', 'system_admin')
      AND status = 'active'
    )
  );

-- Functions for cleanup and maintenance
CREATE OR REPLACE FUNCTION cleanup_old_security_events()
RETURNS void AS $$
BEGIN
  -- Delete security events older than 1 year
  DELETE FROM security_events 
  WHERE timestamp < NOW() - INTERVAL '1 year';
  
  -- Delete resolved security alerts older than 6 months
  DELETE FROM security_alerts 
  WHERE resolved = TRUE 
  AND resolved_at < NOW() - INTERVAL '6 months';
  
  -- Delete old rate limit entries (older than 1 week)
  DELETE FROM role_request_rate_limits 
  WHERE created_at < NOW() - INTERVAL '1 week';
  
  -- Delete expired cooldowns
  DELETE FROM role_request_cooldowns 
  WHERE expires_at < NOW();
  
  -- Delete inactive blocks
  UPDATE role_request_blocks 
  SET active = FALSE 
  WHERE blocked_until < NOW() AND active = TRUE;
  
  -- Delete old error logs (older than 3 months)
  DELETE FROM role_error_log 
  WHERE timestamp < NOW() - INTERVAL '3 months';
END;
$$ LANGUAGE plpgsql;

-- Function to calculate user risk score
CREATE OR REPLACE FUNCTION calculate_user_risk_score(user_uuid UUID, days_back INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  risk_score INTEGER := 0;
  event_count INTEGER;
  violation_count INTEGER;
  suspicious_count INTEGER;
BEGIN
  -- Count security events
  SELECT COUNT(*) INTO event_count
  FROM security_events 
  WHERE user_id = user_uuid 
  AND timestamp > NOW() - (days_back || ' days')::INTERVAL;
  
  -- Count violations
  SELECT COUNT(*) INTO violation_count
  FROM security_events 
  WHERE user_id = user_uuid 
  AND event_type IN ('permission_violation', 'rate_limit_exceeded', 'unauthorized_access_attempt')
  AND timestamp > NOW() - (days_back || ' days')::INTERVAL;
  
  -- Count suspicious activities
  SELECT COUNT(*) INTO suspicious_count
  FROM suspicious_activities 
  WHERE user_id = user_uuid 
  AND detected_at > NOW() - (days_back || ' days')::INTERVAL;
  
  -- Calculate risk score
  risk_score := (event_count * 2) + (violation_count * 10) + (suspicious_count * 20);
  
  -- Cap at 100
  IF risk_score > 100 THEN
    risk_score := 100;
  END IF;
  
  RETURN risk_score;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-expire verification requests
CREATE OR REPLACE FUNCTION expire_verification_requests()
RETURNS void AS $$
BEGIN
  UPDATE verification_requests 
  SET status = 'expired'
  WHERE status = 'pending' 
  AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup function (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-security-events', '0 2 * * *', 'SELECT cleanup_old_security_events();');
-- SELECT cron.schedule('expire-verification-requests', '*/15 * * * *', 'SELECT expire_verification_requests();');

-- Grant permissions
GRANT SELECT, INSERT ON security_events TO authenticated;
GRANT SELECT ON security_alerts TO authenticated;
GRANT SELECT, INSERT ON suspicious_activities TO authenticated;
GRANT SELECT, INSERT ON role_error_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON verification_requests TO authenticated;
GRANT SELECT, INSERT ON verification_evidence TO authenticated;
GRANT SELECT ON verification_reviewers TO authenticated;

-- Comments for documentation
COMMENT ON TABLE security_events IS 'Comprehensive log of all security-related events in the role management system';
COMMENT ON TABLE security_alerts IS 'High-priority security alerts that require attention';
COMMENT ON TABLE role_escalation_attempts IS 'Log of all role escalation attempts, both successful and blocked';
COMMENT ON TABLE suspicious_activities IS 'Detected suspicious activities that may indicate security threats';
COMMENT ON TABLE role_request_rate_limits IS 'Rate limiting tracking for role requests';
COMMENT ON TABLE role_request_cooldowns IS 'Cooldown periods for specific role requests';
COMMENT ON TABLE role_request_blocks IS 'User blocks preventing role requests';
COMMENT ON TABLE role_error_log IS 'Comprehensive error logging for role management operations';
COMMENT ON TABLE verification_requests IS 'Manual verification requests for role assignments';
COMMENT ON TABLE verification_evidence IS 'Evidence submitted for manual verification';
COMMENT ON TABLE verification_reviewers IS 'Users authorized to review verification requests';

COMMENT ON FUNCTION cleanup_old_security_events() IS 'Maintenance function to clean up old security data';
COMMENT ON FUNCTION calculate_user_risk_score(UUID, INTEGER) IS 'Calculate risk score for a user based on recent security events';
COMMENT ON FUNCTION expire_verification_requests() IS 'Automatically expire pending verification requests';