-- Test minimal user registration to isolate the issue
-- This will help identify if the problem is with the trigger or auth system

-- 1. First, let's see what happens when we try to create a user manually
-- Check current auth.users structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND table_schema = 'auth'
ORDER BY ordinal_position;

-- 2. Check if there are any existing users in auth.users
SELECT count(*) as auth_users_count FROM auth.users;

-- 3. Check if there are any existing users in public.users
SELECT count(*) as public_users_count FROM public.users;

-- 4. Test the trigger function directly
-- Create a test user in auth.users to see if trigger fires
INSERT INTO auth.users (
    id, 
    email, 
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    instance_id,
    aud,
    role
) VALUES (
    gen_random_uuid(),
    'test-trigger@example.com',
    crypt('testpassword', gen_salt('bf')),
    NOW(),
    '{"first_name": "Test", "last_name": "Trigger", "role": "student"}'::jsonb,
    NOW(),
    NOW(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated'
);

-- 5. Check if the test user was created in public.users
SELECT * FROM public.users WHERE email = 'test-trigger@example.com';
