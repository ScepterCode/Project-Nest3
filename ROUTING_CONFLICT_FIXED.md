# Next.js Routing Conflict Fixed

## Issue
Next.js was throwing an error:
```
Error: You cannot use different slug names for the same dynamic path ('assignmentId' !== 'id').
```

## Root Cause
There were two conflicting dynamic route structures in the student peer-reviews folder:
1. `app/dashboard/student/peer-reviews/[id]/review/[pairId]/page.tsx` (old structure)
2. `app/dashboard/student/peer-reviews/[assignmentId]/review/[reviewId]/page.tsx` (new structure)

Both were trying to use the same route level but with different parameter names (`id` vs `assignmentId`), which Next.js doesn't allow.

## Solution
Removed the old conflicting structure:
- Deleted `app/dashboard/student/peer-reviews/[id]/` directory and all its contents
- Kept the new structure: `app/dashboard/student/peer-reviews/[assignmentId]/review/[reviewId]/page.tsx`

## Current Clean Structure
```
app/dashboard/student/peer-reviews/
├── page.tsx (main peer reviews list)
└── [assignmentId]/
    └── review/
        └── [reviewId]/
            └── page.tsx (individual review interface)
```

## Result
✅ Next.js routing conflict resolved
✅ Development server should now start without errors
✅ Peer review system maintains full functionality

The peer review system now has a clean, consistent routing structure that follows Next.js best practices.