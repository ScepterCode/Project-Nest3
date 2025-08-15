-- Minimal schema creation - step by step approach
-- Run each section separately to identify where the error occurs

-- STEP 1: Create basic tables without RLS first
-- =============================================

-- Drop existing tables if they have issues (be careful with this in production)
-- DROP TABLE IF EXISTS public.class_enrollments CASCADE;
-- DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Create institutions table (minimal)
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Default Institution',
    domain TEXT DEFAULT 'example.com',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default institution
INSERT INTO public.institutions (name, domain, status) 
VALUES ('Default Institution', 'example.com', 'active')
ON CONFLICT DO NOTHING;

-- Create user_profiles table (simple version)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'student',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint separately
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_profiles_user_id_fkey'
    ) THEN
        ALTER TABLE public.user_profiles 
        ADD CONSTRAINT user_profiles_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create classes table (simple version)
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    code TEXT UNIQUE NOT NULL,
    teacher_id UUID NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint separately
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'classes_teacher_id_fkey'
    ) THEN
        ALTER TABLE public.classes 
        ADD CONSTRAINT classes_teacher_id_fkey 
        FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create assignments table (simple version)
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    class_id UUID NOT NULL,
    teacher_id UUID NOT NULL,
    due_date TIMESTAMPTZ,
    points_possible INTEGER DEFAULT 100,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraints separately
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'assignments_class_id_fkey'
    ) THEN
        ALTER TABLE public.assignments 
        ADD CONSTRAINT assignments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'assignments_teacher_id_fkey'
    ) THEN
        ALTER TABLE public.assignments 
        ADD CONSTRAINT assignments_teacher_id_fkey 
        FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create submissions table (simple version)
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL,
    student_id UUID NOT NULL,
    content TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'submitted',
    grade DECIMAL(5,2),
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraints separately
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_assignment_id_fkey'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_assignment_id_fkey 
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_student_id_fkey'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create enrollments table (simple version)
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraints separately
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_class_id_fkey'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_student_id_fkey'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create class_enrollments table (backward compatibility)
CREATE TABLE IF NOT EXISTS public.class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL,
    user_id UUID NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    role TEXT DEFAULT 'student',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraints separately
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'class_enrollments_class_id_fkey'
    ) THEN
        ALTER TABLE public.class_enrollments 
        ADD CONSTRAINT class_enrollments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'class_enrollments_user_id_fkey'
    ) THEN
        ALTER TABLE public.class_enrollments 
        ADD CONSTRAINT class_enrollments_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add unique constraints
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_class_student_unique'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_class_student_unique 
        UNIQUE (class_id, student_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'class_enrollments_class_user_unique'
    ) THEN
        ALTER TABLE public.class_enrollments 
        ADD CONSTRAINT class_enrollments_class_user_unique 
        UNIQUE (class_id, user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_assignment_student_unique'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_assignment_student_unique 
        UNIQUE (assignment_id, student_id);
    END IF;
END $$;