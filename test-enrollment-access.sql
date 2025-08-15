-- Test enrollment table access and permissions
-- Run this to verify the enrollment system is working

-- Check if enrollments table exists
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'enrollments' AND table_schema = 'public';

-- Check table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'enrollments' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check foreign key constraints
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'enrollments' AND table_schema = 'public';

-- Check RLS policies
SELECT 
    policyname,
    cmd,
    permissive,
    qual
FROM pg_policies 
WHERE tablename = 'enrollments'
ORDER BY policyname;

-- Check if RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'enrollments' AND schemaname = 'public';

-- Test basic insert (this will show what permissions are needed)
-- Note: This is just a test query, don't actually run the INSERT
SELECT 'Test query - check if you can see this result' as test_result;