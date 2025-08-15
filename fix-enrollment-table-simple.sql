-- Simple fix for enrollment table inconsistency
-- This creates the enrollments table that the code expects

-- Create enrollments table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'dropped', 'completed', 'pending')),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
    -- Add class_id foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_class_id_fkey' 
        AND table_name = 'enrollments'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
    END IF;
    
    -- Add student_id foreign key
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

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);

-- Create unique constraint to prevent duplicate enrollments
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON public.enrollments(class_id, student_id);

-- Enable RLS
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Students can view their own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can view enrollments in their classes" ON public.enrollments;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Students can update their own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can manage enrollments in their classes" ON public.enrollments;

-- Create RLS policies
CREATE POLICY "Students can view their own enrollments" ON public.enrollments
    FOR SELECT USING (student_id = auth.uid());
    
CREATE POLICY "Teachers can view enrollments in their classes" ON public.enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classes 
            WHERE classes.id = enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );
    
CREATE POLICY "Students can enroll themselves" ON public.enrollments
    FOR INSERT WITH CHECK (student_id = auth.uid());
    
CREATE POLICY "Students can update their own enrollments" ON public.enrollments
    FOR UPDATE USING (student_id = auth.uid());
    
CREATE POLICY "Teachers can manage enrollments in their classes" ON public.enrollments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.classes 
            WHERE classes.id = enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );

-- Create function to update enrollment counts
CREATE OR REPLACE FUNCTION update_class_enrollment_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update enrollment count for the affected class
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
        -- Update count for both old and new class if class_id changed
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

-- Create trigger to automatically update enrollment counts
DROP TRIGGER IF EXISTS trigger_update_enrollment_count ON public.enrollments;
CREATE TRIGGER trigger_update_enrollment_count
    AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION update_class_enrollment_count();

-- Verify the setup
SELECT 'Enrollments table created successfully' as status;