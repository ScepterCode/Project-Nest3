'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OnboardingMetrics, StepAnalytics, OnboardingAnalyticsFilters } from '@/lib/types/onboarding-analytics';

interface OnboardingAnalyticsDashboardProps {
  className?: string;
}

export function OnboardingAnalyticsDashboard({ className }: OnboardingAnalyticsDashboardProps) {
  const [metrics, setMetrics] = useState<OnboardingMetrics | null>(null);
  const [stepAnalytics, setStepAnalytics] = useState<StepAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OnboardingAnalyticsFilters>({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0]
  });

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch overall metrics
      const metricsResponse = await fetch('/api/onboarding/analytics/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
      });

      if (!metricsResponse.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const metricsData = await metricsResponse.json();
      setMetrics(metricsData.data);

      // Fetch step analytics
      const stepResponse = await fetch('/api/onboarding/analytics/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
      });

      if (!stepResponse.ok) {
        throw new Error('Failed to fetch step analytics');
      }

      const stepData = await stepResponse.json();
      setStepAnalytics(stepData.data);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleFilterChange = (key: keyof OnboardingAnalyticsFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  };

  const applyFilters = () => {
    fetchAnalytics();
  };

  const resetFilters = () => {
    setFilters({
      dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0]
    });
  };

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;
  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className}`}>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <p>Error loading analytics: {error}</p>
              <Button onClick={fetchAnalytics} className="mt-4">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Onboarding Analytics</h2>
        <Button onClick={fetchAnalytics} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select value={filters.role || ''} onValueChange={(value) => handleFilterChange('role', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All roles</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="department_admin">Department Admin</SelectItem>
                  <SelectItem value="institution_admin">Institution Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={applyFilters}>Apply</Button>
              <Button onClick={resetFilters} variant="outline">Reset</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalSessions || 0}</div>
            <p className="text-xs text-muted-foreground">
              Onboarding sessions started
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.completedSessions || 0}</div>
            <p className="text-xs text-muted-foreground">
              Sessions completed successfully
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPercentage(metrics?.completionRate || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Overall success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg. Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTime(metrics?.averageCompletionTime || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average completion time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Completion by Role */}
      <Card>
        <CardHeader>
          <CardTitle>Completion by Role</CardTitle>
          <CardDescription>
            Onboarding success rates broken down by user role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(metrics?.completionByRole || {}).map(([role, data]) => (
              <div key={role} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="capitalize">
                    {role.replace('_', ' ')}
                  </Badge>
                  <div className="text-sm text-muted-foreground">
                    {data.completed} of {data.started} completed
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">
                    {formatPercentage(data.rate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Step-by-Step Analysis</CardTitle>
          <CardDescription>
            Detailed breakdown of user progression through onboarding steps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stepAnalytics.map((step) => (
              <div key={`${step.stepNumber}-${step.stepName}`} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">
                    Step {step.stepNumber}: {step.stepName.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h4>
                  <Badge variant={step.completionRate >= 80 ? 'default' : step.completionRate >= 60 ? 'secondary' : 'destructive'}>
                    {formatPercentage(step.completionRate)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Started</div>
                    <div className="font-medium">{step.totalStarted}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Completed</div>
                    <div className="font-medium">{step.totalCompleted}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Skipped</div>
                    <div className="font-medium">{step.totalSkipped}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Abandoned</div>
                    <div className="font-medium">{step.totalAbandoned}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Drop-off Points */}
      {metrics?.dropOffByStep && Object.keys(metrics.dropOffByStep).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Drop-off Points</CardTitle>
            <CardDescription>
              Where users are most likely to abandon the onboarding process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(metrics.dropOffByStep)
                .sort(([,a], [,b]) => b - a)
                .map(([step, percentage]) => (
                  <div key={step} className="flex items-center justify-between p-3 border rounded">
                    <div className="font-medium capitalize">
                      {step.replace('_', ' ')}
                    </div>
                    <Badge variant="destructive">
                      {formatPercentage(percentage)}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}