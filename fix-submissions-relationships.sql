-- Fix submissions table relationships
-- This will establish proper foreign key relationships for the submissions table

-- 1. Add foreign key constraint for student_id -> users.id
ALTER TABLE submissions 
ADD CONSTRAINT fk_submissions_student_id 
FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;

-- 2. Add foreign key constraint for graded_by -> users.id (for teacher who grades)
ALTER TABLE submissions 
ADD CONSTRAINT fk_submissions_graded_by 
FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL;

-- 3. Ensure assignment_id foreign key exists
ALTER TABLE submissions 
ADD CONSTRAINT fk_submissions_assignment_id 
FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;

-- 4. Check and fix other table relationships that might be missing

-- Fix enrollments table relationships
ALTER TABLE enrollments 
ADD CONSTRAINT fk_enrollments_student_id 
FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE enrollments 
ADD CONSTRAINT fk_enrollments_class_id 
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

-- Fix assignments table relationships  
ALTER TABLE assignments 
ADD CONSTRAINT fk_assignments_class_id 
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE assignments 
ADD CONSTRAINT fk_assignments_created_by 
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

-- Fix classes table relationships
ALTER TABLE classes 
ADD CONSTRAINT fk_classes_teacher_id 
FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;

-- Fix peer_reviews table relationships (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'peer_reviews') THEN
        -- Add foreign key constraints for peer_reviews
        ALTER TABLE peer_reviews 
        ADD CONSTRAINT fk_peer_reviews_reviewer_id 
        FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
        
        ALTER TABLE peer_reviews 
        ADD CONSTRAINT fk_peer_reviews_reviewee_id 
        FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE;
        
        ALTER TABLE peer_reviews 
        ADD CONSTRAINT fk_peer_reviews_assignment_id 
        FOREIGN KEY (peer_review_assignment_id) REFERENCES peer_review_assignments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Fix peer_review_assignments table relationships (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'peer_review_assignments') THEN
        ALTER TABLE peer_review_assignments 
        ADD CONSTRAINT fk_peer_review_assignments_assignment_id 
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Fix notifications table relationships (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications 
        ADD CONSTRAINT fk_notifications_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;