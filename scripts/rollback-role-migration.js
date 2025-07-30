#!/usr/bin/env node

/**
 * Role Migration Rollback Script
 * Rolls back role system migration using rollback data
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Get rollback file from command line
const rollbackFileIndex = process.argv.indexOf('--file');
const ROLLBACK_FILE = rollbackFileIndex !== -1 ? process.argv[rollbackFileIndex + 1] : null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!ROLLBACK_FILE) {
  console.error('Error: Rollback file not specified');
  console.error('Usage: node rollback-role-migration.js --file <rollback-file.json>');
  process.exit(1);
}

if (!fs.existsSync(ROLLBACK_FILE)) {
  console.error(`Error: Rollback file not found: ${ROLLBACK_FILE}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Rollback statistics
 */
const stats = {
  totalOperations: 0,
  processedOperations: 0,
  successfulRollbacks: 0,
  failedRollbacks: 0,
  errors: []
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
 * Rollback a single user's migration
 */
async function rollbackUser(rollbackData) {
  try {
    const { userId, originalData, migrationTimestamp } = rollbackData;

    if (DRY_RUN) {
      log(`[DRY RUN] Would rollback user ${userId}`, 'debug');
      stats.successfulRollbacks++;
      return;
    }

    // Remove role assignment created during migration
    const { error: deleteError } = await supabase
      .from('user_role_assignments')
      .delete()
      .eq('user_id', userId)
      .eq('metadata->migration_timestamp', migrationTimestamp);

    if (deleteError) {
      throw new Error(`Failed to delete role assignment: ${deleteError.message}`);
    }

    // Restore original user data
    const { error: restoreError } = await supabase
      .from('users')
      .update({
        role: originalData.role,
        user_type: originalData.user_type,
        primary_role: originalData.primary_role,
        role_status: originalData.role_status,
        role_verified_at: originalData.role_verified_at,
        role_assigned_by: originalData.role_assigned_by
      })
      .eq('id', userId);

    if (restoreError) {
      throw new Error(`Failed to restore user data: ${restoreError.message}`);
    }

    log(`Successfully rolled back user ${userId}`, 'debug');
    stats.successfulRollbacks++;

  } catch (error) {
    stats.errors.push({
      userId: rollbackData.userId,
      error: error.message,
      type: 'ROLLBACK_ERROR'
    });
    stats.failedRollbacks++;
    log(`Failed to rollback user ${rollbackData.userId}: ${error.message}`, 'error');
  }
}

/**
 * Validate rollback prerequisites
 */
async function validatePrerequisites(rollbackData) {
  log('Validating rollback prerequisites...');

  // Check if rollback data is valid
  if (!rollbackData || !Array.isArray(rollbackData)) {
    throw new Error('Invalid rollback data format');
  }

  if (rollbackData.length === 0) {
    throw new Error('No rollback data found');
  }

  // Validate rollback data structure
  for (const data of rollbackData.slice(0, 5)) { // Check first 5 entries
    if (!data.userId || !data.originalData || !data.migrationTimestamp) {
      throw new Error('Invalid rollback data structure');
    }
  }

  // Check if users still exist
  const userIds = rollbackData.map(data => data.userId).slice(0, 10); // Check first 10
  const { data: existingUsers, error } = await supabase
    .from('users')
    .select('id')
    .in('id', userIds);

  if (error) {
    throw new Error(`Failed to validate users: ${error.message}`);
  }

  if (existingUsers.length !== userIds.length) {
    log(`Warning: Some users from rollback data no longer exist`, 'warn');
  }

  log('Prerequisites validation completed');
}

/**
 * Load and parse rollback file
 */
function loadRollbackFile() {
  try {
    log(`Loading rollback file: ${ROLLBACK_FILE}`);
    const fileContent = fs.readFileSync(ROLLBACK_FILE, 'utf8');
    const rollbackReport = JSON.parse(fileContent);

    if (!rollbackReport.rollbackData) {
      throw new Error('Rollback file does not contain rollback data');
    }

    return rollbackReport.rollbackData;
  } catch (error) {
    throw new Error(`Failed to load rollback file: ${error.message}`);
  }
}

/**
 * Generate rollback report
 */
function generateRollbackReport() {
  const report = {
    rollback: {
      timestamp: new Date().toISOString(),
      dryRun: DRY_RUN,
      sourceFile: ROLLBACK_FILE,
      statistics: stats
    }
  };

  const outputFile = `rollback-report-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  log(`Rollback report written to: ${outputFile}`);

  return report;
}

/**
 * Main rollback function
 */
async function runRollback() {
  try {
    log(`Starting role migration rollback (DRY_RUN: ${DRY_RUN})`);
    
    // Load rollback data
    const rollbackData = loadRollbackFile();
    stats.totalOperations = rollbackData.length;
    
    log(`Loaded ${stats.totalOperations} rollback operations`);

    // Validate prerequisites
    await validatePrerequisites(rollbackData);

    // Process rollback operations in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < rollbackData.length; i += BATCH_SIZE) {
      const batch = rollbackData.slice(i, i + BATCH_SIZE);
      log(`Processing rollback batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rollbackData.length / BATCH_SIZE)}`);

      for (const data of batch) {
        await rollbackUser(data);
        stats.processedOperations++;
      }

      // Small delay between batches
      if (i + BATCH_SIZE < rollbackData.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Generate final report
    const report = generateRollbackReport();

    // Print summary
    console.log('\n=== ROLLBACK SUMMARY ===');
    console.log(`Total operations: ${stats.totalOperations}`);
    console.log(`Processed: ${stats.processedOperations}`);
    console.log(`Successful: ${stats.successfulRollbacks}`);
    console.log(`Failed: ${stats.failedRollbacks}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n=== ERRORS ===');
      stats.errors.forEach(error => {
        console.log(`User ${error.userId}: ${error.error}`);
      });
    }

    if (DRY_RUN) {
      console.log('\n*** This was a DRY RUN - no changes were made ***');
      console.log('Run without --dry-run to execute the rollback');
    }

    return report;

  } catch (error) {
    log(`Rollback failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: node rollback-role-migration.js --file <rollback-file.json> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --file FILE   Specify rollback file (required)');
  console.log('  --dry-run     Run rollback without making changes');
  console.log('  --verbose     Enable verbose logging');
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

// Run rollback
runRollback().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});