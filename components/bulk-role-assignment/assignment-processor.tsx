'use client';

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  Users,
  Shield,
  Calendar,
  FileText,
  Download,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BulkRoleAssignment,
  BulkAssignmentResult,
  BulkAssignmentStatus,
  ValidationResult,
  SelectedUser,
  UserRole,
  AssignmentError,
  RoleAssignmentConflict,
  RollbackResult
} from '@/lib/types/bulk-role-assignment';

interface AssignmentProcessorProps {
  selectedUsers: SelectedUser[];
  targetRole: UserRole;
  institutionId: string;
  assignedBy: string;
  onValidate: (assignment: BulkRoleAssignment) => Promise<ValidationResult>;
  onProcess: (assignment: BulkRoleAssignment) => Promise<BulkAssignmentResult>;
  onGetStatus: (assignmentId: string) => Promise<BulkAssignmentStatus>;
  onRollback: (assignmentId: string, reason: string) => Promise<RollbackResult>;
  onComplete?: (result: BulkAssignmentResult) => void;
}

export function AssignmentProcessor({
  selectedUsers,
  targetRole,
  institutionId,
  assignedBy,
  onValidate,
  onProcess,
  onGetStatus,
  onRollback,
  onComplete
}: AssignmentProcessorProps) {
  const [assignmentName, setAssignmentName] = useState('');
  const [justification, setJustification] = useState('');
  const [isTemporary, setIsTemporary] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date>();
  const [sendNotifications, setSendNotifications] = useState(true);
  const [skipConflicts, setSkipConflicts] = useState(false);
  
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentResult, setCurrentResult] = useState<BulkAssignmentResult | null>(null);
  const [currentStatus, setCurrentStatus] = useState<BulkAssignmentStatus | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');

  // Auto-generate assignment name
  useEffect(() => {
    if (!assignmentName) {
      const roleDisplay = targetRole.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      const timestamp = new Date().toLocaleDateString();
      setAssignmentName(`Bulk ${roleDisplay} Assignment - ${timestamp}`);
    }
  }, [targetRole, assignmentName]);

  // Poll for status updates during processing
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (processing && currentResult?.assignmentId) {
      interval = setInterval(async () => {
        try {
          const status = await onGetStatus(currentResult.assignmentId);
          setCurrentStatus(status);
          
          if (status.status === 'completed' || status.status === 'failed') {
            setProcessing(false);
            if (onComplete && currentResult) {
              onComplete(currentResult);
            }
          }
        } catch (error) {
          console.error('Failed to get status:', error);
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [processing, currentResult?.assignmentId, onGetStatus, onComplete, currentResult]);

  const handleValidate = async () => {
    if (selectedUsers.length === 0) return;

    setValidating(true);
    try {
      const assignment: BulkRoleAssignment = {
        userIds: selectedUsers.map(u => u.id),
        role: targetRole,
        assignedBy,
        institutionId,
        assignmentName,
        justification,
        isTemporary,
        expiresAt,
        sendNotifications,
        validateOnly: true
      };

      const result = await onValidate(assignment);
      setValidationResult(result);
    } catch (error) {
      console.error('Validation failed:', error);
      setValidationResult({
        isValid: false,
        errors: [{
          userId: '',
          field: 'system',
          errorCode: 'VALIDATION_ERROR',
          errorMessage: error instanceof Error ? error.message : 'Validation failed',
          currentValue: null
        }],
        warnings: [],
        affectedUsers: 0,
        estimatedDuration: 0
      });
    } finally {
      setValidating(false);
    }
  };

  const handleProcess = async () => {
    if (!validationResult?.isValid || selectedUsers.length === 0) return;

    const assignment: BulkRoleAssignment = {
      userIds: selectedUsers.map(u => u.id),
      role: targetRole,
      assignedBy,
      institutionId,
      assignmentName,
      justification,
      isTemporary,
      expiresAt,
      sendNotifications,
      validateOnly: false
    };

    setProcessing(true);
    setShowConfirmDialog(false);
    
    try {
      const result = await onProcess(assignment);
      setCurrentResult(result);
      
      // Start polling for status
      const status = await onGetStatus(result.assignmentId);
      setCurrentStatus(status);
      
    } catch (error) {
      console.error('Processing failed:', error);
      setProcessing(false);
    }
  };

  const handleRollback = async () => {
    if (!currentResult?.assignmentId || !rollbackReason.trim()) return;

    try {
      const result = await onRollback(currentResult.assignmentId, rollbackReason);
      
      if (result.success) {
        // Refresh status
        const status = await onGetStatus(currentResult.assignmentId);
        setCurrentStatus(status);
      }
      
      setShowRollbackDialog(false);
      setRollbackReason('');
    } catch (error) {
      console.error('Rollback failed:', error);
    }
  };

  const canProcess = validationResult?.isValid && !processing && selectedUsers.length > 0;
  const hasErrors = validationResult && validationResult.errors.length > 0;
  const hasWarnings = validationResult && validationResult.warnings.length > 0;

  const getStatusColor = (status: string) => {
    const colors = {
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
      validating: 'bg-yellow-100 text-yellow-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Assignment Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Assignment Configuration
          </CardTitle>
          <CardDescription>
            Configure the bulk role assignment settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Assignment Name</label>
            <input
              type="text"
              value={assignmentName}
              onChange={(e) => setAssignmentName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter assignment name"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Justification</label>
            <Textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Provide a reason for this bulk role assignment..."
              className="min-h-20"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Temporary Assignment</label>
                <p className="text-xs text-gray-500">Role will expire automatically</p>
              </div>
              <Switch
                checked={isTemporary}
                onCheckedChange={setIsTemporary}
              />
            </div>

            {isTemporary && (
              <div>
                <label className="text-sm font-medium mb-2 block">Expires At</label>
                <DatePicker
                  date={expiresAt}
                  onDateChange={setExpiresAt}
                  placeholder="Select expiration date"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Send Notifications</label>
                <p className="text-xs text-gray-500">Notify users of role changes</p>
              </div>
              <Switch
                checked={sendNotifications}
                onCheckedChange={setSendNotifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Skip Conflicts</label>
                <p className="text-xs text-gray-500">Continue despite policy conflicts</p>
              </div>
              <Switch
                checked={skipConflicts}
                onCheckedChange={setSkipConflicts}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assignment Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Assignment Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{selectedUsers.length}</div>
              <div className="text-sm text-gray-500">Selected Users</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {targetRole.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </div>
              <div className="text-sm text-gray-500">Target Role</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {validationResult?.estimatedDuration || 0}s
              </div>
              <div className="text-sm text-gray-500">Est. Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {isTemporary ? 'Yes' : 'No'}
              </div>
              <div className="text-sm text-gray-500">Temporary</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Results */}
      {validationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {validationResult.isValid ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Validation Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasErrors && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Validation Errors ({validationResult.errors.length})</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="h-32 mt-2">
                    <div className="space-y-2">
                      {validationResult.errors.map((error, index) => (
                        <div key={index} className="text-sm">
                          <strong>{error.userId || 'System'}:</strong> {error.errorMessage}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}

            {hasWarnings && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warnings ({validationResult.warnings.length})</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="h-32 mt-2">
                    <div className="space-y-2">
                      {validationResult.warnings.map((warning, index) => (
                        <div key={index} className="text-sm">
                          <strong>{warning.userId}:</strong> {warning.warningMessage}
                          <Badge variant="outline" className="ml-2">
                            {warning.impact}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}

            {validationResult.isValid && !hasWarnings && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Validation Successful</AlertTitle>
                <AlertDescription>
                  All {validationResult.affectedUsers} users can be assigned the {targetRole} role.
                  Estimated processing time: {validationResult.estimatedDuration} seconds.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Processing Status */}
      {currentStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Processing Status
              <Badge className={getStatusColor(currentStatus.status)}>
                {currentStatus.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span>{Math.round(currentStatus.progress)}%</span>
              </div>
              <Progress value={currentStatus.progress} className="w-full" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold">{currentStatus.currentBatch}</div>
                <div className="text-xs text-gray-500">Current Batch</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{currentStatus.totalBatches}</div>
                <div className="text-xs text-gray-500">Total Batches</div>
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {currentStatus.estimatedCompletion 
                    ? new Date(currentStatus.estimatedCompletion).toLocaleTimeString()
                    : 'N/A'
                  }
                </div>
                <div className="text-xs text-gray-500">Est. Completion</div>
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {currentStatus.errors.length}
                </div>
                <div className="text-xs text-gray-500">Errors</div>
              </div>
            </div>

            {currentStatus.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Processing Errors</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="h-24 mt-2">
                    <div className="space-y-1">
                      {currentStatus.errors.map((error, index) => (
                        <div key={index} className="text-sm">
                          {error.errorMessage}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Final Results */}
      {currentResult && currentStatus?.status === 'completed' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Assignment Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {currentResult.successfulAssignments}
                </div>
                <div className="text-sm text-gray-500">Successful</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {currentResult.failedAssignments}
                </div>
                <div className="text-sm text-gray-500">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {currentResult.skippedAssignments}
                </div>
                <div className="text-sm text-gray-500">Skipped</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round(currentResult.duration / 1000)}s
                </div>
                <div className="text-sm text-gray-500">Duration</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowRollbackDialog(true)}
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Rollback
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export Report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={handleValidate}
          disabled={validating || selectedUsers.length === 0}
          className="flex items-center gap-2"
        >
          {validating ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Validate Assignment
        </Button>

        <Button
          onClick={() => setShowConfirmDialog(true)}
          disabled={!canProcess}
          className="flex items-center gap-2"
        >
          <Play className="h-4 w-4" />
          Process Assignment
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Role Assignment</DialogTitle>
            <DialogDescription>
              You are about to assign the {targetRole} role to {selectedUsers.length} users.
              This action cannot be easily undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 rounded-lg">
              <h4 className="font-medium mb-2">Assignment Details:</h4>
              <ul className="text-sm space-y-1">
                <li>• Users: {selectedUsers.length}</li>
                <li>• Target Role: {targetRole}</li>
                <li>• Temporary: {isTemporary ? 'Yes' : 'No'}</li>
                {isTemporary && expiresAt && (
                  <li>• Expires: {expiresAt.toLocaleDateString()}</li>
                )}
                <li>• Notifications: {sendNotifications ? 'Yes' : 'No'}</li>
              </ul>
            </div>

            {hasWarnings && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warnings Found</AlertTitle>
                <AlertDescription>
                  There are {validationResult?.warnings.length} warnings. 
                  Review them carefully before proceeding.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleProcess}>
              Confirm Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Dialog */}
      <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback Assignment</DialogTitle>
            <DialogDescription>
              This will revert all successful role assignments from this batch.
              Please provide a reason for the rollback.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Textarea
              value={rollbackReason}
              onChange={(e) => setRollbackReason(e.target.value)}
              placeholder="Enter reason for rollback..."
              className="min-h-20"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRollbackDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRollback}
              disabled={!rollbackReason.trim()}
              variant="destructive"
            >
              Confirm Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}