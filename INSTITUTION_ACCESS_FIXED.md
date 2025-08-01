# Institution Access Issues Fixed

## Problem
Users with the "institution_admin" role were getting "Access Denied" errors when trying to access institution dashboard features, similar to the teacher access issues we fixed earlier.

## Root Cause
Several institution pages were still using the old role checking method (`user.role !== 'institution_admin'` or `user.role !== 'institution'`) instead of the database-based role checking system.

## Files Fixed

### 1. `app/dashboard/institution/page.tsx`
**Issue:** Duplicate return statements and syntax error
**Fix:** Corrected the RoleGate implementation

### 2. `app/dashboard/institution/departments/page.tsx`
**Before:**
```typescript
if (!user || user.role !== 'institution_admin') {
  return <div>Access Denied</div>
}
```

**After:**
```typescript
if (!user) {
  return <div>Access Denied</div>
}

return (
  <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
    {/* page content */}
  </RoleGate>
);
```

### 3. `app/dashboard/institution/users/page.tsx`
**Before:**
```typescript
if (!user || user.role !== 'institution') {
  return <div>Access Denied</div>
}
```

**After:**
```typescript
if (!user) {
  return <div>Access Denied</div>
}

return (
  <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
    {/* page content */}
  </RoleGate>
);
```

## Key Changes

### 1. Consistent Role Name
- Fixed inconsistency where some pages checked for `'institution'` instead of `'institution_admin'`
- All institution pages now use the correct `'institution_admin'` role

### 2. Database-Based Role Checking
- Replaced `user.role` checks with `RoleGate` component
- Uses database role verification instead of auth metadata
- Consistent with the pattern used for teacher and student pages

### 3. Proper Component Structure
- Added necessary imports for `RoleGate`
- Wrapped page content appropriately
- Fixed syntax errors in existing code

## Impact
- Institution administrators can now access all institution features without "Access Denied" errors
- Role checking is now consistent across all institution pages
- Better security through database-based role verification
- Improved error handling for role-related issues

## Testing
To verify the fixes:
1. Log in as an institution admin
2. Navigate to `/dashboard/institution` - should show the main dashboard
3. Try accessing `/dashboard/institution/departments` - should work
4. Try accessing `/dashboard/institution/users` - should work
5. All institution navigation items should be accessible

## Pattern Applied
The same pattern used for teacher pages:
1. Remove old `user.role` checks
2. Add `RoleGate` component wrapper
3. Use `allowedRoles={['institution_admin']}`
4. Import necessary components
5. Wrap all page content within RoleGate

This ensures consistent role checking across the entire application and resolves the access denied issues for institution administrators.