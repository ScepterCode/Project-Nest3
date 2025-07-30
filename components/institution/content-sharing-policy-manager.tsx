'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ContentSharingPolicy, 
  CollaborationSettings, 
  ResourceType, 
  SharingLevel,
  CollaborationPermission,
  PolicyConditions 
} from '@/lib/types/content-sharing';

interface ContentSharingPolicyManagerProps {
  institutionId: string;
  departmentId?: string;
  onPolicyChange?: (policies: ContentSharingPolicy[]) => void;
}

export function ContentSharingPolicyManager({ 
  institutionId, 
  departmentId, 
  onPolicyChange 
}: ContentSharingPolicyManagerProps) {
  const [policies, setPolicies] = useState<ContentSharingPolicy[]>([]);
  const [collaborationSettings, setCollaborationSettings] = useState<CollaborationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState<ContentSharingPolicy | null>(null);
  const [showNewPolicyForm, setShowNewPolicyForm] = useState(false);

  const resourceTypes: ResourceType[] = ['assignment', 'class', 'rubric', 'material', 'template', 'assessment'];
  const sharingLevels: SharingLevel[] = ['private', 'department', 'institution', 'cross_institution', 'public'];
  const collaborationPermissions: CollaborationPermission[] = ['view', 'comment', 'edit', 'copy', 'share', 'admin'];

  useEffect(() => {
    loadPolicies();
    loadCollaborationSettings();
  }, [institutionId, departmentId]);

  const loadPolicies = async () => {
    try {
      const response = await fetch(`/api/institutions/${institutionId}/content-policies`);
      if (response.ok) {
        const data = await response.json();
        setPolicies(data);
        onPolicyChange?.(data);
      }
    } catch (error) {
      console.error('Failed to load policies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCollaborationSettings = async () => {
    try {
      const url = departmentId 
        ? `/api/departments/${departmentId}/collaboration-settings`
        : `/api/institutions/${institutionId}/collaboration-settings`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setCollaborationSettings(data);
      }
    } catch (error) {
      console.error('Failed to load collaboration settings:', error);
    }
  };

  const handleSavePolicy = async (policy: Partial<ContentSharingPolicy>) => {
    try {
      const url = policy.id 
        ? `/api/content-policies/${policy.id}`
        : `/api/institutions/${institutionId}/content-policies`;
      
      const method = policy.id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy)
      });

      if (response.ok) {
        await loadPolicies();
        setEditingPolicy(null);
        setShowNewPolicyForm(false);
      }
    } catch (error) {
      console.error('Failed to save policy:', error);
    }
  };

  const handleDeletePolicy = async (policyId: string) => {
    if (!confirm('Are you sure you want to delete this policy?')) return;

    try {
      const response = await fetch(`/api/content-policies/${policyId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadPolicies();
      }
    } catch (error) {
      console.error('Failed to delete policy:', error);
    }
  };

  const handleSaveCollaborationSettings = async (settings: Partial<CollaborationSettings>) => {
    try {
      const url = settings.id 
        ? `/api/collaboration-settings/${settings.id}`
        : departmentId 
          ? `/api/departments/${departmentId}/collaboration-settings`
          : `/api/institutions/${institutionId}/collaboration-settings`;
      
      const method = settings.id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        await loadCollaborationSettings();
      }
    } catch (error) {
      console.error('Failed to save collaboration settings:', error);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Content Sharing & Collaboration</h2>
          <p className="text-muted-foreground">
            Manage how content is shared and collaborated on within and outside your institution
          </p>
        </div>
      </div>

      <Tabs defaultValue="policies" className="space-y-4">
        <TabsList>
          <TabsTrigger value="policies">Sharing Policies</TabsTrigger>
          <TabsTrigger value="collaboration">Collaboration Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Content Sharing Policies</h3>
            <Button onClick={() => setShowNewPolicyForm(true)}>
              Add New Policy
            </Button>
          </div>

          {showNewPolicyForm && (
            <PolicyForm
              onSave={handleSavePolicy}
              onCancel={() => setShowNewPolicyForm(false)}
              resourceTypes={resourceTypes}
              sharingLevels={sharingLevels}
            />
          )}

          <div className="grid gap-4">
            {policies.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                onEdit={setEditingPolicy}
                onDelete={handleDeletePolicy}
                isEditing={editingPolicy?.id === policy.id}
                onSave={handleSavePolicy}
                onCancelEdit={() => setEditingPolicy(null)}
                resourceTypes={resourceTypes}
                sharingLevels={sharingLevels}
              />
            ))}
          </div>

          {policies.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  No content sharing policies configured. Add a policy to control how content is shared.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="collaboration" className="space-y-4">
          <CollaborationSettingsForm
            settings={collaborationSettings}
            onSave={handleSaveCollaborationSettings}
            collaborationPermissions={collaborationPermissions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface PolicyFormProps {
  policy?: ContentSharingPolicy;
  onSave: (policy: Partial<ContentSharingPolicy>) => void;
  onCancel: () => void;
  resourceTypes: ResourceType[];
  sharingLevels: SharingLevel[];
}

function PolicyForm({ policy, onSave, onCancel, resourceTypes, sharingLevels }: PolicyFormProps) {
  const [formData, setFormData] = useState({
    resourceType: policy?.resourceType || 'assignment' as ResourceType,
    sharingLevel: policy?.sharingLevel || 'department' as SharingLevel,
    attributionRequired: policy?.attributionRequired || false,
    allowCrossInstitution: policy?.allowCrossInstitution || false,
    conditions: policy?.conditions || {} as PolicyConditions,
    restrictedDomains: policy?.restrictedDomains?.join(', ') || '',
    allowedDomains: policy?.allowedDomains?.join(', ') || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const policyData: Partial<ContentSharingPolicy> = {
      ...policy,
      resourceType: formData.resourceType,
      sharingLevel: formData.sharingLevel,
      attributionRequired: formData.attributionRequired,
      allowCrossInstitution: formData.allowCrossInstitution,
      conditions: formData.conditions,
      restrictedDomains: formData.restrictedDomains ? formData.restrictedDomains.split(',').map(d => d.trim()) : undefined,
      allowedDomains: formData.allowedDomains ? formData.allowedDomains.split(',').map(d => d.trim()) : undefined
    };

    onSave(policyData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{policy ? 'Edit Policy' : 'New Sharing Policy'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="resourceType">Resource Type</Label>
              <Select
                value={formData.resourceType}
                onValueChange={(value: ResourceType) => setFormData(prev => ({ ...prev, resourceType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resourceTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sharingLevel">Maximum Sharing Level</Label>
              <Select
                value={formData.sharingLevel}
                onValueChange={(value: SharingLevel) => setFormData(prev => ({ ...prev, sharingLevel: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sharingLevels.map(level => (
                    <SelectItem key={level} value={level}>
                      {level.replace('_', ' ').charAt(0).toUpperCase() + level.replace('_', ' ').slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="attributionRequired"
                checked={formData.attributionRequired}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, attributionRequired: checked }))}
              />
              <Label htmlFor="attributionRequired">Require Attribution</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="allowCrossInstitution"
                checked={formData.allowCrossInstitution}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, allowCrossInstitution: checked }))}
              />
              <Label htmlFor="allowCrossInstitution">Allow Cross-Institution Sharing</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="requireApproval"
                checked={formData.conditions.requireApproval || false}
                onCheckedChange={(checked) => setFormData(prev => ({ 
                  ...prev, 
                  conditions: { ...prev.conditions, requireApproval: checked }
                }))}
              />
              <Label htmlFor="requireApproval">Require Approval for Sharing</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="restrictedDomains">Restricted Domains (comma-separated)</Label>
            <Input
              id="restrictedDomains"
              value={formData.restrictedDomains}
              onChange={(e) => setFormData(prev => ({ ...prev, restrictedDomains: e.target.value }))}
              placeholder="example.com, restricted.edu"
            />
          </div>

          <div>
            <Label htmlFor="allowedDomains">Allowed Domains (comma-separated)</Label>
            <Input
              id="allowedDomains"
              value={formData.allowedDomains}
              onChange={(e) => setFormData(prev => ({ ...prev, allowedDomains: e.target.value }))}
              placeholder="partner.edu, trusted.org"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {policy ? 'Update Policy' : 'Create Policy'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface PolicyCardProps {
  policy: ContentSharingPolicy;
  onEdit: (policy: ContentSharingPolicy) => void;
  onDelete: (id: string) => void;
  isEditing: boolean;
  onSave: (policy: Partial<ContentSharingPolicy>) => void;
  onCancelEdit: () => void;
  resourceTypes: ResourceType[];
  sharingLevels: SharingLevel[];
}

function PolicyCard({ 
  policy, 
  onEdit, 
  onDelete, 
  isEditing, 
  onSave, 
  onCancelEdit,
  resourceTypes,
  sharingLevels 
}: PolicyCardProps) {
  if (isEditing) {
    return (
      <PolicyForm
        policy={policy}
        onSave={onSave}
        onCancel={onCancelEdit}
        resourceTypes={resourceTypes}
        sharingLevels={sharingLevels}
      />
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">
                {policy.resourceType.charAt(0).toUpperCase() + policy.resourceType.slice(1)}
              </Badge>
              <Badge variant="outline">
                Max: {policy.sharingLevel.replace('_', ' ')}
              </Badge>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {policy.attributionRequired && (
                <Badge variant="default">Attribution Required</Badge>
              )}
              {policy.allowCrossInstitution && (
                <Badge variant="default">Cross-Institution Allowed</Badge>
              )}
              {policy.conditions.requireApproval && (
                <Badge variant="default">Approval Required</Badge>
              )}
            </div>

            {(policy.restrictedDomains?.length || policy.allowedDomains?.length) && (
              <div className="text-sm text-muted-foreground">
                {policy.restrictedDomains?.length && (
                  <div>Restricted: {policy.restrictedDomains.join(', ')}</div>
                )}
                {policy.allowedDomains?.length && (
                  <div>Allowed: {policy.allowedDomains.join(', ')}</div>
                )}
              </div>
            )}
          </div>

          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(policy)}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(policy.id)}>
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface CollaborationSettingsFormProps {
  settings: CollaborationSettings | null;
  onSave: (settings: Partial<CollaborationSettings>) => void;
  collaborationPermissions: CollaborationPermission[];
}

function CollaborationSettingsForm({ 
  settings, 
  onSave, 
  collaborationPermissions 
}: CollaborationSettingsFormProps) {
  const [formData, setFormData] = useState({
    allowCrossInstitutionCollaboration: settings?.allowCrossInstitutionCollaboration || false,
    allowCrossDepartmentCollaboration: settings?.allowCrossDepartmentCollaboration || false,
    defaultPermissions: settings?.defaultPermissions || ['view'] as CollaborationPermission[],
    approvalRequired: settings?.approvalRequired || false,
    approverRoles: settings?.approverRoles?.join(', ') || '',
    maxCollaborators: settings?.maxCollaborators || '',
    allowExternalCollaborators: settings?.allowExternalCollaborators || false,
    externalDomainWhitelist: settings?.externalDomainWhitelist?.join(', ') || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const settingsData: Partial<CollaborationSettings> = {
      ...settings,
      allowCrossInstitutionCollaboration: formData.allowCrossInstitutionCollaboration,
      allowCrossDepartmentCollaboration: formData.allowCrossDepartmentCollaboration,
      defaultPermissions: formData.defaultPermissions,
      approvalRequired: formData.approvalRequired,
      approverRoles: formData.approverRoles ? formData.approverRoles.split(',').map(r => r.trim()) : [],
      maxCollaborators: formData.maxCollaborators ? parseInt(formData.maxCollaborators) : undefined,
      allowExternalCollaborators: formData.allowExternalCollaborators,
      externalDomainWhitelist: formData.externalDomainWhitelist ? formData.externalDomainWhitelist.split(',').map(d => d.trim()) : undefined
    };

    onSave(settingsData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collaboration Settings</CardTitle>
        <CardDescription>
          Configure how users can collaborate on content within and outside your institution
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="allowCrossInstitution"
                checked={formData.allowCrossInstitutionCollaboration}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, allowCrossInstitutionCollaboration: checked }))}
              />
              <Label htmlFor="allowCrossInstitution">Allow Cross-Institution Collaboration</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="allowCrossDepartment"
                checked={formData.allowCrossDepartmentCollaboration}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, allowCrossDepartmentCollaboration: checked }))}
              />
              <Label htmlFor="allowCrossDepartment">Allow Cross-Department Collaboration</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="approvalRequired"
                checked={formData.approvalRequired}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, approvalRequired: checked }))}
              />
              <Label htmlFor="approvalRequired">Require Approval for Collaboration</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="allowExternal"
                checked={formData.allowExternalCollaborators}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, allowExternalCollaborators: checked }))}
              />
              <Label htmlFor="allowExternal">Allow External Collaborators</Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="approverRoles">Approver Roles (comma-separated)</Label>
              <Input
                id="approverRoles"
                value={formData.approverRoles}
                onChange={(e) => setFormData(prev => ({ ...prev, approverRoles: e.target.value }))}
                placeholder="admin, department_admin"
                disabled={!formData.approvalRequired}
              />
            </div>

            <div>
              <Label htmlFor="maxCollaborators">Max Collaborators (optional)</Label>
              <Input
                id="maxCollaborators"
                type="number"
                value={formData.maxCollaborators}
                onChange={(e) => setFormData(prev => ({ ...prev, maxCollaborators: e.target.value }))}
                placeholder="10"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="externalDomains">External Domain Whitelist (comma-separated)</Label>
            <Input
              id="externalDomains"
              value={formData.externalDomainWhitelist}
              onChange={(e) => setFormData(prev => ({ ...prev, externalDomainWhitelist: e.target.value }))}
              placeholder="partner.edu, collaborator.org"
              disabled={!formData.allowExternalCollaborators}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit">
              Save Collaboration Settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}