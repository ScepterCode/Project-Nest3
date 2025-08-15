-- =====================================================
-- BULK ROLE ASSIGNMENT SCHEMA
-- Database schema for bulk role assignment functionality
-- =====================================================

-- Bulk role assignments tracking table
CREATE TABLE IF NOT EXISTS public.bulk_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_name VARCHAR(255) NOT NULL,
  target_role VARCHAR(50) NOT NULL CHECK (target_role IN ('student', 'teacher', 'department_admin', 'institution_admin')),
  department_id UUID REFERENCES departments(id),
  total_users INTEGER NOT NULL DEFAULT 0,
  processed_users INTEGER DEFAULT 0,
  successful_assignments INTEGER DEFAULT 0,
  failed_assignments INTEGER DEFAULT 0,
  skipped_assignments INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled', 'validating')),
  is_temporary BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  justification TEXT,
  validation_errors JSONB DEFAULT '[]',
  assignment_options JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual role assignment records within a bulk operation
CREATE TABLE IF NOT EXISTS public.bulk_role_assignment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_assignment_id UUID NOT NULL REFERENCES bulk_role_assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_role VARCHAR(50),
  target_role VARCHAR(50) NOT NULL,
  assignment_status VARCHAR(50) DEFAULT 'pending' CHECK (assignment_status IN ('pending', 'success', 'failed', 'skipped', 'conflict')),
  error_message TEXT,
  error_code VARCHAR(100),
  conflict_details JSONB DEFAULT '{}',
  assigned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(bulk_assignment_id, user_id)
);

-- Role assignment conflicts tracking
CREATE TABLE IF NOT EXISTS public.role_assignment_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_assignment_id UUID NOT NULL REFERENCES bulk_role_assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conflict_type VARCHAR(100) NOT NULL,
  conflict_description TEXT NOT NULL,
  existing_role VARCHAR(50),
  target_role VARCHAR(50),
  resolution_status VARCHAR(50) DEFAULT 'unresolved' CHECK (resolution_status IN ('unresolved', 'resolved', 'ignored')),
  resolution_action VARCHAR(100),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role assignment notifications tracking
CREATE TABLE IF NOT EXISTS public.role_assignment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_assignment_id UUID NOT NULL REFERENCES bulk_role_assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('role_assigned', 'role_changed', 'temporary_role_assigned', 'role_expired')),
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  delivery_status VARCHAR(50) DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'bounced')),
  sent_at TIMESTAMPTZ,
  delivery_attempts INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Institutional role policies for validation
CREATE TABLE IF NOT EXISTS public.institutional_role_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  policy_name VARCHAR(255) NOT NULL,
  policy_type VARCHAR(100) NOT NULL CHECK (policy_type IN ('role_transition', 'department_restriction', 'approval_required', 'temporary_role_limit')),
  from_role VARCHAR(50),
  to_role VARCHAR(50),
  department_id UUID REFERENCES departments(id),
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_role VARCHAR(50),
  max_temporary_duration INTEGER, -- in days
  conditions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(institution_id, policy_name)
);

-- Role assignment audit trail
CREATE TABLE IF NOT EXISTS public.role_assignment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  bulk_assignment_id UUID REFERENCES bulk_role_assignments(id),
  action VARCHAR(100) NOT NULL,
  previous_role VARCHAR(50),
  assigned_role VARCHAR(50),
  changed_by UUID NOT NULL REFERENCES users(id),
  change_reason TEXT,
  is_temporary BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Bulk role assignments indexes
CREATE INDEX IF NOT EXISTS idx_bulk_role_assignments_institution ON bulk_role_assignments(institution_id);
CREATE INDEX IF NOT EXISTS idx_bulk_role_assignments_status ON bulk_role_assignments(status);
CREATE INDEX IF NOT EXISTS idx_bulk_role_assignments_initiated_by ON bulk_role_assignments(initiated_by);
CREATE INDEX IF NOT EXISTS idx_bulk_role_assignments_started_at ON bulk_role_assignments(started_at DESC);

-- Bulk role assignment items indexes
CREATE INDEX IF NOT EXISTS idx_bulk_role_assignment_items_bulk_id ON bulk_role_assignment_items(bulk_assignment_id);
CREATE INDEX IF NOT EXISTS idx_bulk_role_assignment_items_user ON bulk_role_assignment_items(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_role_assignment_items_status ON bulk_role_assignment_items(assignment_status);

-- Role assignment conflicts indexes
CREATE INDEX IF NOT EXISTS idx_role_assignment_conflicts_bulk_id ON role_assignment_conflicts(bulk_assignment_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_conflicts_user ON role_assignment_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_conflicts_status ON role_assignment_conflicts(resolution_status);

-- Role assignment notifications indexes
CREATE INDEX IF NOT EXISTS idx_role_assignment_notifications_bulk_id ON role_assignment_notifications(bulk_assignment_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_notifications_user ON role_assignment_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_notifications_status ON role_assignment_notifications(delivery_status);

-- Institutional role policies indexes
CREATE INDEX IF NOT EXISTS idx_institutional_role_policies_institution ON institutional_role_policies(institution_id);
CREATE INDEX IF NOT EXISTS idx_institutional_role_policies_type ON institutional_role_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_institutional_role_policies_active ON institutional_role_policies(is_active);

-- Role assignment audit indexes
CREATE INDEX IF NOT EXISTS idx_role_assignment_audit_user ON role_assignment_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_audit_institution ON role_assignment_audit(institution_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_audit_bulk_id ON role_assignment_audit(bulk_assignment_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_audit_created_at ON role_assignment_audit(created_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp for bulk_role_assignments
CREATE TRIGGER update_bulk_role_assignments_updated_at 
  BEFORE UPDATE ON bulk_role_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at timestamp for institutional_role_policies
CREATE TRIGGER update_institutional_role_policies_updated_at 
  BEFORE UPDATE ON institutional_role_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE bulk_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_role_assignment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignment_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutional_role_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignment_audit ENABLE ROW LEVEL SECURITY;

-- Bulk role assignments policies
CREATE POLICY "Institution admins can manage bulk role assignments" ON bulk_role_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.institution_id = bulk_role_assignments.institution_id 
      AND users.role IN ('institution_admin', 'department_admin')
    )
  );

-- Bulk role assignment items policies
CREATE POLICY "Institution admins can view bulk assignment items" ON bulk_role_assignment_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bulk_role_assignments bra
      JOIN users u ON u.id = auth.uid()
      WHERE bra.id = bulk_role_assignment_items.bulk_assignment_id
      AND u.institution_id = bra.institution_id
      AND u.role IN ('institution_admin', 'department_admin')
    )
  );

-- Users can view their own assignment items
CREATE POLICY "Users can view their own assignment items" ON bulk_role_assignment_items
  FOR SELECT USING (user_id = auth.uid());

-- Role assignment conflicts policies
CREATE POLICY "Institution admins can manage conflicts" ON role_assignment_conflicts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bulk_role_assignments bra
      JOIN users u ON u.id = auth.uid()
      WHERE bra.id = role_assignment_conflicts.bulk_assignment_id
      AND u.institution_id = bra.institution_id
      AND u.role IN ('institution_admin', 'department_admin')
    )
  );

-- Role assignment notifications policies
CREATE POLICY "Users can view their own notifications" ON role_assignment_notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Institution admins can manage notifications" ON role_assignment_notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bulk_role_assignments bra
      JOIN users u ON u.id = auth.uid()
      WHERE bra.id = role_assignment_notifications.bulk_assignment_id
      AND u.institution_id = bra.institution_id
      AND u.role IN ('institution_admin', 'department_admin')
    )
  );

-- Institutional role policies policies
CREATE POLICY "Institution admins can manage role policies" ON institutional_role_policies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.institution_id = institutional_role_policies.institution_id 
      AND users.role = 'institution_admin'
    )
  );

-- Role assignment audit policies
CREATE POLICY "Institution admins can view audit trail" ON role_assignment_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.institution_id = role_assignment_audit.institution_id 
      AND users.role IN ('institution_admin', 'department_admin')
    )
  );

-- Users can view their own audit records
CREATE POLICY "Users can view their own audit records" ON role_assignment_audit
  FOR SELECT USING (user_id = auth.uid());

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to validate role transition according to institutional policies
CREATE OR REPLACE FUNCTION validate_role_transition(
  p_institution_id UUID,
  p_user_id UUID,
  p_from_role VARCHAR,
  p_to_role VARCHAR,
  p_department_id UUID DEFAULT NULL
) RETURNS TABLE (
  is_valid BOOLEAN,
  requires_approval BOOLEAN,
  approval_role VARCHAR,
  error_message TEXT
) AS $$
DECLARE
  policy_record RECORD;
  user_department_id UUID;
BEGIN
  -- Get user's current department
  SELECT department_id INTO user_department_id 
  FROM users 
  WHERE id = p_user_id;
  
  -- Check for applicable policies
  FOR policy_record IN 
    SELECT * FROM institutional_role_policies 
    WHERE institution_id = p_institution_id 
    AND is_active = TRUE
    AND (from_role IS NULL OR from_role = p_from_role)
    AND (to_role IS NULL OR to_role = p_to_role)
    AND (department_id IS NULL OR department_id = user_department_id OR department_id = p_department_id)
    ORDER BY 
      CASE WHEN from_role IS NOT NULL AND to_role IS NOT NULL THEN 1
           WHEN from_role IS NOT NULL OR to_role IS NOT NULL THEN 2
           ELSE 3 END
  LOOP
    CASE policy_record.policy_type
      WHEN 'role_transition' THEN
        -- Check if transition is allowed
        IF policy_record.conditions ? 'forbidden' AND 
           (policy_record.conditions->'forbidden')::boolean = true THEN
          RETURN QUERY SELECT FALSE, FALSE, NULL::VARCHAR, 
            'Role transition from ' || p_from_role || ' to ' || p_to_role || ' is not allowed';
          RETURN;
        END IF;
        
      WHEN 'department_restriction' THEN
        -- Check department restrictions
        IF policy_record.department_id IS NOT NULL AND 
           policy_record.department_id != user_department_id THEN
          RETURN QUERY SELECT FALSE, FALSE, NULL::VARCHAR,
            'Role assignment restricted for this department';
          RETURN;
        END IF;
        
      WHEN 'approval_required' THEN
        -- Return approval requirement
        RETURN QUERY SELECT TRUE, TRUE, policy_record.approval_role,
          'Approval required from ' || policy_record.approval_role;
        RETURN;
    END CASE;
  END LOOP;
  
  -- If no restricting policies found, allow the transition
  RETURN QUERY SELECT TRUE, FALSE, NULL::VARCHAR, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to get bulk assignment statistics
CREATE OR REPLACE FUNCTION get_bulk_assignment_stats(p_assignment_id UUID)
RETURNS TABLE (
  total_users INTEGER,
  processed_users INTEGER,
  successful_assignments INTEGER,
  failed_assignments INTEGER,
  pending_assignments INTEGER,
  conflicts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bra.total_users,
    bra.processed_users,
    bra.successful_assignments,
    bra.failed_assignments,
    COUNT(CASE WHEN brai.assignment_status = 'pending' THEN 1 END)::INTEGER as pending_assignments,
    COUNT(CASE WHEN brai.assignment_status = 'conflict' THEN 1 END)::INTEGER as conflicts
  FROM bulk_role_assignments bra
  LEFT JOIN bulk_role_assignment_items brai ON bra.id = brai.bulk_assignment_id
  WHERE bra.id = p_assignment_id
  GROUP BY bra.id, bra.total_users, bra.processed_users, bra.successful_assignments, bra.failed_assignments;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions to authenticated users
GRANT ALL ON bulk_role_assignments TO authenticated;
GRANT ALL ON bulk_role_assignment_items TO authenticated;
GRANT ALL ON role_assignment_conflicts TO authenticated;
GRANT ALL ON role_assignment_notifications TO authenticated;
GRANT ALL ON institutional_role_policies TO authenticated;
GRANT ALL ON role_assignment_audit TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION validate_role_transition(UUID, UUID, VARCHAR, VARCHAR, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_bulk_assignment_stats(UUID) TO authenticated;