-- Check if the database tables exist and have the correct structure
-- Run this in your Supabase SQL Editor to verify setup

-- Check if users table exists and has correct columns
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if institutions table exists
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'institutions' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if departments table exists
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'departments' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if the trigger function exists
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'handle_new_user'
    AND routine_schema = 'public';

-- Check if the trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- Check current users in the system
SELECT 
    id,
    email,
    role,
    onboarding_completed,
    created_at
FROM public.users
ORDER BY created_at DESC
LIMIT 10;