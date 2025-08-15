-- Test what's causing the enrollment constraint violation
-- Run this to see what constraints exist on the enrollments table

-- Check all constraints on enrollments table
SELECT 
    constraint_name,
    constraint_type,
    check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
    ON cc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'enrollments';

-- Check the table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'enrollments' 
ORDER BY ordinal_position;

-- Test what values are allowed for status
-- This will show us what the check constraint is expecting
SELECT 'Testing enrollment constraints...' as test_start;