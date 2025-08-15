-- Fix assignments table by adding missing columns
-- This adds commonly expected columns to the assignments table

-- Check current structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'assignments' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add points_possible column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assignments' 
        AND column_name = 'points_possible'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN points_possible INTEGER DEFAULT 100;
        RAISE NOTICE 'Added points_possible column';
    END IF;
    
    -- Add teacher_id column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assignments' 
        AND column_name = 'teacher_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN teacher_id UUID REFERENCES auth.users(id);
        RAISE NOTICE 'Added teacher_id column';
    END IF;
    
    -- Add created_at column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assignments' 
        AND column_name = 'created_at'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added created_at column';
    END IF;
    
    -- Add updated_at column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assignments' 
        AND column_name = 'updated_at'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column';
    END IF;
END $$;

-- Show final structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'assignments' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT 'Assignments table updated successfully!' as result;