'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  FileText, 
  Mail,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { UserRole } from '../../lib/types/role-management';

interface VerificationStatus {
  id: string;
  requestedRole: UserRole;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  verificationMethod: string;
  submittedAt: Date;
  expiresAt: Date;
  reviewedAt?: Date;
  reviewNotes?: string;
  evidenceCount: number;
  justification: string;
}

interface VerificationStatusTrackerProps {
  userId: string;
  onLoadStatus: (userId: string) => Promise<VerificationStatus[]>;
  onResendNotification?: (requestId: string) => Promise<void>;
  onWithdrawRequest?: (requestId: string) => Promise<void>;
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
    description: 'Your role has been verified and approved. Your account access has been updated.'
  },
  denied: {
    icon: XCircle,
    color: 'bg-red-100 text-red-800',
    title: 'Denied',
    description: 'Your verification request was not approved. See details below.'
  },
  expired: {
    icon: AlertCircle,
    color: 'bg-gray-100 text-gray-800',
    title: 'Expired',
    description: 'Your verification request expired without review. You may submit a new request.'
  }
};

export function VerificationStatusTracker({
  userId,
  onLoadStatus,
  onResendNotification,
  onWithdrawRequest
}: VerificationStatusTrackerProps) {
  const [verifications, setVerifications] = useState<VerificationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  const handleResendNotification = async (requestId: string) => {
    if (!onResendNotification) return;

    try {
      setActionLoading(requestId);
      await onResendNotification(requestId);
      // Show success message or update UI
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend notification');
    } finally {
      setActionLoading(null);
    }
  };

  const handleWithdrawRequest = async (requestId: string) => {
    if (!onWithdrawRequest) return;

    if (!confirm('Are you sure you want to withdraw this verification request?')) {
      return;
    }

    try {
      setActionLoading(requestId);
      await onWithdrawRequest(requestId);
      // Remove from local state
      setVerifications(verifications.filter(v => v.id !== requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw request');
    } finally {
      setActionLoading(null);
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

  const getTimeRemaining = (expiresAt: Date) => {
    const now = new Date();
    const timeDiff = expiresAt.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    if (daysDiff <= 0) return 'Expired';
    if (daysDiff === 1) return '1 day remaining';
    return `${daysDiff} days remaining`;
  };

  const getProgressPercentage = (submittedAt: Date, expiresAt: Date) => {
    const now = new Date();
    const totalTime = expiresAt.getTime() - submittedAt.getTime();
    const elapsedTime = now.getTime() - submittedAt.getTime();
    const percentage = Math.min(100, Math.max(0, (elapsedTime / totalTime) * 100));
    return percentage;
  };

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

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (verifications.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Verification Requests
          </h3>
          <p className="text-gray-500">
            You haven't submitted any role verification requests yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Verification Status</h2>
          <p className="text-muted-foreground">
            Track the status of your role verification requests
          </p>
        </div>
        
        <Button
          variant="outline"
          onClick={loadVerificationStatus}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {verifications.map((verification) => {
          const statusConfig = STATUS_CONFIG[verification.status];
          const StatusIcon = statusConfig.icon;
          const isExpiringSoon = verification.status === 'pending' && 
            new Date(verification.expiresAt).getTime() - new Date().getTime() < 2 * 24 * 60 * 60 * 1000;

          return (
            <Card key={verification.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <StatusIcon className={`h-6 w-6 ${
                      verification.status === 'approved' ? 'text-green-600' :
                      verification.status === 'denied' ? 'text-red-600' :
                      verification.status === 'expired' ? 'text-gray-600' :
                      'text-yellow-600'
                    }`} />
                    <div>
                      <CardTitle className="text-lg">
                        {ROLE_LABELS[verification.requestedRole]} Role Verification
                      </CardTitle>
                      <CardDescription>
                        {statusConfig.description}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <Badge className={statusConfig.color}>
                    {statusConfig.title}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Timeline */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="font-medium">Submitted</div>
                      <div className="text-muted-foreground">
                        {formatDate(verification.submittedAt)}
                      </div>
                    </div>
                  </div>

                  {verification.reviewedAt && (
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="font-medium">Reviewed</div>
                        <div className="text-muted-foreground">
                          {formatDate(verification.reviewedAt)}
                        </div>
                      </div>
                    </div>
                  )}

                  {verification.status === 'pending' && (
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="font-medium">Expires</div>
                        <div className={`${isExpiringSoon ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                          {getTimeRemaining(verification.expiresAt)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress bar for pending requests */}
                {verification.status === 'pending' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Review Progress</span>
                      <span className="text-muted-foreground">
                        {getTimeRemaining(verification.expiresAt)}
                      </span>
                    </div>
                    <Progress 
                      value={getProgressPercentage(verification.submittedAt, verification.expiresAt)}
                      className="h-2"
                    />
                  </div>
                )}

                {/* Expiring soon warning */}
                {isExpiringSoon && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Your verification request will expire soon. If you need to provide additional 
                      information, please contact your institution administrator.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Evidence summary */}
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <FileText className="h-4 w-4" />
                    <span>{verification.evidenceCount} evidence items</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Mail className="h-4 w-4" />
                    <span>{verification.verificationMethod.replace('_', ' ')}</span>
                  </div>
                </div>

                {/* Justification preview */}
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-sm font-medium mb-1">Justification</div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {verification.justification}
                  </p>
                </div>

                {/* Review notes for denied requests */}
                {verification.status === 'denied' && verification.reviewNotes && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium mb-1">Reason for denial:</div>
                      {verification.reviewNotes}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Actions */}
                {verification.status === 'pending' && (
                  <div className="flex justify-end space-x-2">
                    {onResendNotification && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResendNotification(verification.id)}
                        disabled={actionLoading === verification.id}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Remind Reviewers
                      </Button>
                    )}
                    
                    {onWithdrawRequest && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleWithdrawRequest(verification.id)}
                        disabled={actionLoading === verification.id}
                      >
                        Withdraw Request
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}