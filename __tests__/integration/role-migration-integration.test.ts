/**
 * Role Migration Integration Tests
 * 
 * End-to-end integration tests for the complete role migration system,
 * including migration, validation, rollback, and compatibility layers.
 * 
 * Requirements: 1.1, 1.5
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { RoleCompatibilityService } from '../../lib/services/role-compatibility-service';
import { RoleValidationService } from '../../lib/services/role-validation-service';
import { RoleRollbackService } from '../../lib/services/role-rollback-service';
import { UserRole, RoleStatus } from '../../lib/types/role-management';

// Test database configuration
const TEST_SUPABASE_URL = process.env.TEST_SUPABASE_URL || 'http://localhost:54321';
const TEST_SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || 'test-key';

describe('Role Migration System Integration', () => {
  let supabase: any;
  let compatibilityService: RoleCompatibilityService;
  let validationService: RoleValidationService;
  let rollbackService: RoleRollbackService;
  let testUsers: any[] = [];
  let testInstitution: any;

  beforeAll(async () => {
    // Initialize test database connection
    supabase = createClient(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY);
    
    // Initialize services
    compatibilityService = new RoleCompatibilityService({
      enableLegacySupport: true,
      migrationMode: 'hybrid',
      fallbackToLegacy: true,
      logCompatibilityIssues: false
    });
    
    validationService = new RoleValidationService();
    rollbackService = new RoleRollbackService();

    // Set up test data
    await setupTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Reset any test-specific state
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any test-specific changes
  });

  describe('Complete Migration Workflow', () => {
    it('should successfully migrate users from legacy to new role system', async () => {
      // 1. Create users with legacy role data only
      const legacyUsers = await createLegacyUsers([
        { email: 'teacher1@test.edu', role: 'instructor' },
        { email: 'admin1@test.edu', role: 'admin' },
        { email: 'student1@test.edu', role: 'student' }
      ]);

      // 2. Verify users need migration
      for (const user of legacyUsers) {
        const status = await compatibilityService.getCompatibilityStatus(user.id);
        expect(status.needsMigration).toBe(true);
        expect(status.hasLegacyRoleData).toBe(true);
        expect(status.hasNewRoleData).toBe(false);
      }

      // 3. Create rollback snapshot before migration
      const snapshot = await rollbackService.createRollbackSnapshot(
        'Pre-migration test snapshot',
        legacyUsers.map(u => u.id)
      );
      expect(snapshot.id).toMatch(/^snapshot_/);
      expect(snapshot.userCount).toBe(3);

      // 4. Perform migration (simulated through compatibility service)
      const migrationResults = [];
      for (const user of legacyUsers) {
        const role = await compatibilityService.getUserRole(user.id);
        migrationResults.push({ userId: user.id, role });
      }

      // 5. Verify migration results
      expect(migrationResults[0].role).toBe(UserRole.TEACHER); // instructor -> teacher
      expect(migrationResults[1].role).toBe(UserRole.INSTITUTION_ADMIN); // admin -> institution_admin
      expect(migrationResults[2].role).toBe(UserRole.STUDENT); // student -> student

      // 6. Validate migrated users
      for (const user of legacyUsers) {
        const validation = await validationService.validateUserRoles(user.id);
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }

      // 7. Verify compatibility status after migration
      for (const user of legacyUsers) {
        const status = await compatibilityService.getCompatibilityStatus(user.id);
        expect(status.hasNewRoleData).toBe(true);
        expect(status.needsMigration).toBe(false);
      }
    });

    it('should handle partial migration failures gracefully', async () => {
      // 1. Create users with some having invalid data
      const mixedUsers = await createLegacyUsers([
        { email: 'valid1@test.edu', role: 'teacher' },
        { email: 'invalid@test.edu', role: 'invalid_role' }, // Invalid role
        { email: 'valid2@test.edu', role: 'student' }
      ]);

      // 2. Create snapshot
      const snapshot = await rollbackService.createRollbackSnapshot(
        'Partial migration test',
        mixedUsers.map(u => u.id)
      );

      // 3. Attempt migration
      const results = [];
      for (const user of mixedUsers) {
        try {
          const role = await compatibilityService.getUserRole(user.id);
          results.push({ userId: user.id, role, success: true });
        } catch (error) {
          results.push({ userId: user.id, error: error.message, success: false });
        }
      }

      // 4. Verify partial success
      const successfulMigrations = results.filter(r => r.success);
      const failedMigrations = results.filter(r => !r.success);

      expect(successfulMigrations).toHaveLength(2);
      expect(failedMigrations).toHaveLength(1);

      // 5. Validate successful migrations
      for (const result of successfulMigrations) {
        const validation = await validationService.validateUserRoles(result.userId);
        expect(validation.isValid).toBe(true);
      }

      // 6. Rollback if needed
      if (failedMigrations.length > 0) {
        const rollbackResult = await rollbackService.rollbackToSnapshot(
          snapshot.id,
          'Partial migration failure'
        );
        expect(rollbackResult.success).toBe(true);
      }
    });
  });

  describe('Validation and Error Detection', () => {
    it('should detect and report role assignment inconsistencies', async () => {
      // 1. Create users with intentional inconsistencies
      const user = await createUserWithInconsistentRoles();

      // 2. Run validation
      const validation = await validationService.validateUserRoles(user.id);

      // 3. Verify issues are detected
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length + validation.warnings.length).toBeGreaterThan(0);

      // 4. Check for specific issue types
      const hasRoleMismatch = validation.warnings.some(w => 
        w.code === 'PRIMARY_ROLE_MISMATCH'
      );
      expect(hasRoleMismatch).toBe(true);
    });

    it('should run comprehensive system validation', async () => {
      // 1. Create a mix of valid and invalid users
      await createMixedValidityUsers();

      // 2. Run system-wide validation
      const report = await validationService.validateSystem();

      // 3. Verify report structure
      expect(report.totalUsers).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
      expect(report.summary.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.healthScore).toBeLessThanOrEqual(100);

      // 4. Verify issue categorization
      expect(report.summary.totalIssues).toBe(
        report.summary.criticalIssues +
        report.summary.highPriorityIssues +
        report.summary.mediumPriorityIssues +
        report.summary.lowPriorityIssues
      );
    });

    it('should validate orphaned and duplicate assignments', async () => {
      // 1. Create orphaned assignments (assignments without users)
      await createOrphanedAssignments();

      // 2. Create duplicate assignments
      await createDuplicateAssignments();

      // 3. Run specific validations
      const orphanedIssues = await validationService.validateOrphanedAssignments();
      const duplicateIssues = await validationService.validateDuplicateAssignments();

      // 4. Verify issues are detected
      expect(orphanedIssues.length).toBeGreaterThan(0);
      expect(duplicateIssues.length).toBeGreaterThan(0);

      // 5. Verify issue details
      expect(orphanedIssues[0].issueType).toBe('ORPHANED_ASSIGNMENT');
      expect(duplicateIssues[0].issueType).toBe('DUPLICATE_ASSIGNMENT');
    });
  });

  describe('Rollback and Recovery', () => {
    it('should successfully rollback individual role assignments', async () => {
      // 1. Create user with role assignment
      const user = await createUserWithRoleAssignment('teacher');
      const originalAssignment = await getUserRoleAssignment(user.id);

      // 2. Change the role
      await changeUserRole(user.id, 'department_admin');
      const newAssignment = await getUserRoleAssignment(user.id);
      expect(newAssignment.role).toBe('department_admin');

      // 3. Rollback the role change
      const rollbackResult = await rollbackService.rollbackRoleAssignment(
        newAssignment.id,
        'Test rollback'
      );

      // 4. Verify rollback success
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.affectedUsers).toBe(1);

      // 5. Verify role is restored
      const restoredAssignment = await getUserRoleAssignment(user.id);
      expect(restoredAssignment.role).toBe(originalAssignment.role);
    });

    it('should handle bulk rollback operations', async () => {
      // 1. Create multiple users and perform bulk assignment
      const users = await createMultipleUsers(5);
      const bulkOperationId = `bulk_${Date.now()}`;
      
      await performBulkRoleAssignment(users, 'teacher', bulkOperationId);

      // 2. Verify assignments were created
      for (const user of users) {
        const assignment = await getUserRoleAssignment(user.id);
        expect(assignment.role).toBe('teacher');
        expect(assignment.metadata.bulkOperationId).toBe(bulkOperationId);
      }

      // 3. Rollback bulk operation
      const rollbackResult = await rollbackService.rollbackBulkAssignment(
        bulkOperationId,
        'Test bulk rollback'
      );

      // 4. Verify rollback success
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.affectedUsers).toBe(users.length);

      // 5. Verify assignments are removed/reverted
      for (const user of users) {
        const assignment = await getUserRoleAssignment(user.id);
        expect(assignment).toBeNull();
      }
    });

    it('should create and restore from snapshots', async () => {
      // 1. Create initial state
      const users = await createUsersWithVariousRoles();
      const initialState = await captureUserStates(users);

      // 2. Create snapshot
      const snapshot = await rollbackService.createRollbackSnapshot(
        'Test snapshot',
        users.map(u => u.id)
      );

      // 3. Make changes to user roles
      await modifyUserRoles(users);
      const modifiedState = await captureUserStates(users);

      // 4. Verify changes were made
      expect(modifiedState).not.toEqual(initialState);

      // 5. Restore from snapshot
      const restoreResult = await rollbackService.rollbackToSnapshot(
        snapshot.id,
        'Test restore'
      );

      // 6. Verify restore success
      expect(restoreResult.success).toBe(true);

      // 7. Verify state is restored
      const restoredState = await captureUserStates(users);
      expect(restoredState).toEqual(initialState);
    });
  });

  describe('Compatibility Layer', () => {
    it('should seamlessly handle mixed legacy and new role data', async () => {
      // 1. Create users with mixed role data states
      const legacyUser = await createLegacyUser('legacy@test.edu', 'instructor');
      const newUser = await createNewSystemUser('new@test.edu', 'teacher');
      const hybridUser = await createHybridUser('hybrid@test.edu', 'admin', 'institution_admin');

      // 2. Test role retrieval for each type
      const legacyRole = await compatibilityService.getUserRole(legacyUser.id);
      const newRole = await compatibilityService.getUserRole(newUser.id);
      const hybridRole = await compatibilityService.getUserRole(hybridUser.id);

      // 3. Verify correct role mapping
      expect(legacyRole).toBe(UserRole.TEACHER); // instructor -> teacher
      expect(newRole).toBe(UserRole.TEACHER);
      expect(hybridRole).toBe(UserRole.INSTITUTION_ADMIN); // Should prefer new system

      // 4. Test role checking
      expect(await compatibilityService.hasRole(legacyUser.id, UserRole.TEACHER)).toBe(true);
      expect(await compatibilityService.hasRole(newUser.id, UserRole.TEACHER)).toBe(true);
      expect(await compatibilityService.hasRole(hybridUser.id, UserRole.INSTITUTION_ADMIN)).toBe(true);
    });

    it('should handle compatibility service configuration changes', async () => {
      // 1. Create user with legacy data
      const user = await createLegacyUser('config@test.edu', 'teacher');

      // 2. Test with different configurations
      const strictService = new RoleCompatibilityService({
        enableLegacySupport: false,
        migrationMode: 'strict',
        fallbackToLegacy: false,
        logCompatibilityIssues: false
      });

      const permissiveService = new RoleCompatibilityService({
        enableLegacySupport: true,
        migrationMode: 'permissive',
        fallbackToLegacy: true,
        logCompatibilityIssues: false
      });

      // 3. Test role retrieval with different configs
      const strictResult = await strictService.getUserRole(user.id);
      const permissiveResult = await permissiveService.getUserRole(user.id);

      // 4. Verify behavior differences
      expect(strictResult).toBeNull(); // Should not fallback to legacy
      expect(permissiveResult).toBe(UserRole.TEACHER); // Should fallback to legacy
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large-scale migration efficiently', async () => {
      // 1. Create large number of users (scaled down for test)
      const userCount = 50; // In real scenario, this could be thousands
      const users = await createLargeUserSet(userCount);

      // 2. Measure migration performance
      const startTime = Date.now();
      
      const migrationPromises = users.map(async (user) => {
        return await compatibilityService.getUserRole(user.id);
      });

      const results = await Promise.all(migrationPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // 3. Verify all users were processed
      expect(results).toHaveLength(userCount);
      expect(results.every(r => r !== null)).toBe(true);

      // 4. Verify reasonable performance (adjust threshold as needed)
      const avgTimePerUser = duration / userCount;
      expect(avgTimePerUser).toBeLessThan(100); // Less than 100ms per user

      console.log(`Migration performance: ${avgTimePerUser.toFixed(2)}ms per user`);
    });

    it('should handle concurrent operations safely', async () => {
      // 1. Create user for concurrent testing
      const user = await createUserWithRoleAssignment('student');

      // 2. Perform concurrent operations
      const operations = [
        compatibilityService.getUserRole(user.id),
        compatibilityService.getUserRoles(user.id),
        compatibilityService.hasRole(user.id, UserRole.STUDENT),
        validationService.validateUserRoles(user.id),
        compatibilityService.getCompatibilityStatus(user.id)
      ];

      // 3. Execute concurrently
      const results = await Promise.allSettled(operations);

      // 4. Verify all operations completed successfully
      const failures = results.filter(r => r.status === 'rejected');
      expect(failures).toHaveLength(0);

      // 5. Verify consistent results
      const roleResults = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      expect(roleResults[0]).toBe(UserRole.STUDENT); // getUserRole
      expect(roleResults[1]).toContain(UserRole.STUDENT); // getUserRoles
      expect(roleResults[2]).toBe(true); // hasRole
      expect(roleResults[3].isValid).toBe(true); // validateUserRoles
      expect(roleResults[4].hasNewRoleData).toBe(true); // getCompatibilityStatus
    });
  });

  // Helper functions for test setup and data creation

  async function setupTestData() {
    // Create test institution
    const { data: institution, error } = await supabase
      .from('institutions')
      .insert({
        name: 'Test University',
        domain: 'test.edu',
        type: 'university',
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    testInstitution = institution;
  }

  async function cleanupTestData() {
    // Clean up test users
    if (testUsers.length > 0) {
      await supabase
        .from('users')
        .delete()
        .in('id', testUsers.map(u => u.id));
    }

    // Clean up test institution
    if (testInstitution) {
      await supabase
        .from('institutions')
        .delete()
        .eq('id', testInstitution.id);
    }
  }

  async function createLegacyUsers(userData: Array<{email: string, role: string}>) {
    const users = [];
    
    for (const data of userData) {
      const { data: user, error } = await supabase
        .from('users')
        .insert({
          email: data.email,
          role: data.role, // Legacy role field
          institution_id: testInstitution.id,
          // No primary_role or role_status (new system fields)
        })
        .select()
        .single();

      if (error) throw error;
      users.push(user);
      testUsers.push(user);
    }

    return users;
  }

  async function createUserWithInconsistentRoles() {
    // Create user with mismatched primary_role and role assignments
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: 'inconsistent@test.edu',
        primary_role: 'student', // Primary role says student
        role_status: 'active',
        institution_id: testInstitution.id
      })
      .select()
      .single();

    if (error) throw error;

    // But create assignment for teacher role
    await supabase
      .from('user_role_assignments')
      .insert({
        user_id: user.id,
        role: 'teacher', // Assignment says teacher
        status: 'active',
        assigned_by: user.id,
        institution_id: testInstitution.id
      });

    testUsers.push(user);
    return user;
  }

  async function createMixedValidityUsers() {
    // Create various users with different validity states
    const validUser = await createLegacyUser('valid@test.edu', 'teacher');
    const invalidUser = await createUserWithInconsistentRoles();
    const expiredUser = await createUserWithExpiredAssignment();
    
    return [validUser, invalidUser, expiredUser];
  }

  async function createUserWithExpiredAssignment() {
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: 'expired@test.edu',
        primary_role: 'teacher',
        role_status: 'active',
        institution_id: testInstitution.id
      })
      .select()
      .single();

    if (error) throw error;

    // Create expired assignment
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await supabase
      .from('user_role_assignments')
      .insert({
        user_id: user.id,
        role: 'teacher',
        status: 'active', // Still active but expired
        assigned_by: user.id,
        institution_id: testInstitution.id,
        is_temporary: true,
        expires_at: yesterday.toISOString()
      });

    testUsers.push(user);
    return user;
  }

  async function createOrphanedAssignments() {
    // Create assignments with non-existent user IDs
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    
    await supabase
      .from('user_role_assignments')
      .insert({
        user_id: fakeUserId,
        role: 'teacher',
        status: 'active',
        assigned_by: fakeUserId,
        institution_id: testInstitution.id
      });
  }

  async function createDuplicateAssignments() {
    const user = await createLegacyUser('duplicate@test.edu', 'teacher');
    
    // Create multiple active assignments for the same role
    await supabase
      .from('user_role_assignments')
      .insert([
        {
          user_id: user.id,
          role: 'teacher',
          status: 'active',
          assigned_by: user.id,
          institution_id: testInstitution.id
        },
        {
          user_id: user.id,
          role: 'teacher',
          status: 'active',
          assigned_by: user.id,
          institution_id: testInstitution.id
        }
      ]);

    return user;
  }

  async function createLegacyUser(email: string, role: string) {
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email,
        role, // Legacy role field only
        institution_id: testInstitution.id
      })
      .select()
      .single();

    if (error) throw error;
    testUsers.push(user);
    return user;
  }

  async function createNewSystemUser(email: string, role: string) {
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email,
        primary_role: role,
        role_status: 'active',
        institution_id: testInstitution.id
      })
      .select()
      .single();

    if (error) throw error;

    // Create corresponding assignment
    await supabase
      .from('user_role_assignments')
      .insert({
        user_id: user.id,
        role,
        status: 'active',
        assigned_by: user.id,
        institution_id: testInstitution.id
      });

    testUsers.push(user);
    return user;
  }

  async function createHybridUser(email: string, legacyRole: string, newRole: string) {
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email,
        role: legacyRole, // Legacy field
        primary_role: newRole, // New field
        role_status: 'active',
        institution_id: testInstitution.id
      })
      .select()
      .single();

    if (error) throw error;

    // Create assignment for new role
    await supabase
      .from('user_role_assignments')
      .insert({
        user_id: user.id,
        role: newRole,
        status: 'active',
        assigned_by: user.id,
        institution_id: testInstitution.id
      });

    testUsers.push(user);
    return user;
  }

  async function createUserWithRoleAssignment(role: string) {
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: `${role}@test.edu`,
        primary_role: role,
        role_status: 'active',
        institution_id: testInstitution.id
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('user_role_assignments')
      .insert({
        user_id: user.id,
        role,
        status: 'active',
        assigned_by: user.id,
        institution_id: testInstitution.id
      });

    testUsers.push(user);
    return user;
  }

  async function getUserRoleAssignment(userId: string) {
    const { data, error } = await supabase
      .from('user_role_assignments')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
    return data;
  }

  async function changeUserRole(userId: string, newRole: string) {
    // Update user's primary role
    await supabase
      .from('users')
      .update({ primary_role: newRole })
      .eq('id', userId);

    // Update role assignment
    await supabase
      .from('user_role_assignments')
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq('status', 'active');
  }

  async function createMultipleUsers(count: number) {
    const users = [];
    
    for (let i = 0; i < count; i++) {
      const { data: user, error } = await supabase
        .from('users')
        .insert({
          email: `user${i}@test.edu`,
          primary_role: 'student',
          role_status: 'active',
          institution_id: testInstitution.id
        })
        .select()
        .single();

      if (error) throw error;
      users.push(user);
      testUsers.push(user);
    }

    return users;
  }

  async function performBulkRoleAssignment(users: any[], role: string, bulkOperationId: string) {
    const assignments = users.map(user => ({
      user_id: user.id,
      role,
      status: 'active',
      assigned_by: user.id,
      institution_id: testInstitution.id,
      metadata: { bulkOperationId }
    }));

    await supabase
      .from('user_role_assignments')
      .insert(assignments);

    // Update users' primary roles
    await supabase
      .from('users')
      .update({ primary_role: role })
      .in('id', users.map(u => u.id));
  }

  async function createUsersWithVariousRoles() {
    return await Promise.all([
      createUserWithRoleAssignment('student'),
      createUserWithRoleAssignment('teacher'),
      createUserWithRoleAssignment('department_admin')
    ]);
  }

  async function captureUserStates(users: any[]) {
    const states = [];
    
    for (const user of users) {
      const { data: userData } = await supabase
        .from('users')
        .select('primary_role, role_status')
        .eq('id', user.id)
        .single();

      const { data: assignments } = await supabase
        .from('user_role_assignments')
        .select('role, status')
        .eq('user_id', user.id);

      states.push({
        userId: user.id,
        userData,
        assignments
      });
    }

    return states;
  }

  async function modifyUserRoles(users: any[]) {
    for (const user of users) {
      await changeUserRole(user.id, 'institution_admin');
    }
  }

  async function createLargeUserSet(count: number) {
    const users = [];
    const batchSize = 10;
    
    for (let i = 0; i < count; i += batchSize) {
      const batch = [];
      const batchEnd = Math.min(i + batchSize, count);
      
      for (let j = i; j < batchEnd; j++) {
        batch.push({
          email: `bulk${j}@test.edu`,
          role: ['student', 'teacher', 'admin'][j % 3], // Vary roles
          institution_id: testInstitution.id
        });
      }

      const { data: batchUsers, error } = await supabase
        .from('users')
        .insert(batch)
        .select();

      if (error) throw error;
      users.push(...batchUsers);
      testUsers.push(...batchUsers);
    }

    return users;
  }
});