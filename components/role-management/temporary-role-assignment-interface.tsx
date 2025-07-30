'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, User, AlertTriangle, CheckCircle } from 'lucide-react';
import { UserRole, UserRoleAssignment } from '@/lib/types/role-management';

interface TemporaryRoleAssignmentProps {
  userId?: string;
  currentRole?: UserRole;
  institutionId: string;
  departmentId?: string;
  onAssignmentComplete?: (assignment: UserRoleAssignment) => void;
  onCancel?: () => void;
}

interface TemporaryRoleFormData {
  userId: string;
  role: UserRole;
  expiresAt: string;
  justification: string;
  notifyUser: boolean;
  notifyAdmins: boolean;
}

const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.DEPARTMENT_ADMIN]: 'Department Administrator',
  [UserRole.INSTITUTION_ADMIN]: 'Institution Administrator',
  [UserRole.SYSTEM_ADMIN]: 'System Administrator'
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Access to student features and enrolled classes',
  [UserRole.TEACHER]: 'Ability to create and manage classes, grade students',
  [UserRole.DEPARTMENT_ADMIN]: 'Manage users and settings within department',
  [UserRole.INSTITUTION_ADMIN]: 'Full administrative access to institution',
  [UserRole.SYSTEM_ADMIN]: 'System-wide administrative privileges'
};

export function TemporaryRoleAssignmentInterface({
  userId: initialUserId,
  currentRole,
  institutionId,
  departmentId,
  onAssignmentComplete,
  onCancel
}: TemporaryRoleAssignmentProps) {
  const [formData, setFormData] = useState<TemporaryRoleFormData>({
    userId: initialUserId || '',
    role: UserRole.STUDENT,
    expiresAt: '',
    justification: '',
    notifyUser: true,
    notifyAdmins: true
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);

  // Set minimum date to tomorrow
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateString = minDate.toISOString().split('T')[0];

  // Set maximum date to 1 year from now
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  const maxDateString = maxDate.toISOString().split('T')[0];

  useEffect(() => {
    if (formData.userId) {
      fetchUserInfo(formData.userId);
    }
  }, [formData.userId]);

  const fetchUserInfo = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (response.ok) {
        const user = await response.json();
        setUserInfo({ name: user.name, email: user.email });
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  };

  const handleInputChange = (field: keyof TemporaryRoleFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const validateForm = (): string | null => {
    if (!formData.userId.trim()) {
      return 'User ID is required';
    }

    if (!formData.role) {
      return 'Role selection is required';
    }

    if (!formData.expiresAt) {
      return 'Expiration date is required';
    }

    const expirationDate = new Date(formData.expiresAt);
    const now = new Date();
    
    if (expirationDate <= now) {
      return 'Expiration date must be in the future';
    }

    if (expirationDate > maxDate) {
      return 'Expiration date cannot be more than 1 year from now';
    }

    if (!formData.justification.trim()) {
      return 'Justification is required for temporary role assignments';
    }

    if (formData.justification.length < 10) {
      return 'Justification must be at least 10 characters long';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/roles/assign-temporary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: formData.userId,
          role: formData.role,
          expiresAt: new Date(formData.expiresAt).toISOString(),
          justification: formData.justification,
          institutionId,
          departmentId,
          notifyUser: formData.notifyUser,
          notifyAdmins: formData.notifyAdmins
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to assign temporary role');
      }

      const assignment = await response.json();
      setSuccess('Temporary role assigned successfully');
      
      if (onAssignmentComplete) {
        onAssignmentComplete(assignment);
      }

      // Reset form
      setFormData({
        userId: '',
        role: UserRole.STUDENT,
        expiresAt: '',
        justification: '',
        notifyUser: true,
        notifyAdmins: true
      });
      setUserInfo(null);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateDuration = () => {
    if (!formData.expiresAt) return '';
    
    const expiration = new Date(formData.expiresAt);
    const now = new Date();
    const diffTime = expiration.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day';
    if (diffDays < 30) return `${diffDays} days`;
    if (diffDays < 365) return `${Math.round(diffDays / 30)} months`;
    return `${Math.round(diffDays / 365)} year`;
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Assign Temporary Role
        </CardTitle>
        <CardDescription>
          Grant a user temporary elevated permissions with automatic expiration
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* User Selection */}
          <div className="space-y-2">
            <Label htmlFor="userId">User ID or Email</Label>
            <Input
              id="userId"
              type="text"
              value={formData.userId}
              onChange={(e) => handleInputChange('userId', e.target.value)}
              placeholder="Enter user ID or email address"
              disabled={!!initialUserId}
            />
            {userInfo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{userInfo.name} ({userInfo.email})</span>
              </div>
            )}
          </div>

          {/* Current Role Display */}
          {currentRole && (
            <div className="space-y-2">
              <Label>Current Role</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{ROLE_DISPLAY_NAMES[currentRole]}</Badge>
                <span className="text-sm text-muted-foreground">
                  {ROLE_DESCRIPTIONS[currentRole]}
                </span>
              </div>
            </div>
          )}

          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">Temporary Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => handleInputChange('role', value as UserRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(UserRole).map((role) => (
                  <SelectItem key={role} value={role}>
                    <div className="flex flex-col">
                      <span>{ROLE_DISPLAY_NAMES[role]}</span>
                      <span className="text-xs text-muted-foreground">
                        {ROLE_DESCRIPTIONS[role]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Expiration Date */}
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expiration Date</Label>
            <div className="flex items-center gap-2">
              <Input
                id="expiresAt"
                type="date"
                value={formData.expiresAt}
                onChange={(e) => handleInputChange('expiresAt', e.target.value)}
                min={minDateString}
                max={maxDateString}
                className="flex-1"
              />
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            {formData.expiresAt && (
              <p className="text-sm text-muted-foreground">
                Duration: {calculateDuration()}
              </p>
            )}
          </div>

          {/* Justification */}
          <div className="space-y-2">
            <Label htmlFor="justification">Justification</Label>
            <Textarea
              id="justification"
              value={formData.justification}
              onChange={(e) => handleInputChange('justification', e.target.value)}
              placeholder="Explain why this temporary role assignment is needed..."
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {formData.justification.length}/500 characters
            </p>
          </div>

          {/* Notification Options */}
          <div className="space-y-3">
            <Label>Notification Settings</Label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.notifyUser}
                  onChange={(e) => handleInputChange('notifyUser', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Notify user about role assignment</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.notifyAdmins}
                  onChange={(e) => handleInputChange('notifyAdmins', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Notify administrators</span>
              </label>
            </div>
          </div>

          {/* Warning for elevated roles */}
          {(formData.role === UserRole.DEPARTMENT_ADMIN || 
            formData.role === UserRole.INSTITUTION_ADMIN || 
            formData.role === UserRole.SYSTEM_ADMIN) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You are assigning an administrative role. This will grant elevated permissions 
                that should only be given to trusted users.
              </AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Display */}
          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Assigning...' : 'Assign Temporary Role'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}