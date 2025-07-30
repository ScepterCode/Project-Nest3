-- User Onboarding Flow Database Schema Migration (Supabase Compatible)
-- This migration adds the necessary tables and columns for user onboarding
-- Compatible with Supabase's auth.users table structure

-- Create institutions table first (no dependencies)
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
  CONSTRAINT fk_departments_parent FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  UNIQUE(institution_id, code)
);

-- Create user_profiles table to extend Supabase auth.users
-- This is the recommended approach for Supabase
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_data JSONB DEFAULT '{}',
  onboarding_step INTEGER DEFAULT 0,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  display_name VARCHAR,
  avatar_url VARCHAR,
  role VARCHAR DEFAULT 'student',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key constraint for department admin after user_profiles exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_departments_admin' 
    AND table_name = 'departments'
  ) THEN
    ALTER TABLE departments ADD CONSTRAINT fk_departments_admin 
      FOREIGN KEY (admin_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create onboarding_sessions table for tracking progress
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 5,
  data JSONB DEFAULT '{}',
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  last_activity TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_completed ON user_profiles(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_user_profiles_institution_id ON user_profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department_id ON user_profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_institutions_domain ON institutions(domain);
CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions(status);
CREATE INDEX IF NOT EXISTS idx_departments_institution_id ON departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_departments_admin_id ON departments(admin_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_completed ON onboarding_sessions(completed_at);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_profiles (users can only see/edit their own profile)
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create RLS policies for onboarding_sessions (users can only see/edit their own sessions)
CREATE POLICY "Users can view own onboarding session" ON onboarding_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding session" ON onboarding_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding session" ON onboarding_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for institutions (public read access)
CREATE POLICY "Anyone can view institutions" ON institutions
  FOR SELECT USING (true);

-- Create RLS policies for departments (public read access)
CREATE POLICY "Anyone can view departments" ON departments
  FOR SELECT USING (true);

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

-- Create a function to automatically create user profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();