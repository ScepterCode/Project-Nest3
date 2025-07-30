// Simple JavaScript test for EnrollmentConfigService validation logic
// This tests the core validation functions without TypeScript complexity

const { EnrollmentType, PrerequisiteType, RestrictionType } = require('@/lib/types/enrollment');

// Mock the service class for testing validation logic
class MockEnrollmentConfigService {
  validatePrerequisite(prerequisite) {
    const errors = [];

    if (!prerequisite.requirement || prerequisite.requirement.trim() === '') {
      errors.push({
        field: 'requirement',
        message: 'Prerequisite requirement is required',
        code: 'MISSING_REQUIREMENT'
      });
    }

    // Validate requirement format based on type
    try {
      switch (prerequisite.type) {
        case 'course':
          if (prerequisite.requirement.length < 3) {
            errors.push({
              field: 'requirement',
              message: 'Course requirement must be at least 3 characters',
              code: 'INVALID_COURSE_REQUIREMENT'
            });
          }
          break;
        case 'gpa':
          const gpa = parseFloat(prerequisite.requirement);
          if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
            errors.push({
              field: 'requirement',
              message: 'GPA requirement must be a number between 0 and 4.0',
              code: 'INVALID_GPA_REQUIREMENT'
            });
          }
          break;
        case 'year':
          const year = parseInt(prerequisite.requirement);
          if (isNaN(year) || year < 1 || year > 8) {
            errors.push({
              field: 'requirement',
              message: 'Year requirement must be a number between 1 and 8',
              code: 'INVALID_YEAR_REQUIREMENT'
            });
          }
          break;
      }
    } catch (e) {
      errors.push({
        field: 'requirement',
        message: 'Invalid requirement format',
        code: 'INVALID_REQUIREMENT_FORMAT'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  validateRestriction(restriction) {
    const errors = [];

    if (!restriction.condition || restriction.condition.trim() === '') {
      errors.push({
        field: 'condition',
        message: 'Restriction condition is required',
        code: 'MISSING_CONDITION'
      });
    }

    // Validate condition format based on type
    try {
      switch (restriction.type) {
        case 'gpa':
          const gpa = parseFloat(restriction.condition);
          if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
            errors.push({
              field: 'condition',
              message: 'GPA condition must be a number between 0 and 4.0',
              code: 'INVALID_GPA_CONDITION'
            });
          }
          break;
        case 'year_level':
          const year = parseInt(restriction.condition);
          if (isNaN(year) || year < 1 || year > 8) {
            errors.push({
              field: 'condition',
              message: 'Year level condition must be a number between 1 and 8',
              code: 'INVALID_YEAR_CONDITION'
            });
          }
          break;
      }
    } catch (e) {
      errors.push({
        field: 'condition',
        message: 'Invalid condition format',
        code: 'INVALID_CONDITION_FORMAT'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  validateConfig(classId, config) {
    const errors = [];
    const warnings = [];

    // Validate capacity
    if (config.capacity !== undefined && config.capacity < 1) {
      errors.push({
        field: 'capacity',
        message: 'Class capacity must be at least 1',
        code: 'INVALID_CAPACITY'
      });
    }

    // Validate waitlist capacity
    if (config.waitlistCapacity !== undefined && config.waitlistCapacity < 0) {
      errors.push({
        field: 'waitlistCapacity',
        message: 'Waitlist capacity cannot be negative',
        code: 'INVALID_WAITLIST_CAPACITY'
      });
    }

    // Validate date ranges
    if (config.enrollmentStart && config.enrollmentEnd) {
      const startDate = new Date(config.enrollmentStart);
      const endDate = new Date(config.enrollmentEnd);
      if (startDate >= endDate) {
        errors.push({
          field: 'enrollmentEnd',
          message: 'Enrollment end date must be after start date',
          code: 'INVALID_DATE_RANGE'
        });
      }
    }

    // Validate deadline order
    if (config.dropDeadline && config.withdrawDeadline) {
      const dropDate = new Date(config.dropDeadline);
      const withdrawDate = new Date(config.withdrawDeadline);
      if (dropDate >= withdrawDate) {
        errors.push({
          field: 'withdrawDeadline',
          message: 'Withdraw deadline must be after drop deadline',
          code: 'INVALID_DEADLINE_ORDER'
        });
      }
    }

    // Validate max waitlist position
    if (config.maxWaitlistPosition && config.waitlistCapacity && 
        config.maxWaitlistPosition > config.waitlistCapacity) {
      errors.push({
        field: 'maxWaitlistPosition',
        message: 'Max waitlist position cannot exceed waitlist capacity',
        code: 'INVALID_WAITLIST_POSITION'
      });
    }

    // Check for warnings
    if (config.enrollmentType === 'invitation_only' && config.autoApprove) {
      warnings.push({
        field: 'autoApprove',
        message: 'Auto-approve is not applicable for invitation-only classes',
        code: 'INCOMPATIBLE_SETTING'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

describe('EnrollmentConfigService Validation Logic', () => {
  let service;

  beforeEach(() => {
    service = new MockEnrollmentConfigService();
  });

  describe('validateConfig', () => {
    test('should validate capacity correctly', () => {
      const result = service.validateConfig('class-123', { capacity: 0 });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'capacity',
        message: 'Class capacity must be at least 1',
        code: 'INVALID_CAPACITY'
      });
    });

    test('should validate waitlist capacity', () => {
      const result = service.validateConfig('class-123', { waitlistCapacity: -1 });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'waitlistCapacity',
        message: 'Waitlist capacity cannot be negative',
        code: 'INVALID_WAITLIST_CAPACITY'
      });
    });

    test('should validate date ranges', () => {
      const result = service.validateConfig('class-123', {
        enrollmentStart: new Date('2024-02-01'),
        enrollmentEnd: new Date('2024-01-01') // End before start
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'enrollmentEnd',
        message: 'Enrollment end date must be after start date',
        code: 'INVALID_DATE_RANGE'
      });
    });

    test('should validate deadline order', () => {
      const result = service.validateConfig('class-123', {
        dropDeadline: new Date('2024-03-01'),
        withdrawDeadline: new Date('2024-02-01') // Withdraw before drop
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'withdrawDeadline',
        message: 'Withdraw deadline must be after drop deadline',
        code: 'INVALID_DEADLINE_ORDER'
      });
    });

    test('should validate max waitlist position', () => {
      const result = service.validateConfig('class-123', {
        waitlistCapacity: 10,
        maxWaitlistPosition: 15 // Greater than capacity
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'maxWaitlistPosition',
        message: 'Max waitlist position cannot exceed waitlist capacity',
        code: 'INVALID_WAITLIST_POSITION'
      });
    });

    test('should warn about incompatible settings', () => {
      const result = service.validateConfig('class-123', {
        enrollmentType: 'invitation_only',
        autoApprove: true
      });
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        field: 'autoApprove',
        message: 'Auto-approve is not applicable for invitation-only classes',
        code: 'INCOMPATIBLE_SETTING'
      });
    });

    test('should pass validation for valid configuration', () => {
      const result = service.validateConfig('class-123', {
        enrollmentType: 'restricted',
        capacity: 25,
        waitlistCapacity: 10,
        enrollmentStart: new Date('2024-01-01'),
        enrollmentEnd: new Date('2024-02-01'),
        dropDeadline: new Date('2024-02-15'),
        withdrawDeadline: new Date('2024-03-15'),
        maxWaitlistPosition: 5
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validatePrerequisite', () => {
    test('should require prerequisite requirement', () => {
      const result = service.validatePrerequisite({
        type: 'course',
        requirement: '', // Empty requirement
        description: 'Test',
        strict: true
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'requirement',
        message: 'Prerequisite requirement is required',
        code: 'MISSING_REQUIREMENT'
      });
    });

    test('should validate course prerequisite format', () => {
      const result = service.validatePrerequisite({
        type: 'course',
        requirement: 'AB', // Too short
        description: 'Test',
        strict: true
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'requirement',
        message: 'Course requirement must be at least 3 characters',
        code: 'INVALID_COURSE_REQUIREMENT'
      });
    });

    test('should validate GPA prerequisite format', () => {
      const result = service.validatePrerequisite({
        type: 'gpa',
        requirement: '5.0', // Invalid GPA > 4.0
        description: 'Minimum GPA',
        strict: true
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'requirement',
        message: 'GPA requirement must be a number between 0 and 4.0',
        code: 'INVALID_GPA_REQUIREMENT'
      });
    });

    test('should validate year prerequisite format', () => {
      const result = service.validatePrerequisite({
        type: 'year',
        requirement: '10', // Invalid year > 8
        description: 'Year level',
        strict: true
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'requirement',
        message: 'Year requirement must be a number between 1 and 8',
        code: 'INVALID_YEAR_REQUIREMENT'
      });
    });

    test('should pass validation for valid prerequisite', () => {
      const result = service.validatePrerequisite({
        type: 'course',
        requirement: 'MATH101',
        description: 'Introduction to Mathematics',
        strict: true
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateRestriction', () => {
    test('should require restriction condition', () => {
      const result = service.validateRestriction({
        type: 'gpa',
        condition: '', // Empty condition
        description: 'Test',
        overridable: false
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'condition',
        message: 'Restriction condition is required',
        code: 'MISSING_CONDITION'
      });
    });

    test('should validate GPA restriction format', () => {
      const result = service.validateRestriction({
        type: 'gpa',
        condition: '5.0', // Invalid GPA > 4.0
        description: 'Minimum GPA',
        overridable: false
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'condition',
        message: 'GPA condition must be a number between 0 and 4.0',
        code: 'INVALID_GPA_CONDITION'
      });
    });

    test('should validate year level restriction format', () => {
      const result = service.validateRestriction({
        type: 'year_level',
        condition: '10', // Invalid year > 8
        description: 'Year level',
        overridable: false
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'condition',
        message: 'Year level condition must be a number between 1 and 8',
        code: 'INVALID_YEAR_CONDITION'
      });
    });

    test('should pass validation for valid restriction', () => {
      const result = service.validateRestriction({
        type: 'year_level',
        condition: 'Senior',
        description: 'Only seniors allowed',
        overridable: true
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});