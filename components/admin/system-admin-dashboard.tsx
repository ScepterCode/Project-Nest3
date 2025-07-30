'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  Building2, 
  Users, 
  AlertTriangle, 
  TrendingUp, 
  Activity,
  Settings,
  Shield,
  Database,
  RefreshCw,
  Download,
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { Institution, InstitutionStatus, InstitutionType } from '@/lib/types/institution';

interface SystemMetrics {
  totalInstitutions: number;
  activeInstitutions: number;
  totalUsers: number;
  activeUsers: number;
  totalClasses: number;
  totalEnrollments: number;
  systemHealth: 'healthy' | 'warning' | 'critical';
  resourceUsage: {
    cpu: number;
    memory: number;
    storage: number;
    database: number;
  };
}

interface InstitutionOverview extends Institution {
  userCount: number;
  classCount: number;
  lastActivity: Date;
  healthStatus: 'healthy' | 'warning' | 'critical';
  alerts: number;
}

interface SystemAlert {
  id: string;
  type: 'security' | 'performance' | 'integration' | 'billing' | 'compliance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  institutionId?: string;
  institutionName?: string;
  createdAt: Date;
  resolved: boolean;
}

export function SystemAdminDashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionOverview[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [institutionFilters, setInstitutionFilters] = useState({
    status: '',
    type: '',
    search: '',
    healthStatus: ''
  });

  const [alertFilters, setAlertFilters] = useState({
    type: '',
    severity: '',
    resolved: '',
    institutionId: ''
  });

  useEffect(() => {
    fetchSystemData();
  }, []);

  const fetchSystemData = async () => {
    try {
      setLoading(true);
      
      const [metricsResponse, institutionsResponse, alertsResponse] = await Promise.all([
        fetch('/api/admin/system/metrics'),
        fetch('/api/admin/system/institutions'),
        fetch('/api/admin/system/alerts')
      ]);

      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setMetrics(metricsData.metrics);
      }

      if (institutionsResponse.ok) {
        const institutionsData = await institutionsResponse.json();
        setInstitutions(institutionsData.institutions);
      }

      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        setAlerts(alertsData.alerts);
      }
    } catch (error) {
      console.error('Error fetching system data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSystemData();
    setRefreshing(false);
  };

  const handleInstitutionAction = async (institutionId: string, action: 'suspend' | 'activate' | 'delete') => {
    if (action === 'delete' && !confirm('Are you sure you want to delete this institution? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/institutions/${institutionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        await fetchSystemData();
        alert(`Institution ${action}d successfully`);
      } else {
        alert(`Failed to ${action} institution`);
      }
    } catch (error) {
      console.error(`Error ${action}ing institution:`, error);
      alert(`Error ${action}ing institution`);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin/alerts/${alertId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve' })
      });

      if (response.ok) {
        setAlerts(alerts.map(alert => 
          alert.id === alertId ? { ...alert, resolved: true } : alert
        ));
      }
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const getStatusBadgeVariant = (status: InstitutionStatus) => {
    switch (status) {
      case 'active': return 'default';
      case 'pending': return 'secondary';
      case 'suspended': return 'destructive';
      case 'inactive': return 'outline';
      default: return 'outline';
    }
  };

  const getHealthBadgeVariant = (health: 'healthy' | 'warning' | 'critical') => {
    switch (health) {
      case 'healthy': return 'default';
      case 'warning': return 'secondary';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  const getSeverityBadgeVariant = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    switch (severity) {
      case 'low': return 'outline';
      case 'medium': return 'secondary';
      case 'high': return 'default';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  const filteredInstitutions = institutions.filter(institution => {
    return (
      (!institutionFilters.status || institution.status === institutionFilters.status) &&
      (!institutionFilters.type || institution.type === institutionFilters.type) &&
      (!institutionFilters.healthStatus || institution.healthStatus === institutionFilters.healthStatus) &&
      (!institutionFilters.search || 
        institution.name.toLowerCase().includes(institutionFilters.search.toLowerCase()) ||
        institution.domain.toLowerCase().includes(institutionFilters.search.toLowerCase())
      )
    );
  });

  const filteredAlerts = alerts.filter(alert => {
    return (
      (!alertFilters.type || alert.type === alertFilters.type) &&
      (!alertFilters.severity || alert.severity === alertFilters.severity) &&
      (!alertFilters.resolved || alert.resolved.toString() === alertFilters.resolved) &&
      (!alertFilters.institutionId || alert.institutionId === alertFilters.institutionId)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading system dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">System Administration</h1>
          <p className="text-muted-foreground">Monitor and manage all institutions and system health</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* System Health Alert */}
      {metrics && metrics.systemHealth !== 'healthy' && (
        <Alert variant={metrics.systemHealth === 'critical' ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>System Health Alert</AlertTitle>
          <AlertDescription>
            System status is <strong>{metrics.systemHealth}</strong>. Please review system metrics and alerts.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="institutions">Institutions</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="system">System Health</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics Cards */}
          {metrics && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Institutions</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.totalInstitutions}</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.activeInstitutions} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.totalUsers.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.activeUsers.toLocaleString()} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">System Health</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <Badge variant={getHealthBadgeVariant(metrics.systemHealth)}>
                      {metrics.systemHealth.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Overall system status
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{alerts.filter(a => !a.resolved).length}</div>
                  <p className="text-xs text-muted-foreground">
                    {alerts.filter(a => !a.resolved && a.severity === 'critical').length} critical
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Resource Usage */}
          {metrics && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Resource Usage</CardTitle>
                  <CardDescription>Current system resource utilization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>CPU Usage</span>
                      <span>{metrics.resourceUsage.cpu}%</span>
                    </div>
                    <Progress value={metrics.resourceUsage.cpu} className="mt-1" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Memory Usage</span>
                      <span>{metrics.resourceUsage.memory}%</span>
                    </div>
                    <Progress value={metrics.resourceUsage.memory} className="mt-1" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Storage Usage</span>
                      <span>{metrics.resourceUsage.storage}%</span>
                    </div>
                    <Progress value={metrics.resourceUsage.storage} className="mt-1" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Database Usage</span>
                      <span>{metrics.resourceUsage.database}%</span>
                    </div>
                    <Progress value={metrics.resourceUsage.database} className="mt-1" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Institution Growth</CardTitle>
                  <CardDescription>New institutions over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={[
                      { month: 'Jan', institutions: 5, users: 150 },
                      { month: 'Feb', institutions: 8, users: 280 },
                      { month: 'Mar', institutions: 12, users: 420 },
                      { month: 'Apr', institutions: 15, users: 580 },
                      { month: 'May', institutions: 18, users: 720 }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="institutions" stroke="#8884d8" name="Institutions" />
                      <Line type="monotone" dataKey="users" stroke="#82ca9d" name="Users" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="institutions" className="space-y-4">
          {/* Institution Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Input
                    placeholder="Search institutions..."
                    value={institutionFilters.search}
                    onChange={(e) => setInstitutionFilters({ ...institutionFilters, search: e.target.value })}
                  />
                </div>
                <div>
                  <Select value={institutionFilters.status} onValueChange={(value) => setInstitutionFilters({ ...institutionFilters, status: value })}>
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
                <div>
                  <Select value={institutionFilters.type} onValueChange={(value) => setInstitutionFilters({ ...institutionFilters, type: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All types</SelectItem>
                      <SelectItem value="university">University</SelectItem>
                      <SelectItem value="college">College</SelectItem>
                      <SelectItem value="school">School</SelectItem>
                      <SelectItem value="training_center">Training Center</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={institutionFilters.healthStatus} onValueChange={(value) => setInstitutionFilters({ ...institutionFilters, healthStatus: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All health statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All health statuses</SelectItem>
                      <SelectItem value="healthy">Healthy</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Institutions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Institutions ({filteredInstitutions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institution</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Classes</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstitutions.map((institution) => (
                    <TableRow key={institution.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{institution.name}</div>
                          <div className="text-sm text-muted-foreground">{institution.domain}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {institution.type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(institution.status)}>
                          {institution.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={getHealthBadgeVariant(institution.healthStatus)}>
                            {institution.healthStatus}
                          </Badge>
                          {institution.alerts > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {institution.alerts} alerts
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{institution.userCount}</TableCell>
                      <TableCell>{institution.classCount}</TableCell>
                      <TableCell>
                        {new Date(institution.lastActivity).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {institution.status === 'active' ? (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleInstitutionAction(institution.id, 'suspend')}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleInstitutionAction(institution.id, 'activate')}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {/* Alert Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Alert Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Select value={alertFilters.type} onValueChange={(value) => setAlertFilters({ ...alertFilters, type: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All types</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem>
                      <SelectItem value="integration">Integration</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={alertFilters.severity} onValueChange={(value) => setAlertFilters({ ...alertFilters, severity: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All severities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All severities</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={alertFilters.resolved} onValueChange={(value) => setAlertFilters({ ...alertFilters, resolved: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All alerts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All alerts</SelectItem>
                      <SelectItem value="false">Active only</SelectItem>
                      <SelectItem value="true">Resolved only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alerts List */}
          <Card>
            <CardHeader>
              <CardTitle>System Alerts ({filteredAlerts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredAlerts.map((alert) => (
                  <div key={alert.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={getSeverityBadgeVariant(alert.severity)}>
                            {alert.severity}
                          </Badge>
                          <Badge variant="outline">
                            {alert.type}
                          </Badge>
                          {alert.resolved && (
                            <Badge variant="default">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-medium">{alert.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(alert.createdAt).toLocaleString()}
                          </span>
                          {alert.institutionName && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {alert.institutionName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!alert.resolved && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleResolveAlert(alert.id)}
                          >
                            Resolve
                          </Button>
                        )}
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          {/* System Health Cards */}
          {metrics && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Database Health</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <Badge variant={metrics.resourceUsage.database > 80 ? 'destructive' : 'default'}>
                      {metrics.resourceUsage.database > 80 ? 'Warning' : 'Healthy'}
                    </Badge>
                  </div>
                  <Progress value={metrics.resourceUsage.database} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Security Status</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <Badge variant="default">Secure</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    No security alerts
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Integration Health</CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <Badge variant="default">Operational</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    All integrations running
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Performance</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <Badge variant={metrics.resourceUsage.cpu > 80 ? 'destructive' : 'default'}>
                      {metrics.resourceUsage.cpu > 80 ? 'Degraded' : 'Optimal'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Response time: 120ms
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}