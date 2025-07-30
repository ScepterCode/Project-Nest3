'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { 
  IntegrationConfig, 
  SyncJob, 
  DataImportResult 
} from '@/lib/types/integration';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Calendar,
  Download,
  Upload,
  Settings,
  History,
  Loader2
} from 'lucide-react';

interface IntegrationSyncManagerProps {
  institutionId: string;
}

interface SyncSchedule {
  id: string;
  integrationId: string;
  enabled: boolean;
  cronExpression: string;
  syncType: 'full' | 'incremental';
  lastRun?: Date;
  nextRun?: Date;
}

export function IntegrationSyncManager({ institutionId }: IntegrationSyncManagerProps) {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [syncSchedules, setSyncSchedules] = useState<SyncSchedule[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [institutionId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [integrationsRes, jobsRes, schedulesRes] = await Promise.all([
        fetch(`/api/institutions/${institutionId}/integrations`),
        fetch(`/api/institutions/${institutionId}/sync-jobs`),
        fetch(`/api/institutions/${institutionId}/sync-schedules`),
      ]);

      const [integrationsData, jobsData, schedulesData] = await Promise.all([
        integrationsRes.json(),
        jobsRes.json(),
        schedulesRes.json(),
      ]);

      setIntegrations(integrationsData);
      setSyncJobs(jobsData);
      setSyncSchedules(schedulesData);
    } catch (error) {
      console.error('Failed to load sync data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSync = async (integrationId: string, syncType: 'full' | 'incremental') => {
    try {
      const response = await fetch(`/api/integrations/${integrationId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: syncType }),
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Failed to start sync:', error);
    }
  };

  const handleCancelSync = async (jobId: string) => {
    try {
      await fetch(`/api/sync-jobs/${jobId}/cancel`, {
        method: 'POST',
      });
      await loadData();
    } catch (error) {
      console.error('Failed to cancel sync:', error);
    }
  };

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'running':
        return 'text-blue-600 bg-blue-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'cancelled':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-yellow-600 bg-yellow-100';
    }
  };

  const getJobStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4" />;
      case 'cancelled':
        return <Pause className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const filteredJobs = selectedIntegration 
    ? syncJobs.filter(job => job.integrationId === selectedIntegration)
    : syncJobs;

  const runningJobs = syncJobs.filter(job => job.status === 'running');
  const completedJobs = syncJobs.filter(job => job.status === 'completed');
  const failedJobs = syncJobs.filter(job => job.status === 'failed');

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
          <h2 className="text-2xl font-bold">Data Sync Management</h2>
          <p className="text-gray-600">Manage data synchronization for your integrations</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button onClick={() => setShowScheduleModal(true)}>
            <Calendar className="w-4 h-4 mr-2" />
            Schedule Sync
          </Button>
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
                <p className="text-sm font-medium text-gray-600">Running Jobs</p>
                <p className="text-2xl font-bold text-blue-600">{runningJobs.length}</p>
              </div>
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed Today</p>
                <p className="text-2xl font-bold text-green-600">{completedJobs.length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Failed Jobs</p>
                <p className="text-2xl font-bold text-red-600">{failedJobs.length}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Scheduled Syncs</p>
                <p className="text-2xl font-bold">{syncSchedules.filter(s => s.enabled).length}</p>
              </div>
              <Calendar className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Manual Sync</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled Syncs</TabsTrigger>
          <TabsTrigger value="history">Sync History</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          <ManualSyncPanel 
            integrations={integrations}
            onManualSync={handleManualSync}
          />
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4">
          <ScheduledSyncPanel 
            integrations={integrations}
            syncSchedules={syncSchedules}
            onScheduleChange={loadData}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <SyncHistoryPanel 
            integrations={integrations}
            syncJobs={filteredJobs}
            selectedIntegration={selectedIntegration}
            onIntegrationChange={setSelectedIntegration}
            onCancelSync={handleCancelSync}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ManualSyncPanel({ 
  integrations, 
  onManualSync 
}: {
  integrations: IntegrationConfig[];
  onManualSync: (integrationId: string, syncType: 'full' | 'incremental') => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {integrations.map((integration) => (
        <Card key={integration.id}>
          <CardHeader>
            <CardTitle className="text-lg">{integration.name}</CardTitle>
            <CardDescription>
              {integration.type.toUpperCase()} • {integration.provider}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant={integration.enabled ? 'default' : 'secondary'}>
                {integration.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge variant="outline">
                {integration.status}
              </Badge>
            </div>

            {integration.lastSync && (
              <div className="text-sm text-gray-600">
                Last sync: {integration.lastSync.toLocaleString()}
              </div>
            )}

            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => onManualSync(integration.id, 'incremental')}
                disabled={!integration.enabled}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Incremental Sync
              </Button>
              
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onManualSync(integration.id, 'full')}
                disabled={!integration.enabled}
              >
                <Download className="w-4 h-4 mr-2" />
                Full Sync
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ScheduledSyncPanel({ 
  integrations, 
  syncSchedules, 
  onScheduleChange 
}: {
  integrations: IntegrationConfig[];
  syncSchedules: SyncSchedule[];
  onScheduleChange: () => void;
}) {
  const [editingSchedule, setEditingSchedule] = useState<SyncSchedule | null>(null);

  const handleToggleSchedule = async (scheduleId: string, enabled: boolean) => {
    try {
      await fetch(`/api/sync-schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      onScheduleChange();
    } catch (error) {
      console.error('Failed to update schedule:', error);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sync Schedules</CardTitle>
            <Button onClick={() => setEditingSchedule({} as SyncSchedule)}>
              <Calendar className="w-4 h-4 mr-2" />
              Add Schedule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {syncSchedules.map((schedule) => {
              const integration = integrations.find(i => i.id === schedule.integrationId);
              return (
                <div key={schedule.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div>
                        <p className="font-medium">{integration?.name}</p>
                        <p className="text-sm text-gray-600">
                          {schedule.syncType} sync • {schedule.cronExpression}
                        </p>
                      </div>
                    </div>
                    
                    <div className="mt-2 text-sm text-gray-600">
                      {schedule.lastRun && (
                        <span>Last run: {schedule.lastRun.toLocaleString()}</span>
                      )}
                      {schedule.nextRun && (
                        <span className="ml-4">Next run: {schedule.nextRun.toLocaleString()}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={(enabled) => handleToggleSchedule(schedule.id, enabled)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingSchedule(schedule)}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {editingSchedule && (
        <ScheduleEditModal
          schedule={editingSchedule}
          integrations={integrations}
          onSave={onScheduleChange}
          onCancel={() => setEditingSchedule(null)}
        />
      )}
    </div>
  );
}

function SyncHistoryPanel({ 
  integrations, 
  syncJobs, 
  selectedIntegration, 
  onIntegrationChange, 
  onCancelSync 
}: {
  integrations: IntegrationConfig[];
  syncJobs: SyncJob[];
  selectedIntegration: string;
  onIntegrationChange: (value: string) => void;
  onCancelSync: (jobId: string) => void;
}) {
  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'running':
        return 'text-blue-600 bg-blue-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'cancelled':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-yellow-600 bg-yellow-100';
    }
  };

  const getJobStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4" />;
      case 'cancelled':
        return <Pause className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <Select value={selectedIntegration} onValueChange={onIntegrationChange}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All integrations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Integrations</SelectItem>
            {integrations.map((integration) => (
              <SelectItem key={integration.id} value={integration.id}>
                {integration.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {syncJobs.map((job) => {
              const integration = integrations.find(i => i.id === job.integrationId);
              return (
                <SyncJobCard
                  key={job.id}
                  job={job}
                  integration={integration}
                  onCancel={onCancelSync}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SyncJobCard({ 
  job, 
  integration, 
  onCancel 
}: {
  job: SyncJob;
  integration?: IntegrationConfig;
  onCancel: (jobId: string) => void;
}) {
  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'running':
        return 'text-blue-600 bg-blue-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'cancelled':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-yellow-600 bg-yellow-100';
    }
  };

  const getJobStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4" />;
      case 'cancelled':
        return <Pause className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const duration = job.completedAt && job.startedAt
    ? job.completedAt.getTime() - job.startedAt.getTime()
    : undefined;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <div>
            <p className="font-medium">{integration?.name}</p>
            <p className="text-sm text-gray-600">
              {job.type} sync • Started {job.startedAt?.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <Badge className={getJobStatusColor(job.status)}>
            {getJobStatusIcon(job.status)}
            <span className="ml-1 capitalize">{job.status}</span>
          </Badge>
          
          {job.status === 'running' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(job.id)}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {job.progress && job.status === 'running' && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span>{job.progress.stage}</span>
            <span>{job.progress.current} / {job.progress.total}</span>
          </div>
          <Progress value={(job.progress.current / job.progress.total) * 100} />
        </div>
      )}

      {job.result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Processed</p>
            <p className="font-medium">{job.result.recordsProcessed}</p>
          </div>
          <div>
            <p className="text-gray-600">Imported</p>
            <p className="font-medium text-green-600">{job.result.recordsImported}</p>
          </div>
          <div>
            <p className="text-gray-600">Skipped</p>
            <p className="font-medium text-yellow-600">{job.result.recordsSkipped}</p>
          </div>
          <div>
            <p className="text-gray-600">Failed</p>
            <p className="font-medium text-red-600">{job.result.recordsFailed}</p>
          </div>
        </div>
      )}

      {duration && (
        <div className="mt-2 text-sm text-gray-600">
          Duration: {Math.round(duration / 1000)}s
        </div>
      )}

      {job.result?.errors && job.result.errors.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-red-600 mb-2">Errors:</p>
          <div className="bg-red-50 rounded p-2 text-sm">
            {job.result.errors.slice(0, 3).map((error, index) => (
              <p key={index} className="text-red-700">
                {error.message}
              </p>
            ))}
            {job.result.errors.length > 3 && (
              <p className="text-red-600">
                ... and {job.result.errors.length - 3} more errors
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleEditModal({ 
  schedule, 
  integrations, 
  onSave, 
  onCancel 
}: {
  schedule: SyncSchedule;
  integrations: IntegrationConfig[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState(schedule);

  const handleSave = async () => {
    try {
      const method = schedule.id ? 'PUT' : 'POST';
      const url = schedule.id 
        ? `/api/sync-schedules/${schedule.id}`
        : '/api/sync-schedules';

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      onSave();
      onCancel();
    } catch (error) {
      console.error('Failed to save schedule:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{schedule.id ? 'Edit' : 'Create'} Sync Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="integration">Integration</Label>
            <Select
              value={formData.integrationId}
              onValueChange={(value) => setFormData({ ...formData, integrationId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select integration" />
              </SelectTrigger>
              <SelectContent>
                {integrations.map((integration) => (
                  <SelectItem key={integration.id} value={integration.id}>
                    {integration.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="syncType">Sync Type</Label>
            <Select
              value={formData.syncType}
              onValueChange={(value: 'full' | 'incremental') => 
                setFormData({ ...formData, syncType: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="incremental">Incremental</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="cronExpression">Schedule (Cron Expression)</Label>
            <Input
              id="cronExpression"
              value={formData.cronExpression}
              onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
              placeholder="0 2 * * *"
            />
            <p className="text-xs text-gray-600 mt-1">
              Example: "0 2 * * *" runs daily at 2 AM
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
            />
            <Label htmlFor="enabled">Enabled</Label>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}