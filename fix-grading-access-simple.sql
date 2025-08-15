-- Fix grading access issues with simplified approach

-- Drop and recreate submissions policies for teachers
DROP POLICY IF EXISTS "Teachers can view submissions for their assignments" ON submissions;
DROP POLICY IF EXISTS "Teachers can grade submissions for their assignments" ON submissions;

-- Create comprehensive teacher access policy for submissions
CREATE POLICY "Teachers can access submissions for their assignments" ON submissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM assignments 
            WHERE assignments.id = submissions.assignment_id 
            AND assignments.teacher_id = auth.uid()
        )
    );

-- Ensure assignments table has proper teacher access
DROP POLICY IF EXISTS "Teachers can manage their assignments" ON assignments;
CREATE POLICY "Teachers can manage their assignments" ON assignments
    FOR ALL USING (teacher_id = auth.uid());

-- Grant necessary permissions
GRANT ALL ON assignments TO authenticated;
GRANT ALL ON submissions TO authenticated;
GRANT ALL ON enrollments TO authenticated;
GRANT ALL ON user_profiles TO authenticated;

-- Ensure RLS is enabled
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;