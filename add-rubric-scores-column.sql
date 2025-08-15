-- Add rubric_scores column to submissions table
-- This will store the rubric grading data as JSON

ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS rubric_scores JSONB;

-- Add comment to document the column
COMMENT ON COLUMN submissions.rubric_scores IS 'Stores rubric grading data including scores for each criterion, rubric name, and grading method used';

-- Create an index for better performance when querying rubric scores
CREATE INDEX IF NOT EXISTS idx_submissions_rubric_scores ON submissions USING GIN (rubric_scores);

-- Update existing submissions to have null rubric_scores (they were graded with simple method)
UPDATE submissions 
SET rubric_scores = NULL 
WHERE rubric_scores IS NULL;

SELECT 'Rubric scores column added successfully!' as status;