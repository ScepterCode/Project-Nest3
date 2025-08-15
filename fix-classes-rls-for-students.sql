-- Fix RLS policies for classes table to allow students to read classes
-- This allows students to find classes by code when joining

-- First, check current policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'classes';

-- Drop existing restrictive policies that might block students
DROP POLICY IF EXISTS "Users can view classes they are enrolled in" ON public.classes;
DROP POLICY IF EXISTS "Teachers can view their own classes" ON public.classes;
DROP POLICY IF EXISTS "Students can view enrolled classes" ON public.classes;

-- Create a policy that allows everyone to read basic class information
-- This is needed for students to find classes by code when joining
CREATE POLICY "Anyone can view active classes for joining" ON public.classes
    FOR SELECT USING (status = 'active');

-- Teachers can still manage their own classes
CREATE POLICY "Teachers can manage their own classes" ON public.classes
    FOR ALL USING (teacher_id = auth.uid());

-- Students can view classes they are enrolled in (for detailed access)
CREATE POLICY "Students can view enrolled classes" ON public.classes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.enrollments 
            WHERE enrollments.class_id = classes.id 
            AND enrollments.student_id = auth.uid()
            AND enrollments.status = 'enrolled'
        )
    );

-- Verify the policies
SELECT 
    policyname,
    cmd,
    permissive,
    qual
FROM pg_policies 
WHERE tablename = 'classes'
ORDER BY policyname;