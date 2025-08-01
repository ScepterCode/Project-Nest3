-- Debug and fix database errors
-- Run this in your Supabase SQL Editor to diagnose issues

-- 1. Check if all required tables exist
SELECT 
    'Table Check' as check_type,
    table_name,
    CASE 
        WHEN table_name IS NOT NULL THEN 'EXISTS' 
        ELSE 'MISSING' 
    END as status
FROM (
    VALUES 
        ('users'),
        ('classes'), 
        ('assignments'),
        ('submissions'),
        ('enrollments'),
        ('institutions'),
        ('departments')
) AS required_tables(table_name)
LEFT JOIN information_schema.tables t 
    ON t.table_name = required_tables.table_name 
    AND t.table_schema = 'public'
ORDER BY required_tables.table_name;

-- 2. Check RLS policies on users table
SELECT 
    'RLS Policy Check' as check_type,
    policyname,
    cmd,
    permissive,
    CASE 
        WHEN qual IS NOT NULL THEN qual 
        ELSE 'No USING clause' 
    END as using_clause,
    CASE 
        WHEN with_check IS NOT NULL THEN with_check 
        ELSE 'No WITH CHECK clause' 
    END as with_check_clause
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public'
ORDER BY policyname;

-- 3. Check if RLS is enabled on critical tables
SELECT 
    'RLS Status Check' as check_type,
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('users', 'classes', 'assignments')
ORDER BY tablename;

-- 4. Test if current user can access users table
DO $$
BEGIN
    -- Try to select from users table
    PERFORM COUNT(*) FROM public.users LIMIT 1;
    RAISE NOTICE 'SUCCESS: Can read from users table';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR reading users table: %', SQLERRM;
END $$;

-- 5. Check assignments table structure
SELECT 
    'Assignments Table Structure' as check_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'assignments'
ORDER BY ordinal_position;

-- 6. Force schema refresh
NOTIFY pgrst, 'reload schema';

-- 7. Show current user context (if any)
SELECT 
    'Current User Context' as check_type,
    current_user as postgres_user,
    session_user,
    current_database();