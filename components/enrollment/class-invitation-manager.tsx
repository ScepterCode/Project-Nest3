'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Send, 
  Users, 
  Mail, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  Copy,
  Trash2,
  Download
} from 'lucide-react';
import { ClassInvitation } from '@/lib/types/enrollment';

interface InvitationStats {
  total: number;
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
  acceptanceRate: number;
}

interface ClassInvitationManagerProps {
  classId: string;
  className: string;
  onInvitationSent?: () => void;
}

interface SingleInvitationForm {
  studentId?: string;
  email?: string;
  message?: string;
}

interface BulkInvitationForm {
  emails: string;
  defaultMessage?: string;
  expiresAt?: string;
  emailTemplate?: {
    subject: string;
    body: string;
  };
}

export function ClassInvitationManager({ 
  classId, 
  className, 
  onInvitationSent 
}: ClassInvitationManagerProps) {
  const [invitations, setInvitations] = useState<ClassInvitation[]>([]);
  const [stats, setStats] = useState<InvitationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('single');

  // Single invitation form
  const [singleForm, setSingleForm] = useState<SingleInvitationForm>({});
  
  // Bulk invitation form
  const [bulkForm, setBulkForm] = useState<BulkInvitationForm>({
    emails: '',
    defaultMessage: '',
    expiresAt: '',
    emailTemplate: {
      subject: `Invitation to join ${className}`,
      body: `You've been invited to join the class "${className}". Click the link below to accept your invitation:\n\n{{invitation_url}}\n\nThis invitation expires on {{expires_at}}.`
    }
  });

  useEffect(() => {
    loadInvitations();
  }, [classId]);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/classes/${classId}/invitations`);
      
      if (!response.ok) {
        throw new Error('Failed to load invitations');
      }

      const data = await response.json();
      setInvitations(data.invitations);
      setStats(data.stats);
    } catch (error) {
      console.error('Error loading invitations:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendSingleInvitation = async () => {
    if (!singleForm.email && !singleForm.studentId) {
      alert('Please provide either an email address or select a student');
      return;
    }

    try {
      setSending(true);
      const response = await fetch(`/api/classes/${classId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(singleForm),
      });

      if (!response.ok) {
        throw new Error('Failed to send invitation');
      }

      setSingleForm({});
      await loadInvitations();
      onInvitationSent?.();
      
      alert('Invitation sent successfully!');
    } catch (error) {
      console.error('Error sending invitation:', error);
      alert('Failed to send invitation. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const sendBulkInvitations = async () => {
    if (!bulkForm.emails.trim()) {
      alert('Please provide email addresses');
      return;
    }

    const emailList = bulkForm.emails
      .split('\n')
      .map(email => email.trim())
      .filter(email => email && email.includes('@'));

    if (emailList.length === 0) {
      alert('Please provide valid email addresses');
      return;
    }

    try {
      setSending(true);
      const response = await fetch(`/api/classes/${classId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bulk: true,
          invitations: emailList.map(email => ({ email })),
          defaultMessage: bulkForm.defaultMessage,
          expiresAt: bulkForm.expiresAt,
          emailTemplate: bulkForm.emailTemplate
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send bulk invitations');
      }

      const result = await response.json();
      setBulkForm({
        emails: '',
        defaultMessage: '',
        expiresAt: '',
        emailTemplate: bulkForm.emailTemplate
      });
      
      await loadInvitations();
      onInvitationSent?.();
      
      alert(`Bulk invitations sent! ${result.stats.successful} successful, ${result.stats.failed} failed.`);
    } catch (error) {
      console.error('Error sending bulk invitations:', error);
      alert('Failed to send bulk invitations. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const copyInvitationLink = (token: string) => {
    const invitationUrl = `${window.location.origin}/invitations/${token}`;
    navigator.clipboard.writeText(invitationUrl);
    alert('Invitation link copied to clipboard!');
  };

  const revokeInvitation = async (token: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) {
      return;
    }

    try {
      const response = await fetch(`/api/invitations/${token}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to revoke invitation');
      }

      await loadInvitations();
      alert('Invitation revoked successfully');
    } catch (error) {
      console.error('Error revoking invitation:', error);
      alert('Failed to revoke invitation. Please try again.');
    }
  };

  const getStatusBadge = (invitation: ClassInvitation) => {
    if (invitation.acceptedAt) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Accepted</Badge>;
    }
    if (invitation.declinedAt) {
      return <Badge variant="destructive">Declined</Badge>;
    }
    if (new Date() > invitation.expiresAt) {
      return <Badge variant="secondary">Expired</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };

  const getStatusIcon = (invitation: ClassInvitation) => {
    if (invitation.acceptedAt) {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    }
    if (invitation.declinedAt) {
      return <XCircle className="h-4 w-4 text-red-600" />;
    }
    if (new Date() > invitation.expiresAt) {
      return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
    return <Clock className="h-4 w-4 text-blue-600" />;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <div>
                  <p className="text-sm font-medium">Pending</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Accepted</p>
                  <p className="text-2xl font-bold">{stats.accepted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <div>
                  <p className="text-sm font-medium">Declined</p>
                  <p className="text-2xl font-bold">{stats.declined}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-gray-600" />
                <div>
                  <p className="text-sm font-medium">Rate</p>
                  <p className="text-2xl font-bold">{stats.acceptanceRate.toFixed(0)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invitation Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Mail className="h-5 w-5" />
            <span>Send Invitations</span>
          </CardTitle>
          <CardDescription>
            Invite students to join your class via email or direct invitation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">Single Invitation</TabsTrigger>
              <TabsTrigger value="bulk">Bulk Invitations</TabsTrigger>
            </TabsList>
            
            <TabsContent value="single" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="student@example.com"
                    value={singleForm.email || ''}
                    onChange={(e) => setSingleForm({ ...singleForm, email: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="expires">Expires (Optional)</Label>
                  <Input
                    id="expires"
                    type="datetime-local"
                    value={singleForm.expiresAt || ''}
                    onChange={(e) => setSingleForm({ ...singleForm, expiresAt: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="message">Personal Message (Optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Add a personal message to the invitation..."
                  value={singleForm.message || ''}
                  onChange={(e) => setSingleForm({ ...singleForm, message: e.target.value })}
                  rows={3}
                />
              </div>
              
              <Button 
                onClick={sendSingleInvitation} 
                disabled={sending || (!singleForm.email && !singleForm.studentId)}
                className="w-full"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Invitation
                  </>
                )}
              </Button>
            </TabsContent>
            
            <TabsContent value="bulk" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emails">Email Addresses (one per line)</Label>
                <Textarea
                  id="emails"
                  placeholder="student1@example.com&#10;student2@example.com&#10;student3@example.com"
                  value={bulkForm.emails}
                  onChange={(e) => setBulkForm({ ...bulkForm, emails: e.target.value })}
                  rows={6}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultMessage">Default Message</Label>
                  <Textarea
                    id="defaultMessage"
                    placeholder="Add a message for all invitations..."
                    value={bulkForm.defaultMessage || ''}
                    onChange={(e) => setBulkForm({ ...bulkForm, defaultMessage: e.target.value })}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="bulkExpires">Expires</Label>
                  <Input
                    id="bulkExpires"
                    type="datetime-local"
                    value={bulkForm.expiresAt || ''}
                    onChange={(e) => setBulkForm({ ...bulkForm, expiresAt: e.target.value })}
                  />
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h4 className="font-medium">Email Template Customization</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="emailSubject">Email Subject</Label>
                  <Input
                    id="emailSubject"
                    value={bulkForm.emailTemplate?.subject || ''}
                    onChange={(e) => setBulkForm({
                      ...bulkForm,
                      emailTemplate: {
                        ...bulkForm.emailTemplate!,
                        subject: e.target.value
                      }
                    })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="emailBody">Email Body</Label>
                  <Textarea
                    id="emailBody"
                    value={bulkForm.emailTemplate?.body || ''}
                    onChange={(e) => setBulkForm({
                      ...bulkForm,
                      emailTemplate: {
                        ...bulkForm.emailTemplate!,
                        body: e.target.value
                      }
                    })}
                    rows={6}
                  />
                  <p className="text-sm text-gray-600">
                    Use {{invitation_url}} and {{expires_at}} as placeholders
                  </p>
                </div>
              </div>
              
              <Button 
                onClick={sendBulkInvitations} 
                disabled={sending || !bulkForm.emails.trim()}
                className="w-full"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Bulk Invitations
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Invitations List */}
      <Card>
        <CardHeader>
          <CardTitle>Sent Invitations</CardTitle>
          <CardDescription>
            Manage and track all invitations sent for this class
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No invitations sent yet</p>
              <p className="text-sm text-gray-500">Send your first invitation using the form above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(invitation)}
                          <span>{invitation.email || 'Direct invitation'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(invitation)}
                      </TableCell>
                      <TableCell>
                        {invitation.createdAt.toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>{invitation.expiresAt.toLocaleDateString()}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyInvitationLink(invitation.token)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          
                          {!invitation.acceptedAt && !invitation.declinedAt && new Date() <= invitation.expiresAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => revokeInvitation(invitation.token)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}