"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, FileText, AlertCircle, BookOpen, Plus } from 'lucide-react';

interface SimpleAssignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  class_name: string;
  class_id: string;
  points_possible: number;
}

export default function SimpleStudentAssignmentsPage() {
  const { user, loading, getUserDisplayName } = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = useState<SimpleAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.id && !loading) {
      loadAssignments();
    }
  }, [user, loading]);

  const loadAssignments = async () => {
    try {
      const supabase = createClient();
      
      if (!user?.id) {
        console.error('loadAssignments called without user ID');
        setError('User not found');
        return;
      }
      
      console.log('Loading simple assignments for student:', user.id);
      
      // Check if enrollments table exists
      const { data: testEnrollments, error: enrollmentTestError } = await supabase
        .from('enrollments')
        .select('count')
        .limit(1);
      
      if (enrollmentTestError) {
        console.error('Enrollments table not accessible:', enrollmentTestError);
        console.error('Enrollments error details:', JSON.stringify(enrollmentTestError, null, 2));
        setError('You are not enrolled in any classes yet. Join a class to see assignments.');
        setAssignments([]);
        return;
      }
      
      // Get student's enrolled classes
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', user.id);

      if (enrollmentError) {
        console.error('Error loading enrollments:', enrollmentError);
        setError('Failed to load your class enrollments');
        return;
      }

      const classIds = enrollments?.map(e => e.class_id) || [];
      console.log('Student enrolled in classes:', classIds.length);
      
      if (classIds.length === 0) {
        setError('You are not enrolled in any classes yet. Join a class to see assignments.');
        setAssignments([]);
        return;
      }
      
      // Check if assignments table exists
      const { data: testAssignments, error: assignmentTestError } = await supabase
        .from('assignments')
        .select('count')
        .limit(1);
      
      if (assignmentTestError) {
        console.error('Assignments table not accessible:', assignmentTestError);
        setError('No assignments system available yet. Your teachers haven\'t created any assignments.');
        setAssignments([]);
        return;
      }

      // Get assignments from enrolled classes (without points_possible to avoid column errors)
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('assignments')
        .select('id, title, description, due_date, class_id')
        .in('class_id', classIds)
        .order('due_date', { ascending: true });

      if (assignmentsError) {
        console.error('Error loading assignments:', assignmentsError);
        setError(`Failed to load assignments: ${assignmentsError.message}`);
        return;
      }
      
      console.log('Found assignments:', assignmentsData?.length || 0);
      
      if (!assignmentsData || assignmentsData.length === 0) {
        setAssignments([]);
        return;
      }
      
      // Get class names
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name')
        .in('id', classIds);
      
      // Transform the data
      const transformedAssignments: SimpleAssignment[] = assignmentsData.map(assignment => {
        const classData = classesData?.find(c => c.id === assignment.class_id);
        
        return {
          id: assignment.id,
          title: assignment.title,
          description: assignment.description || 'No description provided',
          due_date: assignment.due_date,
          class_name: classData?.name || 'Unknown Class',
          class_id: assignment.class_id,
          points_possible: 0 // Default since column may not exist
        };
      });

      setAssignments(transformedAssignments);
      console.log('Loaded assignments successfully:', transformedAssignments.length);
      
    } catch (error) {
      console.error('Error loading assignments:', error);
      setError('An unexpected error occurred while loading assignments');
    } finally {
      setLoadingAssignments(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  if (loading || loadingAssignments) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Assignments</h1>
              <p className="text-gray-600">Your assignments from all classes, {getUserDisplayName()}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => router.push('/dashboard/student/classes')}
                variant="outline"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                My Classes
              </Button>
              <Button
                onClick={() => router.push('/dashboard/student')}
                variant="outline"
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <div className="mt-2 flex gap-2">
              <Button 
                onClick={() => window.location.reload()} 
                size="sm"
              >
                Try Again
              </Button>
              <Button 
                onClick={() => router.push('/dashboard/student/classes/join')} 
                size="sm"
                variant="outline"
              >
                Join a Class
              </Button>
            </div>
          </div>
        )}

        {assignments.length === 0 && !error ? (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Assignments Yet</h3>
              <p className="text-gray-600 mb-4">
                You don't have any assignments yet. Your teachers will post assignments here.
              </p>
              <Button onClick={() => router.push('/dashboard/student/classes')}>
                <BookOpen className="h-4 w-4 mr-2" />
                View My Classes
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{assignment.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {assignment.class_name}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOverdue(assignment.due_date) && (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Overdue
                        </Badge>
                      )}
                      {assignment.points_possible > 0 && (
                        <Badge variant="outline">
                          {assignment.points_possible} pts
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-600 text-sm">{assignment.description}</p>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Due: {formatDate(assignment.due_date)}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}/submit`)}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Submit Assignment
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/dashboard/student/classes/${assignment.class_id}`)}
                    >
                      Go to Class
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}