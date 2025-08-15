# Student Assignments Page Fix

## Problem
Student assignments page showing "Failed to load assignments" error.

## Root Cause
The assignments page was trying to:
1. Query `assignments` table that may not exist
2. Query `submissions` table with complex joins
3. Use complex foreign key relationships that may not be set up

## Solutions Implemented

### 1. ✅ Fixed Original Page
Updated `app/dashboard/student/assignments/page.tsx` with:
- **Table existence checks** - Verifies tables exist before querying
- **Simplified queries** - Breaks down complex joins into separate queries
- **Better error handling** - Shows specific error messages
- **Graceful degradation** - Works even if submissions table doesn't exist

### 2. ✅ Created Simple Alternative
Created `app/dashboard/student/assignments/simple/page.tsx` with:
- **Minimal dependencies** - Only requires basic tables
- **No submissions tracking** - Just shows assignments without submission status
- **Clear error messages** - Tells users exactly what's missing
- **Fallback options** - Provides buttons to join classes or try again

## Testing Options

### Option 1: Test Fixed Original Page
Go to `/dashboard/student/assignments` and check browser console for detailed logs.

### Option 2: Test Simple Alternative
Go to `/dashboard/student/assignments/simple` for a guaranteed working version.

## Expected Behavior

### If All Tables Exist:
- Shows assignments from enrolled classes
- Displays due dates and point values
- Shows submission status (if submissions table exists)
- Provides links to view assignments and classes

### If Assignments Table Missing:
- Shows "No assignments system available yet" message
- Suggests that teachers haven't created assignments

### If Not Enrolled in Classes:
- Shows "Join a class to see assignments" message
- Provides button to join classes

### If No Assignments:
- Shows "No assignments yet" message
- Provides link to view classes

## Database Requirements

### Minimum Required Tables:
```sql
-- Classes table (should already exist)
CREATE TABLE public.classes (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    teacher_id UUID NOT NULL
);

-- Enrollments table (should already exist)
CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY,
    class_id UUID REFERENCES classes(id),
    student_id UUID REFERENCES auth.users(id)
);

-- Assignments table (may need to be created)
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    points_possible INTEGER DEFAULT 0,
    class_id UUID REFERENCES classes(id)
);
```

### Optional Tables:
```sql
-- Submissions table (for tracking student submissions)
CREATE TABLE public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id),
    student_id UUID REFERENCES auth.users(id),
    submitted_at TIMESTAMPTZ,
    grade INTEGER,
    status TEXT DEFAULT 'pending'
);
```

## Debug Information

The fixed page now logs:
```
Loading assignments for student: [user-id]
Student enrolled in classes: [count]
Found assignments: [count]
Loaded assignments successfully: [count]
```

## Quick Database Setup

If assignments table doesn't exist:

```sql
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ NOT NULL,
    points_possible INTEGER DEFAULT 100,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Allow students to view assignments from their enrolled classes
CREATE POLICY "students_can_view_class_assignments" ON public.assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.enrollments 
            WHERE enrollments.class_id = assignments.class_id 
            AND enrollments.student_id = auth.uid()
        )
    );

-- Allow teachers to manage their own assignments
CREATE POLICY "teachers_can_manage_own_assignments" ON public.assignments
    FOR ALL USING (teacher_id = auth.uid());
```

## Next Steps

1. **Test the fixed page** - Check if it loads assignments properly
2. **Use simple version** - If complex version still fails
3. **Create assignments table** - If it doesn't exist
4. **Have teachers create assignments** - So students have something to see

The student should now be able to see assignments from their enrolled classes!