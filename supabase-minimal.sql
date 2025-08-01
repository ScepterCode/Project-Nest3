-- =====================================================
-- MINIMAL SUPABASE SCHEMA FOR ONBOARDING
-- Only creates the essential tables needed for onboarding
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. ESSENTIAL TABLES ONLY
-- =====================================================

-- Institutions table (needed for onboarding)
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT,
    type TEXT NOT NULL DEFAULT 'university',
    status TEXT NOT NULL DEFAULT 'active',
    contact_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Departments table (needed for onboarding)
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    code TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (THE MAIN MISSING TABLE)
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

-- Onboarding sessions table (needed for onboarding progress)
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

-- =====================================================
-- 2. ADD FOREIGN KEY CONSTRAINTS SAFELY
-- =====================================================

DO $$ 
BEGIN
    -- Users table foreign keys
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    -- Departments foreign key to institutions
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'departments_institution_id_fkey') THEN
        ALTER TABLE departments ADD CONSTRAINT departments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
    END IF;
    
    -- Users foreign keys to institutions and departments
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_institution_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_department_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
    END IF;
    
    -- Onboarding sessions foreign key to users
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'onboarding_sessions_user_id_fkey') THEN
        ALTER TABLE onboarding_sessions ADD CONSTRAINT onboarding_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- =====================================================
-- 3. CREATE ESSENTIAL INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions(status);
CREATE INDEX IF NOT EXISTS idx_departments_institution ON departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user ON onboarding_sessions(user_id);

-- =====================================================
-- 4. CREATE USER PROFILE CREATION FUNCTION
-- =====================================================

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

-- Create trigger to automatically create user profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 5. ENABLE RLS AND CREATE BASIC POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "System can insert users" ON users;
DROP POLICY IF EXISTS "Anyone can view active institutions" ON institutions;
DROP POLICY IF EXISTS "Anyone can view active departments" ON departments;
DROP POLICY IF EXISTS "Users can manage own onboarding" ON onboarding_sessions;

-- Create essential policies
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
-- 6. INSERT ESSENTIAL SAMPLE DATA
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

-- Insert sample departments for each institution
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
-- 7. GRANT PERMISSIONS
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
    RAISE NOTICE '=== MINIMAL DATABASE SETUP COMPLETED ===';
    RAISE NOTICE 'Essential tables created: users, institutions, departments, onboarding_sessions';
    RAISE NOTICE 'User profile creation trigger installed';
    RAISE NOTICE 'Sample data inserted for testing';
    RAISE NOTICE 'Your onboarding system should now work!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Test your onboarding flow';
    RAISE NOTICE '2. Check that users table is populated when you sign up';
    RAISE NOTICE '3. Verify onboarding sessions are created';
END $$;