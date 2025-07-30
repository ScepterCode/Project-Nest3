"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts'
import { 
  TrendingUp, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  Calendar,
  Target,
  Activity
} from "lucide-react"
import { UserRole } from "@/lib/types/role-management"

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
  trends: {
    daily: Array<{
      date: string
      requests: number
      approved: number
      denied: number
      pending: number
    }>
    recentActivity: number
  }
  summary: {
    approvalRate: number
    averageDaysToProcess: number
    mostRequestedRole: UserRole
    peakRequestHour: number
  }
}

interface RoleStatisticsDashboardProps {
  className?: string
}

const COLORS = {
  [UserRole.STUDENT]: '#3b82f6',
  [UserRole.TEACHER]: '#10b981',
  [UserRole.DEPARTMENT_ADMIN]: '#f59e0b',
  [UserRole.INSTITUTION_ADMIN]: '#ef4444',
  [UserRole.SYSTEM_ADMIN]: '#8b5cf6'
}

export function RoleStatisticsDashboard({ className }: RoleStatisticsDashboardProps) {
  const [statistics, setStatistics] = useState<RoleStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d')

  useEffect(() => {
    fetchStatistics()
  }, [timeRange])

  const fetchStatistics = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/roles/statistics?timeRange=${timeRange}`)
      if (!response.ok) {
        throw new Error('Failed to fetch statistics')
      }

      const data = await response.json()
      setStatistics(data.data)

    } catch (err) {
      console.error('Error fetching statistics:', err)
      setError(err instanceof Error ? err.message : 'Failed to load statistics')
    } finally {
      setIsLoading(false)
    }
  }

  const exportStatistics = async () => {
    try {
      const response = await fetch(`/api/roles/statistics/export?timeRange=${timeRange}`)
      if (!response.ok) {
        throw new Error('Failed to export statistics')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `role-statistics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (err) {
      console.error('Error exporting statistics:', err)
    }
  }

  const getRoleDisplayName = (role: UserRole): string => {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatChartData = (data: Record<UserRole, number>) => {
    return Object.entries(data).map(([role, count]) => ({
      role: getRoleDisplayName(role as UserRole),
      count,
      color: COLORS[role as UserRole]
    }))
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Loading statistics...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-red-600 mx-auto mb-2" />
            <p className="text-red-600 mb-4">Error: {error}</p>
            <Button variant="outline" onClick={fetchStatistics}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!statistics) {
    return null
  }

  const roleDistributionData = formatChartData(statistics.roleDistribution)
  const requestsByRoleData = formatChartData(statistics.requestsByRole)

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Role Statistics Dashboard</h2>
            <p className="text-muted-foreground">
              Analytics and insights for role management
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Select value={timeRange} onValueChange={(value) => setTimeRange(value as '7d' | '30d' | '90d')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportStatistics}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={fetchStatistics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approval Rate</p>
                  <p className="text-2xl font-bold">{statistics.summary.approvalRate}%</p>
                </div>
                <Target className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Processing Time</p>
                  <p className="text-2xl font-bold">{statistics.summary.averageDaysToProcess}d</p>
                </div>
                <Clock className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Most Requested</p>
                  <p className="text-lg font-bold">
                    {getRoleDisplayName(statistics.summary.mostRequestedRole)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Peak Hour</p>
                  <p className="text-2xl font-bold">{statistics.summary.peakRequestHour}:00</p>
                </div>
                <Activity className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Role Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Current Role Distribution
              </CardTitle>
              <CardDescription>
                Distribution of users across different roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={roleDistributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ role, count, percent }) => 
                        `${role}: ${count} (${(percent * 100).toFixed(0)}%)`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {roleDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Requests by Role */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                Role Requests by Type
              </CardTitle>
              <CardDescription>
                Number of requests for each role type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={requestsByRoleData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="role" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Request Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Request Trends Over Time
            </CardTitle>
            <CardDescription>
              Daily role request activity and processing status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={statistics.trends.daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="requests" 
                    stackId="1" 
                    stroke="#3b82f6" 
                    fill="#3b82f6" 
                    fillOpacity={0.6}
                    name="Total Requests"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="approved" 
                    stackId="2" 
                    stroke="#10b981" 
                    fill="#10b981" 
                    fillOpacity={0.6}
                    name="Approved"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="denied" 
                    stackId="3" 
                    stroke="#ef4444" 
                    fill="#ef4444" 
                    fillOpacity={0.6}
                    name="Denied"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="pending" 
                    stackId="4" 
                    stroke="#f59e0b" 
                    fill="#f59e0b" 
                    fillOpacity={0.6}
                    name="Pending"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Processing Efficiency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Average processing time:</span>
                  <Badge variant="outline">{statistics.averageProcessingTime}h</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Approval rate:</span>
                  <Badge variant={statistics.summary.approvalRate > 80 ? "default" : "secondary"}>
                    {statistics.summary.approvalRate}%
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Pending requests:</span>
                  <Badge variant={statistics.pendingRequests > 10 ? "destructive" : "secondary"}>
                    {statistics.pendingRequests}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Approved today:</span>
                  <Badge variant="default" className="bg-green-600">
                    {statistics.approvedToday}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Denied today:</span>
                  <Badge variant="destructive">
                    {statistics.deniedToday}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Urgent requests:</span>
                  <Badge variant={statistics.urgentRequests > 0 ? "destructive" : "secondary"}>
                    {statistics.urgentRequests}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total users:</span>
                  <Badge variant="outline">{statistics.totalUsers}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total requests:</span>
                  <Badge variant="outline">{statistics.totalRequests}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Recent activity:</span>
                  <Badge variant="outline">{statistics.trends.recentActivity}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}