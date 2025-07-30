#!/usr/bin/env node

/**
 * Role System Migration Script
 * Migrates existing user roles to the new role assignment system
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const OUTPUT_FILE = process.argv.includes('--output') ? 
  process.argv[process.argv.indexOf('--output') + 1] : 
  `migration-report-${new Date().toISOString().split('T')[0]}.json`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Role mapping from legacy to new system
 */
const ROLE_MAP = {
  'student': 'student',
  'teacher': 'teacher',
  'instructor': 'teacher',
  'faculty': 'teacher',
  'admin': 'institution_admin',
  'administrator': 'institution_admin',
  'institution_admin': 'institution_admin',
  'dept_admin': 'department_admin',
  'department_admin': 'department_admin',
  'system_admin': 'system_admin',
  'super_admin': 'system_admin'
};

/**
 * Migration statistics
 */
const stats = {
  totalUsers: 0,
  processedUsers: 0,
  migratedUsers: 0,
  skippedUsers: 0,
  failedUsers: 0,
  errors: [],
  warnings: [],
  rollbackData: []
};

/**
 * Log function with verbosity control
 */
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage);
  } else if (VERBOSE || level === 'info') {
    console.log(logMessage);
  }
}

/**
 * Normalize legacy role to new role system
 */
function normalizeRole(legacyRole) {
  if (!legacyRole) return null;
  return ROLE_MAP[legacyRole.toLowerCase()] || null;
}

/**
 * Create rollback data for a user
 */
function createRollbackData(user) {
  return {
    userId: user.id,
    originalRole: user.role || user.user_type,
    originalData: {
      role: user.role,
      user_type: user.user_type,
      primary_role: user.primary_role,
      role_status: user.role_status,
      role_verified_at: user.role_verified_at,
      role_assigned_by: user.role_assigned_by
    },
    migrationTimestamp: new Date().toISOString()
  };
}

/**
 * Migrate a single user
 */
async function migrateUser(user) {
  const rollbackData = createRollbackData(user);
  
  try {
    const normalizedRole = normalizeRole(user.role || user.user_type);
    
    if (!normalizedRole) {
      stats.warnings.push({
        userId: user.id,
        message: `Cannot normalize role: ${user.role || user.user_type}`,
        type: 'UNMAPPABLE_ROLE'
      });
      stats.skippedUsers++;
      return rollbackData;
    }

    // Check if user already has role assignment
    const { data: existingAssignment } = await supabase
      .from('user_role_assignments')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existingAssignment) {
      log(`User ${user.id} already migrated, skipping`, 'debug');
      stats.skippedUsers++;
      return null;
    }

    if (DRY_RUN) {
      log(`[DRY RUN] Would migrate user ${user.id}: ${user.role || user.user_type} -> ${normalizedRole}`, 'debug');
      stats.migratedUsers++;
      return rollbackData;
    }

    // Create new role assignment
    const { error: insertError } = await supabase
      .from('user_role_assignments')
      .insert({
        user_id: user.id,
        role: normalizedRole,
        status: 'active',
        assigned_by: null, // System migration
        assigned_at: user.created_at || new Date().toISOString(),
        institution_id: user.institution_id,
        department_id: user.department_id,
        is_temporary: false,
        metadata: {
          migrated_from: user.role || user.user_type,
          migration_timestamp: new Date().toISOString(),
          migration_script: 'migrate-role-system.js'
        }
      });

    if (insertError) {
      throw new Error(`Failed to create role assignment: ${insertError.message}`);
    }

    // Update user's primary role
    const { error: updateError } = await supabase
      .from('users')
      .update({
        primary_role: normalizedRole,
        role_status: 'active',
        role_verified_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(`Failed to update user primary role: ${updateError.message}`);
    }

    log(`Successfully migrated user ${user.id}: ${user.role || user.user_type} -> ${normalizedRole}`, 'debug');
    stats.migratedUsers++;
    return rollbackData;

  } catch (error) {
    stats.errors.push({
      userId: user.id,
      error: error.message,
      originalRole: user.role || user.user_type,
      type: 'MIGRATION_ERROR'
    });
    stats.failedUsers++;
    log(`Failed to migrate user ${user.id}: ${error.message}`, 'error');
    return rollbackData;
  }
}

/**
 * Validate migration prerequisites
 */
async function validatePrerequisites() {
  log('Validating migration prerequisites...');

  // Check if required tables exist
  const requiredTables = ['user_role_assignments', 'users'];
  
  for (const table of requiredTables) {
    const { error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      throw new Error(`Required table '${table}' not found or accessible: ${error.message}`);
    }
  }

  // Check for existing migrations
  const { count: existingMigrations } = await supabase
    .from('user_role_assignments')
    .select('*', { count: 'exact', head: true })
    .not('metadata->migration_timestamp', 'is', null);

  if (existingMigrations > 0) {
    log(`Warning: Found ${existingMigrations} existing migrated users`, 'warn');
  }

  log('Prerequisites validation completed');
}

/**
 * Generate migration report
 */
function generateReport() {
  const report = {
    migration: {
      timestamp: new Date().toISOString(),
      dryRun: DRY_RUN,
      statistics: stats
    },
    rollbackData: stats.rollbackData.filter(data => data !== null)
  };

  // Write report to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  log(`Migration report written to: ${OUTPUT_FILE}`);

  return report;
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    log(`Starting role system migration (DRY_RUN: ${DRY_RUN})`);
    
    // Validate prerequisites
    await validatePrerequisites();

    // Get all users with existing roles
    const { data: legacyUsers, error: fetchError } = await supabase
      .from('users')
      .select('id, role, user_type, institution_id, department_id, created_at, updated_at, primary_role, role_status, role_verified_at, role_assigned_by')
      .or('role.not.is.null,user_type.not.is.null');

    if (fetchError) {
      throw new Error(`Failed to fetch legacy users: ${fetchError.message}`);
    }

    if (!legacyUsers || legacyUsers.length === 0) {
      log('No users with legacy roles found');
      return generateReport();
    }

    stats.totalUsers = legacyUsers.length;
    log(`Found ${stats.totalUsers} users with legacy roles`);

    // Process users in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < legacyUsers.length; i += BATCH_SIZE) {
      const batch = legacyUsers.slice(i, i + BATCH_SIZE);
      log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(legacyUsers.length / BATCH_SIZE)}`);

      for (const user of batch) {
        const rollbackData = await migrateUser(user);
        if (rollbackData) {
          stats.rollbackData.push(rollbackData);
        }
        stats.processedUsers++;
      }

      // Small delay between batches to avoid overwhelming the database
      if (i + BATCH_SIZE < legacyUsers.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Generate final report
    const report = generateReport();

    // Print summary
    console.log('\n=== MIGRATION SUMMARY ===');
    console.log(`Total users: ${stats.totalUsers}`);
    console.log(`Processed: ${stats.processedUsers}`);
    console.log(`Migrated: ${stats.migratedUsers}`);
    console.log(`Skipped: ${stats.skippedUsers}`);
    console.log(`Failed: ${stats.failedUsers}`);
    console.log(`Errors: ${stats.errors.length}`);
    console.log(`Warnings: ${stats.warnings.length}`);
    console.log(`Report saved to: ${OUTPUT_FILE}`);

    if (stats.errors.length > 0) {
      console.log('\n=== ERRORS ===');
      stats.errors.forEach(error => {
        console.log(`User ${error.userId}: ${error.error}`);
      });
    }

    if (stats.warnings.length > 0) {
      console.log('\n=== WARNINGS ===');
      stats.warnings.forEach(warning => {
        console.log(`User ${warning.userId}: ${warning.message}`);
      });
    }

    if (DRY_RUN) {
      console.log('\n*** This was a DRY RUN - no changes were made ***');
      console.log('Run without --dry-run to execute the migration');
    }

    return report;

  } catch (error) {
    log(`Migration failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: node migrate-role-system.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run     Run migration without making changes');
  console.log('  --verbose     Enable verbose logging');
  console.log('  --output FILE Specify output file for migration report');
  console.log('  --help        Show this help message');
  console.log('');
  console.log('Environment variables required:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL');
  console.log('  SUPABASE_SERVICE_ROLE_KEY');
}

// Handle command line arguments
if (process.argv.includes('--help')) {
  printUsage();
  process.exit(0);
}

// Run migration
runMigration().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});