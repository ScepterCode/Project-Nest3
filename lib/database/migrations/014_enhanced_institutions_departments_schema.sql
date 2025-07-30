-- Enhanced multi-tenant institutions and departments schema
-- Migration: 014_enhanced_institutions_departments_schema.sql

-- Drop existing tables if they exist (for development)
DROP TABLE IF EXISTS institution_invitations CASCADE;
DROP TABLE IF EXISTS content_sharing_policies CASCADE;
DROP TABLE IF EXISTS department_analytics CASCADE;
DROP TABLE IF EXISTS institution_analytics CASCADE;
DROP TABLE IF EXISTS institution_integrations CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS institutions CASCADE;

-- Enhanced institutions table with multi-tenant support
CREATE TABLE institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  subdomain VARCHAR(100) UNIQUE,
  type VARCHAR(50) DEFAULT 'university' CHECK (type IN ('university', 'college', 'school', 'training_center', 'other')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  branding JSONB DEFAULT '{}',
  subscription JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  
  -- Constraints
  CONSTRAINT institutions_domain_format CHECK (domain ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$'),
  CONSTRAINT institutions_subdomain_format CHECK (subdomain IS NULL OR subdomain ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*$')
);

-- Enhanced departments table with hierarchical support
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  code VARCHAR(20),
  admin_id UUID,
  parent_department_id UUID,
  settings JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_departments_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_departments_parent FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  
  -- Unique constraints
  CONSTRAINT departments_institution_code_unique UNIQUE(institution_id, code),
  CONSTRAINT departments_institution_name_unique UNIQUE(institution_id, name),
  
  -- Prevent self-referencing
  CONSTRAINT departments_no_self_reference CHECK (id != parent_department_id)
);

-- Institution integrations table
CREATE TABLE institution_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('sso', 'sis', 'lms', 'analytics', 'storage')),
  provider VARCHAR(100) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  last_sync TIMESTAMP WITH TIME ZONE,
  sync_errors TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_integrations_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  
  -- Unique constraint for type-provider combination per institution
  CONSTRAINT institution_integrations_unique UNIQUE(institution_id, type, provider)
);

-- Institution analytics table
CREATE TABLE institution_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_value NUMERIC,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date_bucket DATE DEFAULT CURRENT_DATE,
  
  -- Foreign key constraints
  CONSTRAINT fk_institution_analytics_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  
  -- Index for efficient querying
  CONSTRAINT institution_analytics_metric_check CHECK (metric_name IN (
    'user_count', 'active_users', 'class_count', 'enrollment_count', 
    'login_rate', 'content_creation_rate', 'engagement_score'
  ))
);

-- Department analytics table
CREATE TABLE department_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_value NUMERIC,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date_bucket DATE DEFAULT CURRENT_DATE,
  
  -- Foreign key constraints
  CONSTRAINT fk_department_analytics_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  
  -- Index for efficient querying
  CONSTRAINT department_analytics_metric_check CHECK (metric_name IN (
    'student_count', 'teacher_count', 'class_count', 'assignment_count',
    'completion_rate', 'performance_average', 'at_risk_students'
  ))
);

-- Institution invitations table
CREATE TABLE institution_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  department_id UUID,
  invited_by UUID NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_invitations_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_invitations_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  
  -- Constraints
  CONSTRAINT invitations_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT invitations_expires_future CHECK (expires_at > created_at)
);

-- Content sharing policies table
CREATE TABLE content_sharing_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  sharing_level VARCHAR(20) NOT NULL CHECK (sharing_level IN ('private', 'department', 'institution', 'public')),
  conditions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_content_policies_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  
  -- Unique constraint for resource type per institution
  CONSTRAINT content_policies_unique UNIQUE(institution_id, resource_type)
);-
- Indexes for performance and multi-tenant data isolation

-- Institutions indexes
CREATE INDEX idx_institutions_domain ON institutions(domain);
CREATE INDEX idx_institutions_subdomain ON institutions(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX idx_institutions_status ON institutions(status);
CREATE INDEX idx_institutions_type ON institutions(type);
CREATE INDEX idx_institutions_created_at ON institutions(created_at);

-- Departments indexes
CREATE INDEX idx_departments_institution_id ON departments(institution_id);
CREATE INDEX idx_departments_admin_id ON departments(admin_id);
CREATE INDEX idx_departments_parent_id ON departments(parent_department_id) WHERE parent_department_id IS NOT NULL;
CREATE INDEX idx_departments_status ON departments(status);
CREATE INDEX idx_departments_code ON departments(institution_id, code);

-- Institution integrations indexes
CREATE INDEX idx_integrations_institution_id ON institution_integrations(institution_id);
CREATE INDEX idx_integrations_type ON institution_integrations(type);
CREATE INDEX idx_integrations_enabled ON institution_integrations(enabled);
CREATE INDEX idx_integrations_last_sync ON institution_integrations(last_sync);

-- Institution analytics indexes
CREATE INDEX idx_institution_analytics_institution_id ON institution_analytics(institution_id);
CREATE INDEX idx_institution_analytics_metric ON institution_analytics(metric_name);
CREATE INDEX idx_institution_analytics_date ON institution_analytics(date_bucket);
CREATE INDEX idx_institution_analytics_recorded ON institution_analytics(recorded_at);
CREATE INDEX idx_institution_analytics_composite ON institution_analytics(institution_id, metric_name, date_bucket);

-- Department analytics indexes
CREATE INDEX idx_department_analytics_department_id ON department_analytics(department_id);
CREATE INDEX idx_department_analytics_metric ON department_analytics(metric_name);
CREATE INDEX idx_department_analytics_date ON department_analytics(date_bucket);
CREATE INDEX idx_department_analytics_recorded ON department_analytics(recorded_at);
CREATE INDEX idx_department_analytics_composite ON department_analytics(department_id, metric_name, date_bucket);

-- Institution invitations indexes
CREATE INDEX idx_invitations_institution_id ON institution_invitations(institution_id);
CREATE INDEX idx_invitations_email ON institution_invitations(email);
CREATE INDEX idx_invitations_token ON institution_invitations(token);
CREATE INDEX idx_invitations_expires_at ON institution_invitations(expires_at);
CREATE INDEX idx_invitations_department_id ON institution_invitations(department_id) WHERE department_id IS NOT NULL;

-- Content sharing policies indexes
CREATE INDEX idx_content_policies_institution_id ON content_sharing_policies(institution_id);
CREATE INDEX idx_content_policies_resource_type ON content_sharing_policies(resource_type);
CREATE INDEX idx_content_policies_sharing_level ON content_sharing_policies(sharing_level);

-- Row Level Security (RLS) for multi-tenant data isolation
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sharing_policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for institutions (system admins can see all, institution admins can see their own)
CREATE POLICY institutions_isolation ON institutions
  FOR ALL
  USING (
    -- System admin can see all
    auth.jwt() ->> 'role' = 'system_admin' OR
    -- Institution admin can see their own institution
    (auth.jwt() ->> 'role' = 'institution_admin' AND id::text = auth.jwt() ->> 'institution_id') OR
    -- Users can see their own institution
    id::text = auth.jwt() ->> 'institution_id'
  );

-- RLS Policies for departments (scoped to institution)
CREATE POLICY departments_isolation ON departments
  FOR ALL
  USING (
    -- System admin can see all
    auth.jwt() ->> 'role' = 'system_admin' OR
    -- Institution users can see departments in their institution
    institution_id::text = auth.jwt() ->> 'institution_id'
  );

-- RLS Policies for institution integrations (scoped to institution)
CREATE POLICY integrations_isolation ON institution_integrations
  FOR ALL
  USING (
    -- System admin can see all
    auth.jwt() ->> 'role' = 'system_admin' OR
    -- Institution admins can see their integrations
    institution_id::text = auth.jwt() ->> 'institution_id'
  );

-- RLS Policies for analytics (scoped to institution/department)
CREATE POLICY institution_analytics_isolation ON institution_analytics
  FOR ALL
  USING (
    -- System admin can see all
    auth.jwt() ->> 'role' = 'system_admin' OR
    -- Institution users can see their analytics
    institution_id::text = auth.jwt() ->> 'institution_id'
  );

CREATE POLICY department_analytics_isolation ON department_analytics
  FOR ALL
  USING (
    -- System admin can see all
    auth.jwt() ->> 'role' = 'system_admin' OR
    -- Department users can see their analytics
    department_id IN (
      SELECT d.id FROM departments d 
      WHERE d.institution_id::text = auth.jwt() ->> 'institution_id'
    )
  );

-- RLS Policies for invitations (scoped to institution)
CREATE POLICY invitations_isolation ON institution_invitations
  FOR ALL
  USING (
    -- System admin can see all
    auth.jwt() ->> 'role' = 'system_admin' OR
    -- Institution users can see their invitations
    institution_id::text = auth.jwt() ->> 'institution_id'
  );

-- RLS Policies for content sharing policies (scoped to institution)
CREATE POLICY content_policies_isolation ON content_sharing_policies
  FOR ALL
  USING (
    -- System admin can see all
    auth.jwt() ->> 'role' = 'system_admin' OR
    -- Institution users can see their policies
    institution_id::text = auth.jwt() ->> 'institution_id'
  );

-- Functions for data validation and triggers

-- Function to prevent circular department hierarchy
CREATE OR REPLACE FUNCTION check_department_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
  -- Check for circular reference
  IF NEW.parent_department_id IS NOT NULL THEN
    -- Use recursive CTE to check for cycles
    WITH RECURSIVE dept_hierarchy AS (
      SELECT id, parent_department_id, 1 as level
      FROM departments 
      WHERE id = NEW.parent_department_id
      
      UNION ALL
      
      SELECT d.id, d.parent_department_id, dh.level + 1
      FROM departments d
      INNER JOIN dept_hierarchy dh ON d.id = dh.parent_department_id
      WHERE dh.level < 10 -- Prevent infinite recursion
    )
    SELECT 1 FROM dept_hierarchy WHERE id = NEW.id;
    
    IF FOUND THEN
      RAISE EXCEPTION 'Circular department hierarchy detected';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check department hierarchy
CREATE TRIGGER check_department_hierarchy_trigger
  BEFORE INSERT OR UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION check_department_hierarchy();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at columns
CREATE TRIGGER update_institutions_updated_at
  BEFORE UPDATE ON institutions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON institution_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_policies_updated_at
  BEFORE UPDATE ON content_sharing_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust based on your role system)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;