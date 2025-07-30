#!/usr/bin/env node

/**
 * Role System Validation Script
 * Validates role assignment system integrity and generates reports
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VERBOSE = process.argv.includes('--verbose');
const FIX_ERRORS = process.argv.includes('--fix');
const OUTPUT_FILE = process.argv.includes('--output') ? 
  process.argv[process.argv.indexOf('--output') + 1] : 
  `validation-report-${new Date().toISOString().split('T')[0]}.json`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Valid role and status values
 */
const VALID_ROLES = ['student', 'teacher', 'department_admin', 'institution_admin', 'system_admin'];
const VALID_STATUSES = ['active', 'pending', 'suspended', 'expired'];

/**
 * Validation results
 */
const validationResults = {
  timestamp: new Date().toISOString(),
  isValid: true,
  errors: [],
  warnings: [],
  statistics: {},
  fixedErrors: []
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
 * Add error to results
 */
function addError(type, message, details = {}) {
  validationResults.errors.push({
    type,
    message,
    details,
    timestamp: new Date().toISOString()
  });
  validationResults.isValid = false;
  log(message, 'error');
}

/**
 * Add warning to results
 */
function addWarning(type, message, details = {}) {
  validationResults.warnings.push({
    type,
    message,
    details,
    timestamp: new Date().toISOString()
  });
  log(message, 'warn');
}

/**
 * Check for orphaned role assignments
 */
async function checkOrphanedAssignments() {
  log('Checking for orphaned role assignments...');
  
  try {
    const { data: orphanedAssignments, error } = await supabase
      .from('user_role_assignments')
      .select('id, user_id')
      .not('user_id', 'in', `(SELECT id FROM users)`);

    if (error) {
      addError('QUERY_ERROR', `Failed to check orphaned assignments: ${error.message}`);
      return;
    }

    if (orphanedAssignments && orphanedAssignments.length > 0) {
      for (const assignment of orphanedAssignments) {
        addError('ORPHANED_ASSIGNMENT', 
          `Role assignment ${assignment.id} references non-existent user ${assignment.user_id}`,
          { assignmentId: assignment.id, userId: assignment.user_id });

        // Fix if requested
        if (FIX_ERRORS) {
          const { error: deleteError } = await supabase
            .from('user_role_assignments')
            .delete()
            .eq('id', assignment.id);

          if (!deleteError) {
            validationResults.fixedErrors.push({
              type: 'ORPHANED_ASSIGNMENT',
              action: 'DELETED',
              assignmentId: assignment.id
            });
            log(`Fixed: Deleted orphaned assignment ${assignment.id}`, 'info');
          }
        }
      }
    }

    log(`Found ${orphanedAssignments?.length || 0} orphaned assignments`);
  } catch (error) {
    addError('VALIDATION_ERROR', `Error checking orphaned assignments: ${error.message}`);
  }
}

/**
 * Check for invalid role values
 */
async function checkInvalidRoles() {
  log('Checking for invalid role values...');
  
  try {
    const { data: assignments, error } = await supabase
      .from('user_role_assignments')
      .select('id, user_id, role');

    if (error) {
      addError('QUERY_ERROR', `Failed to check role validity: ${error.message}`);
      return;
    }

    if (assignments) {
      for (const assignment of assignments) {
        if (!VALID_ROLES.includes(assignment.role)) {
          addError('INVALID_ROLE', 
            `Invalid role "${assignment.role}" in assignment ${assignment.id}`,
            { assignmentId: assignment.id, userId: assignment.user_id, invalidRole: assignment.role });
        }
      }
    }

    log(`Checked ${assignments?.length || 0} role assignments for validity`);
  } catch (error) {
    addError('VALIDATION_ERROR', `Error checking role validity: ${error.message}`);
  }
}

/**
 * Check for invalid status values
 */
async function checkInvalidStatuses() {
  log('Checking for invalid status values...');
  
  try {
    const { data: assignments, error } = await supabase
      .from('user_role_assignments')
      .select('id, user_id, status');

    if (error) {
      addError('QUERY_ERROR', `Failed to check status validity: ${error.message}`);
      return;
    }

    if (assignments) {
      for (const assignment of assignments) {
        if (!VALID_STATUSES.includes(assignment.status)) {
          addError('INVALID_STATUS', 
            `Invalid status "${assignment.status}" in assignment ${assignment.id}`,
            { assignmentId: assignment.id, userId: assignment.user_id, invalidStatus: assignment.status });
        }
      }
    }

    log(`Checked ${assignments?.length || 0} assignments for status validity`);
  } catch (error) {
    addError('VALIDATION_ERROR', `Error checking status validity: ${error.message}`);
  }
}

/**
 * Check for missing institution references
 */
async function checkInstitutionIntegrity() {
  log('Checking institution integrity...');
  
  try {
    // Check for assignments without institution_id
    const { data: missingInstitution, error: missingError } = await supabase
      .from('user_role_assignments')
      .select('id, user_id')
      .is('institution_id', null);

    if (missingError) {
      addError('QUERY_ERROR', `Failed to check missing institutions: ${missingError.message}`);
      return;
    }

    if (missingInstitution && missingInstitution.length > 0) {
      for (const assignment of missingInstitution) {
        addError('MISSING_INSTITUTION', 
          `Role assignment ${assignment.id} is missing institution_id`,
          { assignmentId: assignment.id, userId: assignment.user_id });
      }
    }

    // Check for invalid institution references
    const { data: invalidInstitution, error: invalidError } = await supabase
      .from('user_role_assignments')
      .select('id, user_id, institution_id')
      .not('institution_id', 'is', null)
      .not('institution_id', 'in', `(SELECT id FROM institutions)`);

    if (invalidError) {
      addError('QUERY_ERROR', `Failed to check invalid institutions: ${invalidError.message}`);
      return;
    }

    if (invalidInstitution && invalidInstitution.length > 0) {
      for (const assignment of invalidInstitution) {
        addError('INVALID_INSTITUTION', 
          `Role assignment ${assignment.id} references non-existent institution ${assignment.institution_id}`,
          { assignmentId: assignment.id, userId: assignment.user_id, institutionId: assignment.institution_id });
      }
    }

    log(`Found ${missingInstitution?.length || 0} assignments with missing institution`);
    log(`Found ${invalidInstitution?.length || 0} assignments with invalid institution`);
  } catch (error) {
    addError('VALIDATION_ERROR', `Error checking institution integrity: ${error.message}`);
  }
}

/**
 * Check for expired roles that are still active
 */
async function checkExpiredRoles() {
  log('Checking for expired roles...');
  
  try {
    const { data: expiredActive, error } = await supabase
      .from('user_role_assignments')
      .select('id, user_id, expires_at')
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString());

    if (error) {
      addError('QUERY_ERROR', `Failed to check expired roles: ${error.message}`);
      return;
    }

    if (expiredActive && expiredActive.length > 0) {
      for (const assignment of expiredActive) {
        addError('EXPIRED_ROLE', 
          `Role assignment ${assignment.id} is expired but still active`,
          { assignmentId: assignment.id, userId: assignment.user_id, expiresAt: assignment.expires_at });

        // Fix if requested
        if (FIX_ERRORS) {
          const { error: updateError } = await supabase
            .from('user_role_assignments')
            .update({ status: 'expired' })
            .eq('id', assignment.id);

          if (!updateError) {
            validationResults.fixedErrors.push({
              type: 'EXPIRED_ROLE',
              action: 'STATUS_UPDATED',
              assignmentId: assignment.id
            });
            log(`Fixed: Updated expired role ${assignment.id} to expired status`, 'info');
          }
        }
      }
    }

    log(`Found ${expiredActive?.length || 0} expired roles still marked as active`);
  } catch (error) {
    addError('VALIDATION_ERROR', `Error checking expired roles: ${error.message}`);
  }
}

/**
 * Check for duplicate role assignments
 */
async function checkDuplicateAssignments() {
  log('Checking for duplicate role assignments...');
  
  try {
    const { data: assignments, error } = await supabase
      .from('user_role_assignments')
      .select('user_id, role, status')
      .eq('status', 'active');

    if (error) {
      addError('QUERY_ERROR', `Failed to check duplicate assignments: ${error.message}`);
      return;
    }

    if (assignments) {
      const userRoles = new Map();
      
      for (const assignment of assignments) {
        const key = `${assignment.user_id}-${assignment.role}`;
        if (userRoles.has(key)) {
          addError('DUPLICATE_ASSIGNMENT', 
            `User ${assignment.user_id} has duplicate ${assignment.role} assignments`,
            { userId: assignment.user_id, role: assignment.role });
        } else {
          userRoles.set(key, true);
        }
      }
    }

    log(`Checked ${assignments?.length || 0} assignments for duplicates`);
  } catch (error) {
    addError('VALIDATION_ERROR', `Error checking duplicate assignments: ${error.message}`);
  }
}

/**
 * Check department admin assignments without department_id
 */
async function checkDepartmentAdminIntegrity() {
  log('Checking department admin integrity...');
  
  try {
    const { data: missingDepartment, error } = await supabase
      .from('user_role_assignments')
      .select('id, user_id')
      .eq('role', 'department_admin')
      .is('department_id', null);

    if (error) {
      addError('QUERY_ERROR', `Failed to check department admin integrity: ${error.message}`);
      return;
    }

    if (missingDepartment && missingDepartment.length > 0) {
      for (const assignment of missingDepartment) {
        addWarning('MISSING_DEPARTMENT', 
          `Department admin assignment ${assignment.id} is missing department_id`,
          { assignmentId: assignment.id, userId: assignment.user_id });
      }
    }

    log(`Found ${missingDepartment?.length || 0} department admin assignments without department_id`);
  } catch (error) {
    addError('VALIDATION_ERROR', `Error checking department admin integrity: ${error.message}`);
  }
}

/**
 * Generate system statistics
 */
async function generateStatistics() {
  log('Generating system statistics...');
  
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Total assignments
    const { count: totalAssignments } = await supabase
      .from('user_role_assignments')
      .select('*', { count: 'exact', head: true });

    // Active assignments
    const { count: activeAssignments } = await supabase
      .from('user_role_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Role distribution
    const { data: roleDistData } = await supabase
      .from('user_role_assignments')
      .select('role')
      .eq('status', 'active');

    const roleDistribution = {};
    VALID_ROLES.forEach(role => roleDistribution[role] = 0);
    
    if (roleDistData) {
      roleDistData.forEach(assignment => {
        if (assignment.role in roleDistribution) {
          roleDistribution[assignment.role]++;
        }
      });
    }

    // Migration status
    const { count: migratedUsers } = await supabase
      .from('user_role_assignments')
      .select('*', { count: 'exact', head: true })
      .not('metadata->migration_timestamp', 'is', null);

    validationResults.statistics = {
      totalUsers: totalUsers || 0,
      totalAssignments: totalAssignments || 0,
      activeAssignments: activeAssignments || 0,
      roleDistribution,
      migratedUsers: migratedUsers || 0,
      migrationProgress: totalUsers ? (migratedUsers || 0) / totalUsers * 100 : 0
    };

    log('Statistics generated successfully');
  } catch (error) {
    addError('VALIDATION_ERROR', `Error generating statistics: ${error.message}`);
  }
}

/**
 * Save validation report
 */
function saveReport() {
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validationResults, null, 2));
    log(`Validation report saved to: ${OUTPUT_FILE}`);
  } catch (error) {
    log(`Failed to save report: ${error.message}`, 'error');
  }
}

/**
 * Main validation function
 */
async function runValidation() {
  try {
    log('Starting role system validation...');
    
    // Run all validation checks
    await checkOrphanedAssignments();
    await checkInvalidRoles();
    await checkInvalidStatuses();
    await checkInstitutionIntegrity();
    await checkExpiredRoles();
    await checkDuplicateAssignments();
    await checkDepartmentAdminIntegrity();
    
    // Generate statistics
    await generateStatistics();
    
    // Save report
    saveReport();

    // Print summary
    console.log('\n=== VALIDATION SUMMARY ===');
    console.log(`Validation Status: ${validationResults.isValid ? 'PASSED' : 'FAILED'}`);
    console.log(`Errors: ${validationResults.errors.length}`);
    console.log(`Warnings: ${validationResults.warnings.length}`);
    console.log(`Fixed Errors: ${validationResults.fixedErrors.length}`);
    console.log(`Report saved to: ${OUTPUT_FILE}`);

    if (validationResults.statistics) {
      console.log('\n=== STATISTICS ===');
      console.log(`Total Users: ${validationResults.statistics.totalUsers}`);
      console.log(`Total Assignments: ${validationResults.statistics.totalAssignments}`);
      console.log(`Active Assignments: ${validationResults.statistics.activeAssignments}`);
      console.log(`Migration Progress: ${validationResults.statistics.migrationProgress.toFixed(1)}%`);
      
      console.log('\n=== ROLE DISTRIBUTION ===');
      Object.entries(validationResults.statistics.roleDistribution).forEach(([role, count]) => {
        console.log(`${role}: ${count}`);
      });
    }

    if (validationResults.errors.length > 0) {
      console.log('\n=== ERRORS ===');
      validationResults.errors.forEach(error => {
        console.log(`[${error.type}] ${error.message}`);
      });
    }

    if (validationResults.warnings.length > 0) {
      console.log('\n=== WARNINGS ===');
      validationResults.warnings.forEach(warning => {
        console.log(`[${warning.type}] ${warning.message}`);
      });
    }

    if (validationResults.fixedErrors.length > 0) {
      console.log('\n=== FIXED ERRORS ===');
      validationResults.fixedErrors.forEach(fix => {
        console.log(`[${fix.type}] ${fix.action}: ${fix.assignmentId || 'N/A'}`);
      });
    }

    if (FIX_ERRORS) {
      console.log('\n*** Auto-fix was enabled - some errors may have been corrected ***');
    }

    return validationResults;

  } catch (error) {
    log(`Validation failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: node validate-role-system.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --fix         Automatically fix errors where possible');
  console.log('  --verbose     Enable verbose logging');
  console.log('  --output FILE Specify output file for validation report');
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

// Run validation
runValidation().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});