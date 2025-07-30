'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Users, 
  Calendar, 
  MapPin, 
  User,
  Mail,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { ClassInvitation } from '@/lib/types/enrollment';

interface InvitationPageProps {
  params: {
    token: string;
  };
}

interface ClassDetails {
  id: string;
  name: string;
  code: string;
  description?: string;
  schedule?: string;
  location?: string;
  credits: number;
  capacity: number;
  currentEnrollment: number;
  instructor: {
    name: string;
    email: string;
  };
}

interface InvitationData {
  invitation: ClassInvitation;
  class: ClassDetails;
}

export default function InvitationPage({ params }: InvitationPageProps) {
  const [data, setData] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<'accepted' | 'declined' | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadInvitationDetails();
  }, [params.token]);

  const loadInvitationDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/invitations/${params.token}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load invitation');
      }

      const invitationData = await response.json();
      setData(invitationData);
    } catch (error) {
      console.error('Error loading invitation:', error);
      setError(error instanceof Error ? error.message : 'Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (action: 'accept' | 'decline') => {
    if (!data) return;

    try {
      setProcessing(true);
      
      const response = await fetch(`/api/invitations/${params.token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to ${action} invitation`);
      }

      setResponse(action);

      if (action === 'accept' && result.success) {
        // Redirect to student dashboard after successful enrollment
        setTimeout(() => {
          router.push('/dashboard/student');
        }, 3000);
      }
    } catch (error) {
      console.error(`Error ${action}ing invitation:`, error);
      setError(error instanceof Error ? error.message : `Failed to ${action} invitation`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span>Loading invitation...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-red-900">Invalid Invitation</CardTitle>
            <CardDescription className="text-red-700">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              variant="outline" 
              onClick={() => router.push('/dashboard')}
              className="w-full"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { invitation, class: classDetails } = data;
  const isExpired = new Date() > invitation.expiresAt;
  const spotsRemaining = classDetails.capacity - classDetails.currentEnrollment;

  // Show response confirmation
  if (response) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className={`mx-auto mb-4 h-12 w-12 rounded-full flex items-center justify-center ${
              response === 'accepted' 
                ? 'bg-green-100' 
                : 'bg-gray-100'
            }`}>
              {response === 'accepted' ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : (
                <XCircle className="h-6 w-6 text-gray-600" />
              )}
            </div>
            <CardTitle className={response === 'accepted' ? 'text-green-900' : 'text-gray-900'}>
              {response === 'accepted' ? 'Enrollment Confirmed!' : 'Invitation Declined'}
            </CardTitle>
            <CardDescription>
              {response === 'accepted' 
                ? `You have successfully enrolled in ${classDetails.name}. Redirecting to your dashboard...`
                : 'You have declined this class invitation.'
              }
            </CardDescription>
          </CardHeader>
          {response === 'accepted' && (
            <CardContent className="text-center">
              <div className="space-y-2 text-sm text-gray-600">
                <p>Class: {classDetails.name} ({classDetails.code})</p>
                <p>Instructor: {classDetails.instructor.name}</p>
                {classDetails.schedule && <p>Schedule: {classDetails.schedule}</p>}
                {classDetails.location && <p>Location: {classDetails.location}</p>}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Class Invitation</h1>
          <p className="text-gray-600">You've been invited to join a class</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{classDetails.name}</CardTitle>
                <CardDescription className="text-lg font-medium text-gray-700">
                  {classDetails.code}
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-sm">
                {classDetails.credits} Credit{classDetails.credits !== 1 ? 's' : ''}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {classDetails.description && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Description</h3>
                <p className="text-gray-700">{classDetails.description}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">Instructor</p>
                  <p className="text-gray-600">{classDetails.instructor.name}</p>
                </div>
              </div>

              {classDetails.schedule && (
                <div className="flex items-center space-x-3">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">Schedule</p>
                    <p className="text-gray-600">{classDetails.schedule}</p>
                  </div>
                </div>
              )}

              {classDetails.location && (
                <div className="flex items-center space-x-3">
                  <MapPin className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">Location</p>
                    <p className="text-gray-600">{classDetails.location}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-3">
                <Users className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">Enrollment</p>
                  <p className="text-gray-600">
                    {classDetails.currentEnrollment} / {classDetails.capacity} students
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">Invitation Status</span>
                <div className="flex items-center space-x-2">
                  {isExpired ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <Badge variant="destructive">Expired</Badge>
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4 text-green-500" />
                      <Badge variant="outline" className="text-green-700 border-green-300">
                        Valid
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">Expires</span>
                <span className="text-gray-600">
                  {invitation.expiresAt.toLocaleDateString()} at {invitation.expiresAt.toLocaleTimeString()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">Available Spots</span>
                <span className={`font-medium ${spotsRemaining > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {spotsRemaining} remaining
                </span>
              </div>
            </div>

            {invitation.message && (
              <>
                <Separator />
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Personal Message</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-700 italic">"{invitation.message}"</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card>
          <CardContent className="p-6">
            {isExpired ? (
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-900 mb-2">Invitation Expired</h3>
                <p className="text-red-700 mb-4">
                  This invitation expired on {invitation.expiresAt.toLocaleDateString()}.
                </p>
                <p className="text-gray-600">
                  Please contact the instructor for a new invitation.
                </p>
              </div>
            ) : spotsRemaining <= 0 ? (
              <div className="text-center">
                <Users className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Class Full</h3>
                <p className="text-gray-600">
                  This class has reached its maximum capacity.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Ready to join this class?
                  </h3>
                  <p className="text-gray-600">
                    Choose your response to this invitation
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    onClick={() => handleResponse('accept')}
                    disabled={processing}
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="lg"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Accept & Enroll
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => handleResponse('decline')}
                    disabled={processing}
                    variant="outline"
                    className="w-full"
                    size="lg"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                </div>

                <div className="text-center text-sm text-gray-500">
                  By accepting, you agree to enroll in this class and follow all course policies.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}