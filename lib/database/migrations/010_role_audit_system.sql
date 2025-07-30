-- Role Audit System Migration
-- This migration creates the comprehensive audit and logging system for role management

-- Create role audit log table
CREATE TABLE IF NOT EXISTS role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  action VARCHAR NOT NULL CHECK (action IN ('assigned', 'revoked', 'changed', 'expired', 'requested', 'approved', 'denied')),
  old_role VARCHAR CHECK (old_role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin')),
  new_role VARCHAR CHECK (new_role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin')),
  changed_by UUID REFERENCES users(id) NOT NULL,
  reason TEXT,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  institution_id UUID REFERENCES institutions(id),
  department_id UUID REFERENCES departments(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create suspicious activities table
CREATE TABLE IF NOT EXISTS role_suspicious_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR NOT NULL CHECK (type IN ('rapid_role_changes', 'privilege_escalation', 'unusual_pattern', 'bulk_assignment_anomaly')),
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  performed_by UUID REFERENCES users(id) NOT NULL,
  detected_at TIMESTAMP DEFAULT NOW() NOT NULL,
  related_audit_ids UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  flagged BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create audit reports table
CREATE TABLE IF NOT EXISTS role_audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR NOT NULL,
  generated_by UUID REFERENCES users(id) NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  institution_id UUID REFERENCES institutions(id),
  department_id UUID REFERENCES departments(id),
  summary JSONB DEFAULT '{}',
  entry_count INTEGER DEFAULT 0,
  suspicious_activity_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create comprehensive audit log table (extends existing audit logger)
CREATE TABLE IF NOT EXISTS comprehensive_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR NOT NULL CHECK (entity_type IN ('user', 'institution', 'department', 'class', 'enrollment', 'system')),
  entity_id UUID NOT NULL,
  action VARCHAR NOT NULL,
  performed_by UUID REFERENCES users(id) NOT NULL,
  performed_by_role VARCHAR NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR,
  changes JSONB,
  metadata JSONB DEFAULT '{}',
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category VARCHAR NOT NULL CHECK (category IN ('administrative', 'academic', 'security', 'compliance', 'system')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create security alerts table
CREATE TABLE IF NOT EXISTS security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR NOT NULL,
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  entity_type VARCHAR,
  entity_id UUID,
  performed_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_role_audit_log_user_id ON role_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_changed_by ON role_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_timestamp ON role_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_action ON role_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_institution ON role_audit_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_department ON role_audit_log(department_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_composite ON role_audit_log(institution_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_suspicious_activities_user_id ON role_suspicious_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_performed_by ON role_suspicious_activities(performed_by);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_detected_at ON role_suspicious_activities(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_severity ON role_suspicious_activities(severity);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_flagged ON role_suspicious_activities(flagged);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_type ON role_suspicious_activities(type);

CREATE INDEX IF NOT EXISTS idx_comprehensive_audit_entity ON comprehensive_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comprehensive_audit_timestamp ON comprehensive_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_comprehensive_audit_performed_by ON comprehensive_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_comprehensive_audit_severity ON comprehensive_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_comprehensive_audit_category ON comprehensive_audit_log(category);

CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_acknowledged ON security_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC);

-- Create foreign key constraints with proper names
ALTER TABLE role_audit_log 
  ADD CONSTRAINT fk_role_audit_log_user_id 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE role_audit_log 
  ADD CONSTRAINT fk_role_audit_log_changed_by 
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE role_suspicious_activities 
  ADD CONSTRAINT fk_suspicious_activities_user_id 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE role_suspicious_activities 
  ADD CONSTRAINT fk_suspicious_activities_performed_by 
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE role_suspicious_activities 
  ADD CONSTRAINT fk_suspicious_activities_reviewed_by 
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_role_audit_log_updated_at 
  BEFORE UPDATE ON role_audit_log 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suspicious_activities_updated_at 
  BEFORE UPDATE ON role_suspicious_activities 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audit_reports_updated_at 
  BEFORE UPDATE ON role_audit_reports 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_alerts_updated_at 
  BEFORE UPDATE ON security_alerts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for enriched audit log entries
CREATE OR REPLACE VIEW role_audit_log_enriched AS
SELECT 
  ral.*,
  u.full_name as user_name,
  u.email as user_email,
  cb.full_name as performed_by_name,
  cb.email as performed_by_email,
  i.name as institution_name,
  d.name as department_name
FROM role_audit_log ral
LEFT JOIN users u ON ral.user_id = u.id
LEFT JOIN users cb ON ral.changed_by = cb.id
LEFT JOIN institutions i ON ral.institution_id = i.id
LEFT JOIN departments d ON ral.department_id = d.id;

-- Create view for suspicious activity summary
CREATE OR REPLACE VIEW suspicious_activity_summary AS
SELECT 
  type,
  severity,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE flagged = true) as flagged_count,
  COUNT(*) FILTER (WHERE flagged = false) as unflagged_count,
  MAX(detected_at) as latest_detection,
  MIN(detected_at) as earliest_detection
FROM role_suspicious_activities
GROUP BY type, severity
ORDER BY severity DESC, total_count DESC;

-- Create function to automatically detect suspicious patterns
CREATE OR REPLACE FUNCTION detect_suspicious_role_activity()
RETURNS TRIGGER AS $$
DECLARE
  recent_changes INTEGER;
  privilege_escalation BOOLEAN := FALSE;
  role_hierarchy JSONB := '{"student": 1, "teacher": 2, "department_admin": 3, "institution_admin": 4, "system_admin": 5}';
  old_level INTEGER;
  new_level INTEGER;
BEGIN
  -- Check for rapid role changes (more than 3 in 1 hour)
  SELECT COUNT(*) INTO recent_changes
  FROM role_audit_log
  WHERE user_id = NEW.user_id
    AND changed_by = NEW.changed_by
    AND timestamp > NOW() - INTERVAL '1 hour';

  IF recent_changes >= 3 THEN
    INSERT INTO role_suspicious_activities (
      type, severity, description, user_id, performed_by, 
      detected_at, related_audit_ids, metadata
    ) VALUES (
      'rapid_role_changes',
      'high',
      format('%s role changes detected within 1 hour for user %s', recent_changes, NEW.user_id),
      NEW.user_id,
      NEW.changed_by,
      NOW(),
      ARRAY[NEW.id],
      jsonb_build_object('change_count', recent_changes, 'time_window', '1 hour')
    );
  END IF;

  -- Check for privilege escalation
  IF NEW.old_role IS NOT NULL AND NEW.new_role IS NOT NULL THEN
    old_level := (role_hierarchy->>NEW.old_role)::INTEGER;
    new_level := (role_hierarchy->>NEW.new_role)::INTEGER;
    
    IF new_level > old_level AND (new_level - old_level) > 1 THEN
      INSERT INTO role_suspicious_activities (
        type, severity, description, user_id, performed_by,
        detected_at, related_audit_ids, metadata
      ) VALUES (
        'privilege_escalation',
        CASE WHEN new_level = 5 THEN 'critical' ELSE 'high' END,
        format('Significant privilege escalation from %s to %s', NEW.old_role, NEW.new_role),
        NEW.user_id,
        NEW.changed_by,
        NOW(),
        ARRAY[NEW.id],
        jsonb_build_object('old_role', NEW.old_role, 'new_role', NEW.new_role, 'level_jump', new_level - old_level)
      );
    END IF;
  END IF;

  -- Check for unusual patterns (outside business hours)
  IF EXTRACT(DOW FROM NEW.timestamp) IN (0, 6) OR EXTRACT(HOUR FROM NEW.timestamp) NOT BETWEEN 9 AND 17 THEN
    IF NEW.changed_by != 'system' THEN
      INSERT INTO role_suspicious_activities (
        type, severity, description, user_id, performed_by,
        detected_at, related_audit_ids, metadata
      ) VALUES (
        'unusual_pattern',
        'medium',
        format('Role change performed outside business hours: %s', NEW.timestamp),
        NEW.user_id,
        NEW.changed_by,
        NOW(),
        ARRAY[NEW.id],
        jsonb_build_object(
          'timestamp', NEW.timestamp,
          'is_weekend', EXTRACT(DOW FROM NEW.timestamp) IN (0, 6),
          'is_outside_hours', EXTRACT(HOUR FROM NEW.timestamp) NOT BETWEEN 9 AND 17,
          'hour', EXTRACT(HOUR FROM NEW.timestamp),
          'day', EXTRACT(DOW FROM NEW.timestamp)
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic suspicious activity detection
CREATE TRIGGER detect_suspicious_activity_trigger
  AFTER INSERT ON role_audit_log
  FOR EACH ROW EXECUTE FUNCTION detect_suspicious_role_activity();

-- Create function to clean up old audit entries (for data retention)
CREATE OR REPLACE FUNCTION cleanup_old_audit_entries(retention_days INTEGER DEFAULT 2555) -- ~7 years default
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete old comprehensive audit log entries
  DELETE FROM comprehensive_audit_log 
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup operation
  INSERT INTO comprehensive_audit_log (
    entity_type, entity_id, action, performed_by, performed_by_role,
    metadata, severity, category
  ) VALUES (
    'system', gen_random_uuid()::text, 'audit_cleanup', 'system', 'system',
    jsonb_build_object('deleted_entries', deleted_count, 'retention_days', retention_days),
    'low', 'system'
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON role_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON role_suspicious_activities TO authenticated;
GRANT SELECT, INSERT ON role_audit_reports TO authenticated;
GRANT SELECT, INSERT ON comprehensive_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON security_alerts TO authenticated;
GRANT SELECT ON role_audit_log_enriched TO authenticated;
GRANT SELECT ON suspicious_activity_summary TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE role_audit_log IS 'Comprehensive audit log for all role management operations';
COMMENT ON TABLE role_suspicious_activities IS 'Automatically detected suspicious role management activities';
COMMENT ON TABLE role_audit_reports IS 'Generated audit reports with summaries and statistics';
COMMENT ON TABLE comprehensive_audit_log IS 'General audit log for all system operations';
COMMENT ON TABLE security_alerts IS 'Security alerts generated from critical audit events';

COMMENT ON COLUMN role_audit_log.action IS 'Type of role action: assigned, revoked, changed, expired, requested, approved, denied';
COMMENT ON COLUMN role_audit_log.metadata IS 'Additional context and data related to the role action';
COMMENT ON COLUMN role_suspicious_activities.type IS 'Type of suspicious activity detected';
COMMENT ON COLUMN role_suspicious_activities.severity IS 'Severity level of the suspicious activity';
COMMENT ON COLUMN role_suspicious_activities.related_audit_ids IS 'Array of related audit log entry IDs';

-- Create initial data for testing (optional)
-- This would typically be done in a separate seed file
-- INSERT INTO comprehensive_audit_log (entity_type, entity_id, action, performed_by, performed_by_role, metadata, severity, category)
-- VALUES ('system', gen_random_uuid()::text, 'audit_system_initialized', 'system', 'system', '{"version": "1.0"}', 'low', 'system');