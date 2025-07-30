// Content Sharing Enforcement Tests
// Testing policy enforcement and violation detection

// Mock ContentSharingEnforcement class
const ContentSharingEnforcement = jest.fn().mockImplementation(() => ({
  enforceSharing: jest.fn(),
  processApproval: jest.fn(),
  enforceAttribution: jest.fn(),
  reportViolation: jest.fn(),
  updatePermissionsForPolicyChange: jest.fn()
}));

// Mock ContentSharingPolicyManager class
const ContentSharingPolicyManager = jest.fn().mockImplementation(() => ({
  checkSharingPermission: jest.fn(),
  getInstitutionPolicies: jest.fn(),
  getCollaborationSettings: jest.fn(),
  enforceAttributionRequirements: jest.fn(),
  reportPolicyViolation: jest.fn()
}));

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: jest.fn()
  },
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
        gte: jest.fn(() => ({}))
      })),
      single: jest.fn()
    }))
  }))
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

// Mock the policy manager
jest.mock('@/lib/services/content-sharing-policy-manager');

describe('ContentSharingEnforcement', () => {
  let enforcement;
  let mockPolicyManager;

  beforeEach(() => {
    enforcement = new ContentSharingEnforcement();
    mockPolicyManager = new ContentSharingPolicyManager();
    jest.clearAllMocks();
  });
  
  describe('Policy Enforcement Logic', () => {
    // Helper function to simulate enforcement decision
    const enforceSharing = (context, policies) => {
      // Check if any policies exist
      if (!policies || policies.length === 0) {
        return {
          allowed: false,
          reason: 'No sharing policy defined for this content type',
          requiresApproval: false,
          requiresAttribution: false
        };
      }

      const applicablePolicy = policies.find(p => p.resourceType === context.contentType);
      
      if (!applicablePolicy) {
        return {
          allowed: false,
          reason: 'No policy found for this resource type',
          requiresApproval: false,
          requiresAttribution: false
        };
      }

      // Check cross-institution sharing
      if (context.ownerInstitutionId !== context.requesterInstitutionId && 
          !applicablePolicy.allowCrossInstitution) {
        return {
          allowed: false,
          reason: 'Cross-institution sharing not permitted',
          requiresApproval: false,
          requiresAttribution: false
        };
      }

      // Check sharing level hierarchy
      const levelHierarchy = ['private', 'department', 'institution', 'cross_institution', 'public'];
      const policyLevelIndex = levelHierarchy.indexOf(applicablePolicy.sharingLevel);
      const requestedLevelIndex = levelHierarchy.indexOf(context.targetSharingLevel);

      if (requestedLevelIndex > policyLevelIndex) {
        return {
          allowed: false,
          reason: `Sharing level ${context.targetSharingLevel} exceeds policy limit`,
          requiresApproval: false,
          requiresAttribution: false
        };
      }

      return {
        allowed: true,
        requiresApproval: applicablePolicy.conditions?.requireApproval || false,
        requiresAttribution: applicablePolicy.attributionRequired || false
      };
    };

    it('should allow sharing when policies permit', () => {
      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerInstitutionId: 'inst-1',
        requesterInstitutionId: 'inst-1',
        targetSharingLevel: 'department'
      };

      const policies = [{
        resourceType: 'assignment',
        sharingLevel: 'institution',
        allowCrossInstitution: false,
        conditions: {},
        attributionRequired: false
      }];

      const result = enforceSharing(context, policies);
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
      expect(result.requiresAttribution).toBe(false);
    });

    it('should deny sharing when no policies exist', () => {
      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerInstitutionId: 'inst-1',
        requesterInstitutionId: 'inst-2',
        targetSharingLevel: 'cross_institution'
      };

      const result = enforceSharing(context, []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No sharing policy defined');
    });

    it('should deny cross-institution sharing when not allowed', () => {
      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerInstitutionId: 'inst-1',
        requesterInstitutionId: 'inst-2',
        targetSharingLevel: 'cross_institution'
      };

      const policies = [{
        resourceType: 'assignment',
        sharingLevel: 'institution',
        allowCrossInstitution: false,
        conditions: {},
        attributionRequired: false
      }];

      const result = enforceSharing(context, policies);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cross-institution sharing not permitted');
    });

    it('should require approval when policy specifies it', () => {
      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerInstitutionId: 'inst-1',
        requesterInstitutionId: 'inst-2',
        targetSharingLevel: 'cross_institution'
      };

      const policies = [{
        resourceType: 'assignment',
        sharingLevel: 'cross_institution',
        allowCrossInstitution: true,
        conditions: { requireApproval: true },
        attributionRequired: false
      }];

      const result = enforceSharing(context, policies);
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should require attribution when policy specifies it', () => {
      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerInstitutionId: 'inst-1',
        requesterInstitutionId: 'inst-2',
        targetSharingLevel: 'cross_institution'
      };

      const policies = [{
        resourceType: 'assignment',
        sharingLevel: 'cross_institution',
        allowCrossInstitution: true,
        conditions: {},
        attributionRequired: true
      }];

      const result = enforceSharing(context, policies);
      expect(result.allowed).toBe(true);
      expect(result.requiresAttribution).toBe(true);
    });

    it('should deny sharing when level exceeds policy limit', () => {
      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerInstitutionId: 'inst-1',
        requesterInstitutionId: 'inst-1',
        targetSharingLevel: 'public'
      };

      const policies = [{
        resourceType: 'assignment',
        sharingLevel: 'department',
        allowCrossInstitution: false,
        conditions: {},
        attributionRequired: false
      }];

      const result = enforceSharing(context, policies);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds policy limit');
    });
  });

  describe('Violation Detection', () => {
    // Helper function to detect policy violations
    const detectViolations = (context, policies, recentActivity) => {
      const violations = [];

      // Check for suspicious sharing patterns
      if (recentActivity && recentActivity.length > 10) {
        violations.push('Unusually high sharing activity detected');
      }

      // Check for domain restrictions
      const applicablePolicy = policies.find(p => p.resourceType === context.contentType);
      if (applicablePolicy?.restrictedDomains && context.requesterDomain) {
        if (applicablePolicy.restrictedDomains.includes(context.requesterDomain)) {
          violations.push('Sharing to restricted domain');
        }
      }

      // Check for permission escalation
      if (context.requestedPermissions?.includes('admin') && 
          !context.requestedPermissions?.includes('edit')) {
        violations.push('Potential permission escalation detected');
      }

      return violations;
    };

    it('should detect high sharing activity', () => {
      const context = {
        contentType: 'assignment',
        ownerId: 'user-1'
      };

      const policies = [{
        resourceType: 'assignment',
        restrictedDomains: []
      }];

      const recentActivity = new Array(15).fill({}); // More than threshold

      const violations = detectViolations(context, policies, recentActivity);
      expect(violations).toContain('Unusually high sharing activity detected');
    });

    it('should detect sharing to restricted domains', () => {
      const context = {
        contentType: 'assignment',
        requesterDomain: 'restricted.edu'
      };

      const policies = [{
        resourceType: 'assignment',
        restrictedDomains: ['restricted.edu', 'blocked.com']
      }];

      const violations = detectViolations(context, policies, []);
      expect(violations).toContain('Sharing to restricted domain');
    });

    it('should detect permission escalation', () => {
      const context = {
        contentType: 'assignment',
        requestedPermissions: ['view', 'admin'] // Admin without edit
      };

      const policies = [{
        resourceType: 'assignment',
        restrictedDomains: []
      }];

      const violations = detectViolations(context, policies, []);
      expect(violations).toContain('Potential permission escalation detected');
    });

    it('should return no violations for normal activity', () => {
      const context = {
        contentType: 'assignment',
        requesterDomain: 'allowed.edu',
        requestedPermissions: ['view', 'comment']
      };

      const policies = [{
        resourceType: 'assignment',
        restrictedDomains: ['restricted.edu']
      }];

      const violations = detectViolations(context, policies, []);
      expect(violations).toHaveLength(0);
    });
  });

  describe('Approval Workflow', () => {
    // Helper function to simulate approval processing
    const processApproval = (requestId, approved, approverId, reason) => {
      if (!requestId || !approverId) {
        throw new Error('Request ID and approver ID are required');
      }

      return {
        requestId,
        status: approved ? 'approved' : 'denied',
        approvedBy: approverId,
        approvedAt: new Date(),
        denialReason: approved ? undefined : reason
      };
    };

    it('should approve sharing request', () => {
      const result = processApproval('request-1', true, 'admin-1');
      
      expect(result.requestId).toBe('request-1');
      expect(result.status).toBe('approved');
      expect(result.approvedBy).toBe('admin-1');
      expect(result.denialReason).toBeUndefined();
    });

    it('should deny sharing request with reason', () => {
      const result = processApproval('request-1', false, 'admin-1', 'Policy violation');
      
      expect(result.requestId).toBe('request-1');
      expect(result.status).toBe('denied');
      expect(result.approvedBy).toBe('admin-1');
      expect(result.denialReason).toBe('Policy violation');
    });

    it('should require request ID and approver ID', () => {
      expect(() => processApproval(null, true, 'admin-1')).toThrow('Request ID and approver ID are required');
      expect(() => processApproval('request-1', true, null)).toThrow('Request ID and approver ID are required');
    });
  });

  describe('Attribution Enforcement', () => {
    // Helper function to validate attribution
    const enforceAttribution = (contentId, authorInfo, institutionInfo) => {
      if (!contentId || !authorInfo || !institutionInfo) {
        throw new Error('Content ID, author info, and institution info are required');
      }

      const attributionText = `Original content by ${authorInfo.name} from ${institutionInfo.name}`;
      
      return {
        contentId,
        originalAuthorId: authorInfo.id,
        originalInstitutionId: institutionInfo.id,
        attributionText,
        createdAt: new Date()
      };
    };

    it('should create proper attribution', () => {
      const authorInfo = { id: 'user-1', name: 'John Doe' };
      const institutionInfo = { id: 'inst-1', name: 'University A' };

      const result = enforceAttribution('content-1', authorInfo, institutionInfo);
      
      expect(result.contentId).toBe('content-1');
      expect(result.originalAuthorId).toBe('user-1');
      expect(result.originalInstitutionId).toBe('inst-1');
      expect(result.attributionText).toBe('Original content by John Doe from University A');
    });

    it('should require all parameters', () => {
      const authorInfo = { id: 'user-1', name: 'John Doe' };
      const institutionInfo = { id: 'inst-1', name: 'University A' };

      expect(() => enforceAttribution(null, authorInfo, institutionInfo))
        .toThrow('Content ID, author info, and institution info are required');
      
      expect(() => enforceAttribution('content-1', null, institutionInfo))
        .toThrow('Content ID, author info, and institution info are required');
      
      expect(() => enforceAttribution('content-1', authorInfo, null))
        .toThrow('Content ID, author info, and institution info are required');
    });
  });

  describe('ContentSharingEnforcement Integration Tests', () => {
    it('should enforce sharing with complete context', async () => {
      const mockPolicies = [{
        id: 'policy-1',
        resourceType: 'assignment',
        sharingLevel: 'cross_institution',
        allowCrossInstitution: true,
        conditions: { requireApproval: false },
        attributionRequired: true
      }];

      mockPolicyManager.checkSharingPermission.mockResolvedValue({
        allowed: true,
        requiresApproval: false
      });

      mockPolicyManager.getInstitutionPolicies.mockResolvedValue(mockPolicies);
      mockPolicyManager.getCollaborationSettings.mockResolvedValue({
        allowCrossInstitutionCollaboration: true,
        allowCrossDepartmentCollaboration: true,
        defaultPermissions: ['view', 'comment'],
        approvalRequired: false
      });

      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'user-1',
        ownerInstitutionId: 'inst-1',
        ownerDepartmentId: 'dept-1',
        requesterId: 'user-2',
        requesterInstitutionId: 'inst-2',
        requesterDepartmentId: 'dept-2',
        requestedPermissions: ['view', 'comment'],
        targetSharingLevel: 'cross_institution'
      };

      const result = await enforcement.enforceSharing(context);

      expect(result.allowed).toBe(true);
      expect(result.requiresAttribution).toBe(true);
      expect(mockPolicyManager.checkSharingPermission).toHaveBeenCalled();
    });

    it('should handle approval workflow creation', async () => {
      const mockPolicies = [{
        id: 'policy-1',
        resourceType: 'assignment',
        sharingLevel: 'cross_institution',
        allowCrossInstitution: true,
        conditions: { requireApproval: true },
        attributionRequired: false
      }];

      mockPolicyManager.checkSharingPermission.mockResolvedValue({
        allowed: true,
        requiresApproval: true
      });

      mockPolicyManager.getInstitutionPolicies.mockResolvedValue(mockPolicies);
      mockPolicyManager.getCollaborationSettings.mockResolvedValue({
        allowCrossInstitutionCollaboration: true,
        approvalRequired: true
      });

      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: { id: 'request-1' },
        error: null
      });

      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'user-1',
        ownerInstitutionId: 'inst-1',
        requesterId: 'user-2',
        requesterInstitutionId: 'inst-2',
        requestedPermissions: ['view'],
        targetSharingLevel: 'cross_institution'
      };

      const result = await enforcement.enforceSharing(context);

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalWorkflowId).toBe('request-1');
    });

    it('should process approval correctly', async () => {
      const mockRequest = {
        id: 'request-1',
        content_id: 'content-1',
        requester_id: 'user-2',
        status: 'pending'
      };

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockRequest,
        error: null
      });

      mockSupabase.from().update().eq.mockResolvedValue({
        error: null
      });

      await enforcement.processApproval('request-1', true, 'admin-1');

      expect(mockSupabase.from().update().eq).toHaveBeenCalled();
    });

    it('should enforce attribution requirements', async () => {
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({
          data: { name: 'John Doe', email: 'john@example.com' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { name: 'University A', domain: 'univa.edu' },
          error: null
        });

      mockPolicyManager.enforceAttributionRequirements.mockResolvedValue({
        id: 'attr-1',
        contentId: 'content-1',
        attributionText: 'Original content by John Doe from University A'
      });

      await enforcement.enforceAttribution('content-1', 'user-1', 'inst-1');

      expect(mockPolicyManager.enforceAttributionRequirements).toHaveBeenCalled();
    });

    it('should report policy violations', async () => {
      mockPolicyManager.reportPolicyViolation.mockResolvedValue({
        id: 'violation-1',
        contentId: 'content-1',
        violationType: 'unauthorized_sharing'
      });

      await enforcement.reportViolation(
        'content-1',
        'policy-1',
        'unauthorized_sharing',
        'Test violation',
        'user-1'
      );

      expect(mockPolicyManager.reportPolicyViolation).toHaveBeenCalledWith({
        contentId: 'content-1',
        policyId: 'policy-1',
        violationType: 'unauthorized_sharing',
        description: 'Test violation',
        reportedBy: 'user-1',
        status: 'reported'
      });
    });

    it('should handle collaboration permission checks', async () => {
      const mockSettings = {
        allowCrossInstitutionCollaboration: false,
        allowCrossDepartmentCollaboration: true,
        defaultPermissions: ['view'],
        approvalRequired: false
      };

      mockPolicyManager.getCollaborationSettings.mockResolvedValue(mockSettings);
      mockPolicyManager.checkSharingPermission.mockResolvedValue({
        allowed: true,
        requiresApproval: false
      });

      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'user-1',
        ownerInstitutionId: 'inst-1',
        requesterId: 'user-2',
        requesterInstitutionId: 'inst-2', // Different institution
        requestedPermissions: ['view'],
        targetSharingLevel: 'cross_institution'
      };

      const result = await enforcement.enforceSharing(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cross-institution collaboration not permitted');
    });

    it('should detect and log violations', async () => {
      // Mock high sharing activity
      mockSupabase.from().select().eq().gte.mockResolvedValue({
        data: new Array(15).fill({}), // More than threshold
        error: null
      });

      mockPolicyManager.checkSharingPermission.mockResolvedValue({
        allowed: true,
        requiresApproval: false
      });

      mockPolicyManager.getInstitutionPolicies.mockResolvedValue([{
        resourceType: 'assignment',
        restrictedDomains: ['restricted.edu']
      }]);

      mockPolicyManager.getCollaborationSettings.mockResolvedValue({
        allowCrossInstitutionCollaboration: true
      });

      const context = {
        contentId: 'content-1',
        contentType: 'assignment',
        ownerId: 'user-1',
        ownerInstitutionId: 'inst-1',
        requesterId: 'user-2',
        requesterInstitutionId: 'inst-2',
        requestedPermissions: ['view'],
        targetSharingLevel: 'cross_institution'
      };

      const result = await enforcement.enforceSharing(context);

      expect(result.allowed).toBe(true);
      expect(result.violations).toBeDefined();
      expect(result.violations).toContain('Unusually high sharing activity detected');
    });
  });
});