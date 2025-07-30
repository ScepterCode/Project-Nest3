-- Content sharing policies table (already exists from design, but ensuring it's complete)
CREATE TABLE IF NOT EXISTS content_sharing_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  resource_type VARCHAR NOT NULL,
  sharing_level VARCHAR NOT NULL,
  conditions JSONB DEFAULT '{}',
  attribution_required BOOLEAN DEFAULT FALSE,
  allow_cross_institution BOOLEAN DEFAULT FALSE,
  restricted_domains TEXT[],
  allowed_domains TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) NOT NULL,
  UNIQUE(institution_id, resource_type)
);

-- Collaboration settings table
CREATE TABLE IF NOT EXISTS collaboration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  department_id UUID REFERENCES departments(id),
  allow_cross_institution_collaboration BOOLEAN DEFAULT FALSE,
  allow_cross_department_collaboration BOOLEAN DEFAULT TRUE,
  default_permissions TEXT[] DEFAULT ARRAY['view'],
  approval_required BOOLEAN DEFAULT FALSE,
  approver_roles TEXT[] DEFAULT ARRAY[],
  max_collaborators INTEGER,
  allow_external_collaborators BOOLEAN DEFAULT FALSE,
  external_domain_whitelist TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id, department_id)
);

-- Content sharing requests table
CREATE TABLE IF NOT EXISTS content_sharing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id VARCHAR NOT NULL,
  content_type VARCHAR NOT NULL,
  requester_id UUID REFERENCES users(id) NOT NULL,
  target_institution_id UUID REFERENCES institutions(id),
  target_department_id UUID REFERENCES departments(id),
  requested_permissions TEXT[] NOT NULL,
  justification TEXT,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  denial_reason TEXT,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Content attributions table
CREATE TABLE IF NOT EXISTS content_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id VARCHAR NOT NULL,
  original_author_id UUID REFERENCES users(id) NOT NULL,
  original_institution_id UUID REFERENCES institutions(id) NOT NULL,
  original_department_id UUID REFERENCES departments(id),
  attribution_text TEXT NOT NULL,
  license_type VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(content_id, original_author_id)
);

-- Policy violations table
CREATE TABLE IF NOT EXISTS policy_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id VARCHAR NOT NULL,
  policy_id UUID REFERENCES content_sharing_policies(id),
  violation_type VARCHAR NOT NULL CHECK (violation_type IN ('unauthorized_sharing', 'missing_attribution', 'domain_restriction', 'permission_exceeded')),
  description TEXT NOT NULL,
  reported_by UUID REFERENCES users(id),
  status VARCHAR DEFAULT 'reported' CHECK (status IN ('reported', 'investigating', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Content sharing permissions table (tracks actual granted permissions)
CREATE TABLE IF NOT EXISTS content_sharing_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id VARCHAR NOT NULL,
  content_type VARCHAR NOT NULL,
  owner_id UUID REFERENCES users(id) NOT NULL,
  shared_with_user_id UUID REFERENCES users(id),
  shared_with_institution_id UUID REFERENCES institutions(id),
  shared_with_department_id UUID REFERENCES departments(id),
  permissions TEXT[] NOT NULL,
  policy_id UUID REFERENCES content_sharing_policies(id),
  granted_by UUID REFERENCES users(id) NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_sharing_policies_institution ON content_sharing_policies(institution_id);
CREATE INDEX IF NOT EXISTS idx_content_sharing_policies_resource_type ON content_sharing_policies(resource_type);
CREATE INDEX IF NOT EXISTS idx_collaboration_settings_institution ON collaboration_settings(institution_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_settings_department ON collaboration_settings(department_id);
CREATE INDEX IF NOT EXISTS idx_content_sharing_requests_requester ON content_sharing_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_content_sharing_requests_status ON content_sharing_requests(status);
CREATE INDEX IF NOT EXISTS idx_content_attributions_content ON content_attributions(content_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_content ON policy_violations(content_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_status ON policy_violations(status);
CREATE INDEX IF NOT EXISTS idx_content_sharing_permissions_content ON content_sharing_permissions(content_id);
CREATE INDEX IF NOT EXISTS idx_content_sharing_permissions_owner ON content_sharing_permissions(owner_id);

-- Row Level Security policies
ALTER TABLE content_sharing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sharing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sharing_permissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for content_sharing_policies
CREATE POLICY "Users can view policies for their institution" ON content_sharing_policies
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_institutions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Institution admins can manage policies" ON content_sharing_policies
  FOR ALL USING (
    institution_id IN (
      SELECT ui.institution_id 
      FROM user_institutions ui 
      JOIN user_roles ur ON ui.user_id = ur.user_id 
      WHERE ui.user_id = auth.uid() 
      AND ur.role IN ('institution_admin', 'system_admin')
    )
  );

-- RLS policies for collaboration_settings
CREATE POLICY "Users can view collaboration settings for their institution/department" ON collaboration_settings
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_institutions WHERE user_id = auth.uid()
    )
    OR department_id IN (
      SELECT department_id FROM user_departments WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage collaboration settings" ON collaboration_settings
  FOR ALL USING (
    institution_id IN (
      SELECT ui.institution_id 
      FROM user_institutions ui 
      JOIN user_roles ur ON ui.user_id = ur.user_id 
      WHERE ui.user_id = auth.uid() 
      AND ur.role IN ('institution_admin', 'department_admin', 'system_admin')
    )
  );

-- RLS policies for content_sharing_requests
CREATE POLICY "Users can view their own sharing requests" ON content_sharing_requests
  FOR SELECT USING (requester_id = auth.uid());

CREATE POLICY "Users can create sharing requests" ON content_sharing_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Admins can view and manage sharing requests for their institution" ON content_sharing_requests
  FOR ALL USING (
    target_institution_id IN (
      SELECT ui.institution_id 
      FROM user_institutions ui 
      JOIN user_roles ur ON ui.user_id = ur.user_id 
      WHERE ui.user_id = auth.uid() 
      AND ur.role IN ('institution_admin', 'department_admin', 'system_admin')
    )
  );

-- Functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_content_sharing_policies_updated_at 
  BEFORE UPDATE ON content_sharing_policies 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collaboration_settings_updated_at 
  BEFORE UPDATE ON collaboration_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_sharing_requests_updated_at 
  BEFORE UPDATE ON content_sharing_requests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_sharing_permissions_updated_at 
  BEFORE UPDATE ON content_sharing_permissions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();