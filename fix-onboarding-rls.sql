-- Fix RLS policies to allow onboarding to work properly
-- Run this in your Supabase SQL Editor

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile during onboarding" ON public.users;
DROP POLICY IF EXISTS "System can create user profiles" ON public.users;

-- Create comprehensive policies that allow onboarding
-- Allow users to view their own profile
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Allow users to insert their own profile (needed for upsert during onboarding)
CREATE POLICY "Users can insert their own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile (needed for upsert during onboarding)
CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Allow the trigger function to create profiles automatically
-- This is needed for the handle_new_user() trigger
CREATE POLICY "System can manage user profiles" ON public.users
    FOR ALL USING (true) WITH CHECK (true);

-- Force schema refresh
NOTIFY pgrst, 'reload schema';

-- Test the policies by checking what exists
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    cmd,
    CASE 
        WHEN qual IS NOT NULL THEN 'USING: ' || qual 
        ELSE 'No USING clause' 
    END as using_clause,
    CASE 
        WHEN with_check IS NOT NULL THEN 'WITH CHECK: ' || with_check 
        ELSE 'No WITH CHECK clause' 
    END as with_check_clause
FROM pg_policies 
WHERE tablename = 'users' 
    AND schemaname = 'public'
ORDER BY policyname;