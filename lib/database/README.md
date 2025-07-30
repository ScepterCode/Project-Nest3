# Role Management Database Schema

This document describes the enhanced role management database schema implemented for the educational platform.

## Overview

The role management system provides comprehensive user role assignment, verification, approval workflows, and permission management with full audit trails.

## Database Tables

### Core Tables

#### `user_role_assignments`
Stores role assignments for users with support for multiple roles, temporary assignments, and expiration.

**Key Features:**
- Multiple roles per user
- Temporary role assignments with expiration
- Department and institution scoping
- Status tracking (active, pending, suspended, expired)
- Automatic audit logging via triggers

**Important Constraints:**
- Unique constraint prevents duplicate active roles
- Check constraints ensure valid role and status values
- Foreign key constraints maintain referential integrity

#### `role_requests`
Manages role change requests and approval workflows.

**Key Features:**
- Role request justification tracking
- Multiple verification methods (email_domain, manual_review, admin_approval)
- Automatic expiration after 7 days
- Review tracking with notes

#### `role_audit_log`
Comprehensive audit trail for all role-related changes.

**Key Features:**
- Immutable audit records
- Automatic logging via database triggers
- Metadata storage for additional context
- Complete role lifecycle tracking

#### `institution_domains`
Manages verified email domains for automatic role approval.

**Key Features:**
- Domain verification status
- Auto-approval role configuration
- Institution-specific domain management

#### `permissions`
Defines granular permissions available in the system.

**Key Features:**
- Categorized permissions (content, user_management, analytics, system)
- Scoped permissions (self, department, institution, system)
- Standardized naming convention

#### `role_permissions`
Maps roles to their associated permissions.

**Key Features:**
- Role-based permission inheritance
- Conditional permission application
- Unique role-permission combinations

## Database Functions

### `expire_temporary_roles()`
Automatically expires temporary role assignments that have passed their expiration date.

**Returns:** Number of expired roles

**Usage:** Should be called periodically via scheduled job

### `cleanup_expired_role_requests()`
Marks expired role requests as 'expired' status.

**Returns:** Number of expired requests

**Usage:** Should be called periodically via scheduled job

### `log_role_change()`
Trigger function that automatically logs all role assignment changes to the audit log.

**Triggers on:** INSERT, UPDATE, DELETE on `user_role_assignments`

## Database Indexes

### Performance Indexes
- `idx_user_role_assignments_user_id` - Fast user role lookups
- `idx_user_role_assignments_active` - Active role queries
- `idx_role_requests_pending` - Pending approval queries
- `idx_role_audit_log_user_timestamp` - User audit history
- `idx_permissions_name` - Permission name lookups

### Composite Indexes
- `idx_user_role_assignments_user_institution` - User roles by institution
- `idx_role_requests_institution_status` - Institution role requests
- `idx_role_audit_log_user_timestamp` - User audit chronology

## Default Data

### Default Permissions
The schema includes default permissions for common platform operations:

**Content Permissions:**
- `view_content` - View educational content
- `create_content` - Create educational content
- `edit_content` - Edit educational content
- `delete_content` - Delete educational content
- `publish_content` - Publish educational content

**User Management Permissions:**
- `view_users` - View user profiles
- `invite_users` - Invite new users
- `manage_user_roles` - Manage user roles
- `suspend_users` - Suspend user accounts

**Analytics Permissions:**
- `view_analytics` - View analytics dashboards
- `export_analytics` - Export analytics data
- `view_institution_analytics` - View institution-wide analytics

**System Permissions:**
- `manage_institution` - Manage institution settings
- `manage_departments` - Manage departments
- `system_administration` - System administration

### Default Role-Permission Mappings

**Student:**
- `view_content`

**Teacher:**
- `view_content`, `create_content`, `edit_content`, `publish_content`
- `view_users`, `invite_users`, `view_analytics`

**Department Admin:**
- All teacher permissions plus:
- `delete_content`, `manage_user_roles`, `suspend_users`, `export_analytics`

**Institution Admin:**
- All department admin permissions plus:
- `view_institution_analytics`, `manage_institution`, `manage_departments`

**System Admin:**
- All permissions

## Security Features

### Constraint Validation
- Role values are restricted to predefined enum values
- Status values are validated
- Domain formats are validated with regex patterns
- Permission names follow standardized format

### Audit Trail
- All role changes are automatically logged
- Audit records are immutable
- Complete metadata tracking
- Suspicious activity detection support

### Access Control
- Foreign key constraints prevent orphaned records
- Cascading deletes maintain referential integrity
- Permission-based access control system
- Department and institution scoping

## Migration Files

### `018_enhanced_role_management_schema.sql`
Main migration file that creates all tables, constraints, indexes, functions, and default data.

### `019_fix_role_management_constraints.sql`
Fixes regex constraints that may have been truncated in the main migration.

## Validation

### Automated Testing
- Comprehensive unit tests in `__tests__/lib/database/role-management-schema.test.ts`
- Tests cover all constraints, functions, and edge cases
- Performance and scalability testing

### Validation Script
- `scripts/validate-role-management-schema.js` provides comprehensive schema validation
- Checks all tables, constraints, indexes, functions, and triggers
- Validates default data and role-permission mappings
- Tests database functionality

## Usage Examples

### Assigning a Role
```sql
INSERT INTO user_role_assignments (user_id, role, institution_id, assigned_by)
VALUES ('user-123', 'teacher', 'inst-456', 'admin-789');
```

### Requesting a Role Change
```sql
INSERT INTO role_requests (user_id, requested_role, justification, institution_id)
VALUES ('user-123', 'department_admin', 'Promoted to department head', 'inst-456');
```

### Checking User Permissions
```sql
SELECT DISTINCT p.name, p.category, p.scope
FROM permissions p
JOIN role_permissions rp ON p.id = rp.permission_id
JOIN user_role_assignments ura ON rp.role = ura.role
WHERE ura.user_id = 'user-123' AND ura.status = 'active';
```

### Expiring Temporary Roles
```sql
SELECT expire_temporary_roles();
```

## Maintenance

### Regular Tasks
1. Run `expire_temporary_roles()` daily to clean up expired assignments
2. Run `cleanup_expired_role_requests()` daily to mark expired requests
3. Monitor audit log growth and archive old records as needed
4. Review and update permission definitions as platform evolves

### Performance Monitoring
- Monitor query performance on role assignment lookups
- Check index usage and effectiveness
- Monitor audit log table size and query performance
- Optimize permission checking queries as needed

## Requirements Satisfied

This schema implementation satisfies the following requirements:

- **Requirement 1.1:** Role validation and assignment based on institutional affiliation
- **Requirement 7.1:** Comprehensive audit logging for role assignments and changes

The schema provides a robust foundation for the role assignment flow feature with proper security, performance, and maintainability considerations.
</content>
</file>