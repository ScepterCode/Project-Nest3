import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('InstitutionConfigManager', () => {
  let mockSupabase;

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

    const { createClient } = require('@/lib/supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be able to import the service', async () => {
    const { InstitutionConfigManager } = await import('@/lib/services/institution-config-manager');
    const configManager = new InstitutionConfigManager();
    expect(configManager).toBeDefined();
  });

  it('should get configuration successfully', async () => {
    const { InstitutionConfigManager } = await import('@/lib/services/institution-config-manager');
    const configManager = new InstitutionConfigManager();
    
    const mockData = {
      settings: {
        allowSelfRegistration: false,
        requireEmailVerification: true,
        defaultUserRole: 'student'
      },
      branding: {
        primaryColor: '#1f2937',
        secondaryColor: '#374151',
        accentColor: '#3b82f6'
      }
    };

    mockSupabase.single.mockResolvedValue({
      data: mockData,
      error: null
    });

    const result = await configManager.getConfig('test-institution-id');

    expect(result).toBeDefined();
    expect(result.settings).toBeDefined();
    expect(result.branding).toBeDefined();
    expect(mockSupabase.from).toHaveBeenCalledWith('institutions');
  });

  it('should return null when institution not found', async () => {
    const { InstitutionConfigManager } = await import('@/lib/services/institution-config-manager');
    const configManager = new InstitutionConfigManager();

    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { message: 'Not found' }
    });

    const result = await configManager.getConfig('test-institution-id');

    expect(result).toBeNull();
  });

  it('should validate branding colors', async () => {
    const { InstitutionConfigManager } = await import('@/lib/services/institution-config-manager');
    const configManager = new InstitutionConfigManager();

    // Mock getting current branding
    mockSupabase.single.mockResolvedValue({
      data: { branding: { primaryColor: '#1f2937', secondaryColor: '#374151', accentColor: '#3b82f6' } },
      error: null
    });

    const result = await configManager.updateBranding('test-institution-id', { primaryColor: 'invalid-color' });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors.some(e => e.field === 'branding.primaryColor')).toBe(true);
  });

  it('should update feature flags with subscription validation', async () => {
    const { InstitutionConfigManager } = await import('@/lib/services/institution-config-manager');
    const configManager = new InstitutionConfigManager();

    const mockSubscription = {
      plan: 'free',
      features: []
    };

    mockSupabase.single.mockResolvedValue({
      data: {
        settings: { featureFlags: { enableCustomBranding: false } },
        subscription: mockSubscription
      },
      error: null
    });

    const result = await configManager.updateFeatureFlags('test-institution-id', {
      enableCustomBranding: true
    });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors.some(e => e.code === 'SUBSCRIPTION_REQUIRED')).toBe(true);
  });
});