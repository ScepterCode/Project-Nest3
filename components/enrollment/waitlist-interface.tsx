"use client";

import React, { useState, useEffect } from 'react';
import { WaitlistManager } from '@/lib/services/waitlist-manager';
import { ClassWithEnrollment, WaitlistEntry } from '@/lib/types/enrollment';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Clock, 
  Users, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  Bell,
  Calendar,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WaitlistInterfaceProps {
  classData: ClassWithEnrollment;
  studentId: string;
  onJoinWaitlist?: (result: any) => void;
  onLeaveWaitlist?: () => void;
  onAcceptEnrollment?: () => void;
  onDeclineEnrollment?: () => void;
}

export function WaitlistInterface({ 
  classData, 
  studentId, 
  onJoinWaitlist,
  onLeaveWaitlist,
  onAcceptEnrollment,
  onDeclineEnrollment
}: WaitlistInterfaceProps) {
  const [waitlistInfo, setWaitlistInfo] = useState<{
    entry: WaitlistEntry | null;
    position: number;
    estimatedProbability: number;
    estimatedWaitTime: string;
    isNotified: boolean;
    responseDeadline?: Date;
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waitlistManager = new WaitlistManager();

  // Load waitlist information
  useEffect(() => {
    loadWaitlistInfo();
  }, [studentId, classData.id]);

  const loadWaitlistInfo = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const info = await waitlistManager.getStudentWaitlistInfo(studentId, classData.id);
      setWaitlistInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load waitlist information');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWaitlist = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const entry = await waitlistManager.addToWaitlist(studentId, classData.id);
      await loadWaitlistInfo(); // Refresh the info
      onJoinWaitlist?.(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join waitlist');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveWaitlist = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await waitlistManager.removeFromWaitlist(studentId, classData.id);
      await loadWaitlistInfo(); // Refresh the info
      onLeaveWaitlist?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave waitlist');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptEnrollment = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await waitlistManager.handleWaitlistResponse(studentId, classData.id, 'accept');
      await loadWaitlistInfo(); // Refresh the info
      onAcceptEnrollment?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept enrollment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeclineEnrollment = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await waitlistManager.handleWaitlistResponse(studentId, classData.id, 'decline');
      await loadWaitlistInfo(); // Refresh the info
      onDeclineEnrollment?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline enrollment');
    } finally {
      setSubmitting(false);
    }
  };

  const getProbabilityColor = (probability: number) => {
    if (probability >= 0.7) return 'text-green-600';
    if (probability >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProbabilityBadgeVariant = (probability: number) => {
    if (probability >= 0.7) return 'default';
    if (probability >= 0.4) return 'secondary';
    return 'destructive';
  };

  const formatTimeRemaining = (deadline: Date) => {
    const now = new Date();
    const diff = deadline.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading waitlist information...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Student is not on waitlist
  if (!waitlistInfo?.entry) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Join Waitlist</span>
          </CardTitle>
          <CardDescription>
            This class is currently full, but you can join the waitlist to be notified when a spot becomes available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Class capacity info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Current Enrollment:</span>
              <span className="font-medium">{classData.currentEnrollment}/{classData.capacity}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Waitlist Count:</span>
              <span className="font-medium">{classData.waitlistCount}</span>
            </div>
          </div>

          {/* Capacity visualization */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Class Capacity</span>
              <span>{Math.round((classData.currentEnrollment / classData.capacity) * 100)}% full</span>
            </div>
            <Progress 
              value={(classData.currentEnrollment / classData.capacity) * 100} 
              className="h-2"
            />
          </div>

          {/* Waitlist benefits */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Waitlist Benefits:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li className="flex items-center space-x-2">
                <Bell className="h-4 w-4" />
                <span>Automatic notification when spots become available</span>
              </li>
              <li className="flex items-center space-x-2">
                <Clock className="h-4 w-4" />
                <span>24-hour response window to accept enrollment</span>
              </li>
              <li className="flex items-center space-x-2">
                <Target className="h-4 w-4" />
                <span>Priority based on waitlist position</span>
              </li>
            </ul>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between pt-4">
            <div className="text-sm text-gray-600">
              {classData.isWaitlistAvailable 
                ? `${classData.waitlistCapacity - classData.waitlistCount} waitlist spots available`
                : 'Waitlist is full'
              }
            </div>
            
            <Button
              onClick={handleJoinWaitlist}
              disabled={submitting || !classData.isWaitlistAvailable}
              className="flex items-center space-x-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Joining...</span>
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  <span>Join Waitlist</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Student has been notified of available spot
  if (waitlistInfo.isNotified && waitlistInfo.responseDeadline) {
    const isExpired = new Date() > waitlistInfo.responseDeadline;
    
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-green-800">
            <CheckCircle className="h-5 w-5" />
            <span>Enrollment Available!</span>
          </CardTitle>
          <CardDescription className="text-green-700">
            A spot has opened up in this class. You have been selected from the waitlist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Response deadline */}
          <Alert className={cn(
            "border-2",
            isExpired ? "border-red-200 bg-red-50" : "border-yellow-200 bg-yellow-50"
          )}>
            <Calendar className="h-4 w-4" />
            <AlertDescription className={isExpired ? "text-red-800" : "text-yellow-800"}>
              <div className="flex items-center justify-between">
                <span>
                  {isExpired 
                    ? 'Response deadline has passed' 
                    : `Response deadline: ${waitlistInfo.responseDeadline.toLocaleString()}`
                  }
                </span>
                {!isExpired && (
                  <Badge variant="outline" className="text-yellow-700 border-yellow-700">
                    {formatTimeRemaining(waitlistInfo.responseDeadline)}
                  </Badge>
                )}
              </div>
            </AlertDescription>
          </Alert>

          {/* Class information */}
          <div className="bg-white p-4 rounded-lg border">
            <h4 className="font-medium mb-2">Class Details:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Class:</span>
                <span className="ml-2 font-medium">{classData.name}</span>
              </div>
              <div>
                <span className="text-gray-600">Credits:</span>
                <span className="ml-2 font-medium">{classData.credits}</span>
              </div>
              <div>
                <span className="text-gray-600">Instructor:</span>
                <span className="ml-2 font-medium">{classData.teacherName}</span>
              </div>
              <div>
                <span className="text-gray-600">Schedule:</span>
                <span className="ml-2 font-medium">{classData.schedule || 'TBA'}</span>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleDeclineEnrollment}
              disabled={submitting || isExpired}
              className="flex items-center space-x-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span>Decline</span>
              )}
            </Button>
            
            <Button
              onClick={handleAcceptEnrollment}
              disabled={submitting || isExpired}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Accept Enrollment</span>
                </>
              )}
            </Button>
          </div>

          {isExpired && (
            <p className="text-sm text-red-600 text-center">
              The response deadline has passed. You will be removed from the waitlist.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Student is on waitlist (normal state)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Clock className="h-5 w-5" />
          <span>On Waitlist</span>
        </CardTitle>
        <CardDescription>
          You are currently on the waitlist for this class. You'll be notified when a spot becomes available.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Position and probability */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">#{waitlistInfo.position}</div>
            <div className="text-sm text-blue-800">Position</div>
          </div>
          
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className={cn("text-2xl font-bold", getProbabilityColor(waitlistInfo.estimatedProbability))}>
              {Math.round(waitlistInfo.estimatedProbability * 100)}%
            </div>
            <div className="text-sm text-gray-600">Enrollment Probability</div>
          </div>
          
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-lg font-bold text-yellow-600">{waitlistInfo.estimatedWaitTime}</div>
            <div className="text-sm text-yellow-800">Estimated Wait</div>
          </div>
        </div>

        {/* Probability indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Enrollment Likelihood</span>
            <Badge variant={getProbabilityBadgeVariant(waitlistInfo.estimatedProbability)}>
              {waitlistInfo.estimatedProbability >= 0.7 ? 'High' : 
               waitlistInfo.estimatedProbability >= 0.4 ? 'Medium' : 'Low'}
            </Badge>
          </div>
          <Progress 
            value={waitlistInfo.estimatedProbability * 100} 
            className="h-2"
          />
        </div>

        {/* Waitlist stats */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium mb-3">Waitlist Information</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Waitlisted:</span>
              <span className="font-medium">{classData.waitlistCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Your Position:</span>
              <span className="font-medium">#{waitlistInfo.position}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Added:</span>
              <span className="font-medium">
                {waitlistInfo.entry.addedAt ? new Date(waitlistInfo.entry.addedAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Priority:</span>
              <span className="font-medium">{waitlistInfo.entry.priority}</span>
            </div>
          </div>
        </div>

        {/* Tips for improving chances */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2 flex items-center space-x-2">
            <TrendingUp className="h-4 w-4" />
            <span>Tips to Improve Your Chances</span>
          </h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Stay enrolled in the waitlist - leaving and rejoining puts you at the back</li>
            <li>• Respond quickly when notified of available spots (24-hour window)</li>
            <li>• Consider alternative sections or similar courses</li>
            <li>• Contact the instructor to express your interest in the course</li>
          </ul>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Leave waitlist button */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600">
            You'll be notified via email when a spot becomes available
          </div>
          
          <Button
            variant="outline"
            onClick={handleLeaveWaitlist}
            disabled={submitting}
            className="flex items-center space-x-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Leaving...</span>
              </>
            ) : (
              <span>Leave Waitlist</span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}