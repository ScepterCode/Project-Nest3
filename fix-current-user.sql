-- Quick fix to create the users table and add your current user
-- Execute this in Supabase SQL Editor if you want to test immediately

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    first_name TEXT,
    last_name TEXT,
    institution_id UUID,
    department_id UUID,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint to auth.users
ALTER TABLE users ADD CONSTRAINT users_id_fkey 
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create basic policies
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "System can insert users" ON users
    FOR INSERT WITH CHECK (true);

-- Insert your current user (replace with actual user ID from auth.users)
-- You can find your user ID by running: SELECT id, email FROM auth.users;
INSERT INTO public.users (id, email, role, onboarding_completed)
SELECT id, email, 'student', false
FROM auth.users 
WHERE email = 'scepterboss@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- Verify the user was created
SELECT id, email, role, onboarding_completed FROM users WHERE email = 'scepterboss@gmail.com';