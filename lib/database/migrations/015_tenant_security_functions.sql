-- Tenant security functions for RLS and context management
-- Migration: 015_tenant_security_functions.sql

-- Function to set tenant context in database session
CREATE OR REPLACE FUNCTION set_tenant_context(claims JSONB)
RETURNS VOID AS $$
BEGIN
  -- Set session variables for RLS policies
  PERFORM set_config('app.current_user_id', claims->>'user_id', true);
  PERFORM set_config('app.current_institution_id', claims->>'institution_id', true);
  PERFORM set_config('app.current_department_id', claims->>'department_id', true);
  PERFORM set_config('app.current_role', claims->>'role', true);
  PERFORM set_config('app.current_permissions', claims->>'permissions', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current tenant context
CREATE OR REPLACE FUNCTION get_tenant_context()
RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_build_object(
    'user_id', current_setting('app.current_user_id', true),
    'institution_id', current_setting('app.current_institution_id', true),
    'department_id', current_setting('app.current_department_id', true),
    'role', current_setting('app.current_role', true),
    'permissions', current_setting('app.current_permissions', true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced RLS policies using session variables
DROP POLICY IF EXISTS institutions_isolation ON institutions;
CREATE POLICY institutions_isolation ON institutions
  FOR ALL
  USING (
    -- System admin can see all
    current_setting('app.current_role', true) = 'system_admin' OR
    -- Institution users can see their own institution
    id::text = current_setting('app.current_institution_id', true)
  );

DROP POLICY IF EXISTS departments_isolation ON departments;
CREATE POLICY departments_isolation ON departments
  FOR ALL
  USING (
    -- System admin can see all
    current_setting('app.current_role', true) = 'system_admin' OR
    -- Institution users can see departments in their institution
    institution_id::text = current_setting('app.current_institution_id', true)
  );

DROP POLICY IF EXISTS integrations_isolation ON institution_integrations;
CREATE POLICY integrations_isolation ON institution_integrations
  FOR ALL
  USING (
    -- System admin can see all
    current_setting('app.current_role', true) = 'system_admin' OR
    -- Institution users can see their integrations
    institution_id::text = current_setting('app.current_institution_id', true)
  );

DROP POLICY IF EXISTS institution_analytics_isolation ON institution_analytics;
CREATE POLICY institution_analytics_isolation ON institution_analytics
  FOR ALL
  USING (
    -- System admin can see all
    current_setting('app.current_role', true) = 'system_admin' OR
    -- Institution users can see their analytics
    institution_id::text = current_setting('app.current_institution_id', true)
  );

DROP POLICY IF EXISTS department_analytics_isolation ON department_analytics;
CREATE POLICY department_analytics_isolation ON department_analytics
  FOR ALL
  USING (
    -- System admin can see all
    current_setting('app.current_role', true) = 'system_admin' OR
    -- Department users can see their analytics
    department_id IN (
      SELECT d.id FROM departments d 
      WHERE d.institution_id::text = current_setting('app.current_institution_id', true)
    )
  );

DROP POLICY IF EXISTS invitations_isolation ON institution_invitations;
CREATE POLICY invitations_isolation ON institution_invitations
  FOR ALL
  USING (
    -- System admin can see all
    current_setting('app.current_role', true) = 'system_admin' OR
    -- Institution users can see their invitations
    institution_id::text = current_setting('app.current_institution_id', true)
  );

DROP POLICY IF EXISTS content_policies_isolation ON content_sharing_policies;
CREATE POLICY content_policies_isolation ON content_sharing_policies
  FOR ALL
  USING (
    -- System admin can see all
    current_setting('app.current_role', true) = 'system_admin' OR
    -- Institution users can see their policies
    institution_id::text = current_setting('app.current_institution_id', true)
  );

-- Security audit table for monitoring access violations
CREATE TABLE IF NOT EXISTS tenant_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  institution_id UUID,
  department_id UUID,
  role VARCHAR(50),
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('access_denied', 'policy_violation', 'suspicious_activity', 'data_breach_attempt')),
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_institution_id UUID,
  target_department_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for efficient querying
  CONSTRAINT tenant_security_events_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT tenant_security_events_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
  CONSTRAINT tenant_security_events_department_fk FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Indexes for security events
CREATE INDEX idx_security_events_user_id ON tenant_security_events(user_id);
CREATE INDEX idx_security_events_institution_id ON tenant_security_events(institution_id);
CREATE INDEX idx_security_events_event_type ON tenant_security_events(event_type);
CREATE INDEX idx_security_events_timestamp ON tenant_security_events(timestamp);
CREATE INDEX idx_security_events_composite ON tenant_security_events(institution_id, event_type, timestamp);

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
  p_user_id UUID,
  p_institution_id UUID,
  p_department_id UUID,
  p_role VARCHAR(50),
  p_event_type VARCHAR(50),
  p_resource VARCHAR(100),
  p_action VARCHAR(50),
  p_target_institution_id UUID DEFAULT NULL,
  p_target_department_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO tenant_security_events (
    user_id, institution_id, department_id, role, event_type,
    resource, action, target_institution_id, target_department_id,
    metadata, ip_address, user_agent
  ) VALUES (
    p_user_id, p_institution_id, p_department_id, p_role, p_event_type,
    p_resource, p_action, p_target_institution_id, p_target_department_id,
    p_metadata, p_ip_address, p_user_agent
  ) RETURNING id INTO event_id;
  
  RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to detect suspicious access patterns
CREATE OR REPLACE FUNCTION detect_suspicious_activity(
  p_user_id UUID,
  p_time_window INTERVAL DEFAULT '1 hour'
)
RETURNS TABLE(
  pattern_type VARCHAR(50),
  severity VARCHAR(20),
  description TEXT,
  event_count INTEGER,
  first_occurrence TIMESTAMP WITH TIME ZONE,
  last_occurrence TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Detect rapid access attempts to different institutions
  RETURN QUERY
  SELECT 
    'cross_tenant_access'::VARCHAR(50) as pattern_type,
    CASE 
      WHEN COUNT(DISTINCT target_institution_id) > 5 THEN 'critical'
      WHEN COUNT(DISTINCT target_institution_id) > 3 THEN 'high'
      ELSE 'medium'
    END::VARCHAR(20) as severity,
    'User attempted to access multiple institutions rapidly'::TEXT as description,
    COUNT(*)::INTEGER as event_count,
    MIN(timestamp) as first_occurrence,
    MAX(timestamp) as last_occurrence
  FROM tenant_security_events
  WHERE user_id = p_user_id
    AND timestamp > NOW() - p_time_window
    AND event_type = 'access_denied'
    AND target_institution_id IS NOT NULL
  GROUP BY user_id
  HAVING COUNT(DISTINCT target_institution_id) > 2;

  -- Detect high volume of failed access attempts
  RETURN QUERY
  SELECT 
    'failed_access_volume'::VARCHAR(50) as pattern_type,
    CASE 
      WHEN COUNT(*) > 50 THEN 'critical'
      WHEN COUNT(*) > 20 THEN 'high'
      ELSE 'medium'
    END::VARCHAR(20) as severity,
    'High volume of failed access attempts'::TEXT as description,
    COUNT(*)::INTEGER as event_count,
    MIN(timestamp) as first_occurrence,
    MAX(timestamp) as last_occurrence
  FROM tenant_security_events
  WHERE user_id = p_user_id
    AND timestamp > NOW() - p_time_window
    AND event_type IN ('access_denied', 'policy_violation')
  GROUP BY user_id
  HAVING COUNT(*) > 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate tenant data integrity
CREATE OR REPLACE FUNCTION validate_tenant_data_integrity(p_institution_id UUID)
RETURNS TABLE(
  table_name VARCHAR(50),
  issue_type VARCHAR(50),
  issue_count INTEGER,
  description TEXT
) AS $$
BEGIN
  -- Check for orphaned departments
  RETURN QUERY
  SELECT 
    'departments'::VARCHAR(50) as table_name,
    'orphaned_records'::VARCHAR(50) as issue_type,
    COUNT(*)::INTEGER as issue_count,
    'Departments without valid institution reference'::TEXT as description
  FROM departments d
  LEFT JOIN institutions i ON d.institution_id = i.id
  WHERE d.institution_id = p_institution_id AND i.id IS NULL
  HAVING COUNT(*) > 0;

  -- Check for cross-tenant data leakage in analytics
  RETURN QUERY
  SELECT 
    'institution_analytics'::VARCHAR(50) as table_name,
    'cross_tenant_data'::VARCHAR(50) as issue_type,
    COUNT(*)::INTEGER as issue_count,
    'Analytics records with mismatched institution references'::TEXT as description
  FROM institution_analytics ia
  WHERE ia.institution_id = p_institution_id
    AND NOT EXISTS (
      SELECT 1 FROM institutions i 
      WHERE i.id = ia.institution_id
    )
  HAVING COUNT(*) > 0;

  -- Check for invalid department analytics
  RETURN QUERY
  SELECT 
    'department_analytics'::VARCHAR(50) as table_name,
    'invalid_references'::VARCHAR(50) as issue_type,
    COUNT(*)::INTEGER as issue_count,
    'Department analytics with invalid department references'::TEXT as description
  FROM department_analytics da
  JOIN departments d ON da.department_id = d.id
  WHERE d.institution_id = p_institution_id
    AND NOT EXISTS (
      SELECT 1 FROM departments dept 
      WHERE dept.id = da.department_id 
        AND dept.institution_id = p_institution_id
    )
  HAVING COUNT(*) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION set_tenant_context(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_context() TO authenticated;
GRANT EXECUTE ON FUNCTION log_security_event(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, JSONB, INET, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_suspicious_activity(UUID, INTERVAL) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_tenant_data_integrity(UUID) TO authenticated;

-- Grant permissions on security events table
GRANT SELECT, INSERT ON tenant_security_events TO authenticated;