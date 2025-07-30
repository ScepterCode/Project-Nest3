'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  InstitutionSettings,
  ContentSharingPolicy,
  DataRetentionPolicy,
  CustomField,
  SharingLevel
} from '@/lib/types/institution';

interface InstitutionPolicyConfigProps {
  institutionId: string;
  currentSettings: InstitutionSettings;
  onUpdate: (settings: Partial<InstitutionSettings>) => Promise<{ success: boolean; errors?: any[] }>;
  isLoading?: boolean;
  systemConstraints?: {
    maxRetentionDays?: number;
    minRetentionDays?: number;
    allowedUserRoles?: string[];
    allowedSharingLevels?: SharingLevel[];
  };
}

export function InstitutionPolicyConfig({
  institutionId,
  currentSettings,
  onUpdate,
  isLoading = false,
  systemConstraints = {}
}: InstitutionPolicyConfigProps) {
  const [settings, setSettings] = useState<InstitutionSettings>(currentSettings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setSettings(currentSettings);
    setHasChanges(false);
  }, [currentSettings]);

  const handleSettingChange = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      const keys = path.split('.');
      let current: any = newSettings;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newSettings;
    });
    
    setHasChanges(true);
    
    // Clear error when user makes changes
    if (errors[path]) {
      setErrors(prev => ({ ...prev, [path]: '' }));
    }
  };

  const handleCustomFieldAdd = () => {
    const newField: CustomField = {
      key: '',
      label: '',
      type: 'text',
      required: false
    };
    
    setSettings(prev => ({
      ...prev,
      customFields: [...prev.customFields, newField]
    }));
    setHasChanges(true);
  };

  const handleCustomFieldUpdate = (index: number, field: Partial<CustomField>) => {
    setSettings(prev => ({
      ...prev,
      customFields: prev.customFields.map((f, i) => 
        i === index ? { ...f, ...field } : f
      )
    }));
    setHasChanges(true);
  };

  const handleCustomFieldRemove = (index: number) => {
    setSettings(prev => ({
      ...prev,
      customFields: prev.customFields.filter((_, i) => i !== index)
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setErrors({});
    
    const result = await onUpdate(settings);
    if (result.success) {
      setHasChanges(false);
    } else if (result.errors) {
      const errorMap: Record<string, string> = {};
      result.errors.forEach((error: any) => {
        errorMap[error.field] = error.message;
      });
      setErrors(errorMap);
    }
  };

  const handleReset = () => {
    setSettings(currentSettings);
    setErrors({});
    setHasChanges(false);
  };

  const allowedUserRoles = systemConstraints.allowedUserRoles || ['student', 'teacher', 'admin'];
  const allowedSharingLevels = systemConstraints.allowedSharingLevels || ['private', 'department', 'institution', 'public'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Institution Policies</h2>
          <p className="text-muted-foreground">
            Configure policies and settings for your institution
          </p>
        </div>
        <div className="flex gap-2">
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
            You have unsaved changes. Don't forget to save your configuration.
          </p>
        </div>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="sharing">Content Sharing</TabsTrigger>
          <TabsTrigger value="retention">Data Retention</TabsTrigger>
          <TabsTrigger value="custom">Custom Fields</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Basic institution configuration and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Self Registration</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to register for your institution without invitation
                  </p>
                </div>
                <Switch
                  checked={settings.allowSelfRegistration}
                  onCheckedChange={(checked) => handleSettingChange('allowSelfRegistration', checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Email Verification</Label>
                  <p className="text-sm text-muted-foreground">
                    Require users to verify their email address before accessing the platform
                  </p>
                </div>
                <Switch
                  checked={settings.requireEmailVerification}
                  onCheckedChange={(checked) => handleSettingChange('requireEmailVerification', checked)}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Default User Role</Label>
                <Select
                  value={settings.defaultUserRole}
                  onValueChange={(value) => handleSettingChange('defaultUserRole', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedUserRoles.map(role => (
                      <SelectItem key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Default role assigned to new users
                </p>
                {errors.defaultUserRole && (
                  <p className="text-sm text-red-500">{errors.defaultUserRole}</p>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Cross-Institution Collaboration</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to collaborate with users from other institutions
                  </p>
                </div>
                <Switch
                  checked={settings.allowCrossInstitutionCollaboration}
                  onCheckedChange={(checked) => handleSettingChange('allowCrossInstitutionCollaboration', checked)}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    type="text"
                    value={settings.timezone || ''}
                    onChange={(e) => handleSettingChange('timezone', e.target.value)}
                    placeholder="America/New_York"
                  />
                  <p className="text-sm text-muted-foreground">
                    Institution's default timezone
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Locale</Label>
                  <Input
                    type="text"
                    value={settings.locale || ''}
                    onChange={(e) => handleSettingChange('locale', e.target.value)}
                    placeholder="en-US"
                  />
                  <p className="text-sm text-muted-foreground">
                    Default language and region settings
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Academic Year Start</Label>
                <Input
                  type="text"
                  value={settings.academicYearStart || ''}
                  onChange={(e) => handleSettingChange('academicYearStart', e.target.value)}
                  placeholder="09-01"
                />
                <p className="text-sm text-muted-foreground">
                  Academic year start date (MM-DD format)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management Policies</CardTitle>
              <CardDescription>
                Configure how users are managed within your institution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">User Registration Flow</h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <p>Current configuration:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Self Registration: {settings.allowSelfRegistration ? 'Enabled' : 'Disabled'}</li>
                    <li>Email Verification: {settings.requireEmailVerification ? 'Required' : 'Optional'}</li>
                    <li>Default Role: {settings.defaultUserRole}</li>
                  </ul>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Registration Approval Workflow</h4>
                <p className="text-sm text-muted-foreground">
                  Configure how new user registrations are handled
                </p>
                
                {/* This would be expanded with more detailed user management settings */}
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Advanced user management features will be available in future updates.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sharing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Sharing Policies</CardTitle>
              <CardDescription>
                Configure how content can be shared within and outside your institution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Cross-Institution Sharing</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow content to be shared with other institutions
                  </p>
                </div>
                <Switch
                  checked={settings.contentSharingPolicy.allowCrossInstitution}
                  onCheckedChange={(checked) => 
                    handleSettingChange('contentSharingPolicy.allowCrossInstitution', checked)
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Public Sharing</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow content to be shared publicly outside the platform
                  </p>
                </div>
                <Switch
                  checked={settings.contentSharingPolicy.allowPublicSharing}
                  onCheckedChange={(checked) => 
                    handleSettingChange('contentSharingPolicy.allowPublicSharing', checked)
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Attribution</Label>
                  <p className="text-sm text-muted-foreground">
                    Require attribution when content is shared externally
                  </p>
                </div>
                <Switch
                  checked={settings.contentSharingPolicy.requireAttribution}
                  onCheckedChange={(checked) => 
                    handleSettingChange('contentSharingPolicy.requireAttribution', checked)
                  }
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Default Sharing Level</Label>
                <Select
                  value={settings.contentSharingPolicy.defaultSharingLevel}
                  onValueChange={(value: SharingLevel) => 
                    handleSettingChange('contentSharingPolicy.defaultSharingLevel', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedSharingLevels.map(level => (
                      <SelectItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Default sharing level for new content
                </p>
              </div>

              <div className="space-y-2">
                <Label>Restricted Resource Types</Label>
                <Input
                  type="text"
                  value={settings.contentSharingPolicy.restrictedResourceTypes?.join(', ') || ''}
                  onChange={(e) => 
                    handleSettingChange(
                      'contentSharingPolicy.restrictedResourceTypes', 
                      e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    )
                  }
                  placeholder="assignments, exams, grades"
                />
                <p className="text-sm text-muted-foreground">
                  Resource types that cannot be shared (comma-separated)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Retention Policies</CardTitle>
              <CardDescription>
                Configure how long data is retained and when it's deleted
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Retention Period (Days)</Label>
                <Input
                  type="number"
                  min={systemConstraints.minRetentionDays || 30}
                  max={systemConstraints.maxRetentionDays || 3650}
                  value={settings.dataRetentionPolicy.retentionPeriodDays}
                  onChange={(e) => 
                    handleSettingChange('dataRetentionPolicy.retentionPeriodDays', parseInt(e.target.value))
                  }
                />
                <p className="text-sm text-muted-foreground">
                  How long to retain data before deletion (minimum {systemConstraints.minRetentionDays || 30} days)
                </p>
                {errors['dataRetentionPolicy.retentionPeriodDays'] && (
                  <p className="text-sm text-red-500">
                    {errors['dataRetentionPolicy.retentionPeriodDays']}
                  </p>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-Delete Inactive Data</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically delete data after the retention period expires
                  </p>
                </div>
                <Switch
                  checked={settings.dataRetentionPolicy.autoDeleteInactive}
                  onCheckedChange={(checked) => 
                    handleSettingChange('dataRetentionPolicy.autoDeleteInactive', checked)
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Backup Before Delete</Label>
                  <p className="text-sm text-muted-foreground">
                    Create backups before deleting data
                  </p>
                </div>
                <Switch
                  checked={settings.dataRetentionPolicy.backupBeforeDelete}
                  onCheckedChange={(checked) => 
                    handleSettingChange('dataRetentionPolicy.backupBeforeDelete', checked)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Exempt Resource Types</Label>
                <Input
                  type="text"
                  value={settings.dataRetentionPolicy.exemptResourceTypes?.join(', ') || ''}
                  onChange={(e) => 
                    handleSettingChange(
                      'dataRetentionPolicy.exemptResourceTypes', 
                      e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    )
                  }
                  placeholder="transcripts, certificates, legal_documents"
                />
                <p className="text-sm text-muted-foreground">
                  Resource types exempt from automatic deletion (comma-separated)
                </p>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-medium text-amber-900 mb-2">⚠️ Data Retention Notice</h4>
                <p className="text-sm text-amber-800">
                  Changes to data retention policies may affect compliance requirements. 
                  Consult with your legal team before making changes.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Custom Fields</CardTitle>
              <CardDescription>
                Define custom fields for your institution's specific needs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Add custom fields to collect additional information from users
                </p>
                <Button onClick={handleCustomFieldAdd} variant="outline" size="sm">
                  Add Field
                </Button>
              </div>

              {settings.customFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No custom fields defined</p>
                  <p className="text-sm">Click "Add Field" to create your first custom field</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {settings.customFields.map((field, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="space-y-2">
                            <Label>Field Key</Label>
                            <Input
                              value={field.key}
                              onChange={(e) => handleCustomFieldUpdate(index, { key: e.target.value })}
                              placeholder="field_key"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Field Label</Label>
                            <Input
                              value={field.label}
                              onChange={(e) => handleCustomFieldUpdate(index, { label: e.target.value })}
                              placeholder="Field Label"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Field Type</Label>
                            <Select
                              value={field.type}
                              onValueChange={(value: any) => handleCustomFieldUpdate(index, { type: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="boolean">Boolean</SelectItem>
                                <SelectItem value="select">Select</SelectItem>
                                <SelectItem value="date">Date</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Actions</Label>
                            <div className="flex gap-2">
                              <div className="flex items-center space-x-2">
                                <Switch
                                  checked={field.required || false}
                                  onCheckedChange={(checked) => 
                                    handleCustomFieldUpdate(index, { required: checked })
                                  }
                                />
                                <Label className="text-sm">Required</Label>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCustomFieldRemove(index)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        {field.type === 'select' && (
                          <div className="mt-4 space-y-2">
                            <Label>Options (comma-separated)</Label>
                            <Input
                              value={field.options?.join(', ') || ''}
                              onChange={(e) => 
                                handleCustomFieldUpdate(index, { 
                                  options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                })
                              }
                              placeholder="Option 1, Option 2, Option 3"
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}