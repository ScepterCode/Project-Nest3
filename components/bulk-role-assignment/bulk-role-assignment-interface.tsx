'use client';

import React, { useState, useEffect } from 'react';
import { Users, Shield, AlertTriangle, CheckCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { UserSelectionInterface } from './user-selection-interface';
import { AssignmentProcessor } from './assignment-processor';
import { ConflictResolver } from './conflict-resolver';
import { 
  SelectedUser,
  UserRole,
  UserSelectionCriteria,
  UserSelectionResult,
  BulkRoleAssignment,
  ValidationResult,
  BulkAssignmentResult,
  BulkAssignmentStatus,
  RoleAssignmentConflict
} from '@/lib/types/bulk-role-assignment';
import { useAuth } from '@/contexts/auth-context';

interface Department {
  id: string;
  name: string;
}

export function BulkRoleAssignmentInterface() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<'select' | 'configure' | 'conflicts'>('select');
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [targetRole, setTargetRole] = useState<UserRole>('student');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [conflicts, setConflicts] = useState<RoleAssignmentConflict[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Available roles based on user permissions
  const getAvailableRoles = (): UserRole[] => {
    if (!user) return [];
    
    switch (user.role) {
      case 'institution_admin':
        return ['student', 'teacher', 'department_admin'];
      case 'department_admin':
        return ['student', 'teacher'];
      default:
        return [];
    }
  };

  // Load departments on component mount
  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const response = await fetch('/api/departments');
      if (response.ok) {
        const data = await response.json();
        setDepartments(data.departments || []);
      }
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  };

  const handleSearchUsers = async (criteria: UserSelectionCriteria): Promise<UserSelectionResult> => {
    try {
      const response = await fetch('/api/bulk-role-assignment/users/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(criteria),
      });

      if (!response.ok) {
        throw new Error('Failed to search users');
      }

      return await response.json();
    } catch (error) {
      console.error('User search failed:', error);
      throw error;
    }
  };

  const handleValidateAssignment = async (assignment: BulkRoleAssignment): Promise<ValidationResult> => {
    try {
      setLoading(true);
      const response = await fetch('/api/bulk-role-assignment/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assignment),
      });

      if (!response.ok) {
        throw new Error('Validation failed');
      }

      const result = await response.json();
      setValidationResult(result);
      return result;
    } catch (error) {
      console.error('Validation failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleProcessAssignment = async (assignment: BulkRoleAssignment): Promise<BulkAssignmentResult> => {
    try {
      setLoading(true);
      const response = await fetch('/api/bulk-role-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assignment),
      });

      if (!response.ok) {
        throw new Error('Assignment processing failed');
      }

      const result = await response.json();
      
      // If there are conflicts, show the conflicts tab
      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setCurrentStep('conflicts');
      }

      return result;
    } catch (error) {
      console.error('Assignment processing failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleGetAssignmentStatus = async (assignmentId: string): Promise<BulkAssignmentStatus> => {
    try {
      const response = await fetch(`/api/bulk-role-assignment/status/${assignmentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to get assignment status');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get assignment status:', error);
      throw error;
    }
  };

  const handleRollbackAssignment = async (assignmentId: string, reason: string) => {
    try {
      const response = await fetch('/api/bulk-role-assignment/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assignmentId, reason }),
      });

      if (!response.ok) {
        throw new Error('Rollback failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  };

  const handleResolveConflict = async (conflictId: string, resolution: any) => {
    // Implementation for resolving individual conflicts
    console.log('Resolving conflict:', conflictId, resolution);
  };

  const handleBulkResolveConflicts = async (conflictIds: string[], resolution: any) => {
    // Implementation for bulk conflict resolution
    console.log('Bulk resolving conflicts:', conflictIds, resolution);
  };

  const handleRefreshConflicts = async () => {
    // Implementation for refreshing conflicts
    console.log('Refreshing conflicts');
  };

  const canProceedToConfiguration = selectedUsers.length > 0 && targetRole;
  const canProceedToConflicts = validationResult?.isValid && conflicts.length > 0;

  const getStepStatus = (step: string) => {
    switch (step) {
      case 'select':
        return selectedUsers.length > 0 ? 'completed' : 'current';
      case 'configure':
        return currentStep === 'configure' ? 'current' : 
               selectedUsers.length > 0 ? 'available' : 'disabled';
      case 'conflicts':
        return currentStep === 'conflicts' ? 'current' :
               conflicts.length > 0 ? 'available' : 'disabled';
      default:
        return 'disabled';
    }
  };

  const getStepIcon = (step: string, status: string) => {
    if (status === 'completed') {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    
    switch (step) {
      case 'select':
        return <Users className="h-5 w-5" />;
      case 'configure':
        return <Settings className="h-5 w-5" />;
      case 'conflicts':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <Shield className="h-5 w-5" />;
    }
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Bulk Role Assignment Process</CardTitle>
          <CardDescription>
            Follow these steps to assign roles to multiple users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {[
              { key: 'select', label: 'Select Users', description: `${selectedUsers.length} selected` },
              { key: 'configure', label: 'Configure Assignment', description: targetRole ? `Target: ${targetRole}` : 'Not configured' },
              { key: 'conflicts', label: 'Resolve Conflicts', description: `${conflicts.length} conflicts` }
            ].map((step, index) => {
              const status = getStepStatus(step.key);
              const isActive = currentStep === step.key;
              const isCompleted = status === 'completed';
              const isDisabled = status === 'disabled';
              
              return (
                <div key={step.key} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <Button
                      variant={isActive ? 'default' : isCompleted ? 'secondary' : 'outline'}
                      size="lg"
                      className={`w-12 h-12 rounded-full p-0 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => !isDisabled && setCurrentStep(step.key as any)}
                      disabled={isDisabled}
                    >
                      {getStepIcon(step.key, status)}
                    </Button>
                    <div className="mt-2 text-center">
                      <div className={`text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-900'}`}>
                        {step.label}
                      </div>
                      <div className="text-xs text-gray-500">
                        {step.description}
                      </div>
                    </div>
                  </div>
                  {index < 2 && (
                    <div className={`flex-1 h-px mx-4 ${isCompleted ? 'bg-green-300' : 'bg-gray-300'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Target Role Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Target Role Configuration
          </CardTitle>
          <CardDescription>
            Select the role to assign to the selected users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Target Role</label>
              <Select value={targetRole} onValueChange={(value) => setTargetRole(value as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target role" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableRoles().map(role => (
                    <SelectItem key={role} value={role}>
                      {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{selectedUsers.length}</div>
              <div className="text-sm text-gray-500">Users Selected</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={currentStep} onValueChange={(value) => setCurrentStep(value as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="select" disabled={getStepStatus('select') === 'disabled'}>
            <Users className="h-4 w-4 mr-2" />
            Select Users
            {selectedUsers.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedUsers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="configure" disabled={!canProceedToConfiguration}>
            <Settings className="h-4 w-4 mr-2" />
            Configure Assignment
          </TabsTrigger>
          <TabsTrigger value="conflicts" disabled={!canProceedToConflicts}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Resolve Conflicts
            {conflicts.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {conflicts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="select" className="mt-6">
          <UserSelectionInterface
            institutionId={user.institution_id}
            onSelectionChange={setSelectedUsers}
            onSearchUsers={handleSearchUsers}
            initialSelection={selectedUsers}
            departments={departments}
            excludeRoles={user.role === 'department_admin' ? ['institution_admin'] : []}
          />
        </TabsContent>

        <TabsContent value="configure" className="mt-6">
          <AssignmentProcessor
            selectedUsers={selectedUsers}
            targetRole={targetRole}
            institutionId={user.institution_id}
            assignedBy={user.id}
            onValidate={handleValidateAssignment}
            onProcess={handleProcessAssignment}
            onGetStatus={handleGetAssignmentStatus}
            onRollback={handleRollbackAssignment}
            onComplete={(result) => {
              if (result.conflicts.length > 0) {
                setConflicts(result.conflicts);
                setCurrentStep('conflicts');
              }
            }}
          />
        </TabsContent>

        <TabsContent value="conflicts" className="mt-6">
          <ConflictResolver
            conflicts={conflicts}
            users={selectedUsers}
            onResolveConflict={handleResolveConflict}
            onBulkResolve={handleBulkResolveConflicts}
            onRefreshConflicts={handleRefreshConflicts}
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      {/* Navigation Actions */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => {
            if (currentStep === 'configure') setCurrentStep('select');
            if (currentStep === 'conflicts') setCurrentStep('configure');
          }}
          disabled={currentStep === 'select'}
        >
          Previous Step
        </Button>
        
        <Button
          onClick={() => {
            if (currentStep === 'select' && canProceedToConfiguration) {
              setCurrentStep('configure');
            } else if (currentStep === 'configure' && canProceedToConflicts) {
              setCurrentStep('conflicts');
            }
          }}
          disabled={
            (currentStep === 'select' && !canProceedToConfiguration) ||
            (currentStep === 'configure' && !canProceedToConflicts) ||
            currentStep === 'conflicts'
          }
        >
          {currentStep === 'select' ? 'Configure Assignment' : 
           currentStep === 'configure' ? 'Review Conflicts' : 
           'Complete'}
        </Button>
      </div>
    </div>
  );
}