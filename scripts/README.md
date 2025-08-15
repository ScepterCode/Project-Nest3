# Database Schema Scripts

This directory contains the working database schema files for the application.

## Working Schema Files

### Core Schemas (Ready for Production)

1. **`safe-bulk-import-schema.sql`**
   - Bulk user import functionality
   - Handles CSV/Excel file imports
   - Progress tracking and error handling
   - ✅ Tested and working

2. **`safe-notifications-schema.sql`**
   - Comprehensive notification system
   - User preferences and delivery tracking
   - Real-time notification support
   - ✅ Tested and working

3. **`safe-bulk-role-assignment-schema.sql`**
   - Bulk role assignment functionality
   - Conflict detection and resolution
   - Audit trail and validation
   - ✅ Tested and working

### How to Deploy

Run these schemas in order in your Supabase SQL editor:

```sql
-- 1. Deploy bulk import functionality
\i scripts/safe-bulk-import-schema.sql

-- 2. Deploy notifications system
\i scripts/safe-notifications-schema.sql

-- 3. Deploy bulk role assignment system
\i scripts/safe-bulk-role-assignment-schema.sql
```

### Features

All schemas include:
- ✅ Row Level Security (RLS) policies
- ✅ Proper indexes for performance
- ✅ Utility functions and triggers
- ✅ Safe deployment (can be run multiple times)
- ✅ PostgreSQL reserved keyword compliance
- ✅ Comprehensive error handling

### Notes

- All schemas use the "safe" approach - they drop existing policies/triggers before recreating them
- No reserved keyword conflicts (avoided `current_role`, `new`, etc.)
- Proper dollar-quoted string syntax for functions
- Compatible with Supabase PostgreSQL version

## Performance Testing

- **`test-bulk-role-assignment-performance.js`** - Performance tests for bulk operations
- **`test-bulk-import-system.js`** - System tests for import functionality

## Cleanup

Old problematic schema files have been removed to avoid confusion. Only the working "safe" versions remain.