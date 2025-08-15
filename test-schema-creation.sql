-- Test script to verify schema creation
-- Run this after running create-classes-assignments-tables-safe.sql

-- Check if all tables were created
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'institutions',
    'departments', 
    'user_profiles',
    'classes',
    'assignments',
    'submissions',
    'enrollments',
    'class_enrollments'
)
ORDER BY table_name;

-- Check if RLS is enabled on all tables
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN (
    'institutions',
    'departments',
    'user_profiles', 
    'classes',
    'assignments',
    'submissions',
    'enrollments',
    'class_enrollments'
)
ORDER BY tablename;

-- Check if indexes were created
SELECT 
    indexname,
    tablename
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN (
    'institutions',
    'departments',
    'user_profiles',
    'classes', 
    'assignments',
    'submissions',
    'enrollments',
    'class_enrollments'
)
ORDER BY tablename, indexname;

-- Check if triggers were created
SELECT 
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN (
    'institutions',
    'departments',
    'user_profiles',
    'classes',
    'assignments', 
    'submissions',
    'enrollments',
    'class_enrollments'
)
ORDER BY event_object_table, trigger_name;

-- Test basic functionality by checking if we can query tables
SELECT 'institutions' as table_name, count(*) as row_count FROM institutions
UNION ALL
SELECT 'departments', count(*) FROM departments  
UNION ALL
SELECT 'user_profiles', count(*) FROM user_profiles
UNION ALL
SELECT 'classes', count(*) FROM classes
UNION ALL
SELECT 'assignments', count(*) FROM assignments
UNION ALL
SELECT 'submissions', count(*) FROM submissions
UNION ALL
SELECT 'enrollments', count(*) FROM enrollments
UNION ALL
SELECT 'class_enrollments', count(*) FROM class_enrollments;