'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings, 
  Calendar, 
  Users, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Plus, 
  Trash2,
  Edit,
  Save,
  X
} from 'lucide-react';
import {
  ClassEnrollmentConfig,
  EnrollmentType,
  ClassPrerequisite,
  EnrollmentRestriction,
  PrerequisiteType,
  RestrictionType
} from '@/lib/types/enrollment';

interface EnrollmentConfigInterfaceProps {
  classId: string;
  initialConfig?: ClassEnrollmentConfig;
  prerequisites?: ClassPrerequisite[];
  restrictions?: EnrollmentRestriction[];
  onConfigUpdate?: (config: ClassEnrollmentConfig) => void;
  onPrerequisiteUpdate?: (prerequisites: ClassPrerequisite[]) => void;
  onRestrictionUpdate?: (restrictions: EnrollmentRestriction[]) => void;
  isTeacher?: boolean;
  readOnly?: boolean;
}

interface ConfigFormData {
  enrollmentType: EnrollmentType;
  capacity: number;
  waitlistCapacity: number;
  enrollmentStart: string;
  enrollmentEnd: string;
  dropDeadline: string;
  withdrawDeadline: string;
  autoApprove: boolean;
  requiresJustification: boolean;
  allowWaitlist: boolean;
  maxWaitlistPosition: number | null;
  notificationSettings: {
    enrollmentConfirmation: boolean;
    waitlistUpdates: boolean;
    deadlineReminders: boolean;
    capacityAlerts: boolean;
  };
}

interface PrerequisiteFormData {
  type: PrerequisiteType;
  requirement: string;
  description: string;
  strict: boolean;
}

interface RestrictionFormData {
  type: RestrictionType;
  condition: string;
  description: string;
  overridable: boolean;
}

export function EnrollmentConfigInterface({
  classId,
  initialConfig,
  prerequisites = [],
  restrictions = [],
  onConfigUpdate,
  onPrerequisiteUpdate,
  onRestrictionUpdate,
  isTeacher = false,
  readOnly = false
}: EnrollmentConfigInterfaceProps) {
  const [config, setConfig] = useState<ConfigFormData>({
    enrollmentType: initialConfig?.enrollmentType || EnrollmentType.OPEN,
    capacity: initialConfig?.capacity || 30,
    waitlistCapacity: initialConfig?.waitlistCapacity || 10,
    enrollmentStart: initialConfig?.enrollmentStart?.toISOString().slice(0, 16) || '',
    enrollmentEnd: initialConfig?.enrollmentEnd?.toISOString().slice(0, 16) || '',
    dropDeadline: initialConfig?.dropDeadline?.toISOString().slice(0, 10) || '',
    withdrawDeadline: initialConfig?.withdrawDeadline?.toISOString().slice(0, 10) || '',
    autoApprove: initialConfig?.autoApprove ?? true,
    requiresJustification: initialConfig?.requiresJustification ?? false,
    allowWaitlist: initialConfig?.allowWaitlist ?? true,
    maxWaitlistPosition: initialConfig?.maxWaitlistPosition || null,
    notificationSettings: {
      enrollmentConfirmation: initialConfig?.notificationSettings?.enrollmentConfirmation ?? true,
      waitlistUpdates: initialConfig?.notificationSettings?.waitlistUpdates ?? true,
      deadlineReminders: initialConfig?.notificationSettings?.deadlineReminders ?? true,
      capacityAlerts: initialConfig?.notificationSettings?.capacityAlerts ?? true,
    }
  });

  const [localPrerequisites, setLocalPrerequisites] = useState<ClassPrerequisite[]>(prerequisites);
  const [localRestrictions, setLocalRestrictions] = useState<EnrollmentRestriction[]>(restrictions);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});

  // New prerequisite/restriction forms
  const [showPrerequisiteForm, setShowPrerequisiteForm] = useState(false);
  const [showRestrictionForm, setShowRestrictionForm] = useState(false);
  const [editingPrerequisite, setEditingPrerequisite] = useState<ClassPrerequisite | null>(null);
  const [editingRestriction, setEditingRestriction] = useState<EnrollmentRestriction | null>(null);

  const [prerequisiteForm, setPrerequisiteForm] = useState<PrerequisiteFormData>({
    type: PrerequisiteType.COURSE,
    requirement: '',
    description: '',
    strict: true
  });

  const [restrictionForm, setRestrictionForm] = useState<RestrictionFormData>({
    type: RestrictionType.YEAR_LEVEL,
    condition: '',
    description: '',
    overridable: false
  });

  // Update form when enrollment type changes
  useEffect(() => {
    if (config.enrollmentType === EnrollmentType.OPEN) {
      setConfig(prev => ({
        ...prev,
        autoApprove: true,
        requiresJustification: false
      }));
    } else if (config.enrollmentType === EnrollmentType.RESTRICTED) {
      setConfig(prev => ({
        ...prev,
        autoApprove: false,
        requiresJustification: true
      }));
    } else if (config.enrollmentType === EnrollmentType.INVITATION_ONLY) {
      setConfig(prev => ({
        ...prev,
        autoApprove: false,
        requiresJustification: false
      }));
    }
  }, [config.enrollmentType]);

  const validateConfig = (): boolean => {
    const newErrors: Record<string, string> = {};
    const newWarnings: Record<string, string> = {};

    // Validate capacity
    if (config.capacity < 1) {
      newErrors.capacity = 'Capacity must be at least 1';
    }

    // Validate waitlist capacity
    if (config.waitlistCapacity < 0) {
      newErrors.waitlistCapacity = 'Waitlist capacity cannot be negative';
    }

    // Validate date ranges
    if (config.enrollmentStart && config.enrollmentEnd) {
      const startDate = new Date(config.enrollmentStart);
      const endDate = new Date(config.enrollmentEnd);
      if (startDate >= endDate) {
        newErrors.enrollmentEnd = 'End date must be after start date';
      }
    }

    // Validate deadline order
    if (config.dropDeadline && config.withdrawDeadline) {
      const dropDate = new Date(config.dropDeadline);
      const withdrawDate = new Date(config.withdrawDeadline);
      if (dropDate >= withdrawDate) {
        newErrors.withdrawDeadline = 'Withdraw deadline must be after drop deadline';
      }
    }

    // Validate max waitlist position
    if (config.maxWaitlistPosition && config.maxWaitlistPosition > config.waitlistCapacity) {
      newErrors.maxWaitlistPosition = 'Max position cannot exceed waitlist capacity';
    }

    // Check for warnings
    if (config.enrollmentType === EnrollmentType.INVITATION_ONLY && config.autoApprove) {
      newWarnings.autoApprove = 'Auto-approve is not applicable for invitation-only classes';
    }

    setErrors(newErrors);
    setWarnings(newWarnings);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateConfig()) return;

    setIsSaving(true);
    try {
      // Convert form data back to config format
      const updatedConfig: ClassEnrollmentConfig = {
        enrollmentType: config.enrollmentType,
        capacity: config.capacity,
        waitlistCapacity: config.waitlistCapacity,
        enrollmentStart: config.enrollmentStart ? new Date(config.enrollmentStart) : undefined,
        enrollmentEnd: config.enrollmentEnd ? new Date(config.enrollmentEnd) : undefined,
        dropDeadline: config.dropDeadline ? new Date(config.dropDeadline) : undefined,
        withdrawDeadline: config.withdrawDeadline ? new Date(config.withdrawDeadline) : undefined,
        autoApprove: config.autoApprove,
        requiresJustification: config.requiresJustification,
        allowWaitlist: config.allowWaitlist,
        maxWaitlistPosition: config.maxWaitlistPosition,
        notificationSettings: config.notificationSettings
      };

      onConfigUpdate?.(updatedConfig);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save configuration:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form to initial values
    if (initialConfig) {
      setConfig({
        enrollmentType: initialConfig.enrollmentType,
        capacity: initialConfig.capacity,
        waitlistCapacity: initialConfig.waitlistCapacity,
        enrollmentStart: initialConfig.enrollmentStart?.toISOString().slice(0, 16) || '',
        enrollmentEnd: initialConfig.enrollmentEnd?.toISOString().slice(0, 16) || '',
        dropDeadline: initialConfig.dropDeadline?.toISOString().slice(0, 10) || '',
        withdrawDeadline: initialConfig.withdrawDeadline?.toISOString().slice(0, 10) || '',
        autoApprove: initialConfig.autoApprove,
        requiresJustification: initialConfig.requiresJustification,
        allowWaitlist: initialConfig.allowWaitlist,
        maxWaitlistPosition: initialConfig.maxWaitlistPosition,
        notificationSettings: initialConfig.notificationSettings
      });
    }
    setIsEditing(false);
    setErrors({});
    setWarnings({});
  };

  const handleAddPrerequisite = () => {
    if (!prerequisiteForm.requirement.trim()) return;

    const newPrerequisite: ClassPrerequisite = {
      id: `temp-${Date.now()}`,
      classId,
      type: prerequisiteForm.type,
      requirement: prerequisiteForm.requirement,
      description: prerequisiteForm.description,
      strict: prerequisiteForm.strict,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updated = [...localPrerequisites, newPrerequisite];
    setLocalPrerequisites(updated);
    onPrerequisiteUpdate?.(updated);

    // Reset form
    setPrerequisiteForm({
      type: PrerequisiteType.COURSE,
      requirement: '',
      description: '',
      strict: true
    });
    setShowPrerequisiteForm(false);
  };

  const handleRemovePrerequisite = (id: string) => {
    const updated = localPrerequisites.filter(p => p.id !== id);
    setLocalPrerequisites(updated);
    onPrerequisiteUpdate?.(updated);
  };

  const handleAddRestriction = () => {
    if (!restrictionForm.condition.trim()) return;

    const newRestriction: EnrollmentRestriction = {
      id: `temp-${Date.now()}`,
      classId,
      type: restrictionForm.type,
      condition: restrictionForm.condition,
      description: restrictionForm.description,
      overridable: restrictionForm.overridable,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updated = [...localRestrictions, newRestriction];
    setLocalRestrictions(updated);
    onRestrictionUpdate?.(updated);

    // Reset form
    setRestrictionForm({
      type: RestrictionType.YEAR_LEVEL,
      condition: '',
      description: '',
      overridable: false
    });
    setShowRestrictionForm(false);
  };

  const handleRemoveRestriction = (id: string) => {
    const updated = localRestrictions.filter(r => r.id !== id);
    setLocalRestrictions(updated);
    onRestrictionUpdate?.(updated);
  };

  const getEnrollmentTypeDescription = (type: EnrollmentType) => {
    switch (type) {
      case EnrollmentType.OPEN:
        return 'Students can enroll immediately if capacity allows';
      case EnrollmentType.RESTRICTED:
        return 'Students must request enrollment and wait for approval';
      case EnrollmentType.INVITATION_ONLY:
        return 'Only invited students can enroll';
      default:
        return '';
    }
  };

  const getPrerequisiteTypeLabel = (type: PrerequisiteType) => {
    switch (type) {
      case PrerequisiteType.COURSE: return 'Course';
      case PrerequisiteType.GRADE: return 'Grade';
      case PrerequisiteType.YEAR: return 'Year Level';
      case PrerequisiteType.MAJOR: return 'Major';
      case PrerequisiteType.GPA: return 'GPA';
      case PrerequisiteType.CUSTOM: return 'Custom';
      default: return type;
    }
  };

  const getRestrictionTypeLabel = (type: RestrictionType) => {
    switch (type) {
      case RestrictionType.YEAR_LEVEL: return 'Year Level';
      case RestrictionType.MAJOR: return 'Major';
      case RestrictionType.DEPARTMENT: return 'Department';
      case RestrictionType.GPA: return 'GPA';
      case RestrictionType.INSTITUTION: return 'Institution';
      case RestrictionType.CUSTOM: return 'Custom';
      default: return type;
    }
  };

  if (readOnly) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Enrollment Configuration
            </CardTitle>
            <CardDescription>
              Current enrollment settings for this class
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Enrollment Type</Label>
                <Badge variant="outline" className="mt-1">
                  {config.enrollmentType.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              <div>
                <Label>Capacity</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {config.capacity} students
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Enrollment Configuration
              </CardTitle>
              <CardDescription>
                Configure how students can enroll in your class
              </CardDescription>
            </div>
            {!isEditing && isTeacher && (
              <Button onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Configuration
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Settings</TabsTrigger>
              <TabsTrigger value="dates">Dates & Deadlines</TabsTrigger>
              <TabsTrigger value="prerequisites">Prerequisites</TabsTrigger>
              <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="enrollmentType">Enrollment Type</Label>
                  <Select
                    value={config.enrollmentType}
                    onValueChange={(value: EnrollmentType) => 
                      setConfig(prev => ({ ...prev, enrollmentType: value }))
                    }
                    disabled={!isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EnrollmentType.OPEN}>Open Enrollment</SelectItem>
                      <SelectItem value={EnrollmentType.RESTRICTED}>Restricted (Approval Required)</SelectItem>
                      <SelectItem value={EnrollmentType.INVITATION_ONLY}>Invitation Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getEnrollmentTypeDescription(config.enrollmentType)}
                  </p>
                  {errors.enrollmentType && (
                    <p className="text-xs text-red-500 mt-1">{errors.enrollmentType}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="capacity">Class Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min="1"
                    value={config.capacity}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      capacity: parseInt(e.target.value) || 0 
                    }))}
                    disabled={!isEditing}
                  />
                  {errors.capacity && (
                    <p className="text-xs text-red-500 mt-1">{errors.capacity}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="waitlistCapacity">Waitlist Capacity</Label>
                  <Input
                    id="waitlistCapacity"
                    type="number"
                    min="0"
                    value={config.waitlistCapacity}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      waitlistCapacity: parseInt(e.target.value) || 0 
                    }))}
                    disabled={!isEditing || !config.allowWaitlist}
                  />
                  {errors.waitlistCapacity && (
                    <p className="text-xs text-red-500 mt-1">{errors.waitlistCapacity}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="maxWaitlistPosition">Max Waitlist Position</Label>
                  <Input
                    id="maxWaitlistPosition"
                    type="number"
                    min="1"
                    value={config.maxWaitlistPosition || ''}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      maxWaitlistPosition: e.target.value ? parseInt(e.target.value) : null
                    }))}
                    disabled={!isEditing || !config.allowWaitlist}
                    placeholder="No limit"
                  />
                  {errors.maxWaitlistPosition && (
                    <p className="text-xs text-red-500 mt-1">{errors.maxWaitlistPosition}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="allowWaitlist"
                    checked={config.allowWaitlist}
                    onCheckedChange={(checked) => 
                      setConfig(prev => ({ ...prev, allowWaitlist: checked as boolean }))
                    }
                    disabled={!isEditing}
                  />
                  <Label htmlFor="allowWaitlist">Allow waitlist when class is full</Label>
                </div>

                {config.enrollmentType === EnrollmentType.RESTRICTED && (
                  <>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="autoApprove"
                        checked={config.autoApprove}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, autoApprove: checked as boolean }))
                        }
                        disabled={!isEditing}
                      />
                      <Label htmlFor="autoApprove">Auto-approve eligible students</Label>
                      {warnings.autoApprove && (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="requiresJustification"
                        checked={config.requiresJustification}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, requiresJustification: checked as boolean }))
                        }
                        disabled={!isEditing}
                      />
                      <Label htmlFor="requiresJustification">Require enrollment justification</Label>
                    </div>
                  </>
                )}
              </div>

              <div>
                <Label>Notification Settings</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enrollmentConfirmation"
                      checked={config.notificationSettings.enrollmentConfirmation}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          notificationSettings: {
                            ...prev.notificationSettings,
                            enrollmentConfirmation: checked as boolean
                          }
                        }))
                      }
                      disabled={!isEditing}
                    />
                    <Label htmlFor="enrollmentConfirmation" className="text-sm">
                      Enrollment confirmations
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="waitlistUpdates"
                      checked={config.notificationSettings.waitlistUpdates}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          notificationSettings: {
                            ...prev.notificationSettings,
                            waitlistUpdates: checked as boolean
                          }
                        }))
                      }
                      disabled={!isEditing}
                    />
                    <Label htmlFor="waitlistUpdates" className="text-sm">
                      Waitlist updates
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="deadlineReminders"
                      checked={config.notificationSettings.deadlineReminders}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          notificationSettings: {
                            ...prev.notificationSettings,
                            deadlineReminders: checked as boolean
                          }
                        }))
                      }
                      disabled={!isEditing}
                    />
                    <Label htmlFor="deadlineReminders" className="text-sm">
                      Deadline reminders
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="capacityAlerts"
                      checked={config.notificationSettings.capacityAlerts}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          notificationSettings: {
                            ...prev.notificationSettings,
                            capacityAlerts: checked as boolean
                          }
                        }))
                      }
                      disabled={!isEditing}
                    />
                    <Label htmlFor="capacityAlerts" className="text-sm">
                      Capacity alerts
                    </Label>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="dates" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="enrollmentStart">Enrollment Start</Label>
                  <Input
                    id="enrollmentStart"
                    type="datetime-local"
                    value={config.enrollmentStart}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      enrollmentStart: e.target.value 
                    }))}
                    disabled={!isEditing}
                  />
                </div>

                <div>
                  <Label htmlFor="enrollmentEnd">Enrollment End</Label>
                  <Input
                    id="enrollmentEnd"
                    type="datetime-local"
                    value={config.enrollmentEnd}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      enrollmentEnd: e.target.value 
                    }))}
                    disabled={!isEditing}
                  />
                  {errors.enrollmentEnd && (
                    <p className="text-xs text-red-500 mt-1">{errors.enrollmentEnd}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dropDeadline">Drop Deadline</Label>
                  <Input
                    id="dropDeadline"
                    type="date"
                    value={config.dropDeadline}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      dropDeadline: e.target.value 
                    }))}
                    disabled={!isEditing}
                  />
                </div>

                <div>
                  <Label htmlFor="withdrawDeadline">Withdraw Deadline</Label>
                  <Input
                    id="withdrawDeadline"
                    type="date"
                    value={config.withdrawDeadline}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      withdrawDeadline: e.target.value 
                    }))}
                    disabled={!isEditing}
                  />
                  {errors.withdrawDeadline && (
                    <p className="text-xs text-red-500 mt-1">{errors.withdrawDeadline}</p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="prerequisites" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Prerequisites</h3>
                  <p className="text-sm text-muted-foreground">
                    Requirements students must meet to enroll
                  </p>
                </div>
                {isEditing && (
                  <Button
                    onClick={() => setShowPrerequisiteForm(true)}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Prerequisite
                  </Button>
                )}
              </div>

              {showPrerequisiteForm && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Type</Label>
                          <Select
                            value={prerequisiteForm.type}
                            onValueChange={(value: PrerequisiteType) => 
                              setPrerequisiteForm(prev => ({ ...prev, type: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(PrerequisiteType).map(type => (
                                <SelectItem key={type} value={type}>
                                  {getPrerequisiteTypeLabel(type)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Requirement</Label>
                          <Input
                            value={prerequisiteForm.requirement}
                            onChange={(e) => setPrerequisiteForm(prev => ({ 
                              ...prev, 
                              requirement: e.target.value 
                            }))}
                            placeholder="e.g., MATH101, 3.0, Sophomore"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Description (Optional)</Label>
                        <Input
                          value={prerequisiteForm.description}
                          onChange={(e) => setPrerequisiteForm(prev => ({ 
                            ...prev, 
                            description: e.target.value 
                          }))}
                          placeholder="Additional details about this prerequisite"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="strict"
                          checked={prerequisiteForm.strict}
                          onCheckedChange={(checked) => 
                            setPrerequisiteForm(prev => ({ ...prev, strict: checked as boolean }))
                          }
                        />
                        <Label htmlFor="strict">Strictly enforce (auto-check)</Label>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleAddPrerequisite} size="sm">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Add
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => setShowPrerequisiteForm(false)}
                          size="sm"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                {localPrerequisites.map((prerequisite) => (
                  <Card key={prerequisite.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {getPrerequisiteTypeLabel(prerequisite.type)}
                            </Badge>
                            <span className="font-medium">{prerequisite.requirement}</span>
                            {prerequisite.strict && (
                              <Badge variant="outline" className="text-xs">
                                Strict
                              </Badge>
                            )}
                          </div>
                          {prerequisite.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {prerequisite.description}
                            </p>
                          )}
                        </div>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePrerequisite(prerequisite.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {localPrerequisites.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No prerequisites configured
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="restrictions" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Enrollment Restrictions</h3>
                  <p className="text-sm text-muted-foreground">
                    Limitations on who can enroll in this class
                  </p>
                </div>
                {isEditing && (
                  <Button
                    onClick={() => setShowRestrictionForm(true)}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Restriction
                  </Button>
                )}
              </div>

              {showRestrictionForm && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Type</Label>
                          <Select
                            value={restrictionForm.type}
                            onValueChange={(value: RestrictionType) => 
                              setRestrictionForm(prev => ({ ...prev, type: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(RestrictionType).map(type => (
                                <SelectItem key={type} value={type}>
                                  {getRestrictionTypeLabel(type)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Condition</Label>
                          <Input
                            value={restrictionForm.condition}
                            onChange={(e) => setRestrictionForm(prev => ({ 
                              ...prev, 
                              condition: e.target.value 
                            }))}
                            placeholder="e.g., Senior, Computer Science, 3.5"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Description (Optional)</Label>
                        <Input
                          value={restrictionForm.description}
                          onChange={(e) => setRestrictionForm(prev => ({ 
                            ...prev, 
                            description: e.target.value 
                          }))}
                          placeholder="Additional details about this restriction"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="overridable"
                          checked={restrictionForm.overridable}
                          onCheckedChange={(checked) => 
                            setRestrictionForm(prev => ({ ...prev, overridable: checked as boolean }))
                          }
                        />
                        <Label htmlFor="overridable">Allow instructor override</Label>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleAddRestriction} size="sm">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Add
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => setShowRestrictionForm(false)}
                          size="sm"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                {localRestrictions.map((restriction) => (
                  <Card key={restriction.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {getRestrictionTypeLabel(restriction.type)}
                            </Badge>
                            <span className="font-medium">{restriction.condition}</span>
                            {restriction.overridable && (
                              <Badge variant="outline" className="text-xs">
                                Overridable
                              </Badge>
                            )}
                          </div>
                          {restriction.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {restriction.description}
                            </p>
                          )}
                        </div>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRestriction(restriction.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {localRestrictions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No restrictions configured
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {isEditing && (
            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          )}

          {Object.keys(warnings).length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">Warnings</span>
              </div>
              <ul className="mt-1 text-sm text-yellow-700">
                {Object.entries(warnings).map(([field, message]) => (
                  <li key={field}>• {message}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}