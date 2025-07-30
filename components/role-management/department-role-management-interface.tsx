'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  Users, 
  UserPlus, 
  UserMinus,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  History,
  Download
} from 'lucide-react';
import { UserRole, RoleStatus } from '@/lib/types/role-management';

interface DepartmentRoleManagementProps {
  departmentId: string;
  departmentName: string;
  currentUserRole: UserRole;
}

interface DepartmentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: RoleStatus;
  assignedAt: Date;
  assignedBy: string;
  lastActivity: Date;
}

interface RoleRestrictions {
  allowedRoles: UserRole[];
  maxUsersPerRole: Record<UserRole, number>;
  currentCounts: Record<UserRole, number>;
}

interface RoleAssignmentForm {
  userId: string;
  role: UserRole;
  justification: string;
}

export function DepartmentRoleManagementInterface({ 
  departmentId, 
  departmentName, 
  currentUserRole 
}: DepartmentRoleManagementProps) {
  const [users, setUsers] = useState<DepartmentUser[]>([]);
  const [restrictions, setRestrictions] = useState<RoleRestrictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DepartmentUser | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<RoleAssignmentForm>({
    userId: '',
    role: UserRole.STUDENT,
    justification: ''
  });

  useEffect(() => {
    fetchDepartmentData();
  }, [departmentId]);

  const fetchDepartmentData = async () => {
    try {
      setLoading(true);
      
      const [usersResponse, restrictionsResponse] = await Promise.all([
        fetch(`/api/departments/${departmentId}/users`),
        fetch(`/api/departments/${departmentId}/role-restrictions`)
      ]);

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData.data.users);
      }

      if (restrictionsResponse.ok) {
        const restrictionsData = await restrictionsResponse.json();
        setRestrictions(restrictionsData.data);
      }
    } catch (error) {
      console.error('Error fetching department data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    try {
      const response = await fetch(`/api/departments/${departmentId}/roles/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentForm)
      });

      if (response.ok) {
        setShowAssignDialog(false);
        setAssignmentForm({ userId: '', role: UserRole.STUDENT, justification: '' });
        await fetchDepartmentData();
        alert('Role assigned successfully!');
      } else {
        const error = await response.json();
        alert(`Failed to assign role: ${error.message}`);
      }
    } catch (error) {
      console.error('Error assigning role:', error);
      alert('Error assigning role');
    }
  };

  const handleRemoveRole = async (userId: string, role: UserRole, reason: string) => {
    try {
      const response = await fetch(`/api/departments/${departmentId}/roles/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role, reason })
      });

      if (response.ok) {
        setShowRemoveDialog(false);
        setSelectedUser(null);
        await fetchDepartmentData();
        alert('Role removed successfully!');
      } else {
        const error = await response.json();
        alert(`Failed to remove role: ${error.message}`);
      }
    } catch (error) {
      console.error('Error removing role:', error);
      alert('Error removing role');
    }
  };

  const canAssignRole = (role: UserRole): boolean => {
    if (!restrictions) return false;
    
    return restrictions.allowedRoles.includes(role) &&
           restrictions.currentCounts[role] < restrictions.maxUsersPerRole[role];
  };

  const getRoleDisplayName = (role: UserRole): string => {
    const roleNames: Record<UserRole, string> = {
      [UserRole.STUDENT]: 'Student',
      [UserRole.TEACHER]: 'Teacher',
      [UserRole.DEPARTMENT_ADMIN]: 'Department Admin',
      [UserRole.INSTITUTION_ADMIN]: 'Institution Admin',
      [UserRole.SYSTEM_ADMIN]: 'System Admin'
    };
    return roleNames[role] || role;
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case UserRole.STUDENT: return 'default';
      case UserRole.TEACHER: return 'secondary';
      case UserRole.DEPARTMENT_ADMIN: return 'destructive';
      case UserRole.INSTITUTION_ADMIN: return 'outline';
      case UserRole.SYSTEM_ADMIN: return 'outline';
      default: return 'default';
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2">Loading department role management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Role Management</h2>
          <p className="text-muted-foreground">{departmentName} Department</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchDepartmentData}>
            <Shield className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Assign Role
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Department Role</DialogTitle>
                <DialogDescription>
                  Assign a role to a user within your department
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="user-search">User</Label>
                  <Input
                    id="user-search"
                    placeholder="Search for user by name or email..."
                    value={assignmentForm.userId}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, userId: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="role-select">Role</Label>
                  <Select
                    value={assignmentForm.role}
                    onValueChange={(value: UserRole) => setAssignmentForm({ ...assignmentForm, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {restrictions?.allowedRoles.map(role => (
                        <SelectItem 
                          key={role} 
                          value={role}
                          disabled={!canAssignRole(role)}
                        >
                          {getRoleDisplayName(role)}
                          {!canAssignRole(role) && ' (Limit reached)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="justification">Justification</Label>
                  <Textarea
                    id="justification"
                    placeholder="Provide a reason for this role assignment..."
                    value={assignmentForm.justification}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, justification: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAssignRole}>
                  Assign Role
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Role Restrictions Overview */}
      {restrictions && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Department Role Limits
            </CardTitle>
            <CardDescription>
              Current role assignments and limits for your department
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {restrictions.allowedRoles.map(role => (
                <div key={role} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{getRoleDisplayName(role)}</div>
                    <div className="text-sm text-muted-foreground">
                      {restrictions.currentCounts[role] || 0} / {restrictions.maxUsersPerRole[role]}
                    </div>
                  </div>
                  <Badge variant={canAssignRole(role) ? 'default' : 'secondary'}>
                    {canAssignRole(role) ? 'Available' : 'Full'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Select value={roleFilter} onValueChange={(value: UserRole | 'all') => setRoleFilter(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {Object.values(UserRole).map(role => (
                    <SelectItem key={role} value={role}>
                      {getRoleDisplayName(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Department Users ({filteredUsers.length})</CardTitle>
          <CardDescription>
            Manage roles for users in your department
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {getRoleDisplayName(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.status === RoleStatus.ACTIVE ? 'default' : 'secondary'}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{new Date(user.assignedAt).toLocaleDateString()}</div>
                      <div className="text-muted-foreground">by {user.assignedBy}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(user.lastActivity).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setShowRemoveDialog(true);
                        }}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Remove Role Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the {selectedUser && getRoleDisplayName(selectedUser.role)} role from {selectedUser?.name}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="remove-reason">Reason for removal</Label>
              <Textarea
                id="remove-reason"
                placeholder="Provide a reason for removing this role..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (selectedUser) {
                  const reason = (document.getElementById('remove-reason') as HTMLTextAreaElement)?.value || '';
                  handleRemoveRole(selectedUser.id, selectedUser.role, reason);
                }
              }}
            >
              Remove Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}