'use client';

import React, { useState, useEffect } from 'react';
import { useRealtimeEnrollment } from '@/lib/hooks/useRealtimeEnrollment';
import {
  RealtimeEnrollmentEvent,
  RealtimeWaitlistEvent,
  RealtimeEventType,
  EnrollmentStatus
} from '@/lib/types/enrollment';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
  Bell,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface RealtimeEnrollmentDisplayProps {
  classId: string;
  studentId?: string;
  teacherId?: string;
  showEvents?: boolean;
  showStats?: boolean;
  autoConnect?: boolean;
}

export function RealtimeEnrollmentDisplay({
  classId,
  studentId,
  teacherId,
  showEvents = true,
  showStats = true,
  autoConnect = true
}: RealtimeEnrollmentDisplayProps) {
  const {
    connected,
    enrollmentState,
    events,
    recentEvents,
    requestEnrollment,
    respondToWaitlist,
    getRealtimeStats,
    clearError,
    hasError,
    lastUpdate
  } = useRealtimeEnrollment({
    classId,
    studentId,
    teacherId,
    autoConnect
  });

  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Calculate enrollment percentage
  const enrollmentPercentage = enrollmentState.enrollmentCount > 0 
    ? Math.round((enrollmentState.enrollmentCount / (enrollmentState.enrollmentCount + enrollmentState.availableSpots)) * 100)
    : 0;

  // Handle enrollment request
  const handleEnrollmentRequest = async () => {
    if (!studentId || !connected) return;
    
    setIsEnrolling(true);
    try {
      await requestEnrollment(studentId, classId);
    } catch (error) {
      console.error('Enrollment request failed:', error);
    } finally {
      setIsEnrolling(false);
    }
  };

  // Handle waitlist response
  const handleWaitlistResponse = async (response: 'accept' | 'decline') => {
    if (!studentId || !connected) return;
    
    setIsResponding(true);
    try {
      await respondToWaitlist(studentId, classId, response);
    } catch (error) {
      console.error('Waitlist response failed:', error);
    } finally {
      setIsResponding(false);
    }
  };

  // Format event for display
  const formatEvent = (event: RealtimeEnrollmentEvent | RealtimeWaitlistEvent) => {
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    
    switch (event.type) {
      case RealtimeEventType.ENROLLMENT_COUNT_UPDATE:
        return {
          icon: <Users className="h-4 w-4" />,
          message: `Enrollment updated: ${event.data.currentEnrollment} enrolled, ${event.data.availableSpots} spots available`,
          timestamp,
          type: 'info' as const
        };
      
      case RealtimeEventType.ENROLLMENT_STATUS_CHANGE:
        return {
          icon: event.data.status === EnrollmentStatus.ENROLLED 
            ? <CheckCircle className="h-4 w-4 text-green-500" />
            : <XCircle className="h-4 w-4 text-red-500" />,
          message: `Enrollment status changed to ${event.data.status}`,
          timestamp,
          type: event.data.status === EnrollmentStatus.ENROLLED ? 'success' as const : 'warning' as const
        };
      
      case RealtimeEventType.WAITLIST_POSITION_CHANGE:
        const change = (event as RealtimeWaitlistEvent).data.positionChange || 0;
        return {
          icon: change > 0 
            ? <TrendingUp className="h-4 w-4 text-green-500" />
            : <TrendingDown className="h-4 w-4 text-orange-500" />,
          message: `Waitlist position changed to #${(event as RealtimeWaitlistEvent).data.newPosition} (${change > 0 ? '+' : ''}${change})`,
          timestamp,
          type: 'info' as const
        };
      
      case RealtimeEventType.WAITLIST_ADVANCEMENT:
        return {
          icon: <Bell className="h-4 w-4 text-blue-500" />,
          message: 'Spot available! You have 24 hours to respond.',
          timestamp,
          type: 'success' as const
        };
      
      case RealtimeEventType.CAPACITY_CHANGE:
        return {
          icon: <Users className="h-4 w-4" />,
          message: `Class capacity changed to ${event.data.newCapacity}`,
          timestamp,
          type: 'info' as const
        };
      
      default:
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          message: 'Unknown event',
          timestamp,
          type: 'info' as const
        };
    }
  };

  // Check if student has pending waitlist advancement
  const hasPendingAdvancement = recentEvents.some(
    event => event.type === RealtimeEventType.WAITLIST_ADVANCEMENT && 
             event.studentId === studentId
  );

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {connected ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-600">Disconnected</span>
            </>
          )}
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              Last update: {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          )}
        </div>
        
        {hasError && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearError}
            className="text-red-600"
          >
            Clear Error
          </Button>
        )}
      </div>

      {/* Error Display */}
      {hasError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {enrollmentState.error}
          </AlertDescription>
        </Alert>
      )}

      {/* Enrollment Statistics */}
      {showStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Enrollment Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {enrollmentState.enrollmentCount}
                </div>
                <div className="text-sm text-gray-600">Enrolled</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {enrollmentState.availableSpots}
                </div>
                <div className="text-sm text-gray-600">Available</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {enrollmentState.waitlistCount}
                </div>
                <div className="text-sm text-gray-600">Waitlisted</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Capacity Utilization</span>
                <span>{enrollmentPercentage}%</span>
              </div>
              <Progress value={enrollmentPercentage} className="h-2" />
            </div>

            {/* Student-specific information */}
            {studentId && (
              <div className="border-t pt-4">
                {enrollmentState.enrollmentStatus && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Your Status:</span>
                    <Badge variant={
                      enrollmentState.enrollmentStatus === EnrollmentStatus.ENROLLED ? 'default' :
                      enrollmentState.enrollmentStatus === EnrollmentStatus.WAITLISTED ? 'secondary' :
                      enrollmentState.enrollmentStatus === EnrollmentStatus.PENDING ? 'outline' :
                      'destructive'
                    }>
                      {enrollmentState.enrollmentStatus}
                    </Badge>
                  </div>
                )}
                
                {enrollmentState.waitlistPosition && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-medium">Waitlist Position:</span>
                    <Badge variant="secondary">
                      #{enrollmentState.waitlistPosition}
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Waitlist Advancement Alert */}
      {hasPendingAdvancement && studentId && (
        <Alert className="border-blue-200 bg-blue-50">
          <Bell className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <div className="flex items-center justify-between">
              <span>A spot is available! You have 24 hours to respond.</span>
              <div className="flex space-x-2 ml-4">
                <Button
                  size="sm"
                  onClick={() => handleWaitlistResponse('accept')}
                  disabled={isResponding || !connected}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isResponding ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Accept'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleWaitlistResponse('decline')}
                  disabled={isResponding || !connected}
                >
                  Decline
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Enrollment Actions */}
      {studentId && !enrollmentState.enrollmentStatus && (
        <Card>
          <CardContent className="pt-6">
            <Button
              onClick={handleEnrollmentRequest}
              disabled={isEnrolling || !connected || enrollmentState.availableSpots === 0}
              className="w-full"
            >
              {isEnrolling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Requesting Enrollment...
                </>
              ) : enrollmentState.availableSpots > 0 ? (
                'Request Enrollment'
              ) : (
                'Join Waitlist'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Real-time Events */}
      {showEvents && events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Recent Activity</span>
              </div>
              {events.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllEvents(!showAllEvents)}
                >
                  {showAllEvents ? 'Show Less' : `Show All (${events.length})`}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(showAllEvents ? events : recentEvents).map((event, index) => {
                const formattedEvent = formatEvent(event);
                return (
                  <div
                    key={index}
                    className={`flex items-start space-x-3 p-3 rounded-lg border ${
                      formattedEvent.type === 'success' ? 'bg-green-50 border-green-200' :
                      formattedEvent.type === 'warning' ? 'bg-orange-50 border-orange-200' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {formattedEvent.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {formattedEvent.message}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formattedEvent.timestamp}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default RealtimeEnrollmentDisplay;