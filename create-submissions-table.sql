-- Create submissions table for assignment submissions
-- This table stores student submissions for assignments

CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL,
    student_id UUID NOT NULL,
    content TEXT, -- For text submissions
    file_url TEXT, -- For file submissions
    link_url TEXT, -- For link submissions
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'graded')),
    grade INTEGER CHECK (grade >= 0 AND grade <= 100),
    feedback TEXT,
    graded_at TIMESTAMPTZ,
    graded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT submissions_unique_student_assignment UNIQUE (assignment_id, student_id)
);

-- Add foreign key constraints
DO $$
BEGIN
    -- Add foreign key to assignments table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_assignment_id_fkey' 
        AND table_name = 'submissions'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_assignment_id_fkey 
        FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;
    END IF;
    
    -- Add foreign key to users table for student
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_student_id_fkey' 
        AND table_name = 'submissions'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    -- Add foreign key to users table for grader
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_graded_by_fkey' 
        AND table_name = 'submissions'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_graded_by_fkey 
        FOREIGN KEY (graded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON public.submissions(submitted_at);

-- Enable RLS
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "students_can_view_own_submissions" ON public.submissions;
DROP POLICY IF EXISTS "students_can_manage_own_submissions" ON public.submissions;
DROP POLICY IF EXISTS "teachers_can_view_class_submissions" ON public.submissions;
DROP POLICY IF EXISTS "teachers_can_grade_submissions" ON public.submissions;

-- Create RLS policies
-- Students can view and manage their own submissions
CREATE POLICY "students_can_manage_own_submissions" ON public.submissions
    FOR ALL USING (student_id = auth.uid());

-- Teachers can view and grade submissions for their assignments
CREATE POLICY "teachers_can_manage_class_submissions" ON public.submissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.assignments 
            JOIN public.classes ON assignments.class_id = classes.id
            WHERE assignments.id = submissions.assignment_id 
            AND classes.teacher_id = auth.uid()
        )
    );

-- Create storage bucket for file submissions
INSERT INTO storage.buckets (id, name, public) 
VALUES ('submissions', 'submissions', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for submissions bucket
CREATE POLICY "Students can upload their own submissions" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'submissions' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Students can view their own submissions" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'submissions' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Teachers can view class submissions" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'submissions'
        AND EXISTS (
            SELECT 1 FROM public.submissions s
            JOIN public.assignments a ON s.assignment_id = a.id
            JOIN public.classes c ON a.class_id = c.id
            WHERE s.file_url LIKE '%' || name || '%'
            AND c.teacher_id = auth.uid()
        )
    );

SELECT 'Submissions table and storage setup complete!' as result;