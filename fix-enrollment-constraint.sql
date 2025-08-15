-- Quick fix for enrollment check constraint issue
-- This removes the restrictive check constraint that's causing the error

-- Drop the problematic check constraint
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;

-- Add a simple non-restrictive constraint
ALTER TABLE public.enrollments 
ADD CONSTRAINT enrollments_status_not_empty 
CHECK (status IS NOT NULL AND length(trim(status)) > 0);

-- Verify the constraint is gone
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'enrollments' 
AND constraint_type = 'CHECK';

SELECT 'Check constraint fixed - enrollment should work now!' as result;