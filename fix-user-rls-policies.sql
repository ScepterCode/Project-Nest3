-- Fix RLS policies for users table to allow onboarding
-- Run this in your Supabase SQL Editor

-- Add missing INSERT policy for users (needed for onboarding)
CREATE POLICY "Users can insert their own profile during onboarding" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Also add a policy to allow the trigger function to work
-- This allows the system to create user profiles automatically
CREATE POLICY "System can create user profiles" ON public.users
    FOR INSERT WITH CHECK (true);

-- Update the existing policies to be more permissive for onboarding
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Force schema refresh
NOTIFY pgrst, 'reload schema';

-- Verify the policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'users' 
ORDER BY policyname;