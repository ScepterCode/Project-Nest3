'use client';

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Eye, 
  EyeOff,
  Filter,
  Download,
  RefreshCw,
  User,
  Shield,
  Clock,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
  RoleAssignmentConflict,
  ConflictResolutionStatus,
  UserRole,
  SelectedUser
} from '@/lib/types/bulk-role-assignment';

interface ConflictResolverProps {
  conflicts: RoleAssignmentConflict[];
  users: SelectedUser[];
  onResolveConflict: (conflictId: string, resolution: ConflictResolution) => Promise<void>;
  onBulkResolve: (conflictIds: string[], resolution: BulkConflictResolution) => Promise<void>;
  onRefreshConflicts: () => Promise<void>;
  loading?: boolean;
}

interface ConflictResolution {
  action: 'approve' | 'reject' | 'modify' | 'ignore';
  newRole?: UserRole;
  reason: string;
  requiresApproval?: boolean;
}

interface BulkConflictResolution {
  action: 'approve_all' | 'reject_all' | 'ignore_all';
  reason: string;
}

export function ConflictResolver({
  conflicts,
  users,
  onResolveConflict,
  onBulkResolve,
  onRefreshConflicts,
  loading = false
}: ConflictResolverProps) {
  const [selectedConflicts, setSelectedConflicts] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<ConflictResolutionStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<RoleAssignmentConflict | null>(null);
  const [resolutionAction, setResolutionAction] = useState<'approve' | 'reject' | 'modify' | 'ignore'>('approve');
  const [resolutionReason, setResolutionReason] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkAction, setBulkAction] = useState<'approve_all' | 'reject_all' | 'ignore_all'>('approve_all');
  const [bulkReason, setBulkReason] = useState('');

  // Filter conflicts based on selected filters
  const filteredConflicts = conflicts.filter(conflict => {
    if (filterStatus !== 'all' && conflict.resolutionStatus !== filterStatus) {
      return false;
    }
    if (filterType !== 'all' && conflict.conflictType !== filterType) {
      return false;
    }
    return true;
  });

  // Get unique conflict types for filter
  const conflictTypes = Array.from(new Set(conflicts.map(c => c.conflictType)));

  // Statistics
  const stats = {
    total: conflicts.length,
    unresolved: conflicts.filter(c => c.resolutionStatus === 'unresolved').length,
    resolved: conflicts.filter(c => c.resolutionStatus === 'resolved').length,
    ignored: conflicts.filter(c => c.resolutionStatus === 'ignored').length
  };

  const handleConflictSelect = (conflictId: string, checked: boolean) => {
    if (checked) {
      setSelectedConflicts([...selectedConflicts, conflictId]);
    } else {
      setSelectedConflicts(selectedConflicts.filter(id => id !== conflictId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedConflicts(filteredConflicts.map(c => c.id));
    } else {
      setSelectedConflicts([]);
    }
  };

  const handleResolveConflict = async () => {
    if (!currentConflict) return;

    const resolution: ConflictResolution = {
      action: resolutionAction,
      reason: resolutionReason,
      newRole: resolutionAction === 'modify' ? newRole : undefined
    };

    try {
      await onResolveConflict(currentConflict.id, resolution);
      setShowResolutionDialog(false);
      setCurrentConflict(null);
      setResolutionReason('');
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  };

  const handleBulkResolve = async () => {
    if (selectedConflicts.length === 0) return;

    const resolution: BulkConflictResolution = {
      action: bulkAction,
      reason: bulkReason
    };

    try {
      await onBulkResolve(selectedConflicts, resolution);
      setShowBulkDialog(false);
      setSelectedConflicts([]);
      setBulkReason('');
    } catch (error) {
      console.error('Failed to bulk resolve conflicts:', error);
    }
  };

  const openResolutionDialog = (conflict: RoleAssignmentConflict) => {
    setCurrentConflict(conflict);
    setResolutionAction('approve');
    setResolutionReason('');
    setNewRole(conflict.targetRole);
    setShowResolutionDialog(true);
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
  };

  const getUserEmail = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.email || 'Unknown Email';
  };

  const getConflictTypeColor = (type: string) => {
    const colors = {
      'policy_violation': 'bg-red-100 text-red-800',
      'department_restriction': 'bg-yellow-100 text-yellow-800',
      'approval_required': 'bg-blue-100 text-blue-800',
      'role_transition': 'bg-purple-100 text-purple-800',
      'temporary_limit': 'bg-orange-100 text-orange-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: ConflictResolutionStatus) => {
    const colors = {
      unresolved: 'bg-yellow-100 text-yellow-800',
      resolved: 'bg-green-100 text-green-800',
      ignored: 'bg-gray-100 text-gray-800'
    };
    return colors[status];
  };

  const getStatusIcon = (status: ConflictResolutionStatus) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'ignored':
        return <EyeOff className="h-4 w-4 text-gray-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-500">Total Conflicts</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.unresolved}</div>
              <div className="text-sm text-gray-500">Unresolved</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
              <div className="text-sm text-gray-500">Resolved</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{stats.ignored}</div>
              <div className="text-sm text-gray-500">Ignored</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Conflict Resolution
            {selectedConflicts.length > 0 && (
              <Badge variant="secondary">
                {selectedConflicts.length} selected
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Review and resolve role assignment conflicts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex gap-2 flex-1">
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as ConflictResolutionStatus | 'all')}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unresolved">Unresolved</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="ignored">Ignored</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {conflictTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onRefreshConflicts}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

              {selectedConflicts.length > 0 && (
                <Button
                  onClick={() => setShowBulkDialog(true)}
                  className="flex items-center gap-2"
                >
                  <Shield className="h-4 w-4" />
                  Bulk Resolve ({selectedConflicts.length})
                </Button>
              )}

              <Button
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          {filteredConflicts.length === 0 ? (
            <div className="text-center py-8">
              {conflicts.length === 0 ? (
                <div>
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Conflicts Found</h3>
                  <p className="text-gray-500">All role assignments can proceed without conflicts.</p>
                </div>
              ) : (
                <div>
                  <Filter className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Matching Conflicts</h3>
                  <p className="text-gray-500">Try adjusting your filters to see more conflicts.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select All */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  checked={selectedConflicts.length === filteredConflicts.length}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-sm font-medium">
                  Select All ({filteredConflicts.length} conflicts)
                </span>
              </div>

              {/* Conflicts Table */}
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Conflict Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Current Role</TableHead>
                      <TableHead>Target Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredConflicts.map((conflict) => (
                      <TableRow key={conflict.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedConflicts.includes(conflict.id)}
                            onCheckedChange={(checked) => handleConflictSelect(conflict.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{getUserName(conflict.userId)}</div>
                            <div className="text-sm text-gray-500">{getUserEmail(conflict.userId)}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getConflictTypeColor(conflict.conflictType)}>
                            {conflict.conflictType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs">
                            <p className="text-sm truncate" title={conflict.conflictDescription}>
                              {conflict.conflictDescription}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {conflict.currentRole?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {conflict.targetRole.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(conflict.resolutionStatus)}
                            <Badge className={getStatusColor(conflict.resolutionStatus)}>
                              {conflict.resolutionStatus.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {conflict.resolutionStatus === 'unresolved' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openResolutionDialog(conflict)}
                            >
                              Resolve
                            </Button>
                          ) : (
                            <div className="text-sm text-gray-500">
                              {conflict.resolvedAt && (
                                <div>
                                  Resolved {new Date(conflict.resolvedAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Conflict Resolution Dialog */}
      <Dialog open={showResolutionDialog} onOpenChange={setShowResolutionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resolve Conflict</DialogTitle>
            <DialogDescription>
              Choose how to resolve this role assignment conflict
            </DialogDescription>
          </DialogHeader>

          {currentConflict && (
            <div className="space-y-4">
              {/* Conflict Details */}
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div><strong>User:</strong> {getUserName(currentConflict.userId)}</div>
                    <div><strong>Email:</strong> {getUserEmail(currentConflict.userId)}</div>
                    <div><strong>Conflict Type:</strong> 
                      <Badge className={`ml-2 ${getConflictTypeColor(currentConflict.conflictType)}`}>
                        {currentConflict.conflictType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Badge>
                    </div>
                    <div><strong>Description:</strong> {currentConflict.conflictDescription}</div>
                    <div><strong>Current Role:</strong> {currentConflict.currentRole || 'N/A'}</div>
                    <div><strong>Target Role:</strong> {currentConflict.targetRole}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Resolution Options */}
              <div>
                <label className="text-sm font-medium mb-2 block">Resolution Action</label>
                <Select value={resolutionAction} onValueChange={(value) => setResolutionAction(value as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve">Approve - Proceed with assignment</SelectItem>
                    <SelectItem value="reject">Reject - Skip this user</SelectItem>
                    <SelectItem value="modify">Modify - Assign different role</SelectItem>
                    <SelectItem value="ignore">Ignore - Mark as resolved without action</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {resolutionAction === 'modify' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">New Role</label>
                  <Select value={newRole} onValueChange={(value) => setNewRole(value as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="teacher">Teacher</SelectItem>
                      <SelectItem value="department_admin">Department Admin</SelectItem>
                      <SelectItem value="institution_admin">Institution Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-2 block">Resolution Reason</label>
                <Textarea
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  placeholder="Provide a reason for this resolution..."
                  className="min-h-20"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolutionDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleResolveConflict}
              disabled={!resolutionReason.trim()}
            >
              Resolve Conflict
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Resolution Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Resolve Conflicts</DialogTitle>
            <DialogDescription>
              Apply the same resolution to {selectedConflicts.length} selected conflicts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Bulk Action</label>
              <Select value={bulkAction} onValueChange={(value) => setBulkAction(value as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve_all">Approve All - Proceed with all assignments</SelectItem>
                  <SelectItem value="reject_all">Reject All - Skip all selected users</SelectItem>
                  <SelectItem value="ignore_all">Ignore All - Mark all as resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Reason</label>
              <Textarea
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="Provide a reason for this bulk resolution..."
                className="min-h-20"
              />
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Bulk Resolution Warning</AlertTitle>
              <AlertDescription>
                This action will apply the same resolution to all {selectedConflicts.length} selected conflicts.
                This cannot be undone.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBulkResolve}
              disabled={!bulkReason.trim()}
            >
              Apply Bulk Resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}