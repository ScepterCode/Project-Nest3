/**
 * Security Monitoring Dashboard
 * 
 * Comprehensive dashboard for monitoring role-related security events,
 * suspicious activities, and system health.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Progress } from '../ui/progress';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Users, 
  TrendingUp, 
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw
} from 'lucide-react';

interface SecurityMetrics {
  totalEvents: number;
  eventsBySeverity: Record<string, number>;
  eventsByType: Record<string, number>;
  suspiciousActivities: number;
  resolvedAlerts: number;
  pendingAlerts: number;
  topRiskyUsers: Array<{ userId: string; riskScore: number; eventCount: number }>;
  institutionRiskScores: Array<{ institutionId: string; riskScore: number }>;
}

interface SecurityEvent {
  id: string;
  eventType: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  institutionId?: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
}

interface SecurityAlert {
  id: string;
  alertType: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  userId?: string;
  institutionId?: string;
  createdAt: Date;
  acknowledged: boolean;
  resolved: boolean;
}

export function SecurityMonitoringDashboard() {
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadSecurityData();
    
    if (autoRefresh) {
      const interval = setInterval(loadSecurityData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [selectedTimeRange, autoRefresh]);

  const loadSecurityData = async () => {
    try {
      setLoading(true);
      
      // Load security metrics
      const metricsResponse = await fetch(`/api/security/metrics?timeRange=${selectedTimeRange}`);
      const metricsData = await metricsResponse.json();
      setMetrics(metricsData);

      // Load recent security events
      const eventsResponse = await fetch(`/api/security/events?limit=50&timeRange=${selectedTimeRange}`);
      const eventsData = await eventsResponse.json();
      setEvents(eventsData);

      // Load security alerts
      const alertsResponse = await fetch(`/api/security/alerts?resolved=false&limit=20`);
      const alertsData = await alertsResponse.json();
      setAlerts(alertsData);

    } catch (error) {
      console.error('Failed to load security data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await fetch(`/api/security/alerts/${alertId}/acknowledge`, {
        method: 'POST'
      });
      await loadSecurityData();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleResolveAlert = async (alertId: string, resolution: string) => {
    try {
      await fetch(`/api/security/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution })
      });
      await loadSecurityData();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      case 'info': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <AlertTriangle className="h-4 w-4" />;
      case 'medium':
        return <Eye className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading security data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Monitoring</h1>
          <p className="text-muted-foreground">
            Monitor role-related security events and threats
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </Button>
          <Button onClick={loadSecurityData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {alerts.filter(a => a.severity === 'critical' && !a.resolved).length > 0 && (
        <Alert className="border-red-500 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Security Alerts</AlertTitle>
          <AlertDescription>
            {alerts.filter(a => a.severity === 'critical' && !a.resolved).length} critical security alerts require immediate attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalEvents || 0}</div>
            <p className="text-xs text-muted-foreground">
              Security events in selected period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspicious Activities</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {metrics?.suspiciousActivities || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Flagged for review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Alerts</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {metrics?.pendingAlerts || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Require attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved Alerts</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {metrics?.resolvedAlerts || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Successfully handled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">Security Alerts</TabsTrigger>
          <TabsTrigger value="events">Recent Events</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="users">Risk Analysis</TabsTrigger>
        </TabsList>

        {/* Security Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Security Alerts</CardTitle>
              <CardDescription>
                Security alerts requiring attention or review
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active security alerts</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                          {getSeverityIcon(alert.severity)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold">{alert.title}</h4>
                            <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                              {alert.severity}
                            </Badge>
                            {alert.acknowledged && (
                              <Badge variant="outline">Acknowledged</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {alert.description}
                          </p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {alert.createdAt.toLocaleString()}
                            </span>
                            {alert.userId && (
                              <span className="flex items-center">
                                <Users className="h-3 w-3 mr-1" />
                                User: {alert.userId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {!alert.acknowledged && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                          >
                            Acknowledge
                          </Button>
                        )}
                        {!alert.resolved && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResolveAlert(alert.id, 'Resolved by admin')}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Security Events</CardTitle>
              <CardDescription>
                Latest security-related activities and events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recent security events</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${getSeverityColor(event.severity)}`} />
                        <div>
                          <p className="font-medium">{event.description}</p>
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span>{event.eventType}</span>
                            <span>{event.timestamp.toLocaleString()}</span>
                            {event.userId && <span>User: {event.userId}</span>}
                          </div>
                        </div>
                      </div>
                      <Badge variant={event.severity === 'critical' ? 'destructive' : 'secondary'}>
                        {event.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Events by Severity</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics?.eventsBySeverity && (
                  <div className="space-y-3">
                    {Object.entries(metrics.eventsBySeverity).map(([severity, count]) => (
                      <div key={severity} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${getSeverityColor(severity)}`} />
                          <span className="capitalize">{severity}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{count}</span>
                          <div className="w-20">
                            <Progress 
                              value={(count / metrics.totalEvents) * 100} 
                              className="h-2"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Event Types</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics?.eventsByType && (
                  <div className="space-y-3">
                    {Object.entries(metrics.eventsByType)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="text-sm">{type.replace(/_/g, ' ')}</span>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{count}</span>
                            <div className="w-20">
                              <Progress 
                                value={(count / metrics.totalEvents) * 100} 
                                className="h-2"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Risk Analysis Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>High-Risk Users</CardTitle>
                <CardDescription>
                  Users with elevated security risk scores
                </CardDescription>
              </CardHeader>
              <CardContent>
                {metrics?.topRiskyUsers && metrics.topRiskyUsers.length > 0 ? (
                  <div className="space-y-3">
                    {metrics.topRiskyUsers.slice(0, 10).map((user) => (
                      <div key={user.userId} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{user.userId}</p>
                          <p className="text-sm text-muted-foreground">
                            {user.eventCount} events
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{user.riskScore}</span>
                          <div className="w-20">
                            <Progress 
                              value={user.riskScore} 
                              className="h-2"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No high-risk users identified</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Institution Risk Scores</CardTitle>
                <CardDescription>
                  Security risk assessment by institution
                </CardDescription>
              </CardHeader>
              <CardContent>
                {metrics?.institutionRiskScores && metrics.institutionRiskScores.length > 0 ? (
                  <div className="space-y-3">
                    {metrics.institutionRiskScores.slice(0, 10).map((institution) => (
                      <div key={institution.institutionId} className="flex items-center justify-between">
                        <span className="font-medium">{institution.institutionId}</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{institution.riskScore}</span>
                          <div className="w-20">
                            <Progress 
                              value={institution.riskScore} 
                              className="h-2"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No institution risk data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}