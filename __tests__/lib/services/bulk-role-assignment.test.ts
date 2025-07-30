/**
 * Unit tests for BulkRoleAssignmentService
 */

import { BulkRoleAssignmentService } from '../../../lib/services/bulk-role-assignment';
import { UserRole } from '../../../lib/types/role-management';

// Mock File constructor for testing
global.File = class MockFile {
  name: string;
  size: number;
  type: string;
  content: string;

  constructor(content: BlobPart[], filename: string, options?: FilePropertyBag) {
    this.name = filename;
    this.size = content.join('').length;
    this.type = options?.type || 'text/plain';
    this.content = content.join('');
  }

  async text(): Promise<string> {
    return this.content;
  }
} as any;

// Mock Blob constructor
global.Blob = class MockBlob {
  size: number;
  type: string;
  content: string;

  constructor(content: BlobPart[], options?: BlobPropertyBag) {
    this.content = content.join('');
    this.size = this.content.length;
    this.type = options?.type || 'text/plain';
  }
} as any;

describe('BulkRoleAssignmentService', () => {
  let service: BulkRoleAssignmentService;

  beforeEach(() => {
    service = new BulkRoleAssignmentService();
  });

  describe('parseFile', () => {
    it('should successfully parse valid CSV file', async () => {
      const csvContent = [
        'email,first_name,last_name,role,department_id,justification',
        'john@example.com,John,Doe,student,,Initial assignment',
        'jane@example.com,Jane,Smith,teacher,dept-123,Department teacher'
      ].join('\n');

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.STUDENT,
        departmentId: '',
        justification: 'Initial assignment'
      });
    });

    it('should handle missing required headers', async () => {
      const csvContent = [
        'first_name,last_name,role',
        'John,Doe,student'
      ].join('\n');

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Missing required headers: email');
    });

    it('should validate email formats', async () => {
      const csvContent = [
        'email,role',
        'invalid-email,student',
        'valid@example.com,teacher',
        'another-invalid,student'
      ].join('\n');

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].message).toBe('Invalid email format');
      expect(result.errors[1].message).toBe('Invalid email format');
      expect(result.data).toHaveLength(1);
    });

    it('should handle invalid role values', async () => {
      const csvContent = [
        'email,role',
        'user1@example.com,invalid_role',
        'user2@example.com,student',
        'user3@example.com,super_admin'
      ].join('\n');

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].message).toContain('Invalid role: invalid_role');
      expect(result.errors[1].message).toContain('Invalid role: super_admin');
      expect(result.data).toHaveLength(1);
    });

    it('should detect duplicate emails', async () => {
      const csvContent = [
        'email,role',
        'duplicate@example.com,student',
        'unique@example.com,teacher',
        'duplicate@example.com,teacher'
      ].join('\n');

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('Duplicate email'))).toBe(true);
    });

    it('should handle empty files', async () => {
      const file = new File([''], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('File is empty');
    });

    it('should skip empty rows', async () => {
      const csvContent = [
        'email,role',
        'user1@example.com,student',
        '',
        '   ',
        'user2@example.com,teacher',
        ','
      ].join('\n');

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].email).toBe('user1@example.com');
      expect(result.data[1].email).toBe('user2@example.com');
    });

    it('should validate file extensions', async () => {
      const file = new File(['email,role\nuser@example.com,student'], 'test.txt', { type: 'text/plain' });
      const result = await service.parseFile(file);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Unsupported file format');
    });

    it('should handle CSV with quoted values', async () => {
      const csvContent = [
        'email,first_name,last_name,justification',
        '"user@example.com","John, Jr.","Doe","Initial assignment, with comma"',
        'simple@example.com,Jane,Smith,Simple justification'
      ].join('\n');

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].firstName).toBe('John, Jr.');
      expect(result.data[0].justification).toBe('Initial assignment, with comma');
    });
  });

  describe('processBulkAssignment', () => {
    const mockAssignments = [
      {
        email: 'user1@example.com',
        firstName: 'User',
        lastName: 'One',
        role: UserRole.STUDENT,
        justification: 'Test assignment'
      },
      {
        email: 'user2@example.com',
        firstName: 'User',
        lastName: 'Two',
        role: UserRole.TEACHER,
        departmentId: 'dept-123',
        justification: 'Teacher assignment'
      }
    ];

    it('should process bulk assignments successfully', async () => {
      // Mock the private methods for testing
      const mockResolveUser = jest.spyOn(service as any, 'resolveOrCreateUser')
        .mockResolvedValue('user-id-123');
      const mockAssignRole = jest.spyOn(service as any, 'assignRole')
        .mockResolvedValue({
          id: 'assignment-123',
          userId: 'user-id-123',
          role: UserRole.STUDENT,
          assignedAt: new Date()
        });
      const mockHasExistingRole = jest.spyOn(service as any, 'hasExistingRole')
        .mockResolvedValue(false);

      const result = await service.processBulkAssignment(
        mockAssignments,
        'institution-123',
        'admin-user-123',
        { validateOnly: false }
      );

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.assignments).toHaveLength(2);
      expect(mockResolveUser).toHaveBeenCalledTimes(2);
      expect(mockAssignRole).toHaveBeenCalledTimes(2);
    });

    it('should handle validation-only mode', async () => {
      const mockValidateRequest = jest.spyOn(service as any, 'validateAssignmentRequest')
        .mockResolvedValue(undefined);

      const result = await service.processBulkAssignment(
        mockAssignments,
        'institution-123',
        'admin-user-123',
        { validateOnly: true }
      );

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.assignments).toHaveLength(0);
      expect(mockValidateRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures gracefully', async () => {
      const mockResolveUser = jest.spyOn(service as any, 'resolveOrCreateUser')
        .mockResolvedValueOnce('user-id-1')
        .mockRejectedValueOnce(new Error('User creation failed'));
      
      const mockAssignRole = jest.spyOn(service as any, 'assignRole')
        .mockResolvedValue({
          id: 'assignment-123',
          userId: 'user-id-1',
          role: UserRole.STUDENT,
          assignedAt: new Date()
        });

      const mockHasExistingRole = jest.spyOn(service as any, 'hasExistingRole')
        .mockResolvedValue(false);

      const result = await service.processBulkAssignment(
        mockAssignments,
        'institution-123',
        'admin-user-123',
        { validateOnly: false }
      );

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('User creation failed');
      expect(result.assignments).toHaveLength(1);
    });

    it('should skip duplicates when requested', async () => {
      const mockResolveUser = jest.spyOn(service as any, 'resolveOrCreateUser')
        .mockResolvedValue('user-id-123');
      
      const mockHasExistingRole = jest.spyOn(service as any, 'hasExistingRole')
        .mockResolvedValueOnce(true) // First user has existing role
        .mockResolvedValueOnce(false); // Second user doesn't

      const mockAssignRole = jest.spyOn(service as any, 'assignRole')
        .mockResolvedValue({
          id: 'assignment-123',
          userId: 'user-id-123',
          role: UserRole.TEACHER,
          assignedAt: new Date()
        });

      const result = await service.processBulkAssignment(
        mockAssignments,
        'institution-123',
        'admin-user-123',
        { skipDuplicates: true }
      );

      expect(result.successful).toBe(2); // Both counted as successful
      expect(result.failed).toBe(0);
      expect(result.assignments).toHaveLength(1); // Only one actual assignment
      expect(mockAssignRole).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe('error handling', () => {
    it('should handle malformed CSV gracefully', async () => {
      const malformedCsv = [
        'email,role',
        'user1@example.com,student',
        'user2@example.com,teacher,extra,columns,here',
        'user3@example.com' // Missing role column
      ].join('\n');

      const file = new File([malformedCsv], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      // Should still process valid rows
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].email).toBe('user1@example.com');
    });

    it('should handle special characters in data', async () => {
      const csvContent = [
        'email,first_name,last_name,justification',
        'user@example.com,José,O\'Connor,"Assignment with ""quotes"" and commas, etc."'
      ].join('\n');

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const result = await service.parseFile(file);

      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].firstName).toBe('José');
      expect(result.data[0].lastName).toBe('O\'Connor');
    });
  });
});