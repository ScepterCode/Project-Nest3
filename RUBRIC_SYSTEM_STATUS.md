# Rubric System Status

## Current Issue

The rubric system has a **database trigger issue** that prevents creating new rubrics. This is caused by a problematic database trigger in the `rubric_levels` table.

### Technical Details

- **Error**: `record "new" has no field "rubric_id"`
- **Location**: Database trigger `update_rubric_points_on_level_change`
- **Cause**: The trigger function tries to access `NEW.rubric_id` on the `rubric_levels` table, but this table only has `criterion_id`
- **Impact**: Cannot create new rubrics with criteria and levels

### What Works

✅ **Existing rubrics** - All existing rubrics work perfectly
✅ **Rubric deletion** - Can delete existing rubrics
✅ **Rubric viewing** - Can view rubric details
✅ **Simple grading** - Works without issues

### What Doesn't Work

❌ **Creating new rubrics** - Fails when trying to create rubric levels
❌ **Rubric templates** - Cannot create from templates (same underlying issue)

## Current Workarounds

### For Teachers
1. **Use Simple Grading**: For new assignments, use the simple grade + feedback approach
2. **Existing Rubrics**: Continue using any rubrics that were created before this issue
3. **Delete Rubrics**: You can still delete rubrics you no longer need

### For Users
- A clear warning message is displayed on the rubrics page
- The create rubric page shows a helpful error message when creation fails
- Users are guided to use simple grading as an alternative

## Technical Solution Required

The issue requires a **database schema update** to fix the problematic trigger. The trigger function needs to be updated to:

1. Properly handle the `rubric_levels` table structure
2. Get the `rubric_id` through the `criterion_id` relationship
3. Or be removed entirely and replaced with manual total points calculation

### Attempted Fixes

1. ✅ **Manual total points calculation** - Added to the API
2. ❌ **Trigger removal** - Cannot execute DDL through API
3. ❌ **Direct SQL execution** - No `exec` function available
4. ✅ **Better error handling** - Improved user experience

## User Experience Improvements Made

### 1. Clear Error Messages
- Users get helpful error messages instead of generic failures
- Guidance provided on using simple grading as alternative

### 2. Status Notifications
- Warning banner on rubrics page explaining the issue
- Clear workaround instructions

### 3. Delete Functionality
- Added delete buttons to existing rubric cards
- Confirmation dialogs to prevent accidental deletion
- Loading states during deletion

### 4. API Improvements
- Better error handling in the rubrics API
- Detailed error messages for debugging
- Proper cleanup when creation fails

## Next Steps

1. **Database Schema Update**: The database administrator needs to fix the trigger
2. **Remove Warning Messages**: Once fixed, remove the temporary warning banners
3. **Test Rubric Creation**: Verify that new rubrics can be created successfully
4. **Template System**: Ensure rubric templates work after the fix

## Files Modified

### Frontend
- `app/dashboard/teacher/rubrics/page.tsx` - Added delete functionality and warning banner
- `app/dashboard/teacher/rubrics/create/page.tsx` - Improved error handling

### Backend
- `app/api/rubrics/route.ts` - New API for rubric CRUD operations

### Documentation
- `RUBRIC_SYSTEM_STATUS.md` - This status document

## Summary

The rubric system has a database trigger issue that prevents creating new rubrics. Users can still use existing rubrics and are guided to use simple grading for new assignments. The issue requires a database schema update to resolve completely.

**Impact**: Medium - Users have a workaround (simple grading) but cannot create new rubrics
**Priority**: High - Should be fixed in next database maintenance window
**User Experience**: Good - Clear messaging and guidance provided