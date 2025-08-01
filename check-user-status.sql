-- Check current user status
-- Run this in Supabase SQL Editor to see what's missing

-- 1. Check if your user exists in auth.users
SELECT 'AUTH USERS:' as table_name, id, email, created_at 
FROM auth.users 
WHERE email = 'scepterboss@gmail.com';

-- 2. Check if your user exists in public.users
SELECT 'PUBLIC USERS:' as table_name, id, email, role, onboarding_completed 
FROM public.users 
WHERE email = 'scepterboss@gmail.com';

-- 3. Check what tables exist
SELECT 'AVAILABLE TABLES:' as info, table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'institutions', 'departments', 'onboarding_sessions')
ORDER BY table_name;