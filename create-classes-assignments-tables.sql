-- Complete database schema for classes, assignments, and related tables
-- Run this in your Supabase SQL Editor

-- Create classes table with unique class codes
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    code TEXT UNIQUE NOT NULL,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id),
    department_id UUID REFERENCES departments(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    enrollment_count INTEGER DEFAULT 0,
    max_enrollment INTEGER,
    semester TEXT,
    schedule TEXT,
    location TEXT,
    credits INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create assignments table with proper structure
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    due_date TIMESTAMPTZ,
    points_possible INTEGER DEFAULT 100,
    assignment_type TEXT DEFAULT 'assignment',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
    instructions TEXT,
    rubric JSONB DEFAULT '{}',
    allow_late_submissions BOOLEAN DEFAULT true,
    late_penalty_percent DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create submissions table for student work
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'graded', 'returned')),
    grade DECIMAL(5,2),
    feedback TEXT,
    graded_at TIMESTAMPTZ,
    graded_by UUID REFERENCES auth.users(id),
    is_late BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assignment_id, student_id)
);

-- Create enrollments table for class membership
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dropped', 'completed')),
    final_grade DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, student_id)
);

-- Create class_enrollments table for backward compatibility
CREATE TABLE IF NOT EXISTS public.class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dropped', 'completed')),
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'assistant')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, user_id)
);

-- Create user_profiles table for extended user information
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'institution_admin')),
    institution_id UUID REFERENCES institutions(id),
    department_id UUID REFERENCES departments(id),
    student_id TEXT,
    phone TEXT,
    bio TEXT,
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for classes
CREATE POLICY "Teachers can manage their own classes" ON public.classes
    FOR ALL USING (auth.uid() = teacher_id);

CREATE POLICY "Students can view enrolled classes" ON public.classes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM enrollments 
            WHERE class_id = classes.id 
            AND student_id = auth.uid() 
            AND status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM class_enrollments 
            WHERE class_id = classes.id 
            AND user_id = auth.uid() 
            AND status = 'active'
        )
    );

-- RLS Policies for assignments
CREATE POLICY "Teachers can manage their own assignments" ON public.assignments
    FOR ALL USING (auth.uid() = teacher_id);

CREATE POLICY "Students can view assignments from enrolled classes" ON public.assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM enrollments e
            JOIN classes c ON c.id = e.class_id
            WHERE c.id = assignments.class_id
            AND e.student_id = auth.uid()
            AND e.status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM class_enrollments ce
            JOIN classes c ON c.id = ce.class_id
            WHERE c.id = assignments.class_id
            AND ce.user_id = auth.uid()
            AND ce.status = 'active'
        )
    );

-- RLS Policies for submissions
CREATE POLICY "Students can manage their own submissions" ON public.submissions
    FOR ALL USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view submissions for their assignments" ON public.submissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM assignments a
            WHERE a.id = submissions.assignment_id
            AND a.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Teachers can update grades for their assignments" ON public.submissions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM assignments a
            WHERE a.id = submissions.assignment_id
            AND a.teacher_id = auth.uid()
        )
    );

-- RLS Policies for enrollments
CREATE POLICY "Students can view their own enrollments" ON public.enrollments
    FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view enrollments for their classes" ON public.enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM classes c
            WHERE c.id = enrollments.class_id
            AND c.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Students can enroll themselves" ON public.enrollments
    FOR INSERT WITH CHECK (auth.uid() = student_id);

-- RLS Policies for class_enrollments (backward compatibility)
CREATE POLICY "Users can view their own class enrollments" ON public.class_enrollments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view enrollments for their classes" ON public.class_enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM classes c
            WHERE c.id = class_enrollments.class_id
            AND c.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Users can enroll themselves" ON public.class_enrollments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_profiles
CREATE POLICY "Users can view and update their own profile" ON public.user_profiles
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view student profiles in their classes" ON public.user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM enrollments e
            JOIN classes c ON c.id = e.class_id
            WHERE e.student_id = user_profiles.user_id
            AND c.teacher_id = auth.uid()
            AND e.status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM class_enrollments ce
            JOIN classes c ON c.id = ce.class_id
            WHERE ce.user_id = user_profiles.user_id
            AND c.teacher_id = auth.uid()
            AND ce.status = 'active'
        )
    );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_code ON public.classes(code);
CREATE INDEX IF NOT EXISTS idx_classes_institution_id ON public.classes(institution_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON public.assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON public.assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON public.assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id ON public.class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_user_id ON public.class_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- Create triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_enrollments_updated_at BEFORE UPDATE ON public.class_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically populate user_profiles from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create user profile
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert a default institution if it doesn't exist (for foreign key references)
INSERT INTO public.institutions (name, domain, status) 
VALUES ('Default Institution', 'example.com', 'active')
ON CONFLICT DO NOTHING;

-- Migrate existing users to user_profiles if they don't exist
INSERT INTO public.user_profiles (user_id, email, first_name, last_name)
SELECT 
    id,
    email,
    COALESCE(raw_user_meta_data->>'first_name', ''),
    COALESCE(raw_user_meta_data->>'last_name', '')
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_profiles)
ON CONFLICT (user_id) DO NOTHING;