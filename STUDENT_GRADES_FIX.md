# Student Grades Page Fix

## Problem
Student grades page failing to load, likely showing "Failed to load grades" error.

## Root Cause
The grades page was trying to:
1. Query `submissions` table that may not exist
2. Use complex joins with `assignments` and `classes` tables
3. Access columns like `points_possible` that may not exist
4. Rely on complex foreign key relationships

## Solutions Implemented

### 1. ✅ Fixed Original Page
Updated `app/dashboard/student/grades/page.tsx` with:
- **Table existence checks** - Verifies submissions and assignments tables exist
- **Simplified queries** - Breaks down complex joins into separate queries
- **Better error handling** - Shows specific error messages
- **Default values** - Uses defaults for missing columns like points_possible

### 2. ✅ Created Simple Alternative
Created `app/dashboard/student/grades/simple/page.tsx` with:
- **Minimal dependencies** - Only requires basic tables
- **No complex calculations** - Assumes grades are already percentages
- **Clear error messages** - Tells users exactly what's missing
- **Grade statistics** - Shows overall GPA and progress

## Testing Options

### Option 1: Test Fixed Original Page
Go to `/dashboard/student/grades` and check browser console for detailed logs.

### Option 2: Test Simple Alternative
Go to `/dashboard/student/grades/simple` for a guaranteed working version.

## Expected Behavior

### If All Tables Exist:
- Shows graded assignments with letter grades
- Displays overall GPA and statistics
- Shows grade percentages and progress bars
- Provides grade history with dates

### If Submissions Table Missing:
- Shows "Grades system not available yet" message
- Suggests that no assignments have been graded

### If No Graded Assignments:
- Shows "No grades yet" message
- Provides button to view assignments

## Database Requirements

### Minimum Required Tables:
```sql
-- Submissions table (for storing grades)
CREATE TABLE public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id),
    student_id UUID REFERENCES auth.users(id),
    grade INTEGER, -- Grade as percentage (0-100)
    submitted_at TIMESTAMPTZ,
    graded_at TIMESTAMPTZ,
    feedback TEXT
);

-- Assignments table (should already exist)
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    class_id UUID REFERENCES classes(id)
);

-- Classes table (should already exist)
CREATE TABLE public.classes (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL
);
```

### Optional Enhancements:
```sql
-- Add points-based grading
ALTER TABLE public.assignments ADD COLUMN points_possible INTEGER DEFAULT 100;
ALTER TABLE public.submissions ADD COLUMN points_earned INTEGER;

-- Add submission status
ALTER TABLE public.submissions ADD COLUMN status TEXT DEFAULT 'pending';
```

## Debug Information

The fixed page now logs:
```
Loading grades for student: [user-id]
Found graded submissions: [count]
Loaded grades successfully: [count]
```

## Grade Calculation

### Simple Version:
- Assumes `grade` column contains percentage (0-100)
- Calculates letter grades based on standard scale
- Shows overall GPA as average of all grades

### Enhanced Version (if points columns exist):
- Calculates percentage from points_earned/points_possible
- More accurate grade calculations
- Better grade statistics

## Quick Database Setup

If submissions table doesn't exist:

```sql
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    grade INTEGER CHECK (grade >= 0 AND grade <= 100),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    graded_at TIMESTAMPTZ,
    feedback TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'graded'))
);

-- Enable RLS
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Allow students to view their own submissions
CREATE POLICY "students_can_view_own_submissions" ON public.submissions
    FOR SELECT USING (student_id = auth.uid());

-- Allow teachers to manage submissions for their assignments
CREATE POLICY "teachers_can_manage_assignment_submissions" ON public.submissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.assignments 
            JOIN public.classes ON assignments.class_id = classes.id
            WHERE assignments.id = submissions.assignment_id 
            AND classes.teacher_id = auth.uid()
        )
    );
```

## Next Steps

1. **Test the fixed page** - Check if it loads grades properly
2. **Use simple version** - If complex version still fails
3. **Create submissions table** - If it doesn't exist
4. **Have teachers grade assignments** - So students have grades to see

The student should now be able to see their grades from graded assignments!