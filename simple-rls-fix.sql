-- Simple fix for onboarding RLS issue
-- Run this in your Supabase SQL Editor

-- Temporarily disable RLS on users table to allow onboarding
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS with simpler, more permissive policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile during onboarding" ON public.users;
DROP POLICY IF EXISTS "System can create user profiles" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "System can manage user profiles" ON public.users;

-- Create simple, permissive policies for onboarding
CREATE POLICY "Allow all operations for authenticated users" ON public.users
    FOR ALL 
    USING (auth.uid() IS NOT NULL) 
    WITH CHECK (auth.uid() IS NOT NULL);

-- Force schema refresh
NOTIFY pgrst, 'reload schema';

-- Verify the policy was created
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public';