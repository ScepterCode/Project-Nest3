'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Activity, 
  Database, 
  Zap, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  TrendingUp,
  Clock,
  Users
} from 'lucide-react';

interface DatabaseMetrics {
  connections: {
    total: number;
    active: number;
    idle: number;
    waiting: number;
    maxConnections: number;
  };
  queries: {
    totalQueries: number;
    averageQueryTime: number;
    slowQueries: number;
    queriesPerSecond: number;
    cacheHitRate: number;
  };
  database: {
    size: string;
    tableCount: number;
    indexSize: string;
    totalSize: string;
  };
  performance: {
    cacheHitRatio: number;
    transactionsPerSecond: number;
    blocksRead: number;
    blocksHit: number;
    deadlocks: number;
  };
  health: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: string;
    lastBackup?: string;
    replicationLag?: number;
  };
  timestamp: string;
}

interface SlowQuery {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  rows: number;
  hitPercent: number;
}

interface SystemAlert {
  id: string;
  type: 'connection' | 'performance' | 'storage' | 'replication';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  resolved: boolean;
}

interface PerformanceData {
  metrics: DatabaseMetrics;
  slowQueries: SlowQuery[];
  activeAlerts: SystemAlert[];
  connectionPool: any;
  cacheMetrics: any;
}

export default function DatabasePerformanceDashboard() {
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  useEffect(() => {
    fetchPerformanceData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchPerformanceData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  const fetchPerformanceData = async () => {
    try {
      setError(null);
      const response = await fetch('/api/database/performance?details=true');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPerformanceData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch performance data');
    } finally {
      setLoading(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/database/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_alert', alertId })
      });
      
      if (response.ok) {
        await fetchPerformanceData(); // Refresh data
      }
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  };

  const resetMetrics = async () => {
    try {
      const response = await fetch('/api/database/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_metrics' })
      });
      
      if (response.ok) {
        await fetchPerformanceData(); // Refresh data
      }
    } catch (err) {
      console.error('Failed to reset metrics:', err);
    }
  };

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'critical':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'secondary';
      case 'info':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading performance data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!performanceData) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>No performance data available</AlertDescription>
      </Alert>
    );
  }

  const { metrics, slowQueries, activeAlerts, connectionPool, cacheMetrics } = performanceData;
  const connectionUtilization = (metrics.connections.active / metrics.connections.maxConnections) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Database Performance</h1>
          <p className="text-muted-foreground">
            Real-time monitoring and performance metrics
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
            Auto Refresh: {autoRefresh ? 'On' : 'Off'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPerformanceData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={resetMetrics}
          >
            Reset Metrics
          </Button>
        </div>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            {getHealthStatusIcon(metrics.health.status)}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{metrics.health.status}</div>
            <p className="text-xs text-muted-foreground">
              Uptime: {metrics.health.uptime}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connections</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.connections.active}/{metrics.connections.maxConnections}
            </div>
            <Progress value={connectionUtilization} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {connectionUtilization.toFixed(1)}% utilization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Ratio</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.performance.cacheHitRatio.toFixed(1)}%
            </div>
            <Progress value={metrics.performance.cacheHitRatio} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Database cache efficiency
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Query Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.queries.averageQueryTime.toFixed(2)}ms
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.queries.queriesPerSecond.toFixed(1)} queries/sec
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
              Active Alerts ({activeAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge variant={getSeverityBadgeVariant(alert.severity)}>
                      {alert.severity}
                    </Badge>
                    <div>
                      <p className="font-medium">{alert.message}</p>
                      <p className="text-sm text-muted-foreground">
                        {alert.type} • {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resolveAlert(alert.id)}
                  >
                    Resolve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Metrics */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="queries">Slow Queries</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Query Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Total Queries</span>
                  <span className="font-mono">{metrics.queries.totalQueries.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Slow Queries</span>
                  <span className="font-mono">{metrics.queries.slowQueries}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cache Hit Rate</span>
                  <span className="font-mono">{metrics.queries.cacheHitRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Queries/Second</span>
                  <span className="font-mono">{metrics.queries.queriesPerSecond.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Database Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Transactions/Second</span>
                  <span className="font-mono">{metrics.performance.transactionsPerSecond.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Blocks Read</span>
                  <span className="font-mono">{metrics.performance.blocksRead.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Blocks Hit</span>
                  <span className="font-mono">{metrics.performance.blocksHit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deadlocks</span>
                  <span className="font-mono">{metrics.performance.deadlocks}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="queries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Slow Queries</CardTitle>
              <CardDescription>
                Queries with average execution time above threshold
              </CardDescription>
            </CardHeader>
            <CardContent>
              {slowQueries.length === 0 ? (
                <p className="text-muted-foreground">No slow queries detected</p>
              ) : (
                <div className="space-y-4">
                  {slowQueries.map((query, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline">
                          {query.meanTime.toFixed(2)}ms avg
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          {query.calls} calls • {query.hitPercent.toFixed(1)}% cache hit
                        </div>
                      </div>
                      <code className="text-sm bg-muted p-2 rounded block overflow-x-auto">
                        {query.query.length > 200 
                          ? `${query.query.substring(0, 200)}...` 
                          : query.query
                        }
                      </code>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Connection Pool Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Total Connections</span>
                  <span className="font-mono">{metrics.connections.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Connections</span>
                  <span className="font-mono">{metrics.connections.active}</span>
                </div>
                <div className="flex justify-between">
                  <span>Idle Connections</span>
                  <span className="font-mono">{metrics.connections.idle}</span>
                </div>
                <div className="flex justify-between">
                  <span>Waiting Clients</span>
                  <span className="font-mono">{metrics.connections.waiting}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Connections</span>
                  <span className="font-mono">{metrics.connections.maxConnections}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cache Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Cache Hits</span>
                  <span className="font-mono">{cacheMetrics.hits.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cache Misses</span>
                  <span className="font-mono">{cacheMetrics.misses.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hit Rate</span>
                  <span className="font-mono">{(cacheMetrics.hitRate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Requests</span>
                  <span className="font-mono">{cacheMetrics.totalRequests.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Response Time</span>
                  <span className="font-mono">{cacheMetrics.averageResponseTime.toFixed(2)}ms</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Database Storage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span>Database Size</span>
                <span className="font-mono">{metrics.database.size}</span>
              </div>
              <div className="flex justify-between">
                <span>Index Size</span>
                <span className="font-mono">{metrics.database.indexSize}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Size</span>
                <span className="font-mono">{metrics.database.totalSize}</span>
              </div>
              <div className="flex justify-between">
                <span>Table Count</span>
                <span className="font-mono">{metrics.database.tableCount}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground">
        Last updated: {new Date(metrics.timestamp).toLocaleString()}
      </div>
    </div>
  );
}