'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  EnrollmentAnalytics, 
  EnrollmentConflict, 
  InstitutionPolicy,
  EnrollmentReport,
  EnrollmentAnalyticsService
} from '@/lib/services/enrollment-analytics';
import { 
  ConflictResolution,
  EnrollmentConflictResolver,
  EnrollmentOverride
} from '@/lib/services/enrollment-conflict-resolver';
import { 
  EnrollmentReportingService,
  ReportParameters 
} from '@/lib/services/enrollment-reporting';

interface InstitutionAdminDashboardProps {
  institutionId: string;
  institutionName: string;
}

export function InstitutionAdminDashboard({ institutionId, institutionName }: InstitutionAdminDashboardProps) {
  const [analytics, setAnalytics] = useState<EnrollmentAnalytics | null>(null);
  const [conflicts, setConflicts] = useState<EnrollmentConflict[]>([]);
  const [policies, setPolicies] = useState<InstitutionPolicy[]>([]);
  const [reports, setReports] = useState<EnrollmentReport[]>([]);
  const [overrides, setOverrides] = useState<EnrollmentOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'current_term' | 'last_term' | 'year_to_date' | 'last_year'>('current_term');
  const [showConflictResolution, setShowConflictResolution] = useState<string | null>(null);
  const [showOverrideRequest, setShowOverrideRequest] = useState(false);
  const [resolutionForm, setResolutionForm] = useState({
    type: 'manual_override' as ConflictResolution['resolutionType'],
    description: '',
    actionTaken: '',
    notes: ''
  });

  // Service instances
  const analyticsService = new EnrollmentAnalyticsService();
  const conflictResolver = new EnrollmentConflictResolver();
  const reportingService = new EnrollmentReportingService();

  useEffect(() => {
    loadDashboardData();
  }, [institutionId, selectedTimeframe]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load real analytics data
      const analyticsData = await analyticsService.getInstitutionAnalytics(institutionId, selectedTimeframe);
      setAnalytics(analyticsData);

      // Load conflicts
      const conflictsData = await conflictResolver.detectConflicts(institutionId);
      setConflicts(conflictsData);

      // Load policies
      const policiesData = await analyticsService.getInstitutionPolicies(institutionId);
      setPolicies(policiesData);

      // Mock reports for now
      const mockReports: EnrollmentReport[] = [
        {
          id: '1',
          name: 'Fall 2024 Enrollment Summary',
          type: 'enrollment_summary',
          description: 'Comprehensive enrollment statistics for Fall 2024',
          parameters: {},
          generatedAt: new Date(),
          status: 'completed'
        }
      ];
      setReports(mockReports);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // Fallback to mock data on error
      setAnalytics({
        totalEnrollments: 15420,
        totalCapacity: 18500,
        utilizationRate: 83.4,
        totalWaitlisted: 892,
        enrollmentTrends: [
          { period: 'Fall 2024', enrollments: 15420, capacity: 18500, utilization: 83.4, waitlisted: 892, dropouts: 234 }
        ],
        departmentStats: [
          { departmentId: '1', departmentName: 'Computer Science', enrollments: 3240, capacity: 3600, utilization: 90.0, waitlisted: 245, averageClassSize: 32, totalClasses: 101 }
        ],
        conflictAlerts: [],
        capacityUtilization: [],
        waitlistStatistics: {
          totalWaitlisted: 892,
          averageWaitTime: 7,
          promotionRate: 65,
          departmentBreakdown: []
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConflictAction = async (conflictId: string, action: 'investigate' | 'resolve' | 'dismiss') => {
    if (action === 'resolve') {
      setShowConflictResolution(conflictId);
    } else {
      setConflicts(prev => prev.map(conflict => 
        conflict.id === conflictId 
          ? { ...conflict, status: action === 'investigate' ? 'investigating' : 'dismissed' }
          : conflict
      ));
    }
  };

  const handleConflictResolution = async (conflictId: string) => {
    try {
      const resolution: ConflictResolution = {
        conflictId,
        resolutionType: resolutionForm.type,
        description: resolutionForm.description,
        actionTaken: resolutionForm.actionTaken,
        resolvedBy: 'current-admin', // This would come from auth context
        resolvedAt: new Date(),
        affectedStudents: [], // This would be populated based on the conflict
        notes: resolutionForm.notes
      };

      await conflictResolver.resolveConflict(conflictId, resolution);
      
      setConflicts(prev => prev.map(conflict => 
        conflict.id === conflictId 
          ? { ...conflict, status: 'resolved', resolutionNotes: resolution.description }
          : conflict
      ));
      
      setShowConflictResolution(null);
      setResolutionForm({
        type: 'manual_override',
        description: '',
        actionTaken: '',
        notes: ''
      });
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  };

  const handlePolicyUpdate = async (policyId: string, updates: Partial<InstitutionPolicy>) => {
    try {
      await analyticsService.updateInstitutionPolicy(policyId, updates, 'current-admin');
      setPolicies(prev => prev.map(policy => 
        policy.id === policyId ? { ...policy, ...updates, lastModified: new Date() } : policy
      ));
    } catch (error) {
      console.error('Failed to update policy:', error);
    }
  };

  const handleGenerateReport = async (reportType: EnrollmentReport['type']) => {
    try {
      const parameters: ReportParameters = {
        institutionId,
        timeframe: {
          startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
          endDate: new Date()
        },
        includeWaitlist: true,
        includeDropouts: true,
        format: 'json'
      };

      let reportData;
      let reportName = '';
      
      switch (reportType) {
        case 'enrollment_summary':
          reportData = await reportingService.generateEnrollmentSummary(parameters);
          reportName = 'Enrollment Summary Report';
          break;
        case 'capacity_analysis':
          reportData = await reportingService.generateCapacityAnalysis(parameters);
          reportName = 'Capacity Analysis Report';
          break;
        case 'waitlist_report':
          reportData = await reportingService.generateWaitlistReport(parameters);
          reportName = 'Waitlist Analysis Report';
          break;
        case 'trend_analysis':
          reportData = await reportingService.generateTrendAnalysis(parameters);
          reportName = 'Trend Analysis Report';
          break;
      }

      // Add the new report to the list
      const newReport: EnrollmentReport = {
        id: `report-${Date.now()}`,
        name: reportName,
        type: reportType,
        description: `Generated ${reportName.toLowerCase()} for ${institutionName}`,
        parameters,
        generatedAt: new Date(),
        status: 'completed'
      };

      setReports(prev => [newReport, ...prev]);
      
      // In a real implementation, you would save the report data and provide download functionality
      console.log('Generated report:', reportData);
      
    } catch (error) {
      console.error('Failed to generate report:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'destructive';
      case 'investigating': return 'default';
      case 'resolved': return 'secondary';
      case 'dismissed': return 'outline';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{institutionName} Enrollment Administration</h1>
          <p className="text-gray-600">Institutional enrollment oversight and policy management</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_term">Current Term</SelectItem>
              <SelectItem value="last_term">Last Term</SelectItem>
              <SelectItem value="year_to_date">Year to Date</SelectItem>
              <SelectItem value="last_year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={loadDashboardData} variant="outline">
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Key Metrics Overview */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Enrollments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalEnrollments.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Capacity Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.utilizationRate.toFixed(1)}%</div>
              <Progress value={analytics.utilizationRate} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Waitlisted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalWaitlisted.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Conflicts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {conflicts.filter(c => c.status === 'open').length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          {analytics && (
            <>
              {/* Department Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle>Department Enrollment Statistics</CardTitle>
                  <CardDescription>
                    Enrollment performance across all departments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analytics.departmentStats.map((dept) => (
                      <div key={dept.departmentId} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-semibold">{dept.departmentName}</h3>
                          <p className="text-sm text-gray-600">
                            {dept.enrollments} enrolled • {dept.waitlisted} waitlisted
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{dept.utilization.toFixed(1)}%</div>
                          <div className="text-sm text-gray-600">
                            {dept.enrollments}/{dept.capacity}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Enrollment Trends */}
              <Card>
                <CardHeader>
                  <CardTitle>Enrollment Trends</CardTitle>
                  <CardDescription>
                    Historical enrollment patterns and capacity utilization
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analytics.enrollmentTrends.map((trend, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="font-medium">{trend.period}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-gray-600">
                            {trend.enrollments}/{trend.capacity}
                          </span>
                          <div className="w-32">
                            <Progress value={trend.utilization} />
                          </div>
                          <span className="text-sm font-medium w-12">
                            {trend.utilization.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enrollment Conflicts & Alerts</CardTitle>
              <CardDescription>
                Issues requiring administrative attention and resolution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {conflicts.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No active conflicts detected
                  </p>
                ) : (
                  conflicts.map((conflict) => (
                    <div key={conflict.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={getSeverityColor(conflict.severity)}>
                              {conflict.severity.toUpperCase()}
                            </Badge>
                            <Badge variant={getStatusColor(conflict.status)}>
                              {conflict.status.toUpperCase()}
                            </Badge>
                            <span className="text-sm text-gray-600">
                              {conflict.type.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                          <p className="text-gray-700 mb-2">{conflict.description}</p>
                          <div className="text-sm text-gray-600">
                            Affects {conflict.affectedStudents} student(s) • 
                            Detected {conflict.detectedAt.toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {conflict.status === 'open' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleConflictAction(conflict.id, 'investigate')}
                              >
                                Investigate
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleConflictAction(conflict.id, 'resolve')}
                              >
                                Resolve
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleConflictAction(conflict.id, 'dismiss')}
                              >
                                Dismiss
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Institution Enrollment Policies</CardTitle>
              <CardDescription>
                Manage institution-wide enrollment rules and procedures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {policies.map((policy) => (
                  <div key={policy.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{policy.name}</h3>
                          <Badge variant={policy.isActive ? 'default' : 'secondary'}>
                            {policy.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <p className="text-gray-700 mb-2">{policy.description}</p>
                        <div className="text-sm text-gray-600">
                          Type: {policy.type.replace('_', ' ')} • 
                          Scope: {policy.scope} • 
                          Modified: {policy.lastModified.toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm text-gray-600">Current Value</div>
                          <div className="font-medium">{String(policy.value)}</div>
                        </div>
                        <Switch
                          checked={policy.isActive}
                          onCheckedChange={(checked) => 
                            handlePolicyUpdate(policy.id, { isActive: checked })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enrollment Reports</CardTitle>
              <CardDescription>
                Generate and manage comprehensive enrollment reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => handleGenerateReport('enrollment_summary')}>
                    Generate Enrollment Summary
                  </Button>
                  <Button variant="outline" onClick={() => handleGenerateReport('capacity_analysis')}>
                    Capacity Analysis
                  </Button>
                  <Button variant="outline" onClick={() => handleGenerateReport('waitlist_report')}>
                    Waitlist Report
                  </Button>
                  <Button variant="outline" onClick={() => handleGenerateReport('trend_analysis')}>
                    Trend Analysis
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  {reports.map((report) => (
                    <div key={report.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{report.name}</h4>
                        <p className="text-sm text-gray-600">{report.description}</p>
                        {report.generatedAt && (
                          <p className="text-xs text-gray-500">
                            Generated: {report.generatedAt.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          report.status === 'completed' ? 'default' :
                          report.status === 'generating' ? 'secondary' :
                          report.status === 'failed' ? 'destructive' : 'outline'
                        }>
                          {report.status}
                        </Badge>
                        {report.status === 'completed' && (
                          <Button size="sm" variant="outline">
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Conflict Resolution Modal */}
      {showConflictResolution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Resolve Conflict</h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="resolution-type">Resolution Type</Label>
                <Select 
                  value={resolutionForm.type} 
                  onValueChange={(value) => setResolutionForm(prev => ({ ...prev, type: value as ConflictResolution['resolutionType'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual_override">Manual Override</SelectItem>
                    <SelectItem value="capacity_increase">Increase Capacity</SelectItem>
                    <SelectItem value="student_transfer">Transfer Students</SelectItem>
                    <SelectItem value="policy_exception">Policy Exception</SelectItem>
                    <SelectItem value="dismiss">Dismiss</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={resolutionForm.description}
                  onChange={(e) => setResolutionForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the resolution approach..."
                />
              </div>

              <div>
                <Label htmlFor="action-taken">Action Taken</Label>
                <Textarea
                  id="action-taken"
                  value={resolutionForm.actionTaken}
                  onChange={(e) => setResolutionForm(prev => ({ ...prev, actionTaken: e.target.value }))}
                  placeholder="Describe the specific actions taken..."
                />
              </div>

              <div>
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={resolutionForm.notes}
                  onChange={(e) => setResolutionForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes or context..."
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button 
                onClick={() => handleConflictResolution(showConflictResolution)}
                disabled={!resolutionForm.description || !resolutionForm.actionTaken}
              >
                Resolve Conflict
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowConflictResolution(null);
                  setResolutionForm({
                    type: 'manual_override',
                    description: '',
                    actionTaken: '',
                    notes: ''
                  });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}