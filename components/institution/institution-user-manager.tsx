'use client';

import React, { useState, useEffect } from 'react';
import { UserRole } from '@/lib/types/onboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Users, UserPlus, Mail, Settings, Trash2, Edit, MoreHorizontal } from 'lucide-react';

interface InstitutionUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  institutionId: string;
  departmentId?: string;
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  joinedAt: Date;
  lastActiveAt?: Date;
  invitedBy?: string;
}

interface InstitutionUserManagerProps {
  institutionId: string;
  currentUserRole: UserRole;
}

export function InstitutionUserManager({ institutionId, currentUserRole }: InstitutionUserManagerProps) {
  const [users, setUsers] = useState<InstitutionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    role: '',
    status: '',
    departmentId: '',
    search: ''
  });

  // Dialog states
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showBulkInviteDialog, setShowBulkInviteDialog] = useState(false);
  const [showModifyAccessDialog, setShowModifyAccessDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<InstitutionUser | null>(null);

  // Form states
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: UserRole.STUDENT,
    departmentId: '',
    firstName: '',
    lastName: '',
    message: ''
  });

  const [bulkInviteForm, setBulkInviteForm] = useState({
    emails: '',
    role: UserRole.STUDENT,
    departmentId: '',
    message: ''
  });

  const [modifyAccessForm, setModifyAccessForm] = useState({
    role: '',
    departmentId: '',
    status: '',
    reason: ''
  });

  useEffect(() => {
    fetchUsers();
  }, [institutionId, filters]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });

      const response = await fetch(`/api/institutions/${institutionId}/users?${queryParams}`);
      const data = await response.json();

      if (data.success) {
        setUsers(data.data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async () => {
    try {
      const response = await fetch(`/api/institutions/${institutionId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_single',
          ...inviteForm
        })
      });

      const data = await response.json();

      if (data.success) {
        setShowInviteDialog(false);
        setInviteForm({
          email: '',
          role: UserRole.STUDENT,
          departmentId: '',
          firstName: '',
          lastName: '',
          message: ''
        });
        // Show success message
        alert('Invitation sent successfully!');
      } else {
        alert('Failed to send invitation: ' + (data.errors?.[0]?.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      alert('Error sending invitation');
    }
  };

  const handleBulkInvite = async () => {
    try {
      const emails = bulkInviteForm.emails
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.includes('@'))
        .map(email => ({
          email,
          role: bulkInviteForm.role,
          departmentId: bulkInviteForm.departmentId || undefined,
          customMessage: bulkInviteForm.message || undefined
        }));

      const response = await fetch(`/api/institutions/${institutionId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_bulk',
          invitations: emails,
          defaultMessage: bulkInviteForm.message
        })
      });

      const data = await response.json();

      if (data.success) {
        setShowBulkInviteDialog(false);
        setBulkInviteForm({
          emails: '',
          role: UserRole.STUDENT,
          departmentId: '',
          message: ''
        });
        alert(`Sent ${data.data.successful.length} invitations successfully. ${data.data.failed.length} failed.`);
      } else {
        alert('Failed to send bulk invitations');
      }
    } catch (error) {
      console.error('Error sending bulk invitations:', error);
      alert('Error sending bulk invitations');
    }
  };

  const handleModifyAccess = async () => {
    if (!selectedUser) return;

    try {
      const changes: any = {};
      if (modifyAccessForm.role) changes.role = modifyAccessForm.role;
      if (modifyAccessForm.departmentId) changes.departmentId = modifyAccessForm.departmentId;
      if (modifyAccessForm.status) changes.status = modifyAccessForm.status;

      const response = await fetch(`/api/institutions/${institutionId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'modify_access',
          userId: selectedUser.id,
          changes,
          reason: modifyAccessForm.reason
        })
      });

      const data = await response.json();

      if (data.success) {
        setShowModifyAccessDialog(false);
        setSelectedUser(null);
        setModifyAccessForm({ role: '', departmentId: '', status: '', reason: '' });
        fetchUsers(); // Refresh the list
        alert('User access modified successfully!');
      } else {
        alert('Failed to modify user access: ' + (data.errors?.[0]?.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error modifying user access:', error);
      alert('Error modifying user access');
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this user from the institution?')) {
      return;
    }

    try {
      const response = await fetch(`/api/institutions/${institutionId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove_user',
          userId,
          reason: 'Removed by admin'
        })
      });

      const data = await response.json();

      if (data.success) {
        fetchUsers(); // Refresh the list
        alert('User removed successfully!');
      } else {
        alert('Failed to remove user: ' + (data.errors?.[0]?.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Error removing user');
    }
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

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'pending': return 'secondary';
      case 'suspended': return 'destructive';
      case 'inactive': return 'outline';
      default: return 'outline';
    }
  };

  const canManageUser = (userRole: UserRole): boolean => {
    if (currentUserRole === UserRole.SYSTEM_ADMIN) return true;
    if (currentUserRole === UserRole.INSTITUTION_ADMIN) {
      return userRole !== UserRole.SYSTEM_ADMIN;
    }
    if (currentUserRole === UserRole.DEPARTMENT_ADMIN) {
      return [UserRole.STUDENT, UserRole.TEACHER].includes(userRole);
    }
    return false;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground">Manage users, roles, and permissions for your institution</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
          <Button variant="outline" onClick={() => setShowBulkInviteDialog(true)}>
            <Mail className="h-4 w-4 mr-2" />
            Bulk Invite
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search by name or email..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="role-filter">Role</Label>
              <Select value={filters.role} onValueChange={(value) => setFilters({ ...filters, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All roles</SelectItem>
                  {Object.values(UserRole).map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleDisplayName(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={fetchUsers}>
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Institution Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading users...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedUsers.length === users.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedUsers(users.map(u => u.id));
                        } else {
                          setSelectedUsers([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedUsers.includes(user.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedUsers([...selectedUsers, user.id]);
                          } else {
                            setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {user.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getRoleDisplayName(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(user.status)}>
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.joinedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {user.lastActiveAt 
                        ? new Date(user.lastActiveAt).toLocaleDateString()
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell>
                      {canManageUser(user.role) && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setModifyAccessForm({
                                role: user.role,
                                departmentId: user.departmentId || '',
                                status: user.status,
                                reason: ''
                              });
                              setShowModifyAccessDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveUser(user.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite User Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an invitation to join your institution
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={inviteForm.firstName}
                  onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={inviteForm.lastName}
                  onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select value={inviteForm.role} onValueChange={(value) => setInviteForm({ ...inviteForm, role: value as UserRole })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(UserRole).map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleDisplayName(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="message">Personal Message (Optional)</Label>
              <Textarea
                id="message"
                value={inviteForm.message}
                onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                placeholder="Add a personal message to the invitation..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteUser}>
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Invite Dialog */}
      <Dialog open={showBulkInviteDialog} onOpenChange={setShowBulkInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Invite Users</DialogTitle>
            <DialogDescription>
              Send invitations to multiple users at once
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="emails">Email Addresses</Label>
              <Textarea
                id="emails"
                value={bulkInviteForm.emails}
                onChange={(e) => setBulkInviteForm({ ...bulkInviteForm, emails: e.target.value })}
                placeholder="Enter email addresses, one per line..."
                rows={6}
              />
            </div>
            <div>
              <Label htmlFor="bulk-role">Role</Label>
              <Select value={bulkInviteForm.role} onValueChange={(value) => setBulkInviteForm({ ...bulkInviteForm, role: value as UserRole })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(UserRole).map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleDisplayName(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="bulk-message">Default Message (Optional)</Label>
              <Textarea
                id="bulk-message"
                value={bulkInviteForm.message}
                onChange={(e) => setBulkInviteForm({ ...bulkInviteForm, message: e.target.value })}
                placeholder="Add a default message for all invitations..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkInvite}>
              Send Invitations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modify Access Dialog */}
      <Dialog open={showModifyAccessDialog} onOpenChange={setShowModifyAccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify User Access</DialogTitle>
            <DialogDescription>
              Change user role, department, or status
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="font-medium">
                  {selectedUser.firstName} {selectedUser.lastName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedUser.email}
                </div>
              </div>
              <div>
                <Label htmlFor="modify-role">Role</Label>
                <Select value={modifyAccessForm.role} onValueChange={(value) => setModifyAccessForm({ ...modifyAccessForm, role: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select new role" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(UserRole).map((role) => (
                      <SelectItem key={role} value={role}>
                        {getRoleDisplayName(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="modify-status">Status</Label>
                <Select value={modifyAccessForm.status} onValueChange={(value) => setModifyAccessForm({ ...modifyAccessForm, status: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select new status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="modify-reason">Reason for Change</Label>
                <Textarea
                  id="modify-reason"
                  value={modifyAccessForm.reason}
                  onChange={(e) => setModifyAccessForm({ ...modifyAccessForm, reason: e.target.value })}
                  placeholder="Explain why you're making this change..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModifyAccessDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleModifyAccess}>
              Update Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}