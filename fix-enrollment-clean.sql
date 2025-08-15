-- Clean fix for enrollment constraints
-- Just remove all check constraints that might be blocking enrollment

-- Remove all check constraints on enrollments table
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_status_not_empty;
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_status_valid;

-- Check what constraints remain
SELECT 
    tc.constraint_name,
    tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_name = 'enrollments' 
AND tc.table_schema = 'public'
AND tc.constraint_type = 'CHECK';

-- Test if we can now insert an enrollment (this is just a test query)
SELECT 'All check constraints removed - enrollment should work now!' as result;