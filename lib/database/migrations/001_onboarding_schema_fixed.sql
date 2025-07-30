-- User Onboarding Flow Database Schema Migration
-- This migration adds the necessary tables and columns for user onboarding

-- Extend users table with onboarding fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS institution_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID;

-- Create institutions table
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  domain VARCHAR UNIQUE,
  subdomain VARCHAR UNIQUE,
  type VARCHAR DEFAULT 'university',
  status VARCHAR DEFAULT 'active',
  contact_email VARCHAR,
  contact_phone VARCHAR,
  address JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  branding JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID
);

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  code VARCHAR,
  admin_id UUID,
  parent_department_id UUID,
  settings JSONB DEFAULT '{}',
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_departments_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_departments_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_departments_parent FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  UNIQUE(institution_id, code)
);

-- Add foreign key constraints to users table (with proper error handling)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_users_institution' 
    AND table_name = 'users'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_institution 
      FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_users_department' 
    AND table_name = 'users'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_department 
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create onboarding_sessions table for tracking progress
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 5,
  data JSONB DEFAULT '{}',
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  last_activity TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_onboarding_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON users(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_users_institution_id ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_institutions_domain ON institutions(domain);
CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions(status);
CREATE INDEX IF NOT EXISTS idx_departments_institution_id ON departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_departments_admin_id ON departments(admin_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_completed ON onboarding_sessions(completed_at);

-- Insert some default institutions for testing
INSERT INTO institutions (name, domain, type, status) VALUES
  ('Demo University', 'demo.edu', 'university', 'active'),
  ('Test College', 'test.edu', 'college', 'active'),
  ('Sample High School', 'sample.k12.edu', 'school', 'active')
ON CONFLICT (domain) DO NOTHING;

-- Insert default departments for Demo University
INSERT INTO departments (institution_id, name, description, code) 
SELECT 
  i.id,
  dept.name,
  dept.description,
  dept.code
FROM institutions i,
(VALUES 
  ('Computer Science', 'Department of Computer Science and Engineering', 'CS'),
  ('Mathematics', 'Department of Mathematics', 'MATH'),
  ('English', 'Department of English Literature', 'ENG'),
  ('Business', 'School of Business Administration', 'BUS')
) AS dept(name, description, code)
WHERE i.domain = 'demo.edu'
ON CONFLICT (institution_id, code) DO NOTHING;