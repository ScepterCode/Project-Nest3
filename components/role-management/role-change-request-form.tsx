'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { UserRole } from '@/lib/types/role-management';

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
  scope: string;
}

interface RoleChangePreview {
  currentPermissions: Permission[];
  newPermissions: Permission[];
  addedPermissions: Permission[];
  removedPermissions: Permission[];
  requiresApproval: boolean;
  approvalReason: string;
}

interface RoleChangeRequestFormProps {
  userId: string;
  currentRole: UserRole;
  institutionId: string;
  departmentId?: string;
  onSubmit: (request: RoleChangeRequestData) => Promise<void>;
  onCancel: () => void;
  className?: string;
}

export interface RoleChangeRequestData {
  userId: string;
  currentRole: UserRole;
  newRole: UserRole;
  reason: string;
  institutionId: string;
  departmentId?: string;
  metadata?: Record<string, any>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.DEPARTMENT_ADMIN]: 'Department Administrator',
  [UserRole.INSTITUTION_ADMIN]: 'Institution Administrator',
  [UserRole.SYSTEM_ADMIN]: 'System Administrator'
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Access to enroll in classes and view content',
  [UserRole.TEACHER]: 'Create and manage classes, grade students',
  [UserRole.DEPARTMENT_ADMIN]: 'Manage department users and settings',
  [UserRole.INSTITUTION_ADMIN]: 'Manage institution-wide settings and users',
  [UserRole.SYSTEM_ADMIN]: 'Full system administration access'
};

export function RoleChangeRequestForm({
  userId,
  currentRole,
  institutionId,
  departmentId,
  onSubmit,
  onCancel,
  className
}: RoleChangeRequestFormProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole | ''>('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<RoleChangePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available roles (excluding current role and system admin for non-system admins)
  const availableRoles = Object.values(UserRole).filter(role => {
    if (role === currentRole) return false;
    if (role === UserRole.SYSTEM_ADMIN && currentRole !== UserRole.SYSTEM_ADMIN) return false;
    return true;
  });

  // Load role change preview when role is selected
  useEffect(() => {
    if (selectedRole && selectedRole !== currentRole) {
      loadRoleChangePreview(selectedRole);
    } else {
      setPreview(null);
    }
  }, [selectedRole, currentRole]);

  const loadRoleChangePreview = async (newRole: UserRole) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/roles/change-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          currentRole,
          newRole,
          institutionId,
          departmentId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to load role change preview');
      }

      const previewData = await response.json();
      setPreview(previewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedRole || !reason.trim()) {
      setError('Please select a role and provide a reason for the change');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await onSubmit({
        userId,
        currentRole,
        newRole: selectedRole,
        reason: reason.trim(),
        institutionId,
        departmentId,
        metadata: {
          preview: preview ? {
            requiresApproval: preview.requiresApproval,
            approvalReason: preview.approvalReason
          } : undefined
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit role change request');
    } finally {
      setIsLoading(false);
    }
  };

  const isRoleUpgrade = (newRole: UserRole): boolean => {
    const roleHierarchy = {
      [UserRole.STUDENT]: 0,
      [UserRole.TEACHER]: 1,
      [UserRole.DEPARTMENT_ADMIN]: 2,
      [UserRole.INSTITUTION_ADMIN]: 3,
      [UserRole.SYSTEM_ADMIN]: 4
    };
    
    return roleHierarchy[newRole] > roleHierarchy[currentRole];
  };

  const renderPermissionList = (permissions: Permission[], title: string, variant: 'default' | 'added' | 'removed') => {
    if (permissions.length === 0) return null;

    const badgeVariant = variant === 'added' ? 'default' : variant === 'removed' ? 'destructive' : 'secondary';

    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <div className="flex flex-wrap gap-1">
          {permissions.map(permission => (
            <Badge key={permission.id} variant={badgeVariant} className="text-xs">
              {permission.description}
            </Badge>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Request Role Change</CardTitle>
        <CardDescription>
          Request a change from your current role to a different role. Some changes may require approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Role Display */}
          <div className="space-y-2">
            <Label>Current Role</Label>
            <div className="p-3 bg-muted rounded-md">
              <div className="font-medium">{ROLE_LABELS[currentRole]}</div>
              <div className="text-sm text-muted-foreground">
                {ROLE_DESCRIPTIONS[currentRole]}
              </div>
            </div>
          </div>

          {/* New Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="newRole">New Role *</Label>
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select the role you want to change to" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map(role => (
                  <SelectItem key={role} value={role}>
                    <div>
                      <div className="font-medium">{ROLE_LABELS[role]}</div>
                      <div className="text-xs text-muted-foreground">
                        {ROLE_DESCRIPTIONS[role]}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason for Change */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Role Change *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain why you need this role change. Include details about your new responsibilities or position."
              rows={4}
              required
            />
            <div className="text-xs text-muted-foreground">
              Provide a clear justification for the role change. This will be reviewed by administrators.
            </div>
          </div>

          {/* Role Change Preview */}
          {preview && (
            <div className="space-y-4">
              <Separator />
              <div>
                <h3 className="text-lg font-medium mb-4">Role Change Impact Preview</h3>
                
                {/* Approval Status */}
                {preview.requiresApproval ? (
                  <Alert className="mb-4">
                    <AlertDescription>
                      <strong>Approval Required:</strong> {preview.approvalReason}
                      {isRoleUpgrade(selectedRole as UserRole) && (
                        <span className="block mt-1">
                          This is a role upgrade and will require administrator approval.
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="mb-4">
                    <AlertDescription>
                      <strong>Automatic Processing:</strong> This role change can be processed immediately.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Permission Changes */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    {renderPermissionList(
                      preview.addedPermissions,
                      'New Permissions',
                      'added'
                    )}
                  </div>
                  <div className="space-y-4">
                    {renderPermissionList(
                      preview.removedPermissions,
                      'Removed Permissions',
                      'removed'
                    )}
                  </div>
                </div>

                {/* All New Role Permissions */}
                {preview.newPermissions.length > 0 && (
                  <div className="mt-4">
                    {renderPermissionList(
                      preview.newPermissions,
                      'All Permissions for New Role',
                      'default'
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Form Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={!selectedRole || !reason.trim() || isLoading}
              className="flex-1"
            >
              {isLoading ? 'Processing...' : 'Submit Role Change Request'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}