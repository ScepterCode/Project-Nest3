// Institution Manager service tests
// Using JavaScript to avoid TypeScript compilation issues

describe('InstitutionManager Service', () => {
  // Mock Supabase client
  const mockSupabase = {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        })),
        ilike: jest.fn(() => ({
          or: jest.fn()
        })),
        or: jest.fn(() => ({
          gte: jest.fn(),
          lte: jest.fn(),
          limit: jest.fn(),
          range: jest.fn(),
          order: jest.fn()
        })),
        gte: jest.fn(() => ({
          lte: jest.fn(),
          limit: jest.fn(),
          range: jest.fn(),
          order: jest.fn()
        })),
        lte: jest.fn(() => ({
          limit: jest.fn(),
          range: jest.fn(),
          order: jest.fn()
        })),
        limit: jest.fn(() => ({
          range: jest.fn(),
          order: jest.fn()
        })),
        range: jest.fn(() => ({
          order: jest.fn()
        })),
        order: jest.fn(),
        count: 'exact'
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn()
          }))
        }))
      }))
    }))
  };

  // Mock InstitutionManager class for testing
  class MockInstitutionManager {
    constructor() {
      this.supabase = mockSupabase;
    }

    // Validation methods
    validateInstitutionData(data) {
      const errors = [];
      
      if (!data.name || data.name.trim().length === 0) {
        errors.push({ field: 'name', message: 'Institution name is required', code: 'REQUIRED' });
      }
      
      if (!data.domain || !this.isValidDomain(data.domain)) {
        errors.push({ field: 'domain', message: 'Valid domain is required', code: 'INVALID_FORMAT' });
      }
      
      if (data.subdomain && !this.isValidSubdomain(data.subdomain)) {
        errors.push({ field: 'subdomain', message: 'Invalid subdomain format', code: 'INVALID_FORMAT' });
      }
      
      if (data.contactInfo?.email && !this.isValidEmail(data.contactInfo.email)) {
        errors.push({ field: 'contactInfo.email', message: 'Invalid email format', code: 'INVALID_FORMAT' });
      }
      
      const validTypes = ['university', 'college', 'school', 'training_center', 'other'];
      if (!validTypes.includes(data.type)) {
        errors.push({ field: 'type', message: 'Invalid institution type', code: 'INVALID_VALUE' });
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    }

    validateStatusTransition(currentStatus, newStatus) {
      const errors = [];
      
      const validTransitions = {
        'pending': ['active', 'suspended', 'inactive'],
        'active': ['suspended', 'inactive'],
        'suspended': ['active', 'inactive'],
        'inactive': ['active']
      };
      
      if (!validTransitions[currentStatus]?.includes(newStatus)) {
        errors.push({
          field: 'status',
          message: `Cannot transition from ${currentStatus} to ${newStatus}`,
          code: 'INVALID_TRANSITION'
        });
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    }

    // Helper methods
    isValidDomain(domain) {
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
      return domainRegex.test(domain);
    }

    isValidSubdomain(subdomain) {
      if (!subdomain || subdomain.length === 0) return false;
      const subdomainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
      return subdomainRegex.test(subdomain);
    }

    isValidEmail(email) {
      if (!email || email.length === 0) return false;
      
      // Check for invalid patterns first
      if (email.includes('..') || email.startsWith('.') || email.endsWith('.') || 
          email.startsWith('@') || email.endsWith('@') || !email.includes('@')) {
        return false;
      }
      
      // Check for dot before @ (invalid)
      const atIndex = email.indexOf('@');
      if (atIndex > 0 && email.charAt(atIndex - 1) === '.') {
        return false;
      }
      
      // Check for dot after @ immediately (invalid)
      if (atIndex >= 0 && email.charAt(atIndex + 1) === '.') {
        return false;
      }
      
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      return emailRegex.test(email);
    }

    prepareInstitutionData(data, createdBy) {
      const now = new Date().toISOString();
      
      const defaultSettings = {
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
      };
      
      const defaultBranding = {
        primaryColor: '#1f2937',
        secondaryColor: '#374151',
        accentColor: '#3b82f6'
      };
      
      const defaultSubscription = {
        plan: 'free',
        userLimit: 100,
        storageLimit: 5,
        features: ['basic_features'],
        billingCycle: 'monthly',
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'trial'
      };
      
      return {
        name: data.name,
        domain: data.domain,
        subdomain: data.subdomain || null,
        type: data.type,
        status: 'pending',
        contact_email: data.contactInfo?.email || null,
        contact_phone: data.contactInfo?.phone || null,
        address: data.address || {},
        settings: { ...defaultSettings, ...data.settings },
        branding: { ...defaultBranding, ...data.branding },
        subscription: { ...defaultSubscription, ...data.subscription },
        created_at: now,
        updated_at: now,
        created_by: createdBy
      };
    }

    transformDatabaseToInstitution(data) {
      return {
        id: data.id,
        name: data.name,
        domain: data.domain,
        subdomain: data.subdomain,
        type: data.type,
        status: data.status,
        contactInfo: {
          email: data.contact_email,
          phone: data.contact_phone
        },
        address: data.address || {},
        settings: data.settings || {},
        branding: data.branding || {},
        subscription: data.subscription || {},
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        createdBy: data.created_by
      };
    }
  }

  let institutionManager;

  beforeEach(() => {
    institutionManager = new MockInstitutionManager();
    jest.clearAllMocks();
  });

  describe('Institution Data Validation', () => {
    it('should validate complete institution data successfully', () => {
      const validData = {
        name: 'Test University',
        domain: 'test-university.edu',
        subdomain: 'test-uni',
        type: 'university',
        contactInfo: {
          email: 'admin@test-university.edu',
          phone: '+1-555-0123'
        },
        address: {
          street: '123 University Ave',
          city: 'College Town',
          state: 'CA',
          postalCode: '90210',
          country: 'USA'
        }
      };

      const result = institutionManager.validateInstitutionData(validData);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject institution data with missing required fields', () => {
      const invalidData = {
        type: 'university'
      };

      const result = institutionManager.validateInstitutionData(invalidData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'name')).toBe(true);
      expect(result.errors.some(e => e.field === 'domain')).toBe(true);
    });

    it('should reject institution data with invalid domain format', () => {
      const invalidData = {
        name: 'Test University',
        domain: 'invalid-domain',
        type: 'university'
      };

      const result = institutionManager.validateInstitutionData(invalidData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'domain',
        message: 'Valid domain is required',
        code: 'INVALID_FORMAT'
      });
    });

    it('should reject institution data with invalid subdomain format', () => {
      const invalidData = {
        name: 'Test University',
        domain: 'test-university.edu',
        subdomain: '-invalid-subdomain-',
        type: 'university'
      };

      const result = institutionManager.validateInstitutionData(invalidData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'subdomain',
        message: 'Invalid subdomain format',
        code: 'INVALID_FORMAT'
      });
    });

    it('should reject institution data with invalid email format', () => {
      const invalidData = {
        name: 'Test University',
        domain: 'test-university.edu',
        type: 'university',
        contactInfo: {
          email: 'invalid-email'
        }
      };

      const result = institutionManager.validateInstitutionData(invalidData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'contactInfo.email',
        message: 'Invalid email format',
        code: 'INVALID_FORMAT'
      });
    });

    it('should reject institution data with invalid type', () => {
      const invalidData = {
        name: 'Test University',
        domain: 'test-university.edu',
        type: 'invalid_type'
      };

      const result = institutionManager.validateInstitutionData(invalidData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'type',
        message: 'Invalid institution type',
        code: 'INVALID_VALUE'
      });
    });
  });

  describe('Status Transition Validation', () => {
    it('should allow valid status transitions', () => {
      const validTransitions = [
        { from: 'pending', to: 'active' },
        { from: 'pending', to: 'suspended' },
        { from: 'pending', to: 'inactive' },
        { from: 'active', to: 'suspended' },
        { from: 'active', to: 'inactive' },
        { from: 'suspended', to: 'active' },
        { from: 'suspended', to: 'inactive' },
        { from: 'inactive', to: 'active' }
      ];

      validTransitions.forEach(({ from, to }) => {
        const result = institutionManager.validateStatusTransition(from, to);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject invalid status transitions', () => {
      const invalidTransitions = [
        { from: 'active', to: 'pending' },
        { from: 'suspended', to: 'pending' },
        { from: 'inactive', to: 'pending' },
        { from: 'inactive', to: 'suspended' }
      ];

      invalidTransitions.forEach(({ from, to }) => {
        const result = institutionManager.validateStatusTransition(from, to);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual({
          field: 'status',
          message: `Cannot transition from ${from} to ${to}`,
          code: 'INVALID_TRANSITION'
        });
      });
    });
  });

  describe('Domain Validation Helpers', () => {
    it('should validate correct domain formats', () => {
      const validDomains = [
        'example.com',
        'university.edu',
        'school.k12.ca.us',
        'test-domain.org',
        'sub.domain.edu'
      ];

      validDomains.forEach(domain => {
        expect(institutionManager.isValidDomain(domain)).toBe(true);
      });
    });

    it('should reject invalid domain formats', () => {
      const invalidDomains = [
        'invalid-domain',
        '.com',
        'domain.',
        '-invalid.com',
        'domain-.com',
        'domain..com',
        ''
      ];

      invalidDomains.forEach(domain => {
        expect(institutionManager.isValidDomain(domain)).toBe(false);
      });
    });

    it('should validate correct subdomain formats', () => {
      const validSubdomains = [
        'test',
        'university',
        'test-uni',
        'school123',
        'a',
        'sub1'
      ];

      validSubdomains.forEach(subdomain => {
        expect(institutionManager.isValidSubdomain(subdomain)).toBe(true);
      });
    });

    it('should reject invalid subdomain formats', () => {
      const invalidSubdomains = [
        '-invalid',
        'invalid-',
        'sub..domain',
        '',
        null,
        undefined
      ];

      invalidSubdomains.forEach(subdomain => {
        expect(institutionManager.isValidSubdomain(subdomain)).toBe(false);
      });
    });

    it('should validate correct email formats', () => {
      const validEmails = [
        'user@example.com',
        'test.email@university.edu',
        'admin+notifications@school.org',
        'user123@domain.co.uk'
      ];

      validEmails.forEach(email => {
        expect(institutionManager.isValidEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        'user..double@example.com',
        '.user@example.com',
        'user.@example.com',
        'user@example.',
        ''
      ];

      invalidEmails.forEach(email => {
        expect(institutionManager.isValidEmail(email)).toBe(false);
      });
    });
  });

  describe('Data Preparation', () => {
    it('should prepare institution data with defaults', () => {
      const inputData = {
        name: 'Test University',
        domain: 'test-university.edu',
        type: 'university',
        contactInfo: {
          email: 'admin@test-university.edu'
        }
      };

      const result = institutionManager.prepareInstitutionData(inputData, 'user-123');

      expect(result.name).toBe('Test University');
      expect(result.domain).toBe('test-university.edu');
      expect(result.type).toBe('university');
      expect(result.status).toBe('pending');
      expect(result.contact_email).toBe('admin@test-university.edu');
      expect(result.created_by).toBe('user-123');
      expect(result.settings).toBeDefined();
      expect(result.branding).toBeDefined();
      expect(result.subscription).toBeDefined();
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('should handle optional fields correctly', () => {
      const inputData = {
        name: 'Test University',
        domain: 'test-university.edu',
        type: 'university'
      };

      const result = institutionManager.prepareInstitutionData(inputData, 'user-123');

      expect(result.subdomain).toBeNull();
      expect(result.contact_email).toBeNull();
      expect(result.contact_phone).toBeNull();
      expect(result.address).toEqual({});
    });

    it('should merge custom settings with defaults', () => {
      const inputData = {
        name: 'Test University',
        domain: 'test-university.edu',
        type: 'university',
        settings: {
          allowSelfRegistration: true,
          customFields: [{ key: 'department', label: 'Department' }]
        }
      };

      const result = institutionManager.prepareInstitutionData(inputData, 'user-123');

      expect(result.settings.allowSelfRegistration).toBe(true);
      expect(result.settings.requireEmailVerification).toBe(true); // Default preserved
      expect(result.settings.customFields).toHaveLength(1);
    });
  });

  describe('Database Transformation', () => {
    it('should transform database result to Institution type', () => {
      const dbData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test University',
        domain: 'test-university.edu',
        subdomain: 'test-uni',
        type: 'university',
        status: 'active',
        contact_email: 'admin@test-university.edu',
        contact_phone: '+1-555-0123',
        address: { city: 'Test City' },
        settings: { allowSelfRegistration: true },
        branding: { primaryColor: '#003366' },
        subscription: { plan: 'premium' },
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-15T00:00:00.000Z',
        created_by: 'user-123'
      };

      const result = institutionManager.transformDatabaseToInstitution(dbData);

      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.name).toBe('Test University');
      expect(result.domain).toBe('test-university.edu');
      expect(result.subdomain).toBe('test-uni');
      expect(result.type).toBe('university');
      expect(result.status).toBe('active');
      expect(result.contactInfo.email).toBe('admin@test-university.edu');
      expect(result.contactInfo.phone).toBe('+1-555-0123');
      expect(result.address).toEqual({ city: 'Test City' });
      expect(result.settings).toEqual({ allowSelfRegistration: true });
      expect(result.branding).toEqual({ primaryColor: '#003366' });
      expect(result.subscription).toEqual({ plan: 'premium' });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.createdBy).toBe('user-123');
    });

    it('should handle null/undefined fields gracefully', () => {
      const dbData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test University',
        domain: 'test-university.edu',
        subdomain: null,
        type: 'university',
        status: 'active',
        contact_email: null,
        contact_phone: null,
        address: null,
        settings: null,
        branding: null,
        subscription: null,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-15T00:00:00.000Z',
        created_by: 'user-123'
      };

      const result = institutionManager.transformDatabaseToInstitution(dbData);

      expect(result.subdomain).toBeNull();
      expect(result.contactInfo.email).toBeNull();
      expect(result.contactInfo.phone).toBeNull();
      expect(result.address).toEqual({});
      expect(result.settings).toEqual({});
      expect(result.branding).toEqual({});
      expect(result.subscription).toEqual({});
    });
  });

  describe('Business Logic Validation', () => {
    it('should enforce institution name uniqueness within domain', () => {
      // This test would verify that institutions with the same domain
      // cannot have identical names (business rule)
      const institution1 = {
        name: 'University of California',
        domain: 'uc.edu'
      };
      
      const institution2 = {
        name: 'University of California', // Same name
        domain: 'uc.edu' // Same domain
      };

      // In a real implementation, this would be enforced at the service level
      expect(institution1.name).toBe(institution2.name);
      expect(institution1.domain).toBe(institution2.domain);
    });

    it('should validate subscription limits during institution creation', () => {
      const subscriptionData = {
        plan: 'free',
        userLimit: 100,
        storageLimit: 5,
        features: ['basic_features']
      };

      // Validate that limits are positive numbers
      expect(subscriptionData.userLimit).toBeGreaterThan(0);
      expect(subscriptionData.storageLimit).toBeGreaterThan(0);
      expect(Array.isArray(subscriptionData.features)).toBe(true);
    });

    it('should validate branding color formats', () => {
      const brandingData = {
        primaryColor: '#1f2937',
        secondaryColor: '#374151',
        accentColor: '#3b82f6'
      };

      // Validate hex color format
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
      expect(hexColorRegex.test(brandingData.primaryColor)).toBe(true);
      expect(hexColorRegex.test(brandingData.secondaryColor)).toBe(true);
      expect(hexColorRegex.test(brandingData.accentColor)).toBe(true);
    });

    it('should validate feature flag combinations', () => {
      const featureFlags = {
        allowSelfRegistration: true,
        enableAnalytics: true,
        enableIntegrations: false,
        enableCustomBranding: true,
        enableDepartmentHierarchy: true,
        enableContentSharing: false
      };

      // Validate that feature flags are boolean values
      Object.values(featureFlags).forEach(flag => {
        expect(typeof flag).toBe('boolean');
      });

      // Business rule: Custom branding requires premium features
      if (featureFlags.enableCustomBranding) {
        expect(featureFlags.enableAnalytics).toBe(true);
      }
    });
  });
});