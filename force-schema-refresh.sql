-- Force complete schema refresh in Supabase
-- Run this in your Supabase SQL Editor

-- First, let's verify the current table structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name IN ('classes', 'assignments', 'users')
ORDER BY table_name, ordinal_position;

-- Force PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';

-- Alternative method - restart PostgREST by updating a setting
-- This forces Supabase to restart the API layer
UPDATE pg_settings 
SET setting = setting 
WHERE name = 'shared_preload_libraries';

-- Verify classes table structure specifically
\d public.classes;

-- Show all constraints on classes table
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'classes' 
    AND tc.table_schema = 'public';