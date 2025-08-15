'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Users, CheckSquare, Square, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  UserSelectionCriteria, 
  SelectedUser, 
  UserRole,
  UserSelectionResult 
} from '@/lib/types/bulk-role-assignment';

interface UserSelectionInterfaceProps {
  institutionId: string;
  onSelectionChange: (selectedUsers: SelectedUser[]) => void;
  onSearchUsers: (criteria: UserSelectionCriteria) => Promise<UserSelectionResult>;
  initialSelection?: SelectedUser[];
  maxSelections?: number;
  excludeRoles?: UserRole[];
  departments?: { id: string; name: string }[];
}

export function UserSelectionInterface({
  institutionId,
  onSelectionChange,
  onSearchUsers,
  initialSelection = [],
  maxSelections,
  excludeRoles = [],
  departments = []
}: UserSelectionInterfaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [users, setUsers] = useState<SelectedUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>(initialSelection);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const availableRoles: UserRole[] = ['student', 'teacher', 'department_admin', 'institution_admin']
    .filter(role => !excludeRoles.includes(role as UserRole)) as UserRole[];

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (criteria: UserSelectionCriteria) => {
      setLoading(true);
      try {
        const result = await onSearchUsers(criteria);
        setUsers(result.users);
        setTotalCount(result.totalCount);
      } catch (error) {
        console.error('Search failed:', error);
        setUsers([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    }, 300),
    [onSearchUsers]
  );

  // Effect to trigger search when criteria change
  useEffect(() => {
    const criteria: UserSelectionCriteria = {
      institutionId,
      searchQuery: searchQuery.trim() || undefined,
      departmentIds: selectedDepartments.length > 0 ? selectedDepartments : undefined,
      currentRoles: selectedRoles.length > 0 ? selectedRoles : undefined,
      includeInactive,
      excludeUserIds: selectedUsers.map(u => u.id)
    };

    debouncedSearch(criteria);
  }, [searchQuery, selectedDepartments, selectedRoles, includeInactive, institutionId, selectedUsers, debouncedSearch]);

  const handleUserToggle = (user: SelectedUser, checked: boolean) => {
    let newSelection: SelectedUser[];
    
    if (checked) {
      if (maxSelections && selectedUsers.length >= maxSelections) {
        return; // Don't add if max reached
      }
      newSelection = [...selectedUsers, user];
    } else {
      newSelection = selectedUsers.filter(u => u.id !== user.id);
    }
    
    setSelectedUsers(newSelection);
    onSelectionChange(newSelection);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const availableUsers = users.filter(user => 
        !selectedUsers.some(selected => selected.id === user.id)
      );
      
      const usersToAdd = maxSelections 
        ? availableUsers.slice(0, maxSelections - selectedUsers.length)
        : availableUsers;
      
      const newSelection = [...selectedUsers, ...usersToAdd];
      setSelectedUsers(newSelection);
      onSelectionChange(newSelection);
    } else {
      const userIdsToRemove = new Set(users.map(u => u.id));
      const newSelection = selectedUsers.filter(u => !userIdsToRemove.has(u.id));
      setSelectedUsers(newSelection);
      onSelectionChange(newSelection);
    }
  };

  const clearSelection = () => {
    setSelectedUsers([]);
    onSelectionChange([]);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedDepartments([]);
    setSelectedRoles([]);
    setIncludeInactive(false);
  };

  const isUserSelected = (userId: string) => selectedUsers.some(u => u.id === userId);
  const allCurrentUsersSelected = users.length > 0 && users.every(user => isUserSelected(user.id));
  const someCurrentUsersSelected = users.some(user => isUserSelected(user.id));

  const getRoleColor = (role: UserRole) => {
    const colors = {
      student: 'bg-blue-100 text-blue-800',
      teacher: 'bg-green-100 text-green-800',
      department_admin: 'bg-yellow-100 text-yellow-800',
      institution_admin: 'bg-purple-100 text-purple-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getConflictRiskColor = (risk: 'low' | 'medium' | 'high') => {
    const colors = {
      low: 'text-green-600',
      medium: 'text-yellow-600',
      high: 'text-red-600'
    };
    return colors[risk];
  };

  return (
    <div className="space-y-6">
      {/* Selection Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Selection
            {selectedUsers.length > 0 && (
              <Badge variant="secondary">
                {selectedUsers.length} selected
                {maxSelections && ` / ${maxSelections}`}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Search and select users for bulk role assignment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedUsers.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">
                  Selected Users ({selectedUsers.length})
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                  className="text-blue-700 border-blue-200 hover:bg-blue-100"
                >
                  Clear All
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.slice(0, 10).map(user => (
                  <Badge key={user.id} variant="secondary" className="text-xs">
                    {user.firstName} {user.lastName}
                    <button
                      onClick={() => handleUserToggle(user, false)}
                      className="ml-1 hover:text-red-600"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
                {selectedUsers.length > 10 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedUsers.length - 10} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Filters
                {(selectedDepartments.length > 0 || selectedRoles.length > 0 || includeInactive) && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedDepartments.length + selectedRoles.length + (includeInactive ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </div>

            {showFilters && (
              <Card>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Department</label>
                      <Select
                        value={selectedDepartments[0] || ''}
                        onValueChange={(value) => 
                          setSelectedDepartments(value ? [value] : [])
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All departments" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">All departments</SelectItem>
                          {departments.map(dept => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Current Role</label>
                      <Select
                        value={selectedRoles[0] || ''}
                        onValueChange={(value) => 
                          setSelectedRoles(value ? [value as UserRole] : [])
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All roles" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">All roles</SelectItem>
                          {availableRoles.map(role => (
                            <SelectItem key={role} value={role}>
                              {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2 pt-6">
                      <Checkbox
                        id="include-inactive"
                        checked={includeInactive}
                        onCheckedChange={(checked) => setIncludeInactive(checked as boolean)}
                      />
                      <label htmlFor="include-inactive" className="text-sm">
                        Include inactive users
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end mt-4">
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Available Users</CardTitle>
              <CardDescription>
                {loading ? 'Searching...' : `${users.length} users found`}
                {totalCount > users.length && ` (${totalCount} total)`}
              </CardDescription>
            </div>
            {users.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allCurrentUsersSelected}
                  onCheckedChange={handleSelectAll}
                  className={someCurrentUsersSelected && !allCurrentUsersSelected ? 'data-[state=checked]:bg-blue-600' : ''}
                />
                <span className="text-sm text-gray-600">Select all visible</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No users found matching your criteria</p>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Select</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Current Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const selected = isUserSelected(user.id);
                    const disabled = maxSelections && selectedUsers.length >= maxSelections && !selected;
                    
                    return (
                      <TableRow 
                        key={user.id} 
                        className={selected ? 'bg-blue-50' : disabled ? 'opacity-50' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => handleUserToggle(user, checked as boolean)}
                            disabled={disabled}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge className={getRoleColor(user.currentRole)}>
                            {user.currentRole.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.departmentName || 'N/A'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {user.isActive ? 'Active' : 'Inactive'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1 ${getConflictRiskColor(user.conflictRisk)}`}>
                            {user.conflictRisk === 'high' && <AlertTriangle className="h-4 w-4" />}
                            {user.conflictRisk === 'medium' && <Info className="h-4 w-4" />}
                            <span className="capitalize">{user.conflictRisk}</span>
                            {user.conflictReasons && user.conflictReasons.length > 0 && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    <Info className="h-3 w-3" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Conflict Details</DialogTitle>
                                    <DialogDescription>
                                      Potential issues with assigning roles to {user.firstName} {user.lastName}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-2">
                                    {user.conflictReasons.map((reason, index) => (
                                      <div key={index} className="p-2 bg-yellow-50 rounded text-sm">
                                        {reason}
                                      </div>
                                    ))}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Utility function for debouncing
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}