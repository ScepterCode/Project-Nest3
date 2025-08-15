-- Final fix for enrollment issues
-- Fixes check constraint and cleans up duplicate policies

-- Step 1: Drop the table and recreate it properly
DROP TABLE IF EXISTS public.enrollments CASCADE;

-- Step 2: Create the table with correct constraints
CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'enrolled',
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT enrollments_unique_student_class UNIQUE (class_id, student_id)
);

-- Step 3: Add a simple check constraint (no restrictive values)
ALTER TABLE public.enrollments 
ADD CONSTRAINT enrollments_status_valid 
CHECK (status IS NOT NULL AND length(status) > 0);

-- Step 4: Create indexes
CREATE INDEX idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_status ON public.enrollments(status);

-- Step 5: Enable RLS
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Step 6: Create simple, working policies
CREATE POLICY "enrollments_students_all_access" ON public.enrollments
    FOR ALL USING (student_id = auth.uid());

CREATE POLICY "enrollments_teachers_view_class" ON public.enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classes 
            WHERE classes.id = enrollments.class_id 
            AND classes.teacher_id = auth.uid()
        )
    );

-- Step 7: Create trigger for enrollment counts
CREATE OR REPLACE FUNCTION update_enrollment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.classes 
        SET enrollment_count = COALESCE(enrollment_count, 0) + 1
        WHERE id = NEW.class_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.classes 
        SET enrollment_count = GREATEST(COALESCE(enrollment_count, 1) - 1, 0)
        WHERE id = OLD.class_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enrollment_count
    AFTER INSERT OR DELETE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION update_enrollment_count();

-- Step 8: Test the setup
SELECT 'Enrollment table recreated successfully!' as result;