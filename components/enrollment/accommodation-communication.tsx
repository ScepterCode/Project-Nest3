'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  MessageSquare, 
  Send, 
  User, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  Phone,
  Mail,
  Users,
  FileText,
  Calendar
} from 'lucide-react';
import { AccommodationCommunication, CommunicationType } from '@/lib/types/accommodation';

interface AccommodationCommunicationProps {
  enrollmentAccommodationId: string;
  currentUserId: string;
  currentUserRole: 'student' | 'instructor' | 'disability_services' | 'admin';
  communications: AccommodationCommunication[];
  onSendMessage: (message: string, type: CommunicationType, recipientId?: string) => Promise<void>;
  onMarkAsRead: (communicationId: string) => Promise<void>;
  participantInfo: {
    student: { id: string; name: string; email: string };
    instructor: { id: string; name: string; email: string };
    disabilityServices: { id: string; name: string; email: string; phone: string };
  };
  accommodationDetails: {
    type: string;
    description: string;
    status: string;
    requestedArrangements: string;
    approvedArrangements?: string;
  };
}

const AccommodationCommunication: React.FC<AccommodationCommunicationProps> = ({
  enrollmentAccommodationId,
  currentUserId,
  currentUserRole,
  communications,
  onSendMessage,
  onMarkAsRead,
  participantInfo,
  accommodationDetails
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [messageType, setMessageType] = useState<CommunicationType>('general');
  const [selectedRecipient, setSelectedRecipient] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Mark unread messages as read when component loads
    const unreadMessages = communications.filter(
      comm => !comm.readAt && comm.recipientId === currentUserId
    );
    
    unreadMessages.forEach(comm => {
      onMarkAsRead(comm.id);
    });
  }, [communications, currentUserId, onMarkAsRead]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setIsSubmitting(true);
    try {
      await onSendMessage(newMessage.trim(), messageType, selectedRecipient || undefined);
      setNewMessage('');
      setMessageType('general');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMessageTypeLabel = (type: CommunicationType): string => {
    const labels: Record<CommunicationType, string> = {
      general: 'General Discussion',
      urgent: 'Urgent Matter',
      follow_up: 'Follow-up',
      resolution: 'Resolution Update',
      implementation_update: 'Implementation Update'
    };
    return labels[type] || type;
  };

  const getMessageTypeColor = (type: CommunicationType): string => {
    const colors: Record<CommunicationType, string> = {
      general: 'bg-blue-100 text-blue-800',
      urgent: 'bg-red-100 text-red-800',
      follow_up: 'bg-yellow-100 text-yellow-800',
      resolution: 'bg-green-100 text-green-800',
      implementation_update: 'bg-purple-100 text-purple-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getUserName = (userId: string): string => {
    if (userId === participantInfo.student.id) return participantInfo.student.name;
    if (userId === participantInfo.instructor.id) return participantInfo.instructor.name;
    if (userId === participantInfo.disabilityServices.id) return participantInfo.disabilityServices.name;
    return 'Unknown User';
  };

  const getUserRole = (userId: string): string => {
    if (userId === participantInfo.student.id) return 'Student';
    if (userId === participantInfo.instructor.id) return 'Instructor';
    if (userId === participantInfo.disabilityServices.id) return 'Disability Services';
    return 'System';
  };

  const getRecipientOptions = () => {
    const options = [];
    
    if (currentUserRole !== 'student') {
      options.push({
        value: participantInfo.student.id,
        label: `${participantInfo.student.name} (Student)`
      });
    }
    
    if (currentUserRole !== 'instructor') {
      options.push({
        value: participantInfo.instructor.id,
        label: `${participantInfo.instructor.name} (Instructor)`
      });
    }
    
    if (currentUserRole !== 'disability_services') {
      options.push({
        value: participantInfo.disabilityServices.id,
        label: `${participantInfo.disabilityServices.name} (Disability Services)`
      });
    }

    return options;
  };

  const sortedCommunications = [...communications].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Accommodation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Accommodation Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="font-medium">Accommodation Type</Label>
              <p className="text-sm text-gray-600 capitalize">
                {accommodationDetails.type.replace(/_/g, ' ')}
              </p>
            </div>
            <div>
              <Label className="font-medium">Status</Label>
              <Badge className={`ml-2 ${
                accommodationDetails.status === 'approved' ? 'bg-green-100 text-green-800' :
                accommodationDetails.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                accommodationDetails.status === 'implemented' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {accommodationDetails.status}
              </Badge>
            </div>
            <div className="md:col-span-2">
              <Label className="font-medium">Description</Label>
              <p className="text-sm text-gray-600">{accommodationDetails.description}</p>
            </div>
            <div className="md:col-span-2">
              <Label className="font-medium">Requested Arrangements</Label>
              <p className="text-sm text-gray-600">{accommodationDetails.requestedArrangements}</p>
            </div>
            {accommodationDetails.approvedArrangements && (
              <div className="md:col-span-2">
                <Label className="font-medium">Approved Arrangements</Label>
                <p className="text-sm text-green-700">{accommodationDetails.approvedArrangements}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Communication Participants
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 border rounded">
              <User className="h-8 w-8 mx-auto mb-2 text-blue-600" />
              <h4 className="font-medium">{participantInfo.student.name}</h4>
              <p className="text-sm text-gray-600">Student</p>
              <p className="text-xs text-gray-500">{participantInfo.student.email}</p>
            </div>
            <div className="text-center p-3 border rounded">
              <User className="h-8 w-8 mx-auto mb-2 text-green-600" />
              <h4 className="font-medium">{participantInfo.instructor.name}</h4>
              <p className="text-sm text-gray-600">Instructor</p>
              <p className="text-xs text-gray-500">{participantInfo.instructor.email}</p>
            </div>
            <div className="text-center p-3 border rounded">
              <User className="h-8 w-8 mx-auto mb-2 text-purple-600" />
              <h4 className="font-medium">{participantInfo.disabilityServices.name}</h4>
              <p className="text-sm text-gray-600">Disability Services</p>
              <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                <Mail className="h-3 w-3" />
                {participantInfo.disabilityServices.email}
              </p>
              <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" />
                {participantInfo.disabilityServices.phone}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Communication History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Communication History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedCommunications.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No messages yet. Start the conversation below.</p>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {sortedCommunications.map((comm) => (
                <div key={comm.id} className={`p-4 rounded-lg border ${
                  comm.senderId === currentUserId ? 'bg-blue-50 border-blue-200 ml-8' : 'bg-gray-50 border-gray-200 mr-8'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span className="font-medium">{getUserName(comm.senderId)}</span>
                      <Badge variant="outline" className="text-xs">
                        {getUserRole(comm.senderId)}
                      </Badge>
                      <Badge className={`text-xs ${getMessageTypeColor(comm.communicationType)}`}>
                        {getMessageTypeLabel(comm.communicationType)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {new Date(comm.createdAt).toLocaleString()}
                      {!comm.readAt && comm.recipientId === currentUserId && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{comm.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Message Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Message
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSendMessage} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="messageType">Message Type</Label>
                <Select value={messageType} onValueChange={(value: CommunicationType) => setMessageType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Discussion</SelectItem>
                    <SelectItem value="urgent">Urgent Matter</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="resolution">Resolution Update</SelectItem>
                    <SelectItem value="implementation_update">Implementation Update</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="recipient">Send To (Optional)</Label>
                <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                  <SelectTrigger>
                    <SelectValue placeholder="All participants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All participants</SelectItem>
                    {getRecipientOptions().map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={4}
                required
              />
            </div>

            {messageType === 'urgent' && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Urgent messages</strong> will be sent with high priority and may trigger immediate notifications.
                  Please use this option only for time-sensitive accommodation needs.
                </AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={isSubmitting || !newMessage.trim()}>
              {isSubmitting ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Schedule Call
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Book Meeting
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Share Document
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccommodationCommunication;