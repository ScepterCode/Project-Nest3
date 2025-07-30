"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Search, 
  Users, 
  Filter, 
  MoreHorizontal,
  UserCheck,
  UserX,
  Shield,
  Calendar,
  Mail,
  Building,
  AlertTriangle,
  RefreshCw,
  Download,
  Settings
} from "lucide-react"
import { UserRole, UserRoleAssignment } from "@/lib/types/role-management"
import { useSupabase } from "@/components/session-provider"
import { useDebounce } from "@/lib/hooks/useDebounce"

interface UserProfile {
  id: string
  email: string
  full_name: string
  created_at: string
  primary_role: UserRole
  role_status: string
  institution_id: string
  department_id?: string
  last_sign_in_at?: string
  roles: UserRoleAssignment[]
  institution?: {
    name: string
  }
  department?: {
    name: string
  }
}

interface UserSearchManagementProps {
  className?: string
}

export function UserSearchManagement({ className }: UserSearchManagementProps) {
  const supabase = useSupabase()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'suspended'>('all')
  const [institutionFilter, setInstitutionFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'created_at' | 'last_sign_in'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)

  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  useEffect(() => {
    searchUsers()
  }, [debouncedSearchTerm, roleFilter, statusFilter, institutionFilter, sortBy, sortOrder, currentPage])

  const searchUsers = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams({
        search: debouncedSearchTerm,
        role: roleFilter,
        status: statusFilter,
        institution: institutionFilter,
        sortBy,
        sortOrder,
        page: currentPage.toString(),
        limit: '20'
      })

      const response = await fetch(`/api/roles/users/search?${params}`)
      if (!response.ok) {
        throw new Error('Failed to search users')
      }

      const data = await response.json()
      setUsers(data.data.users || [])
      setTotalPages(Math.ceil((data.data.total || 0) / 20))

    } catch (err) {
      console.error('Error searching users:', err)
      setError(err instanceof Error ? err.message : 'Failed to search users')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      setIsProcessing(true)
      
      const response = await fetch(`/api/roles/change`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          newRole,
          reason: 'Admin role change'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to change user role')
      }

      await searchUsers()
      
    } catch (err) {
      setError('Failed to change user role')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkRoleChange = async (newRole: UserRole) => {
    if (selectedUsers.size === 0) return

    try {
      setIsProcessing(true)
      
      const promises = Array.from(selectedUsers).map(userId =>
        fetch(`/api/roles/change`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            newRole,
            reason: 'Bulk admin role change'
          })
        })
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (successful > 0) {
        await searchUsers()
        setSelectedUsers(new Set())
      }

      if (failed > 0) {
        setError(`Changed ${successful} users, ${failed} failed`)
      }

    } catch (err) {
      setError('Failed to process bulk role change')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUserStatusChange = async (userId: string, newStatus: 'active' | 'suspended') => {
    try {
      setIsProcessing(true)
      
      const response = await fetch(`/api/roles/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (!response.ok) {
        throw new Error('Failed to change user status')
      }

      await searchUsers()
      
    } catch (err) {
      setError('Failed to change user status')
    } finally {
      setIsProcessing(false)
    }
  }

  const exportUsers = async () => {
    try {
      const params = new URLSearchParams({
        search: debouncedSearchTerm,
        role: roleFilter,
        status: statusFilter,
        institution: institutionFilter,
        format: 'csv'
      })

      const response = await fetch(`/api/roles/users/export?${params}`)
      if (!response.ok) {
        throw new Error('Failed to export users')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (err) {
      setError('Failed to export users')
    }
  }

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsers(newSelected)
  }

  const selectAllUsers = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)))
    }
  }

  const getRoleDisplayName = (role: UserRole): string => {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case UserRole.SYSTEM_ADMIN:
        return "destructive"
      case UserRole.INSTITUTION_ADMIN:
        return "default"
      case UserRole.DEPARTMENT_ADMIN:
        return "secondary"
      case UserRole.TEACHER:
        return "outline"
      case UserRole.STUDENT:
        return "secondary"
      default:
        return "outline"
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return "default"
      case 'pending':
        return "secondary"
      case 'suspended':
        return "destructive"
      default:
        return "outline"
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">User Management</h2>
            <p className="text-muted-foreground">
              Search and manage user roles across the platform
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={exportUsers}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={searchUsers}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-4">
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as UserRole | 'all')}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value={UserRole.STUDENT}>Student</SelectItem>
                    <SelectItem value={UserRole.TEACHER}>Teacher</SelectItem>
                    <SelectItem value={UserRole.DEPARTMENT_ADMIN}>Department Admin</SelectItem>
                    <SelectItem value={UserRole.INSTITUTION_ADMIN}>Institution Admin</SelectItem>
                    <SelectItem value={UserRole.SYSTEM_ADMIN}>System Admin</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="created_at">Join Date</SelectItem>
                    <SelectItem value="last_sign_in">Last Sign In</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bulk Actions */}
              {selectedUsers.size > 0 && (
                <div className="flex items-center gap-2 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    {selectedUsers.size} selected
                  </span>
                  <Select onValueChange={(value) => handleBulkRoleChange(value as UserRole)}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Change role to..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UserRole.STUDENT}>Student</SelectItem>
                      <SelectItem value={UserRole.TEACHER}>Teacher</SelectItem>
                      <SelectItem value={UserRole.DEPARTMENT_ADMIN}>Department Admin</SelectItem>
                      <SelectItem value={UserRole.INSTITUTION_ADMIN}>Institution Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Users ({users.length})
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={selectedUsers.size === users.length && users.length > 0}
                  onCheckedChange={selectAllUsers}
                />
                <span className="text-sm text-muted-foreground">Select All</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                <span>Searching users...</span>
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No users found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            ) : (
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          checked={selectedUsers.has(user.id)}
                          onCheckedChange={() => toggleUserSelection(user.id)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium">{user.full_name}</h4>
                            <Badge variant="outline" className="text-xs">
                              <Mail className="h-3 w-3 mr-1" />
                              {user.email}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge variant={getRoleBadgeVariant(user.primary_role)} className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              {getRoleDisplayName(user.primary_role)}
                            </Badge>
                            <Badge variant={getStatusBadgeVariant(user.role_status)} className="text-xs">
                              {user.role_status}
                            </Badge>
                          </div>

                          {user.institution && (
                            <div className="flex items-center space-x-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                <Building className="h-3 w-3 mr-1" />
                                {user.institution.name}
                              </Badge>
                              {user.department && (
                                <Badge variant="outline" className="text-xs">
                                  {user.department.name}
                                </Badge>
                              )}
                            </div>
                          )}

                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              Joined: {formatDate(user.created_at)}
                            </span>
                            {user.last_sign_in_at && (
                              <span className="flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                Last seen: {formatDate(user.last_sign_in_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Select
                          value={user.primary_role}
                          onValueChange={(value) => handleRoleChange(user.id, value as UserRole)}
                          disabled={isProcessing}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UserRole.STUDENT}>Student</SelectItem>
                            <SelectItem value={UserRole.TEACHER}>Teacher</SelectItem>
                            <SelectItem value={UserRole.DEPARTMENT_ADMIN}>Department Admin</SelectItem>
                            <SelectItem value={UserRole.INSTITUTION_ADMIN}>Institution Admin</SelectItem>
                          </SelectContent>
                        </Select>

                        {user.role_status === 'active' ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleUserStatusChange(user.id, 'suspended')}
                            disabled={isProcessing}
                          >
                            <UserX className="h-4 w-4 mr-1" />
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleUserStatusChange(user.id, 'active')}
                            disabled={isProcessing}
                          >
                            <UserCheck className="h-4 w-4 mr-1" />
                            Activate
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}