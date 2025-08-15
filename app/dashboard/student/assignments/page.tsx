"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  status: 'pending' | 'submitted' | 'graded';
  class_name: string;
  class_id: string;
  points_possible: number;
  points_earned?: number;
  submission_date?: string;
}

export default function StudentAssignmentsPage() {
  const { user, loading, getUserDisplayName } = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
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
      
      console.log('Loading assignments for student:', user.id);
      
      // Check if required tables exist
      const { data: testEnrollments, error: enrollmentTestError } = await supabase
        .from('enrollments')
        .select('count')
        .limit(1);
      
      if (enrollmentTestError) {
        console.error('Enrollments table not accessible:', enrollmentTestError);
        console.error('Enrollments error details:', JSON.stringify(enrollmentTestError, null, 2));
        setError('Enrollments system not available. You may not be enrolled in any classes yet.');
        setAssignments([]);
        return;
      }
      
      const { data: testAssignments, error: assignmentTestError } = await supabase
        .from('assignments')
        .select('count')
        .limit(1);
      
      if (assignmentTestError) {
        console.error('Assignments table not accessible:', assignmentTestError);
        console.error('Assignments error details:', JSON.stringify(assignmentTestError, null, 2));
        setError('Assignments system not available. No assignments have been created yet.');
        setAssignments([]);
        return;
      }
      
      // Get the classes the student is enrolled in
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', user.id);

      if (enrollmentError) {
        console.error('Error loading enrollments:', enrollmentError);
        setError(`Failed to load enrollments: ${enrollmentError.message}`);
        return;
      }

      const classIds = enrollments?.map(e => e.class_id) || [];
      console.log('Student enrolled in classes:', classIds.length);
      
      if (classIds.length === 0) {
        setAssignments([]);
        return;
      }

      // Get assignments from enrolled classes (include points column)
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('assignments')
        .select('id, title, description, due_date, class_id, points')
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
      
      // Get submissions (if submissions table exists)
      let submissionsData: any[] = [];
      const { data: testSubmissions, error: submissionTestError } = await supabase
        .from('submissions')
        .select('count')
        .limit(1);
      
      if (!submissionTestError) {
        const assignmentIds = assignmentsData.map(a => a.id);
        const { data: submissions } = await supabase
          .from('submissions')
          .select('assignment_id, submitted_at, grade, status')
          .in('assignment_id', assignmentIds)
          .eq('student_id', user.id);
        
        submissionsData = submissions || [];
      }
      
      // Transform the data to include submission status
      const transformedAssignments: Assignment[] = assignmentsData.map(assignment => {
        const classData = classesData?.find(c => c.id === assignment.class_id);
        const submission = submissionsData.find(s => s.assignment_id === assignment.id);
        
        let status: 'pending' | 'submitted' | 'graded' = 'pending';
        
        if (submission) {
          if (submission.grade !== null) {
            status = 'graded';
          } else if (submission.submitted_at) {
            status = 'submitted';
          }
        }

        return {
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          due_date: assignment.due_date,
          status,
          class_name: classData?.name || 'Unknown Class',
          class_id: assignment.class_id,
          points_possible: assignment.points || 0,
          points_earned: submission?.grade || undefined,
          submission_date: submission?.submitted_at || undefined
        };
      });

      setAssignments(transformedAssignments);
    } catch (error) {
      console.error('Error loading assignments:', error);
      setError('Failed to load assignments');
    } finally {
      setLoadingAssignments(false);
    }
  };

  const getStatusBadge = (status: string, dueDate: string) => {
    const isOverdue = new Date(dueDate) < new Date() && status === 'pending';
    
    if (isOverdue) {
      return <Badge variant="destructive" className="flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Overdue
      </Badge>;
    }
    
    switch (status) {
      case 'graded':
        return <Badge variant="default" className="flex items-center gap-1 bg-green-600">
          <CheckCircle className="h-3 w-3" />
          Graded
        </Badge>;
      case 'submitted':
        return <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Submitted
        </Badge>;
      default:
        return <Badge variant="outline" className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          Pending
        </Badge>;
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
              <p className="text-gray-600">Welcome back, {getUserDisplayName()}!</p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/student')}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {assignments.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Assignments Yet</h3>
              <p className="text-gray-600 mb-4">
                You don't have any assignments at the moment. Check back later or join a class to see assignments.
              </p>
              <Button onClick={() => router.push('/dashboard/student/classes/join')}>
                Join a Class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {assignments.length}
                    </div>
                    <div className="text-sm text-gray-500">Total Assignments</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {assignments.filter(a => a.status === 'pending').length}
                    </div>
                    <div className="text-sm text-gray-500">Pending</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {assignments.filter(a => a.status === 'submitted').length}
                    </div>
                    <div className="text-sm text-gray-500">Submitted</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {assignments.filter(a => a.status === 'graded').length}
                    </div>
                    <div className="text-sm text-gray-500">Graded</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Assignments List */}
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
                      {getStatusBadge(assignment.status, assignment.due_date)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 mb-4">{assignment.description}</p>
                    
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Due: {formatDate(assignment.due_date)}
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        Points: {assignment.points_possible}
                      </div>
                      {assignment.points_earned !== undefined && (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          Earned: {assignment.points_earned}/{assignment.points_possible}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}`)}
                        size="sm"
                        variant="outline"
                      >
                        View Assignment
                      </Button>
                      {assignment.status === 'pending' && (
                        <Button
                          onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}/submit`)}
                          size="sm"
                        >
                          Submit Assignment
                        </Button>
                      )}
                      {assignment.status === 'submitted' && (
                        <Button
                          onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}/submit`)}
                          size="sm"
                          variant="secondary"
                        >
                          Update Submission
                        </Button>
                      )}
                      {assignment.status === 'graded' && (
                        <Button
                          variant="outline"
                          onClick={() => router.push(`/dashboard/student/grades/${assignment.id}`)}
                          size="sm"
                        >
                          View Grade
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}