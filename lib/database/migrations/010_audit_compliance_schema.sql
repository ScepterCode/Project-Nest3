-- Enrollment Audit and Compliance Schema
-- This migration adds tables for comprehensive audit logging, FERPA compliance, and data retention

-- Enhanced enrollment audit log with additional compliance fields
DROP TABLE IF EXISTS enrollment_audit_log;
CREATE TABLE enrollment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  action VARCHAR NOT NULL,
  performed_by UUID REFERENCES users(id) NOT NULL,
  reason TEXT,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for audit log performance
CREATE INDEX idx_enrollment_audit_student ON enrollment_audit_log(student_id);
CREATE INDEX idx_enrollment_audit_class ON enrollment_audit_log(class_id);
CREATE INDEX idx_enrollment_audit_timestamp ON enrollment_audit_log(timestamp);
CREATE INDEX idx_enrollment_audit_action ON enrollment_audit_log(action);
CREATE INDEX idx_enrollment_audit_performed_by ON enrollment_audit_log(performed_by);

-- Enrollment history for immutable record keeping
CREATE TABLE enrollment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  enrollment_id UUID,
  action VARCHAR NOT NULL,
  status_before VARCHAR,
  status_after VARCHAR,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  academic_term VARCHAR NOT NULL,
  grade_at_time VARCHAR,
  credits NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  hash VARCHAR NOT NULL, -- For integrity verification
  previous_hash VARCHAR, -- Chain of records
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for enrollment history
CREATE INDEX idx_enrollment_history_student ON enrollment_history(student_id);
CREATE INDEX idx_enrollment_history_class ON enrollment_history(class_id);
CREATE INDEX idx_enrollment_history_term ON enrollment_history(academic_term);
CREATE INDEX idx_enrollment_history_timestamp ON enrollment_history(timestamp);

-- Enrollment snapshots for periodic state capture
CREATE TABLE enrollment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  status VARCHAR NOT NULL,
  enrolled_at TIMESTAMP NOT NULL,
  grade VARCHAR,
  credits NUMERIC DEFAULT 0,
  academic_term VARCHAR NOT NULL,
  snapshot_at TIMESTAMP DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for snapshots
CREATE INDEX idx_enrollment_snapshots_student ON enrollment_snapshots(student_id);
CREATE INDEX idx_enrollment_snapshots_term ON enrollment_snapshots(academic_term);
CREATE INDEX idx_enrollment_snapshots_snapshot_at ON enrollment_snapshots(snapshot_at);

-- FERPA access logging
CREATE TABLE ferpa_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  accessed_by UUID REFERENCES users(id) NOT NULL,
  access_type VARCHAR NOT NULL,
  data_accessed TEXT[] NOT NULL,
  purpose TEXT NOT NULL,
  legitimate_interest BOOLEAN DEFAULT FALSE,
  consent_obtained BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for FERPA access log
CREATE INDEX idx_ferpa_access_student ON ferpa_access_log(student_id);
CREATE INDEX idx_ferpa_access_accessed_by ON ferpa_access_log(accessed_by);
CREATE INDEX idx_ferpa_access_timestamp ON ferpa_access_log(timestamp);
CREATE INDEX idx_ferpa_access_type ON ferpa_access_log(access_type);

-- Student consent management
CREATE TABLE student_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  consent_type VARCHAR NOT NULL,
  granted_to UUID REFERENCES users(id),
  granted_to_type VARCHAR DEFAULT 'individual', -- 'individual', 'role', 'institution'
  data_types TEXT[] NOT NULL,
  purpose TEXT NOT NULL,
  granted_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  revoked_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for student consents
CREATE INDEX idx_student_consents_student ON student_consents(student_id);
CREATE INDEX idx_student_consents_granted_to ON student_consents(granted_to);
CREATE INDEX idx_student_consents_expires_at ON student_consents(expires_at);
CREATE INDEX idx_student_consents_revoked_at ON student_consents(revoked_at);

-- FERPA consent requests
CREATE TABLE ferpa_consent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  requested_by UUID REFERENCES users(id) NOT NULL,
  data_types TEXT[] NOT NULL,
  purpose TEXT NOT NULL,
  status VARCHAR DEFAULT 'pending', -- 'pending', 'granted', 'denied'
  requested_at TIMESTAMP DEFAULT NOW() NOT NULL,
  responded_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for consent requests
CREATE INDEX idx_ferpa_consent_requests_student ON ferpa_consent_requests(student_id);
CREATE INDEX idx_ferpa_consent_requests_requested_by ON ferpa_consent_requests(requested_by);
CREATE INDEX idx_ferpa_consent_requests_status ON ferpa_consent_requests(status);

-- Student privacy settings
CREATE TABLE student_privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL UNIQUE,
  directory_opt_out BOOLEAN DEFAULT FALSE,
  restrict_grade_access BOOLEAN DEFAULT FALSE,
  restrict_enrollment_info BOOLEAN DEFAULT FALSE,
  emergency_contact_only BOOLEAN DEFAULT FALSE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Privacy controls for granular data access
CREATE TABLE privacy_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  data_type VARCHAR NOT NULL,
  access_level VARCHAR DEFAULT 'restricted', -- 'public', 'restricted', 'private'
  allowed_roles TEXT[] DEFAULT '{}',
  expiry_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, data_type)
);

-- Indexes for privacy controls
CREATE INDEX idx_privacy_controls_student ON privacy_controls(student_id);
CREATE INDEX idx_privacy_controls_data_type ON privacy_controls(data_type);
CREATE INDEX idx_privacy_controls_access_level ON privacy_controls(access_level);

-- Data retention policies
CREATE TABLE retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type VARCHAR NOT NULL,
  table_name VARCHAR NOT NULL,
  retention_period_days INTEGER NOT NULL,
  action VARCHAR NOT NULL, -- 'archive', 'delete', 'anonymize'
  conditions JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  last_executed TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for retention policies
CREATE INDEX idx_retention_policies_data_type ON retention_policies(data_type);
CREATE INDEX idx_retention_policies_enabled ON retention_policies(enabled);
CREATE INDEX idx_retention_policies_last_executed ON retention_policies(last_executed);

-- Retention execution log
CREATE TABLE retention_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES retention_policies(id) NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW() NOT NULL,
  records_processed INTEGER DEFAULT 0,
  action VARCHAR NOT NULL,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for retention execution log
CREATE INDEX idx_retention_execution_policy ON retention_execution_log(policy_id);
CREATE INDEX idx_retention_execution_executed_at ON retention_execution_log(executed_at);

-- Data deletion requests (Right to be Forgotten)
CREATE TABLE data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  requested_by UUID REFERENCES users(id) NOT NULL,
  data_types TEXT[] NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR DEFAULT 'pending', -- 'pending', 'approved', 'denied', 'completed'
  requested_at TIMESTAMP DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMP,
  processed_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for deletion requests
CREATE INDEX idx_data_deletion_requests_student ON data_deletion_requests(student_id);
CREATE INDEX idx_data_deletion_requests_status ON data_deletion_requests(status);
CREATE INDEX idx_data_deletion_requests_requested_at ON data_deletion_requests(requested_at);

-- Student advisor relationships for legitimate educational interest
CREATE TABLE student_advisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  advisor_id UUID REFERENCES users(id) NOT NULL,
  advisor_type VARCHAR DEFAULT 'academic', -- 'academic', 'financial', 'career'
  assigned_at TIMESTAMP DEFAULT NOW() NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, advisor_id, advisor_type)
);

-- Indexes for student advisors
CREATE INDEX idx_student_advisors_student ON student_advisors(student_id);
CREATE INDEX idx_student_advisors_advisor ON student_advisors(advisor_id);
CREATE INDEX idx_student_advisors_active ON student_advisors(active);

-- Compliance violation log
CREATE TABLE compliance_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_type VARCHAR NOT NULL,
  severity VARCHAR DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  description TEXT NOT NULL,
  student_id UUID REFERENCES users(id),
  user_id UUID REFERENCES users(id),
  data_involved TEXT[],
  detected_at TIMESTAMP DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for compliance violations
CREATE INDEX idx_compliance_violations_type ON compliance_violations(violation_type);
CREATE INDEX idx_compliance_violations_severity ON compliance_violations(severity);
CREATE INDEX idx_compliance_violations_detected_at ON compliance_violations(detected_at);
CREATE INDEX idx_compliance_violations_student ON compliance_violations(student_id);

-- Functions for audit trail integrity
CREATE OR REPLACE FUNCTION generate_audit_hash(
  p_student_id UUID,
  p_class_id UUID,
  p_action VARCHAR,
  p_timestamp TIMESTAMP,
  p_previous_hash VARCHAR DEFAULT NULL
) RETURNS VARCHAR AS $$
DECLARE
  hash_input TEXT;
  result_hash VARCHAR;
BEGIN
  hash_input := CONCAT(
    p_student_id::TEXT,
    p_class_id::TEXT,
    p_action,
    p_timestamp::TEXT,
    COALESCE(p_previous_hash, '')
  );
  
  -- Simple hash function - in production, use a proper cryptographic hash
  result_hash := encode(digest(hash_input, 'sha256'), 'hex');
  
  RETURN result_hash;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically generate hash for enrollment history
CREATE OR REPLACE FUNCTION set_enrollment_history_hash()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash VARCHAR;
BEGIN
  -- Get the previous hash for this student/class combination
  SELECT hash INTO prev_hash
  FROM enrollment_history
  WHERE student_id = NEW.student_id 
    AND class_id = NEW.class_id
  ORDER BY timestamp DESC
  LIMIT 1;
  
  -- Generate hash for the new record
  NEW.hash := generate_audit_hash(
    NEW.student_id,
    NEW.class_id,
    NEW.action,
    NEW.timestamp,
    prev_hash
  );
  
  NEW.previous_hash := prev_hash;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for enrollment history hash generation
CREATE TRIGGER trigger_enrollment_history_hash
  BEFORE INSERT ON enrollment_history
  FOR EACH ROW
  EXECUTE FUNCTION set_enrollment_history_hash();

-- Function to verify audit trail integrity
CREATE OR REPLACE FUNCTION verify_audit_integrity(
  p_student_id UUID,
  p_class_id UUID
) RETURNS TABLE(
  is_valid BOOLEAN,
  broken_chain_count INTEGER,
  invalid_hash_count INTEGER
) AS $$
DECLARE
  record_count INTEGER;
  broken_chains INTEGER := 0;
  invalid_hashes INTEGER := 0;
  current_record RECORD;
  expected_hash VARCHAR;
BEGIN
  -- Get all records for this student/class in chronological order
  FOR current_record IN
    SELECT *
    FROM enrollment_history
    WHERE student_id = p_student_id AND class_id = p_class_id
    ORDER BY timestamp ASC
  LOOP
    -- Verify hash integrity
    expected_hash := generate_audit_hash(
      current_record.student_id,
      current_record.class_id,
      current_record.action,
      current_record.timestamp,
      current_record.previous_hash
    );
    
    IF current_record.hash != expected_hash THEN
      invalid_hashes := invalid_hashes + 1;
    END IF;
    
    -- Verify chain integrity (check if previous_hash matches actual previous record)
    IF current_record.previous_hash IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM enrollment_history
        WHERE student_id = p_student_id 
          AND class_id = p_class_id
          AND hash = current_record.previous_hash
          AND timestamp < current_record.timestamp
      ) THEN
        broken_chains := broken_chains + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    (broken_chains = 0 AND invalid_hashes = 0) as is_valid,
    broken_chains as broken_chain_count,
    invalid_hashes as invalid_hash_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default retention policies
INSERT INTO retention_policies (data_type, table_name, retention_period_days, action) VALUES
('enrollment_records', 'enrollments', 2555, 'archive'), -- 7 years
('audit_logs', 'enrollment_audit_log', 2555, 'archive'), -- 7 years
('grade_records', 'grades', 3650, 'archive'), -- 10 years
('access_logs', 'ferpa_access_log', 1825, 'delete'), -- 5 years
('consent_records', 'student_consents', 2555, 'archive'), -- 7 years
('deletion_requests', 'data_deletion_requests', 2555, 'archive'); -- 7 years

-- Create RLS policies for audit tables
ALTER TABLE enrollment_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferpa_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_controls ENABLE ROW LEVEL SECURITY;

-- RLS policy for enrollment audit log - students can see their own records
CREATE POLICY "Students can view their own audit records" ON enrollment_audit_log
  FOR SELECT USING (
    auth.uid() = student_id OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'department_admin', 'registrar')
    )
  );

-- RLS policy for enrollment history - students can see their own records
CREATE POLICY "Students can view their own enrollment history" ON enrollment_history
  FOR SELECT USING (
    auth.uid() = student_id OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'department_admin', 'registrar')
    )
  );

-- RLS policy for FERPA access log - students can see who accessed their data
CREATE POLICY "Students can view their own access log" ON ferpa_access_log
  FOR SELECT USING (
    auth.uid() = student_id OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'registrar')
    )
  );

-- RLS policy for student consents - students can manage their own consents
CREATE POLICY "Students can manage their own consents" ON student_consents
  FOR ALL USING (
    auth.uid() = student_id OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'registrar')
    )
  );

-- RLS policy for privacy controls - students can manage their own privacy
CREATE POLICY "Students can manage their own privacy controls" ON privacy_controls
  FOR ALL USING (
    auth.uid() = student_id OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('institution_admin', 'registrar')
    )
  );

-- Comments for documentation
COMMENT ON TABLE enrollment_audit_log IS 'Comprehensive audit log for all enrollment-related actions with FERPA compliance tracking';
COMMENT ON TABLE enrollment_history IS 'Immutable history of enrollment changes with cryptographic integrity verification';
COMMENT ON TABLE enrollment_snapshots IS 'Periodic snapshots of enrollment state for historical analysis';
COMMENT ON TABLE ferpa_access_log IS 'FERPA-compliant logging of all access to student educational records';
COMMENT ON TABLE student_consents IS 'Student consent management for data access and sharing';
COMMENT ON TABLE privacy_controls IS 'Granular privacy controls for student data access';
COMMENT ON TABLE retention_policies IS 'Data retention policies for compliance with educational record requirements';
COMMENT ON TABLE data_deletion_requests IS 'Right to be forgotten requests and processing';
COMMENT ON FUNCTION verify_audit_integrity IS 'Verifies the cryptographic integrity of audit trail chains';