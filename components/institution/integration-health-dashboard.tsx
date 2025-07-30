'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  IntegrationHealth, 
  IntegrationConfig, 
  AlertRule 
} from '@/lib/types/integration';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  Settings,
  TrendingUp,
  TrendingDown,
  Zap
} from 'lucide-react';

interface IntegrationHealthDashboardProps {
  institutionId: string;
}

export function IntegrationHealthDashboard({ institutionId }: IntegrationHealthDashboardProps) {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [healthData, setHealthData] = useState<IntegrationHealth[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [institutionId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [integrationsRes, healthRes, alertsRes] = await Promise.all([
        fetch(`/api/institutions/${institutionId}/integrations`),
        fetch(`/api/institutions/${institutionId}/integrations/health`),
        fetch(`/api/institutions/${institutionId}/integrations/alerts`),
      ]);

      const [integrationsData, healthDataRes, alertsData] = await Promise.all([
        integrationsRes.json(),
        healthRes.json(),
        alertsRes.json(),
      ]);

      setIntegrations(integrationsData);
      setHealthData(healthDataRes);
      setAlertRules(alertsData);
    } catch (error) {
      console.error('Failed to load integration data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunHealthCheck = async (integrationId: string) => {
    try {
      await fetch(`/api/integrations/${integrationId}/health-check`, {
        method: 'POST',
      });
      await loadData();
    } catch (error) {
      console.error('Failed to run health check:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'error':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const filteredHealthData = selectedIntegration === 'all' 
    ? healthData 
    : healthData.filter(h => h.integrationId === selectedIntegration);

  const overallHealth = {
    healthy: healthData.filter(h => h.status === 'healthy').length,
    warning: healthData.filter(h => h.status === 'warning').length,
    error: healthData.filter(h => h.status === 'error').length,
    total: healthData.length,
  };

  const averageUptime = healthData.length > 0 
    ? healthData.reduce((sum, h) => sum + h.uptime, 0) / healthData.length 
    : 0;

  const averageResponseTime = healthData.length > 0
    ? healthData.reduce((sum, h) => sum + (h.responseTime || 0), 0) / healthData.length
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Integration Health Dashboard</h2>
          <p className="text-gray-600">Monitor the health and performance of your integrations</p>
        </div>
        <div className="flex items-center space-x-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Integrations</p>
                <p className="text-2xl font-bold">{overallHealth.total}</p>
              </div>
              <Activity className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Average Uptime</p>
                <p className="text-2xl font-bold">{averageUptime.toFixed(1)}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
                <p className="text-2xl font-bold">{averageResponseTime.toFixed(0)}ms</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Alerts</p>
                <p className="text-2xl font-bold text-red-600">{overallHealth.error}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Health Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Healthy</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{overallHealth.healthy}</span>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ width: `${(overallHealth.healthy / overallHealth.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span>Warning</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{overallHealth.warning}</span>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-yellow-600 h-2 rounded-full" 
                    style={{ width: `${(overallHealth.warning / overallHealth.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Error</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{overallHealth.error}</span>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-red-600 h-2 rounded-full" 
                    style={{ width: `${(overallHealth.error / overallHealth.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integration Details */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Detailed View</TabsTrigger>
          <TabsTrigger value="alerts">Alert Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-center space-x-4 mb-4">
            <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select integration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Integrations</SelectItem>
                {integrations.map((integration) => (
                  <SelectItem key={integration.id} value={integration.id}>
                    {integration.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredHealthData.map((health) => {
              const integration = integrations.find(i => i.id === health.integrationId);
              return (
                <IntegrationHealthCard
                  key={health.integrationId}
                  integration={integration}
                  health={health}
                  onRunHealthCheck={handleRunHealthCheck}
                />
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <IntegrationDetailsTable 
            integrations={integrations}
            healthData={healthData}
            onRunHealthCheck={handleRunHealthCheck}
          />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <AlertRulesManager 
            integrations={integrations}
            alertRules={alertRules}
            onRulesChange={loadData}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IntegrationHealthCard({ 
  integration, 
  health, 
  onRunHealthCheck 
}: {
  integration?: IntegrationConfig;
  health: IntegrationHealth;
  onRunHealthCheck: (id: string) => void;
}) {
  if (!integration) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'error':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{integration.name}</CardTitle>
          <Badge className={getStatusColor(health.status)}>
            {getStatusIcon(health.status)}
            <span className="ml-1 capitalize">{health.status}</span>
          </Badge>
        </div>
        <CardDescription>
          {integration.type.toUpperCase()} • {integration.provider}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Uptime</span>
            <span className="font-medium">{health.uptime.toFixed(1)}%</span>
          </div>
          <Progress value={health.uptime} className="h-2" />
        </div>

        {health.responseTime && (
          <div className="flex justify-between text-sm">
            <span>Response Time</span>
            <span className="font-medium">{health.responseTime}ms</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Successful Syncs</p>
            <p className="font-medium text-green-600">{health.metrics.successfulSyncs}</p>
          </div>
          <div>
            <p className="text-gray-600">Failed Syncs</p>
            <p className="font-medium text-red-600">{health.metrics.failedSyncs}</p>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Last checked: {health.lastCheck.toLocaleString()}
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={() => onRunHealthCheck(health.integrationId)}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Run Health Check
        </Button>
      </CardContent>
    </Card>
  );
}

function IntegrationDetailsTable({ 
  integrations, 
  healthData, 
  onRunHealthCheck 
}: {
  integrations: IntegrationConfig[];
  healthData: IntegrationHealth[];
  onRunHealthCheck: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integration Details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Uptime</th>
                <th className="text-left py-2">Response Time</th>
                <th className="text-left py-2">Last Check</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((integration) => {
                const health = healthData.find(h => h.integrationId === integration.id);
                return (
                  <tr key={integration.id} className="border-b">
                    <td className="py-3">
                      <div>
                        <p className="font-medium">{integration.name}</p>
                        <p className="text-sm text-gray-600">{integration.provider}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge variant="outline">{integration.type.toUpperCase()}</Badge>
                    </td>
                    <td className="py-3">
                      {health ? (
                        <Badge className={getStatusColor(health.status)}>
                          {health.status}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Unknown</Badge>
                      )}
                    </td>
                    <td className="py-3">
                      {health ? `${health.uptime.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3">
                      {health?.responseTime ? `${health.responseTime}ms` : '-'}
                    </td>
                    <td className="py-3">
                      {health ? health.lastCheck.toLocaleString() : '-'}
                    </td>
                    <td className="py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRunHealthCheck(integration.id)}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertRulesManager({ 
  integrations, 
  alertRules, 
  onRulesChange 
}: {
  integrations: IntegrationConfig[];
  alertRules: AlertRule[];
  onRulesChange: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Alert Rules</CardTitle>
          <Button>
            <Settings className="w-4 h-4 mr-2" />
            Add Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {alertRules.map((rule) => {
            const integration = integrations.find(i => i.id === rule.integrationId);
            return (
              <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{integration?.name}</p>
                  <p className="text-sm text-gray-600">
                    {rule.type} threshold: {rule.threshold}
                    {rule.type === 'uptime' || rule.type === 'error_rate' ? '%' : 'ms'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'healthy':
      return 'text-green-600 bg-green-100';
    case 'warning':
      return 'text-yellow-600 bg-yellow-100';
    case 'error':
      return 'text-red-600 bg-red-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}