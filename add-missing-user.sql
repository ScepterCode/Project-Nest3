-- Add your current authenticated user to the users table
-- Run this in Supabase SQL Editor

-- Insert your current user into the public.users table
INSERT INTO public.users (id, email, role, onboarding_completed, first_name, last_name, created_at)
SELECT 
    au.id,
    au.email,
    'student' as role,  -- Default role, will be updated during onboarding
    false as onboarding_completed,
    COALESCE(au.raw_user_meta_data->>'first_name', '') as first_name,
    COALESCE(au.raw_user_meta_data->>'last_name', '') as last_name,
    au.created_at
FROM auth.users au
WHERE au.email = 'scepterboss@gmail.com'
AND NOT EXISTS (
    SELECT 1 FROM public.users pu WHERE pu.id = au.id
);

-- Verify the user was added
SELECT 'VERIFICATION:' as status, id, email, role, onboarding_completed, created_at
FROM public.users 
WHERE email = 'scepterboss@gmail.com';