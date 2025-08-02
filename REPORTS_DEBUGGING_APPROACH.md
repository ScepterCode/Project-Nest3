# Reports Page Debugging - Systematic Approach

## Issue
The institution reports page is still showing blank content despite error handling fixes.

## Debugging Steps Applied

### 1. Created Test Page
- ✅ Created `/dashboard/institution/reports-test` to test basic rendering
- ✅ This will help identify if the issue is with routing, permissions, or component rendering

### 2. Removed Permission Gate Temporarily
- ✅ Removed `RoleGate` wrapper to test if permission system is blocking access
- ✅ Added debug information display to show user data and loading states

### 3. Added Comprehensive Logging
- ✅ Added console logs throughout the component lifecycle
- ✅ Logs will show:
  - Component rendering
  - User authentication state
  - Data fetching progress
  - Loading state changes
  - Error states

### 4. Added Debug UI
- ✅ Added debug information panel showing:
  - Current user email and role
  - Loading state
  - Error state
  - Institution stats data

## Testing Instructions

### Step 1: Test Basic Rendering
1. Visit `/dashboard/institution/reports-test`
2. Check if the test page loads and shows user information
3. This confirms basic routing and authentication work

### Step 2: Test Main Reports Page
1. Visit `/dashboard/institution/reports`
2. Check browser console for debug logs
3. Look at the debug info panel on the page
4. Identify where the process is failing

### Step 3: Analyze Console Output
Look for these specific log messages:
- "Reports page rendering..." - Component is loading
- "useEffect triggered, user: [object]" - User context is available
- "Fetching reports data..." - Data fetching is starting
- "Starting parallel fetch operations..." - Database queries are running
- "All fetch operations completed" - Data fetching succeeded
- "Setting loading to false" - Loading state is being updated

## Common Issues to Check

### 1. Authentication Issues
- **Symptom**: No user object in debug info
- **Solution**: Check authentication context and login state

### 2. Permission Issues
- **Symptom**: User has wrong role or no role
- **Solution**: Check user role assignment in database

### 3. Component Rendering Issues
- **Symptom**: Page doesn't load at all
- **Solution**: Check for import errors or component issues

### 4. Database Connection Issues
- **Symptom**: Logs show database errors
- **Solution**: Check Supabase connection and table permissions

### 5. Loading State Issues
- **Symptom**: Page stuck in loading state
- **Solution**: Check if loading state is being set to false

## Expected Debug Output

### Successful Load:
```
Reports page rendering...
User: {id: "...", email: "...", role: "institution_admin"}
Loading: true
useEffect triggered, user: [object]
Fetching reports data...
fetchReportsData called
Starting parallel fetch operations...
All fetch operations completed
Setting loading to false
```

### Failed Load:
```
Reports page rendering...
User: null
Loading: true
useEffect triggered, user: null
No user, not fetching data
```

## Next Steps Based on Results

### If Test Page Works But Main Page Doesn't:
- Issue is with the main reports component
- Check for component-specific errors

### If Neither Page Works:
- Issue is with routing or authentication
- Check dashboard layout and auth context

### If Pages Load But Show No Data:
- Issue is with database queries
- Check Supabase connection and permissions

### If Console Shows Errors:
- Address specific errors shown in console
- Check database table existence and permissions

## Temporary Changes Made

1. **Removed RoleGate**: To test if permissions are blocking access
2. **Added Debug Panel**: To show current state information
3. **Added Console Logs**: To trace execution flow
4. **Created Test Page**: To isolate issues

These changes are temporary for debugging and should be reverted once the issue is identified and fixed.