-- Simple check of enrollments table structure and constraints

-- Check if table exists
SELECT 'Checking enrollments table...' as step;

-- Show table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'enrollments' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Show all constraints
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'enrollments' 
AND table_schema = 'public';

-- Show RLS policies
SELECT 
    policyname,
    cmd
FROM pg_policies 
WHERE tablename = 'enrollments';

-- Show any existing data
SELECT COUNT(*) as enrollment_count FROM public.enrollments;