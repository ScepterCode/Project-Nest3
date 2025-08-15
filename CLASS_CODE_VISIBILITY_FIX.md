# Class Code Visibility Issue Fix

## Problem
Students can see classes on the teacher dashboard but get "No active class found with the provided code" when trying to join with the class code.

## Root Cause
The issue is likely caused by Row Level Security (RLS) policies on the `classes` table that prevent students from reading class information needed for joining.

## Quick Fix

### Step 1: Fix RLS Policies
Run this SQL in Supabase SQL Editor:

```sql
-- Allow all authenticated users to read classes (needed for joining)
DROP POLICY IF EXISTS "Users can view classes they are enrolled in" ON public.classes;
DROP POLICY IF EXISTS "Teachers can view their own classes" ON public.classes;
DROP POLICY IF EXISTS "Students can view enrolled classes" ON public.classes;

CREATE POLICY "authenticated_users_can_read_classes" ON public.classes
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "teachers_can_manage_own_classes" ON public.classes
    FOR ALL USING (teacher_id = auth.uid());
```

### Step 2: Test the Fix
1. Go to `/dashboard/student/classes/join`
2. Enter a class code from your teacher dashboard
3. Check browser console for detailed error messages
4. Should now work successfully

## Alternative: Use the Simple Fix Script
Run `fix-classes-access-simple.sql` in Supabase SQL Editor.

## Debugging Steps

### 1. Check What Classes Exist
```sql
SELECT id, name, code, status, teacher_id, created_at 
FROM public.classes 
ORDER BY created_at DESC;
```

### 2. Check RLS Policies
```sql
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'classes';
```

### 3. Test Class Lookup
Try the exact query the app uses:
```sql
SELECT id, name, code, status 
FROM public.classes 
WHERE code = 'YOUR_CLASS_CODE' AND status = 'active';
```

## Expected Behavior After Fix

1. **Teacher creates class** → Gets class code (e.g., "DESI2451")
2. **Student enters code** → System finds the class
3. **Student joins successfully** → Gets enrolled
4. **Both can see enrollment** → Teacher sees student in class, student sees class in their list

## Common Issues

### Issue 1: RLS Blocking Access
**Symptom**: "No active class found" but class exists
**Fix**: Run the RLS policy fix above

### Issue 2: Case Sensitivity
**Symptom**: Code exists but not found
**Fix**: Code is automatically converted to uppercase

### Issue 3: Status Mismatch
**Symptom**: Class found but not "active"
**Fix**: Check class status in database

### Issue 4: Empty Error Object
**Symptom**: Console shows "Class lookup error: {}"
**Fix**: This indicates RLS is blocking the query

## Testing Commands

```bash
# Test the flow
node test-class-join-flow.js

# Check database tables
node test-enrollments-table.js
```

## Verification

After applying the fix:
1. Student should be able to find classes by code
2. Console should show detailed class information
3. Enrollment should complete successfully
4. No more empty error objects in console

The key is ensuring students can read the `classes` table to find classes by code when joining.