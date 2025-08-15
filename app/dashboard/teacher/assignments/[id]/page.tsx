"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Users, Calendar, Edit } from 'lucide-react';

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

interface SubmissionStats {
  total_students: number;
  submitted_count: number;
  graded_count: number;
}

export default function TeacherAssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading } = useAuth();
  const resolvedParams = use(params);
  const router = useRouter();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissionStats, setSubmissionStats] = useState<SubmissionStats | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && resolvedParams.id) {
      loadAssignmentDetails();
    }
  }, [user, resolvedParams.id]);

  const loadAssignmentDetails = async () => {
    try {
      const supabase = createClient();
      
      // Load assignment details
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select(`
          id, title, description, due_date, points, created_at, class_id, teacher_id
        `)
        .eq('id', resolvedParams.id)
        .eq('teacher_id', user?.id)
        .single();

      if (assignmentError) {
        console.error('Assignment query error:', assignmentError);
        console.error('Assignment query error details:', JSON.stringify(assignmentError, null, 2));
        if (assignmentError.code === 'PGRST116') {
          setError('Assignment not found');
        } else if (assignmentError.message?.includes('relation "assignments" does not exist')) {
          setError('Assignments table not found. Please run the database setup script.');
        } else {
          setError('Assignment not found or access denied');
        }
        return;
      }

      // Get class name separately
      const { data: classData } = await supabase
        .from('classes')
        .select('id, name')
        .eq('id', assignmentData.class_id)
        .single();

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

      // Load submission statistics
      await loadSubmissionStats(assignmentData.class_id);

    } catch (error) {
      console.error('Error loading assignment:', error);
      setError('Failed to load assignment details');
    } finally {
      setLoadingData(false);
    }
  };

  const loadSubmissionStats = async (classId: string) => {
    try {
      const supabase = createClient();
      
      // Get total students in class - try both table names
      let enrollments = null;
      let enrollmentError = null;
      
      // First try 'enrollments' table
      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('class_id', classId);
      
      if (enrollmentsError && enrollmentsError.message?.includes('relation "enrollments" does not exist')) {
        // Try 'class_enrollments' table instead
        const { data: classEnrollmentsData, error: classEnrollmentsError } = await supabase
          .from('class_enrollments')
          .select('user_id')
          .eq('class_id', classId)
          .eq('status', 'active');
        
        enrollments = classEnrollmentsData;
        enrollmentError = classEnrollmentsError;
      } else {
        enrollments = enrollmentsData;
        enrollmentError = enrollmentsError;
      }

      if (enrollmentError) {
        console.error('Error loading enrollments:', enrollmentError);
        return;
      }

      const totalStudents = enrollments?.length || 0;

      // Get submission counts
      const { data: submissions, error: submissionError } = await supabase
        .from('submissions')
        .select('status')
        .eq('assignment_id', resolvedParams.id);

      if (submissionError) {
        console.error('Error loading submissions:', submissionError);
        setSubmissionStats({
          total_students: totalStudents,
          submitted_count: 0,
          graded_count: 0
        });
        return;
      }

      const submittedCount = submissions?.length || 0;
      const gradedCount = submissions?.filter(s => s.status === 'graded').length || 0;

      setSubmissionStats({
        total_students: totalStudents,
        submitted_count: submittedCount,
        graded_count: gradedCount
      });

    } catch (error) {
      console.error('Error loading submission stats:', error);
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

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/dashboard/teacher/assignments')}
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
            <Button variant="outline" onClick={() => router.push(`/dashboard/teacher/assignments/${assignment.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Assignment
            </Button>
            <Button onClick={() => router.push(`/dashboard/teacher/assignments/${assignment.id}/grade-submissions`)}>
              <Users className="h-4 w-4 mr-2" />
              Grade Submissions
            </Button>
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
                  <h3 className="font-medium mb-1">Created</h3>
                  <p className="text-gray-600">
                    {new Date(assignment.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submission Statistics */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Submission Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {submissionStats ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {submissionStats.submitted_count}/{submissionStats.total_students}
                    </div>
                    <p className="text-sm text-gray-600">Students Submitted</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Students:</span>
                      <span className="font-medium">{submissionStats.total_students}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Submitted:</span>
                      <span className="font-medium text-green-600">{submissionStats.submitted_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Graded:</span>
                      <span className="font-medium text-blue-600">{submissionStats.graded_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pending:</span>
                      <span className="font-medium text-orange-600">
                        {submissionStats.total_students - submissionStats.submitted_count}
                      </span>
                    </div>
                  </div>
                  
                  {submissionStats.submitted_count > 0 && (
                    <div className="pt-4 border-t">
                      <Button 
                        className="w-full" 
                        onClick={() => router.push(`/dashboard/teacher/assignments/${assignment.id}/submissions`)}
                      >
                        View All Submissions
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  Loading submission stats...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}