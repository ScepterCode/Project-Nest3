"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, FileText, Clock, CheckCircle, Star } from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  points_possible: number;
  class_name: string;
  class_id: string;
  created_at: string;
}

interface Submission {
  id: string;
  content?: string;
  file_url?: string;
  link_url?: string;
  submitted_at: string;
  status: 'submitted' | 'graded';
  grade?: number;
  feedback?: string;
}

export default function StudentAssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (user && resolvedParams?.id) {
      loadAssignmentDetails();
    }
  }, [user, resolvedParams]);

  const loadAssignmentDetails = async () => {
    try {
      const supabase = createClient();
      
      // Load assignment details
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select(`
          id, title, description, due_date, points, created_at, class_id
        `)
        .eq('id', resolvedParams?.id)
        .single();

      if (assignmentError) {
        console.error('Student assignment query error:', assignmentError);
        console.error('Student assignment query error details:', JSON.stringify(assignmentError, null, 2));
        setError('Assignment not found or access denied');
        return;
      }

      // Get class name separately
      const { data: classData } = await supabase
        .from('classes')
        .select('id, name')
        .eq('id', assignmentData.class_id)
        .single();

      // Check if student is enrolled in this class
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('id')
        .eq('class_id', assignmentData.class_id)
        .eq('student_id', user?.id)
        .single();

      if (enrollmentError) {
        setError('You are not enrolled in this class');
        return;
      }

      setAssignment({
        id: assignmentData.id,
        title: assignmentData.title,
        description: assignmentData.description,
        due_date: assignmentData.due_date,
        points_possible: assignmentData.points || 100,
        class_name: classData?.name || 'Unknown Class',
        class_id: assignmentData.class_id,
        created_at: assignmentData.created_at
      });

      // Load student's submission if it exists
      const { data: submissionData, error: submissionError } = await supabase
        .from('submissions')
        .select('id, content, file_url, link_url, submitted_at, status, grade, feedback')
        .eq('assignment_id', params.id)
        .eq('student_id', user?.id)
        .single();

      if (submissionError && submissionError.code !== 'PGRST116') {
        console.error('Error loading submission:', submissionError);
      } else if (submissionData) {
        setSubmission(submissionData);
      }

    } catch (error) {
      console.error('Error loading assignment:', error);
      setError('Failed to load assignment details');
    } finally {
      setLoadingData(false);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-red-600">{error}</div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Assignment not found</div>
      </div>
    );
  }

  const dueDate = new Date(assignment.due_date);
  const isOverdue = dueDate < new Date();
  const status = submission ? (submission.status === 'graded' ? 'graded' : 'submitted') : 'pending';

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/dashboard/student/assignments')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignments
        </Button>
        
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{assignment.title}</h1>
            <p className="text-gray-600 mb-2">{assignment.class_name}</p>
          </div>
          
          <div className="flex gap-2">
            {status === 'pending' && (
              <Button onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}/submit`)}>
                Submit Assignment
              </Button>
            )}
            {status === 'submitted' && (
              <Button 
                variant="secondary"
                onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}/submit`)}
              >
                Update Submission
              </Button>
            )}
            {status === 'graded' && (
              <Button 
                variant="outline"
                onClick={() => router.push(`/dashboard/student/grades`)}
              >
                View Grade
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assignment Details */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Assignment Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Description</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {assignment.description || 'No description provided'}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium mb-1">Due Date</h3>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span className={isOverdue ? 'text-red-600' : ''}>
                        {dueDate.toLocaleDateString()} at {dueDate.toLocaleTimeString()}
                      </span>
                      {isOverdue && <Badge variant="destructive">Overdue</Badge>}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium mb-1">Points Possible</h3>
                    <p className="text-lg font-semibold">{assignment.points_possible}</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-1">Assigned</h3>
                  <p className="text-gray-600">
                    {new Date(assignment.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submission Status */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                {status === 'pending' && <Clock className="h-5 w-5 mr-2 text-yellow-500" />}
                {status === 'submitted' && <CheckCircle className="h-5 w-5 mr-2 text-green-500" />}
                {status === 'graded' && <Star className="h-5 w-5 mr-2 text-blue-500" />}
                Submission Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center">
                  {status === 'pending' && (
                    <Badge variant="secondary" className="text-lg px-4 py-2">
                      Not Submitted
                    </Badge>
                  )}
                  {status === 'submitted' && (
                    <Badge variant="default" className="text-lg px-4 py-2">
                      Submitted
                    </Badge>
                  )}
                  {status === 'graded' && (
                    <Badge variant="default" className="text-lg px-4 py-2">
                      Graded
                    </Badge>
                  )}
                </div>
                
                {submission && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Submitted:</span>
                      <span className="font-medium">
                        {new Date(submission.submitted_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {submission.grade !== undefined && (
                      <div className="flex justify-between">
                        <span>Grade:</span>
                        <span className="font-medium text-blue-600">
                          {submission.grade}/{assignment.points_possible}
                        </span>
                      </div>
                    )}
                    
                    {submission.feedback && (
                      <div>
                        <h4 className="font-medium mb-1">Feedback:</h4>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          {submission.feedback}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="pt-4 border-t">
                  {status === 'pending' && (
                    <Button 
                      className="w-full" 
                      onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}/submit`)}
                    >
                      Submit Assignment
                    </Button>
                  )}
                  {status === 'submitted' && (
                    <Button 
                      className="w-full" 
                      variant="secondary"
                      onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}/submit`)}
                    >
                      Update Submission
                    </Button>
                  )}
                  {status === 'graded' && (
                    <Button 
                      className="w-full" 
                      variant="outline"
                      onClick={() => router.push(`/dashboard/student/grades`)}
                    >
                      View All Grades
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}