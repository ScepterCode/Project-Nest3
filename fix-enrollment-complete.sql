-- Complete fix for enrollment system
-- This creates the enrollments table and sets up proper RLS policies

-- Step 1: Create enrollments table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'dropped', 'completed', 'pending')),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT enrollments_unique_student_class UNIQUE (class_id, student_id)
);

-- Step 2: Add foreign key constraints if they don't exist
DO $$
BEGIN
    -- Add foreign key to classes table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_class_id_fkey' 
        AND table_name = 'enrollments'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
    END IF;
    
    -- Add foreign key to users table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_student_id_fkey' 
        AND table_name = 'enrollments'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);

-- Step 4: Enable RLS
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Students can view their own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can view enrollments in their classes" ON public.enrollments;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Students can update their own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can manage enrollments in their classes" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_select_own" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_insert_own" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_select_teacher" ON public.enrollments;

-- Step 6: Create comprehensive RLS policies
-- Allow students to see their own enrollments
CREATE POLICY "students_can_view_own_enrollments" ON public.enrollments
    FOR SELECT USING (student_id = auth.uid());

-- Allow students to create their own enrollments (join classes)
CREATE POLICY "students_can_create_own_enrollments" ON public.enrollments
    FOR INSERT WITH CHECK (student_id = auth.uid());

-- Allow students to update their own enrollments (drop classes)
CREATE POLICY "students_can_update_own_enrollments" ON public.enrollments
    FOR UPDATE USING (student_id = auth.uid());

-- Allow teachers to view enrollments in their classes
CREATE POLICY "teachers_can_view_class_enrollments" ON public.enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classes 
            WHERE classes.id = enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );

-- Allow teachers to manage enrollments in their classes
CREATE POLICY "teachers_can_manage_class_enrollments" ON public.enrollments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.classes 
            WHERE classes.id = enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );

-- Step 7: Create trigger to update enrollment counts
CREATE OR REPLACE FUNCTION update_class_enrollment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.classes 
        SET enrollment_count = (
            SELECT COUNT(*) 
            FROM public.enrollments 
            WHERE class_id = NEW.class_id 
            AND status = 'enrolled'
        )
        WHERE id = NEW.class_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.classes 
        SET enrollment_count = (
            SELECT COUNT(*) 
            FROM public.enrollments 
            WHERE class_id = NEW.class_id 
            AND status = 'enrolled'
        )
        WHERE id = NEW.class_id;
        
        IF OLD.class_id != NEW.class_id THEN
            UPDATE public.classes 
            SET enrollment_count = (
                SELECT COUNT(*) 
                FROM public.enrollments 
                WHERE class_id = OLD.class_id 
                AND status = 'enrolled'
            )
            WHERE id = OLD.class_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.classes 
        SET enrollment_count = (
            SELECT COUNT(*) 
            FROM public.enrollments 
            WHERE class_id = OLD.class_id 
            AND status = 'enrolled'
        )
        WHERE id = OLD.class_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_enrollment_count ON public.enrollments;
CREATE TRIGGER trigger_update_enrollment_count
    AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION update_class_enrollment_count();

-- Step 8: Verify the setup
SELECT 'Enrollment system setup complete!' as result;

-- Show the created policies
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'enrollments';