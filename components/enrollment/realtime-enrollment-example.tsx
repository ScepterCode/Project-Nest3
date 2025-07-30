'use client';

import React, { useState } from 'react';
import { RealtimeEnrollmentDisplay } from './realtime-enrollment-display';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Clock, 
  Activity, 
  Settings,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';

interface RealtimeEnrollmentExampleProps {
  defaultClassId?: string;
  defaultStudentId?: string;
  defaultTeacherId?: string;
}

export function RealtimeEnrollmentExample({
  defaultClassId = 'demo-class-001',
  defaultStudentId = 'demo-student-001',
  defaultTeacherId = 'demo-teacher-001'
}: RealtimeEnrollmentExampleProps) {
  const [classId, setClassId] = useState(defaultClassId);
  const [studentId, setStudentId] = useState(defaultStudentId);
  const [teacherId, setTeacherId] = useState(defaultTeacherId);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('student');

  const handleConnect = () => {
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
  };

  const handleReset = () => {
    setIsConnected(false);
    setClassId(defaultClassId);
    setStudentId(defaultStudentId);
    setTeacherId(defaultTeacherId);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">
          Real-time Enrollment System Demo
        </h1>
        <p className="text-gray-600">
          Experience live enrollment updates, waitlist management, and concurrent enrollment handling
        </p>
      </div>

      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Configuration</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="classId">Class ID</Label>
              <Input
                id="classId"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                placeholder="Enter class ID"
                disabled={isConnected}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID</Label>
              <Input
                id="studentId"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Enter student ID"
                disabled={isConnected}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacherId">Teacher ID</Label>
              <Input
                id="teacherId"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                placeholder="Enter teacher ID"
                disabled={isConnected}
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Badge variant={isConnected ? 'default' : 'secondary'}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
              {isConnected && (
                <Badge variant="outline" className="text-green-600">
                  <Activity className="h-3 w-3 mr-1" />
                  Live Updates
                </Badge>
              )}
            </div>
            
            <div className="flex space-x-2">
              {!isConnected ? (
                <Button onClick={handleConnect} className="flex items-center space-x-2">
                  <Play className="h-4 w-4" />
                  <span>Connect</span>
                </Button>
              ) : (
                <Button 
                  onClick={handleDisconnect} 
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  <Pause className="h-4 w-4" />
                  <span>Disconnect</span>
                </Button>
              )}
              
              <Button 
                onClick={handleReset} 
                variant="ghost"
                className="flex items-center space-x-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Demo Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="student" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Student View</span>
          </TabsTrigger>
          <TabsTrigger value="teacher" className="flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>Teacher View</span>
          </TabsTrigger>
          <TabsTrigger value="admin" className="flex items-center space-x-2">
            <Activity className="h-4 w-4" />
            <span>Admin View</span>
          </TabsTrigger>
        </TabsList>

        {/* Student View */}
        <TabsContent value="student" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Student Enrollment Dashboard</CardTitle>
              <p className="text-sm text-gray-600">
                Real-time enrollment status, waitlist position, and class availability
              </p>
            </CardHeader>
            <CardContent>
              {isConnected ? (
                <RealtimeEnrollmentDisplay
                  classId={classId}
                  studentId={studentId}
                  showEvents={true}
                  showStats={true}
                  autoConnect={true}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Connect to see real-time enrollment updates</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teacher View */}
        <TabsContent value="teacher" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Teacher Roster Management</CardTitle>
              <p className="text-sm text-gray-600">
                Monitor class enrollment, manage waitlists, and approve enrollment requests
              </p>
            </CardHeader>
            <CardContent>
              {isConnected ? (
                <RealtimeEnrollmentDisplay
                  classId={classId}
                  teacherId={teacherId}
                  showEvents={true}
                  showStats={true}
                  autoConnect={true}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Connect to see real-time roster updates</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin View */}
        <TabsContent value="admin" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Administrative Overview</CardTitle>
              <p className="text-sm text-gray-600">
                System-wide enrollment analytics and performance monitoring
              </p>
            </CardHeader>
            <CardContent>
              {isConnected ? (
                <div className="space-y-6">
                  <RealtimeEnrollmentDisplay
                    classId={classId}
                    showEvents={true}
                    showStats={true}
                    autoConnect={true}
                  />
                  
                  {/* Additional admin-specific features */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">System Performance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Connected Clients</span>
                            <Badge variant="outline">--</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Average Response Time</span>
                            <Badge variant="outline">-- ms</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Events/Second</span>
                            <Badge variant="outline">--</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Enrollment Analytics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Total Enrollments Today</span>
                            <Badge variant="outline">--</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Waitlist Conversions</span>
                            <Badge variant="outline">--%</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Peak Concurrent Users</span>
                            <Badge variant="outline">--</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Connect to see system analytics</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold">Live Enrollment Counts</h3>
                <p className="text-sm text-gray-600">Real-time capacity tracking</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Clock className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Waitlist Management</h3>
                <p className="text-sm text-gray-600">Automatic position updates</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Activity className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">Concurrent Safety</h3>
                <p className="text-sm text-gray-600">Race condition prevention</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm space-y-2">
            <p><strong>1. Configure:</strong> Set your Class ID, Student ID, and Teacher ID above</p>
            <p><strong>2. Connect:</strong> Click "Connect" to establish real-time connection</p>
            <p><strong>3. Interact:</strong> Use the enrollment buttons to trigger real-time updates</p>
            <p><strong>4. Observe:</strong> Watch live enrollment counts, waitlist positions, and event feeds</p>
            <p><strong>5. Switch Views:</strong> Try different tabs to see various user perspectives</p>
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This demo requires the real-time server to be running. 
              Use <code className="bg-blue-100 px-1 rounded">npm run dev:realtime</code> to start the server.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RealtimeEnrollmentExample;