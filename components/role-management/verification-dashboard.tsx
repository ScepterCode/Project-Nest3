'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle, 
  FileText, 
  Plus,
  RefreshCw,
  Eye
} from 'lucide-react';
import { UserRole } from '../../lib/types/role-management';
import { VerificationStatusTracker } from './verification-status-tracker';
import { ManualVerificationForm } from './manual-verification-form';

interface VerificationStatus {
  id: string;
  requestedRole: UserRole;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  verificationMethod: string;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewNotes?: string;
  expiresAt: Date;
  evidenceCount: number;
  institutionId: string;
}

interface VerificationDashboardProps {
  userId: string;
  institutionId: string;
  currentRole?: UserRole;
  onLoadStatus: (userId: string) => Promise<VerificationStatus[]>;
  onSubmitVerification: (evidence: any[], justification: string) => Promise<void>;
  onWithdrawRequest?: (requestId: string) => Promise<void>;
  onResendNotification?: (requestId: string) => Promise<void>;
}

const ROLE_LABELS = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.DEPARTMENT_ADMIN]: 'Department Admin',
  [UserRole.INSTITUTION_ADMIN]: 'Institution Admin',
  [UserRole.SYSTEM_ADMIN]: 'System Admin'
};

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: 'bg-yellow-100 text-yellow-800',
    title: 'Under Review',
    description: 'Your verification request is being reviewed by authorized personnel.'
  },
  approved: {
    icon: CheckCircle,
    color: 'bg-green-100 text-green-800',
    title: 'Approved',
    description: 'Your role has been verified and approved.'
  },
  denied: {
    icon: XCircle,
    color: 'bg-red-100 text-red-800',
    title: 'Denied',
    description: 'Your verification request was not approved.'
  },
  expired: {
    icon: AlertCircle,
    color: 'bg-gray-100 text-gray-800',
    title: 'Expired',
    description: 'Your verification request expired without review.'
  }
};

export function VerificationDashboard({
  userId,
  institutionId,
  currentRole,
  onLoadStatus,
  onSubmitVerification,
  onWithdrawRequest,
  onResendNotification
}: VerificationDashboardProps) {
  const [activeTab, setActiveTab] = useState('status');
  const [showNewRequestForm, setShowNewRequestForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.TEACHER);
  const [verifications, setVerifications] = useState<VerificationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadVerificationStatus();
  }, [userId]);

  const loadVerificationStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await onLoadStatus(userId);
      setVerifications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load verification status');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitVerification = async (evidence: any[], justification: string) => {
    try {
      await onSubmitVerification(evidence, justification);
      setShowNewRequestForm(false);
      await loadVerificationStatus(); // Refresh the status
    } catch (err) {
      throw err; // Let the form handle the error
    }
  };

  const handleWithdrawRequest = async (requestId: string) => {
    if (!onWithdrawRequest) return;

    try {
      await onWithdrawRequest(requestId);
      setVerifications(verifications.filter(v => v.id !== requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw request');
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getAvailableRoles = () => {
    // Filter out roles that already have pending or approved requests
    const requestedRoles = verifications
      .filter(v => ['pending', 'approved'].includes(v.status))
      .map(v => v.requestedRole);

    return [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN]
      .filter(role => !requestedRoles.includes(role) && role !== currentRole);
  };

  const pendingCount = verifications.filter(v => v.status === 'pending').length;
  const approvedCount = verifications.filter(v => v.status === 'approved').length;
  const expiringSoonCount = verifications.filter(v => 
    v.status === 'pending' && 
    new Date(v.expiresAt).getTime() - new Date().getTime() < 2 * 24 * 60 * 60 * 1000
  ).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading verification status...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Role Verification</h2>
          <p className="text-muted-foreground">
            Manage your role verification requests and status
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          {pendingCount > 0 && (
            <Badge variant="secondary">
              {pendingCount} pending
            </Badge>
          )}
          {expiringSoonCount > 0 && (
            <Badge variant="destructive">
              {expiringSoonCount} expiring soon
            </Badge>
          )}
          {approvedCount > 0 && (
            <Badge className="bg-green-100 text-green-800">
              {approvedCount} approved
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="status">Verification Status</TabsTrigger>
          <TabsTrigger value="request">Request Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4">
          {verifications.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No Verification Requests
                </h3>
                <p className="text-gray-500 mb-4">
                  You haven't submitted any role verification requests yet.
                </p>
                <Button onClick={() => setActiveTab('request')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Request Role Verification
                </Button>
              </CardContent>
            </Card>
          ) : (
            <VerificationStatusTracker
              userId={userId}
              onLoadStatus={onLoadStatus}
              onWithdrawRequest={handleWithdrawRequest}
              onResendNotification={onResendNotification}
            />
          )}
        </TabsContent>

        <TabsContent value="request" className="space-y-4">
          {showNewRequestForm ? (
            <ManualVerificationForm
              userId={userId}
              institutionId={institutionId}
              requestedRole={selectedRole}
              onSubmit={handleSubmitVerification}
              onCancel={() => setShowNewRequestForm(false)}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Request Role Verification</CardTitle>
                <CardDescription>
                  Submit a verification request to gain access to additional platform features.
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* Current Role */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Current Role</h4>
                  <Badge variant="outline">
                    {currentRole ? ROLE_LABELS[currentRole] : 'No role assigned'}
                  </Badge>
                </div>

                {/* Available Roles */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Available Roles to Request</h4>
                  
                  {getAvailableRoles().length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        You have already requested or been approved for all available roles.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getAvailableRoles().map(role => (
                        <Card 
                          key={role} 
                          className={`cursor-pointer transition-colors ${
                            selectedRole === role 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setSelectedRole(role)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h5 className="font-medium">{ROLE_LABELS[role]}</h5>
                                <p className="text-sm text-muted-foreground">
                                  {role === UserRole.TEACHER && 'Access to class management and student data'}
                                  {role === UserRole.DEPARTMENT_ADMIN && 'Manage department users and settings'}
                                  {role === UserRole.INSTITUTION_ADMIN && 'Full institution management access'}
                                </p>
                              </div>
                              {selectedRole === role && (
                                <CheckCircle className="h-5 w-5 text-blue-500" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {getAvailableRoles().length > 0 && (
                  <div className="flex justify-end space-x-3">
                    <Button
                      onClick={() => setShowNewRequestForm(true)}
                      disabled={!selectedRole}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Request {selectedRole ? ROLE_LABELS[selectedRole] : 'Role'} Verification
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Pending</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">Approved</p>
                <p className="text-2xl font-bold">{approvedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-sm font-medium">Denied</p>
                <p className="text-2xl font-bold">
                  {verifications.filter(v => v.status === 'denied').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm font-medium">Expired</p>
                <p className="text-2xl font-bold">
                  {verifications.filter(v => v.status === 'expired').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}