'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Filter, 
  Download, 
  AlertTriangle, 
  Eye, 
  Calendar,
  User,
  Shield,
  Activity,
  TrendingUp,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import {
  UserRole,
  AuditAction
} from '@/lib/types/role-management';

interface RoleAuditEntry {
  id: string;
  userId: string;
  action: AuditAction;
  oldRole?: UserRole;
  newRole?: UserRole;
  changedBy: string;
  reason?: string;
  timestamp: Date;
  institutionId?: string;
  departmentId?: string;
  metadata: Record<string, any>;
  performedByName?: string;
  performedByEmail?: string;
  userName?: string;
  userEmail?: string;
  institutionName?: string;
  departmentName?: string;
}

interface SuspiciousActivity {
  id: string;
  type: 'rapid_role_changes' | 'privilege_escalation' | 'unusual_pattern' | 'bulk_assignment_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  userId: string;
  performedBy: string;
  detectedAt: Date;
  relatedAuditIds: string[];
  metadata: Record<string, any>;
  flagged: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

interface AuditFilters {
  userId?: string;
  performedBy?: string;
  action?: AuditAction;
  role?: UserRole;
  institutionId?: string;
  departmentId?: string;
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
}

interface RoleAuditLogViewerProps {
  institutionId?: string;
  departmentId?: string;
  userId?: string;
  onEntrySelect?: (entry: RoleAuditEntry) => void;
  onSuspiciousActivityFlag?: (activityId: string, notes?: string) => void;
}

export function RoleAuditLogViewer({
  institutionId,
  departmentId,
  userId,
  onEntrySelect,
  onSuspiciousActivityFlag
}: RoleAuditLogViewerProps) {
  const [auditEntries, setAuditEntries] = useState<RoleAuditEntry[]>([]);
  const [suspiciousActivities, setSuspiciousActivities] = useState<SuspiciousActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditFilters>({
    institutionId,
    departmentId,
    userId
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<RoleAuditEntry | null>(null);
  const [activeTab, setActiveTab] = useState('audit-log');

  const pageSize = 50;

  useEffect(() => {
    loadAuditData();
  }, [filters, currentPage]);

  useEffect(() => {
    if (activeTab === 'suspicious-activity') {
      loadSuspiciousActivities();
    }
  }, [activeTab, filters]);

  const loadAuditData = async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          queryParams.append(key, value);
        }
      });
      
      queryParams.append('limit', pageSize.toString());
      queryParams.append('offset', ((currentPage - 1) * pageSize).toString());

      const response = await fetch(`/api/roles/audit?${queryParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to load audit data');
      }

      const data = await response.json();
      
      setAuditEntries(data.entries.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp)
      })));
      setTotalCount(data.totalCount);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit data');
    } finally {
      setLoading(false);
    }
  };

  const loadSuspiciousActivities = async () => {
    try {
      const queryParams = new URLSearchParams();
      
      if (filters.institutionId) {
        queryParams.append('institutionId', filters.institutionId);
      }
      if (filters.departmentId) {
        queryParams.append('departmentId', filters.departmentId);
      }
      if (filters.startDate) {
        queryParams.append('startDate', filters.startDate);
      }
      if (filters.endDate) {
        queryParams.append('endDate', filters.endDate);
      }

      const response = await fetch(`/api/roles/audit/suspicious?${queryParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to load suspicious activities');
      }

      const data = await response.json();
      
      setSuspiciousActivities(data.activities.map((activity: any) => ({
        ...activity,
        detectedAt: new Date(activity.detectedAt),
        reviewedAt: activity.reviewedAt ? new Date(activity.reviewedAt) : undefined
      })));
    } catch (err) {
      console.error('Failed to load suspicious activities:', err);
    }
  };

  const handleFilterChange = (key: keyof AuditFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
    setCurrentPage(1);
  };

  const handleSearch = (searchTerm: string) => {
    setFilters(prev => ({
      ...prev,
      searchTerm: searchTerm || undefined
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({
      institutionId,
      departmentId,
      userId
    });
    setCurrentPage(1);
  };

  const exportAuditLog = async () => {
    try {
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          queryParams.append(key, value);
        }
      });
      
      queryParams.append('export', 'true');

      const response = await fetch(`/api/roles/audit/export?${queryParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to export audit log');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `role-audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export audit log');
    }
  };

  const flagSuspiciousActivity = async (activityId: string, notes?: string) => {
    try {
      const response = await fetch(`/api/roles/audit/suspicious/${activityId}/flag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes })
      });

      if (!response.ok) {
        throw new Error('Failed to flag suspicious activity');
      }

      // Reload suspicious activities
      loadSuspiciousActivities();
      
      if (onSuspiciousActivityFlag) {
        onSuspiciousActivityFlag(activityId, notes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to flag suspicious activity');
    }
  };

  const getActionBadgeColor = (action: AuditAction) => {
    switch (action) {
      case AuditAction.ASSIGNED:
        return 'bg-green-100 text-green-800';
      case AuditAction.REVOKED:
        return 'bg-red-100 text-red-800';
      case AuditAction.CHANGED:
        return 'bg-blue-100 text-blue-800';
      case AuditAction.REQUESTED:
        return 'bg-yellow-100 text-yellow-800';
      case AuditAction.APPROVED:
        return 'bg-green-100 text-green-800';
      case AuditAction.DENIED:
        return 'bg-red-100 text-red-800';
      case AuditAction.EXPIRED:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRoleChange = (entry: RoleAuditEntry) => {
    if (entry.oldRole && entry.newRole) {
      return `${entry.oldRole} → ${entry.newRole}`;
    } else if (entry.newRole) {
      return entry.newRole;
    } else if (entry.oldRole) {
      return entry.oldRole;
    }
    return 'N/A';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Role Management Audit Log
          </CardTitle>
          <CardDescription>
            Monitor and review all role assignment and change activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="audit-log" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Audit Log
              </TabsTrigger>
              <TabsTrigger value="suspicious-activity" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Suspicious Activity
                {suspiciousActivities.filter(a => !a.flagged).length > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {suspiciousActivities.filter(a => !a.flagged).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="audit-log" className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search users, actions..."
                      value={filters.searchTerm || ''}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Action</label>
                  <Select value={filters.action || ''} onValueChange={(value) => handleFilterChange('action', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All actions</SelectItem>
                      {Object.values(AuditAction).map(action => (
                        <SelectItem key={action} value={action}>
                          {action.replace('_', ' ').toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <Select value={filters.role || ''} onValueChange={(value) => handleFilterChange('role', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All roles</SelectItem>
                      {Object.values(UserRole).map(role => (
                        <SelectItem key={role} value={role}>
                          {role.replace('_', ' ').toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={filters.startDate || ''}
                      onChange={(e) => handleFilterChange('startDate', e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      type="date"
                      value={filters.endDate || ''}
                      onChange={(e) => handleFilterChange('endDate', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={clearFilters}>
                    <Filter className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                  <Button variant="outline" onClick={exportAuditLog}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
                <div className="text-sm text-gray-600">
                  Showing {auditEntries.length} of {totalCount} entries
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Audit Log Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Role Change</TableHead>
                      <TableHead>Performed By</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <div className="flex items-center justify-center">
                            <Activity className="h-4 w-4 animate-spin mr-2" />
                            Loading audit entries...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : auditEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          No audit entries found
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditEntries.map((entry) => (
                        <TableRow key={entry.id} className="hover:bg-gray-50">
                          <TableCell className="font-mono text-sm">
                            {format(entry.timestamp, 'MMM dd, yyyy HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{entry.userName || 'Unknown User'}</div>
                              <div className="text-sm text-gray-500">{entry.userEmail}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getActionBadgeColor(entry.action)}>
                              {entry.action.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {formatRoleChange(entry)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {entry.performedByName || (entry.changedBy === 'system' ? 'System' : 'Unknown')}
                              </div>
                              {entry.performedByEmail && (
                                <div className="text-sm text-gray-500">{entry.performedByEmail}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate" title={entry.reason}>
                            {entry.reason || 'No reason provided'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedEntry(entry);
                                if (onEntrySelect) {
                                  onEntrySelect(entry);
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalCount > pageSize && (
                <div className="flex justify-between items-center">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {Math.ceil(totalCount / pageSize)}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    disabled={!hasMore}
                  >
                    Next
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="suspicious-activity" className="space-y-4">
              <div className="grid gap-4">
                {suspiciousActivities.length === 0 ? (
                  <Card>
                    <CardContent className="text-center py-8">
                      <Shield className="h-12 w-12 mx-auto text-green-500 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Suspicious Activity Detected</h3>
                      <p className="text-gray-600">All role management activities appear normal.</p>
                    </CardContent>
                  </Card>
                ) : (
                  suspiciousActivities.map((activity) => (
                    <Card key={activity.id} className={activity.flagged ? 'border-orange-200' : 'border-red-200'}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-orange-500" />
                              {activity.type.replace('_', ' ').toUpperCase()}
                              <Badge className={getSeverityBadgeColor(activity.severity)}>
                                {activity.severity.toUpperCase()}
                              </Badge>
                              {activity.flagged && (
                                <Badge variant="outline">Reviewed</Badge>
                              )}
                            </CardTitle>
                            <CardDescription>
                              Detected on {format(activity.detectedAt, 'MMM dd, yyyy HH:mm:ss')}
                            </CardDescription>
                          </div>
                          {!activity.flagged && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => flagSuspiciousActivity(activity.id, 'Flagged for review')}
                            >
                              Flag for Review
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="mb-4">{activity.description}</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">User ID:</span> {activity.userId}
                          </div>
                          <div>
                            <span className="font-medium">Performed By:</span> {activity.performedBy}
                          </div>
                          <div>
                            <span className="font-medium">Related Audits:</span> {activity.relatedAuditIds.length}
                          </div>
                          {activity.reviewedBy && (
                            <div>
                              <span className="font-medium">Reviewed By:</span> {activity.reviewedBy}
                            </div>
                          )}
                        </div>
                        {activity.reviewNotes && (
                          <div className="mt-4 p-3 bg-gray-50 rounded">
                            <span className="font-medium">Review Notes:</span>
                            <p className="mt-1">{activity.reviewNotes}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <User className="h-8 w-8 text-blue-500" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Total Entries</p>
                        <p className="text-2xl font-bold">{totalCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Activity className="h-8 w-8 text-green-500" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Role Assignments</p>
                        <p className="text-2xl font-bold">
                          {auditEntries.filter(e => e.action === AuditAction.ASSIGNED).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <AlertTriangle className="h-8 w-8 text-orange-500" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Suspicious Activities</p>
                        <p className="text-2xl font-bold">{suspiciousActivities.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Shield className="h-8 w-8 text-red-500" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Flagged Items</p>
                        <p className="text-2xl font-bold">
                          {suspiciousActivities.filter(a => a.flagged).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Entry Details Modal */}
      {selectedEntry && (
        <Card className="fixed inset-0 z-50 bg-white shadow-lg overflow-auto">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle>Audit Entry Details</CardTitle>
              <Button variant="ghost" onClick={() => setSelectedEntry(null)}>
                ×
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-medium">Entry ID</label>
                  <p className="font-mono text-sm">{selectedEntry.id}</p>
                </div>
                <div>
                  <label className="font-medium">Timestamp</label>
                  <p>{format(selectedEntry.timestamp, 'MMM dd, yyyy HH:mm:ss')}</p>
                </div>
                <div>
                  <label className="font-medium">User</label>
                  <p>{selectedEntry.userName} ({selectedEntry.userEmail})</p>
                </div>
                <div>
                  <label className="font-medium">Action</label>
                  <Badge className={getActionBadgeColor(selectedEntry.action)}>
                    {selectedEntry.action.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <label className="font-medium">Role Change</label>
                  <p className="font-mono">{formatRoleChange(selectedEntry)}</p>
                </div>
                <div>
                  <label className="font-medium">Performed By</label>
                  <p>{selectedEntry.performedByName || selectedEntry.changedBy}</p>
                </div>
              </div>
              
              {selectedEntry.reason && (
                <div>
                  <label className="font-medium">Reason</label>
                  <p>{selectedEntry.reason}</p>
                </div>
              )}
              
              {Object.keys(selectedEntry.metadata).length > 0 && (
                <div>
                  <label className="font-medium">Metadata</label>
                  <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
                    {JSON.stringify(selectedEntry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}