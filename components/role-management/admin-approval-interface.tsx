"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserRole, RoleRequestStatus } from '@/lib/types/role-management';
import { 
  Check, 
  X, 
  Clock, 
  User, 
  Calendar,
  AlertTriangle,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoleRequest {
  id: string;
  user_id: string;
  requested_role: UserRole;
  current_role?: UserRole;
  justification: string;
  status: RoleRequestStatus;
  requested_at: string;
  expires_at: string;
  institution_id: string;
  department_id?: string;
  users: {
    id: string;
    email: string;
    full_name?: string;
    created_at: string;
  };
  canApprove: boolean;
  daysUntilExpiration: number;
  isUrgent: boolean;
}

interface AdminApprovalInterfaceProps {
  institutionId?: string;
  departmentId?: string;
  onRequestProcessed?: (requestId: string, action: 'approved' | 'denied') => void;
}

const ROLE_LABELS = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.DEPARTMENT_ADMIN]: 'Department Admin',
  [UserRole.INSTITUTION_ADMIN]: 'Institution Admin',
  [UserRole.SYSTEM_ADMIN]: 'System Admin'
};

const ROLE_COLORS = {
  [UserRole.STUDENT]: 'bg-blue-100 text-blue-800',
  [UserRole.TEACHER]: 'bg-green-100 text-green-800',
  [UserRole.DEPARTMENT_ADMIN]: 'bg-purple-100 text-purple-800',
  [UserRole.INSTITUTION_ADMIN]: 'bg-orange-100 text-orange-800',
  [UserRole.SYSTEM_ADMIN]: 'bg-red-100 text-red-800'
};

export function AdminApprovalInterface({
  institutionId,
  departmentId,
  onRequestProcessed
}: AdminApprovalInterfaceProps) {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('all');
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetchPendingRequests();
  }, [institutionId, departmentId]);

  const fetchPendingRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (institutionId) params.append('institutionId', institutionId);
      if (departmentId) params.append('departmentId', departmentId);

      const response = await fetch(`/api/roles/requests/pending?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch pending requests');
      }

      setRequests(data.data.requests);
      setSummary(data.data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string, notes?: string) => {
    try {
      setProcessingRequests(prev => new Set(prev).add(requestId));

      const response = await fetch(`/api/roles/requests/${requestId}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve request');
      }

      // Remove the request from the list
      setRequests(prev => prev.filter(req => req.id !== requestId));
      onRequestProcessed?.(requestId, 'approved');

      // Refresh summary
      await fetchPendingRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const handleDeny = async (requestId: string, reason: string) => {
    if (!reason.trim()) {
      setError('Please provide a reason for denial');
      return;
    }

    try {
      setProcessingRequests(prev => new Set(prev).add(requestId));

      const response = await fetch(`/api/roles/requests/${requestId}/deny`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to deny request');
      }

      // Remove the request from the list
      setRequests(prev => prev.filter(req => req.id !== requestId));
      onRequestProcessed?.(requestId, 'denied');

      // Refresh summary
      await fetchPendingRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny request');
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const toggleExpanded = (requestId: string) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  };

  const filteredRequests = requests.filter(request => {
    switch (activeTab) {
      case 'urgent':
        return request.isUrgent;
      case 'teacher':
        return request.requested_role === UserRole.TEACHER;
      case 'admin':
        return [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN].includes(request.requested_role);
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading pending requests...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Total Pending</p>
                  <p className="text-2xl font-bold">{summary.totalPending}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-sm text-gray-600">Urgent</p>
                  <p className="text-2xl font-bold text-orange-600">{summary.urgent}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm text-gray-600">Teachers</p>
                  <p className="text-2xl font-bold">{summary.byRole[UserRole.TEACHER] || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm text-gray-600">Admins</p>
                  <p className="text-2xl font-bold">
                    {(summary.byRole[UserRole.DEPARTMENT_ADMIN] || 0) + 
                     (summary.byRole[UserRole.INSTITUTION_ADMIN] || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pending Role Requests</CardTitle>
            <CardDescription>
              Review and approve or deny role requests from users
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPendingRequests}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
              <TabsTrigger value="urgent">
                Urgent ({requests.filter(r => r.isUrgent).length})
              </TabsTrigger>
              <TabsTrigger value="teacher">
                Teachers ({requests.filter(r => r.requested_role === UserRole.TEACHER).length})
              </TabsTrigger>
              <TabsTrigger value="admin">
                Admins ({requests.filter(r => 
                  [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN].includes(r.requested_role)
                ).length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-6">
              {filteredRequests.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No pending requests</h3>
                  <p className="text-gray-500">
                    {activeTab === 'all' 
                      ? 'There are no pending role requests at this time.'
                      : `No ${activeTab} requests are currently pending.`
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.map((request) => (
                    <RoleRequestCard
                      key={request.id}
                      request={request}
                      isExpanded={expandedRequests.has(request.id)}
                      isProcessing={processingRequests.has(request.id)}
                      onToggleExpanded={() => toggleExpanded(request.id)}
                      onApprove={handleApprove}
                      onDeny={handleDeny}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface RoleRequestCardProps {
  request: RoleRequest;
  isExpanded: boolean;
  isProcessing: boolean;
  onToggleExpanded: () => void;
  onApprove: (requestId: string, notes?: string) => Promise<void>;
  onDeny: (requestId: string, reason: string) => Promise<void>;
}

function RoleRequestCard({
  request,
  isExpanded,
  isProcessing,
  onToggleExpanded,
  onApprove,
  onDeny
}: RoleRequestCardProps) {
  const [approvalNotes, setApprovalNotes] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [showDenialForm, setShowDenialForm] = useState(false);

  const handleApprove = async () => {
    await onApprove(request.id, approvalNotes.trim() || undefined);
    setApprovalNotes('');
  };

  const handleDeny = async () => {
    if (!denialReason.trim()) return;
    await onDeny(request.id, denialReason.trim());
    setDenialReason('');
    setShowDenialForm(false);
  };

  return (
    <Card className={cn(
      "transition-all duration-200",
      request.isUrgent && "border-orange-200 bg-orange-50",
      isProcessing && "opacity-50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-gray-500" />
                <span className="font-medium">
                  {request.users.full_name || request.users.email}
                </span>
              </div>
              
              <Badge className={ROLE_COLORS[request.requested_role]}>
                {ROLE_LABELS[request.requested_role]}
              </Badge>

              {request.isUrgent && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Urgent
                </Badge>
              )}
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
              <div className="flex items-center space-x-1">
                <Calendar className="h-3 w-3" />
                <span>Requested {new Date(request.requested_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>{request.daysUntilExpiration} days left</span>
              </div>
            </div>

            {!isExpanded && (
              <p className="text-sm text-gray-700 line-clamp-2">
                {request.justification}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2 ml-4">
            {request.canApprove && !isProcessing && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDenialForm(!showDenialForm)}
                  className="text-red-600 hover:text-red-700"
                >
                  <X className="h-4 w-4 mr-1" />
                  Deny
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpanded}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">Justification</Label>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                {request.justification}
              </p>
            </div>

            {request.current_role && (
              <div>
                <Label className="text-sm font-medium text-gray-700">Current Role</Label>
                <Badge className={cn("mt-1", ROLE_COLORS[request.current_role])}>
                  {ROLE_LABELS[request.current_role]}
                </Badge>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-gray-700">User Email</Label>
              <p className="text-sm text-gray-600 mt-1">{request.users.email}</p>
            </div>

            {request.canApprove && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor={`notes-${request.id}`} className="text-sm font-medium">
                    Approval Notes (Optional)
                  </Label>
                  <Textarea
                    id={`notes-${request.id}`}
                    placeholder="Add any notes about this approval..."
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    className="mt-1"
                    rows={2}
                  />
                </div>

                {showDenialForm && (
                  <div>
                    <Label htmlFor={`reason-${request.id}`} className="text-sm font-medium text-red-700">
                      Reason for Denial *
                    </Label>
                    <Textarea
                      id={`reason-${request.id}`}
                      placeholder="Please provide a reason for denying this request..."
                      value={denialReason}
                      onChange={(e) => setDenialReason(e.target.value)}
                      className="mt-1 border-red-300 focus:border-red-500"
                      rows={2}
                      required
                    />
                    <div className="flex space-x-2 mt-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDeny}
                        disabled={!denialReason.trim() || isProcessing}
                      >
                        Confirm Denial
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowDenialForm(false);
                          setDenialReason('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Processing...</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}