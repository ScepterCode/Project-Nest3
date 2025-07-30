import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

// Integration tests for Institution Management API endpoints
// These tests require a test database and should be run in a test environment

describe('Institution Management API Integration Tests', () => {
  let supabase: any;
  let testInstitutionId: string;
  let testDepartmentId: string;
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    // Initialize test database connection
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create test user and get auth token
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: 'test-admin@example.com',
      password: 'test-password-123',
      options: {
        data: {
          role: 'system_admin',
          first_name: 'Test',
          last_name: 'Admin'
        }
      }
    });

    if (authError) {
      console.error('Auth setup error:', authError);
      throw authError;
    }

    testUserId = authData.user?.id!;
    authToken = authData.session?.access_token!;

    // Insert user profile
    await supabase
      .from('users')
      .insert({
        id: testUserId,
        email: 'test-admin@example.com',
        role: 'system_admin',
        first_name: 'Test',
        last_name: 'Admin'
      });
  });

  afterAll(async () => {
    // Cleanup test data
    if (testDepartmentId) {
      await supabase
        .from('departments')
        .delete()
        .eq('id', testDepartmentId);
    }

    if (testInstitutionId) {
      await supabase
        .from('institutions')
        .delete()
        .eq('id', testInstitutionId);
    }

    if (testUserId) {
      await supabase
        .from('users')
        .delete()
        .eq('id', testUserId);
    }
  });

  describe('Institution CRUD Operations', () => {
    it('should create a new institution', async () => {
      const institutionData = {
        name: 'Test University Integration',
        domain: 'test-integration.edu',
        type: 'university',
        contactInfo: {
          email: 'admin@test-integration.edu',
          phone: '+1-555-0123'
        },
        address: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'TS',
          postalCode: '12345',
          country: 'US'
        }
      };

      const response = await fetch('http://localhost:3000/api/institutions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(institutionData)
      });

      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
      expect(result.data.institution).toBeDefined();
      expect(result.data.institution.name).toBe('Test University Integration');
      expect(result.data.institution.domain).toBe('test-integration.edu');

      testInstitutionId = result.data.institution.id;
    });

    it('should retrieve the created institution', async () => {
      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.institution.id).toBe(testInstitutionId);
      expect(result.data.institution.name).toBe('Test University Integration');
    });

    it('should update the institution', async () => {
      const updateData = {
        name: 'Updated Test University',
        contactInfo: {
          email: 'updated-admin@test-integration.edu',
          phone: '+1-555-0124'
        }
      };

      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(updateData)
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.institution.name).toBe('Updated Test University');
      expect(result.data.institution.contactInfo.email).toBe('updated-admin@test-integration.edu');
    });

    it('should list institutions with filtering', async () => {
      const response = await fetch('http://localhost:3000/api/institutions?type=university&limit=10', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.institutions).toBeDefined();
      expect(Array.isArray(result.data.institutions)).toBe(true);
      expect(result.data.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Department Management', () => {
    it('should create a department within the institution', async () => {
      const departmentData = {
        name: 'Computer Science',
        code: 'CS',
        description: 'Computer Science Department',
        adminId: testUserId
      };

      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(departmentData)
      });

      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
      expect(result.data.department).toBeDefined();
      expect(result.data.department.name).toBe('Computer Science');
      expect(result.data.department.code).toBe('CS');
      expect(result.data.department.institutionId).toBe(testInstitutionId);

      testDepartmentId = result.data.department.id;
    });

    it('should list departments for the institution', async () => {
      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}/departments`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.departments).toBeDefined();
      expect(Array.isArray(result.data.departments)).toBe(true);
      expect(result.data.departments.length).toBeGreaterThanOrEqual(1);
      expect(result.data.departments[0].name).toBe('Computer Science');
    });

    it('should retrieve department hierarchy', async () => {
      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}/departments?hierarchy=true`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.hierarchy).toBeDefined();
      expect(Array.isArray(result.data.hierarchy)).toBe(true);
    });

    it('should update the department', async () => {
      const updateData = {
        description: 'Updated Computer Science Department',
        name: 'Computer Science & Engineering'
      };

      const response = await fetch(`http://localhost:3000/api/departments/${testDepartmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(updateData)
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.department.name).toBe('Computer Science & Engineering');
      expect(result.data.department.description).toBe('Updated Computer Science Department');
    });

    it('should retrieve individual department', async () => {
      const response = await fetch(`http://localhost:3000/api/departments/${testDepartmentId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.department.id).toBe(testDepartmentId);
      expect(result.data.department.name).toBe('Computer Science & Engineering');
    });
  });

  describe('Analytics API', () => {
    it('should retrieve institution overview analytics', async () => {
      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}/analytics?type=overview`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.overview).toBeDefined();
      expect(result.data.overview.totalUsers).toBeDefined();
      expect(result.data.overview.totalDepartments).toBeDefined();
      expect(result.data.overview.institution).toBeDefined();
    });

    it('should retrieve user activity analytics', async () => {
      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}/analytics?type=user_activity&timeframe=last_30_days`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.userActivity).toBeDefined();
      expect(Array.isArray(result.data.userActivity)).toBe(true);
    });

    it('should generate analytics report', async () => {
      const reportRequest = {
        action: 'generate_report',
        reportType: 'user_activity',
        timeframe: 'last_30_days',
        format: 'json'
      };

      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}/analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(reportRequest)
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.report).toBeDefined();
      expect(result.data.report.reportType).toBe('user_activity');
      expect(result.data.report.institutionId).toBe(testInstitutionId);
    });

    it('should retrieve department analytics', async () => {
      const response = await fetch(`http://localhost:3000/api/departments/${testDepartmentId}/analytics?type=overview`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.overview).toBeDefined();
      expect(result.data.overview.department).toBeDefined();
      expect(result.data.overview.department.id).toBe(testDepartmentId);
    });
  });

  describe('Access Control', () => {
    it('should deny access to unauthorized users', async () => {
      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}`, {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });

      expect(response.status).toBe(401);
    });

    it('should deny institution creation to non-system admin', async () => {
      // Create a regular user
      const { data: regularUser } = await supabase.auth.signUp({
        email: 'regular-user@example.com',
        password: 'test-password-123'
      });

      const regularUserToken = regularUser.session?.access_token;

      const institutionData = {
        name: 'Unauthorized Institution',
        domain: 'unauthorized.edu',
        type: 'university'
      };

      const response = await fetch('http://localhost:3000/api/institutions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${regularUserToken}`
        },
        body: JSON.stringify(institutionData)
      });

      expect(response.status).toBe(403);

      // Cleanup
      await supabase
        .from('users')
        .delete()
        .eq('id', regularUser.user?.id);
    });

    it('should allow institution members to view their institution', async () => {
      // Update test user to be institution member instead of system admin
      await supabase
        .from('users')
        .update({
          role: 'institution_admin',
          institution_id: testInstitutionId
        })
        .eq('id', testUserId);

      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);

      // Restore system admin role
      await supabase
        .from('users')
        .update({
          role: 'system_admin',
          institution_id: null
        })
        .eq('id', testUserId);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid institution ID', async () => {
      const response = await fetch('http://localhost:3000/api/institutions/invalid-id', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle duplicate domain creation', async () => {
      const institutionData = {
        name: 'Duplicate Domain University',
        domain: 'test-integration.edu', // Same domain as existing institution
        type: 'university'
      };

      const response = await fetch('http://localhost:3000/api/institutions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(institutionData)
      });

      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle invalid department code format', async () => {
      const departmentData = {
        name: 'Invalid Code Department',
        code: 'invalid-code-format', // Invalid format
        adminId: testUserId
      };

      const response = await fetch(`http://localhost:3000/api/institutions/${testInstitutionId}/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(departmentData)
      });

      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Performance and Pagination', () => {
    it('should handle pagination for institutions list', async () => {
      const response = await fetch('http://localhost:3000/api/institutions?limit=5&offset=0', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(5);
      expect(result.data.offset).toBe(0);
      expect(result.data.institutions.length).toBeLessThanOrEqual(5);
    });

    it('should handle search functionality', async () => {
      const response = await fetch(`http://localhost:3000/api/institutions?search=Test`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.institutions).toBeDefined();
      // Should find our test institution
      expect(result.data.institutions.some((inst: any) => inst.name.includes('Test'))).toBe(true);
    });
  });
});