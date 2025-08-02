-- Peer Review System Database Schema
-- Run this in your Supabase SQL Editor

-- Create peer_review_assignments table
CREATE TABLE IF NOT EXISTS public.peer_review_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    review_type TEXT NOT NULL DEFAULT 'anonymous' CHECK (review_type IN ('anonymous', 'named', 'blind')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    reviews_per_student INTEGER DEFAULT 2,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    instructions TEXT,
    rubric JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create peer_reviews table
CREATE TABLE IF NOT EXISTS public.peer_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peer_review_assignment_id UUID NOT NULL REFERENCES peer_review_assignments(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'flagged')),
    overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
    feedback JSONB DEFAULT '{}',
    time_spent INTEGER DEFAULT 0, -- in minutes
    helpfulness_rating INTEGER CHECK (helpfulness_rating >= 1 AND helpfulness_rating <= 5),
    is_flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(peer_review_assignment_id, reviewer_id, reviewee_id)
);

-- Create peer_review_activity table for tracking activity
CREATE TABLE IF NOT EXISTS public.peer_review_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peer_review_assignment_id UUID NOT NULL REFERENCES peer_review_assignments(id) ON DELETE CASCADE,
    peer_review_id UUID REFERENCES peer_reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('review_submitted', 'review_flagged', 'review_completed', 'assignment_created', 'assignment_published')),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.peer_review_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_review_activity ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Peer Review Assignments
CREATE POLICY "Teachers can manage their peer review assignments" ON public.peer_review_assignments
    FOR ALL USING (auth.uid() = teacher_id);

CREATE POLICY "Students can view active peer review assignments for their classes" ON public.peer_review_assignments
    FOR SELECT USING (
        status = 'active' AND 
        EXISTS (
            SELECT 1 FROM public.enrollments 
            WHERE enrollments.class_id = peer_review_assignments.class_id 
            AND enrollments.student_id = auth.uid()
            AND enrollments.status = 'active'
        )
    );

-- Peer Reviews
CREATE POLICY "Users can manage their own peer reviews" ON public.peer_reviews
    FOR ALL USING (auth.uid() = reviewer_id OR auth.uid() = reviewee_id);

CREATE POLICY "Teachers can view peer reviews for their assignments" ON public.peer_reviews
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.peer_review_assignments 
            WHERE peer_review_assignments.id = peer_reviews.peer_review_assignment_id 
            AND peer_review_assignments.teacher_id = auth.uid()
        )
    );

-- Peer Review Activity
CREATE POLICY "Users can view activity for their peer reviews" ON public.peer_review_activity
    FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.peer_review_assignments 
            WHERE peer_review_assignments.id = peer_review_activity.peer_review_assignment_id 
            AND peer_review_assignments.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Users can create activity records" ON public.peer_review_activity
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_peer_review_assignments_teacher_id ON public.peer_review_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_peer_review_assignments_class_id ON public.peer_review_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_peer_review_assignments_assignment_id ON public.peer_review_assignments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_assignment_id ON public.peer_reviews(peer_review_assignment_id);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewer_id ON public.peer_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewee_id ON public.peer_reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_peer_review_activity_assignment_id ON public.peer_review_activity(peer_review_assignment_id);

-- Force schema refresh
NOTIFY pgrst, 'reload schema';

SELECT 'Peer review schema created successfully!' as status;