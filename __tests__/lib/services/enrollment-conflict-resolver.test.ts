import { EnrollmentConflictResolver } from '@/lib/services/enrollment-conflict-resolver';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  insert: jest.fn(() => mockSupabase),
  update: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  gt: jest.fn(() => mockSupabase),
  gte: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase)
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('EnrollmentConflictResolver', () => {
  let resolver: EnrollmentConflictResolver;
  const mockInstitutionId = 'test-institution-id';

  beforeEach(() => {
    resolver = new EnrollmentConflictResolver();
    jest.clearAllMocks();
  });

  describe('detectConflicts', () => {
    it('should detect capacity violations', async () => {
      const mockOvercapacityClasses = [
        {
          id: 'class1',
          name: 'Overcrowded Class',
          capacity: 20,
          current_enrollment: 25,
          department: {
            id: 'dept1',
            name: 'Computer Science',
            institution_id: mockInstitutionId
          }
        }
      ];

      // Mock capacity violations query
      mockSupabase.select.mockResolvedValueOnce({
        data: mockOvercapacityClasses,
        error: null
      });

      // Mock other conflict detection queries
      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null }) // prerequisite violations
        .mockResolvedValueOnce({ data: [], error: null }); // suspicious activity

      const conflicts = await resolver.detectConflicts(mockInstitutionId);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('capacity_exceeded');
      expect(conflicts[0].severity).toBe('high');
      expect(conflicts[0].affectedStudents).toBe(5); // 25 - 20
      expect(conflicts[0].className).toBe('Overcrowded Class');
    });

    it('should detect suspicious enrollment activity', async () => {
      const mockRapidEnrollments = [
        {
          student_id: 'student1',
          class_id: 'class1',
          timestamp: new Date(),
          student: { email: 'student@test.com' },
          class: {
            name: 'Test Class',
            department: { institution_id: mockInstitutionId }
          }
        }
      ];

      // Create 15 enrollment records for the same student (exceeds threshold of 10)
      const rapidEnrollmentData = Array(15).fill(mockRapidEnrollments[0]);

      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null }) // capacity violations
        .mockResolvedValueOnce({ data: [], error: null }) // prerequisite violations
        .mockResolvedValueOnce({ data: rapidEnrollmentData, error: null }); // suspicious activity

      const conflicts = await resolver.detectConflicts(mockInstitutionId);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('suspicious_activity');
      expect(conflicts[0].severity).toBe('medium');
      expect(conflicts[0].description).toContain('15 classes in the last 24 hours');
    });

    it('should handle detection errors gracefully', async () => {
      mockSupabase.select.mockRejectedValueOnce(new Error('Database error'));

      const conflicts = await resolver.detectConflicts(mockInstitutionId);

      expect(conflicts).toEqual([]);
    });
  });

  describe('resolveConflict', () => {
    it('should log conflict resolution', async () => {
      const mockResolution = {
        conflictId: 'conflict1',
        resolutionType: 'manual_override' as const,
        description: 'Applied manual override',
        actionTaken: 'Increased capacity temporarily',
        resolvedBy: 'admin@test.com',
        resolvedAt: new Date(),
        affectedStudents: ['student1', 'student2']
      };

      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      await expect(resolver.resolveConflict('conflict1', mockResolution))
        .resolves.not.toThrow();

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          conflict_id: 'conflict1',
          resolution_type: 'manual_override',
          description: 'Applied manual override',
          action_taken: 'Increased capacity temporarily',
          resolved_by: 'admin@test.com',
          affected_students: ['student1', 'student2']
        })
      );
    });

    it('should handle resolution logging errors', async () => {
      const mockResolution = {
        conflictId: 'conflict1',
        resolutionType: 'manual_override' as const,
        description: 'Test resolution',
        actionTaken: 'Test action',
        resolvedBy: 'admin@test.com',
        resolvedAt: new Date(),
        affectedStudents: []
      };

      mockSupabase.insert.mockResolvedValueOnce({ error: new Error('Insert failed') });

      await expect(resolver.resolveConflict('conflict1', mockResolution))
        .rejects.toThrow('Failed to resolve conflict');
    });
  });

  describe('requestOverride', () => {
    it('should create override request successfully', async () => {
      const mockOverride = {
        studentId: 'student1',
        classId: 'class1',
        overrideType: 'capacity_override' as const,
        reason: 'Student needs this class to graduate',
        requestedBy: 'advisor@test.com'
      };

      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      const overrideId = await resolver.requestOverride(mockOverride);

      expect(overrideId).toMatch(/^override-\d+$/);
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: 'student1',
          class_id: 'class1',
          override_type: 'capacity_override',
          reason: 'Student needs this class to graduate',
          requested_by: 'advisor@test.com',
          status: 'pending'
        })
      );
    });

    it('should handle override request errors', async () => {
      const mockOverride = {
        studentId: 'student1',
        classId: 'class1',
        overrideType: 'capacity_override' as const,
        reason: 'Test reason',
        requestedBy: 'admin@test.com'
      };

      mockSupabase.insert.mockResolvedValueOnce({ error: new Error('Insert failed') });

      await expect(resolver.requestOverride(mockOverride))
        .rejects.toThrow();
    });
  });

  describe('approveOverride', () => {
    it('should approve override and execute action', async () => {
      const mockOverrideData = {
        id: 'override1',
        student_id: 'student1',
        class_id: 'class1',
        override_type: 'capacity_override'
      };

      mockSupabase.update.mockResolvedValueOnce({ error: null });
      mockSupabase.select.mockResolvedValueOnce({
        data: mockOverrideData,
        error: null
      });

      await expect(resolver.approveOverride('override1', 'admin@test.com'))
        .resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          approved_by: 'admin@test.com'
        })
      );
    });

    it('should handle approval errors', async () => {
      mockSupabase.update.mockResolvedValueOnce({ error: new Error('Update failed') });

      await expect(resolver.approveOverride('override1', 'admin@test.com'))
        .rejects.toThrow();
    });
  });

  describe('denyOverride', () => {
    it('should deny override with reason', async () => {
      mockSupabase.update.mockResolvedValueOnce({ error: null });

      await expect(resolver.denyOverride('override1', 'admin@test.com', 'Insufficient justification'))
        .resolves.not.toThrow();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'denied',
          approved_by: 'admin@test.com',
          notes: 'Insufficient justification'
        })
      );
    });
  });

  describe('getOverrideCapabilities', () => {
    it('should return appropriate capabilities for institution admin', async () => {
      const capabilities = await resolver.getOverrideCapabilities('institution_admin', mockInstitutionId);

      expect(capabilities).toHaveLength(4);
      expect(capabilities.map(c => c.type)).toContain('enrollment_override');
      expect(capabilities.map(c => c.type)).toContain('prerequisite_override');
      expect(capabilities.map(c => c.type)).toContain('capacity_override');
      expect(capabilities.map(c => c.type)).toContain('deadline_override');

      const capacityOverride = capabilities.find(c => c.type === 'capacity_override');
      expect(capacityOverride?.maxOverrides).toBe(5);
      expect(capacityOverride?.conditions).toContain('Must provide justification');
    });

    it('should return empty capabilities for unknown role', async () => {
      const capabilities = await resolver.getOverrideCapabilities('unknown_role', mockInstitutionId);

      expect(capabilities).toEqual([]);
    });
  });

  describe('conflict detection accuracy', () => {
    it('should correctly identify capacity violation severity', async () => {
      const mockClasses = [
        {
          id: 'class1',
          name: 'Slightly Over',
          capacity: 30,
          current_enrollment: 32, // 2 over
          department: { id: 'dept1', name: 'Test', institution_id: mockInstitutionId }
        },
        {
          id: 'class2',
          name: 'Way Over',
          capacity: 20,
          current_enrollment: 35, // 15 over
          department: { id: 'dept1', name: 'Test', institution_id: mockInstitutionId }
        }
      ];

      mockSupabase.select
        .mockResolvedValueOnce({ data: mockClasses, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const conflicts = await resolver.detectConflicts(mockInstitutionId);

      expect(conflicts).toHaveLength(2);
      
      const slightlyOverConflict = conflicts.find(c => c.className === 'Slightly Over');
      const wayOverConflict = conflicts.find(c => c.className === 'Way Over');

      expect(slightlyOverConflict?.affectedStudents).toBe(2);
      expect(wayOverConflict?.affectedStudents).toBe(15);
      
      // Both should be high severity for any capacity violation
      expect(slightlyOverConflict?.severity).toBe('high');
      expect(wayOverConflict?.severity).toBe('high');
    });

    it('should not flag classes at or under capacity', async () => {
      const mockClasses = [
        {
          id: 'class1',
          name: 'Normal Class',
          capacity: 30,
          current_enrollment: 25,
          department: { id: 'dept1', name: 'Test', institution_id: mockInstitutionId }
        },
        {
          id: 'class2',
          name: 'At Capacity',
          capacity: 20,
          current_enrollment: 20,
          department: { id: 'dept1', name: 'Test', institution_id: mockInstitutionId }
        }
      ];

      mockSupabase.select
        .mockResolvedValueOnce({ data: mockClasses, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const conflicts = await resolver.detectConflicts(mockInstitutionId);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('suspicious activity detection', () => {
    it('should not flag normal enrollment patterns', async () => {
      const mockNormalEnrollments = Array(5).fill({
        student_id: 'student1',
        class_id: 'class1',
        timestamp: new Date(),
        student: { email: 'student@test.com' },
        class: {
          name: 'Test Class',
          department: { institution_id: mockInstitutionId }
        }
      });

      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null }) // capacity violations
        .mockResolvedValueOnce({ data: [], error: null }) // prerequisite violations
        .mockResolvedValueOnce({ data: mockNormalEnrollments, error: null }); // suspicious activity

      const conflicts = await resolver.detectConflicts(mockInstitutionId);

      expect(conflicts).toHaveLength(0);
    });

    it('should handle multiple students with suspicious activity', async () => {
      const mockSuspiciousEnrollments = [
        ...Array(12).fill({
          student_id: 'student1',
          student: { email: 'student1@test.com' }
        }),
        ...Array(15).fill({
          student_id: 'student2',
          student: { email: 'student2@test.com' }
        })
      ].map(enrollment => ({
        ...enrollment,
        class_id: 'class1',
        timestamp: new Date(),
        class: {
          name: 'Test Class',
          department: { institution_id: mockInstitutionId }
        }
      }));

      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null }) // capacity violations
        .mockResolvedValueOnce({ data: [], error: null }) // prerequisite violations
        .mockResolvedValueOnce({ data: mockSuspiciousEnrollments, error: null }); // suspicious activity

      const conflicts = await resolver.detectConflicts(mockInstitutionId);

      expect(conflicts).toHaveLength(2);
      expect(conflicts[0].description).toContain('12 classes');
      expect(conflicts[1].description).toContain('15 classes');
    });
  });
});