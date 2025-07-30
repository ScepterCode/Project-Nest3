const { DepartmentManager } = require('../../lib/services/department-manager');
const { DepartmentConfigManager } = require('../../lib/services/department-config-manager');

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
  upsert: jest.fn(),
  or: jest.fn(),
  is: jest.fn(),
  neq: jest.fn(),
  limit: jest.fn(),
  range: jest.fn(),
  order: jest.fn()
};

jest.mock('../../lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('Department Manager Integration', () => {
  let departmentManager;
  let configManager;
  let mockContext;

  beforeEach(() => {
    departmentManager = new DepartmentManager();
    configManager = new DepartmentConfigManager();
    
    mockContext = {
      institutionId: 'inst-123',
      departmentId: 'dept-123',
      userId: 'user-123',
      role: 'department_admin',
      permissions: ['manage_department']
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Department Creation with Configuration', () => {
    it('should create department with default configuration and allow updates', async () => {
      // Mock department creation
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'departments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Not found' }
                })
              })
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'dept-123',
                    institution_id: 'inst-123',
                    name: 'Computer Science',
                    description: 'CS Department',
                    code: 'CS',
                    admin_id: 'admin-123',
                    settings: {
                      defaultClassSettings: {
                        defaultCapacity: 30,
                        allowWaitlist: true,
                        requireApproval: false,
                        allowSelfEnrollment: true,
                        gradingScale: 'letter',
                        passingGrade: 70
                      },
                      gradingPolicies: [{
                        name: 'Standard Letter Grade',
                        scale: 'letter',
                        ranges: [
                          { min: 90, max: 100, grade: 'A' },
                          { min: 80, max: 89, grade: 'B' },
                          { min: 70, max: 79, grade: 'C' },
                          { min: 60, max: 69, grade: 'D' },
                          { min: 0, max: 59, grade: 'F' }
                        ],
                        allowExtraCredit: true,
                        roundingRule: 'nearest'
                      }],
                      assignmentDefaults: {
                        allowLateSubmissions: true,
                        latePenaltyPercent: 10,
                        maxLateDays: 7,
                        allowResubmissions: false,
                        maxResubmissions: 0,
                        defaultDueDays: 7,
                        requireRubric: false
                      },
                      collaborationRules: {
                        allowPeerReview: true,
                        allowGroupAssignments: true,
                        allowCrossClassCollaboration: false,
                        allowExternalCollaboration: false,
                        defaultGroupSize: 3,
                        maxGroupSize: 6
                      },
                      customFields: []
                    },
                    parent_department_id: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'admin-123',
                    role: 'department_admin'
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'user_departments') {
          return {
            upsert: jest.fn().mockResolvedValue({
              error: null
            })
          };
        }
        return mockSupabase;
      });

      // Create department
      const departmentData = {
        name: 'Computer Science',
        description: 'CS Department',
        code: 'CS',
        adminId: 'admin-123'
      };

      const createResult = await departmentManager.createDepartment('inst-123', departmentData, mockContext);

      expect(createResult.success).toBe(true);
      expect(createResult.department).toBeDefined();
      expect(createResult.department.settings.defaultClassSettings.defaultCapacity).toBe(30);
    });

    it('should handle configuration updates with policy inheritance', async () => {
      // Mock department and institution fetches for config update
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'departments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'dept-123',
                    institution_id: 'inst-123',
                    name: 'Computer Science',
                    description: 'CS Department',
                    code: 'CS',
                    admin_id: 'admin-123',
                    settings: {
                      defaultClassSettings: {
                        defaultCapacity: 30,
                        allowWaitlist: true,
                        requireApproval: false,
                        allowSelfEnrollment: true,
                        gradingScale: 'letter',
                        passingGrade: 70
                      },
                      gradingPolicies: [],
                      assignmentDefaults: {
                        allowLateSubmissions: true,
                        latePenaltyPercent: 10,
                        maxLateDays: 7,
                        allowResubmissions: false,
                        maxResubmissions: 0,
                        defaultDueDays: 7,
                        requireRubric: false
                      },
                      collaborationRules: {
                        allowPeerReview: true,
                        allowGroupAssignments: true,
                        allowCrossClassCollaboration: false,
                        allowExternalCollaboration: false,
                        defaultGroupSize: 3,
                        maxGroupSize: 6
                      },
                      customFields: []
                    },
                    parent_department_id: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  },
                  error: null
                })
              })
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                error: null
              })
            })
          };
        }
        if (table === 'institutions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'inst-123',
                    name: 'Test University',
                    domain: 'test.edu',
                    type: 'university',
                    status: 'active',
                    contact_email: 'admin@test.edu',
                    settings: {
                      allowSelfRegistration: true,
                      requireEmailVerification: true,
                      defaultUserRole: 'student',
                      allowCrossInstitutionCollaboration: false,
                      contentSharingPolicy: {
                        allowCrossInstitution: false,
                        allowPublicSharing: true,
                        requireAttribution: true,
                        defaultSharingLevel: 'department'
                      },
                      dataRetentionPolicy: {
                        retentionPeriodDays: 365,
                        autoDeleteInactive: false,
                        backupBeforeDelete: true
                      },
                      integrations: [],
                      customFields: [],
                      featureFlags: {
                        allowSelfRegistration: true,
                        enableAnalytics: true,
                        enableIntegrations: true,
                        enableCustomBranding: true,
                        enableDepartmentHierarchy: true,
                        enableContentSharing: true
                      }
                    },
                    branding: {
                      primaryColor: '#000000',
                      secondaryColor: '#ffffff',
                      accentColor: '#ff0000'
                    },
                    subscription: {
                      plan: 'premium',
                      userLimit: 1000,
                      storageLimit: 100,
                      features: [],
                      billingCycle: 'yearly',
                      nextBillingDate: new Date(),
                      status: 'active'
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    created_by: 'creator-123'
                  },
                  error: null
                })
              })
            })
          };
        }
        return mockSupabase;
      });

      // Update department configuration
      const configUpdates = {
        defaultClassSettings: {
          defaultCapacity: 25,
          allowWaitlist: false,
          requireApproval: true,
          allowSelfEnrollment: false,
          gradingScale: 'percentage',
          passingGrade: 75
        }
      };

      const updateResult = await configManager.updateDepartmentConfig('dept-123', configUpdates, mockContext);

      expect(updateResult.isValid).toBe(true);
      expect(updateResult.errors).toHaveLength(0);
    });

    it('should detect and prevent policy conflicts', async () => {
      // Mock department and institution with conflicting policies
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'departments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'dept-123',
                    institution_id: 'inst-123',
                    name: 'Computer Science',
                    description: 'CS Department',
                    code: 'CS',
                    admin_id: 'admin-123',
                    settings: {
                      defaultClassSettings: {
                        defaultCapacity: 30,
                        allowWaitlist: true,
                        requireApproval: false,
                        allowSelfEnrollment: true,
                        gradingScale: 'letter',
                        passingGrade: 70
                      },
                      gradingPolicies: [],
                      assignmentDefaults: {
                        allowLateSubmissions: true,
                        latePenaltyPercent: 10,
                        maxLateDays: 7,
                        allowResubmissions: false,
                        maxResubmissions: 0,
                        defaultDueDays: 7,
                        requireRubric: false
                      },
                      collaborationRules: {
                        allowPeerReview: true,
                        allowGroupAssignments: true,
                        allowCrossClassCollaboration: false,
                        allowExternalCollaboration: false,
                        defaultGroupSize: 3,
                        maxGroupSize: 6
                      },
                      customFields: []
                    },
                    parent_department_id: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'institutions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'inst-123',
                    name: 'Test University',
                    domain: 'test.edu',
                    type: 'university',
                    status: 'active',
                    contact_email: 'admin@test.edu',
                    settings: {
                      allowSelfRegistration: true,
                      requireEmailVerification: true,
                      defaultUserRole: 'student',
                      allowCrossInstitutionCollaboration: false, // This will conflict
                      contentSharingPolicy: {
                        allowCrossInstitution: false,
                        allowPublicSharing: true,
                        requireAttribution: true,
                        defaultSharingLevel: 'department'
                      },
                      dataRetentionPolicy: {
                        retentionPeriodDays: 365,
                        autoDeleteInactive: false,
                        backupBeforeDelete: true
                      },
                      integrations: [],
                      customFields: [],
                      featureFlags: {
                        allowSelfRegistration: true,
                        enableAnalytics: true,
                        enableIntegrations: true,
                        enableCustomBranding: true,
                        enableDepartmentHierarchy: true,
                        enableContentSharing: true
                      }
                    },
                    branding: {
                      primaryColor: '#000000',
                      secondaryColor: '#ffffff',
                      accentColor: '#ff0000'
                    },
                    subscription: {
                      plan: 'premium',
                      userLimit: 1000,
                      storageLimit: 100,
                      features: [],
                      billingCycle: 'yearly',
                      nextBillingDate: new Date(),
                      status: 'active'
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    created_by: 'creator-123'
                  },
                  error: null
                })
              })
            })
          };
        }
        return mockSupabase;
      });

      // Try to update with conflicting external collaboration setting
      const conflictingUpdates = {
        collaborationRules: {
          allowPeerReview: true,
          allowGroupAssignments: true,
          allowCrossClassCollaboration: false,
          allowExternalCollaboration: true, // This conflicts with institution policy
          defaultGroupSize: 3,
          maxGroupSize: 6
        }
      };

      const updateResult = await configManager.updateDepartmentConfig('dept-123', conflictingUpdates, mockContext);

      expect(updateResult.isValid).toBe(false);
      expect(updateResult.conflicts).toBeDefined();
      expect(updateResult.conflicts.some(c => c.field === 'collaborationRules.allowExternalCollaboration')).toBe(true);
      expect(updateResult.conflicts.find(c => c.field === 'collaborationRules.allowExternalCollaboration').severity).toBe('error');
    });
  });

  describe('Department Preferences Management', () => {
    it('should manage department preferences independently of configuration', async () => {
      // Mock department access validation
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'departments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'dept-123',
                    institution_id: 'inst-123',
                    name: 'Computer Science',
                    description: 'CS Department',
                    code: 'CS',
                    admin_id: 'admin-123',
                    settings: {},
                    parent_department_id: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'department_preferences') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116' } // Not found
                })
              })
            }),
            upsert: jest.fn().mockResolvedValue({
              error: null
            })
          };
        }
        return mockSupabase;
      });

      // Get default preferences
      const getResult = await configManager.getDepartmentPreferences('dept-123', mockContext);
      expect(getResult.success).toBe(true);
      expect(getResult.preferences.emailNotifications.newEnrollments).toBe(true);

      // Update preferences
      const preferenceUpdates = {
        emailNotifications: {
          newEnrollments: false,
          assignmentSubmissions: true,
          gradeUpdates: false,
          systemAnnouncements: true
        },
        dashboardLayout: {
          defaultView: 'analytics',
          showQuickStats: false,
          compactMode: true
        }
      };

      const updateResult = await configManager.updateDepartmentPreferences('dept-123', preferenceUpdates, mockContext);
      expect(updateResult.success).toBe(true);
    });
  });

  describe('Department Hierarchy with Configuration Inheritance', () => {
    it('should handle configuration inheritance in department hierarchies', async () => {
      // Mock parent and child departments
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'departments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockImplementation(async () => {
                  // Return different departments based on call order
                  const callCount = mockSupabase.from.mock.calls.filter(call => call[0] === 'departments').length;
                  
                  if (callCount <= 2) {
                    // Parent department
                    return {
                      data: {
                        id: 'parent-dept-123',
                        institution_id: 'inst-123',
                        name: 'Engineering',
                        description: 'Engineering Department',
                        code: 'ENG',
                        admin_id: 'admin-123',
                        settings: {
                          defaultClassSettings: {
                            defaultCapacity: 40,
                            allowWaitlist: true,
                            requireApproval: true,
                            allowSelfEnrollment: false,
                            gradingScale: 'letter',
                            passingGrade: 75
                          },
                          gradingPolicies: [],
                          assignmentDefaults: {
                            allowLateSubmissions: false,
                            latePenaltyPercent: 15,
                            maxLateDays: 3,
                            allowResubmissions: true,
                            maxResubmissions: 1,
                            defaultDueDays: 14,
                            requireRubric: true
                          },
                          collaborationRules: {
                            allowPeerReview: true,
                            allowGroupAssignments: true,
                            allowCrossClassCollaboration: true,
                            allowExternalCollaboration: false,
                            defaultGroupSize: 4,
                            maxGroupSize: 8
                          },
                          customFields: []
                        },
                        parent_department_id: null,
                        status: 'active',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                      },
                      error: null
                    };
                  } else {
                    // Child department
                    return {
                      data: {
                        id: 'child-dept-123',
                        institution_id: 'inst-123',
                        name: 'Computer Science',
                        description: 'CS Department',
                        code: 'CS',
                        admin_id: 'admin-123',
                        settings: {
                          defaultClassSettings: {
                            defaultCapacity: 30, // Different from parent
                            allowWaitlist: true,
                            requireApproval: true, // Inherited from parent
                            allowSelfEnrollment: false, // Inherited from parent
                            gradingScale: 'letter',
                            passingGrade: 70 // Different from parent
                          },
                          gradingPolicies: [],
                          assignmentDefaults: {
                            allowLateSubmissions: false, // Inherited from parent
                            latePenaltyPercent: 10, // Different from parent
                            maxLateDays: 3, // Inherited from parent
                            allowResubmissions: true, // Inherited from parent
                            maxResubmissions: 1, // Inherited from parent
                            defaultDueDays: 7, // Different from parent
                            requireRubric: true // Inherited from parent
                          },
                          collaborationRules: {
                            allowPeerReview: true,
                            allowGroupAssignments: true,
                            allowCrossClassCollaboration: false, // Different from parent
                            allowExternalCollaboration: false,
                            defaultGroupSize: 3, // Different from parent
                            maxGroupSize: 6 // Different from parent
                          },
                          customFields: []
                        },
                        parent_department_id: 'parent-dept-123',
                        status: 'active',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                      },
                      error: null
                    };
                  }
                })
              })
            })
          };
        }
        if (table === 'institutions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'inst-123',
                    name: 'Test University',
                    domain: 'test.edu',
                    type: 'university',
                    status: 'active',
                    contact_email: 'admin@test.edu',
                    settings: {
                      allowSelfRegistration: true,
                      requireEmailVerification: true,
                      defaultUserRole: 'student',
                      allowCrossInstitutionCollaboration: false,
                      contentSharingPolicy: {
                        allowCrossInstitution: false,
                        allowPublicSharing: true,
                        requireAttribution: true,
                        defaultSharingLevel: 'department'
                      },
                      dataRetentionPolicy: {
                        retentionPeriodDays: 365,
                        autoDeleteInactive: false,
                        backupBeforeDelete: true
                      },
                      integrations: [],
                      customFields: [],
                      featureFlags: {
                        allowSelfRegistration: true,
                        enableAnalytics: true,
                        enableIntegrations: true,
                        enableCustomBranding: true,
                        enableDepartmentHierarchy: true,
                        enableContentSharing: true
                      }
                    },
                    branding: {
                      primaryColor: '#000000',
                      secondaryColor: '#ffffff',
                      accentColor: '#ff0000'
                    },
                    subscription: {
                      plan: 'premium',
                      userLimit: 1000,
                      storageLimit: 100,
                      features: [],
                      billingCycle: 'yearly',
                      nextBillingDate: new Date(),
                      status: 'active'
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    created_by: 'creator-123'
                  },
                  error: null
                })
              })
            })
          };
        }
        return mockSupabase;
      });

      // Get child department configuration (should inherit from parent and institution)
      const childConfigResult = await configManager.getDepartmentConfig('child-dept-123', mockContext);

      expect(childConfigResult.success).toBe(true);
      expect(childConfigResult.config).toBeDefined();
      
      // Verify some inherited settings
      expect(childConfigResult.config.assignmentDefaults.requireRubric).toBe(true); // Should inherit from parent
      expect(childConfigResult.config.collaborationRules.allowExternalCollaboration).toBe(false); // Should be restricted by institution
    });
  });
});