'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Building2, 
  Users, 
  Settings, 
  Palette, 
  Shield, 
  BarChart3,
  Bell,
  CreditCard,
  Database,
  Globe,
  Mail,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';
import { Institution, Department, BrandingConfig, InstitutionSettings } from '@/lib/types/institution';
import { InstitutionAnalyticsDashboard } from './institution-analytics-dashboard';
import { InstitutionUserManager } from './institution-user-manager';

interface InstitutionAdminInterfaceProps {
  institutionId: string;
  currentUserRole: string;
}

interface InstitutionOverview {
  institution: Institution;
  departments: Department[];
  userCount: number;
  classCount: number;
  enrollmentCount: number;
  subscription: {
    plan: string;
    usage: {
      users: number;
      storage: number;
    };
    limits: {
      users: number;
      storage: number;
    };
  };
}

export function InstitutionAdminInterface({ institutionId, currentUserRole }: InstitutionAdminInterfaceProps) {
  const [overview, setOverview] = useState<InstitutionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Form states
  const [institutionForm, setInstitutionForm] = useState<Partial<Institution>>({});
  const [settingsForm, setSettingsForm] = useState<Partial<InstitutionSettings>>({});
  const [brandingForm, setBrandingForm] = useState<Partial<BrandingConfig>>({});
  const [newDepartmentForm, setNewDepartmentForm] = useState({
    name: '',
    description: '',
    code: '',
    adminId: ''
  });

  const [showNewDepartmentDialog, setShowNewDepartmentDialog] = useState(false);

  useEffect(() => {
    fetchInstitutionData();
  }, [institutionId]);

  const fetchInstitutionData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/institutions/${institutionId}/admin-overview`);
      const data = await response.json();

      if (data.success) {
        setOverview(data.data);
        setInstitutionForm(data.data.institution);
        setSettingsForm(data.data.institution.settings);
        setBrandingForm(data.data.institution.branding);
      }
    } catch (error) {
      console.error('Error fetching institution data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInstitution = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/institutions/${institutionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: institutionForm.name,
          contactInfo: institutionForm.contactInfo,
          address: institutionForm.address
        })
      });

      if (response.ok) {
        alert('Institution details updated successfully!');
        await fetchInstitutionData();
      } else {
        alert('Failed to update institution details');
      }
    } catch (error) {
      console.error('Error updating institution:', error);
      alert('Error updating institution details');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/institutions/${institutionId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsForm })
      });

      if (response.ok) {
        alert('Settings updated successfully!');
        await fetchInstitutionData();
      } else {
        alert('Failed to update settings');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Error updating settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranding = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/institutions/${institutionId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandingForm)
      });

      if (response.ok) {
        alert('Branding updated successfully!');
        await fetchInstitutionData();
      } else {
        alert('Failed to update branding');
      }
    } catch (error) {
      console.error('Error updating branding:', error);
      alert('Error updating branding');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDepartment = async () => {
    try {
      const response = await fetch(`/api/institutions/${institutionId}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDepartmentForm)
      });

      if (response.ok) {
        setShowNewDepartmentDialog(false);
        setNewDepartmentForm({ name: '', description: '', code: '', adminId: '' });
        await fetchInstitutionData();
        alert('Department created successfully!');
      } else {
        alert('Failed to create department');
      }
    } catch (error) {
      console.error('Error creating department:', error);
      alert('Error creating department');
    }
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    if (!confirm('Are you sure you want to delete this department? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/departments/${departmentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchInstitutionData();
        alert('Department deleted successfully!');
      } else {
        alert('Failed to delete department');
      }
    } catch (error) {
      console.error('Error deleting department:', error);
      alert('Error deleting department');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading institution dashboard...</span>
      </div>
    );
  }

  if (!overview) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load institution data. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{overview.institution.name}</h1>
          <p className="text-muted-foreground">Institution Administration Dashboard</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={overview.institution.status === 'active' ? 'default' : 'secondary'}>
            {overview.institution.status}
          </Badge>
          <Button variant="outline" onClick={fetchInstitutionData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.userCount}</div>
            <Progress 
              value={(overview.subscription.usage.users / overview.subscription.limits.users) * 100} 
              className="mt-2" 
            />
            <p className="text-xs text-muted-foreground mt-1">
              {overview.subscription.usage.users} / {overview.subscription.limits.users} limit
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Departments</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.departments.length}</div>
            <p className="text-xs text-muted-foreground">
              Active departments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Classes</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.classCount}</div>
            <p className="text-xs text-muted-foreground">
              {overview.enrollmentCount} total enrollments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(overview.subscription.usage.storage / 1024).toFixed(1)}GB
            </div>
            <Progress 
              value={(overview.subscription.usage.storage / overview.subscription.limits.storage) * 100} 
              className="mt-2" 
            />
            <p className="text-xs text-muted-foreground mt-1">
              {overview.subscription.limits.storage / 1024}GB limit
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Institution Details</CardTitle>
              <CardDescription>Basic information about your institution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="institution-name">Institution Name</Label>
                  <Input
                    id="institution-name"
                    value={institutionForm.name || ''}
                    onChange={(e) => setInstitutionForm({ ...institutionForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="institution-domain">Domain</Label>
                  <Input
                    id="institution-domain"
                    value={institutionForm.domain || ''}
                    disabled
                  />
                </div>
                <div>
                  <Label htmlFor="institution-type">Type</Label>
                  <Input
                    id="institution-type"
                    value={institutionForm.type || ''}
                    disabled
                  />
                </div>
                <div>
                  <Label htmlFor="contact-email">Contact Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={institutionForm.contactInfo?.email || ''}
                    onChange={(e) => setInstitutionForm({
                      ...institutionForm,
                      contactInfo: { ...institutionForm.contactInfo, email: e.target.value }
                    })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="institution-description">Description</Label>
                <Textarea
                  id="institution-description"
                  value={institutionForm.address?.street || ''}
                  onChange={(e) => setInstitutionForm({
                    ...institutionForm,
                    address: { ...institutionForm.address, street: e.target.value }
                  })}
                  placeholder="Brief description of your institution..."
                />
              </div>
              <Button onClick={handleSaveInstitution} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Institution Settings</CardTitle>
              <CardDescription>Configure policies and features for your institution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Allow Self Registration</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow users to register directly with your institution
                    </p>
                  </div>
                  <Switch
                    checked={settingsForm.allowSelfRegistration || false}
                    onCheckedChange={(checked) => 
                      setSettingsForm({ ...settingsForm, allowSelfRegistration: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Email Verification</Label>
                    <p className="text-sm text-muted-foreground">
                      Require users to verify their email before accessing the platform
                    </p>
                  </div>
                  <Switch
                    checked={settingsForm.requireEmailVerification || false}
                    onCheckedChange={(checked) => 
                      setSettingsForm({ ...settingsForm, requireEmailVerification: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Allow Cross-Institution Collaboration</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow users to collaborate with other institutions
                    </p>
                  </div>
                  <Switch
                    checked={settingsForm.allowCrossInstitutionCollaboration || false}
                    onCheckedChange={(checked) => 
                      setSettingsForm({ ...settingsForm, allowCrossInstitutionCollaboration: checked })
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="default-role">Default User Role</Label>
                <Select 
                  value={settingsForm.defaultUserRole || 'student'} 
                  onValueChange={(value) => setSettingsForm({ ...settingsForm, defaultUserRole: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Branding & Customization</CardTitle>
              <CardDescription>Customize the look and feel of your institution's interface</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="primary-color">Primary Color</Label>
                  <Input
                    id="primary-color"
                    type="color"
                    value={brandingForm.primaryColor || '#000000'}
                    onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="secondary-color">Secondary Color</Label>
                  <Input
                    id="secondary-color"
                    type="color"
                    value={brandingForm.secondaryColor || '#666666'}
                    onChange={(e) => setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="accent-color">Accent Color</Label>
                  <Input
                    id="accent-color"
                    type="color"
                    value={brandingForm.accentColor || '#0066cc'}
                    onChange={(e) => setBrandingForm({ ...brandingForm, accentColor: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="welcome-message">Welcome Message</Label>
                <Textarea
                  id="welcome-message"
                  value={brandingForm.welcomeMessage || ''}
                  onChange={(e) => setBrandingForm({ ...brandingForm, welcomeMessage: e.target.value })}
                  placeholder="Welcome message for new users..."
                />
              </div>

              <div>
                <Label htmlFor="footer-text">Footer Text</Label>
                <Input
                  id="footer-text"
                  value={brandingForm.footerText || ''}
                  onChange={(e) => setBrandingForm({ ...brandingForm, footerText: e.target.value })}
                  placeholder="Custom footer text..."
                />
              </div>

              <Button onClick={handleSaveBranding} disabled={saving}>
                <Palette className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Branding'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Departments ({overview.departments.length})</span>
                <Button onClick={() => setShowNewDepartmentDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Department
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {overview.departments.map((department) => (
                  <div key={department.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{department.name}</h4>
                        <p className="text-sm text-muted-foreground">{department.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">{department.code}</Badge>
                          <Badge variant={department.status === 'active' ? 'default' : 'secondary'}>
                            {department.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteDepartment(department.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* New Department Dialog */}
          {showNewDepartmentDialog && (
            <Card>
              <CardHeader>
                <CardTitle>Create New Department</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dept-name">Department Name</Label>
                    <Input
                      id="dept-name"
                      value={newDepartmentForm.name}
                      onChange={(e) => setNewDepartmentForm({ ...newDepartmentForm, name: e.target.value })}
                      placeholder="e.g., Computer Science"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dept-code">Department Code</Label>
                    <Input
                      id="dept-code"
                      value={newDepartmentForm.code}
                      onChange={(e) => setNewDepartmentForm({ ...newDepartmentForm, code: e.target.value })}
                      placeholder="e.g., CS"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="dept-description">Description</Label>
                  <Textarea
                    id="dept-description"
                    value={newDepartmentForm.description}
                    onChange={(e) => setNewDepartmentForm({ ...newDepartmentForm, description: e.target.value })}
                    placeholder="Brief description of the department..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateDepartment}>
                    Create Department
                  </Button>
                  <Button variant="outline" onClick={() => setShowNewDepartmentDialog(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <InstitutionUserManager 
            institutionId={institutionId} 
            currentUserRole={currentUserRole}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <InstitutionAnalyticsDashboard institutionId={institutionId} />
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Subscription & Billing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium">Current Plan</h4>
                  <Badge variant="default" className="text-lg px-4 py-2 mt-2">
                    {overview.subscription.plan.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-medium">Usage Overview</h4>
                  <div className="space-y-2 mt-2">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Users</span>
                        <span>{overview.subscription.usage.users} / {overview.subscription.limits.users}</span>
                      </div>
                      <Progress value={(overview.subscription.usage.users / overview.subscription.limits.users) * 100} />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Storage</span>
                        <span>{(overview.subscription.usage.storage / 1024).toFixed(1)}GB / {overview.subscription.limits.storage / 1024}GB</span>
                      </div>
                      <Progress value={(overview.subscription.usage.storage / overview.subscription.limits.storage) * 100} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button>Upgrade Plan</Button>
                <Button variant="outline">View Billing History</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}