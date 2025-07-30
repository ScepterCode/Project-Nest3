import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { InstitutionSetupWorkflow } from '@/lib/services/institution-setup-workflow';
import { InstitutionManager } from '@/lib/services/institution-manager';
import { InstitutionApprovalWorkflow } from '@/lib/services/institution-approval-workflow';
import { EmailTemplateService } from '@/lib/services/email-template-service';
import { 
  InstitutionCreationData, 
  InstitutionType,
  Institution,
  InstitutionInvitation
} from '@/lib/types/institution';

// Mock Supabase
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ 
            data: mockInstitutionData, 
            error: null 
          }))
        }))
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ 
            data: mockInstitutionData, 
            error: null 
          })),
          is: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: mockInvitationData, 
              error: null 
            }))
          }))
        })),
        is: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ 
            data: null, 
            error: { message: 'Not found' }
          }))
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null }))
      }))
    }))
  }))
}));

// Mock data
const mockInstitutionData = {
  id: 'inst-123',
  name: 'Test University',
  domain: 'test.edu',
  subdomain: 'portal',
  type: 'university',
  status: 'pending',
  contact_email: 'admin@test.edu',
  contact_phone: '+1-555-0123',
  address: {
    street: '123 University Ave',
    city: 'Test City',
    state: 'CA',
    postalCode: '12345',
    country: 'United States'
  },
  settings: {
    allowSelfRegistration: false,
    requireEmailVerification: true,
    defaultUserRole: 'student'
  },
  branding: {
    primaryColor: '#1f2937',
    secondaryColor: '#374151',
    accentColor: '#3b82f6'
  },
  subscription: {
    plan: 'free',
    userLimit: 100,
    storageLimit: 5,
    features: ['basic_features'],
    billingCycle: 'monthly',
    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'trial'
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_by: 'system-admin-123'
};

const mockInvitationData = {
  id: 'inv-123',
  institution_id: 'inst-123',
  email: 'admin@test.edu',
  role: 'institution_admin',
  invited_by: 'system-admin-123',
  token: 'test-token-123',
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString()
};

const mockAdminData = {
  email: 'admin@test.edu',
  firstName: 'John',
  lastName: 'Doe',
  title: 'IT Director',
  phone: '+1-555-0123'
};

describe('Institution Onboarding End-to-End Tests', () => {
  let institutionSetupWorkflow: InstitutionSetupWorkflow;
  let institutionManager: InstitutionManager;
  let approvalWorkflow: InstitutionApprovalWorkflow;
  let emailTemplateService: EmailTemplateService;

  beforeEach(() => {
    institutionSetupWorkflow = new InstitutionSetupWorkflow();
    institutionManager = new InstitutionManager();
    approvalWorkflow = new InstitutionApprovalWorkflow();
    emailTemplateService = new EmailTemplateService();

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Institution Setup Flow', () => {
    it('should successfully create institution with admin invitation', async () => {
      // Arrange
      const institutionData: InstitutionCreationData = {
        name: 'Test University',
        domain: 'test.edu',
        subdomain: 'portal',
        type: 'university' as InstitutionType,
        contactInfo: {
          email: 'contact@test.edu',
          phone: '+1-555-0123',
          website: 'https://test.edu'
        },
        address: {
          street: '123 University Ave',
          city: 'Test City',
          state: 'CA',
          postalCode: '12345',
          country: 'United States'
        },
        branding: {
          primaryColor: '#1f2937',
          secondaryColor: '#374151',
          accentColor: '#3b82f6'
        },
        settings: {
          allowSelfRegistration: false,
          requireEmailVerification: true,
          defaultUserRole: 'student'
        }
      };

      // Act
      const result = await institutionSetupWorkflow.setupInstitution(
        institutionData,
        mockAdminData,
        'system-admin-123'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.institution).toBeDefined();
      expect(result.adminInvitation).toBeDefined();
      expect(result.institution?.name).toBe('Test University');
      expect(result.institution?.domain).toBe('test.edu');
      expect(result.adminInvitation?.email).toBe('admin@test.edu');
    });

    it('should handle institution creation failure gracefully', async () => {
      // Arrange
      const invalidInstitutionData: InstitutionCreationData = {
        name: '', // Invalid: empty name
        domain: 'invalid-domain', // Invalid: bad domain format
        type: 'university' as InstitutionType,
        contactInfo: {
          email: 'invalid-email' // Invalid: bad email format
        },
        address: {}
      };

      // Act
      const result = await institutionSetupWorkflow.setupInstitution(
        invalidInstitutionData,
        mockAdminData,
        'system-admin-123'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should rollback institution creation if admin invitation fails', async () => {
      // Arrange
      const institutionData: InstitutionCreationData = {
        name: 'Test University',
        domain: 'test.edu',
        type: 'university' as InstitutionType,
        contactInfo: {
          email: 'contact@test.edu'
        },
        address: {}
      };

      const invalidAdminData = {
        email: '', // Invalid: empty email
        firstName: '',
        lastName: ''
      };

      // Act
      const result = await institutionSetupWorkflow.setupInstitution(
        institutionData,
        invalidAdminData,
        'system-admin-123'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.field.includes('email'))).toBe(true);
    });
  });

  describe('Institution Approval Workflow', () => {
    it('should submit institution for approval successfully', async () => {
      // Act
      const result = await approvalWorkflow.submitForApproval(
        'inst-123',
        'creation',
        { institutionData: mockInstitutionData },
        'system-admin-123'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });

    it('should prevent duplicate approval requests', async () => {
      // Arrange - First submission
      await approvalWorkflow.submitForApproval(
        'inst-123',
        'creation',
        { institutionData: mockInstitutionData },
        'system-admin-123'
      );

      // Act - Second submission (should fail)
      const result = await approvalWorkflow.submitForApproval(
        'inst-123',
        'creation',
        { institutionData: mockInstitutionData },
        'system-admin-123'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.code === 'DUPLICATE_REQUEST')).toBe(true);
    });

    it('should perform verification checks correctly', async () => {
      // Act
      const checklist = await approvalWorkflow.performVerificationChecks('inst-123');

      // Assert
      expect(checklist).toBeDefined();
      expect(typeof checklist.domainVerified).toBe('boolean');
      expect(typeof checklist.contactVerified).toBe('boolean');
      expect(typeof checklist.documentsProvided).toBe('boolean');
      expect(typeof checklist.complianceChecked).toBe('boolean');
      expect(typeof checklist.securityReviewed).toBe('boolean');
    });

    it('should approve institution request successfully', async () => {
      // Arrange
      const mockRequest = {
        id: 'req-123',
        institutionId: 'inst-123',
        requestedBy: 'admin-123',
        requestType: 'creation' as const,
        requestData: {},
        status: 'pending' as const,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      };

      jest.spyOn(approvalWorkflow, 'getApprovalRequestById')
        .mockResolvedValue(mockRequest);

      // Act
      const result = await approvalWorkflow.approveRequest(
        'req-123',
        'system-admin-123',
        {
          approved: true,
          notes: 'Institution meets all requirements',
          conditions: []
        }
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject institution request with proper notification', async () => {
      // Arrange
      const mockRequest = {
        id: 'req-123',
        institutionId: 'inst-123',
        requestedBy: 'admin-123',
        requestType: 'creation' as const,
        requestData: {},
        status: 'pending' as const,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      };

      jest.spyOn(approvalWorkflow, 'getApprovalRequestById')
        .mockResolvedValue(mockRequest);

      // Act
      const result = await approvalWorkflow.approveRequest(
        'req-123',
        'system-admin-123',
        {
          approved: false,
          notes: 'Domain verification failed'
        }
      );

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Email Template Generation', () => {
    it('should generate institution welcome email correctly', async () => {
      // Arrange
      const mockInstitution: Institution = {
        id: 'inst-123',
        name: 'Test University',
        domain: 'test.edu',
        type: 'university',
        status: 'active',
        contactInfo: { email: 'contact@test.edu' },
        address: {},
        settings: {
          allowSelfRegistration: false,
          requireEmailVerification: true,
          defaultUserRole: 'student',
          allowCrossInstitutionCollaboration: false,
          contentSharingPolicy: {
            allowCrossInstitution: false,
            allowPublicSharing: false,
            requireAttribution: true,
            defaultSharingLevel: 'private'
          },
          dataRetentionPolicy: {
            retentionPeriodDays: 2555,
            autoDeleteInactive: false,
            backupBeforeDelete: true
          },
          integrations: [],
          customFields: [],
          featureFlags: {
            allowSelfRegistration: false,
            enableAnalytics: true,
            enableIntegrations: false,
            enableCustomBranding: false,
            enableDepartmentHierarchy: true,
            enableContentSharing: false
          }
        },
        branding: {
          primaryColor: '#1f2937',
          secondaryColor: '#374151',
          accentColor: '#3b82f6'
        },
        subscription: {
          plan: 'free',
          userLimit: 100,
          storageLimit: 5,
          features: ['basic_features'],
          billingCycle: 'monthly',
          nextBillingDate: new Date(),
          status: 'trial'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system'
      };

      const mockInvitation: InstitutionInvitation = {
        id: 'inv-123',
        institutionId: 'inst-123',
        email: 'admin@test.edu',
        role: 'institution_admin',
        invitedBy: 'system',
        token: 'test-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      };

      // Act
      const emailData = emailTemplateService.generateInstitutionWelcomeEmail(
        mockInstitution,
        mockInvitation,
        'John Doe',
        'admin@test.edu'
      );

      // Assert
      expect(emailData).toBeDefined();
      expect(emailData?.to).toBe('admin@test.edu');
      expect(emailData?.subject).toContain('Test University');
      expect(emailData?.html).toContain('John Doe');
      expect(emailData?.html).toContain('Test University');
      expect(emailData?.text).toContain('Test University');
    });

    it('should generate admin invitation email correctly', async () => {
      // Arrange
      const mockInstitution: Institution = {
        id: 'inst-123',
        name: 'Test University',
        domain: 'test.edu',
        type: 'university',
        status: 'active',
        contactInfo: { email: 'contact@test.edu' },
        address: {},
        settings: {
          allowSelfRegistration: false,
          requireEmailVerification: true,
          defaultUserRole: 'student',
          allowCrossInstitutionCollaboration: false,
          contentSharingPolicy: {
            allowCrossInstitution: false,
            allowPublicSharing: false,
            requireAttribution: true,
            defaultSharingLevel: 'private'
          },
          dataRetentionPolicy: {
            retentionPeriodDays: 2555,
            autoDeleteInactive: false,
            backupBeforeDelete: true
          },
          integrations: [],
          customFields: [],
          featureFlags: {
            allowSelfRegistration: false,
            enableAnalytics: true,
            enableIntegrations: false,
            enableCustomBranding: false,
            enableDepartmentHierarchy: true,
            enableContentSharing: false
          }
        },
        branding: {
          primaryColor: '#1f2937',
          secondaryColor: '#374151',
          accentColor: '#3b82f6'
        },
        subscription: {
          plan: 'free',
          userLimit: 100,
          storageLimit: 5,
          features: ['basic_features'],
          billingCycle: 'monthly',
          nextBillingDate: new Date(),
          status: 'trial'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system'
      };

      const mockInvitation: InstitutionInvitation = {
        id: 'inv-123',
        institutionId: 'inst-123',
        email: 'admin@test.edu',
        role: 'institution_admin',
        invitedBy: 'system',
        token: 'test-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      };

      // Act
      const emailData = emailTemplateService.generateAdminInvitationEmail(
        mockInstitution,
        mockInvitation,
        'Jane Smith',
        'System Admin'
      );

      // Assert
      expect(emailData).toBeDefined();
      expect(emailData?.to).toBe('admin@test.edu');
      expect(emailData?.subject).toContain('Test University');
      expect(emailData?.html).toContain('Jane Smith');
      expect(emailData?.html).toContain('System Admin');
      expect(emailData?.text).toContain('Test University');
    });

    it('should generate approval notification email correctly', async () => {
      // Arrange
      const mockInstitution: Institution = {
        id: 'inst-123',
        name: 'Test University',
        domain: 'test.edu',
        type: 'university',
        status: 'active',
        contactInfo: { email: 'contact@test.edu' },
        address: {},
        settings: {
          allowSelfRegistration: false,
          requireEmailVerification: true,
          defaultUserRole: 'student',
          allowCrossInstitutionCollaboration: false,
          contentSharingPolicy: {
            allowCrossInstitution: false,
            allowPublicSharing: false,
            requireAttribution: true,
            defaultSharingLevel: 'private'
          },
          dataRetentionPolicy: {
            retentionPeriodDays: 2555,
            autoDeleteInactive: false,
            backupBeforeDelete: true
          },
          integrations: [],
          customFields: [],
          featureFlags: {
            allowSelfRegistration: false,
            enableAnalytics: true,
            enableIntegrations: false,
            enableCustomBranding: false,
            enableDepartmentHierarchy: true,
            enableContentSharing: false
          }
        },
        branding: {
          primaryColor: '#1f2937',
          secondaryColor: '#374151',
          accentColor: '#3b82f6'
        },
        subscription: {
          plan: 'free',
          userLimit: 100,
          storageLimit: 5,
          features: ['basic_features'],
          billingCycle: 'monthly',
          nextBillingDate: new Date(),
          status: 'trial'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system'
      };

      // Act - Approved
      const approvedEmail = emailTemplateService.generateApprovalNotificationEmail(
        mockInstitution,
        'admin@test.edu',
        'John Doe',
        true,
        'All requirements met',
        ['Complete initial setup within 30 days']
      );

      // Assert - Approved
      expect(approvedEmail).toBeDefined();
      expect(approvedEmail?.subject).toContain('Approved');
      expect(approvedEmail?.html).toContain('Approved');
      expect(approvedEmail?.html).toContain('All requirements met');

      // Act - Rejected
      const rejectedEmail = emailTemplateService.generateApprovalNotificationEmail(
        mockInstitution,
        'admin@test.edu',
        'John Doe',
        false,
        'Domain verification failed'
      );

      // Assert - Rejected
      expect(rejectedEmail).toBeDefined();
      expect(rejectedEmail?.subject).toContain('Rejected');
      expect(rejectedEmail?.html).toContain('Rejected');
      expect(rejectedEmail?.html).toContain('Domain verification failed');
    });
  });

  describe('Invitation Acceptance Flow', () => {
    it('should accept valid invitation successfully', async () => {
      // Arrange
      const mockInvitation = {
        id: 'inv-123',
        institutionId: 'inst-123',
        email: 'admin@test.edu',
        role: 'institution_admin',
        invitedBy: 'system',
        token: 'valid-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      };

      jest.spyOn(institutionSetupWorkflow, 'getInvitationByToken')
        .mockResolvedValue(mockInvitation);

      // Act
      const result = await institutionSetupWorkflow.acceptInvitation(
        'valid-token',
        'user-123'
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject expired invitation', async () => {
      // Arrange
      const expiredInvitation = {
        id: 'inv-123',
        institutionId: 'inst-123',
        email: 'admin@test.edu',
        role: 'institution_admin',
        invitedBy: 'system',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
        createdAt: new Date()
      };

      jest.spyOn(institutionSetupWorkflow, 'getInvitationByToken')
        .mockResolvedValue(expiredInvitation);

      // Act
      const result = await institutionSetupWorkflow.acceptInvitation(
        'expired-token',
        'user-123'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.code === 'EXPIRED_TOKEN')).toBe(true);
    });

    it('should reject invalid invitation token', async () => {
      // Arrange
      jest.spyOn(institutionSetupWorkflow, 'getInvitationByToken')
        .mockResolvedValue(null);

      // Act
      const result = await institutionSetupWorkflow.acceptInvitation(
        'invalid-token',
        'user-123'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.code === 'INVALID_TOKEN')).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full onboarding workflow from creation to approval', async () => {
      // Step 1: Create institution
      const institutionData: InstitutionCreationData = {
        name: 'Integration Test University',
        domain: 'integration.edu',
        type: 'university' as InstitutionType,
        contactInfo: {
          email: 'contact@integration.edu'
        },
        address: {}
      };

      const setupResult = await institutionSetupWorkflow.setupInstitution(
        institutionData,
        mockAdminData,
        'system-admin-123'
      );

      expect(setupResult.success).toBe(true);
      expect(setupResult.institution).toBeDefined();

      // Step 2: Submit for approval
      const approvalResult = await approvalWorkflow.submitForApproval(
        setupResult.institution!.id,
        'creation',
        { institutionData },
        'system-admin-123'
      );

      expect(approvalResult.success).toBe(true);
      expect(approvalResult.requestId).toBeDefined();

      // Step 3: Perform verification
      const checklist = await approvalWorkflow.performVerificationChecks(
        setupResult.institution!.id
      );

      expect(checklist).toBeDefined();

      // Step 4: Approve request
      const mockRequest = {
        id: approvalResult.requestId!,
        institutionId: setupResult.institution!.id,
        requestedBy: 'system-admin-123',
        requestType: 'creation' as const,
        requestData: { institutionData },
        status: 'pending' as const,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      };

      jest.spyOn(approvalWorkflow, 'getApprovalRequestById')
        .mockResolvedValue(mockRequest);

      const finalApproval = await approvalWorkflow.approveRequest(
        approvalResult.requestId!,
        'system-admin-123',
        {
          approved: true,
          notes: 'Integration test approval'
        }
      );

      expect(finalApproval.success).toBe(true);
    });

    it('should handle workflow failures gracefully', async () => {
      // Test with invalid data that should fail at various stages
      const invalidData: InstitutionCreationData = {
        name: '',
        domain: 'invalid',
        type: 'university' as InstitutionType,
        contactInfo: {
          email: 'invalid-email'
        },
        address: {}
      };

      const result = await institutionSetupWorkflow.setupInstitution(
        invalidData,
        { email: '', firstName: '', lastName: '' },
        'system-admin-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors', async () => {
      // Mock database error
      jest.spyOn(institutionManager, 'createInstitution')
        .mockRejectedValue(new Error('Database connection failed'));

      const institutionData: InstitutionCreationData = {
        name: 'Test University',
        domain: 'test.edu',
        type: 'university' as InstitutionType,
        contactInfo: { email: 'contact@test.edu' },
        address: {}
      };

      const result = await institutionSetupWorkflow.setupInstitution(
        institutionData,
        mockAdminData,
        'system-admin-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.code === 'INTERNAL_ERROR')).toBe(true);
    });

    it('should handle concurrent approval requests', async () => {
      // Submit first request
      const result1 = await approvalWorkflow.submitForApproval(
        'inst-123',
        'creation',
        { institutionData: mockInstitutionData },
        'admin-1'
      );

      // Submit second request (should fail due to duplicate)
      const result2 = await approvalWorkflow.submitForApproval(
        'inst-123',
        'creation',
        { institutionData: mockInstitutionData },
        'admin-2'
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
      expect(result2.errors?.some(e => e.code === 'DUPLICATE_REQUEST')).toBe(true);
    });

    it('should clean up expired approval requests', async () => {
      // This test would verify the cleanup functionality
      await expect(approvalWorkflow.cleanupExpiredRequests()).resolves.not.toThrow();
    });
  });
});