import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { InstitutionConfigManager } from '@/lib/services/institution-config-manager';
import {
  BrandingConfig,
  InstitutionSettings,
  FeatureFlags,
  ContentSharingPolicy,
  DataRetentionPolicy
} from '@/lib/types/institution';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('InstitutionConfigManager', () => {
  let configManager: InstitutionConfigManager;
  let mockSupabase: any;

  const mockInstitutionId = 'test-institution-id';

  const mockDefaultSettings: InstitutionSettings = {
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

  const mockDefaultBranding: BrandingConfig = {
    primaryColor: '#1f2937',
    secondaryColor: '#374151',
    accentColor: '#3b82f6'
  };

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
      storage: {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn(),
        getPublicUrl: jest.fn(),
        remove: jest.fn()
      }
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    configManager = new InstitutionConfigManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return institution configuration successfully', async () => {
      const mockData = {
        settings: mockDefaultSettings,
        branding: mockDefaultBranding
      };

      mockSupabase.single.mockResolvedValue({
        data: mockData,
        error: null
      });

      const result = await configManager.getConfig(mockInstitutionId);

      expect(result).toEqual({
        settings: mockDefaultSettings,
        branding: mockDefaultBranding,
        featureFlags: mockDefaultSettings.featureFlags
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('institutions');
      expect(mockSupabase.select).toHaveBeenCalledWith('settings, branding');
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', mockInstitutionId);
    });

    it('should return null when institution not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await configManager.getConfig(mockInstitutionId);

      expect(result).toBeNull();
    });

    it('should return default config when data is empty', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { settings: null, branding: null },
        error: null
      });

      const result = await configManager.getConfig(mockInstitutionId);

      expect(result).toBeDefined();
      expect(result?.settings).toEqual(mockDefaultSettings);
      expect(result?.branding).toEqual(mockDefaultBranding);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration successfully', async () => {
      const currentConfig = {
        settings: mockDefaultSettings,
        branding: mockDefaultBranding,
        featureFlags: mockDefaultSettings.featureFlags
      };

      const updateData = {
        settings: {
          ...mockDefaultSettings,
          allowSelfRegistration: true
        }
      };

      // Mock getting current config
      mockSupabase.single.mockResolvedValueOnce({
        data: { settings: mockDefaultSettings, branding: mockDefaultBranding },
        error: null
      });

      // Mock department count check
      mockSupabase.select.mockReturnValueOnce({
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ count: 2 })
      });

      // Mock update
      mockSupabase.update.mockResolvedValue({
        error: null
      });

      const result = await configManager.updateConfig(mockInstitutionId, updateData);

      expect(result.success).toBe(true);
      expect(result.config?.settings.allowSelfRegistration).toBe(true);
    });

    it('should return error when institution not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await configManager.updateConfig(mockInstitutionId, {});

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        { field: 'institutionId', message: 'Institution not found', code: 'NOT_FOUND' }
      ]);
    });

    it('should validate configuration before updating', async () => {
      const currentConfig = {
        settings: mockDefaultSettings,
        branding: mockDefaultBranding,
        featureFlags: mockDefaultSettings.featureFlags
      };

      mockSupabase.single.mockResolvedValue({
        data: { settings: mockDefaultSettings, branding: mockDefaultBranding },
        error: null
      });

      const invalidUpdate = {
        settings: {
          ...mockDefaultSettings,
          defaultUserRole: 'invalid_role' as any
        }
      };

      const result = await configManager.updateConfig(mockInstitutionId, invalidUpdate);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'settings.defaultUserRole',
        message: 'Invalid default user role',
        code: 'INVALID_VALUE'
      });
    });
  });

  describe('getBranding', () => {
    it('should return branding configuration successfully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { branding: mockDefaultBranding },
        error: null
      });

      const result = await configManager.getBranding(mockInstitutionId);

      expect(result).toEqual(mockDefaultBranding);
    });

    it('should return default branding when none exists', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { branding: null },
        error: null
      });

      const result = await configManager.getBranding(mockInstitutionId);

      expect(result).toEqual(mockDefaultBranding);
    });
  });

  describe('updateBranding', () => {
    it('should update branding successfully', async () => {
      const updatedBranding = {
        ...mockDefaultBranding,
        primaryColor: '#ff0000'
      };

      // Mock getting current branding
      mockSupabase.single.mockResolvedValueOnce({
        data: { branding: mockDefaultBranding },
        error: null
      });

      // Mock feature flag check
      mockSupabase.single.mockResolvedValueOnce({
        data: { settings: { featureFlags: { enableCustomBranding: true } } },
        error: null
      });

      // Mock update
      mockSupabase.update.mockResolvedValue({
        error: null
      });

      const result = await configManager.updateBranding(mockInstitutionId, { primaryColor: '#ff0000' });

      expect(result.success).toBe(true);
      expect(result.branding?.primaryColor).toBe('#ff0000');
    });

    it('should validate color formats', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { branding: mockDefaultBranding },
        error: null
      });

      const result = await configManager.updateBranding(mockInstitutionId, { primaryColor: 'invalid-color' });

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'branding.primaryColor',
        message: 'Invalid color format (must be hex)',
        code: 'INVALID_FORMAT'
      });
    });

    it('should check if custom branding is enabled', async () => {
      // Mock getting current branding
      mockSupabase.single.mockResolvedValueOnce({
        data: { branding: mockDefaultBranding },
        error: null
      });

      // Mock feature flag check - custom branding disabled
      mockSupabase.single.mockResolvedValueOnce({
        data: { settings: { featureFlags: { enableCustomBranding: false } } },
        error: null
      });

      const result = await configManager.updateBranding(mockInstitutionId, { primaryColor: '#ff0000' });

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'branding',
        message: 'Feature enableCustomBranding is not enabled for this institution',
        code: 'FEATURE_DISABLED'
      });
    });
  });

  describe('getFeatureFlags', () => {
    it('should return feature flags successfully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { settings: { featureFlags: mockDefaultSettings.featureFlags } },
        error: null
      });

      const result = await configManager.getFeatureFlags(mockInstitutionId);

      expect(result).toEqual(mockDefaultSettings.featureFlags);
    });

    it('should return default feature flags when none exist', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { settings: null },
        error: null
      });

      const result = await configManager.getFeatureFlags(mockInstitutionId);

      expect(result).toEqual(mockDefaultSettings.featureFlags);
    });
  });

  describe('updateFeatureFlags', () => {
    it('should update feature flags successfully', async () => {
      const mockSubscription = {
        plan: 'premium',
        features: ['custom_branding']
      };

      mockSupabase.single.mockResolvedValue({
        data: {
          settings: { featureFlags: mockDefaultSettings.featureFlags },
          subscription: mockSubscription
        },
        error: null
      });

      mockSupabase.update.mockResolvedValue({
        error: null
      });

      const result = await configManager.updateFeatureFlags(mockInstitutionId, {
        enableCustomBranding: true
      });

      expect(result.success).toBe(true);
      expect(result.featureFlags?.enableCustomBranding).toBe(true);
    });

    it('should validate feature flags against subscription', async () => {
      const mockSubscription = {
        plan: 'free',
        features: []
      };

      mockSupabase.single.mockResolvedValue({
        data: {
          settings: { featureFlags: mockDefaultSettings.featureFlags },
          subscription: mockSubscription
        },
        error: null
      });

      const result = await configManager.updateFeatureFlags(mockInstitutionId, {
        enableCustomBranding: true
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'featureFlags.enableCustomBranding',
        message: 'Custom branding requires paid subscription',
        code: 'SUBSCRIPTION_REQUIRED'
      });
    });

    it('should validate numeric limits', async () => {
      const mockSubscription = {
        plan: 'premium',
        features: []
      };

      mockSupabase.single.mockResolvedValue({
        data: {
          settings: { featureFlags: mockDefaultSettings.featureFlags },
          subscription: mockSubscription
        },
        error: null
      });

      const result = await configManager.updateFeatureFlags(mockInstitutionId, {
        maxDepartments: -1
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'featureFlags.maxDepartments',
        message: 'Maximum departments must be at least 1',
        code: 'INVALID_VALUE'
      });
    });
  });

  describe('uploadLogo', () => {
    it('should upload logo successfully', async () => {
      const mockFile = new File(['test'], 'logo.png', { type: 'image/png' });
      const mockLogoUrl = 'https://example.com/logo.png';

      // Mock feature flag check
      mockSupabase.single.mockResolvedValue({
        data: { settings: { featureFlags: { enableCustomBranding: true } } },
        error: null
      });

      // Mock storage upload
      mockSupabase.storage.upload.mockResolvedValue({
        data: { path: 'test-path' },
        error: null
      });

      // Mock getting public URL
      mockSupabase.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: mockLogoUrl }
      });

      // Mock branding update
      mockSupabase.single.mockResolvedValueOnce({
        data: { branding: mockDefaultBranding },
        error: null
      });

      mockSupabase.update.mockResolvedValue({
        error: null
      });

      const result = await configManager.uploadLogo(mockInstitutionId, mockFile);

      expect(result.success).toBe(true);
      expect(result.logoUrl).toBe(mockLogoUrl);
    });

    it('should validate file size', async () => {
      // Create a mock file that's too large (6MB)
      const mockFile = new File(['x'.repeat(6 * 1024 * 1024)], 'logo.png', { type: 'image/png' });

      const result = await configManager.uploadLogo(mockInstitutionId, mockFile);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'logo',
        message: 'Logo file size must be less than 5MB',
        code: 'FILE_TOO_LARGE'
      });
    });

    it('should validate file type', async () => {
      const mockFile = new File(['test'], 'logo.txt', { type: 'text/plain' });

      const result = await configManager.uploadLogo(mockInstitutionId, mockFile);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'logo',
        message: 'Logo must be JPEG, PNG, or SVG format',
        code: 'INVALID_FILE_TYPE'
      });
    });

    it('should check if custom branding is enabled', async () => {
      const mockFile = new File(['test'], 'logo.png', { type: 'image/png' });

      // Mock feature flag check - custom branding disabled
      mockSupabase.single.mockResolvedValue({
        data: { settings: { featureFlags: { enableCustomBranding: false } } },
        error: null
      });

      const result = await configManager.uploadLogo(mockInstitutionId, mockFile);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'logo',
        message: 'Feature enableCustomBranding is not enabled for this institution',
        code: 'FEATURE_DISABLED'
      });
    });
  });

  describe('resetBranding', () => {
    it('should reset branding to default values', async () => {
      // Mock getting current branding
      mockSupabase.single.mockResolvedValueOnce({
        data: { branding: { ...mockDefaultBranding, primaryColor: '#ff0000' } },
        error: null
      });

      // Mock feature flag check
      mockSupabase.single.mockResolvedValueOnce({
        data: { settings: { featureFlags: { enableCustomBranding: true } } },
        error: null
      });

      // Mock update
      mockSupabase.update.mockResolvedValue({
        error: null
      });

      const result = await configManager.resetBranding(mockInstitutionId);

      expect(result.success).toBe(true);
      expect(result.branding).toEqual(mockDefaultBranding);
    });
  });

  describe('validation methods', () => {
    it('should validate settings correctly', async () => {
      const invalidSettings: Partial<InstitutionSettings> = {
        defaultUserRole: 'invalid_role' as any,
        dataRetentionPolicy: {
          retentionPeriodDays: 10, // Too low
          autoDeleteInactive: false,
          backupBeforeDelete: true
        }
      };

      mockSupabase.single.mockResolvedValue({
        data: { settings: mockDefaultSettings, branding: mockDefaultBranding },
        error: null
      });

      const result = await configManager.updateConfig(mockInstitutionId, { settings: invalidSettings });

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'settings.defaultUserRole',
        message: 'Invalid default user role',
        code: 'INVALID_VALUE'
      });
      expect(result.errors).toContainEqual({
        field: 'settings.dataRetentionPolicy.retentionPeriodDays',
        message: 'Retention period must be at least 30 days',
        code: 'INVALID_VALUE'
      });
    });

    it('should validate branding colors', async () => {
      const invalidBranding: Partial<BrandingConfig> = {
        primaryColor: 'not-a-color',
        secondaryColor: '#gggggg',
        accentColor: 'rgb(255,0,0)' // Not hex format
      };

      mockSupabase.single.mockResolvedValue({
        data: { branding: mockDefaultBranding },
        error: null
      });

      const result = await configManager.updateBranding(mockInstitutionId, invalidBranding);

      expect(result.success).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.some(e => e.field === 'branding.primaryColor')).toBe(true);
    });

    it('should validate custom CSS length', async () => {
      const longCSS = 'x'.repeat(10001); // Exceeds 10,000 character limit

      mockSupabase.single.mockResolvedValueOnce({
        data: { branding: mockDefaultBranding },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { settings: { featureFlags: { enableCustomBranding: true } } },
        error: null
      });

      const result = await configManager.updateBranding(mockInstitutionId, { customCSS: longCSS });

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'branding.customCSS',
        message: 'Custom CSS too long (max 10,000 characters)',
        code: 'INVALID_LENGTH'
      });
    });
  });
});