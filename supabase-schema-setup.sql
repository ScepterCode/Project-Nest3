-- =====================================================
-- COMPLETE SUPABASE SCHEMA SETUP
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CORE TABLES CREATION
-- =====================================================

-- Institutions table (create first due to foreign key dependencies)
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT,
    subdomain TEXT UNIQUE,
    type TEXT NOT NULL DEFAULT 'university' CHECK (type IN ('university', 'college', 'school', 'training_center', 'other')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
    contact_email TEXT,
    contact_phone TEXT,
    address JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{
        "allowSelfRegistration": false,
        "requireEmailVerification": true,
        "defaultUserRole": "student",
        "allowCrossInstitutionCollaboration": false
    }',
    branding JSONB DEFAULT '{
        "primaryColor": "#3b82f6",
        "secondaryColor": "#64748b"
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- Departments table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    code TEXT,
    admin_id UUID,
    parent_department_id UUID REFERENCES departments(id),
    settings JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (main user profiles)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'department_admin', 'institution_admin', 'system_admin')),
    first_name TEXT,
    last_name TEXT,
    institution_id UUID REFERENCES institutions(id),
    department_id UUID REFERENCES departments(id),
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint for departments admin_id after users table exists (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_departments_admin' 
        AND table_name = 'departments'
    ) THEN
        ALTER TABLE departments ADD CONSTRAINT fk_departments_admin 
            FOREIGN KEY (admin_id) REFERENCES users(id);
    END IF;
END $$;

-- Add foreign key constraint for institutions created_by after users table exists (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_institutions_created_by' 
        AND table_name = 'institutions'
    ) THEN
        ALTER TABLE institutions ADD CONSTRAINT fk_institutions_created_by 
            FOREIGN KEY (created_by) REFERENCES users(id);
    END IF;
END $$;

-- Onboarding sessions table
CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_step INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL DEFAULT 5,
    data JSONB NOT NULL DEFAULT '{
        "userId": "",
        "role": "student",
        "currentStep": 0,
        "skippedSteps": []
    }',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding step events (for analytics)
CREATE TABLE IF NOT EXISTS public.onboarding_step_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
    step_name TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('started', 'completed', 'skipped', 'abandoned')),
    event_data JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding analytics (aggregated data)
CREATE TABLE IF NOT EXISTS public.onboarding_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    role TEXT,
    institution_id UUID REFERENCES institutions(id),
    total_started INTEGER DEFAULT 0,
    total_completed INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    average_completion_time INTEGER DEFAULT 0, -- in minutes
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classes table (for the education system)
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    teacher_id UUID NOT NULL REFERENCES users(id),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    department_id UUID REFERENCES departments(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Class enrollments table
CREATE TABLE IF NOT EXISTS public.class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'assistant')),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dropped')),
    UNIQUE(class_id, user_id)
);

-- =====================================================
-- 2. INDEXES FOR PERFORMANCE
-- =====================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON users(onboarding_completed);

-- Institutions table indexes
CREATE INDEX IF NOT EXISTS idx_institutions_domain ON institutions(domain);
CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions(status);
CREATE INDEX IF NOT EXISTS idx_institutions_type ON institutions(type);

-- Departments table indexes
CREATE INDEX IF NOT EXISTS idx_departments_institution ON departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);

-- Onboarding sessions indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_completed ON onboarding_sessions(completed_at);

-- Onboarding events indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_events_session ON onboarding_step_events(session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_timestamp ON onboarding_step_events(timestamp);

-- Classes indexes
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_institution ON classes(institution_id);
CREATE INDEX IF NOT EXISTS idx_classes_code ON classes(code);

-- Class enrollments indexes
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON class_enrollments(user_id);

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables (safe to run multiple times)
DO $$ 
BEGIN
    -- Enable RLS on tables if they exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'institutions') THEN
        ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'departments') THEN
        ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_sessions') THEN
        ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_step_events') THEN
        ALTER TABLE onboarding_step_events ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_analytics') THEN
        ALTER TABLE onboarding_analytics ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'classes') THEN
        ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_enrollments') THEN
        ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Users policies (drop and recreate to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "System can insert users" ON users;

CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "System can insert users" ON users
    FOR INSERT WITH CHECK (true);

-- Institutions policies (drop and recreate to avoid conflicts)
DROP POLICY IF EXISTS "Anyone can view active institutions" ON institutions;
DROP POLICY IF EXISTS "Institution admins can manage their institution" ON institutions;

CREATE POLICY "Anyone can view active institutions" ON institutions
    FOR SELECT USING (status = 'active');

CREATE POLICY "Institution admins can manage their institution" ON institutions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.institution_id = institutions.id 
            AND users.role IN ('institution_admin', 'system_admin')
        )
    );

-- Departments policies
CREATE POLICY "Anyone can view active departments" ON departments
    FOR SELECT USING (status = 'active');

CREATE POLICY "Department admins can manage their department" ON departments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND (
                users.department_id = departments.id 
                OR users.institution_id = departments.institution_id
            )
            AND users.role IN ('department_admin', 'institution_admin', 'system_admin')
        )
    );

-- Onboarding sessions policies
CREATE POLICY "Users can manage own onboarding" ON onboarding_sessions
    FOR ALL USING (auth.uid() = user_id);

-- Onboarding events policies
CREATE POLICY "Users can manage own onboarding events" ON onboarding_step_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM onboarding_sessions 
            WHERE onboarding_sessions.id = onboarding_step_events.session_id 
            AND onboarding_sessions.user_id = auth.uid()
        )
    );

-- Classes policies
CREATE POLICY "Users can view classes they're enrolled in" ON classes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM class_enrollments 
            WHERE class_enrollments.class_id = classes.id 
            AND class_enrollments.user_id = auth.uid()
        ) OR teacher_id = auth.uid()
    );

CREATE POLICY "Teachers can manage their classes" ON classes
    FOR ALL USING (teacher_id = auth.uid());

-- Class enrollments policies
CREATE POLICY "Users can view their enrollments" ON class_enrollments
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Teachers can manage enrollments in their classes" ON class_enrollments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM classes 
            WHERE classes.id = class_enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );

-- =====================================================
-- 4. TRIGGERS AND FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_institutions_updated_at') THEN
        CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON institutions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_departments_updated_at') THEN
        CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_classes_updated_at') THEN
        CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Function to create user profile when auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile (replace if exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update last_activity in onboarding sessions
CREATE OR REPLACE FUNCTION update_onboarding_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create onboarding activity trigger (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_onboarding_sessions_activity') THEN
        CREATE TRIGGER update_onboarding_sessions_activity BEFORE UPDATE ON onboarding_sessions
            FOR EACH ROW EXECUTE FUNCTION update_onboarding_activity();
    END IF;
END $$;

-- =====================================================
-- 5. SEED DATA
-- =====================================================

-- Insert sample institutions
INSERT INTO institutions (name, domain, type, status, contact_email, settings) VALUES
    ('Harvard University', 'harvard.edu', 'university', 'active', 'admin@harvard.edu', '{"allowSelfRegistration": true, "requireEmailVerification": true, "defaultUserRole": "student"}'),
    ('MIT', 'mit.edu', 'university', 'active', 'admin@mit.edu', '{"allowSelfRegistration": true, "requireEmailVerification": true, "defaultUserRole": "student"}'),
    ('Stanford University', 'stanford.edu', 'university', 'active', 'admin@stanford.edu', '{"allowSelfRegistration": true, "requireEmailVerification": true, "defaultUserRole": "student"}'),
    ('UC Berkeley', 'berkeley.edu', 'university', 'active', 'admin@berkeley.edu', '{"allowSelfRegistration": true, "requireEmailVerification": true, "defaultUserRole": "student"}'),
    ('Community College of Denver', 'ccd.edu', 'college', 'active', 'admin@ccd.edu', '{"allowSelfRegistration": true, "requireEmailVerification": false, "defaultUserRole": "student"}'),
    ('Lincoln High School', 'lincolnhs.edu', 'school', 'active', 'admin@lincolnhs.edu', '{"allowSelfRegistration": false, "requireEmailVerification": true, "defaultUserRole": "student"}')
ON CONFLICT (id) DO NOTHING;

-- Insert sample departments for each institution
INSERT INTO departments (institution_id, name, description, code, status) 
SELECT 
    i.id,
    dept.name,
    dept.description,
    dept.code,
    'active'
FROM institutions i
CROSS JOIN (
    VALUES 
        ('Computer Science', 'Department of Computer Science and Engineering', 'CS'),
        ('Mathematics', 'Department of Mathematics', 'MATH'),
        ('Physics', 'Department of Physics', 'PHYS'),
        ('Chemistry', 'Department of Chemistry', 'CHEM'),
        ('Biology', 'Department of Biology', 'BIO'),
        ('English', 'Department of English Literature', 'ENG'),
        ('History', 'Department of History', 'HIST'),
        ('Psychology', 'Department of Psychology', 'PSYC'),
        ('Economics', 'Department of Economics', 'ECON'),
        ('Business Administration', 'School of Business Administration', 'BUS')
) AS dept(name, description, code)
WHERE i.type IN ('university', 'college')
ON CONFLICT DO NOTHING;

-- Insert basic departments for high schools
INSERT INTO departments (institution_id, name, description, code, status)
SELECT 
    i.id,
    dept.name,
    dept.description,
    dept.code,
    'active'
FROM institutions i
CROSS JOIN (
    VALUES 
        ('Mathematics', 'Mathematics Department', 'MATH'),
        ('Science', 'Science Department', 'SCI'),
        ('English', 'English Department', 'ENG'),
        ('Social Studies', 'Social Studies Department', 'SS'),
        ('Arts', 'Arts Department', 'ART'),
        ('Physical Education', 'Physical Education Department', 'PE')
) AS dept(name, description, code)
WHERE i.type = 'school'
ON CONFLICT DO NOTHING;

-- =====================================================
-- 6. UTILITY FUNCTIONS
-- =====================================================

-- Function to search institutions
CREATE OR REPLACE FUNCTION search_institutions(search_query TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    domain TEXT,
    type TEXT,
    department_count BIGINT,
    user_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.name,
        i.domain,
        i.type,
        COUNT(DISTINCT d.id) as department_count,
        COUNT(DISTINCT u.id) as user_count
    FROM institutions i
    LEFT JOIN departments d ON i.id = d.institution_id
    LEFT JOIN users u ON i.id = u.institution_id
    WHERE 
        i.status = 'active' 
        AND (
            i.name ILIKE '%' || search_query || '%' 
            OR i.domain ILIKE '%' || search_query || '%'
        )
    GROUP BY i.id, i.name, i.domain, i.type
    ORDER BY i.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get departments by institution
CREATE OR REPLACE FUNCTION get_departments_by_institution(institution_uuid UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    code TEXT,
    description TEXT,
    user_count BIGINT,
    admin_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        d.code,
        d.description,
        COUNT(DISTINCT u.id) as user_count,
        COALESCE(admin.first_name || ' ' || admin.last_name, '') as admin_name
    FROM departments d
    LEFT JOIN users u ON d.id = u.department_id
    LEFT JOIN users admin ON d.admin_id = admin.id
    WHERE 
        d.institution_id = institution_uuid 
        AND d.status = 'active'
    GROUP BY d.id, d.name, d.code, d.description, admin.first_name, admin.last_name
    ORDER BY d.name;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant permissions to anon users for public data
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON institutions TO anon;
GRANT SELECT ON departments TO anon;
GRANT EXECUTE ON FUNCTION search_institutions(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_departments_by_institution(UUID) TO anon;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================

-- Verify the setup
DO $$
BEGIN
    RAISE NOTICE 'Database setup completed successfully!';
    RAISE NOTICE 'Tables created: users, institutions, departments, onboarding_sessions, onboarding_step_events, onboarding_analytics, classes, class_enrollments';
    RAISE NOTICE 'RLS policies enabled and configured';
    RAISE NOTICE 'Triggers and functions created';
    RAISE NOTICE 'Sample data inserted';
    RAISE NOTICE 'You can now test your onboarding system!';
END $$;