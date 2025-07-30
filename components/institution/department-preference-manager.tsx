'use client';

import React, { useState, useEffect } from 'react';
import { UserRole } from '@/lib/types/onboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { AlertCircle, Settings, Save, RotateCcw, Eye, EyeOff, Info, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DepartmentSettings {
  defaultClassSettings: {
    defaultCapacity: number;
    allowWaitlist: boolean;
    requireApproval: boolean;
    allowSelfEnrollment: boolean;
    gradingScale: 'letter' | 'percentage' | 'points';
    passingGrade: number;
    defaultDuration: number;
    allowLateSubmissions: boolean;
    latePenaltyPercent: number;
    maxLateDays: number;
  };
  gradingPolicies: Array<{
    id: string;
    name: string;
    scale: 'letter' | 'percentage' | 'points';
    ranges: Array<{
      min: number;
      max: number;
      grade: string;
      gpa?: number;
    }>;
    allowExtraCredit: boolean;
    roundingRule: 'up' | 'down' | 'nearest';
    isDefault: boolean;
  }>;
  assignmentDefaults: {
    allowLateSubmissions: boolean;
    latePenaltyPercent: number;
    maxLateDays: number;
    allowResubmissions: boolean;
    maxResubmissions: number;
    defaultDueDays: number;
    requireRubric: boolean;
    defaultPointValue: number;
    allowPeerReview: boolean;
    anonymousGrading: boolean;
  };
  collaborationRules: {
    allowPeerReview: boolean;
    allowGroupAssignments: boolean;
    allowCrossClassCollaboration: boolean;
    allowExternalCollaboration: boolean;
    defaultGroupSize: number;
    maxGroupSize: number;
    requireGroupApproval: boolean;
    allowStudentGroupCreation: boolean;
  };
  notificationSettings: {
    emailNotifications: boolean;
    pushNotifications: boolean;
    digestFrequency: 'immediate' | 'daily' | 'weekly' | 'never';
    notifyOnAssignmentCreated: boolean;
    notifyOnGradePosted: boolean;
    notifyOnAnnouncementPosted: boolean;
    notifyOnDiscussionReply: boolean;
  };
}

interface PolicyConflict {
  field: string;
  departmentValue: any;
  institutionValue: any;
  conflictType: 'restriction' | 'requirement' | 'incompatible';
  message: string;
  resolution?: 'use_institution' | 'use_department' | 'merge' | 'custom';
}

interface DepartmentPreferenceManagerProps {
  departmentId: string;
  currentUserRole: UserRole;
  institutionId: string;
}

export function DepartmentPreferenceManager({ 
  departmentId, 
  currentUserRole, 
  institutionId 
}: DepartmentPreferenceManagerProps) {
  const [settings, setSettings] = useState<DepartmentSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<DepartmentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<PolicyConflict[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);
  const [inheritedFields, setInheritedFields] = useState<string[]>([]);
  const [overriddenFields, setOverriddenFields] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Dialog states
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showInheritanceDialog, setShowInheritanceDialog] = useState(false);

  useEffect(() => {
    fetchDepartmentConfig();
  }, [departmentId]);

  useEffect(() => {
    if (settings && originalSettings) {
      setHasUnsavedChanges(JSON.stringify(settings) !== JSON.stringify(originalSettings));
    }
  }, [settings, originalSettings]);

  const fetchDepartmentConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/departments/${departmentId}/preferences`);
      const data = await response.json();

      if (data.success) {
        setSettings(data.data.finalConfig);
        setOriginalSettings(data.data.finalConfig);
        setInheritedFields(data.data.inheritedFields || []);
        setOverriddenFields(data.data.overriddenFields || []);
        setConflicts(data.data.conflicts || []);
      }
    } catch (error) {
      console.error('Error fetching department config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/departments/${departmentId}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          reason: 'Updated department preferences'
        })
      });

      const data = await response.json();

      if (data.success) {
        setOriginalSettings(settings);
        setHasUnsavedChanges(false);
        alert('Settings saved successfully!');
      } else if (data.conflicts) {
        setConflicts(data.conflicts);
        setShowConflicts(true);
      } else {
        alert('Failed to save settings: ' + (data.errors?.[0]?.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    try {
      const response = await fetch(`/api/departments/${departmentId}/preferences/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Reset to institution defaults'
        })
      });

      const data = await response.json();

      if (data.success) {
        await fetchDepartmentConfig();
        setShowResetDialog(false);
        alert('Settings reset to institution defaults successfully!');
      } else {
        alert('Failed to reset settings: ' + (data.errors?.[0]?.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error resetting settings:', error);
      alert('Error resetting settings');
    }
  };

  const resolveConflict = (conflictIndex: number, resolution: string) => {
    const updatedConflicts = [...conflicts];
    updatedConflicts[conflictIndex].resolution = resolution as any;
    setConflicts(updatedConflicts);
  };

  const applyConflictResolutions = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/departments/${departmentId}/preferences/resolve-conflicts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          conflicts,
          reason: 'Resolved policy conflicts'
        })
      });

      const data = await response.json();

      if (data.success) {
        await fetchDepartmentConfig();
        setShowConflicts(false);
        alert('Conflicts resolved and settings saved successfully!');
      } else {
        alert('Failed to resolve conflicts: ' + (data.errors?.[0]?.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error resolving conflicts:', error);
      alert('Error resolving conflicts');
    } finally {
      setSaving(false);
    }
  };

  const isFieldInherited = (fieldPath: string): boolean => {
    return inheritedFields.some(field => field.startsWith(fieldPath));
  };

  const isFieldOverridden = (fieldPath: string): boolean => {
    return overriddenFields.some(field => field.startsWith(fieldPath));
  };

  const getFieldStatus = (fieldPath: string): 'inherited' | 'overridden' | 'custom' => {
    if (isFieldInherited(fieldPath)) return 'inherited';
    if (isFieldOverridden(fieldPath)) return 'overridden';
    return 'custom';
  };

  const FieldStatusIndicator = ({ fieldPath }: { fieldPath: string }) => {
    const status = getFieldStatus(fieldPath);
    
    switch (status) {
      case 'inherited':
        return (
          <Badge variant="secondary" className="ml-2 text-xs">
            <Eye className="h-3 w-3 mr-1" />
            Inherited
          </Badge>
        );
      case 'overridden':
        return (
          <Badge variant="outline" className="ml-2 text-xs">
            <Settings className="h-3 w-3 mr-1" />
            Customized
          </Badge>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading department preferences...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center p-8">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p>Failed to load department preferences</p>
        <Button onClick={fetchDepartmentConfig} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Department Preferences</h2>
          <p className="text-muted-foreground">Configure department-specific settings and policies</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowInheritanceDialog(true)}
          >
            <Info className="h-4 w-4 mr-2" />
            View Inheritance
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowResetDialog(true)}
            disabled={saving}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSaveSettings}
            disabled={!hasUnsavedChanges || saving}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            There are {conflicts.length} policy conflicts that need to be resolved.
            <Button
              variant="link"
              className="p-0 ml-2"
              onClick={() => setShowConflicts(true)}
            >
              Review Conflicts
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {hasUnsavedChanges && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Don't forget to save your preferences.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="class-settings" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="class-settings">Class Settings</TabsTrigger>
          <TabsTrigger value="grading">Grading</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="collaboration">Collaboration</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="class-settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Default Class Settings
                <FieldStatusIndicator fieldPath="defaultClassSettings" />
              </CardTitle>
              <CardDescription>
                Configure default settings for new classes in this department
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="defaultCapacity">Default Class Capacity</Label>
                  <Input
                    id="defaultCapacity"
                    type="number"
                    min="1"
                    max="1000"
                    value={settings.defaultClassSettings.defaultCapacity}
                    onChange={(e) => setSettings({
                      ...settings,
                      defaultClassSettings: {
                        ...settings.defaultClassSettings,
                        defaultCapacity: parseInt(e.target.value) || 30
                      }
                    })}
                  />
                </div>

                <div>
                  <Label htmlFor="passingGrade">Passing Grade (%)</Label>
                  <Input
                    id="passingGrade"
                    type="number"
                    min="0"
                    max="100"
                    value={settings.defaultClassSettings.passingGrade}
                    onChange={(e) => setSettings({
                      ...settings,
                      defaultClassSettings: {
                        ...settings.defaultClassSettings,
                        passingGrade: parseInt(e.target.value) || 60
                      }
                    })}
                  />
                </div>

                <div>
                  <Label htmlFor="gradingScale">Default Grading Scale</Label>
                  <Select
                    value={settings.defaultClassSettings.gradingScale}
                    onValueChange={(value) => setSettings({
                      ...settings,
                      defaultClassSettings: {
                        ...settings.defaultClassSettings,
                        gradingScale: value as 'letter' | 'percentage' | 'points'
                      }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="letter">Letter Grades (A, B, C, etc.)</SelectItem>
                      <SelectItem value="percentage">Percentage (0-100%)</SelectItem>
                      <SelectItem value="points">Points Based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="defaultDuration">Default Class Duration (minutes)</Label>
                  <Input
                    id="defaultDuration"
                    type="number"
                    min="15"
                    max="300"
                    value={settings.defaultClassSettings.defaultDuration}
                    onChange={(e) => setSettings({
                      ...settings,
                      defaultClassSettings: {
                        ...settings.defaultClassSettings,
                        defaultDuration: parseInt(e.target.value) || 50
                      }
                    })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowWaitlist">Allow Waitlists</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow students to join waitlists when classes are full
                    </p>
                  </div>
                  <Switch
                    id="allowWaitlist"
                    checked={settings.defaultClassSettings.allowWaitlist}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      defaultClassSettings: {
                        ...settings.defaultClassSettings,
                        allowWaitlist: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requireApproval">Require Enrollment Approval</Label>
                    <p className="text-sm text-muted-foreground">
                      Require instructor approval for student enrollment
                    </p>
                  </div>
                  <Switch
                    id="requireApproval"
                    checked={settings.defaultClassSettings.requireApproval}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      defaultClassSettings: {
                        ...settings.defaultClassSettings,
                        requireApproval: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowSelfEnrollment">Allow Self-Enrollment</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow students to enroll themselves in classes
                    </p>
                  </div>
                  <Switch
                    id="allowSelfEnrollment"
                    checked={settings.defaultClassSettings.allowSelfEnrollment}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      defaultClassSettings: {
                        ...settings.defaultClassSettings,
                        allowSelfEnrollment: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowLateSubmissions">Allow Late Submissions</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow students to submit assignments after the due date
                    </p>
                  </div>
                  <Switch
                    id="allowLateSubmissions"
                    checked={settings.defaultClassSettings.allowLateSubmissions}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      defaultClassSettings: {
                        ...settings.defaultClassSettings,
                        allowLateSubmissions: checked
                      }
                    })}
                  />
                </div>

                {settings.defaultClassSettings.allowLateSubmissions && (
                  <div className="ml-6 space-y-4">
                    <div>
                      <Label htmlFor="latePenalty">Late Penalty (%)</Label>
                      <div className="mt-2">
                        <Slider
                          value={[settings.defaultClassSettings.latePenaltyPercent]}
                          onValueChange={(value) => setSettings({
                            ...settings,
                            defaultClassSettings: {
                              ...settings.defaultClassSettings,
                              latePenaltyPercent: value[0]
                            }
                          })}
                          max={100}
                          step={5}
                          className="w-full"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground mt-1">
                          <span>0%</span>
                          <span>{settings.defaultClassSettings.latePenaltyPercent}%</span>
                          <span>100%</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="maxLateDays">Maximum Late Days</Label>
                      <Input
                        id="maxLateDays"
                        type="number"
                        min="1"
                        max="30"
                        value={settings.defaultClassSettings.maxLateDays}
                        onChange={(e) => setSettings({
                          ...settings,
                          defaultClassSettings: {
                            ...settings.defaultClassSettings,
                            maxLateDays: parseInt(e.target.value) || 7
                          }
                        })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grading">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Grading Policies
                <FieldStatusIndicator fieldPath="gradingPolicies" />
              </CardTitle>
              <CardDescription>
                Configure grading scales and policies for the department
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {settings.gradingPolicies.map((policy, index) => (
                  <Card key={policy.id} className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-medium">{policy.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {policy.scale} scale • {policy.ranges.length} grade ranges
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {policy.isDefault && (
                          <Badge variant="default">Default</Badge>
                        )}
                        <Switch
                          checked={policy.allowExtraCredit}
                          onCheckedChange={(checked) => {
                            const updatedPolicies = [...settings.gradingPolicies];
                            updatedPolicies[index].allowExtraCredit = checked;
                            setSettings({
                              ...settings,
                              gradingPolicies: updatedPolicies
                            });
                          }}
                        />
                        <Label className="text-sm">Extra Credit</Label>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      {policy.ranges.slice(0, 8).map((range, rangeIndex) => (
                        <div key={rangeIndex} className="flex justify-between p-2 bg-muted rounded">
                          <span className="font-medium">{range.grade}</span>
                          <span>{range.min}-{range.max}%</span>
                        </div>
                      ))}
                      {policy.ranges.length > 8 && (
                        <div className="flex items-center justify-center p-2 text-muted-foreground">
                          +{policy.ranges.length - 8} more
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Assignment Defaults
                <FieldStatusIndicator fieldPath="assignmentDefaults" />
              </CardTitle>
              <CardDescription>
                Configure default settings for assignments in this department
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="defaultPointValue">Default Point Value</Label>
                  <Input
                    id="defaultPointValue"
                    type="number"
                    min="1"
                    max="1000"
                    value={settings.assignmentDefaults.defaultPointValue}
                    onChange={(e) => setSettings({
                      ...settings,
                      assignmentDefaults: {
                        ...settings.assignmentDefaults,
                        defaultPointValue: parseInt(e.target.value) || 100
                      }
                    })}
                  />
                </div>

                <div>
                  <Label htmlFor="defaultDueDays">Default Due Days</Label>
                  <Input
                    id="defaultDueDays"
                    type="number"
                    min="1"
                    max="365"
                    value={settings.assignmentDefaults.defaultDueDays}
                    onChange={(e) => setSettings({
                      ...settings,
                      assignmentDefaults: {
                        ...settings.assignmentDefaults,
                        defaultDueDays: parseInt(e.target.value) || 7
                      }
                    })}
                  />
                </div>

                <div>
                  <Label htmlFor="maxResubmissions">Max Resubmissions</Label>
                  <Input
                    id="maxResubmissions"
                    type="number"
                    min="0"
                    max="10"
                    value={settings.assignmentDefaults.maxResubmissions}
                    onChange={(e) => setSettings({
                      ...settings,
                      assignmentDefaults: {
                        ...settings.assignmentDefaults,
                        maxResubmissions: parseInt(e.target.value) || 3
                      }
                    })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowResubmissions">Allow Resubmissions</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow students to resubmit assignments
                    </p>
                  </div>
                  <Switch
                    id="allowResubmissions"
                    checked={settings.assignmentDefaults.allowResubmissions}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      assignmentDefaults: {
                        ...settings.assignmentDefaults,
                        allowResubmissions: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requireRubric">Require Rubrics</Label>
                    <p className="text-sm text-muted-foreground">
                      Require rubrics for all assignments
                    </p>
                  </div>
                  <Switch
                    id="requireRubric"
                    checked={settings.assignmentDefaults.requireRubric}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      assignmentDefaults: {
                        ...settings.assignmentDefaults,
                        requireRubric: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowPeerReview">Allow Peer Review</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable peer review for assignments
                    </p>
                  </div>
                  <Switch
                    id="allowPeerReview"
                    checked={settings.assignmentDefaults.allowPeerReview}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      assignmentDefaults: {
                        ...settings.assignmentDefaults,
                        allowPeerReview: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="anonymousGrading">Anonymous Grading</Label>
                    <p className="text-sm text-muted-foreground">
                      Hide student names during grading
                    </p>
                  </div>
                  <Switch
                    id="anonymousGrading"
                    checked={settings.assignmentDefaults.anonymousGrading}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      assignmentDefaults: {
                        ...settings.assignmentDefaults,
                        anonymousGrading: checked
                      }
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collaboration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Collaboration Rules
                <FieldStatusIndicator fieldPath="collaborationRules" />
              </CardTitle>
              <CardDescription>
                Configure collaboration and group work policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="defaultGroupSize">Default Group Size</Label>
                  <Input
                    id="defaultGroupSize"
                    type="number"
                    min="2"
                    max="20"
                    value={settings.collaborationRules.defaultGroupSize}
                    onChange={(e) => setSettings({
                      ...settings,
                      collaborationRules: {
                        ...settings.collaborationRules,
                        defaultGroupSize: parseInt(e.target.value) || 3
                      }
                    })}
                  />
                </div>

                <div>
                  <Label htmlFor="maxGroupSize">Maximum Group Size</Label>
                  <Input
                    id="maxGroupSize"
                    type="number"
                    min="2"
                    max="20"
                    value={settings.collaborationRules.maxGroupSize}
                    onChange={(e) => setSettings({
                      ...settings,
                      collaborationRules: {
                        ...settings.collaborationRules,
                        maxGroupSize: parseInt(e.target.value) || 6
                      }
                    })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowGroupAssignments">Allow Group Assignments</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable group assignments and projects
                    </p>
                  </div>
                  <Switch
                    id="allowGroupAssignments"
                    checked={settings.collaborationRules.allowGroupAssignments}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      collaborationRules: {
                        ...settings.collaborationRules,
                        allowGroupAssignments: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowCrossClassCollaboration">Cross-Class Collaboration</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow collaboration between different classes
                    </p>
                  </div>
                  <Switch
                    id="allowCrossClassCollaboration"
                    checked={settings.collaborationRules.allowCrossClassCollaboration}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      collaborationRules: {
                        ...settings.collaborationRules,
                        allowCrossClassCollaboration: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowExternalCollaboration">External Collaboration</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow collaboration with external users
                    </p>
                  </div>
                  <Switch
                    id="allowExternalCollaboration"
                    checked={settings.collaborationRules.allowExternalCollaboration}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      collaborationRules: {
                        ...settings.collaborationRules,
                        allowExternalCollaboration: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requireGroupApproval">Require Group Approval</Label>
                    <p className="text-sm text-muted-foreground">
                      Require instructor approval for group formation
                    </p>
                  </div>
                  <Switch
                    id="requireGroupApproval"
                    checked={settings.collaborationRules.requireGroupApproval}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      collaborationRules: {
                        ...settings.collaborationRules,
                        requireGroupApproval: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowStudentGroupCreation">Student Group Creation</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow students to create their own groups
                    </p>
                  </div>
                  <Switch
                    id="allowStudentGroupCreation"
                    checked={settings.collaborationRules.allowStudentGroupCreation}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      collaborationRules: {
                        ...settings.collaborationRules,
                        allowStudentGroupCreation: checked
                      }
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Notification Settings
                <FieldStatusIndicator fieldPath="notificationSettings" />
              </CardTitle>
              <CardDescription>
                Configure default notification preferences for the department
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="digestFrequency">Digest Frequency</Label>
                <Select
                  value={settings.notificationSettings.digestFrequency}
                  onValueChange={(value) => setSettings({
                    ...settings,
                    notificationSettings: {
                      ...settings.notificationSettings,
                      digestFrequency: value as 'immediate' | 'daily' | 'weekly' | 'never'
                    }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="daily">Daily Digest</SelectItem>
                    <SelectItem value="weekly">Weekly Digest</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="emailNotifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send notifications via email
                    </p>
                  </div>
                  <Switch
                    id="emailNotifications"
                    checked={settings.notificationSettings.emailNotifications}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        emailNotifications: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="pushNotifications">Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send push notifications to mobile devices
                    </p>
                  </div>
                  <Switch
                    id="pushNotifications"
                    checked={settings.notificationSettings.pushNotifications}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        pushNotifications: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="notifyOnAssignmentCreated">Assignment Created</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when new assignments are created
                    </p>
                  </div>
                  <Switch
                    id="notifyOnAssignmentCreated"
                    checked={settings.notificationSettings.notifyOnAssignmentCreated}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        notifyOnAssignmentCreated: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="notifyOnGradePosted">Grade Posted</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when grades are posted
                    </p>
                  </div>
                  <Switch
                    id="notifyOnGradePosted"
                    checked={settings.notificationSettings.notifyOnGradePosted}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        notifyOnGradePosted: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="notifyOnAnnouncementPosted">Announcement Posted</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when announcements are posted
                    </p>
                  </div>
                  <Switch
                    id="notifyOnAnnouncementPosted"
                    checked={settings.notificationSettings.notifyOnAnnouncementPosted}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        notifyOnAnnouncementPosted: checked
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="notifyOnDiscussionReply">Discussion Reply</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when someone replies to discussions
                    </p>
                  </div>
                  <Switch
                    id="notifyOnDiscussionReply"
                    checked={settings.notificationSettings.notifyOnDiscussionReply}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        notifyOnDiscussionReply: checked
                      }
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Conflicts Dialog */}
      <Dialog open={showConflicts} onOpenChange={setShowConflicts}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Policy Conflicts</DialogTitle>
            <DialogDescription>
              The following settings conflict with institution policies. Please resolve them before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {conflicts.map((conflict, index) => (
              <Card key={index} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-sm">{conflict.field}</h4>
                      <p className="text-sm text-muted-foreground">{conflict.message}</p>
                    </div>
                    <Badge variant={conflict.conflictType === 'incompatible' ? 'destructive' : 'secondary'}>
                      {conflict.conflictType}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label>Department Value</Label>
                      <div className="p-2 bg-muted rounded mt-1">
                        {JSON.stringify(conflict.departmentValue)}
                      </div>
                    </div>
                    <div>
                      <Label>Institution Value</Label>
                      <div className="p-2 bg-muted rounded mt-1">
                        {JSON.stringify(conflict.institutionValue)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Resolution</Label>
                    <Select
                      value={conflict.resolution || ''}
                      onValueChange={(value) => resolveConflict(index, value)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choose resolution..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="use_institution">Use Institution Value</SelectItem>
                        <SelectItem value="use_department">Use Department Value</SelectItem>
                        {conflict.conflictType !== 'incompatible' && (
                          <SelectItem value="merge">Merge Values</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConflicts(false)}>
              Cancel
            </Button>
            <Button 
              onClick={applyConflictResolutions}
              disabled={conflicts.some(c => !c.resolution) || saving}
            >
              {saving ? 'Applying...' : 'Apply Resolutions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to Institution Defaults</DialogTitle>
            <DialogDescription>
              This will reset all department preferences to match the institution's default settings. 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetToDefaults}>
              Reset Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inheritance Dialog */}
      <Dialog open={showInheritanceDialog} onOpenChange={setShowInheritanceDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configuration Inheritance</DialogTitle>
            <DialogDescription>
              View how department settings inherit from institution policies
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Inherited Fields ({inheritedFields.length})</h4>
              <div className="max-h-32 overflow-y-auto">
                {inheritedFields.length > 0 ? (
                  <div className="space-y-1">
                    {inheritedFields.map((field, index) => (
                      <div key={index} className="text-sm p-2 bg-green-50 rounded flex items-center">
                        <Eye className="h-3 w-3 mr-2 text-green-600" />
                        {field}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No inherited fields</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Customized Fields ({overriddenFields.length})</h4>
              <div className="max-h-32 overflow-y-auto">
                {overriddenFields.length > 0 ? (
                  <div className="space-y-1">
                    {overriddenFields.map((field, index) => (
                      <div key={index} className="text-sm p-2 bg-blue-50 rounded flex items-center">
                        <Settings className="h-3 w-3 mr-2 text-blue-600" />
                        {field}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No customized fields</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowInheritanceDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}