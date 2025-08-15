# Bulk Role Assignment Access Restriction Update

## Overview
Updated the bulk role assignment system to restrict access to only `institution_admin` and `department_admin` roles, removing `system_admin` access as requested.

## Changes Made

### 1. Database Schema Updates
**File:** `lib/database/bulk-role-assignment-schema.sql`

Updated RLS policies to remove `system_admin` access:
- `bulk_role_assignment_items` - Removed system_admin from SELECT policy
- `role_assignment_conflicts` - Removed system_admin from ALL policy  
- `role_assignment_notifications` - Removed system_admin from ALL policy
- `institutional_role_policies` - Restricted to only institution_admin (removed system_admin)
- `role_assignment_audit` - Removed system_admin from SELECT policy

### 2. Type Definitions
**File:** `lib/types/bulk-role-assignment.ts`

- Updated `UserRole` type to remove `'system_admin'`
- Now only includes: `'student' | 'teacher' | 'department_admin' | 'institution_admin'`

### 3. Frontend Components
**File:** `components/bulk-role-assignment/bulk-role-assignment-interface.tsx`
- Updated `excludeRoles` logic to remove `system_admin` reference
- Department admins now only exclude `institution_admin` roles

**File:** `components/bulk-role-assignment/user-selection-interface.tsx`
- Removed `system_admin` from role color mapping
- Cleaned up role display logic

### 4. Database Migration Script
**File:** `scripts/update-bulk-role-assignment-policies.sql`

Created a migration script to:
- Drop existing RLS policies that contained system_admin references
- Recreate policies with updated role restrictions
- Include verification queries to confirm changes

## Access Control Summary

### Institution Admin (`institution_admin`)
- Can perform all bulk role assignment operations
- Can assign roles: `student`, `teacher`, `department_admin`
- Can manage institutional role policies
- Can view all audit trails and notifications

### Department Admin (`department_admin`)  
- Can perform bulk role assignments within their scope
- Can assign roles: `student`, `teacher`
- Cannot assign `institution_admin` roles
- Cannot manage institutional role policies
- Can view audit trails and notifications for their operations

### Removed Access
- `system_admin` role no longer has any access to bulk role assignment features
- All API endpoints now reject system_admin users with 403 Forbidden
- Database policies prevent system_admin access at the data layer

## API Endpoints
All bulk role assignment API endpoints already had correct permission checks:
- `/api/bulk-role-assignment` - ✅ Restricts to institution_admin, department_admin
- `/api/bulk-role-assignment/validate` - ✅ Restricts to institution_admin, department_admin  
- `/api/bulk-role-assignment/users/search` - ✅ Restricts to institution_admin, department_admin
- `/api/bulk-role-assignment/status/[id]` - ✅ Restricts to institution_admin, department_admin
- `/api/bulk-role-assignment/rollback` - ✅ Restricts to institution_admin, department_admin

## Testing Recommendations

1. **Database Migration**
   ```sql
   -- Run the migration script
   \i scripts/update-bulk-role-assignment-policies.sql
   ```

2. **Verify Access Control**
   - Test with institution_admin user - should have full access
   - Test with department_admin user - should have limited access
   - Test with system_admin user - should be denied access (403)
   - Test with other roles - should be denied access (403)

3. **Frontend Testing**
   - Verify role selection dropdowns show correct options
   - Confirm department_admin cannot select institution_admin role
   - Check that system_admin role is not displayed anywhere

## Security Benefits

1. **Principle of Least Privilege** - Only roles that need bulk assignment capabilities have access
2. **Institution Isolation** - System admins can no longer perform cross-institution bulk operations
3. **Role Hierarchy Enforcement** - Department admins cannot elevate users to institution_admin
4. **Audit Trail Integrity** - All bulk operations are now properly scoped to institution context

## Deployment Notes

- The database migration script should be run during deployment
- No application restart required for frontend changes
- API endpoints will immediately enforce new restrictions
- Existing bulk assignments remain unaffected, only new operations are restricted

## Status: ✅ COMPLETE
All bulk role assignment features now properly restrict access to institution_admin and department_admin roles only, with system_admin access completely removed.