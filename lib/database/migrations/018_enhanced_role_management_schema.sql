-- Enhanced Role Management Database Schema Migration
-- This migration creates the comprehensive role management system
-- Requirements: 1.1, 7.1

-- Enhance users table with role management fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_role VARCHAR DEFAULT 'student';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_status VARCHAR DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_assigned_by UUID;

-- Add foreign key constraint for role_assigned_by
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS fk_users_role_assigned_by 
  FOREIGN KEY (role_assigned_by) REFERENCES users(id) ON DELETE SET NULL;

-- User role assignments table (supports multiple roles per user)
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'active',
  assigned_by UUID,
  assigned_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  department_id UUID,
  institution_id UUID NOT NULL,
  is_temporary BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_user_role_assignments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_role_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_role_assignments_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_role_assignments_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  
  -- Check constraints
  CONSTRAINT chk_user_role_assignments_role CHECK (role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin')),
  CONSTRAINT chk_user_role_assignments_status CHECK (status IN ('active', 'pending', 'suspended', 'expired')),
  CONSTRAINT chk_user_role_assignments_expires_at CHECK (expires_at IS NULL OR expires_at > assigned_at),
  
  -- Unique constraint to prevent duplicate active roles
  UNIQUE(user_id, role, department_id, institution_id) DEFERRABLE INITIALLY DEFERRED
);

-- Role requests table for approval workflows
CREATE TABLE IF NOT EXISTS role_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  requested_role VARCHAR NOT NULL,
  current_role VARCHAR,
  justification TEXT,
  status VARCHAR DEFAULT 'pending',
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by UUID,
  review_notes TEXT,
  verification_method VARCHAR,
  institution_id UUID NOT NULL,
  department_id UUID,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Foreign key constraints
  CONSTRAINT fk_role_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_requests_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_role_requests_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_requests_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  
  -- Check constraints
  CONSTRAINT chk_role_requests_requested_role CHECK (requested_role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin')),
  CONSTRAINT chk_role_requests_current_role CHECK (current_role IS NULL OR current_role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin')),
  CONSTRAINT chk_role_requests_status CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  CONSTRAINT chk_role_requests_verification_method CHECK (verification_method IN ('email_domain', 'manual_review', 'admin_approval')),
  CONSTRAINT chk_role_requests_expires_at CHECK (expires_at > requested_at),
  CONSTRAINT chk_role_requests_reviewed_at CHECK (reviewed_at IS NULL OR reviewed_at >= requested_at)
);

-- Role change audit log table
CREATE TABLE IF NOT EXISTS role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action VARCHAR NOT NULL,
  old_role VARCHAR,
  new_role VARCHAR,
  changed_by UUID,
  reason TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  institution_id UUID,
  department_id UUID,
  metadata JSONB DEFAULT '{}',
  
  -- Foreign key constraints
  CONSTRAINT fk_role_audit_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_audit_log_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_role_audit_log_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
  CONSTRAINT fk_role_audit_log_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  
  -- Check constraints
  CONSTRAINT chk_role_audit_log_action CHECK (action IN ('assigned', 'revoked', 'changed', 'expired', 'suspended', 'activated')),
  CONSTRAINT chk_role_audit_log_old_role CHECK (old_role IS NULL OR old_role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin')),
  CONSTRAINT chk_role_audit_log_new_role CHECK (new_role IS NULL OR new_role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin'))
);

-- Institution domains table for email domain verification
CREATE TABLE IF NOT EXISTS institution_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  domain VARCHAR NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  auto_approve_roles VARCHAR[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP,
  verified_by UUID,
  
  -- Foreign key constraints
  CONSTRAINT fk_institution_domains_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_institution_domains_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  
  -- Check constraints
  CONSTRAINT chk_institution_domains_domain CHECK (domain ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$'),
  CONSTRAINT chk_institution_domains_verified_at CHECK (verified_at IS NULL OR (verified = TRUE AND verified_at IS NOT NULL)),
  
  -- Unique constraint
  UNIQUE(institution_id, domain)
);

-- Permissions table for granular access control
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR NOT NULL,
  scope VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Check constraints
  CONSTRAINT chk_permissions_category CHECK (category IN ('content', 'user_management', 'analytics', 'system')),
  CONSTRAINT chk_permissions_scope CHECK (scope IN ('self', 'department', 'institution', 'system')),
  CONSTRAINT chk_permissions_name CHECK (name ~ '^[a-z][a-z0-9_]*[a-z0-9]$')
);

-- Role permissions mapping table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR NOT NULL,
  permission_id UUID NOT NULL,
  conditions JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  
  -- Check constraints
  CONSTRAINT chk_role_permissions_role CHECK (role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin')),
  
  -- Unique constraint
  UNIQUE(role, permission_id)
);

-- Performance optimization indexes
-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_primary_role ON users(primary_role);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role_status);
CREATE INDEX IF NOT EXISTS idx_users_role_verified_at ON users(role_verified_at);
CREATE INDEX IF NOT EXISTS idx_users_role_assigned_by ON users(role_assigned_by);

-- User role assignments indexes
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_id ON user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role ON user_role_assignments(role);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_status ON user_role_assignments(status);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_assigned_by ON user_role_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_expires_at ON user_role_assignments(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_department_id ON user_role_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_institution_id ON user_role_assignments(institution_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_is_temporary ON user_role_assignments(is_temporary);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_active ON user_role_assignments(user_id, status) WHERE status = 'active';

-- Role requests indexes
CREATE INDEX IF NOT EXISTS idx_role_requests_user_id ON role_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_role_requests_status ON role_requests(status);
CREATE INDEX IF NOT EXISTS idx_role_requests_requested_role ON role_requests(requested_role);
CREATE INDEX IF NOT EXISTS idx_role_requests_reviewed_by ON role_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_role_requests_institution_id ON role_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_role_requests_department_id ON role_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_role_requests_expires_at ON role_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_role_requests_pending ON role_requests(status, requested_at) WHERE status = 'pending';

-- Role audit log indexes
CREATE INDEX IF NOT EXISTS idx_role_audit_log_user_id ON role_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_action ON role_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_changed_by ON role_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_timestamp ON role_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_institution_id ON role_audit_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_department_id ON role_audit_log(department_id);

-- Institution domains indexes
CREATE INDEX IF NOT EXISTS idx_institution_domains_institution_id ON institution_domains(institution_id);
CREATE INDEX IF NOT EXISTS idx_institution_domains_domain ON institution_domains(domain);
CREATE INDEX IF NOT EXISTS idx_institution_domains_verified ON institution_domains(verified);

-- Permissions indexes
CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
CREATE INDEX IF NOT EXISTS idx_permissions_scope ON permissions(scope);

-- Role permissions indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_institution ON user_role_assignments(user_id, institution_id, status);
CREATE INDEX IF NOT EXISTS idx_role_requests_institution_status ON role_requests(institution_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_user_timestamp ON role_audit_log(user_id, timestamp DESC);

-- Insert default permissions
INSERT INTO permissions (name, description, category, scope) VALUES
  -- Content permissions
  ('view_content', 'View educational content', 'content', 'self'),
  ('create_content', 'Create educational content', 'content', 'department'),
  ('edit_content', 'Edit educational content', 'content', 'department'),
  ('delete_content', 'Delete educational content', 'content', 'department'),
  ('publish_content', 'Publish educational content', 'content', 'department'),
  
  -- User management permissions
  ('view_users', 'View user profiles', 'user_management', 'department'),
  ('invite_users', 'Invite new users', 'user_management', 'department'),
  ('manage_user_roles', 'Manage user roles', 'user_management', 'department'),
  ('suspend_users', 'Suspend user accounts', 'user_management', 'department'),
  
  -- Analytics permissions
  ('view_analytics', 'View analytics dashboards', 'analytics', 'department'),
  ('export_analytics', 'Export analytics data', 'analytics', 'department'),
  ('view_institution_analytics', 'View institution-wide analytics', 'analytics', 'institution'),
  
  -- System permissions
  ('manage_institution', 'Manage institution settings', 'system', 'institution'),
  ('manage_departments', 'Manage departments', 'system', 'institution'),
  ('system_administration', 'System administration', 'system', 'system')
ON CONFLICT (name) DO NOTHING;

-- Insert default role-permission mappings
INSERT INTO role_permissions (role, permission_id) 
SELECT 'student', p.id FROM permissions p WHERE p.name IN ('view_content')
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO role_permissions (role, permission_id)
SELECT 'teacher', p.id FROM permissions p WHERE p.name IN (
  'view_content', 'create_content', 'edit_content', 'publish_content', 
  'view_users', 'invite_users', 'view_analytics'
)
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO role_permissions (role, permission_id)
SELECT 'department_admin', p.id FROM permissions p WHERE p.name IN (
  'view_content', 'create_content', 'edit_content', 'delete_content', 'publish_content',
  'view_users', 'invite_users', 'manage_user_roles', 'suspend_users',
  'view_analytics', 'export_analytics'
)
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO role_permissions (role, permission_id)
SELECT 'institution_admin', p.id FROM permissions p WHERE p.name IN (
  'view_content', 'create_content', 'edit_content', 'delete_content', 'publish_content',
  'view_users', 'invite_users', 'manage_user_roles', 'suspend_users',
  'view_analytics', 'export_analytics', 'view_institution_analytics',
  'manage_institution', 'manage_departments'
)
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO role_permissions (role, permission_id)
SELECT 'system_admin', p.id FROM permissions p
ON CONFLICT (role, permission_id) DO NOTHING;

-- Create triggers for automatic audit logging
CREATE OR REPLACE FUNCTION log_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO role_audit_log (user_id, action, new_role, changed_by, institution_id, department_id, metadata)
    VALUES (NEW.user_id, 'assigned', NEW.role, NEW.assigned_by, NEW.institution_id, NEW.department_id, 
            jsonb_build_object('assignment_id', NEW.id, 'is_temporary', NEW.is_temporary, 'expires_at', NEW.expires_at));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      INSERT INTO role_audit_log (user_id, action, old_role, new_role, changed_by, institution_id, department_id, metadata)
      VALUES (NEW.user_id, 
              CASE 
                WHEN NEW.status = 'suspended' THEN 'suspended'
                WHEN NEW.status = 'active' AND OLD.status = 'suspended' THEN 'activated'
                WHEN NEW.status = 'expired' THEN 'expired'
                ELSE 'changed'
              END,
              OLD.role, NEW.role, NEW.assigned_by, NEW.institution_id, NEW.department_id,
              jsonb_build_object('assignment_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO role_audit_log (user_id, action, old_role, changed_by, institution_id, department_id, metadata)
    VALUES (OLD.user_id, 'revoked', OLD.role, OLD.assigned_by, OLD.institution_id, OLD.department_id,
            jsonb_build_object('assignment_id', OLD.id));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for role assignment changes
DROP TRIGGER IF EXISTS trigger_log_role_change ON user_role_assignments;
CREATE TRIGGER trigger_log_role_change
  AFTER INSERT OR UPDATE OR DELETE ON user_role_assignments
  FOR EACH ROW EXECUTE FUNCTION log_role_change();

-- Create function to automatically expire temporary roles
CREATE OR REPLACE FUNCTION expire_temporary_roles()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE user_role_assignments 
  SET status = 'expired', updated_at = NOW()
  WHERE expires_at <= NOW() 
    AND status = 'active' 
    AND is_temporary = TRUE;
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up expired role requests
CREATE OR REPLACE FUNCTION cleanup_expired_role_requests()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE role_requests 
  SET status = 'expired'
  WHERE expires_at <= NOW() 
    AND status = 'pending';
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE user_role_assignments IS 'Stores role assignments for users with support for multiple roles, temporary assignments, and expiration';
COMMENT ON TABLE role_requests IS 'Manages role change requests and approval workflows';
COMMENT ON TABLE role_audit_log IS 'Comprehensive audit trail for all role-related changes';
COMMENT ON TABLE institution_domains IS 'Manages verified email domains for automatic role approval';
COMMENT ON TABLE permissions IS 'Defines granular permissions available in the system';
COMMENT ON TABLE role_permissions IS 'Maps roles to their associated permissions';

COMMENT ON COLUMN user_role_assignments.is_temporary IS 'Indicates if this is a temporary role assignment that will expire';
COMMENT ON COLUMN user_role_assignments.expires_at IS 'When this role assignment expires (NULL for permanent assignments)';
COMMENT ON COLUMN user_role_assignments.metadata IS 'Additional metadata about the role assignment';
COMMENT ON COLUMN role_requests.verification_method IS 'Method used to verify the role request (email_domain, manual_review, admin_approval)';
COMMENT ON COLUMN institution_domains.auto_approve_roles IS 'Array of roles that can be auto-approved for this domain';
COMMENT ON COLUMN permissions.scope IS 'Scope of the permission (self, department, institution, system)';
COMMENT ON COLUMN role_permissions.conditions IS 'Additional conditions for when this permission applies';