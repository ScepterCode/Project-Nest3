-- =====================================================
-- SAFE SUPABASE SCHEMA SETUP
-- This version handles existing objects gracefully
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CORE TABLES CREATION (SAFE)
-- =====================================================

-- Institutions table
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT,
    subdomain TEXT,
    type TEXT NOT NULL DEFAULT 'university',
    status TEXT NOT NULL DEFAULT 'active',
    contact_email TEXT,
    contact_phone TEXT,
    address JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{"allowSelfRegistration": false, "requireEmailVerification": true, "defaultUserRole": "student"}',
    branding JSONB DEFAULT '{"primaryColor": "#3b82f6", "secondaryColor": "#64748b"}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- Add unique constraint on subdomain if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'institutions_subdomain_key' 
        AND table_name = 'institutions'
    ) THEN
        ALTER TABLE institutions ADD CONSTRAINT institutions_subdomain_key UNIQUE (subdomain);
    END IF;
END $$;

-- Departments table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    code TEXT,
    admin_id UUID,
    parent_department_id UUID,
    settings JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (main user profiles)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    first_name TEXT,
    last_name TEXT,
    institution_id UUID,
    department_id UUID,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding sessions table
CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    current_step INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL DEFAULT 5,
    data JSONB NOT NULL DEFAULT '{"userId": "", "role": "student", "currentStep": 0, "skippedSteps": []}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding step events
CREATE TABLE IF NOT EXISTS public.onboarding_step_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    step_name TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Classes table
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    teacher_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    department_id UUID,
    status TEXT NOT NULL DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to existing tables if they don't exist
DO $$ 
BEGIN
    -- Add teacher_id to classes if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'teacher_id') THEN
        ALTER TABLE classes ADD COLUMN teacher_id UUID NOT NULL DEFAULT gen_random_uuid();
    END IF;
    
    -- Add institution_id to classes if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'institution_id') THEN
        ALTER TABLE classes ADD COLUMN institution_id UUID NOT NULL DEFAULT gen_random_uuid();
    END IF;
    
    -- Add department_id to classes if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'department_id') THEN
        ALTER TABLE classes ADD COLUMN department_id UUID;
    END IF;
END $$;

-- Class enrollments table
CREATE TABLE IF NOT EXISTS public.class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'active'
);

-- =====================================================
-- 2. ADD FOREIGN KEY CONSTRAINTS SAFELY
-- =====================================================

-- Add foreign key constraints only if they don't exist
DO $$ 
BEGIN
    -- Users table foreign keys
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_institution_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_department_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
    END IF;
    
    -- Departments table foreign keys
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'departments_institution_id_fkey') THEN
        ALTER TABLE departments ADD CONSTRAINT departments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'departments_admin_id_fkey') THEN
        ALTER TABLE departments ADD CONSTRAINT departments_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'departments_parent_department_id_fkey') THEN
        ALTER TABLE departments ADD CONSTRAINT departments_parent_department_id_fkey FOREIGN KEY (parent_department_id) REFERENCES departments(id);
    END IF;
    
    -- Onboarding sessions foreign keys
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'onboarding_sessions_user_id_fkey') THEN
        ALTER TABLE onboarding_sessions ADD CONSTRAINT onboarding_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- Onboarding events foreign keys
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'onboarding_step_events_session_id_fkey') THEN
        ALTER TABLE onboarding_step_events ADD CONSTRAINT onboarding_step_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES onboarding_sessions(id) ON DELETE CASCADE;
    END IF;
    
    -- Classes foreign keys (only if columns exist)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'teacher_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'classes_teacher_id_fkey') THEN
        ALTER TABLE classes ADD CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'institution_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'classes_institution_id_fkey') THEN
        ALTER TABLE classes ADD CONSTRAINT classes_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id);
    END IF;
    
    -- Class enrollments foreign keys
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'class_enrollments_class_id_fkey') THEN
        ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'class_enrollments_user_id_fkey') THEN
        ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- =====================================================
-- 3. CREATE INDEXES SAFELY
-- =====================================================

-- Create indexes only if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions(status);
CREATE INDEX IF NOT EXISTS idx_departments_institution ON departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_code ON classes(code);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON class_enrollments(user_id);

-- =====================================================
-- 4. CREATE FUNCTIONS SAFELY
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to create user profile when auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. CREATE TRIGGERS SAFELY
-- =====================================================

-- Drop existing triggers first, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 6. ENABLE RLS SAFELY
-- =====================================================

-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES SAFELY
-- =====================================================

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "System can insert users" ON users;
DROP POLICY IF EXISTS "Anyone can view active institutions" ON institutions;
DROP POLICY IF EXISTS "Anyone can view active departments" ON departments;
DROP POLICY IF EXISTS "Users can manage own onboarding" ON onboarding_sessions;

-- Create policies
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "System can insert users" ON users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view active institutions" ON institutions
    FOR SELECT USING (status = 'active');

CREATE POLICY "Anyone can view active departments" ON departments
    FOR SELECT USING (status = 'active');

CREATE POLICY "Users can manage own onboarding" ON onboarding_sessions
    FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 8. SEED DATA SAFELY
-- =====================================================

-- Insert sample institutions (only if they don't exist)
INSERT INTO institutions (name, domain, type, status, contact_email) 
SELECT * FROM (VALUES
    ('Harvard University', 'harvard.edu', 'university', 'active', 'admin@harvard.edu'),
    ('MIT', 'mit.edu', 'university', 'active', 'admin@mit.edu'),
    ('Stanford University', 'stanford.edu', 'university', 'active', 'admin@stanford.edu'),
    ('Community College', 'cc.edu', 'college', 'active', 'admin@cc.edu'),
    ('Demo High School', 'demohs.edu', 'school', 'active', 'admin@demohs.edu')
) AS v(name, domain, type, status, contact_email)
WHERE NOT EXISTS (SELECT 1 FROM institutions WHERE institutions.name = v.name);

-- Insert sample departments
INSERT INTO departments (institution_id, name, description, code, status)
SELECT i.id, d.name, d.description, d.code, 'active'
FROM institutions i
CROSS JOIN (VALUES
    ('Computer Science', 'Department of Computer Science', 'CS'),
    ('Mathematics', 'Department of Mathematics', 'MATH'),
    ('Physics', 'Department of Physics', 'PHYS'),
    ('English', 'Department of English', 'ENG'),
    ('Business', 'School of Business', 'BUS')
) AS d(name, description, code)
WHERE NOT EXISTS (
    SELECT 1 FROM departments 
    WHERE departments.institution_id = i.id 
    AND departments.name = d.name
);

-- =====================================================
-- 9. GRANT PERMISSIONS
-- =====================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON institutions TO anon;
GRANT SELECT ON departments TO anon;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=== DATABASE SETUP COMPLETED SUCCESSFULLY ===';
    RAISE NOTICE 'Tables: users, institutions, departments, onboarding_sessions, classes';
    RAISE NOTICE 'RLS policies enabled and configured';
    RAISE NOTICE 'Sample data inserted';
    RAISE NOTICE 'Your onboarding system should now work!';
END $$;