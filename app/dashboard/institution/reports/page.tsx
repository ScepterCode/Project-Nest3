"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useState, useEffect } from 'react'
import { useAuth } from "@/contexts/auth-context"
import { RoleGate } from '@/components/ui/permission-gate'
import { DatabaseStatusBanner } from '@/components/database-status-banner'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { Download, Calendar, Users, BookOpen, TrendingUp, Activity } from 'lucide-react'

interface ReportData {
  period: string;
  users: number;
  classes: number;
  assignments: number;
  activity: number;
}

interface UserActivityData {
  name: string;
  role: string;
  lastActive: string;
  totalSessions: number;
  avgSessionTime: string;
}

const mockReportData: ReportData[] = [
  { period: 'Jan 2024', users: 45, classes: 12, assignments: 89, activity: 234 },
  { period: 'Feb 2024', users: 52, classes: 15, assignments: 102, activity: 287 },
  { period: 'Mar 2024', users: 48, classes: 13, assignments: 95, activity: 256 },
  { period: 'Apr 2024', users: 61, classes: 18, assignments: 134, activity: 312 },
  { period: 'May 2024', users: 58, classes: 16, assignments: 118, activity: 298 },
  { period: 'Jun 2024', users: 67, classes: 20, assignments: 156, activity: 345 }
];

const mockUserActivity: UserActivityData[] = [
  { name: 'John Smith', role: 'Teacher', lastActive: '2024-06-15', totalSessions: 45, avgSessionTime: '2h 15m' },
  { name: 'Jane Doe', role: 'Student', lastActive: '2024-06-14', totalSessions: 32, avgSessionTime: '1h 45m' },
  { name: 'Bob Johnson', role: 'Teacher', lastActive: '2024-06-13', totalSessions: 38, avgSessionTime: '2h 30m' },
  { name: 'Alice Brown', role: 'Student', lastActive: '2024-06-15', totalSessions: 28, avgSessionTime: '1h 20m' },
  { name: 'Charlie Wilson', role: 'Student', lastActive: '2024-06-12', totalSessions: 41, avgSessionTime: '1h 55m' }
];

const roleDistribution = [
  { name: 'Students', value: 65, color: '#3b82f6' },
  { name: 'Teachers', value: 28, color: '#10b981' },
  { name: 'Admins', value: 7, color: '#8b5cf6' }
];

export default function InstitutionReportsPage() {
  const [reportPeriod, setReportPeriod] = useState('last-6-months')
  const [reportType, setReportType] = useState('overview')
  const [reportData, setReportData] = useState<ReportData[]>(mockReportData)
  const [userActivity, setUserActivity] = useState<UserActivityData[]>(mockUserActivity)

  const { user, loading: authLoading } = useAuth()

  if (authLoading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <div>Access Denied</div>
  }

  const handleExportReport = () => {
    alert('Report export functionality (Demo mode - not actually exported)')
  }

  const getTotalStats = () => {
    const latest = reportData[reportData.length - 1]
    return {
      totalUsers: latest?.users || 0,
      totalClasses: latest?.classes || 0,
      totalAssignments: latest?.assignments || 0,
      totalActivity: latest?.activity || 0
    }
  }

  const stats = getTotalStats()

  return (
    <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
      <div className="flex flex-col gap-4 p-4 md:gap-8 md:p-6">
        <DatabaseStatusBanner />
        
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-semibold md:text-2xl">Activity & Reports</h1>
          <Button onClick={handleExportReport} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Report
          </Button>
        </div>

        {/* Report Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Report Settings</CardTitle>
            <CardDescription>Configure your report parameters</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Report Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">Overview</SelectItem>
                  <SelectItem value="user-activity">User Activity</SelectItem>
                  <SelectItem value="class-performance">Class Performance</SelectItem>
                  <SelectItem value="engagement">Engagement Metrics</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Time Period</label>
              <Select value={reportPeriod} onValueChange={setReportPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-week">Last Week</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="last-3-months">Last 3 Months</SelectItem>
                  <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                  <SelectItem value="last-year">Last Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">+12% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Classes</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalClasses}</div>
              <p className="text-xs text-muted-foreground">+8% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assignments</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAssignments}</div>
              <p className="text-xs text-muted-foreground">+23% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Activity</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalActivity}</div>
              <p className="text-xs text-muted-foreground">+15% from last month</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Activity Trends</CardTitle>
              <CardDescription>Monthly activity overview</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={reportData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="classes" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="assignments" stroke="#f59e0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Distribution</CardTitle>
              <CardDescription>Breakdown by role</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={roleDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {roleDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* User Activity Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent User Activity</CardTitle>
            <CardDescription>Most active users in your institution</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Total Sessions</TableHead>
                  <TableHead>Avg Session Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userActivity.map((user, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        user.role === 'Teacher' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role}
                      </span>
                    </TableCell>
                    <TableCell>{user.lastActive}</TableCell>
                    <TableCell>{user.totalSessions}</TableCell>
                    <TableCell>{user.avgSessionTime}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Demo Mode Notice */}
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-orange-800">
              <TrendingUp className="h-4 w-4" />
              <span className="font-semibold">Demo Mode</span>
            </div>
            <p className="text-orange-700 mt-2 text-sm">
              This is a demonstration of the reports interface. In production, this would show real data from your institution's activities, user engagement, and performance metrics.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoleGate>
  )
}