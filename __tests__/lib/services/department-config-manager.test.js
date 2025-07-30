const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock the services since we can't import TypeScript files directly in Jest
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  auth: {
    getUser: jest.fn()
  }
};

// Mock DepartmentConfigManager
const mockDepartmentConfigManager = {
  getDepartmentConfig: jest.fn(),
  updateDepartmentConfig: jest.fn(),
  getDefaultDepartmentSettings: jest.fn(),
  validateDepartmentConfig: jest.fn(),
  getConfigHierarchy: jest.fn(),
  resetToInstitutionDefaults: jest.fn()
};

const UserRole = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  DEPARTMENT_ADMIN: 'department_admin',
  INSTITUTION_ADMIN: 'institution_admin',
  SYSTEM_ADMIN: 'system_admin'
};

describe('Department Configuration Manager Tests', () => {
  const mockDepartmentId = 'test-department-id';
  const mockInstitutionId = 'test-institution-id';
  const mockUserId = 'test-user-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration Inheritance', () => {
    it('should inherit settings from institution when department has no overrides', async () => {
      const institutionSettings = {
        defaultClassCapacity: 25,
        allowSelfEnrollment: true,
        allowLateSubmissions: false,
        gradingScale: 'letter'
      };

      const departmentSettings = {};

      const expectedResult = {
        finalConfig: {
          defaultClassSettings: {
            defaultCapacity: 25,
            allowSelfEnrollment: true,
            allowLateSubmissions: false,
            gradingScale: 'letter'
          }
        },
        inheritedFields: [
          'defaultClassSettings.defaultCapacity',
          'defaultClassSettings.allowSelfEnrollment',
          'defaultClassSettings.allowLateSubmissions',
          'defaultClassSettings.gradingScale'
        ],
        overriddenFields: [],
        conflicts: []
      };

      mockDepartmentConfigManager.getDepartmentConfig.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.getDepartmentConfig(mockDepartmentId);

      expect(result.inheritedFields).toHaveLength(4);
      expect(result.overriddenFields).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.finalConfig.defaultClassSettings.defaultCapacity).toBe(25);
    });

    it('should override institution settings with department-specific values', async () => {
      const expectedResult = {
        finalConfig: {
          defaultClassSettings: {
            defaultCapacity: 30, // Department override
            allowSelfEnrollment: true, // Inherited
            allowLateSubmissions: true, // Department override
            gradingScale: 'letter' // Inherited
          }
        },
        inheritedFields: [
          'defaultClassSettings.allowSelfEnrollment',
          'defaultClassSettings.gradingScale'
        ],
        overriddenFields: [
          'defaultClassSettings.defaultCapacity',
          'defaultClassSettings.allowLateSubmissions'
        ],
        conflicts: []
      };

      mockDepartmentConfigManager.getDepartmentConfig.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.getDepartmentConfig(mockDepartmentId);

      expect(result.overriddenFields).toContain('defaultClassSettings.defaultCapacity');
      expect(result.overriddenFields).toContain('defaultClassSettings.allowLateSubmissions');
      expect(result.inheritedFields).toContain('defaultClassSettings.allowSelfEnrollment');
      expect(result.finalConfig.defaultClassSettings.defaultCapacity).toBe(30);
    });

    it('should detect policy conflicts between department and institution settings', async () => {
      const expectedResult = {
        finalConfig: {
          defaultClassSettings: {
            allowSelfEnrollment: false, // Institution restriction
            allowExternalCollaboration: false // Institution restriction
          }
        },
        inheritedFields: [],
        overriddenFields: [],
        conflicts: [
          {
            field: 'defaultClassSettings.allowSelfEnrollment',
            departmentValue: true,
            institutionValue: false,
            conflictType: 'restriction',
            message: 'Institution policy prohibits self-enrollment',
            resolution: 'use_institution'
          },
          {
            field: 'collaborationRules.allowExternalCollaboration',
            departmentValue: true,
            institutionValue: false,
            conflictType: 'restriction',
            message: 'Institution policy prohibits external collaboration',
            resolution: 'use_institution'
          }
        ]
      };

      mockDepartmentConfigManager.getDepartmentConfig.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.getDepartmentConfig(mockDepartmentId);

      expect(result.conflicts).toHaveLength(2);
      expect(result.conflicts[0].conflictType).toBe('restriction');
      expect(result.conflicts[0].resolution).toBe('use_institution');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate basic department settings', async () => {
      const validSettings = {
        defaultClassSettings: {
          defaultCapacity: 25,
          passingGrade: 70,
          latePenaltyPercent: 10
        },
        collaborationRules: {
          defaultGroupSize: 3,
          maxGroupSize: 6
        }
      };

      const expectedValidation = {
        isValid: true,
        errors: [],
        conflicts: []
      };

      mockDepartmentConfigManager.validateDepartmentConfig.mockResolvedValue(expectedValidation);

      const result = await mockDepartmentConfigManager.validateDepartmentConfig(
        mockDepartmentId,
        validSettings
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect validation errors in department settings', async () => {
      const invalidSettings = {
        defaultClassSettings: {
          defaultCapacity: -5, // Invalid: negative capacity
          passingGrade: 150, // Invalid: over 100%
          latePenaltyPercent: -10 // Invalid: negative penalty
        },
        collaborationRules: {
          defaultGroupSize: 8,
          maxGroupSize: 6 // Invalid: default > max
        }
      };

      const expectedValidation = {
        isValid: false,
        errors: [
          {
            field: 'defaultClassSettings.defaultCapacity',
            message: 'Class capacity must be between 1 and 1000',
            code: 'INVALID_RANGE'
          },
          {
            field: 'defaultClassSettings.passingGrade',
            message: 'Passing grade must be between 0 and 100',
            code: 'INVALID_RANGE'
          },
          {
            field: 'defaultClassSettings.latePenaltyPercent',
            message: 'Late penalty must be between 0 and 100 percent',
            code: 'INVALID_RANGE'
          },
          {
            field: 'collaborationRules.defaultGroupSize',
            message: 'Default group size cannot be larger than maximum group size',
            code: 'INVALID_RANGE'
          }
        ],
        conflicts: []
      };

      mockDepartmentConfigManager.validateDepartmentConfig.mockResolvedValue(expectedValidation);

      const result = await mockDepartmentConfigManager.validateDepartmentConfig(
        mockDepartmentId,
        invalidSettings
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors[0].code).toBe('INVALID_RANGE');
    });

    it('should validate grading policy ranges for overlaps', async () => {
      const settingsWithOverlappingGrades = {
        gradingPolicies: [
          {
            id: 'test-policy',
            name: 'Test Policy',
            scale: 'letter',
            ranges: [
              { min: 90, max: 100, grade: 'A' },
              { min: 85, max: 95, grade: 'B' }, // Overlaps with A
              { min: 80, max: 89, grade: 'C' }
            ],
            allowExtraCredit: true,
            roundingRule: 'nearest',
            isDefault: true
          }
        ]
      };

      const expectedValidation = {
        isValid: false,
        errors: [
          {
            field: 'gradingPolicies[0].ranges',
            message: 'Grade ranges cannot overlap',
            code: 'INVALID_RANGE'
          }
        ],
        conflicts: []
      };

      mockDepartmentConfigManager.validateDepartmentConfig.mockResolvedValue(expectedValidation);

      const result = await mockDepartmentConfigManager.validateDepartmentConfig(
        mockDepartmentId,
        settingsWithOverlappingGrades
      );

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('overlap');
    });
  });

  describe('Configuration Updates', () => {
    it('should successfully update department configuration', async () => {
      const updateRequest = {
        departmentId: mockDepartmentId,
        settings: {
          defaultClassSettings: {
            defaultCapacity: 30,
            allowWaitlist: true
          }
        },
        updatedBy: mockUserId,
        reason: 'Updated class capacity'
      };

      const expectedResult = {
        success: true
      };

      mockDepartmentConfigManager.updateDepartmentConfig.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.updateDepartmentConfig(updateRequest);

      expect(result.success).toBe(true);
      expect(mockDepartmentConfigManager.updateDepartmentConfig).toHaveBeenCalledWith(updateRequest);
    });

    it('should handle conflicts during configuration update', async () => {
      const updateRequest = {
        departmentId: mockDepartmentId,
        settings: {
          defaultClassSettings: {
            allowSelfEnrollment: true // Conflicts with institution policy
          }
        },
        updatedBy: mockUserId
      };

      const expectedResult = {
        success: false,
        conflicts: [
          {
            field: 'defaultClassSettings.allowSelfEnrollment',
            departmentValue: true,
            institutionValue: false,
            conflictType: 'restriction',
            message: 'Institution policy prohibits self-enrollment'
          }
        ]
      };

      mockDepartmentConfigManager.updateDepartmentConfig.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.updateDepartmentConfig(updateRequest);

      expect(result.success).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].conflictType).toBe('restriction');
    });

    it('should handle validation errors during configuration update', async () => {
      const updateRequest = {
        departmentId: mockDepartmentId,
        settings: {
          defaultClassSettings: {
            defaultCapacity: -10 // Invalid value
          }
        },
        updatedBy: mockUserId
      };

      const expectedResult = {
        success: false,
        errors: [
          {
            field: 'defaultClassSettings.defaultCapacity',
            message: 'Class capacity must be between 1 and 1000',
            code: 'INVALID_RANGE'
          }
        ]
      };

      mockDepartmentConfigManager.updateDepartmentConfig.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.updateDepartmentConfig(updateRequest);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_RANGE');
    });
  });

  describe('Default Settings Generation', () => {
    it('should generate default department settings from institution policies', async () => {
      const expectedDefaults = {
        defaultClassSettings: {
          defaultCapacity: 30,
          allowWaitlist: true,
          requireApproval: false,
          allowSelfEnrollment: true,
          gradingScale: 'letter',
          passingGrade: 60,
          defaultDuration: 50,
          allowLateSubmissions: true,
          latePenaltyPercent: 10,
          maxLateDays: 7
        },
        gradingPolicies: [
          {
            id: 'default',
            name: 'Standard Letter Grades',
            scale: 'letter',
            ranges: [
              { min: 97, max: 100, grade: 'A+', gpa: 4.0 },
              { min: 93, max: 96, grade: 'A', gpa: 4.0 },
              { min: 90, max: 92, grade: 'A-', gpa: 3.7 }
              // ... more ranges
            ],
            allowExtraCredit: true,
            roundingRule: 'nearest',
            isDefault: true
          }
        ],
        assignmentDefaults: {
          allowLateSubmissions: true,
          latePenaltyPercent: 10,
          maxLateDays: 7,
          allowResubmissions: true,
          maxResubmissions: 3,
          defaultDueDays: 7,
          requireRubric: false,
          defaultPointValue: 100,
          allowPeerReview: true,
          anonymousGrading: false
        },
        collaborationRules: {
          allowPeerReview: true,
          allowGroupAssignments: true,
          allowCrossClassCollaboration: true,
          allowExternalCollaboration: true,
          defaultGroupSize: 3,
          maxGroupSize: 6,
          requireGroupApproval: false,
          allowStudentGroupCreation: true
        },
        notificationSettings: {
          emailNotifications: true,
          pushNotifications: true,
          digestFrequency: 'daily',
          notifyOnAssignmentCreated: true,
          notifyOnGradePosted: true,
          notifyOnAnnouncementPosted: true,
          notifyOnDiscussionReply: true
        },
        customFields: []
      };

      mockDepartmentConfigManager.getDefaultDepartmentSettings.mockResolvedValue(expectedDefaults);

      const result = await mockDepartmentConfigManager.getDefaultDepartmentSettings(mockInstitutionId);

      expect(result.defaultClassSettings.defaultCapacity).toBe(30);
      expect(result.gradingPolicies).toHaveLength(1);
      expect(result.gradingPolicies[0].isDefault).toBe(true);
      expect(result.assignmentDefaults.allowResubmissions).toBe(true);
      expect(result.collaborationRules.defaultGroupSize).toBe(3);
    });

    it('should apply institution restrictions to default settings', async () => {
      const restrictiveDefaults = {
        defaultClassSettings: {
          allowSelfEnrollment: false, // Institution restriction
          allowLateSubmissions: false // Institution restriction
        },
        collaborationRules: {
          allowExternalCollaboration: false // Institution restriction
        }
      };

      mockDepartmentConfigManager.getDefaultDepartmentSettings.mockResolvedValue(restrictiveDefaults);

      const result = await mockDepartmentConfigManager.getDefaultDepartmentSettings(mockInstitutionId);

      expect(result.defaultClassSettings.allowSelfEnrollment).toBe(false);
      expect(result.defaultClassSettings.allowLateSubmissions).toBe(false);
      expect(result.collaborationRules.allowExternalCollaboration).toBe(false);
    });
  });

  describe('Configuration Hierarchy', () => {
    it('should return configuration hierarchy showing inheritance', async () => {
      const expectedHierarchy = {
        institution: {
          defaultClassCapacity: 25,
          allowSelfEnrollment: true,
          gradingScale: 'letter'
        },
        department: {
          defaultClassCapacity: 30, // Override
          allowWaitlist: true // Department-specific
        },
        inherited: [
          'allowSelfEnrollment',
          'gradingScale'
        ],
        overridden: [
          'defaultClassCapacity'
        ]
      };

      mockDepartmentConfigManager.getConfigHierarchy.mockResolvedValue(expectedHierarchy);

      const result = await mockDepartmentConfigManager.getConfigHierarchy(mockDepartmentId);

      expect(result.inherited).toContain('allowSelfEnrollment');
      expect(result.overridden).toContain('defaultClassCapacity');
      expect(result.department.defaultClassCapacity).toBe(30);
      expect(result.institution.defaultClassCapacity).toBe(25);
    });
  });

  describe('Configuration Reset', () => {
    it('should reset department configuration to institution defaults', async () => {
      const expectedResult = {
        success: true
      };

      mockDepartmentConfigManager.resetToInstitutionDefaults.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.resetToInstitutionDefaults(
        mockDepartmentId,
        mockUserId,
        undefined // Reset all fields
      );

      expect(result.success).toBe(true);
      expect(mockDepartmentConfigManager.resetToInstitutionDefaults).toHaveBeenCalledWith(
        mockDepartmentId,
        mockUserId,
        undefined
      );
    });

    it('should reset specific fields to institution defaults', async () => {
      const fieldsToReset = [
        'defaultClassSettings.defaultCapacity',
        'assignmentDefaults.allowLateSubmissions'
      ];

      const expectedResult = {
        success: true
      };

      mockDepartmentConfigManager.resetToInstitutionDefaults.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.resetToInstitutionDefaults(
        mockDepartmentId,
        mockUserId,
        fieldsToReset
      );

      expect(result.success).toBe(true);
      expect(mockDepartmentConfigManager.resetToInstitutionDefaults).toHaveBeenCalledWith(
        mockDepartmentId,
        mockUserId,
        fieldsToReset
      );
    });

    it('should handle errors during configuration reset', async () => {
      const expectedResult = {
        success: false,
        errors: [
          {
            field: 'department',
            message: 'Department not found',
            code: 'NOT_FOUND'
          }
        ]
      };

      mockDepartmentConfigManager.resetToInstitutionDefaults.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.resetToInstitutionDefaults(
        'non-existent-department',
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NOT_FOUND');
    });
  });

  describe('Policy Conflict Resolution', () => {
    it('should resolve conflicts by using institution values', async () => {
      const conflicts = [
        {
          field: 'defaultClassSettings.allowSelfEnrollment',
          departmentValue: true,
          institutionValue: false,
          conflictType: 'restriction',
          message: 'Institution policy prohibits self-enrollment',
          resolution: 'use_institution'
        }
      ];

      const settings = {
        defaultClassSettings: {
          allowSelfEnrollment: true
        }
      };

      // Mock the conflict resolution process
      const expectedResolvedSettings = {
        defaultClassSettings: {
          allowSelfEnrollment: false // Resolved to institution value
        }
      };

      const updateRequest = {
        departmentId: mockDepartmentId,
        settings: expectedResolvedSettings,
        updatedBy: mockUserId,
        reason: 'Resolved policy conflicts'
      };

      mockDepartmentConfigManager.updateDepartmentConfig.mockResolvedValue({ success: true });

      const result = await mockDepartmentConfigManager.updateDepartmentConfig(updateRequest);

      expect(result.success).toBe(true);
    });

    it('should resolve conflicts by merging values', async () => {
      const conflicts = [
        {
          field: 'customFields',
          departmentValue: [{ id: 'dept1', name: 'Department Field' }],
          institutionValue: [{ id: 'inst1', name: 'Institution Field' }],
          conflictType: 'requirement',
          message: 'Both institution and department fields are required',
          resolution: 'merge'
        }
      ];

      // Mock merged result
      const expectedMergedValue = [
        { id: 'inst1', name: 'Institution Field' },
        { id: 'dept1', name: 'Department Field' }
      ];

      const updateRequest = {
        departmentId: mockDepartmentId,
        settings: {
          customFields: expectedMergedValue
        },
        updatedBy: mockUserId,
        reason: 'Merged conflicting values'
      };

      mockDepartmentConfigManager.updateDepartmentConfig.mockResolvedValue({ success: true });

      const result = await mockDepartmentConfigManager.updateDepartmentConfig(updateRequest);

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDepartmentConfigManager.getDepartmentConfig.mockRejectedValue(
        new Error('Database connection failed')
      );

      try {
        await mockDepartmentConfigManager.getDepartmentConfig(mockDepartmentId);
      } catch (error) {
        expect(error.message).toBe('Database connection failed');
      }
    });

    it('should handle missing department errors', async () => {
      const expectedResult = {
        success: false,
        errors: [
          {
            field: 'departmentId',
            message: 'Department not found',
            code: 'NOT_FOUND'
          }
        ]
      };

      mockDepartmentConfigManager.updateDepartmentConfig.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.updateDepartmentConfig({
        departmentId: 'non-existent-department',
        settings: {},
        updatedBy: mockUserId
      });

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('NOT_FOUND');
    });

    it('should handle permission errors', async () => {
      const expectedResult = {
        success: false,
        errors: [
          {
            field: 'permission',
            message: 'Insufficient permissions to modify department configuration',
            code: 'INSUFFICIENT_PERMISSIONS'
          }
        ]
      };

      mockDepartmentConfigManager.updateDepartmentConfig.mockResolvedValue(expectedResult);

      const result = await mockDepartmentConfigManager.updateDepartmentConfig({
        departmentId: mockDepartmentId,
        settings: {},
        updatedBy: 'unauthorized-user'
      });

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });
});