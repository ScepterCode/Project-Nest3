-- Fix classes table to add UNIQUE constraint on code column
-- This is needed for the class code generation to work properly

-- First, check if the classes table exists
DO $$
BEGIN
    -- Add the code column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'classes' AND column_name = 'code'
    ) THEN
        ALTER TABLE public.classes ADD COLUMN code TEXT;
        RAISE NOTICE 'Added code column to classes table';
    END IF;
    
    -- Add UNIQUE constraint on code if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'classes' AND constraint_type = 'UNIQUE' 
        AND constraint_name LIKE '%code%'
    ) THEN
        -- First, update any NULL codes with temporary unique values
        UPDATE public.classes 
        SET code = 'TEMP' || id::text 
        WHERE code IS NULL;
        
        -- Make code NOT NULL
        ALTER TABLE public.classes ALTER COLUMN code SET NOT NULL;
        
        -- Add UNIQUE constraint
        ALTER TABLE public.classes ADD CONSTRAINT classes_code_unique UNIQUE (code);
        
        RAISE NOTICE 'Added UNIQUE constraint on classes.code column';
    END IF;
    
    -- Create index on code for faster lookups if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'classes' AND indexname = 'idx_classes_code'
    ) THEN
        CREATE INDEX idx_classes_code ON public.classes(code);
        RAISE NOTICE 'Created index on classes.code column';
    END IF;
    
END $$;

-- Verify the changes
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'classes' AND column_name = 'code';

-- Check constraints
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'classes' AND constraint_type = 'UNIQUE';

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'classes' AND indexname LIKE '%code%';