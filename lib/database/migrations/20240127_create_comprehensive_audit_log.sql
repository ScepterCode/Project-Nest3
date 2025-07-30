-- Comprehensive Audit Log Schema
-- This migration creates a comprehensive audit logging system for all administrative actions and data changes

-- Comprehensive audit log table for all system actions
CREATE TABLE IF NOT EXISTS comprehensive_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR NOT NULL, -- 'user', 'institution', 'department', 'class', 'enrollment', 'system'
  entity_id VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  performed_by UUID REFERENCES users(id) NOT NULL,
  performed_by_role VARCHAR NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR,
  changes JSONB, -- { before: {}, after: {}, fields: [] }
  metadata JSONB DEFAULT '{}',
  severity VARCHAR DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  category VARCHAR DEFAULT 'administrative', -- 'administrative', 'academic', 'security', 'compliance', 'system'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for comprehensive audit log performance
CREATE INDEX idx_comprehensive_audit_entity ON comprehensive_audit_log(entity_type, entity_id);
CREATE INDEX idx_comprehensive_audit_performed_by ON comprehensive_audit_log(performed_by);
CREATE INDEX idx_comprehensive_audit_timestamp ON comprehensive_audit_log(timestamp);
CREATE INDEX idx_comprehensive_audit_action ON comprehensive_audit_log(action);
CREATE INDEX idx_comprehensive_audit_severity ON comprehensive_audit_log(severity);
CREATE INDEX idx_comprehensive_audit_category ON comprehensive_audit_log(category);
CREATE INDEX idx_comprehensive_audit_session ON comprehensive_audit_log(session_id);

-- Security alerts table for critical events
CREATE TABLE IF NOT EXISTS security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR NOT NULL,
  severity VARCHAR NOT NULL,
  description TEXT NOT NULL,
  entity_type VARCHAR,
  entity_id VARCHAR,
  performed_by UUID REFERENCES users(id),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for security alerts
CREATE INDEX idx_security_alerts_type ON security_alerts(alert_type);
CREATE INDEX idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX idx_security_alerts_resolved ON security_alerts(resolved);
CREATE INDEX idx_security_alerts_created_at ON security_alerts(created_at);

-- Compliance reports table
CREATE TABLE IF NOT EXISTS compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  report_type VARCHAR NOT NULL, -- 'gdpr', 'ferpa', 'audit', 'retention'
  title VARCHAR NOT NULL,
  description TEXT,
  generated_by UUID REFERENCES users(id) NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  overall_compliance NUMERIC(5,2), -- 0-100
  risk_level VARCHAR, -- 'low', 'medium', 'high', 'critical'
  summary JSONB DEFAULT '{}',
  findings JSONB DEFAULT '[]',
  recommendations TEXT[],
  status VARCHAR DEFAULT 'draft', -- 'draft', 'final', 'submitted'
  file_path VARCHAR, -- Path to generated report file
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for compliance reports
CREATE INDEX idx_compliance_reports_institution ON compliance_reports(institution_id);
CREATE INDEX idx_compliance_reports_type ON compliance_reports(report_type);
CREATE INDEX idx_compliance_reports_generated_at ON compliance_reports(generated_at);
CREATE INDEX idx_compliance_reports_status ON compliance_reports(status);

-- GDPR data export requests table
CREATE TABLE IF NOT EXISTS gdpr_data_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  requested_by UUID REFERENCES users(id) NOT NULL,
  export_id VARCHAR UNIQUE NOT NULL,
  status VARCHAR DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  format VARCHAR DEFAULT 'json', -- 'json', 'csv', 'pdf'
  requested_at TIMESTAMP DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP,
  download_url VARCHAR,
  expires_at TIMESTAMP,
  file_size BIGINT,
  encryption_key VARCHAR,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for GDPR data exports
CREATE INDEX idx_gdpr_exports_student ON gdpr_data_exports(student_id);
CREATE INDEX idx_gdpr_exports_status ON gdpr_data_exports(status);
CREATE INDEX idx_gdpr_exports_requested_at ON gdpr_data_exports(requested_at);
CREATE INDEX idx_gdpr_exports_expires_at ON gdpr_data_exports(expires_at);

-- FERPA educational records classification table
CREATE TABLE IF NOT EXISTS ferpa_educational_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  record_type VARCHAR NOT NULL, -- 'educational', 'directory', 'disciplinary', 'health', 'financial'
  classification VARCHAR NOT NULL, -- 'public', 'directory', 'confidential', 'restricted'
  data_elements TEXT[] NOT NULL,
  table_name VARCHAR NOT NULL,
  record_id VARCHAR NOT NULL,
  retention_period INTEGER NOT NULL, -- in years
  disposal_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP,
  access_count INTEGER DEFAULT 0
);

-- Indexes for FERPA educational records
CREATE INDEX idx_ferpa_records_student ON ferpa_educational_records(student_id);
CREATE INDEX idx_ferpa_records_type ON ferpa_educational_records(record_type);
CREATE INDEX idx_ferpa_records_classification ON ferpa_educational_records(classification);
CREATE INDEX idx_ferpa_records_disposal_date ON ferpa_educational_records(disposal_date);

-- Data processing activities register (GDPR Article 30)
CREATE TABLE IF NOT EXISTS data_processing_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  activity_name VARCHAR NOT NULL,
  description TEXT NOT NULL,
  controller VARCHAR NOT NULL,
  processor VARCHAR,
  data_types TEXT[] NOT NULL,
  purposes TEXT[] NOT NULL,
  legal_basis TEXT[] NOT NULL,
  data_subjects TEXT[] NOT NULL,
  retention_period INTEGER, -- in months
  third_party_transfers BOOLEAN DEFAULT FALSE,
  safeguards TEXT[],
  risk_level VARCHAR DEFAULT 'medium', -- 'low', 'medium', 'high'
  last_reviewed TIMESTAMP,
  next_review_date TIMESTAMP,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for data processing activities
CREATE INDEX idx_data_processing_institution ON data_processing_activities(institution_id);
CREATE INDEX idx_data_processing_active ON data_processing_activities(active);
CREATE INDEX idx_data_processing_risk_level ON data_processing_activities(risk_level);
CREATE INDEX idx_data_processing_next_review ON data_processing_activities(next_review_date);

-- Audit trail integrity verification table
CREATE TABLE IF NOT EXISTS audit_integrity_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR NOT NULL,
  entity_id VARCHAR NOT NULL,
  check_type VARCHAR NOT NULL, -- 'hash_verification', 'sequence_check', 'completeness_check'
  performed_at TIMESTAMP DEFAULT NOW() NOT NULL,
  performed_by UUID REFERENCES users(id),
  result VARCHAR NOT NULL, -- 'passed', 'failed', 'warning'
  issues_found INTEGER DEFAULT 0,
  details JSONB DEFAULT '{}',
  recommendations TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for audit integrity checks
CREATE INDEX idx_audit_integrity_entity ON audit_integrity_checks(entity_type, entity_id);
CREATE INDEX idx_audit_integrity_performed_at ON audit_integrity_checks(performed_at);
CREATE INDEX idx_audit_integrity_result ON audit_integrity_checks(result);

-- Function to automatically log administrative actions
CREATE OR REPLACE FUNCTION log_administrative_action()
RETURNS TRIGGER AS $
DECLARE
  action_type VARCHAR;
  entity_type VARCHAR;
  entity_id VARCHAR;
  performed_by UUID;
  changes JSONB;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
    changes := jsonb_build_object('after', to_jsonb(NEW), 'fields', array(SELECT jsonb_object_keys(to_jsonb(NEW))));
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'updated';
    changes := jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW),
      'fields', array(SELECT jsonb_object_keys(to_jsonb(NEW)))
    );
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'deleted';
    changes := jsonb_build_object('before', to_jsonb(OLD), 'fields', array(SELECT jsonb_object_keys(to_jsonb(OLD))));
  END IF;

  -- Determine entity type and ID based on table
  entity_type := TG_TABLE_NAME;
  
  IF TG_OP = 'DELETE' THEN
    entity_id := OLD.id::TEXT;
    performed_by := COALESCE(OLD.updated_by, OLD.created_by);
  ELSE
    entity_id := NEW.id::TEXT;
    performed_by := COALESCE(NEW.updated_by, NEW.created_by);
  END IF;

  -- Insert audit log entry
  INSERT INTO comprehensive_audit_log (
    entity_type,
    entity_id,
    action,
    performed_by,
    performed_by_role,
    changes,
    metadata,
    severity,
    category
  ) VALUES (
    entity_type,
    entity_id,
    action_type,
    COALESCE(performed_by, auth.uid()),
    'unknown', -- Would need to be determined from user context
    changes,
    jsonb_build_object('table_name', TG_TABLE_NAME, 'operation', TG_OP),
    'medium',
    'administrative'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$ LANGUAGE plpgsql;

-- Function to check audit trail completeness
CREATE OR REPLACE FUNCTION check_audit_trail_completeness(
  p_entity_type VARCHAR,
  p_entity_id VARCHAR,
  p_start_date TIMESTAMP DEFAULT NULL,
  p_end_date TIMESTAMP DEFAULT NULL
) RETURNS TABLE(
  total_entries INTEGER,
  missing_actions TEXT[],
  suspicious_gaps INTEGER,
  integrity_score NUMERIC
) AS $
DECLARE
  expected_actions TEXT[] := ARRAY['created', 'updated', 'deleted', 'status_changed'];
  found_actions TEXT[];
  missing_actions_result TEXT[];
  gap_count INTEGER := 0;
  total_count INTEGER;
  score NUMERIC;
BEGIN
  -- Get all audit entries for the entity
  SELECT COUNT(*), array_agg(DISTINCT action)
  INTO total_count, found_actions
  FROM comprehensive_audit_log
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND (p_start_date IS NULL OR timestamp >= p_start_date)
    AND (p_end_date IS NULL OR timestamp <= p_end_date);

  -- Find missing critical actions
  SELECT array_agg(action)
  INTO missing_actions_result
  FROM unnest(expected_actions) AS action
  WHERE action != ALL(COALESCE(found_actions, ARRAY[]::TEXT[]));

  -- Check for suspicious time gaps (simplified)
  WITH time_gaps AS (
    SELECT 
      timestamp,
      LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp
    FROM comprehensive_audit_log
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND (p_start_date IS NULL OR timestamp >= p_start_date)
      AND (p_end_date IS NULL OR timestamp <= p_end_date)
  )
  SELECT COUNT(*)
  INTO gap_count
  FROM time_gaps
  WHERE EXTRACT(EPOCH FROM (timestamp - prev_timestamp)) > 86400; -- 24 hours

  -- Calculate integrity score (0-100)
  score := GREATEST(0, 100 - (array_length(missing_actions_result, 1) * 20) - (gap_count * 10));

  RETURN QUERY SELECT 
    total_count,
    COALESCE(missing_actions_result, ARRAY[]::TEXT[]),
    gap_count,
    score;
END;
$ LANGUAGE plpgsql;

-- Function to generate compliance metrics
CREATE OR REPLACE FUNCTION generate_compliance_metrics(
  p_institution_id UUID,
  p_start_date TIMESTAMP,
  p_end_date TIMESTAMP
) RETURNS TABLE(
  metric_name VARCHAR,
  metric_value NUMERIC,
  metric_unit VARCHAR,
  risk_level VARCHAR
) AS $
BEGIN
  -- GDPR metrics
  RETURN QUERY
  SELECT 
    'gdpr_data_requests'::VARCHAR,
    COUNT(*)::NUMERIC,
    'requests'::VARCHAR,
    CASE WHEN COUNT(*) > 50 THEN 'high' ELSE 'low' END::VARCHAR
  FROM gdpr_data_exports
  WHERE requested_at BETWEEN p_start_date AND p_end_date;

  -- FERPA metrics
  RETURN QUERY
  SELECT 
    'ferpa_unauthorized_access'::VARCHAR,
    COUNT(*)::NUMERIC,
    'incidents'::VARCHAR,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'low' END::VARCHAR
  FROM ferpa_access_log
  WHERE timestamp BETWEEN p_start_date AND p_end_date
    AND NOT legitimate_interest
    AND NOT consent_obtained;

  -- Audit completeness metrics
  RETURN QUERY
  SELECT 
    'audit_completeness'::VARCHAR,
    AVG(integrity_score)::NUMERIC,
    'percentage'::VARCHAR,
    CASE 
      WHEN AVG(integrity_score) >= 95 THEN 'low'
      WHEN AVG(integrity_score) >= 80 THEN 'medium'
      ELSE 'high'
    END::VARCHAR
  FROM (
    SELECT (check_audit_trail_completeness(entity_type, entity_id)).integrity_score
    FROM (
      SELECT DISTINCT entity_type, entity_id
      FROM comprehensive_audit_log
      WHERE timestamp BETWEEN p_start_date AND p_end_date
      LIMIT 100 -- Sample for performance
    ) entities
  ) scores;
END;
$ LANGUAGE plpgsql;

-- Enable RLS on new tables
ALTER TABLE comprehensive_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferpa_educational_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_processing_activities ENABLE ROW LEVEL SECURITY;

-- RLS policies for comprehensive audit log
CREATE POLICY "Users can view audit logs for their institution" ON comprehensive_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (
        role IN ('system_admin') OR
        (role IN ('institution_admin', 'department_admin') AND institution_id IN (
          SELECT institution_id FROM users WHERE id = comprehensive_audit_log.performed_by
        ))
      )
    )
  );

-- RLS policies for security alerts
CREATE POLICY "Admins can view security alerts" ON security_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('system_admin', 'institution_admin', 'security_admin')
    )
  );

-- RLS policies for compliance reports
CREATE POLICY "Institution admins can view their compliance reports" ON compliance_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (
        role = 'system_admin' OR
        (role IN ('institution_admin', 'compliance_officer') AND institution_id = compliance_reports.institution_id)
      )
    )
  );

-- Comments for documentation
COMMENT ON TABLE comprehensive_audit_log IS 'Comprehensive audit logging for all administrative actions and data changes';
COMMENT ON TABLE security_alerts IS 'Security alerts generated from critical audit events';
COMMENT ON TABLE compliance_reports IS 'Generated compliance reports for GDPR, FERPA, and other regulations';
COMMENT ON TABLE gdpr_data_exports IS 'GDPR data export requests and their status';
COMMENT ON TABLE ferpa_educational_records IS 'Classification and tracking of FERPA educational records';
COMMENT ON TABLE data_processing_activities IS 'Register of data processing activities as required by GDPR Article 30';
COMMENT ON FUNCTION check_audit_trail_completeness IS 'Verifies completeness and integrity of audit trails';
COMMENT ON FUNCTION generate_compliance_metrics IS 'Generates compliance metrics for reporting and monitoring';