-- Fix enrollment table naming inconsistency
-- The code expects 'enrollments' but schema defines 'class_enrollments'
-- This script creates the missing 'enrollments' table or creates a view

-- First, check if class_enrollments exists and enrollments doesn't
DO $$
BEGIN
    -- If class_enrollments exists but enrollments doesn't, create enrollments as a view or rename
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_enrollments' AND table_schema = 'public')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enrollments' AND table_schema = 'public') THEN
        
        RAISE NOTICE 'Found class_enrollments table, creating enrollments view...';
        
        -- Create a view that maps class_enrollments to enrollments
        CREATE VIEW public.enrollments AS
        SELECT 
            id,
            class_id,
            user_id as student_id,  -- Map user_id to student_id for consistency
            status,
            enrolled_at,
            created_at,
            updated_at
        FROM public.class_enrollments;
        
        RAISE NOTICE 'Created enrollments view mapping to class_enrollments';
        
    -- If neither exists, create the enrollments table directly
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enrollments' AND table_schema = 'public')
          AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_enrollments' AND table_schema = 'public') THEN
        
        RAISE NOTICE 'Creating enrollments table...';
        
        -- Create enrollments table
        CREATE TABLE public.enrollments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            class_id UUID NOT NULL,
            student_id UUID NOT NULL,
            status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'dropped', 'completed', 'pending')),
            enrolled_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Add foreign key constraints
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
        
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        
        -- Create indexes
        CREATE INDEX idx_enrollments_class_id ON public.enrollments(class_id);
        CREATE INDEX idx_enrollments_student_id ON public.enrollments(student_id);
        CREATE INDEX idx_enrollments_status ON public.enrollments(status);
        
        -- Create unique constraint to prevent duplicate enrollments
        CREATE UNIQUE INDEX idx_enrollments_unique ON public.enrollments(class_id, student_id);
        
        -- Enable RLS
        ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
        
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
        
        RAISE NOTICE 'Created enrollments table with proper constraints and policies';
        
    ELSE
        RAISE NOTICE 'Enrollments table already exists or both tables exist';
    END IF;
    
END $$;

-- Create a function to sync enrollment counts in classes table
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

-- If we created a view, also create an INSTEAD OF trigger for INSERT operations
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'enrollments' AND table_schema = 'public') THEN
        
        RAISE NOTICE 'Creating INSTEAD OF triggers for enrollments view...';
        
        -- Create INSTEAD OF INSERT trigger
        CREATE OR REPLACE FUNCTION enrollments_insert()
        RETURNS TRIGGER AS $trigger$
        BEGIN
            INSERT INTO public.class_enrollments (class_id, user_id, status, enrolled_at)
            VALUES (NEW.class_id, NEW.student_id, NEW.status, NEW.enrolled_at);
            RETURN NEW;
        END;
        $trigger$ LANGUAGE plpgsql;
        
        CREATE TRIGGER enrollments_insert_trigger
            INSTEAD OF INSERT ON public.enrollments
            FOR EACH ROW EXECUTE FUNCTION enrollments_insert();
            
        -- Create INSTEAD OF UPDATE trigger
        CREATE OR REPLACE FUNCTION enrollments_update()
        RETURNS TRIGGER AS $trigger$
        BEGIN
            UPDATE public.class_enrollments 
            SET 
                class_id = NEW.class_id,
                user_id = NEW.student_id,
                status = NEW.status,
                enrolled_at = NEW.enrolled_at,
                updated_at = NOW()
            WHERE id = OLD.id;
            RETURN NEW;
        END;
        $trigger$ LANGUAGE plpgsql;
        
        CREATE TRIGGER enrollments_update_trigger
            INSTEAD OF UPDATE ON public.enrollments
            FOR EACH ROW EXECUTE FUNCTION enrollments_update();
            
        -- Create INSTEAD OF DELETE trigger
        CREATE OR REPLACE FUNCTION enrollments_delete()
        RETURNS TRIGGER AS $trigger$
        BEGIN
            DELETE FROM public.class_enrollments WHERE id = OLD.id;
            RETURN OLD;
        END;
        $trigger$ LANGUAGE plpgsql;
        
        CREATE TRIGGER enrollments_delete_trigger
            INSTEAD OF DELETE ON public.enrollments
            FOR EACH ROW EXECUTE FUNCTION enrollments_delete();
            
        RAISE NOTICE 'Created INSTEAD OF triggers for enrollments view';
    END IF;
END $$;

-- Verify the setup and show completion message
DO $$
BEGIN
    RAISE NOTICE 'Enrollment table inconsistency fix completed!';
    RAISE NOTICE 'Checking final setup...';
END $$;

-- Verify the setup
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE tablename IN ('enrollments', 'class_enrollments')
AND schemaname = 'public';

-- Check if it's a view
SELECT 
    schemaname,
    viewname,
    viewowner
FROM pg_views 
WHERE viewname = 'enrollments'
AND schemaname = 'public';