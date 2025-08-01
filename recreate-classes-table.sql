-- Completely recreate the classes table to fix schema cache issues
-- Run this in your Supabase SQL Editor

-- Step 1: Drop the classes table completely (this will cascade to assignments)
DROP TABLE IF EXISTS public.assignments CASCADE;
DROP TABLE IF EXISTS public.classes CASCADE;

-- Step 2: Recreate classes table with exact structure
CREATE TABLE public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    code TEXT,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id),
    department_id UUID REFERENCES departments(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    enrollment_count INTEGER DEFAULT 0,
    max_enrollment INTEGER,
    semester TEXT,
    schedule TEXT,
    location TEXT,
    credits INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Recreate assignments table
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    due_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    submission_count INTEGER DEFAULT 0,
    total_students INTEGER DEFAULT 0,
    points INTEGER DEFAULT 100,
    instructions TEXT,
    rubric JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Enable RLS
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Step 5: Recreate policies
CREATE POLICY "Teachers can view their own classes" ON public.classes
    FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can create classes" ON public.classes
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update their own classes" ON public.classes
    FOR UPDATE USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete their own classes" ON public.classes
    FOR DELETE USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can view their own assignments" ON public.assignments
    FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can create assignments" ON public.assignments
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update their own assignments" ON public.assignments
    FOR UPDATE USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete their own assignments" ON public.assignments
    FOR DELETE USING (auth.uid() = teacher_id);

-- Step 6: Create indexes
CREATE INDEX idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX idx_classes_institution_id ON public.classes(institution_id);
CREATE INDEX idx_assignments_class_id ON public.assignments(class_id);
CREATE INDEX idx_assignments_teacher_id ON public.assignments(teacher_id);

-- Step 7: Force schema refresh
NOTIFY pgrst, 'reload schema';

-- Step 8: Verify the table was created correctly
SELECT 'Classes table recreated successfully!' as status;

-- Show the exact structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'classes'
ORDER BY ordinal_position;