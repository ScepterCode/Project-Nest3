-- Minimal enrollments table creation
-- Run this if you just need the basic table structure

-- Create the enrollments table
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'enrolled',
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, student_id)
);

-- Create basic indexes
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);

-- Enable RLS and create basic policies
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Allow students to see their own enrollments
CREATE POLICY "enrollments_select_own" ON public.enrollments
    FOR SELECT USING (student_id = auth.uid());

-- Allow students to insert their own enrollments
CREATE POLICY "enrollments_insert_own" ON public.enrollments
    FOR INSERT WITH CHECK (student_id = auth.uid());

-- Allow teachers to see enrollments in their classes
CREATE POLICY "enrollments_select_teacher" ON public.enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classes 
            WHERE classes.id = enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );

SELECT 'Enrollments table created with basic structure' as result;