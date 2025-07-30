"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Shield, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Search,
  Filter,
  MoreHorizontal,
  AlertTriangle,
  TrendingUp,
  UserCheck,
  UserX,
  Calendar,
  Download,
  RefreshCw
} from "lucide-react"
import { UserRole, RoleRequestStatus } from "@/lib/types/role-management"
import { useSupabase } from "@/components/session-provider"
import { RoleStatisticsDashboard } from "./role-statistics-dashboard"
import { UserSearchManagement } from "./user-search-management"

interface PendingRequest {
  id: string
  user_id: string
  requested_role: UserRole
  current_role?: UserRole
  justification: string
  status: RoleRequestStatus
  requested_at: string
  expires_at: string
  institution_id: string
  department_id?: string
  users: {
    id: string
    email: string
    full_name: string
    created_at: string
  }
  canApprove: boolean
  daysUntilExpiration: number
  isUrgent: boolean
}

interface RoleStatistics {
  totalUsers: number
  totalRequests: number
  pendingRequests: number
  approvedToday: number
  deniedToday: number
  urgentRequests: number
  roleDistribution: Record<UserRole, number>
  requestsByRole: Record<UserRole, number>
  averageProcessingTime: number
}

interface AdminRoleDashboardProps {
  className?: string
}

export function AdminRoleDashboard({ className }: AdminRoleDashboardProps) {
  const supabase = useSupabase()
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [statistics, setStatistics] = useState<RoleStatistics | null>(null)
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch pending requests
      const requestsResponse = await fetch('/api/roles/requests/pending')
      if (!requestsResponse.ok) {
        throw new Error('Failed to fetch pending requests')
      }
      const requestsData = await requestsResponse.json()
      setPendingRequests(requestsData.data.requests || [])

      // Fetch statistics
      const statsResponse = await fetch('/api/roles/statistics')
      if (!statsResponse.ok) {
        throw new Error('Failed to fetch statistics')
      }
      const statsData = await statsResponse.json()
      setStatistics(statsData.data)

    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBulkApproval = async () => {
    if (selectedRequests.size === 0) return

    setIsProcessing(true)
    try {
      const promises = Array.from(selectedRequests).map(requestId =>
        fetch(`/api/roles/requests/${requestId}/approve`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: 'Bulk approval' })
        })
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (successful > 0) {
        await fetchDashboardData()
        setSelectedRequests(new Set())
      }

      // Show success/error message
      if (failed > 0) {
        setError(`Approved ${successful} requests, ${failed} failed`)
      }

    } catch (err) {
      setError('Failed to process bulk approval')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkDenial = async () => {
    if (selectedRequests.size === 0) return

    setIsProcessing(true)
    try {
      const promises = Array.from(selectedRequests).map(requestId =>
        fetch(`/api/roles/requests/${requestId}/deny`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Bulk denial' })
        })
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (successful > 0) {
        await fetchDashboardData()
        setSelectedRequests(new Set())
      }

      if (failed > 0) {
        setError(`Denied ${successful} requests, ${failed} failed`)
      }

    } catch (err) {
      setError('Failed to process bulk denial')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSingleApproval = async (requestId: string) => {
    try {
      const response = await fetch(`/api/roles/requests/${requestId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Approved by admin' })
      })

      if (!response.ok) {
        throw new Error('Failed to approve request')
      }

      await fetchDashboardData()
    } catch (err) {
      setError('Failed to approve request')
    }
  }

  const handleSingleDenial = async (requestId: string) => {
    try {
      const response = await fetch(`/api/roles/requests/${requestId}/deny`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Denied by admin' })
      })

      if (!response.ok) {
        throw new Error('Failed to deny request')
      }

      await fetchDashboardData()
    } catch (err) {
      setError('Failed to deny request')
    }
  }

  const toggleRequestSelection = (requestId: string) => {
    const newSelected = new Set(selectedRequests)
    if (newSelected.has(requestId)) {
      newSelected.delete(requestId)
    } else {
      newSelected.add(requestId)
    }
    setSelectedRequests(newSelected)
  }

  const selectAllRequests = () => {
    const filteredRequests = getFilteredRequests()
    if (selectedRequests.size === filteredRequests.length) {
      setSelectedRequests(new Set())
    } else {
      setSelectedRequests(new Set(filteredRequests.map(r => r.id)))
    }
  }

  const getFilteredRequests = () => {
    return pendingRequests.filter(request => {
      const matchesSearch = !searchTerm || 
        request.users.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.users.email.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesRole = roleFilter === 'all' || request.requested_role === roleFilter
      const matchesUrgent = !urgentOnly || request.isUrgent

      return matchesSearch && matchesRole && matchesUrgent
    })
  }

  const getRoleDisplayName = (role: UserRole): string => {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const filteredRequests = getFilteredRequests()

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Loading admin dashboard...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Role Management Dashboard</h1>
            <p className="text-muted-foreground">
              Manage role requests and monitor system statistics
            </p>
          </div>
          <Button onClick={fetchDashboardData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Requests</p>
                    <p className="text-2xl font-bold">{statistics.pendingRequests}</p>
                  </div>
                  <Clock className="h-8 w-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Urgent Requests</p>
                    <p className="text-2xl font-bold">{statistics.urgentRequests}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Approved Today</p>
                    <p className="text-2xl font-bold">{statistics.approvedToday}</p>
                  </div>
                  <UserCheck className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Users</p>
                    <p className="text-2xl font-bold">{statistics.totalUsers}</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="requests" className="space-y-4">
          <TabsList>
            <TabsTrigger value="requests">Pending Requests</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="space-y-4">
            {/* Filters and Actions */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* Search */}
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Role Filter */}
                  <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as UserRole | 'all')}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value={UserRole.TEACHER}>Teacher</SelectItem>
                      <SelectItem value={UserRole.DEPARTMENT_ADMIN}>Department Admin</SelectItem>
                      <SelectItem value={UserRole.INSTITUTION_ADMIN}>Institution Admin</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Urgent Filter */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="urgent-only"
                      checked={urgentOnly}
                      onCheckedChange={(checked) => setUrgentOnly(checked as boolean)}
                    />
                    <label htmlFor="urgent-only" className="text-sm">
                      Urgent only
                    </label>
                  </div>
                </div>

                {/* Bulk Actions */}
                {selectedRequests.size > 0 && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                    <span className="text-sm text-muted-foreground">
                      {selectedRequests.size} selected
                    </span>
                    <Button
                      size="sm"
                      onClick={handleBulkApproval}
                      disabled={isProcessing}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleBulkDenial}
                      disabled={isProcessing}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Deny Selected
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Requests List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Shield className="h-5 w-5 mr-2" />
                    Pending Role Requests ({filteredRequests.length})
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={selectedRequests.size === filteredRequests.length && filteredRequests.length > 0}
                      onCheckedChange={selectAllRequests}
                    />
                    <span className="text-sm text-muted-foreground">Select All</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No pending requests found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredRequests.map((request) => (
                      <div key={request.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <Checkbox
                              checked={selectedRequests.has(request.id)}
                              onCheckedChange={() => toggleRequestSelection(request.id)}
                            />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h4 className="font-medium">{request.users.full_name}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {request.users.email}
                                </Badge>
                                {request.isUrgent && (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Urgent
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="flex items-center space-x-2 mb-2">
                                {request.current_role && (
                                  <Badge variant="secondary" className="text-xs">
                                    {getRoleDisplayName(request.current_role)}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">→</span>
                                <Badge variant="default" className="text-xs">
                                  {getRoleDisplayName(request.requested_role)}
                                </Badge>
                              </div>

                              <p className="text-sm text-muted-foreground mb-2">
                                {request.justification}
                              </p>

                              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                <span className="flex items-center">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  Requested: {formatDate(request.requested_at)}
                                </span>
                                <span className="flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Expires in {request.daysUntilExpiration} days
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              onClick={() => handleSingleApproval(request.id)}
                              disabled={!request.canApprove || isProcessing}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleSingleDenial(request.id)}
                              disabled={!request.canApprove || isProcessing}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Deny
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="statistics">
            <RoleStatisticsDashboard />
          </TabsContent>

          <TabsContent value="users">
            <UserSearchManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}