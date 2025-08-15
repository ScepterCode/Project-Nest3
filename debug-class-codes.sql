-- Debug class codes and visibility
-- Run this in Supabase SQL Editor to see what's in the database

-- Check all classes and their codes
SELECT 
    id,
    name,
    code,
    status,
    teacher_id,
    created_at
FROM public.classes
ORDER BY created_at DESC
LIMIT 10;

-- Check if there are any RLS policies blocking access
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'classes';

-- Check if RLS is enabled on classes table
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'classes' AND schemaname = 'public';