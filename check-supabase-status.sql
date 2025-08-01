-- Check Supabase project status and configuration
-- Run this in your Supabase SQL Editor

-- 1. Check if the database is accessible
SELECT 'Database Status: ONLINE' as status, now() as current_time;

-- 2. Check if PostgREST is working
SELECT 'PostgREST Status: ' || 
  CASE 
    WHEN current_setting('app.settings.jwt_secret', true) IS NOT NULL 
    THEN 'CONFIGURED' 
    ELSE 'NOT CONFIGURED' 
  END as postgrest_status;

-- 3. Check RLS status on critical tables
SELECT 
  'RLS Status Check' as check_type,
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN 'ENABLED' 
    ELSE 'DISABLED' 
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'classes', 'assignments')
ORDER BY tablename;

-- 4. Check if tables exist and are accessible
SELECT 
  'Table Accessibility' as check_type,
  table_name,
  'EXISTS' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 5. Check API permissions
SELECT 
  'API Role Check' as check_type,
  rolname as role_name,
  rolcanlogin as can_login,
  rolsuper as is_superuser
FROM pg_roles 
WHERE rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY rolname;

-- 6. Force schema refresh
NOTIFY pgrst, 'reload schema';
SELECT 'Schema refresh triggered' as message;

-- 7. Check current user context
SELECT 
  'Current Context' as check_type,
  current_user as postgres_user,
  current_database() as database_name,
  inet_server_addr() as server_ip;