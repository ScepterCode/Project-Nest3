'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  TrendingUp, 
  AlertTriangle, 
  Download,
  RefreshCw,
  Activity,
  Target
} from 'lucide-react';

interface InstitutionAnalyticsDashboardProps {
  institutionId: string;
}

interface InstitutionMetrics {
  userCount: number;
  activeUsers: number;
  classCount: number;
  enrollmentCount: number;
  loginRate: number;
  contentCreationRate: number;
  engagementScore: number;
}

interface HealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  metrics: {
    userEngagement: 'healthy' | 'warning' | 'critical';
    systemPerformance: 'healthy' | 'warning' | 'critical';
    dataIntegrity: 'healthy' | 'warning' | 'critical';
    securityStatus: 'healthy' | 'warning' | 'critical';
  };
  alerts: Array<{
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    detectedAt: string;
  }>;
}

export function InstitutionAnalyticsDashboard({ institutionId }: InstitutionAnalyticsDashboardProps) {
  const [metrics, setMetrics] = useState<InstitutionMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'current_term' | 'last_term' | 'year_to_date' | 'last_year'>('current_term');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [institutionId, timeframe]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      
      const [metricsResponse, healthResponse] = await Promise.all([
        fetch(`/api/institutions/${institutionId}/analytics?type=overview&timeframe=${timeframe}`),
        fetch(`/api/institutions/${institutionId}/analytics?type=health`)
      ]);

      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setMetrics(metricsData.metrics);
      }

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        setHealth(healthData.health);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/institutions/${institutionId}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'collect_metrics' })
      });
      await fetchAnalytics();
    } catch (error) {
      console.error('Error refreshing metrics:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleExportReport = async (format: 'json' | 'csv' | 'pdf') => {
    try {
      const response = await fetch(`/api/institutions/${institutionId}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'export_report',
          format,
          type: 'user_activity'
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-report.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  const getHealthColor = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getHealthBadgeVariant = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy': return 'default';
      case 'warning': return 'secondary';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Institution Analytics</h1>
          <p className="text-muted-foreground">Monitor your institution's performance and health</p>
        </div>
        <div className="flex gap-2">
          <Select value={timeframe} onValueChange={(value: any) => setTimeframe(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_term">Current Term</SelectItem>
              <SelectItem value="last_term">Last Term</SelectItem>
              <SelectItem value="year_to_date">Year to Date</SelectItem>
              <SelectItem value="last_year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health Status Alert */}
      {health && health.overall !== 'healthy' && (
        <Alert variant={health.overall === 'critical' ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Institution Health Alert</AlertTitle>
          <AlertDescription>
            Your institution status is <strong>{health.overall}</strong>. 
            {health.alerts.length > 0 && ` ${health.alerts.length} active alerts require attention.`}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="health">Health Monitor</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics Cards */}
          {metrics && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.userCount.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.activeUsers} active users
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Classes</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.classCount.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.enrollmentCount} total enrollments
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Engagement Score</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.engagementScore.toFixed(1)}%</div>
                  <Progress value={metrics.engagementScore} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Login Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(metrics.loginRate * 100).toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">
                    Daily active rate
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>User Activity Trends</CardTitle>
                <CardDescription>Daily active users over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[
                    { date: '2024-01-01', activeUsers: 120, totalUsers: 150 },
                    { date: '2024-01-02', activeUsers: 135, totalUsers: 152 },
                    { date: '2024-01-03', activeUsers: 128, totalUsers: 155 },
                    { date: '2024-01-04', activeUsers: 142, totalUsers: 158 },
                    { date: '2024-01-05', activeUsers: 138, totalUsers: 160 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="activeUsers" stroke="#8884d8" name="Active Users" />
                    <Line type="monotone" dataKey="totalUsers" stroke="#82ca9d" name="Total Users" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Content Creation</CardTitle>
                <CardDescription>Classes and assignments created</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={[
                    { month: 'Jan', classes: 12, assignments: 45 },
                    { month: 'Feb', classes: 15, assignments: 52 },
                    { month: 'Mar', classes: 18, assignments: 48 },
                    { month: 'Apr', classes: 14, assignments: 55 },
                    { month: 'May', classes: 16, assignments: 50 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="classes" fill="#8884d8" name="Classes" />
                    <Bar dataKey="assignments" fill="#82ca9d" name="Assignments" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          {health && (
            <>
              {/* Overall Health Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Overall Health Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Badge variant={getHealthBadgeVariant(health.overall)} className="text-lg px-4 py-2">
                      {health.overall.toUpperCase()}
                    </Badge>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                      <div className="text-center">
                        <div className={`text-sm font-medium ${getHealthColor(health.metrics.userEngagement)}`}>
                          User Engagement
                        </div>
                        <div className="text-xs text-muted-foreground">{health.metrics.userEngagement}</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-sm font-medium ${getHealthColor(health.metrics.systemPerformance)}`}>
                          System Performance
                        </div>
                        <div className="text-xs text-muted-foreground">{health.metrics.systemPerformance}</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-sm font-medium ${getHealthColor(health.metrics.dataIntegrity)}`}>
                          Data Integrity
                        </div>
                        <div className="text-xs text-muted-foreground">{health.metrics.dataIntegrity}</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-sm font-medium ${getHealthColor(health.metrics.securityStatus)}`}>
                          Security Status
                        </div>
                        <div className="text-xs text-muted-foreground">{health.metrics.securityStatus}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Active Alerts */}
              {health.alerts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Active Alerts ({health.alerts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {health.alerts.map((alert) => (
                        <Alert key={alert.id} variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle className="flex items-center justify-between">
                            <span>{alert.type.replace('_', ' ').toUpperCase()}</span>
                            <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                              {alert.severity}
                            </Badge>
                          </AlertTitle>
                          <AlertDescription>
                            {alert.message}
                            <div className="text-xs text-muted-foreground mt-1">
                              Detected: {new Date(alert.detectedAt).toLocaleString()}
                            </div>
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Export Analytics Reports</CardTitle>
              <CardDescription>
                Generate and download comprehensive analytics reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Button onClick={() => handleExportReport('json')} variant="outline" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export JSON
                </Button>
                <Button onClick={() => handleExportReport('csv')} variant="outline" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button onClick={() => handleExportReport('pdf')} variant="outline" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export PDF
                </Button>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <p>All exported reports are privacy-compliant and anonymized according to data protection regulations.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}