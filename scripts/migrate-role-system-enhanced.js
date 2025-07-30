#!/usr/bin/env node

/**
 * Enhanced Role System Migration Script
 * 
 * Migrates existing user roles to the new comprehensive role management system.
 * This script handles data migration, validation, and rollback capabilities.
 * 
 * Requirements: 1.1, 1.5
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const MIGRATION_CONFIG = {
  batchSize: 100,
  maxRetries: 3,
  backupEnabled: true,
  validationEnabled: true,
  dryRun: process.env.DRY_RUN === 'true',
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Role mapping from old system to new system
const ROLE_MAPPING = {
  'student': 'student',
  'teacher': 'teacher', 
  'admin': 'institution_admin',
  'department_admin': 'department_admin',
  'system_admin': 'system_admin',
  // Handle legacy role names
  'instructor': 'teacher',
  'faculty': 'teacher',
  'staff': 'teacher',
  'administrator': 'institution_admin'
};

class RoleMigrationService {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.migrationId = `migration_${Date.now()}`;
    this.stats = {
      totalUsers: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
  }

  /**
   * Main migration entry point
   */
  async migrate() {
    try {
      this.log('info', 'Starting role system migration', { migrationId: this.migrationId });

      // 1. Pre-migration validation
      await this.validatePreMigration();

      // 2. Create backup if enabled
      if (MIGRATION_CONFIG.backupEnabled) {
        await this.createBackup();
      }

      // 3. Get users to migrate
      const users = await this.getUsersToMigrate();
      this.stats.totalUsers = users.length;

      this.log('info', `Found ${users.length} users to migrate`);

      // 4. Process users in batches
      await this.processBatches(users);

      // 5. Post-migration validation
      if (MIGRATION_CONFIG.validationEnabled) {
        await this.validatePostMigration();
      }

      // 6. Generate migration report
      await this.generateMigrationReport();

      this.log('info', 'Migration completed successfully', this.stats);

    } catch (error) {
      this.log('error', 'Migration failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Validate system state before migration
   */
  async validatePreMigration() {
    this.log('info', 'Running pre-migration validation');

    // Check if new role tables exist
    const { data: tables, error } = await this.supabase.rpc('check_table_exists', {
      table_names: ['user_role_assignments', 'role_requests', 'role_audit_log']
    });

    if (error) {
      throw new Error(`Failed to check table existence: ${error.message}`);
    }

    // Check for required columns in users table
    const { data: userColumns, error: columnError } = await this.supabase.rpc('get_table_columns', {
      table_name: 'users'
    });

    if (columnError) {
      throw new Error(`Failed to check user table columns: ${columnError.message}`);
    }

    const requiredColumns = ['primary_role', 'role_status', 'role_verified_at', 'role_assigned_by'];
    const missingColumns = requiredColumns.filter(col => 
      !userColumns.some(c => c.column_name === col)
    );

    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns in users table: ${missingColumns.join(', ')}`);
    }

    this.log('info', 'Pre-migration validation passed');
  }

  /**
   * Create backup of current role data
   */
  async createBackup() {
    this.log('info', 'Creating backup of current role data');

    const backupDir = path.join(process.cwd(), 'backups', this.migrationId);
    await fs.mkdir(backupDir, { recursive: true });

    // Backup users table role-related data
    const { data: users, error } = await this.supabase
      .from('users')
      .select('id, email, first_name, last_name, role, institution_id, department_id, created_at, updated_at');

    if (error) {
      throw new Error(`Failed to backup users: ${error.message}`);
    }

    await fs.writeFile(
      path.join(backupDir, 'users_backup.json'),
      JSON.stringify(users, null, 2)
    );

    // Backup any existing role assignments
    const { data: existingAssignments, error: assignmentError } = await this.supabase
      .from('user_role_assignments')
      .select('*');

    if (!assignmentError && existingAssignments) {
      await fs.writeFile(
        path.join(backupDir, 'role_assignments_backup.json'),
        JSON.stringify(existingAssignments, null, 2)
      );
    }

    // Create backup metadata
    const backupMetadata = {
      migrationId: this.migrationId,
      timestamp: new Date().toISOString(),
      userCount: users.length,
      config: MIGRATION_CONFIG
    };

    await fs.writeFile(
      path.join(backupDir, 'backup_metadata.json'),
      JSON.stringify(backupMetadata, null, 2)
    );

    this.log('info', `Backup created at ${backupDir}`);
  }

  /**
   * Get users that need to be migrated
   */
  async getUsersToMigrate() {
    this.log('info', 'Fetching users to migrate');

    // Get users who don't have role assignments yet or have outdated role data
    const { data: users, error } = await this.supabase
      .from('users')
      .select(`
        id, 
        email, 
        first_name, 
        last_name, 
        role, 
        primary_role,
        role_status,
        institution_id, 
        department_id,
        created_at,
        updated_at
      `)
      .or('primary_role.is.null,role_status.is.null');

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    return users || [];
  }

  /**
   * Process users in batches
   */
  async processBatches(users) {
    const batches = this.chunkArray(users, MIGRATION_CONFIG.batchSize);
    
    this.log('info', `Processing ${batches.length} batches of ${MIGRATION_CONFIG.batchSize} users each`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.log('info', `Processing batch ${i + 1}/${batches.length}`);

      await this.processBatch(batch, i);

      // Small delay between batches to avoid overwhelming the database
      if (i < batches.length - 1) {
        await this.sleep(100);
      }
    }
  }

  /**
   * Process a single batch of users
   */
  async processBatch(users, batchIndex) {
    const batchPromises = users.map(async (user, userIndex) => {
      const globalIndex = batchIndex * MIGRATION_CONFIG.batchSize + userIndex;
      return this.migrateUser(user, globalIndex);
    });

    const results = await Promise.allSettled(batchPromises);

    // Process results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.migrated) {
          this.stats.migrated++;
        } else {
          this.stats.skipped++;
        }
      } else {
        this.stats.failed++;
        this.stats.errors.push({
          userId: users[index].id,
          email: users[index].email,
          error: result.reason.message
        });
        this.log('error', `Failed to migrate user ${users[index].email}`, {
          error: result.reason.message
        });
      }
    });
  }

  /**
   * Migrate a single user
   */
  async migrateUser(user, index) {
    try {
      // Skip if user already has proper role assignment
      if (user.primary_role && user.role_status) {
        return { migrated: false, reason: 'Already migrated' };
      }

      // Determine the role to assign
      const oldRole = user.role || 'student';
      const newRole = ROLE_MAPPING[oldRole.toLowerCase()] || 'student';

      // Validate institution exists
      if (!user.institution_id) {
        // Try to find a default institution or create one
        const defaultInstitution = await this.getOrCreateDefaultInstitution();
        user.institution_id = defaultInstitution.id;
      }

      if (MIGRATION_CONFIG.dryRun) {
        this.log('info', `[DRY RUN] Would migrate user ${user.email} from ${oldRole} to ${newRole}`);
        return { migrated: true, dryRun: true };
      }

      // Start transaction
      const { data, error } = await this.supabase.rpc('migrate_user_role', {
        p_user_id: user.id,
        p_old_role: oldRole,
        p_new_role: newRole,
        p_institution_id: user.institution_id,
        p_department_id: user.department_id,
        p_migration_id: this.migrationId
      });

      if (error) {
        throw new Error(`Database migration failed: ${error.message}`);
      }

      this.log('debug', `Migrated user ${user.email} from ${oldRole} to ${newRole}`);
      return { migrated: true, oldRole, newRole };

    } catch (error) {
      this.log('error', `Failed to migrate user ${user.email}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get or create default institution for users without one
   */
  async getOrCreateDefaultInstitution() {
    // Try to find existing default institution
    const { data: existing, error } = await this.supabase
      .from('institutions')
      .select('id, name')
      .eq('name', 'Default Institution')
      .single();

    if (!error && existing) {
      return existing;
    }

    // Create default institution
    const { data: newInstitution, error: createError } = await this.supabase
      .from('institutions')
      .insert({
        name: 'Default Institution',
        domain: 'default.edu',
        type: 'university',
        status: 'active',
        settings: {
          allowSelfRegistration: true,
          requireEmailVerification: false,
          defaultUserRole: 'student'
        }
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create default institution: ${createError.message}`);
    }

    return newInstitution;
  }

  /**
   * Validate migration results
   */
  async validatePostMigration() {
    this.log('info', 'Running post-migration validation');

    // Check that all users have role assignments
    const { data: usersWithoutRoles, error } = await this.supabase
      .from('users')
      .select('id, email')
      .is('primary_role', null);

    if (error) {
      throw new Error(`Validation query failed: ${error.message}`);
    }

    if (usersWithoutRoles && usersWithoutRoles.length > 0) {
      this.log('warning', `${usersWithoutRoles.length} users still without roles after migration`);
    }

    // Validate role assignment integrity
    const { data: invalidAssignments, error: assignmentError } = await this.supabase
      .rpc('validate_role_assignments');

    if (assignmentError) {
      throw new Error(`Role assignment validation failed: ${assignmentError.message}`);
    }

    if (invalidAssignments && invalidAssignments.length > 0) {
      this.log('warning', `Found ${invalidAssignments.length} invalid role assignments`);
    }

    this.log('info', 'Post-migration validation completed');
  }

  /**
   * Generate migration report
   */
  async generateMigrationReport() {
    const report = {
      migrationId: this.migrationId,
      timestamp: new Date().toISOString(),
      config: MIGRATION_CONFIG,
      statistics: this.stats,
      summary: {
        successRate: this.stats.totalUsers > 0 ? 
          ((this.stats.migrated / this.stats.totalUsers) * 100).toFixed(2) + '%' : '0%',
        totalProcessed: this.stats.migrated + this.stats.failed + this.stats.skipped,
        duration: Date.now() - parseInt(this.migrationId.split('_')[1])
      }
    };

    const reportDir = path.join(process.cwd(), 'migration-reports');
    await fs.mkdir(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `migration_report_${this.migrationId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    this.log('info', `Migration report saved to ${reportPath}`);
    return report;
  }

  /**
   * Rollback migration
   */
  async rollback(migrationId) {
    this.log('info', `Starting rollback for migration ${migrationId}`);

    try {
      // Load backup data
      const backupDir = path.join(process.cwd(), 'backups', migrationId);
      const backupPath = path.join(backupDir, 'users_backup.json');
      
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));

      // Restore user role data
      for (const user of backupData) {
        const { error } = await this.supabase
          .from('users')
          .update({
            role: user.role,
            primary_role: null,
            role_status: null,
            role_verified_at: null,
            role_assigned_by: null
          })
          .eq('id', user.id);

        if (error) {
          this.log('error', `Failed to rollback user ${user.email}`, { error: error.message });
        }
      }

      // Remove role assignments created during migration
      const { error: deleteError } = await this.supabase
        .from('user_role_assignments')
        .delete()
        .contains('metadata', { migrationId });

      if (deleteError) {
        this.log('error', 'Failed to remove role assignments', { error: deleteError.message });
      }

      this.log('info', 'Rollback completed successfully');

    } catch (error) {
      this.log('error', 'Rollback failed', { error: error.message });
      throw error;
    }
  }

  // Utility methods
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(level, message, data = {}) {
    const logLevels = { error: 0, warning: 1, info: 2, debug: 3 };
    const currentLevel = logLevels[MIGRATION_CONFIG.logLevel] || 2;
    
    if (logLevels[level] <= currentLevel) {
      const timestamp = new Date().toISOString();
      console.log(JSON.stringify({
        timestamp,
        level,
        message,
        migrationId: this.migrationId,
        ...data
      }));
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const migrationService = new RoleMigrationService();

  try {
    switch (command) {
      case 'migrate':
        await migrationService.migrate();
        break;
      case 'rollback':
        const migrationId = args[1];
        if (!migrationId) {
          console.error('Migration ID required for rollback');
          process.exit(1);
        }
        await migrationService.rollback(migrationId);
        break;
      default:
        console.log('Usage: node migrate-role-system-enhanced.js [migrate|rollback] [migrationId]');
        console.log('Environment variables:');
        console.log('  DRY_RUN=true - Run migration without making changes');
        console.log('  LOG_LEVEL=debug|info|warning|error - Set logging level');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

// Database functions that need to be created
const DATABASE_FUNCTIONS = `
-- Function to check if tables exist
CREATE OR REPLACE FUNCTION check_table_exists(table_names text[])
RETURNS TABLE(table_name text, exists boolean) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    unnest(table_names) as table_name,
    EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = unnest(table_names)
    ) as exists;
END;
$$ LANGUAGE plpgsql;

-- Function to get table columns
CREATE OR REPLACE FUNCTION get_table_columns(table_name text)
RETURNS TABLE(column_name text, data_type text) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.column_name::text,
    c.data_type::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' 
  AND c.table_name = get_table_columns.table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to migrate a single user's role
CREATE OR REPLACE FUNCTION migrate_user_role(
  p_user_id uuid,
  p_old_role text,
  p_new_role text,
  p_institution_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_migration_id text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  v_assignment_id uuid;
BEGIN
  -- Update user's primary role information
  UPDATE users 
  SET 
    primary_role = p_new_role,
    role_status = 'active',
    role_verified_at = NOW(),
    role_assigned_by = p_user_id, -- Self-assigned during migration
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Create role assignment record
  INSERT INTO user_role_assignments (
    user_id,
    role,
    status,
    assigned_by,
    assigned_at,
    institution_id,
    department_id,
    is_temporary,
    metadata
  ) VALUES (
    p_user_id,
    p_new_role,
    'active',
    p_user_id,
    NOW(),
    p_institution_id,
    p_department_id,
    false,
    jsonb_build_object(
      'migrationId', p_migration_id,
      'oldRole', p_old_role,
      'migratedAt', NOW()
    )
  ) RETURNING id INTO v_assignment_id;

  -- Log the migration in audit trail
  INSERT INTO role_audit_log (
    user_id,
    action,
    old_role,
    new_role,
    changed_by,
    reason,
    timestamp,
    institution_id,
    department_id,
    metadata
  ) VALUES (
    p_user_id,
    'assigned',
    p_old_role,
    p_new_role,
    p_user_id,
    'Role system migration',
    NOW(),
    p_institution_id,
    p_department_id,
    jsonb_build_object(
      'migrationId', p_migration_id,
      'assignmentId', v_assignment_id,
      'automated', true
    )
  );

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Migration failed for user %: %', p_user_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Function to validate role assignments
CREATE OR REPLACE FUNCTION validate_role_assignments()
RETURNS TABLE(user_id uuid, issue text) AS $$
BEGIN
  RETURN QUERY
  -- Users without any active role assignments
  SELECT 
    u.id,
    'No active role assignment' as issue
  FROM users u
  LEFT JOIN user_role_assignments ura ON u.id = ura.user_id AND ura.status = 'active'
  WHERE ura.id IS NULL
  
  UNION ALL
  
  -- Users with mismatched primary_role and role assignments
  SELECT 
    u.id,
    'Primary role mismatch with assignments' as issue
  FROM users u
  JOIN user_role_assignments ura ON u.id = ura.user_id AND ura.status = 'active'
  WHERE u.primary_role != ura.role
  
  UNION ALL
  
  -- Role assignments without valid institutions
  SELECT 
    ura.user_id,
    'Invalid institution reference' as issue
  FROM user_role_assignments ura
  LEFT JOIN institutions i ON ura.institution_id = i.id
  WHERE i.id IS NULL;
END;
$$ LANGUAGE plpgsql;
`;

if (require.main === module) {
  main();
}

module.exports = { RoleMigrationService, DATABASE_FUNCTIONS };