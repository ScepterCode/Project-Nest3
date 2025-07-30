#!/usr/bin/env node

/**
 * Role Management Database Schema Validation Script
 * Validates that all required tables, constraints, indexes, and functions are properly created
 * Requirements: 1.1, 7.1
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Validation functions
 */

async function validateTables() {
  console.log('🔍 Validating required tables...');
  
  const requiredTables = [
    'user_role_assignments',
    'role_requests',
    'role_audit_log', 
    'institution_domains',
    'permissions',
    'role_permissions'
  ];

  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .in('table_name', requiredTables)
    .eq('table_schema', 'public');

  if (error) {
    console.error('❌ Error checking tables:', error.message);
    return false;
  }

  const foundTables = data.map(row => row.table_name);
  const missingTables = requiredTables.filter(table => !foundTables.includes(table));

  if (missingTables.length > 0) {
    console.error('❌ Missing tables:', missingTables.join(', '));
    return false;
  }

  console.log('✅ All required tables exist');
  return true;
}

async function validateConstraints() {
  console.log('🔍 Validating database constraints...');
  
  const requiredConstraints = [
    'chk_user_role_assignments_role',
    'chk_user_role_assignments_status',
    'chk_role_requests_requested_role',
    'chk_role_requests_status',
    'chk_role_requests_verification_method',
    'chk_role_audit_log_action',
    'chk_institution_domains_domain',
    'chk_permissions_category',
    'chk_permissions_scope',
    'chk_permissions_name',
    'chk_role_permissions_role'
  ];

  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT constraint_name 
        FROM information_schema.check_constraints 
        WHERE constraint_name = ANY($1)
      `,
      params: [requiredConstraints]
    });

    if (error) {
      console.error('❌ Error checking constraints:', error.message);
      return false;
    }

    const foundConstraints = data.map(row => row.constraint_name);
    const missingConstraints = requiredConstraints.filter(constraint => 
      !foundConstraints.includes(constraint)
    );

    if (missingConstraints.length > 0) {
      console.error('❌ Missing constraints:', missingConstraints.join(', '));
      return false;
    }

    console.log('✅ All required constraints exist');
    return true;
  } catch (error) {
    console.error('❌ Error validating constraints:', error.message);
    return false;
  }
}

async function validateIndexes() {
  console.log('🔍 Validating database indexes...');
  
  const criticalIndexes = [
    'idx_users_primary_role',
    'idx_user_role_assignments_user_id',
    'idx_user_role_assignments_active',
    'idx_role_requests_pending',
    'idx_role_audit_log_user_timestamp',
    'idx_permissions_name',
    'idx_role_permissions_role'
  ];

  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT indexname 
        FROM pg_indexes 
        WHERE indexname = ANY($1)
      `,
      params: [criticalIndexes]
    });

    if (error) {
      console.error('❌ Error checking indexes:', error.message);
      return false;
    }

    const foundIndexes = data.map(row => row.indexname);
    const missingIndexes = criticalIndexes.filter(index => 
      !foundIndexes.includes(index)
    );

    if (missingIndexes.length > 0) {
      console.error('❌ Missing indexes:', missingIndexes.join(', '));
      return false;
    }

    console.log('✅ All critical indexes exist');
    return true;
  } catch (error) {
    console.error('❌ Error validating indexes:', error.message);
    return false;
  }
}

async function validateFunctions() {
  console.log('🔍 Validating database functions...');
  
  const requiredFunctions = [
    'expire_temporary_roles',
    'cleanup_expired_role_requests',
    'log_role_change'
  ];

  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_name = ANY($1) AND routine_schema = 'public'
      `,
      params: [requiredFunctions]
    });

    if (error) {
      console.error('❌ Error checking functions:', error.message);
      return false;
    }

    const foundFunctions = data.map(row => row.routine_name);
    const missingFunctions = requiredFunctions.filter(func => 
      !foundFunctions.includes(func)
    );

    if (missingFunctions.length > 0) {
      console.error('❌ Missing functions:', missingFunctions.join(', '));
      return false;
    }

    console.log('✅ All required functions exist');
    return true;
  } catch (error) {
    console.error('❌ Error validating functions:', error.message);
    return false;
  }
}

async function validateTriggers() {
  console.log('🔍 Validating database triggers...');
  
  const requiredTriggers = [
    'trigger_log_role_change'
  ];

  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE trigger_name = ANY($1)
      `,
      params: [requiredTriggers]
    });

    if (error) {
      console.error('❌ Error checking triggers:', error.message);
      return false;
    }

    const foundTriggers = data.map(row => row.trigger_name);
    const missingTriggers = requiredTriggers.filter(trigger => 
      !foundTriggers.includes(trigger)
    );

    if (missingTriggers.length > 0) {
      console.error('❌ Missing triggers:', missingTriggers.join(', '));
      return false;
    }

    console.log('✅ All required triggers exist');
    return true;
  } catch (error) {
    console.error('❌ Error validating triggers:', error.message);
    return false;
  }
}

async function validateDefaultData() {
  console.log('🔍 Validating default permissions data...');
  
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('name, category, scope')
      .order('name');

    if (error) {
      console.error('❌ Error checking default permissions:', error.message);
      return false;
    }

    const expectedPermissions = [
      'view_content',
      'create_content', 
      'edit_content',
      'delete_content',
      'publish_content',
      'view_users',
      'invite_users',
      'manage_user_roles',
      'suspend_users',
      'view_analytics',
      'export_analytics',
      'view_institution_analytics',
      'manage_institution',
      'manage_departments',
      'system_administration'
    ];

    const foundPermissions = data.map(row => row.name);
    const missingPermissions = expectedPermissions.filter(perm => 
      !foundPermissions.includes(perm)
    );

    if (missingPermissions.length > 0) {
      console.error('❌ Missing default permissions:', missingPermissions.join(', '));
      return false;
    }

    console.log('✅ All default permissions exist');
    return true;
  } catch (error) {
    console.error('❌ Error validating default data:', error.message);
    return false;
  }
}

async function validateRolePermissionMappings() {
  console.log('🔍 Validating role-permission mappings...');
  
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select(`
        role,
        permissions!inner(name)
      `)
      .order('role');

    if (error) {
      console.error('❌ Error checking role-permission mappings:', error.message);
      return false;
    }

    // Group by role
    const rolePermissions = data.reduce((acc, row) => {
      if (!acc[row.role]) acc[row.role] = [];
      acc[row.role].push(row.permissions.name);
      return acc;
    }, {});

    // Validate each role has appropriate permissions
    const requiredRoles = ['student', 'teacher', 'department_admin', 'institution_admin', 'system_admin'];
    
    for (const role of requiredRoles) {
      if (!rolePermissions[role] || rolePermissions[role].length === 0) {
        console.error(`❌ Role ${role} has no permissions assigned`);
        return false;
      }
    }

    // Validate system_admin has all permissions
    const allPermissions = await supabase.from('permissions').select('name');
    const systemAdminPermissions = rolePermissions['system_admin'] || [];
    
    if (systemAdminPermissions.length !== allPermissions.data.length) {
      console.error('❌ System admin does not have all permissions');
      return false;
    }

    console.log('✅ All role-permission mappings are valid');
    return true;
  } catch (error) {
    console.error('❌ Error validating role-permission mappings:', error.message);
    return false;
  }
}

async function testFunctionality() {
  console.log('🔍 Testing database functionality...');
  
  try {
    // Test expire_temporary_roles function
    const { data: expiredCount, error: expireError } = await supabase.rpc('expire_temporary_roles');
    
    if (expireError) {
      console.error('❌ Error testing expire_temporary_roles:', expireError.message);
      return false;
    }

    // Test cleanup_expired_role_requests function
    const { data: cleanupCount, error: cleanupError } = await supabase.rpc('cleanup_expired_role_requests');
    
    if (cleanupError) {
      console.error('❌ Error testing cleanup_expired_role_requests:', cleanupError.message);
      return false;
    }

    console.log('✅ Database functions are working correctly');
    console.log(`   - Expired ${expiredCount} temporary roles`);
    console.log(`   - Cleaned up ${cleanupCount} expired role requests`);
    return true;
  } catch (error) {
    console.error('❌ Error testing functionality:', error.message);
    return false;
  }
}

/**
 * Main validation function
 */
async function validateSchema() {
  console.log('🚀 Starting Role Management Database Schema Validation\n');
  
  const validations = [
    validateTables,
    validateConstraints,
    validateIndexes,
    validateFunctions,
    validateTriggers,
    validateDefaultData,
    validateRolePermissionMappings,
    testFunctionality
  ];

  let allValid = true;

  for (const validation of validations) {
    try {
      const isValid = await validation();
      if (!isValid) {
        allValid = false;
      }
      console.log(''); // Add spacing between validations
    } catch (error) {
      console.error('❌ Validation error:', error.message);
      allValid = false;
      console.log('');
    }
  }

  if (allValid) {
    console.log('🎉 All validations passed! Role management database schema is properly configured.');
    process.exit(0);
  } else {
    console.log('💥 Some validations failed. Please check the database schema.');
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  validateSchema().catch(error => {
    console.error('💥 Validation script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { validateSchema };