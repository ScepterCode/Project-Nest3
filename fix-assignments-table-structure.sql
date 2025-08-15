-- Fix assignments table structure to match React component expectations
-- Run this in your Supabase SQL Editor

-- First, check if assignments table exists and create it if it doesn't
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    due_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    points_possible INTEGER DEFAULT 100,  -- Changed from 'points' to 'points_possible'
    instructions TEXT,
    rubric JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- If the table exists but has wrong column names, let's fix it
DO $$
BEGIN
    -- Check if 'points' column exists and rename it to 'points_possible'
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assignments' 
        AND column_name = 'points'
        AND table_schema = 'public'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assignments' 
        AND column_name = 'points_possible'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.assignments RENAME COLUMN points TO points_possible;
        RAISE NOTICE 'Renamed points column to points_possible';
    END IF;
    
    -- Add points_possible column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assignments' 
        AND column_name = 'points_possible'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN points_possible INTEGER DEFAULT 100;
        RAISE NOTICE 'Added points_possible column';
    END IF;
END $$;

-- Create submissions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'graded', 'returned')),
    grade DECIMAL(5,2),
    feedback TEXT,
    submitted_at TIMESTAMPTZ,
    graded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assignment_id, student_id)
);

-- Create enrollments table if it doesn't exist (using class_enrollments structure)
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dropped')),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, student_id)
);

-- Enable RLS on all tables
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Teachers can view their own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Students can view class assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can create assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can update their own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can delete their own assignments" ON public.assignments;

-- Create policies for assignments
CREATE POLICY "Teachers can view their own assignments" ON public.assignments
    FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Students can view class assignments" ON public.assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.enrollments 
            WHERE enrollments.class_id = assignments.class_id 
            AND enrollments.student_id = auth.uid()
            AND enrollments.status = 'active'
        )
    );

CREATE POLICY "Teachers can create assignments" ON public.assignments
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update their own assignments" ON public.assignments
    FOR UPDATE USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete their own assignments" ON public.assignments
    FOR DELETE USING (auth.uid() = teacher_id);

-- Create policies for submissions
DROP POLICY IF EXISTS "Students can view their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers can view class submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students can create submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students can update their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers can grade submissions" ON public.submissions;

CREATE POLICY "Students can view their own submissions" ON public.submissions
    FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view class submissions" ON public.submissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.id = submissions.assignment_id 
            AND assignments.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Students can create submissions" ON public.submissions
    FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can update their own submissions" ON public.submissions
    FOR UPDATE USING (auth.uid() = student_id AND status IN ('draft', 'submitted'));

CREATE POLICY "Teachers can grade submissions" ON public.submissions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.id = submissions.assignment_id 
            AND assignments.teacher_id = auth.uid()
        )
    );

-- Create policies for enrollments
DROP POLICY IF EXISTS "Students can view their enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can view class enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can manage enrollments" ON public.enrollments;

CREATE POLICY "Students can view their enrollments" ON public.enrollments
    FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view class enrollments" ON public.enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classes 
            WHERE classes.id = enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Teachers can manage enrollments" ON public.enrollments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.classes 
            WHERE classes.id = enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON public.assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON public.assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON public.assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);

-- Insert some sample data for testing (optional)
-- You can uncomment this if you want test data

/*
-- Insert sample assignments (only if user is a teacher)
INSERT INTO public.assignments (title, description, class_id, teacher_id, due_date, status, points_possible)
SELECT 
    'Sample Assignment 1',
    'This is a sample assignment for testing purposes.',
    c.id,
    c.teacher_id,
    NOW() + INTERVAL '7 days',
    'published',
    100
FROM public.classes c
WHERE c.teacher_id IS NOT NULL
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assignments (title, description, class_id, teacher_id, due_date, status, points_possible)
SELECT 
    'Sample Assignment 2',
    'Another sample assignment with different due date.',
    c.id,
    c.teacher_id,
    NOW() + INTERVAL '14 days',
    'published',
    150
FROM public.classes c
WHERE c.teacher_id IS NOT NULL
LIMIT 1
ON CONFLICT DO NOTHING;
*/

SELECT 'Assignments table structure fixed successfully!' as result;