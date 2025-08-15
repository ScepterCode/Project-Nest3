# Enrollment Check Constraint Fix

## Current Issue
Getting error: "new row for relation 'enrollments' violates check constraint 'enrollments_status_check'"

This means the `status` value 'enrolled' doesn't match what the check constraint expects.

## Root Cause
The enrollments table has a restrictive CHECK constraint that only allows specific status values, but 'enrolled' isn't one of them.

## Quick Fix

### Option 1: Remove Restrictive Constraint
Run `fix-enrollment-constraint.sql`:
```sql
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;
```

### Option 2: Recreate Table Properly
Run `fix-enrollment-final.sql` to completely recreate the table with correct constraints.

## Diagnosis Steps

### 1. Check Current Constraints
Run `test-enrollment-insert.sql` to see what constraints exist:
```sql
SELECT constraint_name, check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
    ON cc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'enrollments';
```

### 2. See What Values Are Allowed
The constraint might expect values like:
- `'active'` instead of `'enrolled'`
- `'pending'` instead of `'enrolled'`
- Different case sensitivity

## Expected Behavior After Fix

### Before Fix:
```
Console Error: new row for relation "enrollments" violates check constraint "enrollments_status_check"
```

### After Fix:
```
✅ Successfully enrolled! Enrollment ID: [uuid]
```

## Alternative Solutions

### If you want to keep the constraint:
1. Find out what values are allowed
2. Update the frontend to use the correct status value

### If you want to remove it entirely:
```sql
ALTER TABLE public.enrollments DROP CONSTRAINT enrollments_status_check;
```

## Testing

After applying the fix:
1. Try joining a class again
2. Should see successful enrollment
3. Check that the enrollment appears in the database
4. Verify teacher can see the student in their class

The key is removing or fixing the check constraint that's blocking the 'enrolled' status value.