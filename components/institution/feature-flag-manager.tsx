'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FeatureFlags, SubscriptionInfo } from '@/lib/types/institution';

interface FeatureFlagManagerProps {
  institutionId: string;
  currentFlags: FeatureFlags;
  subscription: SubscriptionInfo;
  onUpdate: (flags: Partial<FeatureFlags>) => Promise<{ success: boolean; errors?: any[] }>;
  isLoading?: boolean;
}

interface FeatureDefinition {
  key: keyof FeatureFlags;
  name: string;
  description: string;
  category: 'core' | 'advanced' | 'premium' | 'limits';
  requiredPlan?: string[];
  type: 'boolean' | 'number';
  min?: number;
  max?: number;
  defaultValue: any;
}

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: 'allowSelfRegistration',
    name: 'Self Registration',
    description: 'Allow users to register for your institution without invitation',
    category: 'core',
    type: 'boolean',
    defaultValue: false
  },
  {
    key: 'enableAnalytics',
    name: 'Analytics & Reporting',
    description: 'Enable detailed analytics and reporting features',
    category: 'core',
    type: 'boolean',
    defaultValue: true
  },
  {
    key: 'enableIntegrations',
    name: 'Third-party Integrations',
    description: 'Enable integrations with external systems (SSO, SIS, LMS)',
    category: 'advanced',
    requiredPlan: ['basic', 'premium', 'enterprise'],
    type: 'boolean',
    defaultValue: false
  },
  {
    key: 'enableCustomBranding',
    name: 'Custom Branding',
    description: 'Customize your institution\'s visual identity and branding',
    category: 'premium',
    requiredPlan: ['premium', 'enterprise'],
    type: 'boolean',
    defaultValue: false
  },
  {
    key: 'enableDepartmentHierarchy',
    name: 'Department Hierarchy',
    description: 'Enable hierarchical department structure with parent-child relationships',
    category: 'advanced',
    requiredPlan: ['basic', 'premium', 'enterprise'],
    type: 'boolean',
    defaultValue: true
  },
  {
    key: 'enableContentSharing',
    name: 'Content Sharing',
    description: 'Enable sharing of content between departments and institutions',
    category: 'advanced',
    requiredPlan: ['basic', 'premium', 'enterprise'],
    type: 'boolean',
    defaultValue: false
  },
  {
    key: 'maxDepartments',
    name: 'Maximum Departments',
    description: 'Maximum number of departments allowed in your institution',
    category: 'limits',
    type: 'number',
    min: 1,
    max: 1000,
    defaultValue: undefined
  },
  {
    key: 'maxUsersPerDepartment',
    name: 'Maximum Users per Department',
    description: 'Maximum number of users allowed per department',
    category: 'limits',
    type: 'number',
    min: 1,
    max: 10000,
    defaultValue: undefined
  }
];

export function FeatureFlagManager({
  institutionId,
  currentFlags,
  subscription,
  onUpdate,
  isLoading = false
}: FeatureFlagManagerProps) {
  const [flags, setFlags] = useState<FeatureFlags>(currentFlags);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setFlags(currentFlags);
    setHasChanges(false);
  }, [currentFlags]);

  const handleFlagChange = (key: keyof FeatureFlags, value: any) => {
    setFlags(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    
    // Clear error when user makes changes
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  const handleSave = async () => {
    setErrors({});
    
    const result = await onUpdate(flags);
    if (result.success) {
      setHasChanges(false);
    } else if (result.errors) {
      const errorMap: Record<string, string> = {};
      result.errors.forEach((error: any) => {
        errorMap[error.field.replace('featureFlags.', '')] = error.message;
      });
      setErrors(errorMap);
    }
  };

  const handleReset = () => {
    setFlags(currentFlags);
    setErrors({});
    setHasChanges(false);
  };

  const isFeatureAvailable = (feature: FeatureDefinition): boolean => {
    if (!feature.requiredPlan) return true;
    return feature.requiredPlan.includes(subscription.plan);
  };

  const getSubscriptionLimits = (feature: FeatureDefinition) => {
    if (feature.key === 'maxDepartments') {
      switch (subscription.plan) {
        case 'free': return { max: 3 };
        case 'basic': return { max: 10 };
        case 'premium': return { max: 50 };
        case 'enterprise': return { max: 1000 };
        default: return { max: 3 };
      }
    }
    
    if (feature.key === 'maxUsersPerDepartment') {
      switch (subscription.plan) {
        case 'free': return { max: 50 };
        case 'basic': return { max: 200 };
        case 'premium': return { max: 1000 };
        case 'enterprise': return { max: 10000 };
        default: return { max: 50 };
      }
    }
    
    return {};
  };

  const groupedFeatures = FEATURE_DEFINITIONS.reduce((acc, feature) => {
    if (!acc[feature.category]) {
      acc[feature.category] = [];
    }
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<string, FeatureDefinition[]>);

  const categoryTitles = {
    core: 'Core Features',
    advanced: 'Advanced Features',
    premium: 'Premium Features',
    limits: 'Usage Limits'
  };

  const categoryDescriptions = {
    core: 'Essential features available to all institutions',
    advanced: 'Advanced features for enhanced functionality',
    premium: 'Premium features for comprehensive customization',
    limits: 'Configure usage limits and quotas'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Feature Management</h2>
          <p className="text-muted-foreground">
            Configure available features for your institution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan
          </Badge>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isLoading || !hasChanges}
          >
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !hasChanges}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            You have unsaved changes. Don't forget to save your feature configuration.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(groupedFeatures).map(([category, features]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle>{categoryTitles[category as keyof typeof categoryTitles]}</CardTitle>
              <CardDescription>
                {categoryDescriptions[category as keyof typeof categoryDescriptions]}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {features.map((feature, index) => {
                const isAvailable = isFeatureAvailable(feature);
                const subscriptionLimits = getSubscriptionLimits(feature);
                const currentValue = flags[feature.key];
                
                return (
                  <div key={feature.key}>
                    {index > 0 && <Separator className="my-4" />}
                    
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <Label className="font-medium">{feature.name}</Label>
                            {!isAvailable && (
                              <Badge variant="secondary" className="text-xs">
                                {feature.requiredPlan?.[0]?.toUpperCase()}+ Required
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {feature.description}
                          </p>
                          {errors[feature.key] && (
                            <p className="text-sm text-red-500">{errors[feature.key]}</p>
                          )}
                        </div>
                        
                        <div className="ml-4">
                          {feature.type === 'boolean' ? (
                            <Switch
                              checked={currentValue || false}
                              onCheckedChange={(checked) => handleFlagChange(feature.key, checked)}
                              disabled={!isAvailable}
                            />
                          ) : (
                            <div className="w-32">
                              <Input
                                type="number"
                                min={Math.max(feature.min || 0, subscriptionLimits.min || 0)}
                                max={Math.min(feature.max || Infinity, subscriptionLimits.max || Infinity)}
                                value={currentValue || ''}
                                onChange={(e) => {
                                  const value = e.target.value ? parseInt(e.target.value) : undefined;
                                  handleFlagChange(feature.key, value);
                                }}
                                placeholder="No limit"
                                disabled={!isAvailable}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {feature.type === 'number' && subscriptionLimits.max && (
                        <div className="text-xs text-muted-foreground">
                          Your {subscription.plan} plan allows up to {subscriptionLimits.max} {feature.name.toLowerCase()}
                        </div>
                      )}
                      
                      {!isAvailable && (
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                          <p className="text-sm text-gray-600">
                            This feature requires a {feature.requiredPlan?.[0]} plan or higher.
                            <Button variant="link" className="p-0 h-auto ml-1 text-sm">
                              Upgrade your plan
                            </Button>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Usage</CardTitle>
          <CardDescription>
            Monitor your current usage against configured limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Departments</span>
                <span>
                  {subscription.usage?.users || 0}
                  {flags.maxDepartments && ` / ${flags.maxDepartments}`}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: flags.maxDepartments
                      ? `${Math.min(((subscription.usage?.users || 0) / flags.maxDepartments) * 100, 100)}%`
                      : '0%'
                  }}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Storage</span>
                <span>
                  {subscription.usage?.storage || 0} GB / {subscription.storageLimit} GB
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min(((subscription.usage?.storage || 0) / subscription.storageLimit) * 100, 100)}%`
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}