'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Users, 
  BookOpen, 
  GraduationCap, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  BarChart3,
  UserCheck,
  UserX,
  Calendar,
  FileText,
  Save,
  RefreshCw,
  Download,
  Plus,
  Edit,
  Trash2,
  Eye
} from 'lucide-react';
import { Department, DepartmentSettings } from '@/lib/types/institution';
import { UserRole } from '@/lib/types/onboarding';

interface DepartmentAdminDashboardProps {
  departmentId: string;
  currentUserRole: UserRole;
}

interface DepartmentOverview {
  department: Department;
  stats: {
    totalUsers: number;
    activeUsers: number;
    totalClasses: number;
    activeClasses: number;
    totalEnrollments: number;
    completionRate: number;
    averageGrade: number;
  };
  recentActivity: Array<{
    id: string;
    type: 'enrollment' | 'assignment' | 'grade' | 'class_created';
    description: string;
    timestamp: Date;
    userId?: string;
    userName?: string;
  }>;
  atRiskStudents: Array<{
    id: string;
    name: string;
    email: string;
    riskFactors: string[];
    lastActivity: Date;
    averageGrade: number;
  }>;
  performanceMetrics: Array<{
    metric: string;
    current: number;
    previous: number;
    trend: 'up' | 'down' | 'stable';
  }>;
}

interface DepartmentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  joinedAt: Date;
  lastActivity: Date;
  classCount?: number;
  enrollmentCount?: number;
}

interface DepartmentClass {
  id: string;
  name: string;
  code: string;
  instructor: string;
  enrollmentCount: number;
  capacity: number;
  status: 'active' | 'inactive' | 'archived';
  createdAt: Date;
}

export function DepartmentAdminDashboard({ departmentId, currentUserRole }: DepartmentAdminDashboardProps) {
  const [overview, setOverview] = useState<DepartmentOverview | null>(null);
  const [users, setUsers] = useState<DepartmentUser[]>([]);
  const [classes, setClasses] = useState<DepartmentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Form states
  const [departmentForm, setDepartmentForm] = useState<Partial<Department>>({});
  const [settingsForm, setSettingsForm] = useState<Partial<DepartmentSettings>>({});

  useEffect(() => {
    fetchDepartmentData();
  }, [departmentId]);

  const fetchDepartmentData = async () => {
    try {
      setLoading(true);
      
      const [overviewResponse, usersResponse, classesResponse] = await Promise.all([
        fetch(`/api/departments/${departmentId}/admin-overview`),
        fetch(`/api/departments/${departmentId}/users`),
        fetch(`/api/departments/${departmentId}/classes`)
      ]);

      if (overviewResponse.ok) {
        const overviewData = await overviewResponse.json();
        setOverview(overviewData.data);
        setDepartmentForm(overviewData.data.department);
        setSettingsForm(overviewData.data.department.settings);
      }

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData.data.users);
      }

      if (classesResponse.ok) {
        const classesData = await classesResponse.json();
        setClasses(classesData.data.classes);
      }
    } catch (error) {
      console.error('Error fetching department data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDepartment = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/departments/${departmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: departmentForm.name,
          description: departmentForm.description,
          code: departmentForm.code
        })
      });

      if (response.ok) {
        alert('Department details updated successfully!');
        await fetchDepartmentData();
      } else {
        alert('Failed to update department details');
      }
    } catch (error) {
      console.error('Error updating department:', error);
      alert('Error updating department details');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/departments/${departmentId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsForm })
      });

      if (response.ok) {
        alert('Department settings updated successfully!');
        await fetchDepartmentData();
      } else {
        alert('Failed to update department settings');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Error updating department settings');
    } finally {
      setSaving(false);
    }
  };

  const handleExportReport = async (type: 'performance' | 'users' | 'classes') => {
    try {
      const response = await fetch(`/api/departments/${departmentId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, format: 'csv' })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `department-${type}-report.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'stable': return <div className="h-4 w-4" />;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading department dashboard...</span>
      </div>
    );
  }

  if (!overview) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load department data. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{overview.department.name}</h1>
          <p className="text-muted-foreground">Department Administration Dashboard</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={overview.department.status === 'active' ? 'default' : 'secondary'}>
            {overview.department.status}
          </Badge>
          <Button variant="outline" onClick={fetchDepartmentData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {overview.stats.activeUsers} active users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.stats.totalClasses}</div>
            <p className="text-xs text-muted-foreground">
              {overview.stats.activeClasses} active classes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.stats.completionRate.toFixed(1)}%</div>
            <Progress value={overview.stats.completionRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Grade</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.stats.averageGrade.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">
              Department average
            </p>
          </CardContent>
        </Card>
      </div>

      {/* At-Risk Students Alert */}
      {overview.atRiskStudents.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Students Need Attention</AlertTitle>
          <AlertDescription>
            {overview.atRiskStudents.length} students have been identified as at-risk and may need additional support.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>Key performance indicators for your department</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {overview.performanceMetrics.map((metric, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{metric.metric}</div>
                        <div className="text-sm text-muted-foreground">
                          Current: {metric.current} | Previous: {metric.previous}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getTrendIcon(metric.trend)}
                        <span className="text-sm">
                          {((metric.current - metric.previous) / metric.previous * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest activities in your department</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {overview.recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="mt-1">
                        {activity.type === 'enrollment' && <UserCheck className="h-4 w-4 text-green-600" />}
                        {activity.type === 'assignment' && <FileText className="h-4 w-4 text-blue-600" />}
                        {activity.type === 'grade' && <BarChart3 className="h-4 w-4 text-purple-600" />}
                        {activity.type === 'class_created' && <BookOpen className="h-4 w-4 text-orange-600" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* At-Risk Students */}
          {overview.atRiskStudents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  At-Risk Students ({overview.atRiskStudents.length})
                </CardTitle>
                <CardDescription>Students who may need additional support</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Risk Factors</TableHead>
                      <TableHead>Average Grade</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.atRiskStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{student.name}</div>
                            <div className="text-sm text-muted-foreground">{student.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {student.riskFactors.map((factor, index) => (
                              <Badge key={index} variant="destructive" className="text-xs">
                                {factor}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={student.averageGrade < 70 ? 'destructive' : 'secondary'}>
                            {student.averageGrade.toFixed(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(student.lastActivity).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">
                            Contact
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Enrollment Trends</CardTitle>
                <CardDescription>Student enrollment over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[
                    { month: 'Jan', enrollments: 45, completions: 38 },
                    { month: 'Feb', enrollments: 52, completions: 44 },
                    { month: 'Mar', enrollments: 48, completions: 41 },
                    { month: 'Apr', enrollments: 61, completions: 52 },
                    { month: 'May', enrollments: 55, completions: 48 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="enrollments" stroke="#8884d8" name="Enrollments" />
                    <Line type="monotone" dataKey="completions" stroke="#82ca9d" name="Completions" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Grade Distribution</CardTitle>
                <CardDescription>Distribution of grades across the department</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={[
                    { grade: 'A', count: 25 },
                    { grade: 'B', count: 35 },
                    { grade: 'C', count: 28 },
                    { grade: 'D', count: 12 },
                    { grade: 'F', count: 8 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="grade" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => handleExportReport('performance')}>
              <Download className="h-4 w-4 mr-2" />
              Export Performance Report
            </Button>
            <Button variant="outline" onClick={() => handleExportReport('users')}>
              <Download className="h-4 w-4 mr-2" />
              Export User Report
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Users ({users.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Classes/Enrollments</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getRoleDisplayName(user.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.role === UserRole.TEACHER ? (
                          <span>{user.classCount || 0} classes</span>
                        ) : (
                          <span>{user.enrollmentCount || 0} enrollments</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(user.lastActivity).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Department Classes ({classes.length})</span>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Class
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Enrollment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((classItem) => (
                    <TableRow key={classItem.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{classItem.name}</div>
                          <div className="text-sm text-muted-foreground">{classItem.code}</div>
                        </div>
                      </TableCell>
                      <TableCell>{classItem.instructor}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{classItem.enrollmentCount} / {classItem.capacity}</span>
                          <Progress 
                            value={(classItem.enrollmentCount / classItem.capacity) * 100} 
                            className="w-16 h-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={classItem.status === 'active' ? 'default' : 'secondary'}>
                          {classItem.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(classItem.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Details</CardTitle>
              <CardDescription>Basic information about your department</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dept-name">Department Name</Label>
                  <Input
                    id="dept-name"
                    value={departmentForm.name || ''}
                    onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="dept-code">Department Code</Label>
                  <Input
                    id="dept-code"
                    value={departmentForm.code || ''}
                    onChange={(e) => setDepartmentForm({ ...departmentForm, code: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="dept-description">Description</Label>
                <Textarea
                  id="dept-description"
                  value={departmentForm.description || ''}
                  onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })}
                />
              </div>
              <Button onClick={handleSaveDepartment} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Department Settings</CardTitle>
              <CardDescription>Configure policies and defaults for your department</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="default-capacity">Default Class Capacity</Label>
                  <Input
                    id="default-capacity"
                    type="number"
                    value={settingsForm.defaultClassSettings?.defaultCapacity || 30}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      defaultClassSettings: {
                        ...settingsForm.defaultClassSettings,
                        defaultCapacity: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Allow Waitlists</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow students to join waitlists for full classes
                    </p>
                  </div>
                  <Switch
                    checked={settingsForm.defaultClassSettings?.allowWaitlist || false}
                    onCheckedChange={(checked) => 
                      setSettingsForm({
                        ...settingsForm,
                        defaultClassSettings: {
                          ...settingsForm.defaultClassSettings,
                          allowWaitlist: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Enrollment Approval</Label>
                    <p className="text-sm text-muted-foreground">
                      Require instructor approval for student enrollments
                    </p>
                  </div>
                  <Switch
                    checked={settingsForm.defaultClassSettings?.requireApproval || false}
                    onCheckedChange={(checked) => 
                      setSettingsForm({
                        ...settingsForm,
                        defaultClassSettings: {
                          ...settingsForm.defaultClassSettings,
                          requireApproval: checked
                        }
                      })
                    }
                  />
                </div>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving}>
                <Settings className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}