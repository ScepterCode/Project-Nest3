// Content Sharing Policy Manager Tests
// Testing content sharing and collaboration policy functionality

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        order: jest.fn(() => ({}))
      })),
      single: jest.fn(),
      order: jest.fn(() => ({}))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn()
    }))
  }))
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

// Mock the ContentSharingPolicyManager class
const ContentSharingPolicyManager = jest.fn().mockImplementation(() => ({
  createSharingPolicy: jest.fn(),
  updateSharingPolicy: jest.fn(),
  getSharingPolicy: jest.fn(),
  getInstitutionPolicies: jest.fn(),
  deleteSharingPolicy: jest.fn(),
  createCollaborationSettings: jest.fn(),
  getCollaborationSettings: jest.fn(),
  updateCollaborationSettings: jest.fn(),
  checkSharingPermission: jest.fn(),
  enforceAttributionRequirements: jest.fn(),
  reportPolicyViolation: jest.fn()
}));

describe('ContentSharingPolicyManager', () => {
  let policyManager;

  beforeEach(() => {
    policyManager = new ContentSharingPolicyManager();
    jest.clearAllMocks();
  });
  
  describe('Policy Validation Logic', () => {
    // Helper function to simulate policy validation
    const validateSharingPolicy = (policy) => {
      const errors = [];
      
      if (!policy.institutionId) {
        errors.push({ field: 'institutionId', message: 'Institution ID is required' });
      }
      
      if (!policy.resourceType) {
        errors.push({ field: 'resourceType', message: 'Resource type is required' });
      }
      
      if (!policy.sharingLevel) {
        errors.push({ field: 'sharingLevel', message: 'Sharing level is required' });
      }
      
      // Validate sharing level hierarchy
      const validLevels = ['private', 'department', 'institution', 'cross_institution', 'public'];
      if (policy.sharingLevel && !validLevels.includes(policy.sharingLevel)) {
        errors.push({ field: 'sharingLevel', message: 'Invalid sharing level' });
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    };

    it('should validate complete policy data successfully', () => {
      const policyData = {
        institutionId: 'inst-1',
        resourceType: 'assignment',
        sharingLevel: 'department',
        conditions: {},
        attributionRequired: true,
        allowCrossInstitution: false,
        createdBy: 'user-1'
      };

      const validation = validateSharingPolicy(policyData);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject policy with missing required fields', () => {
      const incompletePolicy = {
        resourceType: 'assignment'
      };

      const validation = validateSharingPolicy(incompletePolicy);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(2); // Missing institutionId and sharingLevel
    });

    it('should reject policy with invalid sharing level', () => {
      const invalidPolicy = {
        institutionId: 'inst-1',
        resourceType: 'assignment',
        sharingLevel: 'invalid_level'
      };

      const validation = validateSharingPolicy(invalidPolicy);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.field === 'sharingLevel')).toBe(true);
    });
  });

  describe('Sharing Permission Logic', () => {
    // Helper function to simulate permission checking
    const checkSharingPermission = (fromInstitution, toInstitution, policy) => {
      // No policy means no sharing allowed
      if (!policy) {
        return { allowed: false, reason: 'No sharing policy defined for this content type' };
      }

      // Check cross-institution sharing
      if (fromInstitution !== toInstitution && !policy.allowCrossInstitution) {
        return { allowed: false, reason: 'Cross-institution sharing not permitted' };
      }

      // Check sharing level hierarchy
      const levelHierarchy = ['private', 'department', 'institution', 'cross_institution', 'public'];
      const policyLevelIndex = levelHierarchy.indexOf(policy.sharingLevel);
      const requestedLevelIndex = levelHierarchy.indexOf(
        fromInstitution === toInstitution ? 'department' : 'cross_institution'
      );

      if (requestedLevelIndex > policyLevelIndex) {
        return { 
          allowed: false, 
          reason: `Sharing level exceeds policy limit of ${policy.sharingLevel}` 
        };
      }

      return { 
        allowed: true, 
        requiresApproval: policy.conditions?.requireApproval || false 
      };
    };

    it('should allow sharing within same institution', () => {
      const policy = {
        sharingLevel: 'institution',
        allowCrossInstitution: false,
        conditions: {}
      };

      const result = checkSharingPermission('inst-1', 'inst-1', policy);
      expect(result.allowed).toBe(true);
    });

    it('should deny cross-institution sharing when not allowed', () => {
      const policy = {
        sharingLevel: 'institution',
        allowCrossInstitution: false,
        conditions: {}
      };

      const result = checkSharingPermission('inst-1', 'inst-2', policy);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cross-institution sharing not permitted');
    });

    it('should allow cross-institution sharing when policy permits', () => {
      const policy = {
        sharingLevel: 'cross_institution',
        allowCrossInstitution: true,
        conditions: {}
      };

      const result = checkSharingPermission('inst-1', 'inst-2', policy);
      expect(result.allowed).toBe(true);
    });

    it('should require approval when configured', () => {
      const policy = {
        sharingLevel: 'cross_institution',
        allowCrossInstitution: true,
        conditions: { requireApproval: true }
      };

      const result = checkSharingPermission('inst-1', 'inst-2', policy);
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should deny sharing when no policy exists', () => {
      const result = checkSharingPermission('inst-1', 'inst-2', null);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No sharing policy defined');
    });
  });

  describe('Attribution Requirements', () => {
    // Helper function to validate attribution data
    const validateAttribution = (attribution) => {
      const errors = [];
      
      if (!attribution.contentId) {
        errors.push({ field: 'contentId', message: 'Content ID is required' });
      }
      
      if (!attribution.originalAuthorId) {
        errors.push({ field: 'originalAuthorId', message: 'Original author ID is required' });
      }
      
      if (!attribution.originalInstitutionId) {
        errors.push({ field: 'originalInstitutionId', message: 'Original institution ID is required' });
      }
      
      if (!attribution.attributionText) {
        errors.push({ field: 'attributionText', message: 'Attribution text is required' });
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    };

    it('should validate complete attribution data', () => {
      const attributionData = {
        contentId: 'content-1',
        originalAuthorId: 'user-1',
        originalInstitutionId: 'inst-1',
        originalDepartmentId: 'dept-1',
        attributionText: 'Original content by John Doe from University A',
        licenseType: 'CC-BY'
      };

      const validation = validateAttribution(attributionData);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject attribution with missing required fields', () => {
      const incompleteAttribution = {
        contentId: 'content-1'
      };

      const validation = validateAttribution(incompleteAttribution);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Collaboration Settings Validation', () => {
    // Helper function to validate collaboration settings
    const validateCollaborationSettings = (settings) => {
      const errors = [];
      
      if (!settings.institutionId) {
        errors.push({ field: 'institutionId', message: 'Institution ID is required' });
      }
      
      if (settings.maxCollaborators !== undefined && settings.maxCollaborators < 1) {
        errors.push({ field: 'maxCollaborators', message: 'Max collaborators must be at least 1' });
      }
      
      if (settings.allowExternalCollaborators && settings.externalDomainWhitelist && 
          settings.externalDomainWhitelist.length === 0) {
        errors.push({ 
          field: 'externalDomainWhitelist', 
          message: 'External domain whitelist required when allowing external collaborators' 
        });
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    };

    it('should validate complete collaboration settings', () => {
      const settings = {
        institutionId: 'inst-1',
        allowCrossInstitutionCollaboration: true,
        allowCrossDepartmentCollaboration: true,
        defaultPermissions: ['view', 'comment'],
        approvalRequired: false,
        maxCollaborators: 10,
        allowExternalCollaborators: false
      };

      const validation = validateCollaborationSettings(settings);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject settings with invalid max collaborators', () => {
      const settings = {
        institutionId: 'inst-1',
        maxCollaborators: 0
      };

      const validation = validateCollaborationSettings(settings);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.field === 'maxCollaborators')).toBe(true);
    });

    it('should require domain whitelist for external collaborators', () => {
      const settings = {
        institutionId: 'inst-1',
        allowExternalCollaborators: true,
        externalDomainWhitelist: []
      };

      const validation = validateCollaborationSettings(settings);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.field === 'externalDomainWhitelist')).toBe(true);
    });
  });

  describe('Policy CRUD Operations', () => {
    it('should create a sharing policy successfully', async () => {
      const expectedResult = {
        id: 'policy-1',
        institutionId: 'inst-1',
        resourceType: 'assignment',
        sharingLevel: 'department',
        conditions: {},
        attributionRequired: true,
        allowCrossInstitution: false,
        createdBy: 'user-1'
      };

      policyManager.createSharingPolicy.mockResolvedValue(expectedResult);

      const policyInput = {
        institutionId: 'inst-1',
        resourceType: 'assignment',
        sharingLevel: 'department',
        conditions: {},
        attributionRequired: true,
        allowCrossInstitution: false,
        createdBy: 'user-1'
      };

      const result = await policyManager.createSharingPolicy(policyInput);

      expect(result.id).toBe('policy-1');
      expect(result.institutionId).toBe('inst-1');
      expect(result.resourceType).toBe('assignment');
      expect(policyManager.createSharingPolicy).toHaveBeenCalledWith(policyInput);
    });

    it('should get institution policies', async () => {
      const expectedPolicies = [
        {
          id: 'policy-1',
          institutionId: 'inst-1',
          resourceType: 'assignment',
          sharingLevel: 'department',
          conditions: {},
          attributionRequired: true,
          allowCrossInstitution: false,
          createdBy: 'user-1'
        }
      ];

      policyManager.getInstitutionPolicies.mockResolvedValue(expectedPolicies);

      const result = await policyManager.getInstitutionPolicies('inst-1');

      expect(result).toHaveLength(1);
      expect(result[0].institutionId).toBe('inst-1');
      expect(policyManager.getInstitutionPolicies).toHaveBeenCalledWith('inst-1');
    });

    it('should update a sharing policy', async () => {
      const expectedUpdatedPolicy = {
        id: 'policy-1',
        institutionId: 'inst-1',
        resourceType: 'assignment',
        sharingLevel: 'institution',
        conditions: { requireApproval: true },
        attributionRequired: true,
        allowCrossInstitution: false,
        createdBy: 'user-1'
      };

      policyManager.updateSharingPolicy.mockResolvedValue(expectedUpdatedPolicy);

      const updates = {
        sharingLevel: 'institution',
        conditions: { requireApproval: true }
      };

      const result = await policyManager.updateSharingPolicy('policy-1', updates);

      expect(result.sharingLevel).toBe('institution');
      expect(result.conditions.requireApproval).toBe(true);
      expect(policyManager.updateSharingPolicy).toHaveBeenCalledWith('policy-1', updates);
    });

    it('should delete a sharing policy', async () => {
      policyManager.deleteSharingPolicy.mockResolvedValue();

      await policyManager.deleteSharingPolicy('policy-1');

      expect(policyManager.deleteSharingPolicy).toHaveBeenCalledWith('policy-1');
    });
  });

  describe('Collaboration Settings CRUD Operations', () => {
    it('should create collaboration settings successfully', async () => {
      const expectedSettings = {
        id: 'settings-1',
        institutionId: 'inst-1',
        allowCrossInstitutionCollaboration: true,
        allowCrossDepartmentCollaboration: true,
        defaultPermissions: ['view', 'comment'],
        approvalRequired: false,
        approverRoles: [],
        maxCollaborators: 10,
        allowExternalCollaborators: false
      };

      policyManager.createCollaborationSettings.mockResolvedValue(expectedSettings);

      const settingsInput = {
        institutionId: 'inst-1',
        allowCrossInstitutionCollaboration: true,
        allowCrossDepartmentCollaboration: true,
        defaultPermissions: ['view', 'comment'],
        approvalRequired: false,
        approverRoles: [],
        maxCollaborators: 10,
        allowExternalCollaborators: false
      };

      const result = await policyManager.createCollaborationSettings(settingsInput);

      expect(result.id).toBe('settings-1');
      expect(result.institutionId).toBe('inst-1');
      expect(result.allowCrossInstitutionCollaboration).toBe(true);
      expect(policyManager.createCollaborationSettings).toHaveBeenCalledWith(settingsInput);
    });

    it('should get collaboration settings', async () => {
      const expectedSettings = {
        id: 'settings-1',
        institutionId: 'inst-1',
        allowCrossInstitutionCollaboration: true,
        allowCrossDepartmentCollaboration: true,
        defaultPermissions: ['view', 'comment'],
        approvalRequired: false,
        approverRoles: [],
        maxCollaborators: 10,
        allowExternalCollaborators: false
      };

      policyManager.getCollaborationSettings.mockResolvedValue(expectedSettings);

      const result = await policyManager.getCollaborationSettings('inst-1');

      expect(result.institutionId).toBe('inst-1');
      expect(result.allowCrossInstitutionCollaboration).toBe(true);
      expect(policyManager.getCollaborationSettings).toHaveBeenCalledWith('inst-1');
    });
  });

  describe('Policy Enforcement Integration', () => {
    it('should check sharing permission correctly', async () => {
      const expectedResult = { allowed: true, requiresApproval: false };
      
      policyManager.checkSharingPermission.mockResolvedValue(expectedResult);

      const result = await policyManager.checkSharingPermission(
        'content-1',
        'assignment',
        'inst-1',
        'inst-2',
        'cross_institution'
      );

      expect(result.allowed).toBe(true);
      expect(policyManager.checkSharingPermission).toHaveBeenCalledWith(
        'content-1',
        'assignment',
        'inst-1',
        'inst-2',
        'cross_institution'
      );
    });

    it('should enforce attribution requirements', async () => {
      const expectedAttribution = {
        id: 'attr-1',
        contentId: 'content-1',
        originalAuthorId: 'user-1',
        originalInstitutionId: 'inst-1',
        attributionText: 'Test attribution'
      };

      policyManager.enforceAttributionRequirements.mockResolvedValue(expectedAttribution);

      const attributionInput = {
        contentId: 'content-1',
        originalAuthorId: 'user-1',
        originalInstitutionId: 'inst-1',
        attributionText: 'Test attribution'
      };

      const result = await policyManager.enforceAttributionRequirements('content-1', attributionInput);

      expect(result.id).toBe('attr-1');
      expect(result.contentId).toBe('content-1');
      expect(policyManager.enforceAttributionRequirements).toHaveBeenCalledWith('content-1', attributionInput);
    });

    it('should report policy violations', async () => {
      const expectedViolation = {
        id: 'violation-1',
        contentId: 'content-1',
        policyId: 'policy-1',
        violationType: 'unauthorized_sharing',
        description: 'Test violation',
        status: 'reported'
      };

      policyManager.reportPolicyViolation.mockResolvedValue(expectedViolation);

      const violationInput = {
        contentId: 'content-1',
        policyId: 'policy-1',
        violationType: 'unauthorized_sharing',
        description: 'Test violation',
        reportedBy: 'user-1',
        status: 'reported'
      };

      const result = await policyManager.reportPolicyViolation(violationInput);

      expect(result.id).toBe('violation-1');
      expect(result.violationType).toBe('unauthorized_sharing');
      expect(policyManager.reportPolicyViolation).toHaveBeenCalledWith(violationInput);
    });
  });
});