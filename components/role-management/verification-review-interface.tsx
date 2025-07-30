'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileText, 
  Download, 
  Eye,
  AlertCircle,
  User,
  Calendar,
  Building
} from 'lucide-react';
import { UserRole, VerificationEvidence } from '../../lib/types/role-management';

interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  institutionId: string;
  institutionName: string;
  requestedRole: UserRole;
  verificationMethod: string;
  evidence: VerificationEvidence[];
  status: 'pending' | 'approved' | 'denied' | 'expired';
  justification: string;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  expiresAt: Date;
}

interface VerificationReviewInterfaceProps {
  institutionId: string;
  reviewerId: string;
  onApprove: (requestId: string, notes: string) => Promise<void>;
  onDeny: (requestId: string, reason: string) => Promise<void>;
  onLoadRequests: (institutionId: string, status?: string) => Promise<VerificationRequest[]>;
}

const ROLE_LABELS = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.DEPARTMENT_ADMIN]: 'Department Admin',
  [UserRole.INSTITUTION_ADMIN]: 'Institution Admin',
  [UserRole.SYSTEM_ADMIN]: 'System Admin'
};

const EVIDENCE_TYPE_LABELS = {
  document: 'Official Document',
  email: 'Email Verification',
  reference: 'Reference Contact',
  other: 'Other'
};

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-800'
};

export function VerificationReviewInterface({
  institutionId,
  reviewerId,
  onApprove,
  onDeny,
  onLoadRequests
}: VerificationReviewInterfaceProps) {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [reviewNotes, setReviewNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests(activeTab === 'all' ? undefined : activeTab);
  }, [activeTab, institutionId]);

  const loadRequests = async (status?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await onLoadRequests(institutionId, status);
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    try {
      setIsProcessing(true);
      setError(null);
      await onApprove(selectedRequest.id, reviewNotes);
      
      // Update local state
      setRequests(requests.map(req => 
        req.id === selectedRequest.id 
          ? { ...req, status: 'approved', reviewedAt: new Date(), reviewNotes }
          : req
      ));
      
      setSelectedRequest(null);
      setReviewNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    if (!selectedRequest || !reviewNotes.trim()) {
      setError('Please provide a reason for denial');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      await onDeny(selectedRequest.id, reviewNotes);
      
      // Update local state
      setRequests(requests.map(req => 
        req.id === selectedRequest.id 
          ? { ...req, status: 'denied', reviewedAt: new Date(), reviewNotes }
          : req
      ));
      
      setSelectedRequest(null);
      setReviewNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny request');
    } finally {
      setIsProcessing(false);
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

  const isExpiringSoon = (expiresAt: Date) => {
    const now = new Date();
    const timeDiff = expiresAt.getTime() - now.getTime();
    const daysDiff = timeDiff / (1000 * 3600 * 24);
    return daysDiff <= 2 && daysDiff > 0;
  };

  const filteredRequests = requests.filter(req => {
    if (activeTab === 'all') return true;
    return req.status === activeTab;
  });

  const pendingCount = requests.filter(req => req.status === 'pending').length;
  const expiringSoonCount = requests.filter(req => 
    req.status === 'pending' && isExpiringSoon(req.expiresAt)
  ).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading verification requests...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Verification Review</h2>
          <p className="text-muted-foreground">
            Review and process role verification requests
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
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Request List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Requests</CardTitle>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="approved">Approved</TabsTrigger>
                  <TabsTrigger value="denied">Denied</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                {filteredRequests.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No {activeTab} requests found
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredRequests.map((request) => (
                      <div
                        key={request.id}
                        className={`p-4 cursor-pointer hover:bg-gray-50 border-l-4 ${
                          selectedRequest?.id === request.id 
                            ? 'bg-blue-50 border-l-blue-500' 
                            : 'border-l-transparent'
                        }`}
                        onClick={() => setSelectedRequest(request)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-sm truncate">
                            {request.userName}
                          </div>
                          <Badge className={`text-xs ${STATUS_COLORS[request.status]}`}>
                            {request.status}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-muted-foreground mb-1">
                          {ROLE_LABELS[request.requestedRole]}
                        </div>
                        
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatDate(request.submittedAt)}
                        </div>
                        
                        {request.status === 'pending' && isExpiringSoon(request.expiresAt) && (
                          <div className="flex items-center text-xs text-red-600 mt-1">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Expires soon
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Request Details */}
        <div className="lg:col-span-2">
          {selectedRequest ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <User className="h-5 w-5" />
                      <span>{selectedRequest.userName}</span>
                    </CardTitle>
                    <CardDescription>
                      Requesting {ROLE_LABELS[selectedRequest.requestedRole]} role
                    </CardDescription>
                  </div>
                  <Badge className={STATUS_COLORS[selectedRequest.status]}>
                    {selectedRequest.status}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* User Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Email</Label>
                    <p className="text-sm text-muted-foreground">{selectedRequest.userEmail}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Institution</Label>
                    <p className="text-sm text-muted-foreground">{selectedRequest.institutionName}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Submitted</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(selectedRequest.submittedAt)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Expires</Label>
                    <p className={`text-sm ${
                      isExpiringSoon(selectedRequest.expiresAt) 
                        ? 'text-red-600 font-medium' 
                        : 'text-muted-foreground'
                    }`}>
                      {formatDate(selectedRequest.expiresAt)}
                    </p>
                  </div>
                </div>

                {/* Justification */}
                <div>
                  <Label className="text-sm font-medium">Justification</Label>
                  <div className="mt-1 p-3 bg-gray-50 rounded-md">
                    <p className="text-sm whitespace-pre-wrap">{selectedRequest.justification}</p>
                  </div>
                </div>

                {/* Evidence */}
                <div>
                  <Label className="text-sm font-medium">Supporting Evidence</Label>
                  <div className="mt-2 space-y-3">
                    {selectedRequest.evidence.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No evidence provided</p>
                    ) : (
                      selectedRequest.evidence.map((evidence, index) => (
                        <Card key={index} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge variant="outline">
                                  {EVIDENCE_TYPE_LABELS[evidence.type]}
                                </Badge>
                              </div>
                              <p className="text-sm mb-2">{evidence.description}</p>
                              
                              {evidence.fileUrl && (
                                <div className="flex items-center space-x-2">
                                  <FileText className="h-4 w-4 text-blue-500" />
                                  <span className="text-sm text-blue-600">
                                    {evidence.metadata?.fileName || 'Attached file'}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(evidence.fileUrl, '_blank')}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const link = document.createElement('a');
                                      link.href = evidence.fileUrl!;
                                      link.download = evidence.metadata?.fileName || 'evidence';
                                      link.click();
                                    }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </div>

                {/* Review Section */}
                {selectedRequest.status === 'pending' && (
                  <div className="border-t pt-6">
                    <Label className="text-sm font-medium">Review Notes</Label>
                    <Textarea
                      placeholder="Add notes about your decision..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      rows={3}
                      className="mt-2"
                    />
                    
                    <div className="flex justify-end space-x-3 mt-4">
                      <Button
                        variant="outline"
                        onClick={handleDeny}
                        disabled={isProcessing || !reviewNotes.trim()}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Deny
                      </Button>
                      <Button
                        onClick={handleApprove}
                        disabled={isProcessing}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                    </div>
                  </div>
                )}

                {/* Previous Review */}
                {selectedRequest.reviewedAt && (
                  <div className="border-t pt-6">
                    <Label className="text-sm font-medium">Review Decision</Label>
                    <div className="mt-2 p-3 bg-gray-50 rounded-md">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          {selectedRequest.status === 'approved' ? 'Approved' : 'Denied'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(selectedRequest.reviewedAt)}
                        </span>
                      </div>
                      {selectedRequest.reviewNotes && (
                        <p className="text-sm whitespace-pre-wrap">{selectedRequest.reviewNotes}</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Select a Request
                </h3>
                <p className="text-gray-500">
                  Choose a verification request from the list to review details and make a decision.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}