-- STEP 2: Add RLS policies after tables are created
-- Run this AFTER running minimal-schema-fix.sql successfully

-- Enable RLS on all tables
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Everyone can view institutions" ON public.institutions;
DROP POLICY IF EXISTS "Users can view and update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Teachers can manage their own classes" ON public.classes;
DROP POLICY IF EXISTS "Students can view enrolled classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can manage their own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Students can view assignments from enrolled classes" ON public.assignments;
DROP POLICY IF EXISTS "Students can manage their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers can view submissions for their assignments" ON public.submissions;
DROP POLICY IF EXISTS "Teachers can update grades for their assignments" ON public.submissions;
DROP POLICY IF EXISTS "Students can view their own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can view enrollments for their classes" ON public.enrollments;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Users can view their own class enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Teachers can view class enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Users can enroll in classes" ON public.class_enrollments;

-- Create simple RLS policies for institutions
CREATE POLICY "Everyone can view institutions" ON public.institutions
    FOR SELECT USING (true);

-- Create RLS policies for user_profiles
CREATE POLICY "Users can view and update their own profile" ON public.user_profiles
    FOR ALL USING (auth.uid() = user_id);

-- Create RLS policies for classes
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

-- Create RLS policies for assignments
CREATE POLICY "Teachers can manage their own assignments" ON public.assignments
    FOR ALL USING (auth.uid() = teacher_id);

CREATE POLICY "Students can view assignments from enrolled classes" ON public.assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM enrollments e
            WHERE e.class_id = assignments.class_id
            AND e.student_id = auth.uid()
            AND e.status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM class_enrollments ce
            WHERE ce.class_id = assignments.class_id
            AND ce.user_id = auth.uid()
            AND ce.status = 'active'
        )
    );

-- Create RLS policies for submissions
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

-- Create RLS policies for enrollments
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

-- Create RLS policies for class_enrollments
CREATE POLICY "Users can view their own class enrollments" ON public.class_enrollments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view class enrollments" ON public.class_enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM classes c
            WHERE c.id = class_enrollments.class_id
            AND c.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Users can enroll in classes" ON public.class_enrollments
    FOR INSERT WITH CHECK (auth.uid() = user_id);