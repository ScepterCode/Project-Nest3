-- Simple fix: Allow all authenticated users to read active classes
-- This is the most straightforward solution for class joining

-- Drop all existing policies on classes table
DROP POLICY IF EXISTS "Users can view classes they are enrolled in" ON public.classes;
DROP POLICY IF EXISTS "Teachers can view their own classes" ON public.classes;
DROP POLICY IF EXISTS "Students can view enrolled classes" ON public.classes;
DROP POLICY IF EXISTS "Anyone can view active classes for joining" ON public.classes;
DROP POLICY IF EXISTS "Teachers can manage their own classes" ON public.classes;

-- Create simple policies
-- 1. All authenticated users can read classes (needed for joining)
CREATE POLICY "authenticated_users_can_read_classes" ON public.classes
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. Only teachers can modify their own classes
CREATE POLICY "teachers_can_manage_own_classes" ON public.classes
    FOR ALL USING (teacher_id = auth.uid());

-- 3. Allow class creation by authenticated users (teachers)
CREATE POLICY "authenticated_users_can_create_classes" ON public.classes
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND teacher_id = auth.uid());

-- Verify the setup
SELECT 'Classes table policies updated for student access' as result;